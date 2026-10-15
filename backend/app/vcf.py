"""vCard 3.0 serializer.

Hand-rolled rather than pulling in vobject (unmaintained) because the subset we
need is ~40 lines. Phones are strict and silent about this format: LF-only line
endings, an unfolded long line, or an unescaped ";" makes the import drop fields
or fail outright with no error shown to the user.
"""

from __future__ import annotations

import base64
import json
from datetime import UTC, datetime

CRLF = "\r\n"
MAX_OCTETS = 75  # RFC 2425 §5.8.1


def escape(value: str) -> str:
    """Escape a single text value. Backslash first, or we double-escape the rest."""
    return (
        value.replace("\\", "\\\\")
        .replace(";", "\\;")
        .replace(",", "\\,")
        .replace("\r\n", "\\n")
        .replace("\n", "\\n")
        .replace("\r", "\\n")
    )


def structured(*components: str | None) -> str:
    """Join a structured value (N, ADR, ORG), escaping each component first.

    Escaping before the join is the whole point: a comma in a street address
    would otherwise read as a component separator and silently split the field.
    """
    return ";".join(escape(c or "") for c in components)


def fold(line: str) -> str:
    """Fold to 75 octets, continuation lines prefixed with one space.

    Folds over the UTF-8 byte stream (the limit is octets, not characters) but
    never mid-sequence, or a name like "José" arrives mangled on the phone.
    """
    raw = line.encode("utf-8")
    if len(raw) <= MAX_OCTETS:
        return line
    chunks: list[str] = []
    start, limit = 0, MAX_OCTETS
    while start < len(raw):
        end = min(start + limit, len(raw))
        # 0b10xxxxxx is a UTF-8 continuation byte: back up to the char boundary
        while start < end < len(raw) and raw[end] & 0xC0 == 0x80:
            end -= 1
        chunks.append(raw[start:end].decode("utf-8"))
        start = end
        limit = MAX_OCTETS - 1  # the leading space counts toward the 75
    return (CRLF + " ").join(chunks)

# Apple writes standard labels as TYPE parameters and anything else as an
# "itemN." group with an X-ABLabel line. Both iOS and Android read the group
# form, which is what makes a custom label survive the round trip.
TYPE_PARAMS = {
    "phone": {
        "mobile": "CELL,VOICE",
        "iPhone": "IPHONE,CELL,VOICE",
        "home": "HOME,VOICE",
        "work": "WORK,VOICE",
        "main": "MAIN",
        "home fax": "HOME,FAX",
        "work fax": "WORK,FAX",
        "pager": "PAGER",
        "other": "OTHER,VOICE",
    },
    "email": {"home": "INTERNET,HOME", "work": "INTERNET,WORK", "other": "INTERNET,OTHER"},
    "address": {"home": "HOME", "work": "WORK", "other": "OTHER"},
}

PROPERTY = {"phone": "TEL", "email": "EMAIL", "url": "URL", "address": "ADR"}


class _Lines:
    """Collects content lines, handing out itemN groups for custom labels."""

    def __init__(self) -> None:
        self.out: list[str] = []
        self._item = 0

    def add(self, line: str) -> None:
        self.out.append(line)

    def labelled(self, prop: str, value: str, label: str) -> None:
        """Emit a property carrying a label the vCard TYPE vocabulary lacks."""
        self._item += 1
        tag = f"item{self._item}"
        self.out.append(f"{tag}.{prop}:{value}")
        self.out.append(f"{tag}.X-ABLabel:{escape(label)}")


def _address_value(raw: str) -> str:
    """Address components are stored as JSON; render the 7-part ADR value."""
    try:
        parts = json.loads(raw)
    except (TypeError, ValueError):
        parts = {}
    if not isinstance(parts, dict):
        parts = {}
    return structured(
        "",
        "",
        parts.get("street"),
        parts.get("city"),
        parts.get("region"),
        parts.get("postal"),
        parts.get("country"),
    )


def build(contact: dict, fields: list[dict] | None = None, photo: bytes | None = None) -> str:
    """Render a contact as vCard 3.0.

    3.0 rather than 4.0 because it is what iOS and Android import most
    reliably, and the photo is embedded as base64 rather than referenced by URL
    because phones ignore a PHOTO that points at a URL.
    """
    get = lambda k: (contact.get(k) or "").strip()  # noqa: E731
    fields = fields or []

    first, last = get("first_name"), get("last_name")
    middle, prefix, suffix = get("middle_name"), get("prefix"), get("suffix")
    full = " ".join(p for p in (prefix, first, middle, last, suffix) if p)

    L = _Lines()
    L.add("BEGIN:VCARD")
    L.add("VERSION:3.0")
    L.add("N:" + structured(last, first, middle, prefix, suffix))
    L.add("FN:" + escape(full))
    if get("nickname"):
        L.add("NICKNAME:" + escape(get("nickname")))
    if get("phonetic_first"):
        L.add("X-PHONETIC-FIRST-NAME:" + escape(get("phonetic_first")))
    if get("phonetic_last"):
        L.add("X-PHONETIC-LAST-NAME:" + escape(get("phonetic_last")))
    if get("org") or get("department"):
        L.add("ORG:" + structured(get("org"), get("department")))
    if get("job_title"):
        L.add("TITLE:" + escape(get("job_title")))

    for field in sorted(fields, key=lambda f: (f.get("position") or 0, f.get("id") or 0)):
        kind, label = field.get("kind"), (field.get("label") or "other")
        raw = (field.get("value") or "").strip()
        if not raw or kind not in PROPERTY and kind not in ("date", "social", "im", "relation"):
            continue

        if kind == "address":
            value = _address_value(raw)
            param = TYPE_PARAMS["address"].get(label)
            if param:
                L.add(f"ADR;TYPE={param}:{value}")
            else:
                L.labelled("ADR", value, label)
        elif kind in ("phone", "email"):
            value = escape(raw)
            param = TYPE_PARAMS[kind].get(label)
            if param:
                L.add(f"{PROPERTY[kind]};TYPE={param}:{value}")
            else:
                L.labelled(PROPERTY[kind], value, label)
        elif kind == "url":
            value = escape(raw)
            if label in ("homepage", "other"):
                L.add("URL:" + value)
            else:
                L.labelled("URL", value, label)
        elif kind == "date":
            value = escape(raw)
            if label == "birthday":
                L.add("BDAY:" + value)
            else:
                L.labelled("X-ABDATE", value, label)
        elif kind == "social":
            L.add(f"X-SOCIALPROFILE;TYPE={escape(label)}:{escape(raw)}")
        elif kind == "im":
            L.add(f"IMPP;X-SERVICE-TYPE={escape(label)}:{escape(raw)}")
        elif kind == "relation":
            L.labelled("X-ABRELATEDNAMES", escape(raw), label)

    if get("note"):
        L.add("NOTE:" + escape(get("note")))
    if photo:
        L.add("PHOTO;ENCODING=b;TYPE=JPEG:" + base64.b64encode(photo).decode("ascii"))

    L.add("REV:" + datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"))
    L.add("END:VCARD")
    return CRLF.join(fold(line) for line in L.out) + CRLF
