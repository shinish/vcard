"""What the cards did, counted out of card_events.

One window query serves both readers: an admin looking at a company (or at
everything) and a card holder looking at their own card. The scope is the only
difference, so it is the only parameter — the counting, the zero-filling and
the comparison with the window before are written once.

No IP address is stored: the visitor figure counts a salted hash that is
re-salted every day, so the same phone on two days counts twice and nobody can
be followed between them. There is no country here — that would need an
IP-geolocation provider this app does not have.
"""

from __future__ import annotations

from datetime import date, timedelta

from .db import connect

# Windows the UI offers. Anything else is refused by the routes rather than
# clamped, so a typo in a URL cannot quietly answer about the wrong period.
DAYS = (7, 14, 30, 90, 365)

JOINED = "FROM card_events e JOIN contacts c ON c.id = e.contact_id"

# Plain words for the event kinds, for anywhere a count has to read as prose.
WORDS = {
    "view": "Card opened",
    "save": "Saved to contacts",
    "qr": "QR code",
    "signature": "Email signature",
    "call": "Phone call",
    "email": "Email",
    "website": "Website",
    "map": "Map or directions",
    "share": "Shared",
}

COUNTS = (
    "SELECT COUNT(*) FILTER (WHERE e.kind = 'view') AS views, "
    "COUNT(*) FILTER (WHERE e.kind != 'view') AS clicks, "
    "COUNT(*) FILTER (WHERE e.kind = 'save') AS saves, "
    "COUNT(*) FILTER (WHERE e.kind = 'share') AS shares, "
    "COUNT(DISTINCT e.contact_id) AS active_cards, "
    "COUNT(DISTINCT e.visitor) FILTER (WHERE e.kind = 'view') AS visitors "
)


def _change(now: int, before: int) -> float | None:
    """Percent change, or None when there is nothing to compare against."""
    if not before:
        return None
    return round((now - before) * 100 / before, 1)


def buckets(first: date, last: date, grain: str) -> list[str]:
    """Every label between two dates, so a quiet period still draws."""
    out: list[str] = []
    step = first
    while step <= last:
        out.append(label_of(step, grain))
        step += timedelta(days=1)
    # Weeks and months repeat as the days walk past; keep the first of each.
    seen: dict[str, None] = {}
    for item in out:
        seen.setdefault(item, None)
    return list(seen)


def label_of(day: date, grain: str) -> str:
    if grain == "month":
        return day.strftime("%Y-%m")
    if grain == "week":
        monday = day - timedelta(days=day.weekday())
        return monday.isoformat()
    return day.isoformat()


# How a label is cut out of the stored timestamp, per grain. Weeks are the odd
# one out: SQLite has no "monday of this week", so the day is bucketed in
# Python instead and the SQL groups by day.
GRAIN_SQL = {
    "day": "substr(e.at, 1, 10)",
    "week": "substr(e.at, 1, 10)",
    "month": "substr(e.at, 1, 7)",
}


def window(
    days: int = 30,
    *,
    company_id: int | None = None,
    contact_id: int | None = None,
    top: int = 10,
    first: date | None = None,
    last: date | None = None,
    grain: str = "day",
) -> dict:
    """Totals, a series, the actions and the sources for one window.

    Either a number of days back from today, or an explicit pair of dates.
    The window before it is the same length again, immediately before.
    """
    if grain not in GRAIN_SQL:
        grain = "day"
    today = date.today()
    if first and last:
        span = (last - first).days + 1
        begin, finish = first, last
    else:
        span = days
        begin, finish = today - timedelta(days=days - 1), today
    start = str(begin)
    earlier = str(begin - timedelta(days=span))
    # Timestamps are ISO, so a date string compares correctly against them; the
    # end needs the whole of its last day, hence the day after.
    stop = str(finish + timedelta(days=1))

    scope = ""
    narrow: tuple = ()
    if contact_id is not None:
        scope, narrow = " AND e.contact_id = ?", (contact_id,)
    elif company_id is not None:
        scope, narrow = " AND c.company_id = ?", (company_id,)

    counts = f"{COUNTS}{JOINED} WHERE e.at >= ? AND e.at < ?{scope}"

    with connect() as conn:
        totals = dict(conn.execute(counts, (start, stop, *narrow)).fetchone())
        before = dict(conn.execute(counts, (earlier, start, *narrow)).fetchone())
        rows: dict[str, dict] = {}
        for r in conn.execute(
            f"SELECT {GRAIN_SQL[grain]} AS day, "
            "COUNT(*) FILTER (WHERE e.kind = 'view') AS views, "
            "COUNT(*) FILTER (WHERE e.kind != 'view') AS clicks, "
            "COUNT(*) FILTER (WHERE e.kind = 'save') AS saves, "
            "COUNT(*) FILTER (WHERE e.kind = 'share') AS shares "
            f"{JOINED} WHERE e.at >= ? AND e.at < ?{scope} GROUP BY day",
            (start, stop, *narrow),
        ):
            key = r["day"]
            if grain == "week":
                key = label_of(date.fromisoformat(r["day"]), "week")
            bucket = rows.setdefault(key, {"views": 0, "clicks": 0, "saves": 0, "shares": 0})
            for column in ("views", "clicks", "saves", "shares"):
                bucket[column] += r[column]
        by_kind = (
            f"SELECT e.kind, COUNT(*) AS n {JOINED} "
            f"WHERE e.at >= ? AND e.at < ? AND e.kind != 'view'{scope} "
            "GROUP BY e.kind ORDER BY n DESC"
        )
        earlier_kinds = {
            r["kind"]: r["n"] for r in conn.execute(by_kind, (earlier, start, *narrow))
        }
        actions = [
            {**dict(r), "change": _change(r["n"], earlier_kinds.get(r["kind"], 0))}
            for r in conn.execute(by_kind, (start, stop, *narrow))
        ]
        sources = [
            dict(r)
            for r in conn.execute(
                "SELECT COALESCE(NULLIF(e.source, ''), 'direct link') AS source, "
                f"COUNT(*) AS n {JOINED} WHERE e.at >= ? AND e.at < ? AND e.kind = 'view'{scope} "
                "GROUP BY source ORDER BY n DESC LIMIT 8",
                (start, stop, *narrow),
            )
        ]
        devices = [
            dict(r)
            for r in conn.execute(
                "SELECT COALESCE(NULLIF(e.device, ''), 'unknown') AS device, "
                f"COUNT(*) AS n {JOINED} WHERE e.at >= ? AND e.at < ? AND e.kind = 'view'{scope} "
                "GROUP BY device ORDER BY n DESC",
                (start, stop, *narrow),
            )
        ]
        # The same per-card counts for the window before, so each row can be
        # shown against what it was doing last period.
        before_cards = {
            r["id"]: dict(r)
            for r in conn.execute(
                "SELECT c.id, "
                "COUNT(*) FILTER (WHERE e.kind = 'view') AS views, "
                "COUNT(*) FILTER (WHERE e.kind != 'view') AS clicks, "
                "COUNT(*) FILTER (WHERE e.kind = 'save') AS saves "
                f"{JOINED} WHERE e.at >= ? AND e.at < ?{scope} GROUP BY c.id",
                (earlier, start, *narrow),
            )
        }
        busiest = [
            dict(r)
            for r in conn.execute(
                "SELECT c.id, c.public_id, c.first_name, c.last_name, c.job_title, "
                "c.photo_path, co.name AS company, co.branch, "
                "COUNT(*) FILTER (WHERE e.kind = 'view') AS views, "
                "COUNT(*) FILTER (WHERE e.kind != 'view') AS clicks, "
                "COUNT(*) FILTER (WHERE e.kind = 'save') AS saves "
                f"{JOINED} JOIN companies co ON co.id = c.company_id "
                f"WHERE e.at >= ? AND e.at < ?{scope} "
                "GROUP BY c.id ORDER BY views DESC, clicks DESC LIMIT ?",
                (start, stop, *narrow, top),
            )
        ]
        born = (
            "SELECT c.created_at AS at FROM contacts c "
            "WHERE c.created_at >= ? AND c.created_at < ?"
        )
        if company_id is not None and contact_id is None:
            born += " AND c.company_id = ?"
            born_args: tuple = (company_id,)
        elif contact_id is not None:
            born += " AND c.id = ?"
            born_args = (contact_id,)
        else:
            born_args = ()
        made: dict[str, int] = {}
        for r in conn.execute(born, (start, stop, *born_args)):
            key = label_of(date.fromisoformat(r["at"][:10]), grain)
            made[key] = made.get(key, 0) + 1
        new_cards = sum(made.values())
        new_before = len(
            conn.execute(born, (earlier, start, *born_args)).fetchall()
        )

        if contact_id is not None:
            cards = 1
        else:
            cards = conn.execute(
                "SELECT COUNT(*) AS n FROM contacts c"  # noqa: S608 — the only
                # variable part is a fixed clause; every value is a placeholder
                + ("" if company_id is None else " WHERE c.company_id = ?"),
                () if company_id is None else (company_id,),
            ).fetchone()["n"]

    # Zero-fill: a quiet day still has to draw as a point, or the line joins
    # across the gap and reads as traffic that never happened.
    series = [
        {
            "day": key,
            **{
                column: rows.get(key, {}).get(column, 0)
                for column in ("views", "clicks", "saves", "shares")
            },
            "new_cards": made.get(key, 0),
        }
        for key in buckets(begin, finish, grain)
    ]

    # A face and the change per column, which is what the table shows.
    busiest = [
        {
            # the stored filename is no business of the browser's; the URL is
            **{k: v for k, v in row.items() if k != "photo_path"},
            "photo_url": (
                f"/api/public/{row['public_id']}/photo.jpg" if row["photo_path"] else None
            ),
            "change": {
                key: _change(row[key], before_cards.get(row["id"], {}).get(key, 0))
                for key in ("views", "clicks", "saves")
            },
        }
        for row in busiest
    ]

    return {
        "days": span,
        "grain": grain,
        "from": start,
        "to": str(finish),
        "totals": {**totals, "cards": cards, "new_cards": new_cards},
        "change": {
            **{
                k: _change(totals[k], before[k])
                for k in ("views", "clicks", "saves", "shares", "visitors", "active_cards")
            },
            "new_cards": _change(new_cards, new_before),
        },
        "series": series,
        "actions": actions,
        "sources": sources,
        "devices": devices,
        "top": busiest,
    }
