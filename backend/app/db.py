"""SQLite access.

Stdlib sqlite3, no ORM and no migration framework. There are five
tables now rather than one, which is still comfortably inside what plain SQL
handles. Ceiling: once schema changes need to preserve production data, this
wants Alembic (or an equivalent) rather than CREATE TABLE IF NOT EXISTS.
"""

from __future__ import annotations

import os
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SCHEMA = ROOT / "schema.sql"


def db_path() -> Path:
    """Resolved per call so tests can point VCARD_DB at a tmpdir."""
    return Path(os.environ.get("VCARD_DB") or ROOT.parent / "app.db")


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(db_path())
    conn.row_factory = sqlite3.Row
    # Off by default in sqlite, and every cascade delete here depends on it.
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def _drop_user_roles(conn: sqlite3.Connection) -> None:
    """Collapse the old super/company-admin split: every admin spans everything.

    SQLite cannot drop a column that a CHECK constraint mentions, so the table
    is rebuilt. Row ids are preserved, which keeps open sessions valid.
    """
    columns = [row[1] for row in conn.execute("PRAGMA table_info(users)")]
    if "role" not in columns and "company_id" not in columns:
        return
    conn.execute("PRAGMA foreign_keys = OFF")
    conn.executescript(
        """
        CREATE TABLE users_rebuilt (
          id            INTEGER PRIMARY KEY AUTOINCREMENT,
          email         TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          name          TEXT,
          created_at    TEXT NOT NULL
        );
        INSERT INTO users_rebuilt (id, email, password_hash, name, created_at)
          SELECT id, email, password_hash, name, created_at FROM users;
        DROP TABLE users;
        ALTER TABLE users_rebuilt RENAME TO users;
        """
    )
    conn.execute("PRAGMA foreign_keys = ON")


def _widen_event_kinds(conn: sqlite3.Connection) -> None:
    """Let a card report the two newest things done with it: saved as a PDF,
    and details exchanged.

    The kinds are a CHECK constraint, and SQLite can only change one by
    rebuilding the table. Row ids are preserved, so the analytics keep adding
    up across the migration.
    """
    row = conn.execute(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'card_events'"
    ).fetchone()
    if row is None or "'exchange'" in row[0]:
        return
    conn.execute("PRAGMA foreign_keys = OFF")
    conn.executescript(
        """
        CREATE TABLE card_events_rebuilt (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
          kind       TEXT NOT NULL CHECK (kind IN
                       ('view','save','qr','signature','call','email','website','map','share',
                        'pdf','exchange')),
          at         TEXT NOT NULL,
          source     TEXT,
          device     TEXT,
          visitor    TEXT
        );
        INSERT INTO card_events_rebuilt (id, contact_id, kind, at, source, device, visitor)
          SELECT id, contact_id, kind, at, source, device, visitor FROM card_events;
        DROP TABLE card_events;
        ALTER TABLE card_events_rebuilt RENAME TO card_events;
        CREATE INDEX IF NOT EXISTS idx_events_contact ON card_events(contact_id, at);
        """
    )
    conn.execute("PRAGMA foreign_keys = ON")


def _widen_media_kinds(conn: sqlite3.Connection) -> None:
    """Let the showcase hold a link button beside its pictures and videos.

    Same story as the event kinds: the list is a CHECK constraint, so the
    table has to be rebuilt to add to it. Run after the columns are added,
    because the copy below names them.
    """
    row = conn.execute(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'company_media'"
    ).fetchone()
    if row is None or "'link'" in row[0]:
        return
    conn.execute("PRAGMA foreign_keys = OFF")
    conn.executescript(
        """
        CREATE TABLE company_media_rebuilt (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
          kind       TEXT NOT NULL CHECK (kind IN ('image','video','link')),
          path       TEXT,
          url        TEXT,
          caption    TEXT,
          position   INTEGER NOT NULL DEFAULT 0,
          fill       INTEGER NOT NULL DEFAULT 1,
          border     INTEGER NOT NULL DEFAULT 0
        );
        INSERT INTO company_media_rebuilt
            (id, company_id, kind, path, url, caption, position, fill, border)
          SELECT id, company_id, kind, path, url, caption, position, fill, border
            FROM company_media;
        DROP TABLE company_media;
        ALTER TABLE company_media_rebuilt RENAME TO company_media;
        CREATE INDEX IF NOT EXISTS idx_media_company ON company_media(company_id);
        """
    )
    conn.execute("PRAGMA foreign_keys = ON")


def _add_missing_columns(conn: sqlite3.Connection, table: str, columns: dict[str, str]) -> None:
    """Bring an existing table up to the current schema without losing rows."""
    present = {row[1] for row in conn.execute(f"PRAGMA table_info({table})")}
    for name, decl in columns.items():
        if name not in present:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {name} {decl}")  # noqa: S608


def _add_company_branches(conn: sqlite3.Connection) -> None:
    """Let one company have several branches.

    name used to be UNIQUE, which forbids two branches sharing a name, and
    SQLite cannot drop a constraint in place. Rebuild, keeping ids so the
    contacts pointing at them stay valid.
    """
    columns = [row[1] for row in conn.execute("PRAGMA table_info(companies)")]
    if "branch" in columns:
        return
    carried = [c for c in columns if c != "id"]
    conn.execute("PRAGMA foreign_keys = OFF")
    conn.execute(
        """
        CREATE TABLE companies_rebuilt (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          name       TEXT NOT NULL,
          branch     TEXT NOT NULL DEFAULT '',
          slug       TEXT NOT NULL UNIQUE,
          phone      TEXT,
          email      TEXT,
          website    TEXT,
          street     TEXT,
          city       TEXT,
          region     TEXT,
          postal     TEXT,
          country    TEXT,
          created_at TEXT NOT NULL,
          UNIQUE (name, branch)
        )
        """
    )
    cols = ", ".join(carried)
    conn.execute(
        f"INSERT INTO companies_rebuilt (id, {cols}) SELECT id, {cols} FROM companies"  # noqa: S608
    )
    conn.execute("DROP TABLE companies")
    conn.execute("ALTER TABLE companies_rebuilt RENAME TO companies")
    conn.execute("PRAGMA foreign_keys = ON")


def _accent_to_palette(conn: sqlite3.Connection) -> None:
    """Fold the old single `accent` into the `accents` palette and drop it."""
    columns = {row[1] for row in conn.execute("PRAGMA table_info(companies)")}
    if "accent" not in columns:
        return
    conn.execute(
        "UPDATE companies SET accents = json_array(accent) "
        "WHERE accent IS NOT NULL AND (accents IS NULL OR accents = '')"
    )
    conn.execute("ALTER TABLE companies DROP COLUMN accent")


def init() -> None:
    with connect() as conn:
        conn.executescript(SCHEMA.read_text())
        _drop_user_roles(conn)
        _add_company_branches(conn)
        _add_missing_columns(
            conn,
            "companies",
            {
                **{c: "TEXT" for c in
                   ("phone", "email", "website", "street", "city", "region", "postal",
                    "country", "logo_path", "accents")},
                "theme": "TEXT NOT NULL DEFAULT 'plain'",
                "logo_position": "TEXT NOT NULL DEFAULT 'top-center'",
                "logo_scale": "INTEGER NOT NULL DEFAULT 100",
                "language": "TEXT NOT NULL DEFAULT 'en'",
                "wallpaper_path": "TEXT",
                "wallpaper_fit": "TEXT NOT NULL DEFAULT 'cover'",
                "font": "TEXT NOT NULL DEFAULT 'poppins'",
                "type_scale": "TEXT NOT NULL DEFAULT 'normal'",
                # The banner across the head of the card. Separate from the
                # wallpaper, which dresses the page behind it: one is the
                # card's own design, the other is the room it sits in.
                "cover_path": "TEXT",
                # A picture for the card itself, behind its own content. The
                # wallpaper fills the screen around the card; this fills the
                # card, so a company can have either, both, or neither.
                "card_bg_path": "TEXT",
                "photo_shape": "TEXT NOT NULL DEFAULT 'square'",
                "photo_align": "TEXT NOT NULL DEFAULT 'left'",
                "photo_size": "TEXT NOT NULL DEFAULT 'medium'",
                # Null means follow the palette, which is what most cards want.
                "icon_colour": "TEXT",
                "footer_rule": "TEXT",
                "show_qr": "INTEGER NOT NULL DEFAULT 1",
                "show_qr_download": "INTEGER NOT NULL DEFAULT 1",
                "favicon_path": "TEXT",
                "photo_path": "TEXT",
                "photo_small_path": "TEXT",
                "require_consent": "INTEGER NOT NULL DEFAULT 0",
                "public_sharing": "INTEGER NOT NULL DEFAULT 1",
                "allow_indexing": "INTEGER NOT NULL DEFAULT 0",
                "allow_save": "INTEGER NOT NULL DEFAULT 1",
                "show_company_name": "INTEGER NOT NULL DEFAULT 1",
                "show_branch": "INTEGER NOT NULL DEFAULT 1",
                "share_message": "TEXT",
                "about": "TEXT",
                "notify_to": "TEXT",
                "notify_created": "INTEGER NOT NULL DEFAULT 1",
                "notify_updated": "INTEGER NOT NULL DEFAULT 0",
                "updated_at": "TEXT",
            },
        )
        _accent_to_palette(conn)
        _add_missing_columns(
            conn,
            "users",
            {
                "disabled": "INTEGER NOT NULL DEFAULT 0",
                "photo_path": "TEXT",
                "totp_secret": "TEXT",
                "totp_enabled": "INTEGER NOT NULL DEFAULT 0",
            },
        )
        _add_missing_columns(conn, "sessions", {"pending_2fa": "INTEGER NOT NULL DEFAULT 0"})
        _add_missing_columns(conn, "card_events", {"device": "TEXT", "visitor": "TEXT"})
        _widen_event_kinds(conn)
        _add_missing_columns(
            conn,
            "company_media",
            {
                "fill": "INTEGER NOT NULL DEFAULT 1",
                "border": "INTEGER NOT NULL DEFAULT 0",
            },
        )
        _widen_media_kinds(conn)
        _add_missing_columns(
            conn,
            "contacts",
            {
                # A card holder's own login. Issued by an admin; there is no
                # self-registration.
                "login_email": "TEXT",
                "password_hash": "TEXT",
                "portal_disabled": "INTEGER NOT NULL DEFAULT 0",
                "signature_template": "TEXT NOT NULL DEFAULT 'classic'",
            },
        )
        # The single-table prototype stored cards with no owner. There is no
        # company to attach them to, so they are left in place, unused.
        legacy = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='cards'"
        ).fetchone()
        if legacy:
            conn.execute("ALTER TABLE cards RENAME TO cards_v1_unowned")
