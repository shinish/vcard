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
DAYS = (7, 30, 90, 365)

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


def window(
    days: int = 30,
    *,
    company_id: int | None = None,
    contact_id: int | None = None,
    top: int = 10,
) -> dict:
    """Totals, a daily series, the actions and the sources for one window."""
    today = date.today()
    start = str(today - timedelta(days=days - 1))
    earlier = str(today - timedelta(days=2 * days - 1))

    scope = ""
    narrow: tuple = ()
    if contact_id is not None:
        scope, narrow = " AND e.contact_id = ?", (contact_id,)
    elif company_id is not None:
        scope, narrow = " AND c.company_id = ?", (company_id,)

    counts = f"{COUNTS}{JOINED} WHERE e.at >= ?{scope}"

    with connect() as conn:
        totals = dict(conn.execute(counts, (start, *narrow)).fetchone())
        before = dict(
            conn.execute(
                counts.replace("WHERE e.at >= ?", "WHERE e.at >= ? AND e.at < ?"),
                (earlier, start, *narrow),
            ).fetchone()
        )
        rows = {
            r["day"]: dict(r)
            for r in conn.execute(
                "SELECT substr(e.at, 1, 10) AS day, "
                "COUNT(*) FILTER (WHERE e.kind = 'view') AS views, "
                "COUNT(*) FILTER (WHERE e.kind != 'view') AS clicks "
                f"{JOINED} WHERE e.at >= ?{scope} GROUP BY day",
                (start, *narrow),
            )
        }
        by_kind = (
            f"SELECT e.kind, COUNT(*) AS n {JOINED} "
            f"WHERE e.at >= ?{{window}} AND e.kind != 'view'{scope} "
            "GROUP BY e.kind ORDER BY n DESC"
        )
        earlier_kinds = {
            r["kind"]: r["n"]
            for r in conn.execute(
                by_kind.format(window=" AND e.at < ?"), (earlier, start, *narrow)
            )
        }
        actions = [
            {**dict(r), "change": _change(r["n"], earlier_kinds.get(r["kind"], 0))}
            for r in conn.execute(by_kind.format(window=""), (start, *narrow))
        ]
        sources = [
            dict(r)
            for r in conn.execute(
                "SELECT COALESCE(NULLIF(e.source, ''), 'direct link') AS source, "
                f"COUNT(*) AS n {JOINED} WHERE e.at >= ? AND e.kind = 'view'{scope} "
                "GROUP BY source ORDER BY n DESC LIMIT 8",
                (start, *narrow),
            )
        ]
        devices = [
            dict(r)
            for r in conn.execute(
                "SELECT COALESCE(NULLIF(e.device, ''), 'unknown') AS device, "
                f"COUNT(*) AS n {JOINED} WHERE e.at >= ? AND e.kind = 'view'{scope} "
                "GROUP BY device ORDER BY n DESC",
                (start, *narrow),
            )
        ]
        busiest = [
            dict(r)
            for r in conn.execute(
                "SELECT c.id, c.public_id, c.first_name, c.last_name, c.job_title, "
                "co.name AS company, co.branch, "
                "COUNT(*) FILTER (WHERE e.kind = 'view') AS views, "
                "COUNT(*) FILTER (WHERE e.kind != 'view') AS clicks, "
                "COUNT(*) FILTER (WHERE e.kind = 'save') AS saves "
                f"{JOINED} JOIN companies co ON co.id = c.company_id "
                f"WHERE e.at >= ?{scope} "
                "GROUP BY c.id ORDER BY views DESC, clicks DESC LIMIT ?",
                (start, *narrow, top),
            )
        ]
        if contact_id is not None:
            cards = 1
        else:
            cards = conn.execute(
                "SELECT COUNT(*) AS n FROM contacts c"  # noqa: S608 — the only
                # variable part is a fixed clause; every value is a placeholder
                + ("" if company_id is None else " WHERE c.company_id = ?"),
                () if company_id is None else (company_id,),
            ).fetchone()["n"]

    # Zero-fill: a day with no events still has to draw as a point, or the line
    # joins across the gap and reads as traffic that never happened.
    series = [
        {
            "day": (day := str(today - timedelta(days=days - 1 - step))),
            "views": rows.get(day, {}).get("views", 0),
            "clicks": rows.get(day, {}).get("clicks", 0),
        }
        for step in range(days)
    ]

    return {
        "days": days,
        "from": start,
        "to": str(today),
        "totals": {**totals, "cards": cards},
        "change": {
            k: _change(totals[k], before[k])
            for k in ("views", "clicks", "saves", "shares", "visitors")
        },
        "series": series,
        "actions": actions,
        "sources": sources,
        "devices": devices,
        "top": busiest,
    }
