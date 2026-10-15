"""Photo upload handling.

A trust boundary: the client's filename and content-type are ignored entirely
and Pillow decides whether the bytes are an image at all. Re-encoding also
strips EXIF, which drops GPS coordinates out of phone photos for free.

One upload yields two files. The display copy is generous (up to 700 KB) and
feeds the card page. The embed copy is small on purpose: base64 inflates by a
third, and phones refuse or silently strip the photo from an oversized .vcf,
which would break the one thing the card exists to do.
"""

from __future__ import annotations

import io
from pathlib import Path

from PIL import Image, UnidentifiedImageError

MAX_UPLOAD_BYTES = 12 * 1024 * 1024

DISPLAY_EDGE = 1200
DISPLAY_BUDGET = 700 * 1024

EMBED_EDGE = 500
EMBED_BUDGET = 64 * 1024


class BadImage(ValueError):
    """Upload was not a usable image."""


def _open(raw: bytes) -> Image.Image:
    if not raw:
        raise BadImage("empty upload")
    if len(raw) > MAX_UPLOAD_BYTES:
        raise BadImage("image is larger than 12 MB")
    try:
        img = Image.open(io.BytesIO(raw))
        img.load()  # force a real decode; Image.open alone is lazy
    except Image.DecompressionBombError as e:
        raise BadImage("image dimensions are implausibly large") from e
    except (UnidentifiedImageError, OSError, ValueError) as e:
        raise BadImage("not a readable image") from e
    return img


def decode(raw: bytes) -> Image.Image:
    return _open(raw).convert("RGB")


def _write_within(img: Image.Image, dest: Path, edge: int, budget: int) -> int:
    """Save a JPEG that fits the byte budget, trading quality then size.

    Quality goes first because dropping pixels is what actually costs clarity;
    only if the budget still is not met does the image get smaller.
    """
    work = img.copy()
    work.thumbnail((edge, edge), Image.LANCZOS)
    dest.parent.mkdir(parents=True, exist_ok=True)

    for scale in (1.0, 0.8, 0.65, 0.5):
        candidate = work
        if scale < 1.0:
            size = (max(1, int(work.width * scale)), max(1, int(work.height * scale)))
            candidate = work.resize(size, Image.LANCZOS)
        for quality in (92, 86, 80, 74, 68, 60, 52, 45):
            buf = io.BytesIO()
            candidate.save(buf, "JPEG", quality=quality, optimize=True, progressive=True)
            if buf.tell() <= budget:
                dest.write_bytes(buf.getvalue())
                return buf.tell()

    # Smallest rung still over budget: keep the best we have rather than fail.
    dest.write_bytes(buf.getvalue())
    return buf.tell()


def save_pair(raw: bytes, display_dest: Path, embed_dest: Path) -> tuple[int, int]:
    """Write the card-page copy and the .vcf copy. Returns both byte sizes."""
    img = decode(raw)
    return (
        _write_within(img, display_dest, DISPLAY_EDGE, DISPLAY_BUDGET),
        _write_within(img, embed_dest, EMBED_EDGE, EMBED_BUDGET),
    )


LOGO_EDGE = 420
LOGO_BUDGET = 150 * 1024


def save_logo(raw: bytes, dest: Path) -> int:
    """Write a company logo as PNG.

    Kept as PNG rather than pushed through the JPEG path because a logo is
    nearly always transparent, and flattening it onto white leaves a visible
    box on any background but white.
    """
    img = _open(raw)
    img = img.convert("RGBA")
    img.thumbnail((LOGO_EDGE, LOGO_EDGE), Image.LANCZOS)
    dest.parent.mkdir(parents=True, exist_ok=True)
    img.save(dest, "PNG", optimize=True)

    if dest.stat().st_size > LOGO_BUDGET:
        # Too heavy: quantise the palette rather than lose resolution.
        img.convert("P", palette=Image.ADAPTIVE, colors=128).save(dest, "PNG", optimize=True)
    return dest.stat().st_size


WALLPAPER_EDGE = 1920
WALLPAPER_BUDGET = 500 * 1024


def save_wallpaper(raw: bytes, dest: Path) -> int:
    """Write the full-screen background behind a card.

    Bigger budget than a portrait because it covers a whole phone screen, but
    still capped: this loads before anyone can read the card.
    """
    return _write_within(decode(raw), dest, WALLPAPER_EDGE, WALLPAPER_BUDGET)


MEDIA_EDGE = 1280
MEDIA_BUDGET = 300 * 1024


def save_media(raw: bytes, dest: Path) -> int:
    """Write one picture from a company's showcase strip."""
    return _write_within(decode(raw), dest, MEDIA_EDGE, MEDIA_BUDGET)
