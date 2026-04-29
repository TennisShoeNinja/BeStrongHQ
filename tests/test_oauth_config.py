"""Tests for the OAuth client lookup helper.

Verifies that purpose-specific env vars override the unified pair, that
the unified pair still works alone (self-hoster default), and that a
partial purpose-specific set doesn't accidentally silence the fallback.
"""

from __future__ import annotations

import pytest

from bestrong.utils import oauth_config


@pytest.fixture
def clean_env(monkeypatch):
    """Wipe every OAuth-related env var and the legacy credentials path."""
    for key in (
        "GOOGLE_CLIENT_ID",
        "GOOGLE_CLIENT_SECRET",
        "GOOGLE_LOGIN_CLIENT_ID",
        "GOOGLE_LOGIN_CLIENT_SECRET",
        "GOOGLE_DRIVE_CLIENT_ID",
        "GOOGLE_DRIVE_CLIENT_SECRET",
    ):
        monkeypatch.delenv(key, raising=False)


    monkeypatch.setattr(
        oauth_config,
        "_LEGACY_CREDENTIALS_PATH",
        oauth_config.Path("/nonexistent/bestrong-test/credentials.json"),
    )
    return monkeypatch


def test_unified_pair_used_when_no_purpose_specific(clean_env):
    clean_env.setenv("GOOGLE_CLIENT_ID", "unified-id")
    clean_env.setenv("GOOGLE_CLIENT_SECRET", "unified-secret")

    assert oauth_config.get_oauth_client("login") == ("unified-id", "unified-secret")
    assert oauth_config.get_oauth_client("drive") == ("unified-id", "unified-secret")


def test_purpose_specific_overrides_unified(clean_env):
    clean_env.setenv("GOOGLE_CLIENT_ID", "unified-id")
    clean_env.setenv("GOOGLE_CLIENT_SECRET", "unified-secret")
    clean_env.setenv("GOOGLE_LOGIN_CLIENT_ID", "login-id")
    clean_env.setenv("GOOGLE_LOGIN_CLIENT_SECRET", "login-secret")
    clean_env.setenv("GOOGLE_DRIVE_CLIENT_ID", "drive-id")
    clean_env.setenv("GOOGLE_DRIVE_CLIENT_SECRET", "drive-secret")

    assert oauth_config.get_oauth_client("login") == ("login-id", "login-secret")
    assert oauth_config.get_oauth_client("drive") == ("drive-id", "drive-secret")


def test_split_for_one_purpose_falls_back_for_the_other(clean_env):


    clean_env.setenv("GOOGLE_CLIENT_ID", "unified-id")
    clean_env.setenv("GOOGLE_CLIENT_SECRET", "unified-secret")
    clean_env.setenv("GOOGLE_LOGIN_CLIENT_ID", "login-id")
    clean_env.setenv("GOOGLE_LOGIN_CLIENT_SECRET", "login-secret")

    assert oauth_config.get_oauth_client("login") == ("login-id", "login-secret")
    assert oauth_config.get_oauth_client("drive") == ("unified-id", "unified-secret")


def test_partial_purpose_specific_ignored(clean_env):


    clean_env.setenv("GOOGLE_CLIENT_ID", "unified-id")
    clean_env.setenv("GOOGLE_CLIENT_SECRET", "unified-secret")
    clean_env.setenv("GOOGLE_LOGIN_CLIENT_ID", "login-id")

    assert oauth_config.get_oauth_client("login") == ("unified-id", "unified-secret")


def test_nothing_configured_returns_empty(clean_env):
    assert oauth_config.get_oauth_client("login") == ("", "")
    assert oauth_config.get_oauth_client("drive") == ("", "")


def test_whitespace_only_values_treated_as_unset(clean_env):
    clean_env.setenv("GOOGLE_LOGIN_CLIENT_ID", "   ")
    clean_env.setenv("GOOGLE_LOGIN_CLIENT_SECRET", "\t")
    clean_env.setenv("GOOGLE_CLIENT_ID", "unified-id")
    clean_env.setenv("GOOGLE_CLIENT_SECRET", "unified-secret")

    assert oauth_config.get_oauth_client("login") == ("unified-id", "unified-secret")
