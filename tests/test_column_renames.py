"""Tests for the athletes table column-rename migration.

Older instance DBs were created when the time-off columns were named
``vacation_status`` / ``vacation_start`` / ``vacation_end``. Those have
since been renamed to ``availability_status`` / ``out_from`` /
``out_through``. ``migrate_db()`` runs ``ALTER TABLE RENAME COLUMN`` on
upgrade. The tests below pin the expected behavior so a future change
to the migration helper can't silently strip a instance's data.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

from sqlalchemy import create_engine, text

from bestrong.models.database import init_db, migrate_db


def _columns(db_path: Path) -> set[str]:
    conn = sqlite3.connect(str(db_path))
    try:
        cur = conn.execute("PRAGMA table_info(athletes)")
        return {row[1] for row in cur.fetchall()}
    finally:
        conn.close()


def _simulate_legacy_db(db_path: Path) -> None:
    """Build a full, current-schema DB and then rename the time-off
    columns back to their legacy names so the next migrate_db pass has
    something to convert. Insert a row using the legacy names so we can
    verify data survives the rename.
    """
    init_db(db_path)
    engine = create_engine(f"sqlite:///{db_path}")
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE athletes RENAME COLUMN availability_status TO vacation_status"))
        conn.execute(text("ALTER TABLE athletes RENAME COLUMN out_from TO vacation_start"))
        conn.execute(text("ALTER TABLE athletes RENAME COLUMN out_through TO vacation_end"))
        conn.execute(
            text(
                "INSERT INTO athletes (name, vacation_status, vacation_start, vacation_end) "
                "VALUES (:n, :s, :a, :b)"
            ),
            {"n": "Trashan", "s": "Available", "a": "2025-05-15", "b": "2025-05-20"},
        )
    engine.dispose()


def test_migrate_renames_legacy_columns_and_preserves_data(tmp_path):
    db_path = tmp_path / "legacy.db"
    _simulate_legacy_db(db_path)
    assert "vacation_status" in _columns(db_path)
    assert "availability_status" not in _columns(db_path)

    migrate_db(db_path)

    cols = _columns(db_path)

    assert "vacation_status" not in cols
    assert "vacation_start" not in cols
    assert "vacation_end" not in cols
    assert "availability_status" in cols
    assert "out_from" in cols
    assert "out_through" in cols


    conn = sqlite3.connect(str(db_path))
    try:
        row = conn.execute(
            "SELECT name, availability_status, out_from, out_through FROM athletes"
        ).fetchone()
    finally:
        conn.close()
    assert row == ("Trashan", "Available", "2025-05-15", "2025-05-20")


def test_migrate_is_idempotent(tmp_path):
    """Running migrate_db twice leaves the schema identical and doesn't
    error — important since it fires on every startup.
    """
    db_path = tmp_path / "legacy.db"
    _simulate_legacy_db(db_path)

    migrate_db(db_path)
    cols_after_first = _columns(db_path)

    migrate_db(db_path)
    cols_after_second = _columns(db_path)

    assert cols_after_first == cols_after_second


def test_migrate_noop_on_fresh_orm_schema(tmp_path):
    """A DB created from the current ORM already has the new column
    names, so the rename helper must do nothing (and not crash).
    """
    from bestrong.models.database import init_db

    db_path = tmp_path / "fresh.db"
    init_db(db_path)

    cols = _columns(db_path)
    assert "availability_status" in cols
    assert "out_from" in cols
    assert "out_through" in cols
    assert "vacation_status" not in cols
