"""The card as a PDF, built rather than printed.

The browser's own print dialogue was doing this job, which meant a dialogue
every time, a page size nobody chose, and whatever headers and footers that
browser felt like adding. Laying the page out here instead means one page by
construction, no frame drawn anywhere, and real text that stays selectable
and searchable — none of which survives a screenshot.
"""

from __future__ import annotations

import io

from fpdf import FPDF

from . import qr
from .config import UPLOADS, public_base_url

# A4 portrait, in millimetres. The margin is generous on purpose: a card that
# reads like a document beats one crammed to the edges, and nothing is drawn
# at the boundary, so there is no border to remove.
PAGE = (210, 297)
MARGIN = 22
INK = (10, 20, 38)
SOFT = (104, 112, 128)
RULE = (222, 226, 234)


def _text(pdf: FPDF, size: float, style: str = "", colour: tuple = INK) -> None:
    pdf.set_font("Helvetica", style, size)
    pdf.set_text_color(*colour)


def build(row, fields: list[dict], company: dict | None = None) -> bytes:
    """One page: who they are, how to reach them, and a code to open the card."""
    pdf = FPDF(orientation="P", unit="mm", format="A4")
    # No auto page break: this is a single page by definition, and a stray
    # overflow should crowd rather than silently become a second sheet.
    pdf.set_auto_page_break(False)
    pdf.set_margins(MARGIN, MARGIN, MARGIN)
    pdf.add_page()
    width = PAGE[0] - MARGIN * 2

    y = MARGIN

    # The photo, when there is one, square and left of the name.
    photo = UPLOADS / row["photo_path"] if row["photo_path"] else None
    if photo and photo.is_file():
        pdf.image(str(photo), x=MARGIN, y=y, w=34, h=34)
        text_x = MARGIN + 42
    else:
        text_x = MARGIN

    name = " ".join(
        str(row[k]) for k in ("prefix", "first_name", "last_name") if row[k]
    ).strip()
    pdf.set_xy(text_x, y + 2)
    _text(pdf, 24, "B")
    pdf.cell(width - (text_x - MARGIN), 11, name, align="L")

    line = y + 14
    for value, size, colour in (
        (row["job_title"], 12, SOFT),
        (company.get("name") if company else row["org"], 12, INK),
    ):
        if not value:
            continue
        pdf.set_xy(text_x, line)
        _text(pdf, size, "", colour)
        pdf.cell(width - (text_x - MARGIN), 6, str(value), align="L")
        line += 6

    y = max(line, y + 38) + 6
    pdf.set_draw_color(*RULE)
    pdf.set_line_width(0.3)
    pdf.line(MARGIN, y, MARGIN + width, y)
    y += 9

    # Contact rows: the label above the value, so a long address can wrap
    # without the two colliding.
    for field in fields:
        value = field.get("value")
        if not value:
            continue
        if isinstance(value, dict):
            value = ", ".join(str(v) for v in value.values() if v)
        pdf.set_xy(MARGIN, y)
        _text(pdf, 8, "", SOFT)
        pdf.cell(width, 4, str(field.get("label") or field.get("kind") or "").upper())
        y += 4.5
        pdf.set_xy(MARGIN, y)
        _text(pdf, 12)
        pdf.multi_cell(width - 34, 5.5, str(value))
        y = max(pdf.get_y(), y + 5.5) + 4
        if y > PAGE[1] - MARGIN - 46:
            break  # leave room for the code; one page is the whole point

    # The QR, bottom right, as a picture of a vector code rather than a photo
    # of one. segno writes PNG; fpdf takes it from memory.
    link = f"{public_base_url()}/user/{row['public_id']}"
    code = io.BytesIO(qr.png_bytes(link, None))
    side = 32
    qr_y = PAGE[1] - MARGIN - side
    pdf.image(code, x=MARGIN + width - side, y=qr_y, w=side, h=side)

    pdf.set_xy(MARGIN, qr_y + side - 5)
    _text(pdf, 8, "", SOFT)
    pdf.cell(width - side - 4, 4, link)

    return bytes(pdf.output())
