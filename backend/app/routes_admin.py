"""Authenticated admin API.

Every admin spans every company: there is no per-company role to scope reads
and writes against. What is enforced here is the session, not a tenancy.
"""

from __future__ import annotations

import contextlib
import hashlib
import hmac
import io
import json
import re
import secrets
import shutil
import sqlite3
import tempfile
import zipfile
from datetime import UTC, date, datetime, timedelta
from html import escape
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask
from starlette.datastructures import UploadFile

from . import analytics as analytics_window
from . import geocode, mailer, photos, qr, routes_portal, totp
from . import settings as app_settings
from .auth import (
    SESSION_COOKIE,
    cookie_secure,
    current_user,
    end_session,
    finish_2fa,
    half_signed_in,
    hash_password,
    start_session,
    verify_password,
)
from .config import UPLOADS, public_base_url
from .contacts import (
    create_contact,
    field_rows,
    parse_fields,
    read_single,
    serialise,
    update_contact,
)
from .db import connect
from .ids import new_public_id
from .fields import (
    COMPANY_DETAILS,
    DEFAULT_FONT,
    DEFAULT_LANGUAGE,
    DEFAULT_LOGO_POSITION,
    DEFAULT_LOGO_SCALE,
    DEFAULT_THEME,
    DEFAULT_TYPE_SCALE,
    DEFAULT_WALLPAPER_FIT,
    FONTS,
    LANGUAGES,
    LOGO_POSITIONS,
    MAX_ACCENTS,
    MAX_LOGO_SCALE,
    MIN_LOGO_SCALE,
    SINGLE,
    THEMES,
    TYPE_SCALES,
    WALLPAPER_FITS,
)

# Everything the branding form can set, in the order the SQL below writes it.
BRAND_COLUMNS = (
    "theme",
    "accents",
    "logo_position",
    "logo_scale",
    "language",
    "wallpaper_fit",
    "font",
    "type_scale",
    "show_qr",
    "show_qr_download",
    "require_consent",
    "public_sharing",
    "allow_indexing",
    "allow_save",
    "show_company_name",
    "show_branch",
    "share_message",
    "notify_to",
    "notify_created",
    "notify_updated",
)

# Switches, with what a form that never mentions them means. Create posts only
# the fields it asks about, so "absent" has to keep the column's own default
# rather than read as off — that is how a new company used to end up with its
# QR code switched off.
SWITCHES = {
    "notify_created": 1,
    "notify_updated": 0,
    "show_qr": 1,
    "show_qr_download": 1,
    "require_consent": 0,
    "public_sharing": 1,
    "allow_indexing": 0,
    "allow_save": 1,
    "show_company_name": 1,
    "show_branch": 1,
}

router = APIRouter(prefix="/api/admin", tags=["admin"])

# Annotated form rather than Depends() in a default: it is the current
# FastAPI idiom and keeps the dependency out of the signature's defaults.
# Every admin spans every company, so there is one dependency, not two.
CurrentUser = Annotated[sqlite3.Row, Depends(current_user)]


# The column is still called `email` but now holds any login
# identifier. Renaming it means a migration across five call sites for no
# behavioural gain; the UI calls it "username or email".
def valid_identifier(value: str) -> bool:
    return len(value) >= 3 and not any(c.isspace() for c in value)


def slugify(name: str, branch: str = "") -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", f"{name} {branch}".lower()).strip("-")
    return slug or "company"


HEX = re.compile(r"^#[0-9a-fA-F]{6}$")


def branding(form) -> dict[str, object]:
    """Validate the look-and-feel fields.

    theme is checked against the allow-list because it becomes a CSS class
    name, and every colour against a hex pattern because they are interpolated
    into a style attribute.
    """
    theme = str(form.get("theme") or DEFAULT_THEME).strip()
    if theme not in THEMES:
        raise HTTPException(422, f"Unknown background template: {theme!r}")

    position = str(form.get("logo_position") or DEFAULT_LOGO_POSITION).strip()
    if position not in LOGO_POSITIONS:
        raise HTTPException(422, f"Unknown logo position: {position!r}")

    language = str(form.get("language") or DEFAULT_LANGUAGE).strip().lower()
    if language not in LANGUAGES:
        raise HTTPException(422, f"Unknown language: {language!r}")

    try:
        scale = int(str(form.get("logo_scale") or DEFAULT_LOGO_SCALE))
    except ValueError as e:
        raise HTTPException(422, "Logo size must be a number") from e
    if not MIN_LOGO_SCALE <= scale <= MAX_LOGO_SCALE:
        raise HTTPException(
            422, f"Logo size must be between {MIN_LOGO_SCALE} and {MAX_LOGO_SCALE} percent"
        )

    fit = str(form.get("wallpaper_fit") or DEFAULT_WALLPAPER_FIT).strip()
    if fit not in WALLPAPER_FITS:
        raise HTTPException(422, f"Unknown wallpaper fit: {fit!r}")

    font = str(form.get("font") or DEFAULT_FONT).strip()
    if font not in FONTS:
        raise HTTPException(422, f"Unknown font: {font!r}")

    scale_name = str(form.get("type_scale") or DEFAULT_TYPE_SCALE).strip()
    if scale_name not in TYPE_SCALES:
        raise HTTPException(422, f"Unknown text size: {scale_name!r}")

    rest: dict[str, object] = {
        "theme": theme,
        "logo_position": position,
        "logo_scale": scale,
        "language": language,
        "wallpaper_fit": fit,
        "font": font,
        "type_scale": scale_name,
        # Every switch is posted as "1" or "0" by the admin UI; a form that
        # leaves one out keeps that column's default.
        **{
            key: (default if form.get(key) is None else int(str(form.get(key)) == "1"))
            for key, default in SWITCHES.items()
        },
        "share_message": (str(form.get("share_message") or "").strip() or None),
        "notify_to": (str(form.get("notify_to") or "").strip().lower() or None),
    }

    raw = str(form.get("accents") or "").strip()
    if not raw:
        return {**rest, "accents": None}
    try:
        values = json.loads(raw)
    except ValueError as e:
        raise HTTPException(422, "Colours must be a JSON array") from e
    if not isinstance(values, list):
        raise HTTPException(422, "Colours must be a JSON array")
    if len(values) > MAX_ACCENTS:
        raise HTTPException(422, f"At most {MAX_ACCENTS} colours")
    cleaned = []
    for value in values:
        colour = str(value or "").strip()
        if not colour:
            continue
        if not HEX.match(colour):
            raise HTTPException(422, f"{colour!r} is not a colour like #1E90FF")
        cleaned.append(colour.lower())
    return {**rest, "accents": json.dumps(cleaned) if cleaned else None}


async def store_logo(upload: UploadFile, company_id: int) -> str:
    try:
        name = f"logo-{company_id}.png"
        photos.save_logo(await upload.read(), UPLOADS / name)
    except photos.BadImage as e:
        raise HTTPException(422, str(e)) from e
    return name


async def store_wallpaper(upload: UploadFile, company_id: int) -> str:
    try:
        name = f"wall-{company_id}.jpg"
        photos.save_wallpaper(await upload.read(), UPLOADS / name)
    except photos.BadImage as e:
        raise HTTPException(422, str(e)) from e
    return name


async def store_favicon(upload: UploadFile, company_id: int) -> str:
    try:
        name = f"icon-{company_id}.png"
        photos.save_logo(await upload.read(), UPLOADS / name)
    except photos.BadImage as e:
        raise HTTPException(422, str(e)) from e
    return name


async def store_company_photo(upload: UploadFile, company_id: int) -> str:
    """The stand-in photo, written in both sizes like a contact's own."""
    try:
        display = f"photo-{company_id}.jpg"
        photos.save_pair(
            await upload.read(), UPLOADS / display, UPLOADS / f"photo-{company_id}-s.jpg"
        )
    except photos.BadImage as e:
        raise HTTPException(422, str(e)) from e
    return display


async def apply_pictures(form, company_id: int) -> None:
    """Save or clear the pictures that belong to one company."""
    for field, store, column, filename in (
        ("logo", store_logo, "logo_path", f"logo-{company_id}.png"),
        ("favicon", store_favicon, "favicon_path", f"icon-{company_id}.png"),
        ("photo", store_company_photo, "photo_path", f"photo-{company_id}.jpg"),
        ("wallpaper", store_wallpaper, "wallpaper_path", f"wall-{company_id}.jpg"),
    ):
        upload = form.get(field)
        if isinstance(upload, UploadFile) and upload.filename:
            saved = await store(upload, company_id)
            with connect() as conn:
                conn.execute(
                    f"UPDATE companies SET {column} = ? WHERE id = ?",  # noqa: S608
                    (saved, company_id),
                )
                if field == "photo":
                    conn.execute(
                        "UPDATE companies SET photo_small_path = ? WHERE id = ?",
                        (f"photo-{company_id}-s.jpg", company_id),
                    )
        elif str(form.get(f"remove_{field}") or "") == "1":
            with connect() as conn:
                conn.execute(
                    f"UPDATE companies SET {column} = NULL WHERE id = ?",  # noqa: S608
                    (company_id,),
                )
                if field == "photo":
                    conn.execute(
                        "UPDATE companies SET photo_small_path = NULL WHERE id = ?", (company_id,)
                    )
                    (UPLOADS / f"photo-{company_id}-s.jpg").unlink(missing_ok=True)
            (UPLOADS / filename).unlink(missing_ok=True)


def known_company(company_id: int | None) -> int:
    """Every contact belongs to a company; confirm the one asked for exists."""
    if company_id is None:
        raise HTTPException(422, "Choose a company for this contact")
    with connect() as conn:
        if conn.execute("SELECT 1 FROM companies WHERE id = ?", (company_id,)).fetchone():
            return company_id
    raise HTTPException(404, "Company not found")


@router.post("/login")
async def login(response: Response, request: Request):
    form = await request.form()
    email = str(form.get("email") or "").strip().lower()
    password = str(form.get("password") or "")
    with connect() as conn:
        user = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    # Same message either way: do not reveal which addresses have accounts.
    if user is None or not verify_password(password, user["password_hash"]):
        raise HTTPException(401, "Email or password is wrong")
    if user["disabled"]:
        raise HTTPException(403, "This account is disabled")

    # With two-step on, the password buys a session that can reach the code
    # check and nothing else.
    pending = bool(user["totp_enabled"] and user["totp_secret"])
    token, expires = start_session(user["id"], pending_2fa=pending)
    response.set_cookie(
        SESSION_COOKIE,
        token,
        httponly=True,
        samesite="lax",
        secure=cookie_secure(request),
        expires=expires,
        path="/",
    )
    if pending:
        return {"needs_code": True}
    return {"email": user["email"], "name": user["name"]}


def spend_recovery_code(user_id: int, typed: str) -> bool:
    """Match an unused recovery code and burn it. One use, then it is gone."""
    cleaned = totp.tidy(typed)
    if len(cleaned) < 8:
        return False
    with connect() as conn:
        rows = conn.execute(
            "SELECT id, code_hash FROM recovery_codes WHERE user_id = ? AND used_at IS NULL",
            (user_id,),
        ).fetchall()
        for row in rows:
            if verify_password(cleaned, row["code_hash"]):
                conn.execute(
                    "UPDATE recovery_codes SET used_at = ? WHERE id = ?",
                    (datetime.now(UTC).isoformat(), row["id"]),
                )
                return True
    return False


HalfSignedIn = Annotated[sqlite3.Row, Depends(half_signed_in)]


@router.post("/login/2fa")
async def login_second_step(request: Request, user: HalfSignedIn):
    """The one-time code, or a recovery code, for a half-signed-in session."""
    form = await request.form()
    typed = str(form.get("code") or "")
    ok = totp.verify(user["totp_secret"] or "", typed) or spend_recovery_code(user["id"], typed)
    if not ok:
        raise HTTPException(401, "That code is wrong or has already been used")
    finish_2fa(user["session_token"])
    return {"email": user["email"], "name": user["name"]}


@router.get("/me/2fa")
def read_2fa(user: CurrentUser):
    """Whether two-step is on, and how many recovery codes are left."""
    with connect() as conn:
        left = conn.execute(
            "SELECT COUNT(*) AS n FROM recovery_codes WHERE user_id = ? AND used_at IS NULL",
            (user["id"],),
        ).fetchone()["n"]
    return {"enabled": bool(user["totp_enabled"]), "recovery_left": left}


@router.post("/me/2fa/start")
def start_2fa(user: CurrentUser):
    """Mint a secret and hand back the URL an authenticator app scans.

    Stored unconfirmed: nothing changes about signing in until a code proves
    the app and the server agree.
    """
    if user["totp_enabled"]:
        raise HTTPException(409, "Two-step is already on")
    secret = totp.new_secret()
    with connect() as conn:
        conn.execute("UPDATE users SET totp_secret = ? WHERE id = ?", (secret, user["id"]))
    return {"secret": secret, "uri": totp.uri(secret, user["email"])}


@router.get("/me/2fa/qr.png")
def qr_2fa(user: CurrentUser):
    """The pending secret as a QR code, for scanning rather than typing."""
    if not user["totp_secret"] or user["totp_enabled"]:
        raise HTTPException(404, "Nothing to scan")
    return Response(
        qr.png_bytes(totp.uri(user["totp_secret"], user["email"]), scale=8),
        media_type="image/png",
    )


@router.post("/me/2fa/confirm")
async def confirm_2fa(request: Request, user: CurrentUser):
    """Turn two-step on, and hand over the recovery codes once."""
    form = await request.form()
    if not user["totp_secret"]:
        raise HTTPException(409, "Start two-step first")
    if not totp.verify(user["totp_secret"], str(form.get("code") or "")):
        raise HTTPException(422, "That code does not match. Check the clock on your phone.")

    codes = totp.new_recovery_codes()
    with connect() as conn:
        conn.execute("UPDATE users SET totp_enabled = 1 WHERE id = ?", (user["id"],))
        conn.execute("DELETE FROM recovery_codes WHERE user_id = ?", (user["id"],))
        conn.executemany(
            "INSERT INTO recovery_codes (user_id, code_hash) VALUES (?, ?)",
            [(user["id"], hash_password(totp.tidy(code))) for code in codes],
        )
        # Other devices signed in before two-step existed stay signed in; this
        # session is the one that just proved itself.
    return {"enabled": True, "recovery_codes": codes}


@router.post("/me/2fa/recovery")
async def new_recovery(request: Request, user: CurrentUser):
    """Replace the recovery codes. The old ones stop working at once."""
    form = await request.form()
    if not user["totp_enabled"]:
        raise HTTPException(409, "Two-step is not on")
    if not verify_password(str(form.get("password") or ""), user["password_hash"]):
        raise HTTPException(403, "Your password is wrong")
    codes = totp.new_recovery_codes()
    with connect() as conn:
        conn.execute("DELETE FROM recovery_codes WHERE user_id = ?", (user["id"],))
        conn.executemany(
            "INSERT INTO recovery_codes (user_id, code_hash) VALUES (?, ?)",
            [(user["id"], hash_password(totp.tidy(code))) for code in codes],
        )
    return {"recovery_codes": codes}


@router.post("/me/2fa/off")
async def stop_2fa(request: Request, user: CurrentUser):
    """Switch two-step off. Needs the password, so a borrowed screen cannot."""
    form = await request.form()
    if not verify_password(str(form.get("password") or ""), user["password_hash"]):
        raise HTTPException(403, "Your password is wrong")
    with connect() as conn:
        conn.execute(
            "UPDATE users SET totp_enabled = 0, totp_secret = NULL WHERE id = ?", (user["id"],)
        )
        conn.execute("DELETE FROM recovery_codes WHERE user_id = ?", (user["id"],))
    return {"enabled": False}


FORGOT_MINUTES = 30
FORGOT_DIGITS = 6
MAX_LIVE_FORGOT = 3


@router.post("/forgot")
async def forgot_password(request: Request):
    """Email a one-time code to an administrator who cannot get in.

    Answers the same way whoever asks, so the form cannot be used to find out
    which identifiers have accounts. A username that is not an email address
    has nowhere to send to — those accounts are recovered by another admin.
    """
    form = await request.form()
    identifier = str(form.get("email") or "").strip().lower()
    quiet = {"ok": True}
    if "@" not in identifier:
        return quiet

    with connect() as conn:
        user = conn.execute(
            "SELECT id, email, name, disabled FROM users WHERE lower(email) = ?", (identifier,)
        ).fetchone()
    if user is None or user["disabled"]:
        return quiet

    now = datetime.now(UTC)
    with connect() as conn:
        live = conn.execute(
            "SELECT COUNT(*) AS n FROM user_codes WHERE user_id = ? AND used = 0 "
            "AND expires_at > ?",
            (user["id"], now.isoformat()),
        ).fetchone()["n"]
        if live >= MAX_LIVE_FORGOT:
            return quiet
        code = f"{secrets.randbelow(10**FORGOT_DIGITS):0{FORGOT_DIGITS}d}"
        conn.execute(
            "INSERT INTO user_codes (user_id, code_hash, expires_at, created_at) "
            "VALUES (?, ?, ?, ?)",
            (
                user["id"],
                hashlib.sha256(code.encode()).hexdigest(),
                (now + timedelta(minutes=FORGOT_MINUTES)).isoformat(),
                now.isoformat(),
            ),
        )

    with contextlib.suppress(mailer.MailError):
        mailer.send(
            user["email"],
            user["name"] or "",
            "Your code for the contact cards admin",
            f'<p style="font:400 15px Segoe UI,Arial,sans-serif">Here is your code. It lasts '
            f"{FORGOT_MINUTES} minutes and works once.</p>"
            f'<p style="font:700 26px Segoe UI,Arial,sans-serif;letter-spacing:6px">{code}</p>'
            '<p style="font:400 13px Segoe UI,Arial,sans-serif;color:#5a686c">If this was not '
            "you, nothing has changed: the code alone cannot sign anyone in.</p>",
            f"Your code is {code}. It lasts {FORGOT_MINUTES} minutes and works once.",
        )
    return quiet


@router.post("/reset")
async def reset_with_code(request: Request):
    """Set a new password with a code from the email above."""
    form = await request.form()
    identifier = str(form.get("email") or "").strip().lower()
    code = re.sub(r"\D", "", str(form.get("code") or ""))
    new_password = str(form.get("new_password") or "")
    if len(new_password) < 10:
        raise HTTPException(422, "The new password must be at least 10 characters")

    wrong = HTTPException(422, "That code is wrong or has expired")
    with connect() as conn:
        user = conn.execute(
            "SELECT id FROM users WHERE lower(email) = ? AND disabled = 0", (identifier,)
        ).fetchone()
        if user is None:
            raise wrong
        now = datetime.now(UTC).isoformat()
        rows = conn.execute(
            "SELECT id, code_hash FROM user_codes WHERE user_id = ? AND used = 0 "
            "AND expires_at > ?",
            (user["id"], now),
        ).fetchall()
        wanted = hashlib.sha256(code.encode()).hexdigest()
        match = next((r for r in rows if hmac.compare_digest(r["code_hash"], wanted)), None)
        if match is None:
            raise wrong
        conn.execute("UPDATE user_codes SET used = 1 WHERE id = ?", (match["id"],))
        conn.execute(
            "UPDATE users SET password_hash = ? WHERE id = ?",
            (hash_password(new_password), user["id"]),
        )
        # Whoever held the old password loses every session with it.
        conn.execute("DELETE FROM sessions WHERE user_id = ?", (user["id"],))
    return {"ok": True}


@router.post("/logout")
def logout(response: Response, user: CurrentUser):
    end_session(user["session_token"])
    response.delete_cookie(SESSION_COOKIE, path="/")
    return {"ok": True}


@router.get("/me")
def me(user: CurrentUser):
    photo = user["photo_path"]
    return {
        "email": user["email"], "name": user["name"],
        "photo_url": f"/api/admin/me/photo?v={photo}" if photo else None,
    }


@router.get("/me/photo")
def profile_photo(user: CurrentUser):
    photo = user["photo_path"]
    if not photo or not (UPLOADS / photo).is_file():
        raise HTTPException(404, "No profile photo")
    return FileResponse(
        UPLOADS / photo, media_type="image/png",
        headers={"Cache-Control": "private, no-store"},
    )


@router.put("/me/photo")
async def upload_profile_photo(request: Request, user: CurrentUser):
    form = await request.form()
    upload = form.get("photo")
    if not isinstance(upload, UploadFile) or not upload.filename:
        raise HTTPException(422, "Choose a profile photo")
    raw = await upload.read(photos.MAX_UPLOAD_BYTES + 1)
    name = f"admin-{user['id']}-{secrets.token_hex(8)}.png"
    path = UPLOADS / name
    try:
        photos.save_logo(raw, path)
    except photos.BadImage as e:
        raise HTTPException(422, str(e)) from e
    try:
        with connect() as conn:
            previous = conn.execute(
                "SELECT photo_path FROM users WHERE id = ?", (user["id"],),
            ).fetchone()["photo_path"]
            conn.execute("UPDATE users SET photo_path = ? WHERE id = ?", (name, user["id"]))
    except Exception:
        path.unlink(missing_ok=True)
        raise
    if previous:
        with contextlib.suppress(OSError):
            (UPLOADS / previous).unlink(missing_ok=True)
    return {"photo_url": f"/api/admin/me/photo?v={name}"}


@router.patch("/me")
async def update_me(request: Request, user: CurrentUser):
    """Change your own details. A password change needs the current one."""
    form = await request.form()
    name = str(form.get("name") or "").strip() or None
    identifier = str(form.get("email") or "").strip().lower() or user["email"]
    new_password = str(form.get("new_password") or "")

    if not valid_identifier(identifier):
        raise HTTPException(422, "Username must be 3+ characters with no spaces")

    if new_password:
        current = str(form.get("current_password") or "")
        if not verify_password(current, user["password_hash"]):
            raise HTTPException(403, "Your current password is wrong")
        if len(new_password) < 10:
            raise HTTPException(422, "The new password must be at least 10 characters")

    with connect() as conn:
        try:
            conn.execute(
                "UPDATE users SET name = ?, email = ? WHERE id = ?",
                (name, identifier, user["id"]),
            )
        except sqlite3.IntegrityError as e:
            raise HTTPException(409, "That username is already taken") from e
        if new_password:
            conn.execute(
                "UPDATE users SET password_hash = ? WHERE id = ?",
                (hash_password(new_password), user["id"]),
            )
            # Changing a password signs out everywhere else, which is the
            # point of changing it if you think someone else had it.
            conn.execute(
                "DELETE FROM sessions WHERE user_id = ? AND token != ?",
                (user["id"], user["session_token"]),
            )
    return {"email": identifier, "name": name, "password_changed": bool(new_password)}


@router.get("/geocode")
def lookup_address(q: str, user: CurrentUser, country: str | None = None):
    """Address suggestions for the admin forms.

    Behind the session on purpose: an open proxy to someone else's free
    geocoder would be rude at best. An empty list is a normal answer, and the
    form stays typeable when it comes back empty.
    """
    return {"results": list(geocode.search(q, country or None))}


@router.get("/companies")
def list_companies(user: CurrentUser):
    with connect() as conn:
        rows = conn.execute(
            "SELECT co.*, (SELECT COUNT(*) FROM contacts c WHERE c.company_id = co.id) "
            "AS contact_count FROM companies co ORDER BY co.name, co.branch"
        ).fetchall()
    return [{**dict(r), "accents": as_palette(r["accents"])} for r in rows]


@router.post("/companies", status_code=201)
async def create_company(request: Request, user: CurrentUser):
    form = await request.form()
    name = str(form.get("name") or "").strip()
    branch = str(form.get("branch") or "").strip()
    if not name:
        raise HTTPException(422, "Name is required")
    details = {c: (str(form.get(c) or "").strip() or None) for c in COMPANY_DETAILS}
    brand = branding(form)
    cols = ", ".join(COMPANY_DETAILS)
    marks = ", ".join(["?"] * len(COMPANY_DETAILS))
    brand_cols = ", ".join(BRAND_COLUMNS)
    brand_marks = ", ".join(["?"] * len(BRAND_COLUMNS))
    with connect() as conn:
        try:
            cur = conn.execute(
                f"INSERT INTO companies (name, branch, slug, {brand_cols}, "  # noqa: S608
                f"created_at, {cols}) "
                f"VALUES (?, ?, ?, {brand_marks}, ?, {marks})",  # columns are fixed tuples
                (name, branch, slugify(name, branch),
                 *(brand[c] for c in BRAND_COLUMNS),
                 datetime.now(UTC).isoformat(), *(details[c] for c in COMPANY_DETAILS)),
            )
        except sqlite3.IntegrityError as e:
            raise HTTPException(409, "That company already has a branch with this name") from e

    await apply_pictures(form, cur.lastrowid)
    return {"id": cur.lastrowid, "name": name, "branch": branch}


def as_palette(raw: str | None) -> list[str]:
    try:
        values = json.loads(raw or "[]")
    except ValueError:
        return []
    return [v for v in values if isinstance(v, str)]


@router.get("/companies/{company_id}")
def read_company(company_id: int, user: CurrentUser):
    with connect() as conn:
        row = conn.execute("SELECT * FROM companies WHERE id = ?", (company_id,)).fetchone()
    if row is None:
        raise HTTPException(404, "Company not found")
    out = dict(row)
    out["accents"] = as_palette(row["accents"])
    return out


@router.get("/companies/{company_id}/logo.png")
def company_logo(company_id: int, user: CurrentUser):
    """Preview the logo in the admin, before any contact exists to show it."""
    with connect() as conn:
        row = conn.execute(
            "SELECT logo_path FROM companies WHERE id = ?", (company_id,)
        ).fetchone()
    if row is None or not row["logo_path"]:
        raise HTTPException(404, "No logo")
    path = UPLOADS / row["logo_path"]
    if not path.exists():
        raise HTTPException(404, "No logo")
    return FileResponse(path, media_type="image/png")


@router.get("/companies/{company_id}/favicon.png")
def company_favicon(company_id: int, user: CurrentUser):
    """Preview the browser icon in the admin."""
    with connect() as conn:
        row = conn.execute(
            "SELECT favicon_path FROM companies WHERE id = ?", (company_id,)
        ).fetchone()
    if row is None or not row["favicon_path"]:
        raise HTTPException(404, "No favicon")
    path = UPLOADS / row["favicon_path"]
    if not path.exists():
        raise HTTPException(404, "No favicon")
    return FileResponse(path, media_type="image/png")


@router.get("/companies/{company_id}/photo.jpg")
def company_photo(company_id: int, user: CurrentUser):
    """Preview the stand-in photo in the admin."""
    with connect() as conn:
        row = conn.execute(
            "SELECT photo_path FROM companies WHERE id = ?", (company_id,)
        ).fetchone()
    if row is None or not row["photo_path"]:
        raise HTTPException(404, "No photo")
    path = UPLOADS / row["photo_path"]
    if not path.exists():
        raise HTTPException(404, "No photo")
    return FileResponse(path, media_type="image/jpeg")


@router.get("/companies/{company_id}/wallpaper.jpg")
def company_wallpaper(company_id: int, user: CurrentUser):
    """Preview the background picture in the admin."""
    with connect() as conn:
        row = conn.execute(
            "SELECT wallpaper_path FROM companies WHERE id = ?", (company_id,)
        ).fetchone()
    if row is None or not row["wallpaper_path"]:
        raise HTTPException(404, "No wallpaper")
    path = UPLOADS / row["wallpaper_path"]
    if not path.exists():
        raise HTTPException(404, "No wallpaper")
    return FileResponse(path, media_type="image/jpeg")


@router.patch("/companies/{company_id}")
async def update_company(company_id: int, request: Request, user: CurrentUser):
    """Edit a company's own details.

    Changing these does not touch contacts that already exist: their fields
    were copied at creation and may have been edited since.
    """
    form = await request.form()
    name = str(form.get("name") or "").strip()
    branch = str(form.get("branch") or "").strip()
    if not name:
        raise HTTPException(422, "Name is required")
    details = {c: (str(form.get(c) or "").strip() or None) for c in COMPANY_DETAILS}
    brand = branding(form)
    sets = ", ".join(f"{c} = ?" for c in COMPANY_DETAILS)
    brand_sets = ", ".join(f"{c} = ?" for c in BRAND_COLUMNS)
    with connect() as conn:
        if not conn.execute("SELECT 1 FROM companies WHERE id = ?", (company_id,)).fetchone():
            raise HTTPException(404, "Company not found")
        try:
            conn.execute(
                f"UPDATE companies SET name = ?, branch = ?, slug = ?, updated_at = ?, "  # noqa: S608
                f"{brand_sets}, {sets} WHERE id = ?",
                (name, branch, slugify(name, branch), datetime.now(UTC).isoformat(),
                 *(brand[c] for c in BRAND_COLUMNS),
                 *(details[c] for c in COMPANY_DETAILS), company_id),
            )
        except sqlite3.IntegrityError as e:
            raise HTTPException(409, "That company already has a branch with this name") from e

    await apply_pictures(form, company_id)
    return {"id": company_id, "name": name, "branch": branch}


def touch_company(company_id: int) -> None:
    """Mark a company as edited now."""
    with connect() as conn:
        conn.execute(
            "UPDATE companies SET updated_at = ? WHERE id = ?",
            (datetime.now(UTC).isoformat(), company_id),
        )


@router.delete("/companies/{company_id}")
async def delete_company(company_id: int, request: Request, user: CurrentUser):
    """Delete a company, its people and their cards.

    Guarded by the admin's own password: this is unrecoverable, it takes every
    contact in the company with it, and every share link already handed out
    stops working.
    """
    form = await request.form()
    if not verify_password(str(form.get("password") or ""), user["password_hash"]):
        raise HTTPException(403, "Your password is wrong")

    with connect() as conn:
        company = conn.execute(
            "SELECT name, branch FROM companies WHERE id = ?", (company_id,)
        ).fetchone()
        if company is None:
            raise HTTPException(404, "Company not found")
        # Collect the photos first: the row cascade would orphan these files.
        photos_to_remove = [
            name
            for row in conn.execute(
                "SELECT photo_path, photo_small_path FROM contacts WHERE company_id = ?",
                (company_id,),
            )
            for name in (row["photo_path"], row["photo_small_path"])
            if name
        ]
        photos_to_remove += [
            row["path"]
            for row in conn.execute(
                "SELECT path FROM company_media WHERE company_id = ? AND path IS NOT NULL",
                (company_id,),
            )
        ]
        removed = conn.execute(
            "SELECT COUNT(*) AS n FROM contacts WHERE company_id = ?", (company_id,)
        ).fetchone()["n"]
        # contacts and contact_fields go with it via ON DELETE CASCADE
        conn.execute("DELETE FROM companies WHERE id = ?", (company_id,))

    for name in photos_to_remove:
        (UPLOADS / name).unlink(missing_ok=True)
    (UPLOADS / f"logo-{company_id}.png").unlink(missing_ok=True)
    (UPLOADS / f"wall-{company_id}.jpg").unlink(missing_ok=True)

    return {"id": company_id, "name": company["name"], "contacts_deleted": removed}


# --- the company showcase: pictures and videos shown on every card it owns ---


def media_row(row) -> dict:
    out = {
        "id": row["id"],
        "kind": row["kind"],
        "caption": row["caption"],
        "url": row["url"],
        "position": row["position"],
    }
    out["image_url"] = f"/api/admin/media/{row['id']}/image.jpg" if row["path"] else None
    return out


def media_list(company_id: int) -> list[dict]:
    with connect() as conn:
        rows = conn.execute(
            "SELECT * FROM company_media WHERE company_id = ? ORDER BY position, id",
            (company_id,),
        ).fetchall()
    return [media_row(r) for r in rows]


@router.get("/companies/{company_id}/media")
def read_media(company_id: int, user: CurrentUser):
    return media_list(company_id)


@router.post("/companies/{company_id}/media", status_code=201)
async def add_media(company_id: int, request: Request, user: CurrentUser):
    """Add one picture (uploaded) or one video (a link) to the showcase."""
    with connect() as conn:
        if not conn.execute("SELECT 1 FROM companies WHERE id = ?", (company_id,)).fetchone():
            raise HTTPException(404, "Company not found")
    form = await request.form()
    kind = str(form.get("kind") or "").strip()
    if kind not in ("image", "video"):
        raise HTTPException(422, "Choose a picture or a video")
    caption = str(form.get("caption") or "").strip() or None
    url = str(form.get("url") or "").strip() or None

    if kind == "video":
        if not url:
            raise HTTPException(422, "A video needs a link")
        if not url.lower().startswith(("http://", "https://")):
            url = f"https://{url}"
        path = None
    else:
        upload = form.get("file")
        if not (isinstance(upload, UploadFile) and upload.filename):
            raise HTTPException(422, "Choose a picture to upload")
        with connect() as conn:
            cur = conn.execute(
                "INSERT INTO company_media (company_id, kind, caption, url, position) "
                "VALUES (?, 'image', ?, NULL, "
                "(SELECT COALESCE(MAX(position), -1) + 1 FROM company_media WHERE company_id = ?))",
                (company_id, caption, company_id),
            )
            media_id = cur.lastrowid
        path = f"media-{media_id}.jpg"
        try:
            photos.save_media(await upload.read(), UPLOADS / path)
        except photos.BadImage as e:
            with connect() as conn:
                conn.execute("DELETE FROM company_media WHERE id = ?", (media_id,))
            raise HTTPException(422, str(e)) from e
        with connect() as conn:
            conn.execute("UPDATE company_media SET path = ? WHERE id = ?", (path, media_id))
        return {"id": media_id}

    with connect() as conn:
        cur = conn.execute(
            "INSERT INTO company_media (company_id, kind, caption, url, path, position) "
            "VALUES (?, ?, ?, ?, NULL, "
            "(SELECT COALESCE(MAX(position), -1) + 1 FROM company_media WHERE company_id = ?))",
            (company_id, kind, caption, url, company_id),
        )
    return {"id": cur.lastrowid}


@router.get("/media/{media_id}/image.jpg")
def media_image(media_id: int, user: CurrentUser):
    with connect() as conn:
        row = conn.execute(
            "SELECT path FROM company_media WHERE id = ?", (media_id,)
        ).fetchone()
    if row is None or not row["path"] or not (UPLOADS / row["path"]).exists():
        raise HTTPException(404, "No picture")
    return FileResponse(UPLOADS / row["path"], media_type="image/jpeg")


@router.delete("/media/{media_id}")
def delete_media(media_id: int, user: CurrentUser):
    with connect() as conn:
        row = conn.execute(
            "SELECT path FROM company_media WHERE id = ?", (media_id,)
        ).fetchone()
        if row is None:
            raise HTTPException(404, "Not found")
        conn.execute("DELETE FROM company_media WHERE id = ?", (media_id,))
    if row["path"]:
        (UPLOADS / row["path"]).unlink(missing_ok=True)
    return {"id": media_id}


@router.get("/users")
def list_users(user: CurrentUser):
    with connect() as conn:
        rows = conn.execute(
            "SELECT id, email, name, disabled, created_at FROM users ORDER BY email"
        ).fetchall()
    return [{**dict(r), "disabled": bool(r["disabled"])} for r in rows]


@router.post("/users", status_code=201)
async def create_user(request: Request, user: CurrentUser):
    form = await request.form()
    email = str(form.get("email") or "").strip().lower()
    password = str(form.get("password") or "")
    if not valid_identifier(email):
        raise HTTPException(422, "Username must be 3+ characters with no spaces")
    if len(password) < 10:
        raise HTTPException(422, "Password must be at least 10 characters")

    with connect() as conn:
        try:
            cur = conn.execute(
                "INSERT INTO users (email, password_hash, name, created_at) VALUES (?, ?, ?, ?)",
                (
                    email,
                    hash_password(password),
                    str(form.get("name") or "").strip() or None,
                    datetime.now(UTC).isoformat(),
                ),
            )
        except sqlite3.IntegrityError as e:
            raise HTTPException(409, "That username already has an account") from e
    notify(
        "notify_admin_added",
        "A new administrator",
        [
            f"{email} can now sign in to the card admin.",
            f"Added by {user['name'] or user['email']}. Every admin spans every company.",
        ],
    )
    return {"id": cur.lastrowid, "email": email}


@router.post("/users/{user_id}/password")
async def reset_user_password(user_id: int, request: Request, user: CurrentUser):
    """Reset another admin's password.

    Super admins can reset each other, so any one of them can recover an
    account whose owner is locked out. The flip side, accepted deliberately:
    a compromised super admin can take over every other account.
    """
    form = await request.form()
    new_password = str(form.get("new_password") or "")
    if len(new_password) < 10:
        raise HTTPException(422, "The new password must be at least 10 characters")

    with connect() as conn:
        target = conn.execute("SELECT id, email FROM users WHERE id = ?", (user_id,)).fetchone()
        if target is None:
            raise HTTPException(404, "User not found")
        conn.execute(
            "UPDATE users SET password_hash = ? WHERE id = ?",
            (hash_password(new_password), user_id),
        )
        # Sign that account out everywhere; whoever had the old password loses it.
        conn.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
    return {"id": user_id, "email": target["email"]}


def enabled_admin_count(conn, excluding: int | None = None) -> int:
    if excluding is None:
        return conn.execute("SELECT COUNT(*) AS n FROM users WHERE disabled = 0").fetchone()["n"]
    return conn.execute(
        "SELECT COUNT(*) AS n FROM users WHERE disabled = 0 AND id != ?", (excluding,)
    ).fetchone()["n"]


@router.patch("/users/{user_id}")
async def update_user(user_id: int, request: Request, user: CurrentUser):
    """Rename an admin, or disable one.

    Two refusals, both about not locking everybody out: you cannot disable
    yourself by accident, and the last enabled admin cannot be disabled at
    all. Without those the only way back in is the bootstrap command.
    """
    form = await request.form()
    with connect() as conn:
        target = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        if target is None:
            raise HTTPException(404, "User not found")

        identifier = str(form.get("email") or "").strip().lower() or target["email"]
        if not valid_identifier(identifier):
            raise HTTPException(422, "Username must be 3+ characters with no spaces")
        name = str(form.get("name") or "").strip() or None

        raw_disabled = form.get("disabled")
        disabled = target["disabled"] if raw_disabled is None else int(str(raw_disabled) == "1")
        if disabled and not target["disabled"]:
            if user_id == user["id"]:
                raise HTTPException(409, "You cannot disable your own account")
            if enabled_admin_count(conn, excluding=user_id) == 0:
                raise HTTPException(409, "At least one administrator must stay enabled")

        try:
            conn.execute(
                "UPDATE users SET email = ?, name = ?, disabled = ? WHERE id = ?",
                (identifier, name, disabled, user_id),
            )
        except sqlite3.IntegrityError as e:
            raise HTTPException(409, "That username is already taken") from e

        if disabled:
            conn.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
    return {"id": user_id, "email": identifier, "name": name, "disabled": bool(disabled)}


@router.delete("/users/{user_id}", status_code=204)
async def delete_user(user_id: int, request: Request, user: CurrentUser):
    """Remove an admin account. Needs your own password; cannot be yourself."""
    form = await request.form()
    if not verify_password(str(form.get("password") or ""), user["password_hash"]):
        raise HTTPException(403, "Your password is wrong")
    if user_id == user["id"]:
        raise HTTPException(409, "You cannot delete your own account")

    with connect() as conn:
        target = conn.execute("SELECT id FROM users WHERE id = ?", (user_id,)).fetchone()
        if target is None:
            raise HTTPException(404, "User not found")
        if enabled_admin_count(conn, excluding=user_id) == 0:
            raise HTTPException(409, "At least one administrator must remain")
        conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
    return Response(status_code=204)


@router.get("/settings")
def read_settings(user: CurrentUser):
    return {
        **app_settings.public(),
        "providers": sorted(geocode.PROVIDERS),
        "languages": list(LANGUAGES),
    }


@router.patch("/settings")
async def write_settings(request: Request, user: CurrentUser):
    """Change settings. An empty API key field leaves the stored one alone."""
    form = await request.form()

    provider = str(form.get("geocoder") or "").strip().lower()
    if provider:
        if provider not in geocode.PROVIDERS:
            raise HTTPException(422, f"Unknown address lookup provider: {provider!r}")
        app_settings.put("geocoder", provider)

    theme = str(form.get("default_theme") or "").strip()
    if theme:
        if theme not in THEMES:
            raise HTTPException(422, f"Unknown background template: {theme!r}")
        app_settings.put("default_theme", theme)

    base = str(form.get("public_base_url") or "").strip().rstrip("/")
    if base:
        if not base.startswith(("http://", "https://")):
            raise HTTPException(422, "The share link address must start with http:// or https://")
        app_settings.put("public_base_url", base)

    # Blank means "leave it as it is"; clearing needs the explicit checkbox.
    key = str(form.get("geocoder_key") or "")
    if str(form.get("clear_geocoder_key") or "") == "1":
        app_settings.put("geocoder_key", "")
    elif key.strip():
        app_settings.put("geocoder_key", key.strip())

    sender = str(form.get("mail_from") or "").strip()
    if sender:
        if "@" not in sender:
            raise HTTPException(422, "The from address must be an email address")
        app_settings.put("mail_from", sender)

    # Empty clears it, so replies go back to the from address again.
    reply_to = str(form.get("mail_reply_to") or "").strip()
    if reply_to and "@" not in reply_to:
        raise HTTPException(422, "The reply-to address must be an email address")
    if "mail_reply_to" in form:
        app_settings.put("mail_reply_to", reply_to)

    sender_name = str(form.get("mail_from_name") or "").strip()
    if sender_name:
        app_settings.put("mail_from_name", sender_name)

    data_centre = str(form.get("zepto_dc") or "").strip()
    if data_centre:
        if data_centre not in mailer.HOSTS:
            raise HTTPException(422, "That is not one of ZeptoMail's addresses")
        app_settings.put("zepto_dc", data_centre)

    token = str(form.get("zepto_token") or "")
    if str(form.get("clear_zepto_token") or "") == "1":
        app_settings.put("zepto_token", "")
    elif token.strip():
        app_settings.put("zepto_token", token.strip())

    notify_to = str(form.get("notify_to") or "").strip()
    if notify_to and "@" not in notify_to:
        raise HTTPException(422, "The notification address must be an email address")
    if "notify_to" in form:
        app_settings.put("notify_to", notify_to)

    # Each switch is posted as "1" or "0"; absent leaves it alone.
    for switch in (
        "notify_card_created",
        "notify_card_updated",
        "notify_admin_added",
        "notify_monthly",
        "require_2fa",
    ):
        if switch in form:
            app_settings.put(switch, "1" if str(form.get(switch)) == "1" else "0")

    hours = str(form.get("session_hours") or "").strip()
    if hours:
        if not hours.isdigit() or not 1 <= int(hours) <= 24 * 90:
            raise HTTPException(422, "A sign-in must last between 1 hour and 90 days")
        app_settings.put("session_hours", hours)

    # A changed provider or key invalidates anything already looked up.
    geocode.search.cache_clear()
    return app_settings.public()


def _export_payload(company_id: int | None) -> dict:
    """The data behind both exports.

    Cards, their fields, their counts and the company's showcase. Pictures are
    files on disk, so only their names appear here; export.zip carries the
    files themselves.
    """
    where = "" if company_id is None else " WHERE co.id = ?"
    args: tuple = () if company_id is None else (company_id,)
    with connect() as conn:
        companies = conn.execute(
            f"SELECT co.* FROM companies co{where} ORDER BY co.name, co.branch",  # noqa: S608
            args,
        ).fetchall()
        out = []
        for co in companies:
            people = []
            for row in conn.execute(
                "SELECT * FROM contacts WHERE company_id = ? ORDER BY id", (co["id"],)
            ):
                fields = [dict(f) for f in field_rows(conn, row["id"])]
                counts = {
                    r["kind"]: r["n"]
                    for r in conn.execute(
                        "SELECT kind, COUNT(*) AS n FROM card_events "
                        "WHERE contact_id = ? GROUP BY kind",
                        (row["id"],),
                    )
                }
                person = {k: row[k] for k in row.keys() if k != "password_hash"}
                people.append({**person, "fields": fields, "counts": counts})
            media = [
                dict(m)
                for m in conn.execute(
                    "SELECT kind, path, url, caption, position FROM company_media "
                    "WHERE company_id = ? ORDER BY position, id",
                    (co["id"],),
                )
            ]
            out.append(
                {
                    **dict(co),
                    "accents": as_palette(co["accents"]),
                    "media": media,
                    "people": people,
                }
            )
    return {"exported_at": datetime.now(UTC).isoformat(), "companies": out}


@router.get("/export.json")
def export_everything(user: CurrentUser, company_id: int | None = None):
    """Everything about one company, or all of them, as one JSON document.

    The data, not the pictures. export.zip carries both.
    """
    return _export_payload(company_id)


# The five company pictures, and the name each takes once imported. Keyed by
# column so one loop can restore them and write the paths back.
COMPANY_PICTURES = (
    ("logo_path", "logo-{id}.png"),
    ("wallpaper_path", "wall-{id}.jpg"),
    ("favicon_path", "icon-{id}.png"),
    ("photo_path", "photo-{id}.jpg"),
    ("photo_small_path", "photo-{id}-s.jpg"),
)


def _picture_names(payload: dict) -> set[str]:
    """Every upload the payload refers to, by file name."""
    names: set[str] = set()
    for co in payload["companies"]:
        for column, _ in COMPANY_PICTURES:
            if co.get(column):
                names.add(str(co[column]))
        for item in co.get("media") or []:
            if item.get("path"):
                names.add(str(item["path"]))
        for person in co["people"]:
            for column in ("photo_path", "photo_small_path"):
                if person.get(column):
                    names.add(str(person[column]))
    return names


@router.get("/export.zip")
def export_zip(user: CurrentUser, company_id: int | None = None):
    """The data and the pictures together, to carry to another installation."""
    payload = _export_payload(company_id)
    if not payload["companies"]:
        raise HTTPException(404, "Nothing to export")
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("company.json", json.dumps(payload, indent=2, ensure_ascii=False))
        for name in sorted(_picture_names(payload)):
            path = UPLOADS / name
            # A row can still name a file that has gone from disk. Leaving it
            # out beats refusing to export; the import treats a picture that is
            # missing from the zip the same as a card that never had one.
            if path.is_file():
                archive.write(path, f"files/{name}")
    stem = slugify(str(payload["companies"][0]["name"])) if company_id else "all-companies"
    return Response(
        buf.getvalue(),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{stem}.zip"'},
    )


def _unique_name(conn: sqlite3.Connection, name: str, branch: str) -> str:
    """No two companies may share a name and a branch.

    Importing into the installation the export came from is a deliberate copy
    — duplicating a company to use as a template — so it is marked as one
    rather than refused. Importing somewhere else, which is the usual reason,
    finds nothing in the way and keeps the name exactly.
    """

    def taken(candidate: str) -> bool:
        return (
            conn.execute(
                "SELECT 1 FROM companies WHERE name = ? AND branch = ?", (candidate, branch)
            ).fetchone()
            is not None
        )

    if not taken(name):
        return name
    candidate, n = f"{name} (copy)", 2
    while taken(candidate):
        candidate, n = f"{name} (copy {n})", n + 1
    return candidate


def _unique_slug(conn: sqlite3.Connection, base: str) -> str:
    slug, n = base, 2
    while conn.execute("SELECT 1 FROM companies WHERE slug = ?", (slug,)).fetchone():
        slug, n = f"{base}-{n}", n + 1
    return slug


def _restore(archive: zipfile.ZipFile, stored: object, target: str) -> str | None:
    """Copy one picture out of the zip under the name this install uses.

    Only the base name of the stored path is honoured. A zip is supplied by
    whoever is uploading it, and a member named ../../something must never be
    able to write outside the uploads directory.
    """
    if not stored:
        return None
    try:
        data = archive.read(f"files/{Path(str(stored)).name}")
    except KeyError:
        return None  # named in the data, absent from the zip
    (UPLOADS / target).write_bytes(data)
    return target


def _import_company(co: dict, archive: zipfile.ZipFile) -> dict:
    """One company out of an export, created fresh."""
    with connect() as conn:
        branch = str(co.get("branch") or "")
        co = {**co, "name": _unique_name(conn, str(co.get("name") or "Company"), branch)}
        columns = [r[1] for r in conn.execute("PRAGMA table_info(companies)")]
        # created_at is set below: the copy is made now, whatever the original
        # was. slug is minted, and the pictures are written after the row is.
        skip = {"id", "slug", "created_at", "updated_at", *(c for c, _ in COMPANY_PICTURES)}
        carried: list[str] = []
        values: list[object] = []
        for column in columns:
            if column in skip:
                continue
            value = co.get(column)
            if column == "accents":
                kept = [v for v in (value or []) if isinstance(v, str)]
                value = json.dumps(kept) if kept else None
            # A column the export did not carry is left out of the INSERT so
            # this schema's own default applies. Writing None instead fails
            # every NOT NULL column that has one, which is most of the
            # switches and branch.
            if value is None:
                continue
            carried.append(column)
            values.append(value)

        slug = _unique_slug(conn, slugify(str(co["name"]), branch))
        now = datetime.now(UTC).isoformat()
        marks = ", ".join(["?"] * (len(carried) + 2))
        cur = conn.execute(
            f"INSERT INTO companies (slug, created_at, {', '.join(carried)}) "  # noqa: S608
            f"VALUES ({marks})",
            (slug, now, *values),
        )
        company_id = cur.lastrowid

        for column, pattern in COMPANY_PICTURES:
            written = _restore(archive, co.get(column), pattern.format(id=company_id))
            if written:
                conn.execute(
                    f"UPDATE companies SET {column} = ? WHERE id = ?",  # noqa: S608
                    (written, company_id),
                )

        people = 0
        for person in co.get("people") or []:
            public_id = new_public_id()
            cur = conn.execute(
                "INSERT INTO contacts "
                f"(public_id, company_id, created_at, updated_at, {', '.join(SINGLE)}) "  # noqa: S608
                f"VALUES (?, ?, ?, ?, {', '.join(['?'] * len(SINGLE))})",
                (public_id, company_id, now, now, *(person.get(c) for c in SINGLE)),
            )
            contact_id = cur.lastrowid
            conn.executemany(
                "INSERT INTO contact_fields (contact_id, kind, label, value, position) "
                "VALUES (?, ?, ?, ?, ?)",
                [
                    (
                        contact_id,
                        f.get("kind"),
                        f.get("label"),
                        f.get("value"),
                        f.get("position") or 0,
                    )
                    for f in person.get("fields") or []
                ],
            )
            display = _restore(archive, person.get("photo_path"), f"{public_id}.jpg")
            embed = _restore(archive, person.get("photo_small_path"), f"{public_id}-s.jpg")
            if display or embed:
                conn.execute(
                    "UPDATE contacts SET photo_path = ?, photo_small_path = ? WHERE id = ?",
                    (display, embed, contact_id),
                )
            people += 1

        for item in co.get("media") or []:
            cur = conn.execute(
                "INSERT INTO company_media (company_id, kind, caption, url, position) "
                "VALUES (?, ?, ?, ?, ?)",
                (
                    company_id,
                    item.get("kind") or "image",
                    item.get("caption"),
                    item.get("url"),
                    item.get("position") or 0,
                ),
            )
            written = _restore(archive, item.get("path"), f"media-{cur.lastrowid}.jpg")
            if written:
                conn.execute(
                    "UPDATE company_media SET path = ? WHERE id = ?", (written, cur.lastrowid)
                )
    return {"id": company_id, "slug": slug, "name": co.get("name"), "people": people}


@router.post("/import.zip", status_code=201)
async def import_zip(request: Request, user: CurrentUser):
    """Read companies out of an export and create them afresh.

    Always new. An import never merges into an existing company, because a
    merge has to decide which card is "the same" card, and deciding wrong
    overwrites someone's work with no way back. Slugs and public ids are
    minted here too, so an import cannot take over a URL that is already live.

    Counts are not restored: they are things real people did, and inventing
    them would quietly poison the analytics.
    """
    form = await request.form()
    upload = form.get("file")
    if not isinstance(upload, UploadFile):
        raise HTTPException(422, "Attach the zip as 'file'")
    try:
        archive = zipfile.ZipFile(io.BytesIO(await upload.read()))
    except zipfile.BadZipFile as e:
        raise HTTPException(422, "That is not a zip file") from e
    with archive:
        try:
            payload = json.loads(archive.read("company.json"))
        except KeyError as e:
            raise HTTPException(422, "The zip has no company.json in it") from e
        except ValueError as e:
            raise HTTPException(422, "company.json is not readable JSON") from e
        companies = payload.get("companies")
        if not isinstance(companies, list) or not companies:
            raise HTTPException(422, "company.json names no companies")
        made = [_import_company(co, archive) for co in companies if isinstance(co, dict)]
    return {"companies": made}


@router.get("/backup.db")
def download_backup(user: CurrentUser):
    """A consistent copy of the database, taken with SQLite's own backup API.

    Copying the file by hand while the app is writing can hand back a torn
    database; this cannot.
    """
    # A temp file, deleted once the response is out: a spare copy of every
    # card should not sit next to the app waiting to be deployed with it.
    handle = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    handle.close()
    dest = Path(handle.name)
    with connect() as conn, sqlite3.connect(dest) as copy:
        conn.backup(copy)
    stamp = datetime.now(UTC).strftime("%Y-%m-%d-%H%M")
    return FileResponse(
        dest,
        media_type="application/vnd.sqlite3",
        filename=f"contact-cards-{stamp}.db",
        background=BackgroundTask(dest.unlink, missing_ok=True),
    )


@router.post("/settings/mail-test")
async def test_mail(request: Request, user: CurrentUser):
    """Send one message to prove the ZeptoMail settings work."""
    form = await request.form()
    to = str(form.get("to") or "").strip()
    if "@" not in to:
        raise HTTPException(422, "Give an address to send the test to")
    try:
        mailer.send(
            to,
            "",
            "Test from your contact cards",
            "<p style=\"font:400 15px Segoe UI,Arial,sans-serif\">"
            "Email is working. Sign-in codes and password resets will arrive this way.</p>",
            "Email is working. Sign-in codes and password resets will arrive this way.",
        )
    except mailer.MailError as e:
        raise HTTPException(422, str(e)) from e
    return {"sent_to": to}


@router.get("/settings/geocoder-test")
def test_geocoder(user: CurrentUser, q: str = "Muscat"):
    """Try the configured provider so a key can be checked before relying on it."""
    try:
        results = list(geocode.search(q, None))
    except geocode.GeocoderError as e:
        raise HTTPException(422, str(e)) from e
    return {"provider": geocode._provider_name(), "count": len(results), "results": results[:3]}


@router.get("/dashboard")
def dashboard(user: CurrentUser):
    """Counts per company, plus what changed most recently."""
    with connect() as conn:
        companies = conn.execute(
            "SELECT co.id, co.name, co.branch, co.city, co.country, "
            "(SELECT COUNT(*) FROM contacts c WHERE c.company_id = co.id) AS contact_count "
            "FROM companies co ORDER BY co.name, co.branch"
        ).fetchall()
        totals = conn.execute(
            "SELECT (SELECT COUNT(*) FROM companies) AS companies, "
            "(SELECT COUNT(*) FROM contacts) AS contacts, "
            "(SELECT COUNT(*) FROM users WHERE disabled = 0) AS admins, "
            "(SELECT COUNT(*) FROM card_events WHERE kind = 'view') AS views, "
            "(SELECT COUNT(*) FROM card_events WHERE kind = 'save') AS saves"
        ).fetchone()
        busiest = conn.execute(
            "SELECT c.id, c.first_name, c.last_name, co.name AS company, co.branch, "
            "COUNT(e.id) AS views FROM contacts c "
            "JOIN companies co ON co.id = c.company_id "
            "JOIN card_events e ON e.contact_id = c.id AND e.kind = 'view' "
            "GROUP BY c.id ORDER BY views DESC LIMIT 5"
        ).fetchall()
        recent = conn.execute(
            "SELECT c.id, c.public_id, c.first_name, c.last_name, c.job_title, c.updated_at, "
            "c.photo_path, "
            # an address lives in the fields, not in a column
            "(SELECT value FROM contact_fields f WHERE f.contact_id = c.id "
            " AND f.kind = 'email' ORDER BY f.position, f.id LIMIT 1) AS email, "
            "co.name AS company, co.branch AS branch, co.id AS company_id "
            "FROM contacts c JOIN companies co ON co.id = c.company_id "
            "ORDER BY c.updated_at DESC LIMIT 8"
        ).fetchall()
    return {
        "totals": dict(totals),
        "companies": [dict(r) for r in companies],
        "recent": [
            {
                **{k: r[k] for k in r.keys() if k != "photo_path"},
                "photo_url": (
                    f"/api/public/{r['public_id']}/photo.jpg" if r["photo_path"] else None
                ),
            }
            for r in recent
        ],
        "busiest": [dict(r) for r in busiest],
    }


@router.get("/search")
def search(user: CurrentUser, q: str = ""):
    """One box over companies and people, for the bar at the top of the admin."""
    term = q.strip()
    if len(term) < 2:
        return {"companies": [], "people": []}
    like = f"%{term}%"
    with connect() as conn:
        companies = [
            dict(r)
            for r in conn.execute(
                "SELECT id, name, branch, "
                "(SELECT COUNT(*) FROM contacts c WHERE c.company_id = companies.id) "
                "AS contact_count FROM companies "
                "WHERE name LIKE ? OR branch LIKE ? ORDER BY name, branch LIMIT 6",
                (like, like),
            )
        ]
        people = [
            dict(r)
            for r in conn.execute(
                "SELECT c.id, c.public_id, c.first_name, c.last_name, c.job_title, "
                "co.name AS company, co.branch "
                "FROM contacts c JOIN companies co ON co.id = c.company_id "
                "WHERE c.first_name LIKE ? OR c.last_name LIKE ? OR c.job_title LIKE ? "
                "OR c.org LIKE ? OR c.public_id = ? "
                "ORDER BY c.updated_at DESC LIMIT 8",
                (like, like, like, like, term),
            )
        ]
    return {"companies": companies, "people": people}


def notify(switch: str, subject: str, lines: list[str], company_id: int | None = None) -> None:
    """Tell whoever asked to hear about this, globally and per company.

    Best effort on purpose: a card is still created when the mail server is
    down, and the admin sees the result of the request they actually made.
    """
    if not mailer.configured():
        return

    to: set[str] = set()
    globally = app_settings.get("notify_to").strip()
    if globally and app_settings.flag(switch):
        to.add(globally.lower())

    # A company hears about its own cards, if it named an address and the
    # matching switch is on. Admin-level events have no company to ask.
    column = {"notify_card_created": "notify_created", "notify_card_updated": "notify_updated"}
    if company_id is not None and switch in column:
        with connect() as conn:
            row = conn.execute(
                f"SELECT notify_to, {column[switch]} AS wanted "  # noqa: S608 - fixed map
                "FROM companies WHERE id = ?",
                (company_id,),
            ).fetchone()
        if row and row["notify_to"] and row["wanted"]:
            to.add(row["notify_to"].strip().lower())

    if not to:
        return
    safe = [escape(line) for line in lines]
    body = "".join(f'<p style="font:15px Arial">{line}</p>' for line in safe)
    for address in sorted(to):
        try:
            mailer.send(address, "", subject, body, "\n".join(lines))
        except mailer.MailError:
            pass


def send_report(days: int = 30, company_id: int | None = None) -> str:
    """Build the report for a window and email it. Returns the address."""
    to = app_settings.get("notify_to").strip()
    if not to:
        raise HTTPException(422, "Add a notification address in Settings first")
    data = analytics_window.window(days, company_id=company_id)
    cell = 'style="padding:4px 10px"'
    rows = "".join(
        f"<tr><td {cell}>{escape(analytics_window.WORDS.get(a['kind'], a['kind']))}</td>"
        f"<td {cell} align=\"right\">{a['n']}</td></tr>"
        for a in data["actions"]
    )
    totals = data["totals"]
    html = (
        f'<h2 style="font:700 20px Arial">Cards, {data["from"]} to {data["to"]}</h2>'
        f'<p style="font:15px Arial">{totals["views"]} views from {totals["visitors"]} '
        f"visitors · {totals['clicks']} taps · {totals['saves']} saved · "
        f"{totals['active_cards']} of {totals['cards']} cards had traffic.</p>"
        f'<table style="font:15px Arial;border-collapse:collapse">{rows}</table>'
    )
    text = (
        f"Cards, {data['from']} to {data['to']}: {totals['views']} views, "
        f"{totals['visitors']} visitors, {totals['clicks']} taps, {totals['saves']} saved."
    )
    mailer.send(to, "", f"Card report, {data['from']} to {data['to']}", html, text)
    return to


@router.post("/analytics/email")
def email_analytics(user: CurrentUser, company_id: int | None = None, days: int = 30):
    """Send the current report to the notification address, now.

    The same report the monthly email sends, on demand.
    """
    if days not in analytics_window.DAYS:
        raise HTTPException(422, f"Pick a window of {analytics_window.DAYS} days")
    try:
        to = send_report(days, company_id)
    except mailer.MailError as e:
        raise HTTPException(503, str(e)) from e
    return {"sent_to": to, "days": days}


@router.get("/analytics")
def analytics(
    user: CurrentUser,
    company_id: int | None = None,
    contact_id: int | None = None,
    days: int = 30,
    start: str | None = None,
    end: str | None = None,
    grain: str = "day",
):
    """Views and taps over a window, with the window before it for contrast.

    Either `days` back from today, or `start` and `end` as plain dates.
    """
    first = last = None
    if start or end:
        try:
            first, last = date.fromisoformat(start or ""), date.fromisoformat(end or "")
        except ValueError as e:
            raise HTTPException(422, "Dates look like 2026-10-15") from e
        if last < first:
            raise HTTPException(422, "The end of the range is before its start")
        if (last - first).days > 730:
            raise HTTPException(422, "Two years is the longest range")
    elif days not in analytics_window.DAYS:
        raise HTTPException(422, f"Pick a window of {analytics_window.DAYS} days")
    if grain not in analytics_window.GRAIN_SQL:
        raise HTTPException(422, "Group by day, week or month")
    return analytics_window.window(
        days,
        company_id=company_id,
        contact_id=contact_id,
        first=first,
        last=last,
        grain=grain,
    )


@router.get("/contacts")
def list_contacts(user: CurrentUser, company_id: int | None = None):
    with connect() as conn:
        if company_id is None:
            rows = conn.execute(
                "SELECT c.id, c.public_id, c.first_name, c.last_name, c.job_title, c.org, "
                "c.photo_path, c.updated_at, co.name AS company "
                "FROM contacts c JOIN companies co ON co.id = c.company_id "
                "ORDER BY c.updated_at DESC"
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT c.id, c.public_id, c.first_name, c.last_name, c.job_title, c.org, "
                "c.photo_path, c.updated_at, co.name AS company "
                "FROM contacts c JOIN companies co ON co.id = c.company_id "
                "WHERE c.company_id = ? ORDER BY c.updated_at DESC",
                (company_id,),
            ).fetchall()
    return [
        {**dict(r), "url": f"{public_base_url()}/user/{r['public_id']}", "photo_path": None,
         "photo_url": f"/api/public/{r['public_id']}/photo.jpg" if r["photo_path"] else None}
        for r in rows
    ]


def load_contact(contact_id: int):
    with connect() as conn:
        row = conn.execute("SELECT * FROM contacts WHERE id = ?", (contact_id,)).fetchone()
        if row is None:
            raise HTTPException(404, "Contact not found")
        return row, field_rows(conn, row["id"])


def seed_photo(company_id: int, contact_id: int, public_id: str) -> None:
    """Give a new card the company's default photo as its own.

    Copied rather than pointed at: from this moment it is that person's photo,
    so changing the company's default later leaves existing cards alone — the
    same promise the phone number and address already make.
    """
    with connect() as conn:
        company = conn.execute(
            "SELECT photo_path, photo_small_path FROM companies WHERE id = ?", (company_id,)
        ).fetchone()
    if company is None or not company["photo_path"]:
        return

    pairs = (
        (company["photo_path"], f"{public_id}.jpg"),
        (company["photo_small_path"], f"{public_id}-s.jpg"),
    )
    copied: list[str] = []
    for source, target in pairs:
        if not source or not (UPLOADS / source).exists():
            return
        shutil.copyfile(UPLOADS / source, UPLOADS / target)
        copied.append(target)
    with connect() as conn:
        conn.execute(
            "UPDATE contacts SET photo_path = ?, photo_small_path = ? WHERE id = ?",
            (*copied, contact_id),
        )


async def store_photo(upload: UploadFile, public_id: str) -> tuple[str, str]:
    try:
        display, embed = f"{public_id}.jpg", f"{public_id}-s.jpg"
        photos.save_pair(await upload.read(), UPLOADS / display, UPLOADS / embed)
    except photos.BadImage as e:
        raise HTTPException(422, str(e)) from e
    return display, embed


@router.post("/contacts", status_code=201)
async def add_contact(request: Request, user: CurrentUser):
    form = await request.form()
    raw_company = form.get("company_id")
    company_id = known_company(int(raw_company) if raw_company else None)
    single = read_single(form)
    rows = parse_fields(str(form.get("fields") or "") or None)

    # The admin form pre-fills the company name and the caller may edit or
    # clear it. A caller that never mentions `org` — a script, an import —
    # gets the company's name rather than a card with no company on it. An
    # empty `org` that was posted is left empty: that is someone's decision.
    if "org" not in form:
        with connect() as conn:
            company = conn.execute(
                "SELECT name FROM companies WHERE id = ?", (company_id,)
            ).fetchone()
        if company:
            single["org"] = company["name"]

    contact_id, public_id = create_contact(company_id, single, rows)
    upload = form.get("photo")
    if not (isinstance(upload, UploadFile) and upload.filename):
        # No photo of their own: start them on the company's default, if it
        # has one. They can replace it like any other photo.
        seed_photo(company_id, contact_id, public_id)
    notify(
        "notify_card_created",
        "A new contact card",
        [
            f"{single.get('first_name') or ''} {single.get('last_name') or ''}".strip()
            + f" now has a card ({public_base_url()}/user/{public_id}).",
            f"Added by {user['name'] or user['email']}.",
        ],
        company_id=company_id,
    )
    upload = form.get("photo")
    if isinstance(upload, UploadFile) and upload.filename:
        display, embed = await store_photo(upload, public_id)
        with connect() as conn:
            conn.execute(
                "UPDATE contacts SET photo_path = ?, photo_small_path = ? WHERE id = ?",
                (display, embed, contact_id),
            )
    return {
        "id": contact_id,
        "public_id": public_id,
        "url": f"{public_base_url()}/user/{public_id}",
    }


@router.get("/contacts/{contact_id}")
def read_contact(contact_id: int, user: CurrentUser):
    row, fields = load_contact(contact_id)
    out = serialise(row, fields)
    out["id"] = row["id"]
    out["company_id"] = row["company_id"]
    out["photo_url"] = f"/api/public/{row['public_id']}/photo.jpg" if row["photo_path"] else None
    out["url"] = f"{public_base_url()}/user/{row['public_id']}"
    out["login_email"] = row["login_email"]
    out["portal_disabled"] = bool(row["portal_disabled"])
    out["has_password"] = bool(row["password_hash"])
    return out


@router.get("/contacts/{contact_id}/stats")
def contact_stats(contact_id: int, user: CurrentUser):
    """How often this card has been opened, saved and shared.

    Counted from card_events, which the public card writes. No IP address is
    kept, so there is no location here — only what happened and when.
    """
    load_contact(contact_id)
    with connect() as conn:
        by_kind = {
            r["kind"]: r["n"]
            for r in conn.execute(
                "SELECT kind, COUNT(*) AS n FROM card_events WHERE contact_id = ? GROUP BY kind",
                (contact_id,),
            )
        }
        days = [
            dict(r)
            for r in conn.execute(
                "SELECT substr(at, 1, 10) AS day, COUNT(*) AS n FROM card_events "
                "WHERE contact_id = ? AND kind = 'view' AND at >= date('now', '-29 days') "
                "GROUP BY day ORDER BY day",
                (contact_id,),
            )
        ]
        sources = [
            dict(r)
            for r in conn.execute(
                "SELECT COALESCE(source, 'direct link') AS source, COUNT(*) AS n "
                "FROM card_events WHERE contact_id = ? AND kind = 'view' "
                "GROUP BY source ORDER BY n DESC LIMIT 8",
                (contact_id,),
            )
        ]
        last = conn.execute(
            "SELECT MAX(at) AS at FROM card_events WHERE contact_id = ?", (contact_id,)
        ).fetchone()["at"]
    return {"by_kind": by_kind, "days": days, "sources": sources, "last_seen": last}


@router.post("/contacts/{contact_id}/portal")
async def set_portal_login(contact_id: int, request: Request, user: CurrentUser):
    """Give a card holder their own sign-in, or switch it off.

    Accounts are issued here and only here: there is no self-registration.
    """
    row, _ = load_contact(contact_id)
    form = await request.form()
    email = str(form.get("login_email") or "").strip()
    disabled = 1 if str(form.get("portal_disabled") or "") == "1" else 0
    if email and ("@" not in email or " " in email):
        raise HTTPException(422, "That does not look like an email address")
    with connect() as conn:
        clash = conn.execute(
            "SELECT id FROM contacts WHERE lower(login_email) = lower(?) AND id != ?",
            (email, contact_id),
        ).fetchone()
        if email and clash:
            raise HTTPException(409, "Another card already uses that email")
        if not email:
            # Clearing the address removes the account with it.
            conn.execute(
                "UPDATE contacts SET login_email = NULL, password_hash = NULL WHERE id = ?",
                (contact_id,),
            )
            conn.execute("DELETE FROM contact_sessions WHERE contact_id = ?", (contact_id,))
        else:
            conn.execute(
                "UPDATE contacts SET login_email = ?, portal_disabled = ? WHERE id = ?",
                (email, disabled, contact_id),
            )
            if disabled:
                conn.execute("DELETE FROM contact_sessions WHERE contact_id = ?", (contact_id,))
    return {"id": contact_id, "login_email": email or None, "portal_disabled": bool(disabled)}


@router.post("/contacts/{contact_id}/invite")
def invite_holder(contact_id: int, user: CurrentUser):
    """Email the card holder a one-time code to set their password."""
    row, _ = load_contact(contact_id)
    if not row["login_email"]:
        raise HTTPException(422, "Give this person a sign-in email first")
    if row["portal_disabled"]:
        raise HTTPException(422, "Their sign-in is switched off")
    purpose = "activate" if not row["password_hash"] else "reset"
    code = routes_portal.issue_code(contact_id, purpose)
    subject, html, text = mailer.code_email(
        row["first_name"] or "", code, purpose, f"{public_base_url()}/portal/login"
    )
    try:
        mailer.send(row["login_email"], row["first_name"] or "", subject, html, text)
    except mailer.MailError as e:
        raise HTTPException(503, str(e)) from e
    return {"sent_to": row["login_email"], "purpose": purpose}


@router.patch("/contacts/{contact_id}")
async def edit_contact(contact_id: int, request: Request, user: CurrentUser):
    row, _ = load_contact(contact_id)
    form = await request.form()
    single = read_single(form)
    rows = parse_fields(str(form.get("fields") or "") or None)
    update_contact(contact_id, single, rows)
    notify(
        "notify_card_updated",
        "A contact card changed",
        [
            f"{single.get('first_name') or ''} {single.get('last_name') or ''}".strip()
            + f"'s card was edited ({public_base_url()}/user/{row['public_id']}).",
            f"Edited by {user['name'] or user['email']}.",
        ],
        company_id=row["company_id"],
    )

    upload = form.get("photo")
    if isinstance(upload, UploadFile) and upload.filename:
        display, embed = await store_photo(upload, row["public_id"])
        with connect() as conn:
            conn.execute(
                "UPDATE contacts SET photo_path = ?, photo_small_path = ? WHERE id = ?",
                (display, embed, contact_id),
            )
    return {"id": contact_id, "public_id": row["public_id"]}


@router.delete("/contacts/{contact_id}", status_code=204)
def remove_contact(contact_id: int, user: CurrentUser):
    row, _ = load_contact(contact_id)
    for name in (row["photo_path"], row["photo_small_path"]):
        if name:
            (UPLOADS / name).unlink(missing_ok=True)
    with connect() as conn:
        conn.execute("DELETE FROM contacts WHERE id = ?", (contact_id,))
    return Response(status_code=204)
