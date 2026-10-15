"""Checks for the vCard serializer.

Its failure mode is silent: a phone drops a field or refuses the file without
saying why. These assertions are the cheap substitute for importing into a real
phone on every change.
"""

import base64
import io
import re

from PIL import Image

from app import vcf

CONTACT = {
    "prefix": "Dr",
    "first_name": "José",
    "middle_name": "K",
    "last_name": "O'Neill-Smith",
    "suffix": "PhD",
    "nickname": "Joe",
    "phonetic_first": "ho-SAY",
    "org": "Acme; Industries, Ltd",
    "department": "R&D",
    "job_title": "Head of R&D, Platform",
    "note": "Prefers email; back-slash \\ and\na newline",
}

FIELDS = [
    {"kind": "phone", "label": "mobile", "value": "+1 555 0199", "position": 0, "id": 1},
    {"kind": "phone", "label": "Boat phone", "value": "+1 555 0123", "position": 1, "id": 2},
    {"kind": "email", "label": "work", "value": "jose@acme.test", "position": 2, "id": 3},
    {
        "kind": "address",
        "label": "work",
        "value": '{"street": "12 High Street, Unit 4", "city": "Springfield",'
        ' "region": "MA", "postal": "01101", "country": "USA"}',
        "position": 3,
        "id": 4,
    },
    {"kind": "date", "label": "birthday", "value": "1979-04-02", "position": 4, "id": 5},
    {"kind": "social", "label": "LinkedIn", "value": "https://lnkd.in/x", "position": 5, "id": 6},
    {"kind": "relation", "label": "spouse", "value": "Alex", "position": 6, "id": 7},
]


def unfold(doc: str) -> str:
    """Reverse RFC 2425 folding so values can be asserted on."""
    return doc.replace("\r\n ", "")


def jpeg_bytes(size=(900, 700)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", size, (90, 140, 200)).save(buf, "JPEG")
    return buf.getvalue()


def test_line_endings_and_envelope():
    doc = vcf.build(CONTACT, FIELDS)
    assert doc.startswith("BEGIN:VCARD\r\nVERSION:3.0\r\n")
    assert doc.endswith("END:VCARD\r\n")
    # a lone LF makes iOS reject the file outright
    assert "\n" not in doc.replace("\r\n", "")


def test_no_line_exceeds_75_octets_and_continuations_start_with_one_space():
    doc = vcf.build(CONTACT, FIELDS, jpeg_bytes())
    lines = doc.split("\r\n")[:-1]
    for line in lines:
        assert len(line.encode("utf-8")) <= 75, f"unfolded line: {line[:40]!r}"
    continuations = [line for line in lines if line.startswith(" ")]
    assert continuations, "a photo-bearing card must have folded lines"
    for line in continuations:
        assert not line.startswith("  "), "continuation must carry exactly one space"


def test_multibyte_character_survives_folding():
    name = "José" + "a" * 70 + "ü"
    doc = vcf.build({**CONTACT, "first_name": name, "last_name": ""})
    assert name in unfold(doc)


def test_text_values_are_escaped():
    body = unfold(vcf.build(CONTACT, FIELDS))
    note = next(ln for ln in body.split("\r\n") if ln.startswith("NOTE:"))
    assert note == "NOTE:Prefers email\\; back-slash \\\\ and\\na newline"
    title = next(ln for ln in body.split("\r\n") if ln.startswith("TITLE:"))
    assert title == "TITLE:Head of R&D\\, Platform"


def test_address_comma_stays_in_one_component():
    body = unfold(vcf.build(CONTACT, FIELDS))
    adr = next(ln for ln in body.split("\r\n") if ln.startswith("ADR"))
    # 7 components means 6 unescaped semicolons; the street comma must be escaped
    assert len(re.findall(r"(?<!\\);", adr.split(":", 1)[1])) == 6
    assert "12 High Street\\, Unit 4" in adr


def test_full_name_parts_and_org():
    body = unfold(vcf.build(CONTACT, FIELDS))
    assert "N:O'Neill-Smith;José;K;Dr;PhD" in body
    assert "FN:Dr José K O'Neill-Smith PhD" in body
    assert "ORG:Acme\\; Industries\\, Ltd;R&D" in body
    assert "NICKNAME:Joe" in body
    assert "X-PHONETIC-FIRST-NAME:ho-SAY" in body


def test_standard_labels_use_type_parameters():
    body = unfold(vcf.build(CONTACT, FIELDS))
    assert "TEL;TYPE=CELL,VOICE:+1 555 0199" in body
    assert "EMAIL;TYPE=INTERNET,WORK:jose@acme.test" in body
    assert "ADR;TYPE=WORK:" in body
    assert "BDAY:1979-04-02" in body


def test_custom_label_uses_an_item_group():
    """A label outside the vCard vocabulary only survives via itemN grouping."""
    body = unfold(vcf.build(CONTACT, FIELDS))
    lines = body.split("\r\n")
    tel = next(ln for ln in lines if ln.endswith("+1 555 0123"))
    tag = tel.split(".", 1)[0]
    assert re.fullmatch(r"item\d+", tag)
    assert f"{tag}.X-ABLabel:Boat phone" in lines


def test_repeatable_kinds_each_emit_their_property():
    body = unfold(vcf.build(CONTACT, FIELDS))
    assert "X-SOCIALPROFILE;TYPE=LinkedIn:https://lnkd.in/x" in body
    assert "X-ABRELATEDNAMES:Alex" in body


def test_embedded_photo_round_trips_to_a_jpeg():
    body = unfold(vcf.build(CONTACT, FIELDS, jpeg_bytes()))
    line = next(ln for ln in body.split("\r\n") if ln.startswith("PHOTO"))
    assert line.startswith("PHOTO;ENCODING=b;TYPE=JPEG:")
    raw = base64.b64decode(line.split(":", 1)[1])
    assert Image.open(io.BytesIO(raw)).format == "JPEG"


def test_optional_fields_are_omitted_not_blank():
    doc = vcf.build({"first_name": "Solo"})
    assert "FN:Solo" in doc
    for tag in ("ORG:", "TITLE:", "TEL", "EMAIL", "URL:", "ADR", "NOTE:", "PHOTO", "BDAY"):
        assert tag not in doc


def test_blank_values_are_dropped():
    doc = vcf.build({"first_name": "Solo"}, [
        {"kind": "phone", "label": "mobile", "value": "   ", "position": 0, "id": 1},
    ])
    assert "TEL" not in doc
