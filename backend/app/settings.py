"""Runtime settings, stored in the database and overriding the environment.

Environment first for a fresh install, database second so an administrator can
change things without a redeploy. Anything secret (an API key) is written here
but never read back out to the browser: the UI is told only whether one is set.
"""

from __future__ import annotations

import os
import secrets

from .db import connect

# key -> environment variable it falls back to
KEYS = {
    "geocoder": "GEOCODER",
    "geocoder_key": "GEOCODER_KEY",
    "public_base_url": "PUBLIC_BASE_URL",
    "default_theme": "DEFAULT_THEME",
    # ZeptoMail (Zoho) sends the sign-in codes and password resets.
    "zepto_token": "ZEPTO_TOKEN",
    # Which ZeptoMail data centre the account lives in: a token issued for one
    # is refused by the others, which reads as "Invalid API Token".
    "zepto_dc": "ZEPTO_DC",
    "mail_from": "MAIL_FROM",
    "mail_from_name": "MAIL_FROM_NAME",
    # Where a reply should land, when that is not the address the mail was
    # sent from. Sending from a domain built for sending keeps SPF and DKIM
    # clean; a person answering still needs a mailbox that receives.
    "mail_reply_to": "MAIL_REPLY_TO",
    # Who hears about new and changed cards, and which of those to send.
    "notify_to": "NOTIFY_TO",
    "notify_card_created": "NOTIFY_CARD_CREATED",
    "notify_card_updated": "NOTIFY_CARD_UPDATED",
    "notify_admin_added": "NOTIFY_ADMIN_ADDED",
    "notify_monthly": "NOTIFY_MONTHLY",
    # Which month's report has already gone out, so a restart cannot repeat it.
    "monthly_sent": "MONTHLY_SENT",
    # Every administrator must carry two-step verification.
    "require_2fa": "REQUIRE_2FA",
    # How many hours a sign-in lasts before it has to be done again.
    "session_hours": "SESSION_HOURS",
    # Salt behind the per-day visitor hash. Written once, never shown.
    "event_salt": "EVENT_SALT",
}

SECRET_KEYS = {"geocoder_key", "zepto_token", "event_salt"}


def flag(key: str) -> bool:
    """A settings value read as a switch. Unset reads as off."""
    return get(key).strip() in {"1", "true", "on", "yes"}


def salt() -> str:
    """The visitor-hash salt, minted on first use."""
    value = get("event_salt")
    if not value:
        value = secrets.token_hex(16)
        put("event_salt", value)
    return value


def get(key: str, default: str = "") -> str:
    """Database value if set, else the environment, else the given default."""
    if key not in KEYS:
        raise KeyError(key)
    with connect() as conn:
        row = conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
    if row and row["value"] != "":
        return row["value"]
    return os.environ.get(KEYS[key], default)


def put(key: str, value: str) -> None:
    if key not in KEYS:
        raise KeyError(key)
    with connect() as conn:
        conn.execute(
            "INSERT INTO settings (key, value) VALUES (?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (key, value),
        )


def public() -> dict:
    """What the admin UI may see. Secrets are reported as set or not set."""
    out = {}
    for key in KEYS:
        if key in SECRET_KEYS:
            out[f"{key}_set"] = bool(get(key))
        else:
            out[key] = get(key)
    return out
