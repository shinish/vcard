"""The share link. No authentication by design: the public id is the key."""

from __future__ import annotations

import hashlib
import json
import re
from datetime import UTC, date, datetime, timedelta
from html import escape
from urllib.parse import urlsplit

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse, Response

from . import mailer, qr, signature, vcf
from . import settings as app_settings
from .auth import is_admin
from .config import UPLOADS, public_base_url
from .contacts import field_rows, serialise
from .db import connect

router = APIRouter(prefix="/api/public", tags=["public"])

# What a card is allowed to report. Anything else is dropped rather than
# stored: this endpoint is open to the internet.
EVENT_KINDS = (
    "view", "save", "qr", "signature", "call", "email", "website", "map", "share",
    "pdf", "exchange",
)

# An open endpoint that sends email is an open relay unless it is capped. One
# card cannot post more than this many exchanges in an hour; the count is the
# card's own event log, so there is nothing else to keep.
EXCHANGE_PER_HOUR = 20


def device_of(agent: str) -> str:
    """Phone, tablet or computer, from the user agent and nothing else."""
    a = agent.lower()
    if "ipad" in a or ("android" in a and "mobi" not in a) or "tablet" in a:
        return "tablet"
    if "mobi" in a or "iphone" in a or "android" in a:
        return "phone"
    return "computer"


def visitor_of(request: Request | None) -> str | None:
    """A hash that tells two openers apart for one day, and no longer.

    The address and the agent go in; neither is stored. The salt changes with
    the date, so the same phone tomorrow hashes to something unrelated — there
    is deliberately no way to follow anyone across days.
    """
    if request is None:
        return None
    forwarded = (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
    who = forwarded or (request.client.host if request.client else "")
    agent = request.headers.get("user-agent") or ""
    if not who and not agent:
        return None
    seed = f"{date.today()}|{app_settings.salt()}|{who}|{agent}"
    return hashlib.sha256(seed.encode()).hexdigest()[:16]


def record(
    contact_id: int,
    kind: str,
    source: str | None = None,
    request: Request | None = None,
) -> None:
    if kind not in EVENT_KINDS:
        return
    agent = request.headers.get("user-agent") if request else None
    with connect() as conn:
        conn.execute(
            "INSERT INTO card_events (contact_id, kind, at, source, device, visitor) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (
                contact_id,
                kind,
                datetime.now(UTC).isoformat(),
                (source or None),
                device_of(agent) if agent else None,
                visitor_of(request),
            ),
        )


def source_of(request: Request, hint: str | None) -> str | None:
    """Where the opener came from: the ?s= hint, else the referring host."""
    if hint:
        return re.sub(r"[^a-z0-9.\-]", "", hint.lower())[:40] or None
    ref = request.headers.get("referer") or ""
    host = urlsplit(ref).netloc
    return host[:60] or None


def _palette(raw: str | None) -> list[str]:
    try:
        values = json.loads(raw or "[]")
    except ValueError:
        return []
    return [v for v in values if isinstance(v, str)]


def fetch(public_id: str):
    with connect() as conn:
        row = conn.execute(
            "SELECT c.*, co.name AS company_name, co.branch AS company_branch, "
            "co.slug AS company_slug, co.theme AS company_theme, "
            "co.accents AS company_accents, co.logo_path AS company_logo, "
            "co.logo_position AS company_logo_position, co.logo_scale AS company_logo_scale, "
            "co.language AS company_language, co.wallpaper_path AS company_wallpaper, "
            "co.wallpaper_fit AS company_wallpaper_fit, co.font AS company_font, "
            "co.show_qr AS company_show_qr, co.show_qr_download AS company_show_qr_download, "
            "co.favicon_path AS company_favicon, co.require_consent AS company_consent, "
            "co.public_sharing AS company_public, co.allow_indexing AS company_indexing, "
            "co.allow_save AS company_allow_save, co.share_message AS company_share_message, "
            "co.show_company_name AS company_show_name, co.show_branch AS company_show_branch, "
            "co.id AS company_id_real "
            "FROM contacts c JOIN companies co ON co.id = c.company_id "
            "WHERE c.public_id = ?",
            (public_id,),
        ).fetchone()
        if row is None:
            raise HTTPException(404, "Card not found")
        if not row["company_public"]:
            # Sharing switched off for the whole company. Gone, not missing:
            # the link was real, and saying so is the honest answer.
            raise HTTPException(410, "This card is no longer shared")
        return row, field_rows(conn, row["id"])


@router.get("/{public_id}.vcf")
def download_vcf(public_id: str, request: Request):
    row, fields = fetch(public_id)
    if not row["company_allow_save"]:
        raise HTTPException(403, "This card cannot be saved to a phone")
    record(row["id"], "save", request=request)
    photo = None
    if row["photo_small_path"]:
        path = UPLOADS / row["photo_small_path"]
        photo = path.read_bytes() if path.exists() else None

    stem = "-".join(p for p in (row["first_name"], row["last_name"]) if p) or "contact"
    # Sanitised, not just slugified: this value lands in a response header.
    stem = re.sub(r"[^A-Za-z0-9_-]", "", stem.replace(" ", "-")) or "contact"
    return Response(
        vcf.build(dict(row), fields, photo),
        media_type="text/vcard; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{stem}.vcf"'},
    )


@router.post("/{public_id}/event", status_code=204)
async def log_event(public_id: str, request: Request):
    """The card reports what someone did with it. Open by design, like the card."""
    row, _ = fetch(public_id)
    body = await request.json()
    record(
        row["id"],
        str(body.get("kind") or ""),
        source_of(request, body.get("source")),
        request=request,
    )
    return Response(status_code=204)


def exchange_recipient(row, fields: list[dict]) -> tuple[str, str]:
    """Who hears about a visitor who left their details, and under what name.

    The card holder's own email address first — it is their card. A company
    that named a notification address is next, and the global one last, so a
    card with no email on it still reaches somebody.
    """
    for field in fields:
        if field["kind"] == "email" and str(field["value"] or "").strip():
            name = " ".join(p for p in (row["first_name"], row["last_name"]) if p)
            return str(field["value"]).strip(), name
    with connect() as conn:
        company = conn.execute(
            "SELECT notify_to FROM companies WHERE id = ?", (row["company_id"],)
        ).fetchone()
    if company and (company["notify_to"] or "").strip():
        return company["notify_to"].strip(), row["company_name"]
    return app_settings.get("notify_to").strip(), row["company_name"]


@router.post("/{public_id}/exchange", status_code=202)
async def exchange_contact(public_id: str, request: Request):
    """A visitor hands their own details back to whoever the card belongs to.

    Open to the internet, like the card itself, so everything it accepts is
    length-capped, the address has to look like one, and a card can only send
    so many of these an hour.
    """
    row, fields = fetch(public_id)
    body = await request.json()
    if not isinstance(body, dict):
        raise HTTPException(422, "Expected an object")

    def field(key: str, limit: int) -> str:
        return " ".join(str(body.get(key) or "").split())[:limit]

    name = field("name", 80)
    email = field("email", 120)
    phone = field("phone", 40)
    message = field("message", 600)
    if not name:
        raise HTTPException(422, "Please give your name")
    if "@" not in email or "." not in email.split("@")[-1]:
        raise HTTPException(422, "Please give an email address we can reply to")

    if not mailer.configured():
        raise HTTPException(503, "This card cannot take messages yet")

    hour_ago = (datetime.now(UTC) - timedelta(hours=1)).isoformat()
    with connect() as conn:
        recent = conn.execute(
            "SELECT COUNT(*) AS n FROM card_events "
            "WHERE contact_id = ? AND kind = 'exchange' AND at >= ?",
            (row["id"], hour_ago),
        ).fetchone()["n"]
    if recent >= EXCHANGE_PER_HOUR:
        raise HTTPException(429, "Too many messages from this card just now. Try again later.")

    to_address, to_name = exchange_recipient(row, fields)
    if not to_address:
        raise HTTPException(503, "This card cannot take messages yet")

    card = " ".join(p for p in (row["first_name"], row["last_name"]) if p) or public_id
    lines = [
        f"{name} left their details on your card.",
        f"Email: {email}",
        *([f"Phone: {phone}"] if phone else []),
        *([f"Message: {message}"] if message else []),
        f"Card: {public_base_url()}/user/{public_id}",
    ]
    html = "".join(f'<p style="font:15px Arial">{escape(line)}</p>' for line in lines)
    try:
        mailer.send(to_address, to_name, f"{name} shared their details ({card})", html,
                    "\n".join(lines))
    except mailer.MailError as e:
        raise HTTPException(502, "Could not send it just now. Please try again.") from e

    record(row["id"], "exchange", request=request)
    return Response(status_code=202)


@router.get("/{public_id}/qr.svg")
def card_qr(public_id: str):
    fetch(public_id)
    return Response(
        qr.svg_bytes(f"{public_base_url()}/user/{public_id}"), media_type="image/svg+xml"
    )


@router.get("/{public_id}/qr.png")
def card_qr_png(public_id: str, request: Request):
    """The same QR as a PNG, for printing or sending to someone."""
    row, _ = fetch(public_id)
    record(row["id"], "qr", request=request)
    # The company logo rides in the middle when there is one.
    logo = UPLOADS / row["company_logo"] if row["company_logo"] else None
    png = qr.png_bytes(
        f"{public_base_url()}/user/{public_id}", logo, logo_scale=row["company_logo_scale"] or 100
    )
    stem = "-".join(p for p in (row["first_name"], row["last_name"]) if p) or "contact"
    stem = re.sub(r"[^A-Za-z0-9_-]", "", stem.replace(" ", "-")) or "contact"
    return Response(
        png,
        media_type="image/png",
        headers={"Content-Disposition": f'attachment; filename="{stem}-qr.png"'},
    )


@router.get("/{public_id}/photo.jpg")
def card_photo(public_id: str):
    row, _ = fetch(public_id)
    if not row["photo_path"]:
        raise HTTPException(404, "No photo")
    path = UPLOADS / row["photo_path"]
    if not path.exists():
        raise HTTPException(404, "No photo")
    return FileResponse(path, media_type="image/jpeg")


def _display_rows(fields: list[dict]) -> list[dict]:
    """The same rows the card shows, as label/value/href triples."""
    rows: list[dict] = []
    for field in fields:
        kind, label = field["kind"], field["label"]
        raw = field["value"]
        if kind == "address":
            try:
                parts = json.loads(raw)
            except ValueError:
                continue
            keys = ("street", "city", "region", "postal", "country")
            text = ", ".join(p for p in (parts.get(k) for k in keys) if p)
            if text:
                rows.append({"label": label, "value": text, "href": None})
        elif kind == "phone":
            rows.append({"label": label, "value": raw, "href": f"tel:{raw}"})
        elif kind == "email":
            rows.append({"label": label, "value": raw, "href": f"mailto:{raw}"})
        elif kind in ("url", "social", "im"):
            href = raw if raw.lower().startswith(("http://", "https://")) else f"https://{raw}"
            rows.append({"label": label, "value": raw.replace("https://", ""), "href": href})
        else:
            rows.append({"label": label, "value": raw, "href": None})
    return rows


@router.get("/{public_id}/signature.html")
def email_signature(public_id: str, template: str = signature.DEFAULT_TEMPLATE):
    """An Outlook-ready HTML signature carrying the card link and its QR.

    `template` is checked against the allow-list because it picks the renderer.
    """
    if template not in signature.TEMPLATES:
        raise HTTPException(422, f"Unknown signature template: {template!r}")
    row, fields = fetch(public_id)
    record(row["id"], "signature")
    with connect() as conn:
        picture = conn.execute(
            "SELECT id FROM company_media WHERE company_id = ? AND path IS NOT NULL "
            "ORDER BY position, id LIMIT 1",
            (row["company_id"],),
        ).fetchone()
    company = {
        "name": row["company_name"],
        "accents": _palette(row["company_accents"]),
        "logo_url": row["company_logo"],
        "photo": bool(row["photo_path"]),
        # The banner design shows the company's first showcase picture.
        "picture_url": (
            f"{public_base_url()}/api/public/{public_id}/media/{picture['id']}.jpg"
            if picture
            else None
        ),
    }
    html = signature.build(dict(row), _display_rows(fields), company, template=template)
    stem = re.sub(r"[^A-Za-z0-9_-]", "", (row["first_name"] or "contact").replace(" ", "-"))
    return Response(
        html,
        media_type="text/html; charset=utf-8",
        headers={"Content-Disposition": f'inline; filename="{stem}-signature.html"'},
    )


@router.get("/{public_id}/logo.png")
def company_logo(public_id: str):
    row, _ = fetch(public_id)
    if not row["company_logo"]:
        raise HTTPException(404, "No logo")
    path = UPLOADS / row["company_logo"]
    if not path.exists():
        raise HTTPException(404, "No logo")
    return FileResponse(path, media_type="image/png")


@router.get("/{public_id}/favicon.png")
def company_favicon(public_id: str):
    row, _ = fetch(public_id)
    path = UPLOADS / row["company_favicon"] if row["company_favicon"] else None
    if path is None or not path.exists():
        raise HTTPException(404, "No favicon")
    return FileResponse(path, media_type="image/png")


@router.get("/{public_id}/wallpaper.jpg")
def card_wallpaper(public_id: str):
    row, _ = fetch(public_id)
    if not row["company_wallpaper"]:
        raise HTTPException(404, "No wallpaper")
    path = UPLOADS / row["company_wallpaper"]
    if not path.exists():
        raise HTTPException(404, "No wallpaper")
    return FileResponse(path, media_type="image/jpeg")


@router.get("/{public_id}/media/{media_id}.jpg")
def card_media(public_id: str, media_id: int):
    row, _ = fetch(public_id)
    with connect() as conn:
        media = conn.execute(
            "SELECT path FROM company_media WHERE id = ? AND company_id = ?",
            (media_id, row["company_id"]),
        ).fetchone()
    if media is None or not media["path"] or not (UPLOADS / media["path"]).exists():
        raise HTTPException(404, "No picture")
    return FileResponse(UPLOADS / media["path"], media_type="image/jpeg")


def showcase(company_id: int, public_id: str) -> list[dict]:
    """The company's own pictures and videos, shown on every card it owns."""
    with connect() as conn:
        rows = conn.execute(
            "SELECT * FROM company_media WHERE company_id = ? ORDER BY position, id",
            (company_id,),
        ).fetchall()
    out = []
    for r in rows:
        out.append(
            {
                "id": r["id"],
                "kind": r["kind"],
                "caption": r["caption"],
                "url": r["url"],
                "image_url": (
                    f"/api/public/{public_id}/media/{r['id']}.jpg" if r["path"] else None
                ),
            }
        )
    return out


@router.get("/{public_id}")
def get_card(public_id: str, request: Request, s: str | None = None, preview: int = 0):
    row, fields = fetch(public_id)
    # The card designer reloads this page on every change it previews, and
    # counting those would drown the real visits. A request that can prove it
    # is an admin may ask not to be counted; anyone else is counted whatever
    # they ask for.
    if not (preview and is_admin(request)):
        record(row["id"], "view", source_of(request, s), request=request)
    out = serialise(row, fields)
    out["company"] = {
        "name": row["company_name"],
        "branch": row["company_branch"] or None,
        "slug": row["company_slug"],
        "theme": row["company_theme"] or "plain",
        "accents": _palette(row["company_accents"]),
        "logo_url": f"/api/public/{public_id}/logo.png" if row["company_logo"] else None,
        "logo_position": row["company_logo_position"] or "top-center",
        "logo_scale": row["company_logo_scale"] or 100,
        "language": row["company_language"] or "en",
        "font": row["company_font"] or "poppins",
        "wallpaper_url": (
            f"/api/public/{public_id}/wallpaper.jpg" if row["company_wallpaper"] else None
        ),
        "wallpaper_fit": row["company_wallpaper_fit"] or "cover",
        "show_qr": bool(row["company_show_qr"]),
        "show_qr_download": bool(row["company_show_qr_download"]),
        "favicon_url": (
            f"/api/public/{public_id}/favicon.png" if row["company_favicon"] else None
        ),
        "require_consent": bool(row["company_consent"]),
        "allow_save": bool(row["company_allow_save"]),
        "allow_indexing": bool(row["company_indexing"]),
        "show_name": bool(row["company_show_name"]),
        "show_branch": bool(row["company_show_branch"]),
        "share_message": row["company_share_message"] or None,
        # The exchange form only appears where it can actually send.
        "allow_exchange": mailer.configured(),
        "media": showcase(row["company_id"], public_id),
    }
    out["photo_url"] = f"/api/public/{public_id}/photo.jpg" if row["photo_path"] else None
    out["vcf_url"] = f"/api/public/{public_id}.vcf"
    out["qr_url"] = f"/api/public/{public_id}/qr.svg"
    return out
