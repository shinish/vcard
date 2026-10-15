"""Create the first super admin.

    uv run python -m app.bootstrap --email you@example.com

Run once on a fresh database. Without --password a strong one is generated and
printed; it is not stored anywhere else, so copy it before closing the shell.
"""

from __future__ import annotations

import argparse
import secrets
import sqlite3
import string
from datetime import UTC, datetime

from .auth import hash_password
from .db import connect, init


def main() -> int:
    parser = argparse.ArgumentParser(description="Create the first super admin")
    parser.add_argument("--email", required=True)
    parser.add_argument("--password")
    parser.add_argument("--name", default=None)
    parser.add_argument(
        "--force", action="store_true", help="update the account if it already exists"
    )
    args = parser.parse_args()

    init()
    password = args.password
    if not password:
        alphabet = string.ascii_letters + string.digits
        password = "".join(secrets.choice(alphabet) for _ in range(20))
    elif len(password) < 10:
        print("password must be at least 10 characters")
        return 1

    identifier = args.email.strip().lower()
    with connect() as conn:
        existing = conn.execute(
            "SELECT id FROM users WHERE email = ?", (identifier,)
        ).fetchone()
        if existing and not args.force:
            print(f"{identifier} already has an account; pass --force to reset it")
            return 1
        if existing:
            conn.execute(
                "UPDATE users SET password_hash = ?, name = COALESCE(?, name), role = 'super' "
                "WHERE id = ?",
                (hash_password(password), args.name, existing["id"]),
            )
            # any session opened with the old password stops working
            conn.execute("DELETE FROM sessions WHERE user_id = ?", (existing["id"],))
        else:
            try:
                conn.execute(
                    "INSERT INTO users (email, password_hash, name, role, company_id, created_at) "
                    "VALUES (?, ?, ?, 'super', NULL, ?)",
                    (identifier, hash_password(password), args.name, datetime.now(UTC).isoformat()),
                )
            except sqlite3.IntegrityError:
                print(f"{identifier} already has an account")
                return 1

    print(f"super admin {'updated' if existing else 'created'}\n  username: {identifier}")
    if not args.password:
        print(f"  password: {password}\n\nCopy that now; it is not recoverable.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
