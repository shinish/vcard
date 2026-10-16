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
