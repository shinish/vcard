"""The card holder's own page.

Separate from the admin API on purpose: a different cookie, a different
session table, and no route here can read or change anyone else's card.
Accounts are created by an administrator — there is no self-registration.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets
import sqlite3
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response

from . import analytics, mailer, signature
from .auth import hash_password, verify_password
from .config import COOKIE_SECURE, public_base_url
from .contacts import field_rows, serialise
from .db import connect

router = APIRouter(prefix="/api/portal", tags=["portal"])

PORTAL_COOKIE = "vcard_portal"
SESSION_DAYS = 14
CODE_MINUTES = 30
# Six digits is what people expect from a code in an email, and it is only
# ever one of several factors: it expires, it is single use, and it is rate
# limited by how many we will issue at once.
CODE_DIGITS = 6
MAX_LIVE_CODES = 3


def _hash_code(code: str) -> str:
    return hashlib.sha256(code.encode()).hexdigest()


def issue_code(contact_id: int, purpose: str) -> str:
    now = datetime.now(UTC)
    with connect() as conn:
        live = conn.execute(
            "SELECT COUNT(*) AS n FROM otp_codes WHERE contact_id = ? AND purpose = ? "
            "AND used = 0 AND expires_at > ?",
            (contact_id, purpose, now.isoformat()),
        ).fetchone()["n"]
        if live >= MAX_LIVE_CODES:
            raise HTTPException(429, "Too many codes requested. Try again in half an hour.")
        code = f"{secrets.randbelow(10**CODE_DIGITS):0{CODE_DIGITS}d}"
        conn.execute(
            "INSERT INTO otp_codes (contact_id, code_hash, purpose, expires_at, created_at) "
            "VALUES (?, ?, ?, ?, ?)",
            (
                contact_id,
                _hash_code(code),
                purpose,
                (now + timedelta(minutes=CODE_MINUTES)).isoformat(),
                now.isoformat(),
            ),
        )
    return code


def spend_code(contact_id: int, purpose: str, code: str) -> bool:
    """Check a code and burn it. Wrong or expired codes are simply false."""
    now = datetime.now(UTC).isoformat()
    with connect() as conn:
        rows = conn.execute(
            "SELECT id, code_hash FROM otp_codes WHERE contact_id = ? AND purpose = ? "
            "AND used = 0 AND expires_at > ?",
            (contact_id, purpose, now),
        ).fetchall()
        wanted = _hash_code(code)
        for row in rows:
            if hmac.compare_digest(row["code_hash"], wanted):
                conn.execute("UPDATE otp_codes SET used = 1 WHERE id = ?", (row["id"],))
                return True
    return False


def by_email(email: str) -> sqlite3.Row | None:
    with connect() as conn:
        return conn.execute(
            "SELECT * FROM contacts WHERE login_email IS NOT NULL "
            "AND lower(login_email) = lower(?)",
            (email.strip(),),
        ).fetchone()


def start_session(contact_id: int) -> tuple[str, datetime]:
    token = secrets.token_urlsafe(32)
    now = datetime.now(UTC)
    expires = now + timedelta(days=SESSION_DAYS)
    with connect() as conn:
        conn.execute(
            "INSERT INTO contact_sessions (token, contact_id, created_at, expires_at) "
            "VALUES (?, ?, ?, ?)",
            (token, contact_id, now.isoformat(), expires.isoformat()),
        )
    return token, expires


def current_holder(request: Request) -> sqlite3.Row:
    token = request.cookies.get(PORTAL_COOKIE)
    if not token:
        raise HTTPException(401, "Not signed in")
    with connect() as conn:
        row = conn.execute(
            "SELECT c.*, s.expires_at AS session_expires FROM contact_sessions s "
            "JOIN contacts c ON c.id = s.contact_id WHERE s.token = ?",
            (token,),
        ).fetchone()
        if row is None:
            raise HTTPException(401, "Not signed in")
        if datetime.fromisoformat(row["session_expires"]) < datetime.now(UTC):
            conn.execute("DELETE FROM contact_sessions WHERE token = ?", (token,))
            raise HTTPException(401, "Session expired")
        if row["portal_disabled"]:
            conn.execute("DELETE FROM contact_sessions WHERE token = ?", (token,))
            raise HTTPException(403, "This account is switched off")
    return row


Holder = Annotated[sqlite3.Row, Depends(current_holder)]


def set_cookie(response: Response, token: str, expires: datetime) -> None:
    response.set_cookie(
        PORTAL_COOKIE,
        token,
        httponly=True,
        samesite="lax",
        secure=COOKIE_SECURE,
        expires=expires,
        path="/",
    )


@router.post("/code")
async def request_code(request: Request):
    """Send a one-time code: first sign-in, or a forgotten password.

    The reply never says whether the address is known. Someone with a list of
    addresses should not be able to learn which have cards here.
    """
    body = await request.json()
    email = str(body.get("email") or "").strip()
    row = by_email(email)
    sent = False
    if row is not None and not row["portal_disabled"]:
        purpose = "activate" if not row["password_hash"] else "reset"
        code = issue_code(row["id"], purpose)
        subject, html, text = mailer.code_email(
            row["first_name"] or "", code, purpose, f"{public_base_url()}/portal/login"
        )
        try:
            mailer.send(row["login_email"], row["first_name"] or "", subject, html, text)
            sent = True
        except mailer.MailError as e:
            # Configuration problems are the admin's to fix and worth saying
            # out loud; anything else is swallowed to keep addresses private.
            if not mailer.configured():
                raise HTTPException(503, str(e)) from e
            raise HTTPException(502, str(e)) from e
    return {"sent": sent or True}


@router.post("/verify")
async def verify(request: Request, response: Response):
    """Spend a code and set a password. Works for both first sign-in and reset."""
    body = await request.json()
    email = str(body.get("email") or "").strip()
    code = str(body.get("code") or "").strip()
    password = str(body.get("password") or "")
    if len(password) < 10:
        raise HTTPException(422, "Use at least 10 characters for the password")
    row = by_email(email)
    if row is None or row["portal_disabled"]:
        raise HTTPException(401, "That code does not match")
    purpose = "activate" if not row["password_hash"] else "reset"
    if not spend_code(row["id"], purpose, code):
        raise HTTPException(401, "That code does not match, or it has expired")
    with connect() as conn:
        conn.execute(
            "UPDATE contacts SET password_hash = ? WHERE id = ?",
            (hash_password(password), row["id"]),
        )
        # A new password ends sessions opened with the old one.
        conn.execute("DELETE FROM contact_sessions WHERE contact_id = ?", (row["id"],))
    token, expires = start_session(row["id"])
    set_cookie(response, token, expires)
    return {"ok": True}


@router.post("/login")
async def login(request: Request, response: Response):
    body = await request.json()
    email = str(body.get("email") or "").strip()
    password = str(body.get("password") or "")
    row = by_email(email)
    if row is None or not row["password_hash"] or row["portal_disabled"]:
        raise HTTPException(401, "Wrong email or password")
    if not verify_password(password, row["password_hash"]):
        raise HTTPException(401, "Wrong email or password")
    token, expires = start_session(row["id"])
    set_cookie(response, token, expires)
    return {"ok": True}


@router.post("/logout")
def logout(request: Request, response: Response):
    token = request.cookies.get(PORTAL_COOKIE)
    if token:
        with connect() as conn:
            conn.execute("DELETE FROM contact_sessions WHERE token = ?", (token,))
    response.delete_cookie(PORTAL_COOKIE, path="/")
    return {"ok": True}


@router.get("/me")
def me(holder: Holder):
    with connect() as conn:
        company = conn.execute(
            "SELECT name, branch, accents, logo_path FROM companies WHERE id = ?",
            (holder["company_id"],),
        ).fetchone()
        fields = field_rows(conn, holder["id"])
        counts = {
            r["kind"]: r["n"]
            for r in conn.execute(
                "SELECT kind, COUNT(*) AS n FROM card_events WHERE contact_id = ? GROUP BY kind",
                (holder["id"],),
            )
        }
    out = serialise(holder, fields)
    out["id"] = holder["id"]
    out["login_email"] = holder["login_email"]
    out["signature_template"] = holder["signature_template"] or signature.DEFAULT_TEMPLATE
    out["url"] = f"{public_base_url()}/user/{holder['public_id']}"
    out["photo_url"] = (
        f"/api/public/{holder['public_id']}/photo.jpg" if holder["photo_path"] else None
    )
    out["company"] = {"name": company["name"], "branch": company["branch"]} if company else None
    out["stats"] = counts
    out["signature_templates"] = [
        {"key": k, "label": v} for k, v in signature.TEMPLATES.items()
    ]
    return out


@router.get("/stats")
def stats(holder: Holder, days: int = 30):
    """The same counting the admin sees, scoped to this one card."""
    if days not in analytics.DAYS:
        raise HTTPException(422, f"Pick a window of {analytics.DAYS} days")
    return analytics.window(days, contact_id=holder["id"])


@router.patch("/me")
async def update_me(request: Request, response: Response, holder: Holder):
    """What a card holder may change about themselves: password and signature."""
    body = await request.json()
    template = str(body.get("signature_template") or "").strip()
    if template:
        if template not in signature.TEMPLATES:
            raise HTTPException(422, "Unknown signature design")
        with connect() as conn:
            conn.execute(
                "UPDATE contacts SET signature_template = ? WHERE id = ?", (template, holder["id"])
            )

    new_password = str(body.get("new_password") or "")
    if new_password:
        if not verify_password(str(body.get("password") or ""), holder["password_hash"] or ""):
            raise HTTPException(403, "Current password is wrong")
        if len(new_password) < 10:
            raise HTTPException(422, "Use at least 10 characters for the password")
        with connect() as conn:
            conn.execute(
                "UPDATE contacts SET password_hash = ? WHERE id = ?",
                (hash_password(new_password), holder["id"]),
            )
            conn.execute(
                "DELETE FROM contact_sessions WHERE contact_id = ? AND token != ?",
                (holder["id"], request.cookies.get(PORTAL_COOKIE) or ""),
            )
    return {"ok": True}
