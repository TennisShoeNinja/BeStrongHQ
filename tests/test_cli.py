"""Tests for the public Typer CLI entry point."""

from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest
from typer.testing import CliRunner

from bestrong.cli import app


runner = CliRunner()

PUBLIC_COMMANDS = [
    "serve",
    "info",
    "run",
    "ui",
    "resync-all",
    "backfill-prs",
    "get-athlete-emails",
    "reset-db",
]


def test_root_help_exits_zero():
    result = runner.invoke(app, ["--help"])

    assert result.exit_code == 0
    assert "Powerlifting coaching analytics" in result.output


@pytest.mark.parametrize("command", PUBLIC_COMMANDS)
def test_public_command_help_exits_zero(command):
    result = runner.invoke(app, [command, "--help"])

    assert result.exit_code == 0
    assert "Usage:" in result.output


@pytest.mark.parametrize(
    "args",
    [
        ["not-a-command"],
        ["serve", "--port", "not-an-int"],
        ["run", "--api-port", "not-an-int"],
        ["resync-all", "--poll-interval", "not-a-float"],
        ["reset-db", "--unknown-option"],
    ],
)
def test_bad_args_exit_non_zero(args):
    result = runner.invoke(app, args)

    assert result.exit_code != 0


def _create_existing_db(path: Path) -> None:
    conn = sqlite3.connect(path)
    try:
        conn.execute("CREATE TABLE sentinel (value TEXT NOT NULL)")
        conn.execute("INSERT INTO sentinel (value) VALUES ('keep')")
        conn.commit()
    finally:
        conn.close()


def _sentinel_rows(path: Path) -> list[tuple[str]]:
    conn = sqlite3.connect(path)
    try:
        return conn.execute("SELECT value FROM sentinel").fetchall()
    finally:
        conn.close()


def test_reset_db_declined_confirmation_leaves_existing_db_intact(tmp_path):
    db_path = tmp_path / "existing.sqlite"
    _create_existing_db(db_path)

    result = runner.invoke(app, ["reset-db", "--db", str(db_path)], input="n\n")

    assert result.exit_code != 0
    assert db_path.exists()
    assert _sentinel_rows(db_path) == [("keep",)]


def test_reset_db_yes_replaces_only_confirmed_db_path(tmp_path):
    confirmed = tmp_path / "confirmed.sqlite"
    untouched = tmp_path / "untouched.sqlite"
    _create_existing_db(confirmed)
    _create_existing_db(untouched)

    result = runner.invoke(app, ["reset-db", "--db", str(confirmed), "--yes"])

    assert result.exit_code == 0
    assert confirmed.exists()
    with pytest.raises(sqlite3.OperationalError, match="no such table: sentinel"):
        _sentinel_rows(confirmed)
    assert _sentinel_rows(untouched) == [("keep",)]


def test_resync_all_uses_urlopen_transport_boundary(monkeypatch):
    import urllib.error
    import urllib.request

    calls = []

    def blocked_urlopen(request, timeout):
        calls.append((request.full_url, request.get_method(), timeout))
        raise urllib.error.URLError("blocked in test")

    monkeypatch.setattr(urllib.request, "urlopen", blocked_urlopen)

    result = runner.invoke(
        app,
        [
            "resync-all",
            "--api-host",
            "127.0.0.1",
            "--api-port",
            "9999",
            "--poll-interval",
            "0.01",
        ],
    )

    assert result.exit_code == 1
    assert calls == [
        ("http://127.0.0.1:9999/api/gdrive/force-resync-all", "POST", 10)
    ]
    assert "blocked in test" in result.output
