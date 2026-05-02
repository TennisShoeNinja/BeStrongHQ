"""Schema migration tests for the athlete-portal data model.

Pins three guarantees so future ``migrate_db`` edits cannot silently
break existing instances:

1. A fresh DB has the new ``athlete_sessions`` table and the two new
   ``athletes`` columns (``portal_last_login_at``, ``portal_disabled``).
2. A pre-portal DB upgrades cleanly: the columns and table are added by
   ``migrate_db`` without losing existing rows.
3. ``migrate_db`` is idempotent — running it twice in a row on a current
   DB is a no-op and does not raise.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

from sqlalchemy import create_engine, text

from bestrong.models.database import init_db, migrate_db


def _columns(db_path: Path, table: str) -> set[str]:
    conn = sqlite3.connect(str(db_path))
    try:
        cur = conn.execute(f"PRAGMA table_info({table})")
        return {row[1] for row in cur.fetchall()}
    finally:
        conn.close()


def _tables(db_path: Path) -> set[str]:
    conn = sqlite3.connect(str(db_path))
    try:
        cur = conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
        return {row[0] for row in cur.fetchall()}
    finally:
        conn.close()


def test_fresh_db_has_portal_schema(tmp_path: Path) -> None:
    db = tmp_path / "fresh.db"
    init_db(db)

    athletes_cols = _columns(db, "athletes")
    assert "portal_last_login_at" in athletes_cols
    assert "portal_disabled" in athletes_cols

    assert "athlete_sessions" in _tables(db)
    session_cols = _columns(db, "athlete_sessions")
    assert {"id", "session_token", "athlete_id", "email", "expires_at"}.issubset(session_cols)


def test_legacy_db_upgrades_in_place(tmp_path: Path) -> None:
    """A pre-portal DB gains the new columns and table without losing rows."""
    db = tmp_path / "legacy.db"
    init_db(db)


    engine = create_engine(f"sqlite:///{db}")
    with engine.begin() as conn:

        conn.execute(text("ALTER TABLE athletes DROP COLUMN portal_last_login_at"))
        conn.execute(text("ALTER TABLE athletes DROP COLUMN portal_disabled"))
        conn.execute(text("DROP TABLE athlete_sessions"))


        conn.execute(
            text("INSERT INTO athletes (name) VALUES (:n)"),
            {"n": "Pre-portal Athlete"},
        )
    engine.dispose()


    assert "portal_last_login_at" not in _columns(db, "athletes")
    assert "athlete_sessions" not in _tables(db)


    migrate_db(db)


    athletes_cols = _columns(db, "athletes")
    assert "portal_last_login_at" in athletes_cols
    assert "portal_disabled" in athletes_cols
    assert "athlete_sessions" in _tables(db)


    engine = create_engine(f"sqlite:///{db}")
    with engine.connect() as conn:
        row = conn.execute(text("SELECT name, portal_disabled FROM athletes")).fetchone()
    engine.dispose()
    assert row is not None
    assert row[0] == "Pre-portal Athlete"
    assert row[1] == 0


def test_migrate_db_is_idempotent(tmp_path: Path) -> None:
    db = tmp_path / "idem.db"
    init_db(db)

    migrate_db(db)
    migrate_db(db)

    assert "athlete_sessions" in _tables(db)
    assert "portal_disabled" in _columns(db, "athletes")
