"""Passwords and sessions.

hashlib.scrypt is a memory-hard KDF in the standard library, so there is no
password-hashing dependency to install, pin, or keep patched.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets
import sqlite3
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, Request

from .db import connect

# 2**15 * 8 * 128 bytes is about 32 MB of work per attempt. maxmem is passed
# explicitly because OpenSSL's default cap would reject these parameters.
SCRYPT = {"n": 2**15, "r": 8, "p": 1, "maxmem": 96 * 1024 * 1024, "dklen": 32}
SESSION_COOKIE = "vcard_session"
SESSION_DAYS = 14


def cookie_secure(request: Request) -> bool:
    """Should this session cookie be marked Secure?

    Forced by COOKIE_SECURE when it is set; otherwise taken from how the
    request actually arrived, trusting the proxy's X-Forwarded-Proto since
    everything here sits behind one.
    """
    from .config import COOKIE_SECURE

    if COOKIE_SECURE is not None:
        return COOKIE_SECURE
    forwarded = (request.headers.get("x-forwarded-proto") or "").split(",")[0].strip()
    return (forwarded or request.url.scheme) == "https"


def session_hours() -> int:
    """How long a sign-in lasts, from settings, falling back to a fortnight."""
    from . import settings  # here, not at import time: settings reads the db

    try:
        hours = int(settings.get("session_hours") or 0)
    except ValueError:
        hours = 0
    return hours if 1 <= hours <= 24 * 90 else SESSION_DAYS * 24


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, **SCRYPT)
    return f"scrypt${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, salt_hex, digest_hex = stored.split("$")
    except ValueError:
        return False
    if scheme != "scrypt":
        return False
    digest = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt_hex), **SCRYPT)
    return hmac.compare_digest(digest.hex(), digest_hex)


def start_session(user_id: int, pending_2fa: bool = False) -> tuple[str, datetime]:
    """Open a session. A pending one may only reach the one-time code check."""
    token = secrets.token_urlsafe(32)
    now = datetime.now(UTC)
    expires = now + timedelta(hours=session_hours())
    with connect() as conn:
        conn.execute(
            "INSERT INTO sessions (token, user_id, created_at, expires_at, pending_2fa) "
            "VALUES (?, ?, ?, ?, ?)",
            (token, user_id, now.isoformat(), expires.isoformat(), int(pending_2fa)),
        )
    return token, expires


def finish_2fa(token: str) -> None:
    """The code was right: the session becomes a real one."""
    with connect() as conn:
        conn.execute("UPDATE sessions SET pending_2fa = 0 WHERE token = ?", (token,))


def end_session(token: str) -> None:
    with connect() as conn:
        conn.execute("DELETE FROM sessions WHERE token = ?", (token,))


def _resolve(request: Request, allow_pending: bool) -> sqlite3.Row:
    """Resolve the signed-in user, or 401.

    Not a dependency itself, and deliberately so: FastAPI would read the
    second argument off the query string, and `?allow_pending=true` would be
    a way around the one-time code.
    """
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        raise HTTPException(401, "Not signed in")
    with connect() as conn:
        row = conn.execute(
            "SELECT u.*, s.token AS session_token, s.expires_at AS session_expires, "
            "s.pending_2fa AS session_pending "
            "FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?",
            (token,),
        ).fetchone()
    if row is None:
        raise HTTPException(401, "Not signed in")
    if datetime.fromisoformat(row["session_expires"]) < datetime.now(UTC):
        end_session(token)
        raise HTTPException(401, "Session expired")
    if row["disabled"]:
        # Disabling takes effect now, not whenever they next sign in.
        end_session(token)
        raise HTTPException(403, "This account is disabled")
    if not allow_pending and row["session_pending"]:
        raise HTTPException(401, "Enter your one-time code")
    return row


def current_user(request: Request) -> sqlite3.Row:
    """The signed-in user. A session owing a one-time code is not one."""
    return _resolve(request, allow_pending=False)


def half_signed_in(request: Request) -> sqlite3.Row:
    """The user behind a session that still owes its one-time code."""
    return _resolve(request, allow_pending=True)


