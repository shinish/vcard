"""End-to-end checks over the real app against a throwaway database.

Every admin spans every company, so there is no per-company isolation to test.
What matters instead: the admin API is closed without a session, the public
share page is open without one, and a password change cannot happen without
proving you know the current password.
"""

import hashlib
import io
import os
import pathlib
import tempfile
import time

import pytest
from PIL import Image

TMP = tempfile.TemporaryDirectory()
os.environ["VCARD_DB"] = f"{TMP.name}/test.db"
os.environ["VCARD_UPLOADS"] = f"{TMP.name}/uploads"

from fastapi.testclient import TestClient  # noqa: E402

from app.auth import hash_password  # noqa: E402
from app.db import connect, init  # noqa: E402
from app.main import app  # noqa: E402


def jpeg_bytes(size=(1600, 1200)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", size, (200, 120, 40)).save(buf, "JPEG")
    return buf.getvalue()


def unfold(doc: str) -> str:
    return doc.replace("\r\n ", "")


def read_qr(data: bytes) -> str:
    """Decode a QR PNG.

    Two detectors, in order: OpenCV's classic QRCodeDetector cannot read about
    3% of these codes *even with no logo on them*, which made any test that
    decoded one fail on roughly one run in ten — the 22-char id is random, so
    each run encodes a different payload. The Aruco-based detector read 150 of
    150 in both cases. The weakness was the reader, never the code.
    """
    import cv2
    import numpy as np

    image = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    for detector in (cv2.QRCodeDetectorAruco(), cv2.QRCodeDetector()):
        text, *_ = detector.detectAndDecode(image)
        if text:
            return text
    return ""


@pytest.fixture(scope="module")
def seeded():
    """One admin and two companies."""
    init()
    from datetime import UTC, datetime

    now = datetime.now(UTC).isoformat()
    with connect() as conn:
        conn.execute(
            "INSERT INTO users (email, password_hash, name, created_at) "
            "VALUES ('root', ?, 'Root', ?)",
            (hash_password("super-secret-pw"), now),
        )
        ids = {}
        for name in ("Acme Ltd", "Globex"):
            cur = conn.execute(
                "INSERT INTO companies (name, slug, created_at) VALUES (?, ?, ?)",
                (name, name.lower().replace(" ", "-"), now),
            )
            ids[name] = cur.lastrowid
    return ids


def sign_in(email: str, password: str) -> TestClient:
    client = TestClient(app)
    res = client.post("/api/admin/login", data={"email": email, "password": password})
    assert res.status_code == 200, res.text
    return client


def test_login_rejects_bad_credentials(seeded):
    client = TestClient(app)
    assert client.post(
        "/api/admin/login", data={"email": "root", "password": "wrong"}
    ).status_code == 401
    assert client.post(
        "/api/admin/login", data={"email": "nobody", "password": "whatever"}
    ).status_code == 401


def test_admin_endpoints_require_a_session(seeded):
    client = TestClient(app)
    for method, path in [
        ("get", "/api/admin/me"),
        ("get", "/api/admin/contacts"),
        ("get", "/api/admin/companies"),
        ("get", "/api/admin/users"),
        ("post", "/api/admin/contacts"),
        ("post", "/api/admin/companies"),
        ("post", "/api/admin/users"),
        ("patch", "/api/admin/me"),
    ]:
        assert getattr(client, method)(path).status_code == 401, path


def test_a_plain_username_works_as_a_login(seeded):
    root = sign_in("root", "super-secret-pw")
    made = root.post("/api/admin/users", data={"email": "admin", "password": "fixture-password-1"})
    assert made.status_code == 201, made.text

    admin = sign_in("admin", "fixture-password-1")
    assert admin.get("/api/admin/me").json()["email"] == "admin"
    # every admin can do everything: there is no lesser role
    assert admin.post("/api/admin/companies", data={"name": "Umbrella"}).status_code == 201
    assert admin.get("/api/admin/users").status_code == 200


def test_every_admin_sees_every_company(seeded):
    root = sign_in("root", "super-secret-pw")
    root.post("/api/admin/users", data={"email": "colleague", "password": "colleague-pw-1"})
    colleague = sign_in("colleague", "colleague-pw-1")

    names = {c["name"] for c in colleague.get("/api/admin/companies").json()}
    assert {"Acme Ltd", "Globex"} <= names


def test_companies_need_a_unique_name(seeded):
    root = sign_in("root", "super-secret-pw")
    assert root.post("/api/admin/companies", data={"name": "Acme Ltd"}).status_code == 409
    assert root.post("/api/admin/companies", data={"name": ""}).status_code == 422


def test_contact_lifecycle_and_public_page(seeded):
    acme = seeded["Acme Ltd"]
    admin = sign_in("root", "super-secret-pw")

    fields = (
        '[{"kind":"phone","label":"mobile","value":"+1 555 0100"},'
        '{"kind":"phone","label":"Boat phone","value":"+1 555 0199"},'
        '{"kind":"email","label":"work","value":"dana@acme.test"},'
        '{"kind":"address","label":"work","value":{"street":"1 Main St, Unit 2",'
        '"city":"Springfield","region":"MA","postal":"01101","country":"USA"}},'
        '{"kind":"date","label":"birthday","value":"1988-02-29"},'
        '{"kind":"social","label":"LinkedIn","value":"https://lnkd.in/dana"}]'
    )
    created = admin.post(
        "/api/admin/contacts",
        data={"first_name": "Dana", "last_name": "Hart", "job_title": "Partner",
              "org": "Acme Ltd", "company_id": acme, "fields": fields},
        files={"photo": ("p.jpg", jpeg_bytes(), "image/jpeg")},
    )
    assert created.status_code == 201, created.text
    public_id = created.json()["public_id"]
    contact_id = created.json()["id"]

    # the share id must be long, case-sensitive base62 with no hyphens
    assert len(public_id) == 22
    assert "-" not in public_id
    assert public_id.isalnum()

    # the public page needs no session at all
    anon = TestClient(app)
    card = anon.get(f"/api/public/{public_id}")
    assert card.status_code == 200, card.text
    body = card.json()
    assert body["first_name"] == "Dana"
    assert body["company"]["name"] == "Acme Ltd"
    assert len(body["fields"]) == 6
    assert body["fields"][3]["value"]["city"] == "Springfield"
    for leaked in ("company_id", "id", "photo_path", "photo_small_path"):
        assert leaked not in body, f"public payload leaks {leaked}"

    assert anon.get(f"/api/public/{public_id}/photo.jpg").status_code == 200
    assert anon.get(f"/api/public/{public_id}/qr.svg").status_code == 200

    vcard = anon.get(f"/api/public/{public_id}.vcf")
    assert vcard.status_code == 200
    assert vcard.headers["content-disposition"] == 'attachment; filename="Dana-Hart.vcf"'
    doc = unfold(vcard.text)
    assert "FN:Dana Hart" in doc
    assert "TEL;TYPE=CELL,VOICE:+1 555 0100" in doc
    assert "X-ABLabel:Boat phone" in doc
    assert "BDAY:1988-02-29" in doc
    assert "PHOTO;ENCODING=b" in doc
    # the embedded copy must stay small or phones refuse the import
    assert len(vcard.content) < 200 * 1024, f"vcf is {len(vcard.content) // 1024} KB"

    # a different admin can edit it too, and the share link does not change
    admin.post("/api/admin/users", data={"email": "editor", "password": "editor-pw-11"})
    editor = sign_in("editor", "editor-pw-11")
    edited = editor.patch(
        f"/api/admin/contacts/{contact_id}",
        data={"first_name": "Dana", "last_name": "Hart-Rowe", "fields": fields},
    )
    assert edited.status_code == 200, edited.text
    assert edited.json()["public_id"] == public_id
    assert "FN:Dana Hart-Rowe" in unfold(anon.get(f"/api/public/{public_id}.vcf").text)

    assert admin.delete(f"/api/admin/contacts/{contact_id}").status_code == 204
    assert anon.get(f"/api/public/{public_id}").status_code == 404
    assert admin.get(f"/api/admin/contacts/{contact_id}").status_code == 404


def test_a_contact_needs_a_real_company(seeded):
    admin = sign_in("root", "super-secret-pw")
    assert admin.post("/api/admin/contacts", data={"first_name": "Nobody"}).status_code == 422
    assert admin.post(
        "/api/admin/contacts", data={"first_name": "Nobody", "company_id": 99999}
    ).status_code == 404


def test_rejects_bad_input(seeded):
    acme = seeded["Acme Ltd"]
    admin = sign_in("root", "super-secret-pw")
    assert admin.post(
        "/api/admin/contacts", data={"last_name": "NoFirst", "company_id": acme}
    ).status_code == 422
    assert admin.post(
        "/api/admin/contacts",
        data={"first_name": "Bad", "company_id": acme,
              "fields": '[{"kind":"telepathy","value":"x"}]'},
    ).status_code == 422
    assert admin.post(
        "/api/admin/contacts",
        data={"first_name": "Bad", "company_id": acme, "fields": "not json"},
    ).status_code == 422
    assert admin.post(
        "/api/admin/contacts",
        data={"first_name": "Bad", "company_id": acme},
        files={"photo": ("x.jpg", b"not an image", "image/jpeg")},
    ).status_code == 422
    assert admin.post(
        "/api/admin/users", data={"email": "ab", "password": "long-enough-1"}
    ).status_code == 422
    assert admin.post(
        "/api/admin/users", data={"email": "fine-name", "password": "short"}
    ).status_code == 422


def test_admins_can_reset_each_others_passwords(seeded):
    root = sign_in("root", "super-secret-pw")
    made = root.post(
        "/api/admin/users", data={"email": "second-admin", "password": "first-password-1"}
    )
    target_id = made.json()["id"]

    victim = sign_in("second-admin", "first-password-1")
    assert victim.get("/api/admin/me").status_code == 200

    reset = root.post(
        f"/api/admin/users/{target_id}/password", data={"new_password": "second-password-2"}
    )
    assert reset.status_code == 200, reset.text

    # the old session and old password both stop working, the new one works
    assert victim.get("/api/admin/me").status_code == 401
    assert TestClient(app).post(
        "/api/admin/login", data={"email": "second-admin", "password": "first-password-1"}
    ).status_code == 401
    assert sign_in("second-admin", "second-password-2").get("/api/admin/me").status_code == 200

    assert root.post(
        f"/api/admin/users/{target_id}/password", data={"new_password": "short"}
    ).status_code == 422
    assert root.post(
        "/api/admin/users/99999/password", data={"new_password": "long-enough-11"}
    ).status_code == 404


def test_changing_your_own_password_from_the_profile(seeded):
    root = sign_in("root", "super-secret-pw")
    assert root.post(
        "/api/admin/users", data={"email": "profile-user", "password": "original-pw-1"}
    ).status_code == 201

    me = sign_in("profile-user", "original-pw-1")
    elsewhere = sign_in("profile-user", "original-pw-1")  # a second device

    # the current password is required, and the new one has to be long enough
    assert me.patch(
        "/api/admin/me", data={"current_password": "wrong", "new_password": "replacement-pw-2"}
    ).status_code == 403
    assert me.patch("/api/admin/me", data={"new_password": "replacement-pw-2"}).status_code == 403
    assert me.patch(
        "/api/admin/me", data={"current_password": "original-pw-1", "new_password": "short"}
    ).status_code == 422

    ok = me.patch(
        "/api/admin/me",
        data={"name": "Profile User", "current_password": "original-pw-1",
              "new_password": "replacement-pw-2"},
    )
    assert ok.status_code == 200, ok.text
    assert me.get("/api/admin/me").json()["name"] == "Profile User"

    # changing it signs out the other device but not this one
    assert elsewhere.get("/api/admin/me").status_code == 401
    assert me.get("/api/admin/me").status_code == 200
    assert sign_in("profile-user", "replacement-pw-2").get("/api/admin/me").status_code == 200


def test_profile_rejects_a_taken_username(seeded):
    root = sign_in("root", "super-secret-pw")
    root.post("/api/admin/users", data={"email": "taken-name", "password": "some-password-1"})
    assert root.post(
        "/api/admin/users", data={"email": "renamer", "password": "some-password-1"}
    ).status_code == 201
    renamer = sign_in("renamer", "some-password-1")
    assert renamer.patch("/api/admin/me", data={"email": "taken-name"}).status_code == 409
    assert renamer.patch("/api/admin/me", data={"email": "ab"}).status_code == 422


def test_one_company_can_have_several_branches(seeded):
    admin = sign_in("root", "super-secret-pw")

    muscat = admin.post(
        "/api/admin/companies",
        data={"name": "Branchy Co", "branch": "Muscat", "phone": "+968 2400 0001",
              "email": "muscat@branchy.test", "city": "Muscat", "country": "Oman"},
    )
    salalah = admin.post(
        "/api/admin/companies",
        data={"name": "Branchy Co", "branch": "Salalah", "phone": "+968 2300 0002",
              "email": "salalah@branchy.test", "city": "Salalah", "country": "Oman"},
    )
    assert muscat.status_code == 201, muscat.text
    assert salalah.status_code == 201, salalah.text
    assert muscat.json()["id"] != salalah.json()["id"]
    assert muscat.json()["name"] == salalah.json()["name"] == "Branchy Co"

    # the same branch twice is still a conflict
    assert admin.post(
        "/api/admin/companies", data={"name": "Branchy Co", "branch": "Muscat"}
    ).status_code == 409

    # each branch keeps its own details
    one = admin.get(f"/api/admin/companies/{muscat.json()['id']}").json()
    two = admin.get(f"/api/admin/companies/{salalah.json()['id']}").json()
    assert one["phone"] == "+968 2400 0001" and one["city"] == "Muscat"
    assert two["phone"] == "+968 2300 0002" and two["city"] == "Salalah"
    assert one["slug"] != two["slug"]

    # a contact belongs to one branch, and the public card names it
    made = admin.post(
        "/api/admin/contacts",
        data={"first_name": "Salim", "company_id": salalah.json()["id"]},
    )
    assert made.status_code == 201, made.text
    card = TestClient(app).get(f"/api/public/{made.json()['public_id']}").json()
    assert card["company"]["name"] == "Branchy Co"
    assert card["company"]["branch"] == "Salalah"
    assert card["company"]["slug"] == two["slug"]


def test_a_company_with_no_branch_still_works(seeded):
    admin = sign_in("root", "super-secret-pw")
    made = admin.post("/api/admin/companies", data={"name": "Soloist Ltd"})
    assert made.status_code == 201
    assert made.json()["branch"] == ""
    fetched = admin.get(f"/api/admin/companies/{made.json()['id']}").json()
    assert fetched["branch"] == ""


def test_deleting_a_company_needs_your_password_and_takes_its_contacts(seeded):
    admin = sign_in("root", "super-secret-pw")
    company = admin.post("/api/admin/companies", data={"name": "Doomed Ltd"}).json()["id"]

    made = admin.post(
        "/api/admin/contacts",
        data={"first_name": "Goner", "company_id": company,
              "fields": '[{"kind":"phone","label":"mobile","value":"+1 555 0000"}]'},
        files={"photo": ("p.jpg", jpeg_bytes(), "image/jpeg")},
    )
    assert made.status_code == 201
    public_id = made.json()["public_id"]
    anon = TestClient(app)
    assert anon.get(f"/api/public/{public_id}").status_code == 200

    # the wrong password changes nothing
    assert admin.request(
        "DELETE", f"/api/admin/companies/{company}", data={"password": "not-it"}
    ).status_code == 403
    assert admin.request(
        "DELETE", f"/api/admin/companies/{company}"
    ).status_code == 403
    assert anon.get(f"/api/public/{public_id}").status_code == 200, "nothing should have gone"

    # the warning promises the photos go too, so check the files, not just rows
    uploads = pathlib.Path(os.environ["VCARD_UPLOADS"])
    before = {f.name for f in uploads.glob(f"{public_id}*")}
    assert before, "expected the upload to have been written"

    gone = admin.request(
        "DELETE", f"/api/admin/companies/{company}", data={"password": "super-secret-pw"}
    )
    assert gone.status_code == 200, gone.text
    assert gone.json()["contacts_deleted"] == 1
    assert not list(uploads.glob(f"{public_id}*")), "photo files were left behind"

    # the company, its contacts and the share link are all gone
    assert admin.get(f"/api/admin/companies/{company}").status_code == 404
    assert anon.get(f"/api/public/{public_id}").status_code == 404
    assert company not in [c["id"] for c in admin.get("/api/admin/companies").json()]
    assert admin.request(
        "DELETE", f"/api/admin/companies/{company}", data={"password": "super-secret-pw"}
    ).status_code == 404


def test_deleting_one_branch_leaves_the_other_alone(seeded):
    admin = sign_in("root", "super-secret-pw")
    keep = admin.post(
        "/api/admin/companies", data={"name": "Twin Co", "branch": "North"}
    ).json()["id"]
    drop = admin.post(
        "/api/admin/companies", data={"name": "Twin Co", "branch": "South"}
    ).json()["id"]
    admin.post("/api/admin/contacts", data={"first_name": "Northerner", "company_id": keep})
    admin.post("/api/admin/contacts", data={"first_name": "Southerner", "company_id": drop})

    assert admin.request(
        "DELETE", f"/api/admin/companies/{drop}", data={"password": "super-secret-pw"}
    ).status_code == 200
    assert admin.get(f"/api/admin/companies/{keep}").status_code == 200
    remaining = admin.get(f"/api/admin/contacts?company_id={keep}").json()
    survivors = [c["first_name"] for c in remaining]
    assert survivors == ["Northerner"]


def png_bytes(size=(600, 560)) -> bytes:
    """A logo with real transparency, which is the normal case."""
    buf = io.BytesIO()
    img = Image.new("RGBA", size, (0, 0, 0, 0))
    for x in range(size[0] // 4, size[0] * 3 // 4):
        for y in range(size[1] // 4, size[1] * 3 // 4):
            img.putpixel((x, y), (60, 207, 215, 255))
    img.save(buf, "PNG")
    return buf.getvalue()


def test_company_branding_reaches_the_public_card(seeded):
    admin = sign_in("root", "super-secret-pw")
    company = admin.post(
        "/api/admin/companies",
        data={"name": "Branded Co", "theme": "gradient",
              "accents": '["#1E90FF", "#0B2E4F"]'},
        files={"logo": ("logo.png", png_bytes(), "image/png")},
    )
    assert company.status_code == 201, company.text
    cid = company.json()["id"]

    stored = admin.get(f"/api/admin/companies/{cid}").json()
    assert stored["theme"] == "gradient"
    assert stored["accents"] == ["#1e90ff", "#0b2e4f"]
    assert stored["logo_path"]

    made = admin.post("/api/admin/contacts", data={"first_name": "Brandon", "company_id": cid})
    public_id = made.json()["public_id"]

    anon = TestClient(app)
    card = anon.get(f"/api/public/{public_id}").json()
    assert card["company"]["theme"] == "gradient"
    assert card["company"]["accents"] == ["#1e90ff", "#0b2e4f"]
    assert card["company"]["logo_url"] == f"/api/public/{public_id}/logo.png"

    logo = anon.get(f"/api/public/{public_id}/logo.png")
    assert logo.status_code == 200
    assert logo.headers["content-type"] == "image/png"
    # transparency has to survive or the logo shows a box on a dark template
    assert Image.open(io.BytesIO(logo.content)).mode in ("RGBA", "LA", "P")


def test_branding_input_is_validated(seeded):
    admin = sign_in("root", "super-secret-pw")
    assert admin.post(
        "/api/admin/companies", data={"name": "Bad Theme Co", "theme": "../../etc/passwd"}
    ).status_code == 422
    assert admin.post(
        "/api/admin/companies", data={"name": "Bad Accent Co", "accents": '["red; evil"]'}
    ).status_code == 422
    assert admin.post(
        "/api/admin/companies", data={"name": "Bad JSON Co", "accents": "not json"}
    ).status_code == 422
    too_many = '["#111111","#222222","#333333","#444444","#555555","#666666","#777777"]'
    assert admin.post(
        "/api/admin/companies", data={"name": "Too Many Co", "accents": too_many}
    ).status_code == 422
    assert admin.post(
        "/api/admin/companies",
        data={"name": "Bad Logo Co"},
        files={"logo": ("x.png", b"not an image", "image/png")},
    ).status_code == 422
    # no theme at all is fine and falls back
    ok = admin.post("/api/admin/companies", data={"name": "Default Theme Co"})
    assert ok.status_code == 201
    assert admin.get(f"/api/admin/companies/{ok.json()['id']}").json()["theme"] == "plain"


def test_a_card_without_a_company_logo_says_so(seeded):
    admin = sign_in("root", "super-secret-pw")
    cid = admin.post("/api/admin/companies", data={"name": "Logoless Co"}).json()["id"]
    made = admin.post("/api/admin/contacts", data={"first_name": "Plain", "company_id": cid})
    public_id = made.json()["public_id"]
    anon = TestClient(app)
    assert anon.get(f"/api/public/{public_id}").json()["company"]["logo_url"] is None
    assert anon.get(f"/api/public/{public_id}/logo.png").status_code == 404


def test_the_admin_can_preview_a_logo_before_any_contact_exists(seeded):
    admin = sign_in("root", "super-secret-pw")
    cid = admin.post(
        "/api/admin/companies",
        data={"name": "Preview Co"},
        files={"logo": ("logo.png", png_bytes(), "image/png")},
    ).json()["id"]

    # no contacts yet, so the public logo route has nothing to hang off
    preview = admin.get(f"/api/admin/companies/{cid}/logo.png")
    assert preview.status_code == 200
    assert preview.headers["content-type"] == "image/png"
    assert TestClient(app).get(f"/api/admin/companies/{cid}/logo.png").status_code == 401

    bare = admin.post("/api/admin/companies", data={"name": "No Logo Co"}).json()["id"]
    assert admin.get(f"/api/admin/companies/{bare}/logo.png").status_code == 404


def test_removing_a_logo_deletes_the_file(seeded):
    import pathlib as _pathlib

    admin = sign_in("root", "super-secret-pw")
    cid = admin.post(
        "/api/admin/companies",
        data={"name": "Transient Logo Co"},
        files={"logo": ("logo.png", png_bytes(), "image/png")},
    ).json()["id"]
    path = _pathlib.Path(os.environ["VCARD_UPLOADS"]) / f"logo-{cid}.png"
    assert path.exists()

    admin.patch(
        f"/api/admin/companies/{cid}", data={"name": "Transient Logo Co", "remove_logo": "1"}
    )
    assert admin.get(f"/api/admin/companies/{cid}").json()["logo_path"] is None
    assert not path.exists(), "the logo file was left behind"


def test_a_company_can_carry_several_colours(seeded):
    admin = sign_in("root", "super-secret-pw")
    palette = '["#0B6670", "#3CCFD7", "#F4A01C"]'
    cid = admin.post(
        "/api/admin/companies", data={"name": "Palette Co", "theme": "rays", "accents": palette}
    ).json()["id"]

    stored = admin.get(f"/api/admin/companies/{cid}").json()
    assert stored["accents"] == ["#0b6670", "#3ccfd7", "#f4a01c"]
    # the list endpoint hands back a list too, not a raw JSON string
    listed = next(c for c in admin.get("/api/admin/companies").json() if c["id"] == cid)
    assert listed["accents"] == ["#0b6670", "#3ccfd7", "#f4a01c"]

    made = admin.post("/api/admin/contacts", data={"first_name": "Pally", "company_id": cid})
    card = TestClient(app).get(f"/api/public/{made.json()['public_id']}").json()
    assert card["company"]["accents"] == ["#0b6670", "#3ccfd7", "#f4a01c"]

    # emptying the palette is allowed and comes back as an empty list
    admin.patch(f"/api/admin/companies/{cid}", data={"name": "Palette Co", "accents": "[]"})
    assert admin.get(f"/api/admin/companies/{cid}").json()["accents"] == []


def test_a_company_with_no_palette_returns_an_empty_list(seeded):
    admin = sign_in("root", "super-secret-pw")
    cid = admin.post("/api/admin/companies", data={"name": "Colourless Co"}).json()["id"]
    assert admin.get(f"/api/admin/companies/{cid}").json()["accents"] == []
    made = admin.post("/api/admin/contacts", data={"first_name": "Grey", "company_id": cid})
    card = TestClient(app).get(f"/api/public/{made.json()['public_id']}").json()
    assert card["company"]["accents"] == []


def test_the_qr_is_downloadable_as_a_png(seeded):
    admin = sign_in("root", "super-secret-pw")
    cid = admin.post("/api/admin/companies", data={"name": "QR Co"}).json()["id"]
    made = admin.post(
        "/api/admin/contacts", data={"first_name": "Quinn", "last_name": "Ray", "company_id": cid}
    )
    public_id = made.json()["public_id"]

    anon = TestClient(app)
    png = anon.get(f"/api/public/{public_id}/qr.png")
    assert png.status_code == 200
    assert png.headers["content-type"] == "image/png"
    assert png.headers["content-disposition"] == 'attachment; filename="Quinn-Ray-qr.png"'
    assert Image.open(io.BytesIO(png.content)).format == "PNG"

    # the inline SVG is still there for the page itself
    svg = anon.get(f"/api/public/{public_id}/qr.svg")
    assert svg.status_code == 200
    assert svg.headers["content-type"] == "image/svg+xml"
    assert "attachment" not in svg.headers.get("content-disposition", "")


def test_the_logo_can_sit_in_any_of_eight_places(seeded):
    admin = sign_in("root", "super-secret-pw")
    cid = admin.post(
        "/api/admin/companies",
        data={"name": "Placed Co", "logo_position": "bottom-right"},
        files={"logo": ("logo.png", png_bytes(), "image/png")},
    ).json()["id"]
    assert admin.get(f"/api/admin/companies/{cid}").json()["logo_position"] == "bottom-right"

    made = admin.post("/api/admin/contacts", data={"first_name": "Placed", "company_id": cid})
    card = TestClient(app).get(f"/api/public/{made.json()['public_id']}").json()
    assert card["company"]["logo_position"] == "bottom-right"

    for position in (
        "top-left", "top-center", "top-right", "middle-left",
        "middle-right", "bottom-left", "bottom-center", "bottom-right",
    ):
        res = admin.patch(
            f"/api/admin/companies/{cid}", data={"name": "Placed Co", "logo_position": position}
        )
        assert res.status_code == 200, position
        assert admin.get(f"/api/admin/companies/{cid}").json()["logo_position"] == position

    # it becomes a CSS class, so anything unlisted is refused
    assert admin.patch(
        f"/api/admin/companies/{cid}", data={"name": "Placed Co", "logo_position": "centre-ish"}
    ).status_code == 422
    # and defaults when not given
    plain = admin.post("/api/admin/companies", data={"name": "Unplaced Co"}).json()["id"]
    assert admin.get(f"/api/admin/companies/{plain}").json()["logo_position"] == "top-center"


def test_the_outlook_signature_carries_the_link_and_qr(seeded):
    admin = sign_in("root", "super-secret-pw")
    cid = admin.post(
        "/api/admin/companies",
        data={"name": "Signature Co", "accents": '["#0b6670"]'},
        files={"logo": ("logo.png", png_bytes(), "image/png")},
    ).json()["id"]
    made = admin.post(
        "/api/admin/contacts",
        data={
            "first_name": "Sig", "last_name": "Nature", "job_title": "Director",
            "company_id": cid,
            "fields": '[{"kind":"phone","label":"mobile","value":"+968 9123 4567"},'
                      '{"kind":"email","label":"work","value":"sig@co.test"}]',
        },
    )
    public_id = made.json()["public_id"]

    res = TestClient(app).get(f"/api/public/{public_id}/signature.html")
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/html")
    html = res.text

    # the parts that make it useful
    assert f"/user/{public_id}" in html, "no link to the card"
    assert f"/api/public/{public_id}/qr.png" in html, "no QR image"
    assert f"/api/public/{public_id}/logo.png" in html, "no company logo"
    assert "Sig Nature" in html and "Director" in html
    assert "tel:+968 9123 4567" in html and "mailto:sig@co.test" in html
    assert "#0b6670" in html, "the company accent should colour it"

    # the constraints Outlook imposes
    assert "<table" in html, "Outlook needs tables, not flexbox"
    assert "display:flex" not in html and "display:grid" not in html
    assert "data:image" not in html, "Outlook will not render data: URIs"
    assert "<style" not in html, "Outlook drops style blocks; styles must be inline"
    # images must be absolute or the recipient cannot fetch them
    assert 'src="http' in html


def test_an_admin_can_be_renamed_disabled_and_deleted(seeded):
    root = sign_in("root", "super-secret-pw")
    made = root.post("/api/admin/users", data={"email": "temp-admin", "password": "temp-pass-123"})
    uid = made.json()["id"]

    # rename
    renamed = root.patch(f"/api/admin/users/{uid}", data={"email": "temp-admin", "name": "Temp"})
    assert renamed.status_code == 200, renamed.text
    assert renamed.json()["name"] == "Temp"

    # a signed-in session dies the moment the account is disabled
    victim = sign_in("temp-admin", "temp-pass-123")
    assert victim.get("/api/admin/me").status_code == 200
    off = root.patch(f"/api/admin/users/{uid}", data={"email": "temp-admin", "disabled": "1"})
    assert off.status_code == 200 and off.json()["disabled"] is True
    assert victim.get("/api/admin/me").status_code in (401, 403)
    # and they cannot sign back in
    assert TestClient(app).post(
        "/api/admin/login", data={"email": "temp-admin", "password": "temp-pass-123"}
    ).status_code == 403
    assert [u for u in root.get("/api/admin/users").json() if u["id"] == uid][0]["disabled"] is True

    # re-enabling lets them back
    root.patch(f"/api/admin/users/{uid}", data={"email": "temp-admin", "disabled": "0"})
    assert sign_in("temp-admin", "temp-pass-123").get("/api/admin/me").status_code == 200

    # deleting needs your own password
    assert root.request(
        "DELETE", f"/api/admin/users/{uid}", data={"password": "wrong"}
    ).status_code == 403
    assert root.request(
        "DELETE", f"/api/admin/users/{uid}", data={"password": "super-secret-pw"}
    ).status_code == 204
    assert uid not in [u["id"] for u in root.get("/api/admin/users").json()]


def test_you_cannot_lock_everyone_out(seeded):
    root = sign_in("root", "super-secret-pw")
    me = root.get("/api/admin/me").json()
    mine = [u for u in root.get("/api/admin/users").json() if u["email"] == me["email"]][0]["id"]

    # not yourself
    assert root.patch(
        f"/api/admin/users/{mine}", data={"email": me["email"], "disabled": "1"}
    ).status_code == 409
    assert root.request(
        "DELETE", f"/api/admin/users/{mine}", data={"password": "super-secret-pw"}
    ).status_code == 409

    # and never the last one standing
    others = [u["id"] for u in root.get("/api/admin/users").json() if u["id"] != mine]
    with connect() as conn:
        conn.execute("UPDATE users SET disabled = 1 WHERE id != ?", (mine,))
    try:
        solo = root.post("/api/admin/users", data={"email": "solo-x", "password": "solo-pass-12"})
        sid = solo.json()["id"]
        # now two are enabled: mine and solo-x. Disabling solo-x is fine.
        assert root.patch(
            f"/api/admin/users/{sid}", data={"email": "solo-x", "disabled": "1"}
        ).status_code == 200
        # mine is the only enabled one left, so it is protected
        assert root.patch(
            f"/api/admin/users/{mine}", data={"email": me["email"], "disabled": "1"}
        ).status_code == 409
    finally:
        with connect() as conn:
            conn.executemany(
                "UPDATE users SET disabled = 0 WHERE id = ?", [(i,) for i in others]
            )
            conn.execute("DELETE FROM users WHERE email = 'solo-x'")


def test_the_dashboard_counts_people_per_company(seeded):
    root = sign_in("root", "super-secret-pw")
    a = root.post("/api/admin/companies", data={"name": "Dash A", "branch": "North"}).json()["id"]
    b = root.post("/api/admin/companies", data={"name": "Dash B"}).json()["id"]
    for name in ("One", "Two", "Three"):
        root.post("/api/admin/contacts", data={"first_name": name, "company_id": a})
    root.post("/api/admin/contacts", data={"first_name": "Only", "company_id": b})

    data = root.get("/api/admin/dashboard").json()
    counts = {(c["name"], c["branch"]): c["contact_count"] for c in data["companies"]}
    assert counts[("Dash A", "North")] == 3
    assert counts[("Dash B", "")] == 1
    assert data["totals"]["companies"] >= 2
    assert data["totals"]["contacts"] >= 4
    assert data["totals"]["admins"] >= 1
    assert [r["first_name"] for r in data["recent"]][:1] == ["Only"]
    assert TestClient(app).get("/api/admin/dashboard").status_code == 401


def test_settings_round_trip_without_leaking_the_key(seeded):
    admin = sign_in("root", "super-secret-pw")
    before = admin.get("/api/admin/settings").json()
    assert "geocoder_key" not in before, "the API key must never be sent to the browser"
    assert "geocoder_key_set" in before
    assert "photon" in before["providers"]

    saved = admin.patch(
        "/api/admin/settings",
        data={"geocoder": "nominatim", "default_theme": "ink",
              "public_base_url": "https://cards.example.com/", "geocoder_key": "secret-value"},
    )
    assert saved.status_code == 200, saved.text
    assert saved.json()["geocoder"] == "nominatim"
    assert saved.json()["public_base_url"] == "https://cards.example.com"
    assert saved.json()["geocoder_key_set"] is True
    assert "geocoder_key" not in saved.json()

    # a blank key field leaves the stored one alone
    admin.patch("/api/admin/settings", data={"geocoder": "photon", "geocoder_key": ""})
    assert admin.get("/api/admin/settings").json()["geocoder_key_set"] is True
    # clearing is explicit
    admin.patch("/api/admin/settings", data={"clear_geocoder_key": "1"})
    assert admin.get("/api/admin/settings").json()["geocoder_key_set"] is False

    assert admin.patch("/api/admin/settings", data={"geocoder": "wat"}).status_code == 422
    assert admin.patch("/api/admin/settings", data={"default_theme": "wat"}).status_code == 422
    assert admin.patch(
        "/api/admin/settings", data={"public_base_url": "javascript:alert(1)"}
    ).status_code == 422
    assert TestClient(app).get("/api/admin/settings").status_code == 401


def test_the_share_link_follows_the_configured_base_url(seeded):
    admin = sign_in("root", "super-secret-pw")
    admin.patch("/api/admin/settings", data={"public_base_url": "https://cards.example.com"})
    try:
        cid = admin.post("/api/admin/companies", data={"name": "Based Co"}).json()["id"]
        made = admin.post("/api/admin/contacts", data={"first_name": "Base", "company_id": cid})
        assert made.json()["url"].startswith("https://cards.example.com/user/")
        html = TestClient(app).get(
            f"/api/public/{made.json()['public_id']}/signature.html"
        ).text
        assert "https://cards.example.com/user/" in html
    finally:
        admin.patch("/api/admin/settings", data={"public_base_url": "http://localhost:3000"})


def test_the_qr_still_scans_with_a_logo_in_the_middle(seeded):
    """A logo over the centre destroys modules; this proves it still decodes."""
    admin = sign_in("root", "super-secret-pw")
    plain_co = admin.post("/api/admin/companies", data={"name": "No Logo QR Co"}).json()["id"]
    logo_co = admin.post(
        "/api/admin/companies",
        data={"name": "Logo QR Co"},
        files={"logo": ("logo.png", png_bytes(), "image/png")},
    ).json()["id"]

    anon = TestClient(app)
    for company_id, label in ((plain_co, "without a logo"), (logo_co, "with a logo")):
        made = admin.post(
            "/api/admin/contacts", data={"first_name": "Scan", "company_id": company_id}
        )
        public_id = made.json()["public_id"]
        png = anon.get(f"/api/public/{public_id}/qr.png")
        assert png.status_code == 200
        assert read_qr(png.content).endswith(f"/user/{public_id}"), f"unscannable {label}"


def test_logo_size_is_clamped_and_the_qr_still_scans_at_the_maximum(seeded):
    admin = sign_in("root", "super-secret-pw")
    cid = admin.post(
        "/api/admin/companies",
        data={"name": "Big Logo Co", "logo_scale": "220"},
        files={"logo": ("logo.png", png_bytes(), "image/png")},
    ).json()["id"]
    assert admin.get(f"/api/admin/companies/{cid}").json()["logo_scale"] == 220

    made = admin.post("/api/admin/contacts", data={"first_name": "Big", "company_id": cid})
    public_id = made.json()["public_id"]
    card = TestClient(app).get(f"/api/public/{public_id}").json()
    assert card["company"]["logo_scale"] == 220

    # the largest allowed logo must not break the code
    png = TestClient(app).get(f"/api/public/{public_id}/qr.png")
    assert read_qr(png.content).endswith(f"/user/{public_id}"), "unscannable at the largest size"

    # out of range is refused rather than silently clamped
    for bad in ("10", "500", "huge"):
        assert admin.patch(
            f"/api/admin/companies/{cid}", data={"name": "Big Logo Co", "logo_scale": bad}
        ).status_code == 422, bad
    # and the default applies when not given
    plain = admin.post("/api/admin/companies", data={"name": "Default Size Co"}).json()["id"]
    assert admin.get(f"/api/admin/companies/{plain}").json()["logo_scale"] == 100


def test_a_company_sets_the_language_of_its_cards(seeded):
    admin = sign_in("root", "super-secret-pw")
    cid = admin.post(
        "/api/admin/companies", data={"name": "Arabic Co", "language": "ar"}
    ).json()["id"]
    assert admin.get(f"/api/admin/companies/{cid}").json()["language"] == "ar"

    made = admin.post("/api/admin/contacts", data={"first_name": "Salim", "company_id": cid})
    card = TestClient(app).get(f"/api/public/{made.json()['public_id']}").json()
    assert card["company"]["language"] == "ar"

    for lang in ("en", "de", "fr", "ar"):
        assert admin.patch(
            f"/api/admin/companies/{cid}", data={"name": "Arabic Co", "language": lang}
        ).status_code == 200, lang
        assert admin.get(f"/api/admin/companies/{cid}").json()["language"] == lang

    # it becomes an html lang attribute, so anything unlisted is refused
    assert admin.patch(
        f"/api/admin/companies/{cid}", data={"name": "Arabic Co", "language": "klingon"}
    ).status_code == 422
    # and English is the default
    plain = admin.post("/api/admin/companies", data={"name": "Default Lang Co"}).json()["id"]
    assert admin.get(f"/api/admin/companies/{plain}").json()["language"] == "en"


def test_analytics_counts_the_window_and_what_came_before_it(seeded):
    root = sign_in("root", "super-secret-pw")
    company = root.post("/api/admin/companies", data={"name": "Metrics Co"}).json()["id"]
    contact = root.post(
        "/api/admin/contacts", data={"first_name": "Watched", "company_id": company}
    ).json()["id"]

    from datetime import UTC, datetime, timedelta

    today = datetime.now(UTC)
    events = [
        ("view", today),
        ("view", today - timedelta(days=3)),
        ("call", today - timedelta(days=1)),
        ("save", today - timedelta(days=2)),
        # inside the previous window, so it must not land in this one
        ("view", today - timedelta(days=40)),
    ]
    with connect() as conn:
        for kind, at in events:
            conn.execute(
                "INSERT INTO card_events (contact_id, kind, at, source) VALUES (?, ?, ?, 'qr')",
                (contact, kind, at.isoformat()),
            )

    data = root.get(f"/api/admin/analytics?company_id={company}&days=30").json()
    assert data["totals"]["views"] == 2
    assert data["totals"]["clicks"] == 2  # the call and the save
    assert data["totals"]["saves"] == 1
    assert data["totals"]["active_cards"] == 1
    assert data["totals"]["cards"] == 1
    assert len(data["series"]) == 30
    assert sum(d["views"] for d in data["series"]) == 2
    assert {a["kind"] for a in data["actions"]} == {"call", "save"}
    assert data["sources"][0]["source"] == "qr"
    assert data["top"][0]["first_name"] == "Watched"

    # the 40-day-old view is the only thing in the window before this one
    assert data["change"]["views"] == 100.0

    assert root.get("/api/admin/analytics?days=5").status_code == 422
    assert TestClient(app).get("/api/admin/analytics").status_code == 401


def test_a_new_company_keeps_its_switch_defaults_and_can_turn_sharing_off(seeded):
    root = sign_in("root", "super-secret-pw")
    # The create form never mentions the switches, so they must stay on.
    company = root.post("/api/admin/companies", data={"name": "Switchy"}).json()["id"]
    fresh = root.get(f"/api/admin/companies/{company}").json()
    assert fresh["show_qr"] == 1
    assert fresh["public_sharing"] == 1
    assert fresh["allow_save"] == 1
    assert fresh["allow_indexing"] == 0

    public_id = root.post(
        "/api/admin/contacts", data={"first_name": "Shared", "company_id": company}
    ).json()["public_id"]
    assert root.get(f"/api/public/{public_id}").status_code == 200

    full = {
        "name": "Switchy",
        "branch": "",
        "theme": "plain",
        "language": "en",
        "font": "poppins",
        "logo_position": "top-center",
        "logo_scale": "100",
        "wallpaper_fit": "cover",
        "show_qr": "0",
        "show_qr_download": "0",
        "public_sharing": "0",
        "allow_save": "0",
        "allow_indexing": "1",
        "require_consent": "1",
        "show_company_name": "0",
        "show_branch": "0",
        "share_message": "Here is my card.",
    }
    assert root.patch(f"/api/admin/companies/{company}", data=full).status_code == 200
    off = root.get(f"/api/admin/companies/{company}").json()
    assert off["show_qr"] == 0
    assert off["public_sharing"] == 0
    assert off["require_consent"] == 1
    assert off["share_message"] == "Here is my card."

    # Sharing off: the link was real, so the card is gone rather than missing.
    assert root.get(f"/api/public/{public_id}").status_code == 410

    root.patch(f"/api/admin/companies/{company}", data={**full, "public_sharing": "1"})
    card = root.get(f"/api/public/{public_id}").json()
    assert card["company"]["allow_save"] is False
    assert card["company"]["require_consent"] is True
    assert card["company"]["show_name"] is False
    # Saving refused at the source, not just hidden in the page.
    assert root.get(f"/api/public/{public_id}.vcf").status_code == 403


def test_a_view_records_the_device_and_a_daily_visitor_hash(seeded):
    root = sign_in("root", "super-secret-pw")
    company = root.post("/api/admin/companies", data={"name": "Counted"}).json()["id"]
    public_id = root.post(
        "/api/admin/contacts", data={"first_name": "Seen", "company_id": company}
    ).json()["public_id"]

    phone = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148"
    desk = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120"
    client = TestClient(app)
    client.get(f"/api/public/{public_id}", headers={"user-agent": phone})
    client.get(f"/api/public/{public_id}", headers={"user-agent": phone})
    client.get(f"/api/public/{public_id}", headers={"user-agent": desk})

    data = root.get(f"/api/admin/analytics?company_id={company}&days=7").json()
    assert data["totals"]["views"] == 3
    # Two user agents, so two visitors however many times they looked.
    assert data["totals"]["visitors"] == 2
    assert {d["device"]: d["n"] for d in data["devices"]} == {"phone": 2, "computer": 1}

    with connect() as conn:
        stored = conn.execute(
            "SELECT DISTINCT visitor FROM card_events WHERE visitor IS NOT NULL"
        ).fetchall()
    # A hash, not an address: nothing here looks like the client's IP.
    assert all(len(r["visitor"]) == 16 and "." not in r["visitor"] for r in stored)


def test_two_step_login_needs_the_code_and_a_recovery_code_works_once(seeded):
    from app import totp

    admin = sign_in("root", "super-secret-pw")
    # Enrol: a secret, then a code from it proves the app and server agree.
    started = admin.post("/api/admin/me/2fa/start").json()
    secret = started["secret"]
    assert started["uri"].startswith("otpauth://totp/")
    assert admin.get("/api/admin/me/2fa/qr.png").status_code == 200
    assert admin.post("/api/admin/me/2fa/confirm", data={"code": "000000"}).status_code == 422

    now = int(time.time() // totp.STEP)
    confirmed = admin.post(
        "/api/admin/me/2fa/confirm", data={"code": totp.code_at(secret, now)}
    ).json()
    codes = confirmed["recovery_codes"]
    assert len(codes) == 10
    assert admin.get("/api/admin/me/2fa").json() == {"enabled": True, "recovery_left": 10}

    # A fresh sign-in now stops half way.
    client = TestClient(app)
    first = client.post("/api/admin/login", data={"email": "root", "password": "super-secret-pw"})
    assert first.json() == {"needs_code": True}
    # The half-signed-in session reaches nothing but the code check.
    assert client.get("/api/admin/companies").status_code == 401
    # ...and the query string cannot talk its way past it either.
    assert client.get("/api/admin/companies?allow_pending=true").status_code == 401

    assert client.post("/api/admin/login/2fa", data={"code": "123456"}).status_code == 401
    code = totp.code_at(secret, int(time.time() // totp.STEP))
    assert client.post("/api/admin/login/2fa", data={"code": code}).status_code == 200
    assert client.get("/api/admin/companies").status_code == 200

    # A recovery code gets you in exactly once.
    other = TestClient(app)
    other.post("/api/admin/login", data={"email": "root", "password": "super-secret-pw"})
    assert other.post("/api/admin/login/2fa", data={"code": codes[0]}).status_code == 200
    again = TestClient(app)
    again.post("/api/admin/login", data={"email": "root", "password": "super-secret-pw"})
    assert again.post("/api/admin/login/2fa", data={"code": codes[0]}).status_code == 401
    assert admin.get("/api/admin/me/2fa").json()["recovery_left"] == 9

    # Off again needs the password, not just the open session.
    assert admin.post("/api/admin/me/2fa/off", data={"password": "wrong"}).status_code == 403
    assert (
        admin.post("/api/admin/me/2fa/off", data={"password": "super-secret-pw"}).status_code == 200
    )
    assert admin.get("/api/admin/me/2fa").json() == {"enabled": False, "recovery_left": 0}
    plain = TestClient(app)
    assert "needs_code" not in plain.post(
        "/api/admin/login", data={"email": "root", "password": "super-secret-pw"}
    ).json()


def test_the_monthly_report_is_owed_once_a_month_and_only_when_set_up(seeded):
    from datetime import UTC, datetime

    from app import reports
    from app import settings as app_settings

    today = datetime.now(UTC)
    app_settings.put("notify_monthly", "0")
    assert reports.due(today) is False

    app_settings.put("notify_monthly", "1")
    app_settings.put("notify_to", "")
    assert reports.due(today) is False  # nowhere to send it

    app_settings.put("notify_to", "ops@example.com")
    app_settings.put("zepto_token", "")
    assert reports.due(today) is False  # no mail server

    app_settings.put("zepto_token", "Zoho-enczapikey test")
    app_settings.put("mail_from", "cards@example.com")
    assert reports.due(today) is True

    app_settings.put("monthly_sent", today.strftime("%Y-%m"))
    assert reports.due(today) is False  # already gone out this month

    for key in ("notify_monthly", "notify_to", "zepto_token", "mail_from", "monthly_sent"):
        app_settings.put(key, "")


def test_an_admin_with_an_email_can_reset_their_own_password_with_a_code(seeded):
    root = sign_in("root", "super-secret-pw")
    root.post(
        "/api/admin/users",
        data={"email": "forgetful@example.com", "password": "first-password-1"},
    )
    anon = TestClient(app)

    # The form answers the same way whoever asks, so it cannot be used to find
    # out which identifiers have accounts.
    assert anon.post("/api/admin/forgot", data={"email": "nobody@example.com"}).json() == {
        "ok": True
    }
    assert anon.post("/api/admin/forgot", data={"email": "root"}).json() == {"ok": True}

    with connect() as conn:
        before = conn.execute("SELECT COUNT(*) AS n FROM user_codes").fetchone()["n"]
    assert before == 0  # neither of those had anywhere to send a code

    assert anon.post("/api/admin/forgot", data={"email": "forgetful@example.com"}).json() == {
        "ok": True
    }
    # The code is hashed; the test reads it the only way anyone else could not.
    code = "123456"
    with connect() as conn:
        row = conn.execute(
            "SELECT uc.id FROM user_codes uc JOIN users u ON u.id = uc.user_id "
            "WHERE u.email = 'forgetful@example.com' AND uc.used = 0"
        ).fetchone()
        assert row is not None
        conn.execute(
            "UPDATE user_codes SET code_hash = ? WHERE id = ?",
            (hashlib.sha256(code.encode()).hexdigest(), row["id"]),
        )

    assert anon.post(
        "/api/admin/reset",
        data={"email": "forgetful@example.com", "code": "000000", "new_password": "second-pw-12"},
    ).status_code == 422
    assert anon.post(
        "/api/admin/reset",
        data={"email": "forgetful@example.com", "code": code, "new_password": "short"},
    ).status_code == 422
    assert anon.post(
        "/api/admin/reset",
        data={"email": "forgetful@example.com", "code": code, "new_password": "second-pw-12"},
    ).status_code == 200

    # The new password works, the old one does not, and the code is spent.
    assert TestClient(app).post(
        "/api/admin/login", data={"email": "forgetful@example.com", "password": "second-pw-12"}
    ).status_code == 200
    assert TestClient(app).post(
        "/api/admin/login", data={"email": "forgetful@example.com", "password": "first-password-1"}
    ).status_code == 401
    assert anon.post(
        "/api/admin/reset",
        data={"email": "forgetful@example.com", "code": code, "new_password": "third-pw-123"},
    ).status_code == 422


def test_analytics_takes_a_date_range_and_groups_by_week_or_month(seeded):
    from datetime import UTC, datetime, timedelta

    root = sign_in("root", "super-secret-pw")
    company = root.post("/api/admin/companies", data={"name": "Ranged Co"}).json()["id"]
    contact = root.post(
        "/api/admin/contacts", data={"first_name": "Ranged", "company_id": company}
    ).json()["id"]

    today = datetime.now(UTC)
    with connect() as conn:
        for back in (0, 1, 9, 40):
            conn.execute(
                "INSERT INTO card_events (contact_id, kind, at) VALUES (?, 'view', ?)",
                (contact, (today - timedelta(days=back)).isoformat()),
            )

    first = (today - timedelta(days=13)).date().isoformat()
    last = today.date().isoformat()
    ranged = root.get(
        f"/api/admin/analytics?company_id={company}&start={first}&end={last}"
    ).json()
    assert ranged["from"] == first and ranged["to"] == last
    assert len(ranged["series"]) == 14
    assert ranged["totals"]["views"] == 3  # the 40-day-old one is outside

    weekly = root.get(
        f"/api/admin/analytics?company_id={company}&start={first}&end={last}&grain=week"
    ).json()
    assert weekly["grain"] == "week"
    assert len(weekly["series"]) <= 3
    assert sum(point["views"] for point in weekly["series"]) == 3

    monthly = root.get(
        f"/api/admin/analytics?company_id={company}&start={first}&end={last}&grain=month"
    ).json()
    assert all(len(point["day"]) == 7 for point in monthly["series"])

    # One card at a time, too.
    assert root.get(f"/api/admin/analytics?contact_id={contact}&days=30").json()["totals"][
        "views"
    ] == 3

    assert root.get("/api/admin/analytics?start=2026-10-10&end=2026-10-01").status_code == 422
    assert root.get("/api/admin/analytics?start=nonsense&end=2026-10-01").status_code == 422
    assert root.get("/api/admin/analytics?grain=hour").status_code == 422


def test_a_card_made_without_an_org_still_names_its_company(seeded):
    """The admin form fills the company in; anything else should not lose it."""
    root = sign_in("root", "super-secret-pw")
    company = root.post("/api/admin/companies", data={"name": "Implied Co"}).json()["id"]

    quiet = root.post(
        "/api/admin/contacts", data={"first_name": "Scripted", "company_id": company}
    ).json()["public_id"]
    card = TestClient(app).get(f"/api/public/{quiet}").json()
    assert card["org"] == "Implied Co"
    assert "ORG:Implied Co" in unfold(TestClient(app).get(f"/api/public/{quiet}.vcf").text)

    # A posted blank is a decision, not an omission.
    blank = root.post(
        "/api/admin/contacts",
        data={"first_name": "Deliberate", "company_id": company, "org": ""},
    ).json()["public_id"]
    assert TestClient(app).get(f"/api/public/{blank}").json()["org"] in (None, "")


def test_a_company_default_photo_is_copied_onto_each_new_card(seeded):
    """Seeded, not pointed at: later changes leave existing cards alone."""
    root = sign_in("root", "super-secret-pw")
    company = root.post(
        "/api/admin/companies",
        data={"name": "Faces Ltd"},
        files={"photo": ("default.jpg", jpeg_bytes(), "image/jpeg")},
    ).json()["id"]
    saved = root.get(f"/api/admin/companies/{company}").json()
    assert saved["photo_path"] and saved["photo_small_path"]
    assert root.get(f"/api/admin/companies/{company}/photo.jpg").status_code == 200

    anon = TestClient(app)
    seeded_card = root.post(
        "/api/admin/contacts", data={"first_name": "Seeded", "company_id": company}
    ).json()["public_id"]
    card = anon.get(f"/api/public/{seeded_card}").json()
    # Their own photo now, with both copies written under their own id.
    assert card["photo_url"] == f"/api/public/{seeded_card}/photo.jpg"
    assert anon.get(f"/api/public/{seeded_card}/photo.jpg").status_code == 200
    assert "PHOTO;ENCODING=b" in unfold(anon.get(f"/api/public/{seeded_card}.vcf").text)
    with connect() as conn:
        row = conn.execute(
            "SELECT photo_path, photo_small_path FROM contacts WHERE public_id = ?",
            (seeded_card,),
        ).fetchone()
    assert row["photo_path"] == f"{seeded_card}.jpg"
    assert row["photo_small_path"] == f"{seeded_card}-s.jpg"

    # Dropping the company's default does not take it off cards already made.
    root.patch(
        f"/api/admin/companies/{company}",
        data={"name": "Faces Ltd", "branch": "", "remove_photo": "1"},
    )
    assert anon.get(f"/api/public/{seeded_card}/photo.jpg").status_code == 200

    # ...and with no default left, a new card simply has no photo.
    bare = root.post(
        "/api/admin/contacts", data={"first_name": "Bare", "company_id": company}
    ).json()["public_id"]
    assert anon.get(f"/api/public/{bare}").json()["photo_url"] is None


def test_a_company_can_name_its_own_notification_address(seeded):
    """Per company, on top of the global one, and only for its own cards."""
    root = sign_in("root", "super-secret-pw")
    company = root.post("/api/admin/companies", data={"name": "Told Co"}).json()["id"]
    fresh = root.get(f"/api/admin/companies/{company}").json()
    assert fresh["notify_to"] is None
    assert fresh["notify_created"] == 1  # on, but with nowhere to send yet
    assert fresh["notify_updated"] == 0

    full = {
        "name": "Told Co",
        "branch": "",
        "theme": "plain",
        "language": "en",
        "font": "poppins",
        "logo_position": "top-center",
        "logo_scale": "100",
        "wallpaper_fit": "cover",
        "notify_to": "Office@Told.example",
        "notify_created": "1",
        "notify_updated": "1",
    }
    assert root.patch(f"/api/admin/companies/{company}", data=full).status_code == 200
    told = root.get(f"/api/admin/companies/{company}").json()
    assert told["notify_to"] == "office@told.example"  # stored lowercase
    assert told["notify_updated"] == 1

    # Creating a card still works with email unconfigured: notifications are
    # best effort, never a reason to fail the request.
    made = root.post(
        "/api/admin/contacts", data={"first_name": "Noisy", "company_id": company}
    )
    assert made.status_code == 201


def test_bootstrap_creates_the_first_administrator_on_a_fresh_database(tmp_path, monkeypatch):
    """The only way into a new install. It broke once because it still wrote a
    role column that no longer exists, and nothing noticed until a deploy."""
    import importlib
    import sys

    monkeypatch.setenv("VCARD_DB", str(tmp_path / "fresh.db"))
    monkeypatch.setenv("VCARD_UPLOADS", str(tmp_path / "uploads"))
    for module in ("app.config", "app.db", "app.auth", "app.bootstrap"):
        if module in sys.modules:
            importlib.reload(sys.modules[module])
    import app.bootstrap as bootstrap
    from app.auth import verify_password
    from app.db import connect as fresh_connect

    monkeypatch.setattr(
        sys, "argv", ["bootstrap", "--email", "First@Example.com", "--password", "a-real-password"]
    )
    assert bootstrap.main() == 0

    with fresh_connect() as conn:
        row = conn.execute("SELECT email, password_hash, disabled FROM users").fetchone()
    assert row["email"] == "first@example.com"  # lowercased, as login expects
    assert row["disabled"] == 0
    assert verify_password("a-real-password", row["password_hash"])

    # A second run refuses rather than resetting someone's password by accident.
    assert bootstrap.main() == 1


def test_the_session_cookie_is_secure_only_when_the_request_was(seeded):
    """A Secure cookie is dropped by the browser on a plain-HTTP page, which
    looks exactly like a wrong password. So the flag follows the request."""
    root = sign_in("root", "super-secret-pw")
    root.post(
        "/api/admin/users", data={"email": "scheme@example.com", "password": "a-password-12"}
    )

    plain = TestClient(app).post(
        "/api/admin/login", data={"email": "scheme@example.com", "password": "a-password-12"}
    )
    assert plain.status_code == 200
    assert "secure" not in plain.headers["set-cookie"].lower()

    # The proxy says it arrived over TLS, so the cookie insists on it.
    secured = TestClient(app).post(
        "/api/admin/login",
        data={"email": "scheme@example.com", "password": "a-password-12"},
        headers={"x-forwarded-proto": "https"},
    )
    assert secured.status_code == 200
    assert "secure" in secured.headers["set-cookie"].lower()


def test_requiring_two_step_leaves_the_door_to_setting_it_up(seeded):
    """The requirement must not lock an admin out of the page that satisfies it."""
    from app import settings as app_settings
    from app import totp

    root = sign_in("root", "super-secret-pw")
    try:
        app_settings.put("require_2fa", "1")

        # The session is real, but everything except the account is closed.
        assert root.get("/api/admin/companies").status_code == 403
        assert root.get("/api/admin/me").status_code == 200
        started = root.post("/api/admin/me/2fa/start")
        assert started.status_code == 200

        secret = started.json()["secret"]
        code = totp.code_at(secret, int(time.time() // totp.STEP))
        assert root.post("/api/admin/me/2fa/confirm", data={"code": code}).status_code == 200

        # Satisfied: the rest of the admin opens again.
        assert root.get("/api/admin/companies").status_code == 200
    finally:
        app_settings.put("require_2fa", "0")
        root.post("/api/admin/me/2fa/off", data={"password": "super-secret-pw"})


def test_admin_profile_photo_is_validated_and_private(seeded):
    root = sign_in("root", "super-secret-pw")
    root.post("/api/admin/users", data={"email": "photo-admin", "password": "photo-password-123"})
    owner = sign_in("photo-admin", "photo-password-123")
    anon = TestClient(app)
    assert anon.get("/api/admin/me/photo").status_code == 401
    assert anon.put("/api/admin/me/photo").status_code == 401
    assert owner.get("/api/admin/me/photo").status_code == 404
    assert owner.put("/api/admin/me/photo").status_code == 422
    bad = owner.put("/api/admin/me/photo", files={"photo": ("bad.jpg", b"not an image")})
    assert bad.status_code == 422
    made = owner.put("/api/admin/me/photo", files={"photo": ("portrait.jpg", jpeg_bytes())})
    assert made.status_code == 200, made.text
    url = made.json()["photo_url"]
    assert owner.get("/api/admin/me").json()["photo_url"] == url
    image = owner.get(url)
    assert image.status_code == 200
    assert image.headers["content-type"] == "image/png"
    assert image.headers["cache-control"] == "private, no-store"
    with Image.open(io.BytesIO(image.content)) as decoded:
        assert max(decoded.size) <= 420
    assert root.get(url).status_code == 404
    again = owner.put("/api/admin/me/photo", files={"photo": ("new.jpg", jpeg_bytes())})
    assert again.status_code == 200
    assert again.json()["photo_url"] != url
    invalid = owner.put("/api/admin/me/photo", files={"photo": ("bad.svg", b"<svg/>")})
    assert invalid.status_code == 422
    assert len(list(pathlib.Path(os.environ["VCARD_UPLOADS"]).glob("admin-*.png"))) == 1
    assert owner.get("/api/admin/me").json()["photo_url"] == again.json()["photo_url"]


def test_the_mail_region_decides_the_endpoint(seeded):
    """A token is only good in its own data centre, so the host is settable —
    but only to one ZeptoMail runs, never to an address of someone's choosing."""
    from app import mailer

    admin = sign_in("root", "super-secret-pw")
    assert mailer.endpoint() == "https://api.zeptomail.com/v1.1/email"

    moved = admin.patch("/api/admin/settings", data={"zepto_dc": "api.zeptomail.in"})
    assert moved.status_code == 200, moved.text
    assert admin.get("/api/admin/settings").json()["zepto_dc"] == "api.zeptomail.in"
    assert mailer.endpoint() == "https://api.zeptomail.in/v1.1/email"

    refused = admin.patch("/api/admin/settings", data={"zepto_dc": "api.attacker.example"})
    assert refused.status_code == 422
    assert mailer.endpoint() == "https://api.zeptomail.in/v1.1/email"


def test_exchange_sends_the_visitor_to_the_card_holder(seeded, monkeypatch):
    """The form on a card is open to the internet: it has to validate what it
    is given, reach the card holder's own address, and refuse to be used as a
    way of posting mail at somebody all afternoon."""
    from app import mailer, routes_public

    admin = sign_in("root", "super-secret-pw")
    made = admin.post(
        "/api/admin/contacts",
        data={
            "first_name": "Omar",
            "last_name": "Said",
            "company_id": seeded["Globex"],
            "fields": '[{"kind":"email","label":"work","value":"omar@globex.test"}]',
        },
    )
    assert made.status_code == 201, made.text
    public_id = made.json()["public_id"]

    sent: list[tuple] = []
    monkeypatch.setattr(mailer, "configured", lambda: True)
    monkeypatch.setattr(mailer, "send", lambda *args: sent.append(args))

    anon = TestClient(app)
    url = f"/api/public/{public_id}/exchange"
    assert anon.post(url, json={"name": "", "email": "lead@buyer.test"}).status_code == 422
    assert anon.post(url, json={"name": "Lead", "email": "not-an-address"}).status_code == 422
    assert not sent, "nothing should have been sent for a request that was refused"

    good = anon.post(url, json={"name": "Lead Buyer", "email": "lead@buyer.test",
                                "phone": "+968 9000 0000", "message": "Call me Tuesday"})
    assert good.status_code == 202, good.text
    assert len(sent) == 1
    to_address, _, subject, _, text = sent[0]
    assert to_address == "omar@globex.test", "the card holder's own address comes first"
    assert "Lead Buyer" in subject
    assert "lead@buyer.test" in text and "Call me Tuesday" in text

    # The hourly cap counts the card's own exchange events.
    for _ in range(routes_public.EXCHANGE_PER_HOUR):
        anon.post(url, json={"name": "Lead Buyer", "email": "lead@buyer.test"})
    capped = anon.post(url, json={"name": "Lead Buyer", "email": "lead@buyer.test"})
    assert capped.status_code == 429
