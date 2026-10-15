"""Time-based one-time codes, RFC 6238, out of the standard library.

Authenticator apps all speak the same six-digit, thirty-second, SHA-1 dialect,
and that is twenty lines of hmac — a dependency here would be more code to
audit than the algorithm it hides.

Recovery codes live beside it: the same hashing the passwords use, because a
recovery code *is* a password that happens to be typed once.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import re
import secrets
import struct
import time
from urllib.parse import quote

DIGITS = 6
STEP = 30
# One step either side: a phone's clock drifts, and so does a server's.
DRIFT = 1

RECOVERY_CODES = 10


def new_secret() -> str:
    """A fresh shared secret, in the base32 an authenticator app expects."""
    return base64.b32encode(secrets.token_bytes(20)).decode().rstrip("=")


def code_at(secret: str, counter: int) -> str:
    key = base64.b32decode(secret + "=" * (-len(secret) % 8))
    # SHA-1 is what RFC 6238 specifies and every app implements; it is a MAC
    # over a counter here, not a password hash.
    mac = hmac.new(key, struct.pack(">Q", counter), hashlib.sha1).digest()  # noqa: S324
    offset = mac[-1] & 0x0F
    number = struct.unpack(">I", mac[offset : offset + 4])[0] & 0x7FFFFFFF
    return str(number % 10**DIGITS).zfill(DIGITS)


def verify(secret: str, code: str) -> bool:
    """True when the code matches this step or its neighbours."""
    digits = re.sub(r"\D", "", code or "")
    if len(digits) != DIGITS or not secret:
        return False
    now = int(time.time() // STEP)
    return any(
        hmac.compare_digest(code_at(secret, now + drift), digits)
        for drift in range(-DRIFT, DRIFT + 1)
    )


def uri(secret: str, account: str, issuer: str = "True Star cards") -> str:
    """The otpauth:// URL behind the enrolment QR code."""
    label = quote(f"{issuer}:{account}", safe="")
    return (
        f"otpauth://totp/{label}?secret={secret}&issuer={quote(issuer)}"
        f"&algorithm=SHA1&digits={DIGITS}&period={STEP}"
    )


def new_recovery_codes(count: int = RECOVERY_CODES) -> list[str]:
    """Readable one-use codes: four groups of four, unambiguous alphabet."""
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return [
        "-".join(
            "".join(secrets.choice(alphabet) for _ in range(4)) for _ in range(3)
        )
        for _ in range(count)
    ]


def tidy(code: str) -> str:
    """Compare codes without caring about spaces, dashes or case."""
    return re.sub(r"[^A-Z0-9]", "", (code or "").upper())
