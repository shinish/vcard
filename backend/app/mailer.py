"""Outgoing email, through ZeptoMail's HTTP API.

SMTP would need a socket, a TLS handshake and a thread to wait on it; this is
one JSON POST. The token lives in settings (never returned to the browser) and
the sender address with it, so neither is baked into a deploy.

ponytail: urllib rather than a client library. One endpoint, one shape.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.request

from . import settings

# ZeptoMail runs one of these per region and each only honours its own tokens.
# The list is closed on purpose: the host is administrator-settable, and an open
# one would be a way to make the server post the token wherever it liked.
HOSTS = (
    "api.zeptomail.com",
    "api.zeptomail.in",
    "api.zeptomail.eu",
    "api.zeptomail.com.au",
    "api.zeptomail.ca",
    "api.zeptomail.jp",
    "api.zeptomail.sa",
    "api.zeptomail.com.cn",
)
TIMEOUT = 12


def endpoint() -> str:
    host = settings.get("zepto_dc") or HOSTS[0]
    return f"https://{host if host in HOSTS else HOSTS[0]}/v1.1/email"


class MailError(RuntimeError):
    """Sending failed, or email was never configured."""


def configured() -> bool:
    return bool(settings.get("zepto_token") and settings.get("mail_from"))


def send(to_address: str, to_name: str, subject: str, html: str, text: str) -> None:
    token = settings.get("zepto_token")
    sender = settings.get("mail_from")
    if not token or not sender:
        raise MailError(
            "Email is not set up yet. Add the ZeptoMail token and the from address in Settings."
        )

    payload = {
        "from": {"address": sender, "name": settings.get("mail_from_name") or "Contact cards"},
        "to": [{"email_address": {"address": to_address, "name": to_name or to_address}}],
        "subject": subject,
        "htmlbody": html,
        "textbody": text,
    }
    request = urllib.request.Request(  # noqa: S310 - https, host from a closed list
        endpoint(),
        data=json.dumps(payload).encode(),
        headers={
            # ZeptoMail's own scheme name, not "Bearer".
            "Authorization": token if token.startswith("Zoho-enczapikey") else f"Zoho-enczapikey {token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:  # noqa: S310
            response.read()
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")[:300]
        raise MailError(f"ZeptoMail refused the message ({e.code}): {detail}") from e
    except (urllib.error.URLError, TimeoutError) as e:
        raise MailError(f"Could not reach ZeptoMail: {e}") from e


def code_email(name: str, code: str, purpose: str, link: str) -> tuple[str, str, str]:
    """Subject, HTML and plain text for a one-time code."""
    what = "sign in for the first time" if purpose == "activate" else "set a new password"
    subject = (
        "Your sign-in code" if purpose == "activate" else "Your password reset code"
    )
    html = f"""<table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;font:400 15px Segoe UI,Arial,sans-serif;color:#0d1315">
  <tr><td style="padding:0 0 12px;font:700 18px Segoe UI,Arial,sans-serif">Hello {name or "there"},</td></tr>
  <tr><td style="padding:0 0 14px">Use this code to {what} on your contact card page.</td></tr>
  <tr><td style="padding:0 0 16px">
    <span style="display:inline-block;background:#0d1315;color:#ffffff;font:700 26px Segoe UI,Arial,sans-serif;letter-spacing:6px;padding:12px 20px">{code}</span>
  </td></tr>
  <tr><td style="padding:0 0 14px">It expires in 30 minutes and works once.</td></tr>
  <tr><td style="padding:0 0 6px"><a href="{link}" style="color:#0b6670;font-weight:700">Open the sign-in page</a></td></tr>
  <tr><td style="padding:14px 0 0;font-size:12px;color:#5a686c">If you were not expecting this, you can ignore it. Your card is unchanged.</td></tr>
</table>"""
    text = (
        f"Hello {name or 'there'},\n\n"
        f"Use this code to {what} on your contact card page: {code}\n"
        f"It expires in 30 minutes and works once.\n\n{link}\n"
    )
    return subject, html, text
