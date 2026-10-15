"""Shared contact read/write helpers used by both route modules."""

from __future__ import annotations

import json
import sqlite3
from datetime import UTC, datetime

from fastapi import HTTPException

from .db import connect
from .fields import ADDRESS_COORDS, ADDRESS_PARTS, KINDS, SINGLE
from .ids import new_public_id


def parse_fields(raw: str | None) -> list[dict]:
    """Validate the repeatable fields posted as a JSON array.

    A trust boundary: kind is checked against the allow-list because it reaches
    a CHECK constraint and the vCard writer, and labels are length-capped.
    """
    if not raw:
        return []
    try:
        data = json.loads(raw)
    except ValueError as e:
        raise HTTPException(422, "Fields must be a JSON array") from e
    if not isinstance(data, list):
        raise HTTPException(422, "Fields must be a JSON array")

    out: list[dict] = []
    for position, item in enumerate(data):
        if not isinstance(item, dict):
            raise HTTPException(422, "Each field must be an object")
        kind = item.get("kind")
        if kind not in KINDS:
            raise HTTPException(422, f"unknown field kind: {kind!r}")
        label = (str(item.get("label") or "other")).strip()[:60] or "other"

        if kind == "address":
            parts = item.get("value")
            if not isinstance(parts, dict):
                raise HTTPException(422, "An address value must be an object")
            cleaned = {k: str(parts.get(k) or "").strip() for k in ADDRESS_PARTS}
            if not any(cleaned.values()):
                continue
            for key in ADDRESS_COORDS:
                raw_coord = parts.get(key)
                if raw_coord in (None, ""):
                    continue
                try:
                    cleaned[key] = float(raw_coord)
                except (TypeError, ValueError) as e:
                    raise HTTPException(422, "Map coordinates must be numbers") from e
            value = json.dumps(cleaned)
        else:
            value = str(item.get("value") or "").strip()
            if not value:
                continue

        out.append({"kind": kind, "label": label, "value": value, "position": position})
    return out


def read_single(form) -> dict[str, str | None]:
    data = {k: (str(form.get(k) or "").strip() or None) for k in SINGLE}
    if not data["first_name"]:
        raise HTTPException(422, "A first name is required")
    return data


def write_fields(conn: sqlite3.Connection, contact_id: int, rows: list[dict]) -> None:
    conn.execute("DELETE FROM contact_fields WHERE contact_id = ?", (contact_id,))
    conn.executemany(
        "INSERT INTO contact_fields (contact_id, kind, label, value, position) "
        "VALUES (?, ?, ?, ?, ?)",
        [(contact_id, r["kind"], r["label"], r["value"], r["position"]) for r in rows],
    )


def create_contact(company_id: int, single: dict, rows: list[dict]) -> tuple[int, str]:
    public_id = new_public_id()
    now = datetime.now(UTC).isoformat()
    cols = ", ".join(SINGLE)
    marks = ", ".join(["?"] * len(SINGLE))
    with connect() as conn:
        cur = conn.execute(
            f"INSERT INTO contacts (public_id, company_id, created_at, updated_at, {cols}) "  # noqa: S608
            f"VALUES (?, ?, ?, ?, {marks})",  # column names come from a fixed tuple
            (public_id, company_id, now, now, *(single.get(c) for c in SINGLE)),
        )
        write_fields(conn, cur.lastrowid, rows)
    return cur.lastrowid, public_id


def update_contact(contact_id: int, single: dict, rows: list[dict]) -> None:
    sets = ", ".join(f"{c} = ?" for c in SINGLE)
    with connect() as conn:
        conn.execute(
            f"UPDATE contacts SET {sets}, updated_at = ? WHERE id = ?",  # noqa: S608
            (*(single.get(c) for c in SINGLE), datetime.now(UTC).isoformat(), contact_id),
        )
        write_fields(conn, contact_id, rows)


def field_rows(conn: sqlite3.Connection, contact_id: int) -> list[dict]:
    rows = conn.execute(
        "SELECT id, kind, label, value, position FROM contact_fields "
        "WHERE contact_id = ? ORDER BY position, id",
        (contact_id,),
    ).fetchall()
    return [dict(r) for r in rows]


def serialise(row: sqlite3.Row, fields: list[dict]) -> dict:
    """Public shape. Never includes internal ids or company ownership details."""
    out = {k: row[k] for k in SINGLE}
    out["public_id"] = row["public_id"]
    out["fields"] = [
        {
            "kind": f["kind"],
            "label": f["label"],
            "value": json.loads(f["value"]) if f["kind"] == "address" else f["value"],
        }
        for f in fields
    ]
    return out
