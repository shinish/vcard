"""QR rendering, optionally with the company logo in the middle.

A logo sitting over the centre destroys some of the code, so these are built
at error-correction level H, which can lose about 30% of the modules and still
decode. The logo is held to a fraction of that budget and given a quiet white
pad so the scanner sees a clean edge.
"""

from __future__ import annotations

import io
from pathlib import Path

import segno
from PIL import Image

# Share of the QR's width the logo may cover. H tolerates ~30% loss by area;
# 0.22 of the width is about 5% of the area, which leaves plenty of headroom.
LOGO_WIDTH_SHARE = 0.22
PAD_SHARE = 0.03


MAX_SAFE_SHARE = 0.26


def png_bytes(
    url: str,
    logo: Path | None = None,
    scale: int = 12,
    border: int = 3,
    logo_scale: int = 100,
) -> bytes:
    code = segno.make(url, error="h")
    buf = io.BytesIO()
    code.save(buf, kind="png", scale=scale, border=border, dark="#111111", light="#ffffff")
    if logo is None or not logo.exists():
        return buf.getvalue()

    buf.seek(0)
    base = Image.open(buf).convert("RGBA")
    mark = Image.open(logo).convert("RGBA")

    # The admin's size preference applies here too, but clamped: past about a
    # quarter of the width even level H stops decoding reliably.
    share = min(MAX_SAFE_SHARE, LOGO_WIDTH_SHARE * (logo_scale / 100))
    target = int(base.width * share)
    mark.thumbnail((target, target), Image.LANCZOS)

    pad = max(2, int(base.width * PAD_SHARE))
    plate = Image.new(
        "RGBA", (mark.width + pad * 2, mark.height + pad * 2), (255, 255, 255, 255)
    )
    plate.alpha_composite(mark, (pad, pad))

    base.alpha_composite(
        plate, ((base.width - plate.width) // 2, (base.height - plate.height) // 2)
    )

    out = io.BytesIO()
    base.convert("RGB").save(out, "PNG", optimize=True)
    return out.getvalue()


def svg_bytes(url: str, scale: int = 6, border: int = 2, dark: str = "#111111") -> bytes:
    """Inline SVG for the card itself; no logo, it is rendered small."""
    buf = io.BytesIO()
    segno.make(url, error="m").save(
        buf, kind="svg", scale=scale, border=border, dark=dark, light=None
    )
    return buf.getvalue()
