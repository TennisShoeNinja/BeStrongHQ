"""Regression tests for ``_run_data_migrations``.

Pre-fix it caught any exception, ignored it, and inserted the version
row anyway, so a failed migration was permanently marked applied and
never retried. The fix runs each migration in a savepoint and only
records the version after the SQL succeeds. Failures log loudly and
the next startup retries.
"""

from __future__ import annotations

import logging
from pathlib import Path

from sqlalchemy import text

from bestrong.models import database as db_module
from bestrong.models.database import init_db, get_engine


def _applied_versions(db_path: Path) -> set[int]:
    engine = get_engine(db_path)
    with engine.connect() as conn:
        rows = conn.execute(text("SELECT version FROM _migration_version"))
        return {row[0] for row in rows}


def test_failed_migration_is_not_marked_as_applied(tmp_path, monkeypatch, caplog):
    db_path = tmp_path / "instance.db"

    failing_sql = "UPDATE this_table_does_not_exist SET x = 1"
    monkeypatch.setattr(
        db_module,
        "_DATA_MIGRATIONS",
        [(9001, "deliberately broken migration", failing_sql)],
    )

    with caplog.at_level(logging.ERROR, logger="bestrong.models.database"):
        init_db(db_path)

    assert 9001 not in _applied_versions(db_path), (
        "Failed migration must not be recorded as applied. Pre-fix it was, "
        "and the broken migration was permanently skipped on every restart."
    )
    assert any(
        "data_migration_failed" in r.getMessage() for r in caplog.records
    ), "Failures must log loudly so they're observable in Sentry/stdout."


def test_failing_migration_does_not_block_subsequent_successful_migration(
    tmp_path, monkeypatch
):
    """A broken migration N must not prevent migration N+1 from running."""
    db_path = tmp_path / "instance.db"

    monkeypatch.setattr(
        db_module,
        "_DATA_MIGRATIONS",
        [
            (9001, "broken", "UPDATE missing_table SET x = 1"),
            (
                9002,
                "good",
                "CREATE TABLE IF NOT EXISTS marker_9002 (id INTEGER PRIMARY KEY)",
            ),
        ],
    )

    init_db(db_path)

    versions = _applied_versions(db_path)
    assert 9001 not in versions
    assert 9002 in versions

    engine = get_engine(db_path)
    with engine.connect() as conn:
        rows = conn.execute(
            text("SELECT name FROM sqlite_master WHERE type='table' AND name='marker_9002'")
        ).fetchall()
    assert rows, "Subsequent good migration must have run."


def test_failed_migration_is_retried_on_next_startup(tmp_path, monkeypatch):
    """First startup: migration is broken, not recorded. Fix it, second
    startup runs it cleanly and records it."""
    db_path = tmp_path / "instance.db"

    monkeypatch.setattr(
        db_module,
        "_DATA_MIGRATIONS",
        [(9001, "flaky", "UPDATE missing_table SET x = 1")],
    )
    init_db(db_path)
    assert 9001 not in _applied_versions(db_path)

    monkeypatch.setattr(
        db_module,
        "_DATA_MIGRATIONS",
        [
            (
                9001,
                "flaky",
                "CREATE TABLE IF NOT EXISTS marker_retry (id INTEGER PRIMARY KEY)",
            )
        ],
    )
    db_module.migrate_db(db_path)

    assert 9001 in _applied_versions(db_path)


def test_successful_migration_is_recorded(tmp_path, monkeypatch):
    db_path = tmp_path / "instance.db"

    monkeypatch.setattr(
        db_module,
        "_DATA_MIGRATIONS",
        [
            (
                9001,
                "creates marker",
                "CREATE TABLE IF NOT EXISTS marker_ok (id INTEGER PRIMARY KEY)",
            )
        ],
    )

    init_db(db_path)

    assert 9001 in _applied_versions(db_path)
