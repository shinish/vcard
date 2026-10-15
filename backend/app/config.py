"""Runtime configuration, all environment-driven so deploys are config changes."""

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

UPLOADS = Path(os.environ.get("VCARD_UPLOADS") or ROOT / "uploads")
_ENV_BASE = os.environ.get("PUBLIC_BASE_URL", "http://localhost:3000").rstrip("/")


def public_base_url() -> str:
    """Read per call: an administrator can change this in Settings."""
    from . import settings

    return (settings.get("public_base_url", _ENV_BASE) or _ENV_BASE).rstrip("/")


# Kept for imports that only need the boot-time value.
PUBLIC_BASE_URL = _ENV_BASE
_origins = os.environ.get("CORS_ORIGINS", "http://localhost:3000")
CORS_ORIGINS = [o.strip() for o in _origins.split(",") if o.strip()]
# Cookies are only marked Secure behind HTTPS; locally that would stop them being set.
# Whether the session cookie carries the Secure flag. Unset means "follow the
# request": a cookie handed out over HTTPS is marked secure, one handed out
# over plain HTTP is not — because a browser silently drops a Secure cookie on
# an insecure page, which looks exactly like a wrong password. Set it to 1 to
# insist on HTTPS everywhere, which is what a public deployment should do.
_cookie_secure = os.environ.get("COOKIE_SECURE")
COOKIE_SECURE: bool | None = None if _cookie_secure is None else _cookie_secure == "1"
