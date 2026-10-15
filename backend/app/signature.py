"""Email signature HTML, in five designs.

Outlook on Windows renders mail with Word's engine, which is the constraint
that shapes all of this:

  * layout is tables, not flexbox or grid
  * styles must be inline; <style> blocks are dropped
  * background images are ignored, so colour comes from bgcolor cells
  * `data:` image URIs do not render at all, so the photo, the logo and the QR
    have to be absolute URLs the recipient's client can fetch

Which means a signature only shows its images while the server is reachable
from wherever the mail is read. That is a property of Outlook, not a bug here.
"""

from __future__ import annotations

from html import escape

from .config import public_base_url

FONT = "Segoe UI, Calibri, Arial, sans-serif"
SERIF = "Georgia, 'Times New Roman', serif"

# The designs on offer. The key rides in the URL, so it is an allow-list.
TEMPLATES = {
    "classic": "Classic — details beside a QR code",
    "banner": "Banner — details with a picture panel",
    "panels": "Panels — two tinted halves",
    "minimal": "Minimal — photo, rule and plain rows",
    "compact": "Compact — one dark strip",
}
DEFAULT_TEMPLATE = "classic"


def _mix(hex_colour: str, amount: float, towards: str = "#ffffff") -> str:
    """Blend a colour towards white (or any colour): Word has no color-mix()."""
    try:
        a = [int(hex_colour[i : i + 2], 16) for i in (1, 3, 5)]
        b = [int(towards[i : i + 2], 16) for i in (1, 3, 5)]
    except (ValueError, IndexError):
        return hex_colour
    out = [round(x + (y - x) * amount) for x, y in zip(a, b, strict=False)]
    return "#" + "".join(f"{v:02x}" for v in out)


def _ctx(contact: dict, rows: list[dict], company: dict, api_base: str | None) -> dict:
    base = (api_base or public_base_url()).rstrip("/")
    public_id = contact["public_id"]
    accent = (company.get("accents") or ["#28b4be"])[0]
    name = " ".join(
        p
        for p in (
            contact.get("prefix"),
            contact.get("first_name"),
            contact.get("middle_name"),
            contact.get("last_name"),
            contact.get("suffix"),
        )
        if p
    )
    return {
        "base": base,
        "accent": accent,
        "soft": _mix(accent, 0.88),
        "name": name,
        "job": contact.get("job_title") or "",
        "org": contact.get("org") or company.get("name") or "",
        "title_line": ", ".join(
            p for p in (contact.get("job_title"), contact.get("org") or company.get("name")) if p
        ),
        "rows": rows,
        "card_url": f"{base}/user/{public_id}",
        "qr_url": f"{base}/api/public/{public_id}/qr.png",
        "logo_url": f"{base}/api/public/{public_id}/logo.png" if company.get("logo_url") else None,
        "photo_url": f"{base}/api/public/{public_id}/photo.jpg" if company.get("photo") else None,
        "picture_url": company.get("picture_url"),
    }


def _link(value: str, href: str | None, colour: str = "#111111", bold: bool = False) -> str:
    weight = "700" if bold else "400"
    if not href:
        return escape(value)
    return (
        f'<a href="{escape(href, quote=True)}" '
        f'style="color:{colour};text-decoration:none;font-weight:{weight}">{escape(value)}</a>'
    )


def _rows_labelled(c: dict) -> str:
    out = []
    for r in c["rows"]:
        out.append(
            "<tr>"
            f'<td style="padding:1px 10px 1px 0;font:400 12px {FONT};color:{c["accent"]};'
            'white-space:nowrap;vertical-align:top">'
            f'{escape(r["label"])}</td>'
            f'<td style="padding:1px 0;font:400 13px {FONT};color:#111111;vertical-align:top">'
            f'{_link(r["value"], r.get("href"))}</td>'
            "</tr>"
        )
    return "".join(out)


def _rows_plain(c: dict, size: int = 13) -> str:
    out = []
    for r in c["rows"]:
        out.append(
            "<tr>"
            f'<td style="padding:2px 0;font:400 {size}px {FONT};color:#111111">'
            f'{_link(r["value"], r.get("href"))}'
            f'<span style="color:#8a9699;font-size:11px"> · {escape(r["label"])}</span>'
            "</td></tr>"
        )
    return "".join(out)


def _qr_block(c: dict, size: int = 96, caption: str = "Scan to save my details") -> str:
    return (
        '<table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">'
        '<tr><td style="padding:0 0 4px">'
        f'<a href="{escape(c["card_url"], quote=True)}">'
        f'<img src="{escape(c["qr_url"], quote=True)}" alt="{escape(caption)}" '
        f'width="{size}" height="{size}" '
        f'style="display:block;border:0;width:{size}px;height:{size}px" /></a>'
        "</td></tr>"
        f'<tr><td style="font:400 10px {FONT};color:#777777;text-align:center">'
        f"{escape(caption)}</td></tr></table>"
    )


def _logo_img(c: dict, height: int = 34) -> str:
    if not c["logo_url"]:
        return ""
    return (
        f'<img src="{escape(c["logo_url"], quote=True)}" alt="{escape(c["org"])}" '
        f'height="{height}" style="display:block;border:0;height:{height}px;width:auto" />'
    )


def classic(c: dict) -> str:
    return f"""<table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">
  <tr>
    <td style="padding:0 18px 0 0;vertical-align:top">
      <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">
        {f'<tr><td style="padding:0 0 8px">{_logo_img(c)}</td></tr>' if c["logo_url"] else ""}
        <tr><td style="font:700 17px {FONT};color:#111111;padding:0 0 2px">{escape(c["name"])}</td></tr>
        <tr><td style="font:400 13px {FONT};color:#555555;padding:0 0 8px">{escape(c["title_line"])}</td></tr>
        <tr><td style="padding:0 0 8px">
          <table cellpadding="0" cellspacing="0" border="0"
                 style="border-collapse:collapse;border-top:2px solid {c["accent"]};width:44px;font-size:0;line-height:0">
            <tr><td>&nbsp;</td></tr></table>
        </td></tr>
        <tr><td><table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">{_rows_labelled(c)}</table></td></tr>
        <tr><td style="padding:10px 0 0;font:400 12px {FONT}">
          {_link("Save my contact details", c["card_url"], c["accent"], bold=True)}
        </td></tr>
      </table>
    </td>
    <td style="vertical-align:top;padding:0">{_qr_block(c)}</td>
  </tr>
</table>"""


def banner(c: dict) -> str:
    """Details on the left, a picture panel on the right under a coloured bar."""
    picture = c["picture_url"] or c["qr_url"]
    is_photo = bool(c["picture_url"])
    return f"""<table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;max-width:560px">
  <tr>
    <td style="padding:0 22px 0 0;vertical-align:top">
      <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">
        <tr><td style="font:700 18px {FONT};color:#111111">{escape(c["name"])}</td></tr>
        <tr><td style="font:400 13px {FONT};color:#333333;padding:0 0 10px">{escape(c["job"])}</td></tr>
        {f'<tr><td style="padding:0 0 10px">{_logo_img(c, 38)}</td></tr>' if c["logo_url"] else f'<tr><td style="font:700 15px {FONT};color:{c["accent"]};padding:0 0 10px">{escape(c["org"])}</td></tr>'}
        <tr><td><table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">{_rows_plain(c)}</table></td></tr>
        <tr><td style="padding:12px 0 0;font:700 12px {FONT}">
          {_link("Save my contact details", c["card_url"], c["accent"], bold=True)}
        </td></tr>
      </table>
    </td>
    <td style="vertical-align:top;width:190px">
      <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:190px">
        <tr><td style="padding:0">
          <a href="{escape(c["card_url"], quote=True)}">
            <img src="{escape(picture, quote=True)}" alt="{escape(c["org"])}" width="190"
                 style="display:block;border:0;width:190px;height:auto;{"" if is_photo else "padding:12px;background:#ffffff"}" />
          </a>
        </td></tr>
        <tr><td bgcolor="{c["accent"]}" style="background:{c["accent"]};padding:7px 10px;
                 font:700 12px {FONT};color:#ffffff;text-align:center">
          {escape(c["org"] or "Scan to save my details")}
        </td></tr>
      </table>
    </td>
  </tr>
  <tr><td colspan="2" style="padding:14px 0 0;font:400 10px {FONT};color:#9aa5a8;line-height:1.5">
    This message is intended for the named recipient only. The QR code and link above open my
    contact card, which saves straight to a phone.
  </td></tr>
</table>"""


def panels(c: dict) -> str:
    """Two tinted halves: a serif name on the left, the company on the right."""
    return f"""<table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;max-width:620px">
  <tr>
    <td bgcolor="{c["soft"]}" style="background:{c["soft"]};padding:26px 28px;vertical-align:middle;width:58%">
      <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">
        <tr><td style="font:italic 400 30px {SERIF};color:{c["accent"]};padding:0 0 10px;line-height:1.1">
          {escape(c["name"])}
        </td></tr>
        <tr><td style="font:700 14px {FONT};color:#2b3538;letter-spacing:2px;padding:0 0 2px">
          {escape(c["name"].upper())}
        </td></tr>
        <tr><td style="font:400 13px {SERIF};color:#4a5558">{escape(c["job"])}</td></tr>
      </table>
    </td>
    <td bgcolor="{_mix(c["accent"], 0.78)}" style="background:{_mix(c["accent"], 0.78)};padding:22px 24px;vertical-align:middle;text-align:center">
      <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:0 auto">
        {f'<tr><td align="center" style="padding:0 0 8px">{_logo_img(c, 30)}</td></tr>' if c["logo_url"] else ""}
        <tr><td style="font:700 14px {FONT};color:#2b3538;letter-spacing:1px;padding:0 0 6px;text-align:center">
          {escape(c["org"].upper())}
        </td></tr>
        {"".join(
            f'<tr><td style="font:400 12px {SERIF};color:#2b3538;text-align:center;padding:1px 0">'
            f'{_link(r["value"], r.get("href"), "#2b3538")}</td></tr>'
            for r in c["rows"][:3]
        )}
        <tr><td align="center" style="padding:10px 0 0">{_qr_block(c, 74, "Scan to save")}</td></tr>
      </table>
    </td>
  </tr>
</table>"""


def minimal(c: dict) -> str:
    """A photo, a rule and plain rows. Quietest of the five."""
    photo = (
        f'<img src="{escape(c["photo_url"], quote=True)}" alt="{escape(c["name"])}" width="92" '
        'height="92" style="display:block;border:0;width:92px;height:92px;border-radius:46px" />'
        if c["photo_url"]
        else _logo_img(c, 60)
    )
    return f"""<table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;max-width:540px">
  <tr>
    {f'<td style="padding:0 20px 0 0;vertical-align:top">{photo}</td>' if photo else ""}
    <td style="vertical-align:top">
      <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">
        <tr><td style="font:700 16px {FONT};color:#111111;padding:0 0 3px">{escape(c["name"])}</td></tr>
        <tr><td style="font:400 13px {FONT};color:#444444">{escape(c["job"])}</td></tr>
        <tr><td style="font:400 13px {FONT};color:#444444;padding:0 0 10px">{escape(c["org"])}</td></tr>
        <tr><td style="padding:0 0 10px">
          <table cellpadding="0" cellspacing="0" border="0"
                 style="border-collapse:collapse;border-top:1px solid {c["accent"]};width:220px;font-size:0;line-height:0">
            <tr><td>&nbsp;</td></tr></table>
        </td></tr>
        <tr><td><table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">{_rows_plain(c, 12)}</table></td></tr>
        <tr><td style="padding:12px 0 0">
          <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">
            <tr>
              <td style="padding:0 10px 0 0">{_qr_block(c, 64, "Scan to save")}</td>
              <td style="font:400 11px {FONT};color:#7b8689;vertical-align:middle">
                {_link("Open my contact card", c["card_url"], c["accent"], bold=True)}
              </td>
            </tr>
          </table>
        </td></tr>
      </table>
    </td>
  </tr>
</table>"""


def compact(c: dict) -> str:
    """One dark strip. Fits under a short reply without crowding it."""
    inline = " &nbsp;·&nbsp; ".join(
        _link(r["value"], r.get("href"), "#dfe9ea") for r in c["rows"][:4]
    )
    return f"""<table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;max-width:600px">
  <tr>
    <td bgcolor="#0d1315" style="background:#0d1315;padding:16px 18px;vertical-align:middle">
      <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">
        <tr>
          {f'<td style="padding:0 14px 0 0;vertical-align:middle">{_logo_img(c, 30)}</td>' if c["logo_url"] else ""}
          <td style="vertical-align:middle;border-left:2px solid {c["accent"]};padding:0 0 0 14px">
            <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">
              <tr><td style="font:700 15px {FONT};color:#ffffff">{escape(c["name"])}</td></tr>
              <tr><td style="font:400 12px {FONT};color:{c["accent"]};padding:1px 0 6px">{escape(c["title_line"])}</td></tr>
              <tr><td style="font:400 12px {FONT};color:#dfe9ea">{inline}</td></tr>
            </table>
          </td>
          <td style="padding:0 0 0 16px;vertical-align:middle">
            <a href="{escape(c["card_url"], quote=True)}">
              <img src="{escape(c["qr_url"], quote=True)}" alt="Scan to save my details" width="70" height="70"
                   style="display:block;border:0;width:70px;height:70px;background:#ffffff;padding:4px" />
            </a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>"""


RENDERERS = {
    "classic": classic,
    "banner": banner,
    "panels": panels,
    "minimal": minimal,
    "compact": compact,
}


def build(
    contact: dict,
    rows: list[dict],
    company: dict,
    api_base: str | None = None,
    template: str = DEFAULT_TEMPLATE,
) -> str:
    """Render one signature. `rows` are the display rows the card already builds."""
    render = RENDERERS.get(template, classic)
    return render(_ctx(contact, rows, company, api_base))
