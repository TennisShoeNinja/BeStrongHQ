"""Tests for the web-redirect Calendar OAuth flow.

These tests stand up a TestClient against an in-memory instance DB, override
``get_db`` so all routes use that DB, and stub ``requests.post`` so the
callback doesn't actually contact Google. They cover:

  * ``/auth/start`` returns a Google consent URL with our state + redirect
  * ``/auth/callback`` validates state, rejects replay, exchanges the code,
    saves the token to the per-instance settings table, and redirects back
  * ``/auth/disconnect`` clears the stored token
"""

from __future__ import annotations

from datetime import datetime, timedelta
from urllib.parse import parse_qs, urlparse

import pytest
from fastapi.testclient import TestClient

from bestrong.api import create_app
from bestrong.api.deps import get_db
from bestrong.gcal import client as gcal_client
from bestrong.models.database import get_engine, get_session_factory
from bestrong.models.orm import Base, GDriveToken, OAuthState, Setting


@pytest.fixture
def app_client(tmp_path, monkeypatch):
    """Fresh app + instance DB per test, with Google OAuth env configured."""
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "fake-client-id")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "fake-client-secret")

    db_path = tmp_path / "tenant.db"
    engine = get_engine(db_path)
    Base.metadata.create_all(bind=engine)
    factory = get_session_factory(db_path)

    app = create_app()

    def override_get_db():
        db = factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db

    with TestClient(app) as c:

        c.follow_redirects = False
        yield c, factory


def test_auth_start_returns_consent_url_with_state(app_client):
    client, factory = app_client

    resp = client.get("/api/calendar/auth/start")
    assert resp.status_code == 200
    auth_url = resp.json()["auth_url"]
    assert auth_url.startswith("https://accounts.google.com/o/oauth2/v2/auth?")

    parsed = urlparse(auth_url)
    qs = parse_qs(parsed.query)
    assert qs["client_id"] == ["fake-client-id"]
    assert qs["scope"] == ["https://www.googleapis.com/auth/calendar"]
    assert qs["access_type"] == ["offline"]
    assert qs["prompt"] == ["consent"]
    state = qs["state"][0]


    db = factory()
    try:
        row = db.query(OAuthState).filter(OAuthState.state == state).first()
        assert row is not None
        assert row.expires_at > datetime.utcnow()
    finally:
        db.close()


def test_auth_start_errors_when_oauth_not_configured(app_client, monkeypatch):
    client, _ = app_client


    monkeypatch.setattr(
        "bestrong.utils.oauth_config.get_oauth_client", lambda purpose: ("", "")
    )

    resp = client.get("/api/calendar/auth/start")
    assert resp.status_code == 500


class _FakeTokenResponse:
    def __init__(self, status_code: int, payload: dict | None = None):
        self.status_code = status_code
        self._payload = payload or {}
        self.text = ""

    def json(self):
        return self._payload


def _seed_state(factory, state: str = "good-state", *, expired: bool = False):
    db = factory()
    try:
        expires = datetime.utcnow() - timedelta(minutes=1) if expired else datetime.utcnow() + timedelta(minutes=5)
        db.add(OAuthState(state=state, expires_at=expires))
        db.commit()
    finally:
        db.close()


def test_callback_exchanges_code_and_saves_token(app_client, monkeypatch):
    client, factory = app_client
    _seed_state(factory)


    captured: dict = {}

    def fake_post(url, data=None, timeout=None):
        captured["url"] = url
        captured["data"] = data
        return _FakeTokenResponse(
            200,
            {
                "access_token": "ACCESS",
                "refresh_token": "REFRESH",
                "expires_in": 3600,
                "scope": "https://www.googleapis.com/auth/calendar",
            },
        )

    monkeypatch.setattr("bestrong.api.routes_calendar.http_requests.post", fake_post)

    monkeypatch.setattr(
        gcal_client, "ensure_bestronghq_calendar", lambda **_: "fake-cal-id"
    )

    resp = client.get("/api/calendar/auth/callback?code=AUTH_CODE&state=good-state")
    assert resp.status_code in (302, 307)
    assert "/integrations/calendar" in resp.headers["location"]
    assert "error=" not in resp.headers["location"]

    assert captured["url"] == gcal_client.GOOGLE_TOKEN_URL
    assert captured["data"]["code"] == "AUTH_CODE"
    assert captured["data"]["client_id"] == "fake-client-id"
    assert captured["data"]["grant_type"] == "authorization_code"


    db = factory()
    try:
        row = db.query(Setting).filter(Setting.key == "gcal_token_json").first()
        assert row is not None and row.value

        assert db.query(OAuthState).filter(OAuthState.state == "good-state").first() is None
    finally:
        db.close()


def test_callback_rejects_unknown_state(app_client, monkeypatch):
    client, factory = app_client

    monkeypatch.setattr(
        "bestrong.api.routes_calendar.http_requests.post",
        lambda *a, **kw: pytest.fail("token exchange should NOT happen"),
    )

    resp = client.get("/api/calendar/auth/callback?code=X&state=does-not-exist")
    assert resp.status_code in (302, 307)
    assert "error=invalid_state" in resp.headers["location"]


def test_callback_rejects_expired_state(app_client, monkeypatch):
    client, factory = app_client
    _seed_state(factory, state="stale", expired=True)
    monkeypatch.setattr(
        "bestrong.api.routes_calendar.http_requests.post",
        lambda *a, **kw: pytest.fail("token exchange should NOT happen"),
    )

    resp = client.get("/api/calendar/auth/callback?code=X&state=stale")
    assert resp.status_code in (302, 307)
    assert "error=state_expired" in resp.headers["location"]


    db = factory()
    try:
        assert db.query(OAuthState).filter(OAuthState.state == "stale").first() is None
    finally:
        db.close()


def test_callback_handles_failed_token_exchange(app_client, monkeypatch):
    client, factory = app_client
    _seed_state(factory, state="good-but-rejected")

    monkeypatch.setattr(
        "bestrong.api.routes_calendar.http_requests.post",
        lambda *a, **kw: _FakeTokenResponse(400, {"error": "invalid_grant"}),
    )

    resp = client.get("/api/calendar/auth/callback?code=X&state=good-but-rejected")
    assert resp.status_code in (302, 307)
    assert "error=token_exchange_failed" in resp.headers["location"]


    db = factory()
    try:
        row = db.query(Setting).filter(Setting.key == "gcal_token_json").first()
        assert row is None or not row.value
    finally:
        db.close()


def test_drive_callback_also_saves_calendar_token(app_client, monkeypatch):
    """When the Drive auth callback completes, the same refresh token
    needs to land in both ``gdrive_tokens`` (Drive's table) and the
    ``gcal_token_json`` setting (Calendar's storage), so the coach gets
    Drive + Calendar from a single consent.
    """
    client, factory = app_client
    _seed_state(factory, state="drive-bundle")

    def fake_post(url, data=None, timeout=None):

        if "token" in url:
            return _FakeTokenResponse(
                200,
                {
                    "access_token": "BUNDLE_ACCESS",
                    "refresh_token": "BUNDLE_REFRESH",
                    "expires_in": 3600,
                    "scope": (
                        "https://www.googleapis.com/auth/drive "
                        "https://www.googleapis.com/auth/calendar "
                        "https://www.googleapis.com/auth/userinfo.email"
                    ),
                },
            )
        raise AssertionError(f"unexpected POST to {url}")

    def fake_get(url, headers=None, timeout=None):

        return _FakeTokenResponse(200, {"email": "coach@example.com"})

    monkeypatch.setattr("bestrong.api.routes_gdrive.http_requests.post", fake_post)
    monkeypatch.setattr("bestrong.api.routes_gdrive.http_requests.get", fake_get)

    monkeypatch.setattr(
        gcal_client, "ensure_bestronghq_calendar", lambda **_: "fake-cal-id"
    )

    resp = client.get(
        "/api/gdrive/auth/callback?code=AUTH_CODE&state=drive-bundle"
    )
    assert resp.status_code in (302, 307)
    assert "error=" not in resp.headers["location"]

    db = factory()
    try:

        gdrive_row = (
            db.query(GDriveToken)
            .filter(GDriveToken.email == "coach@example.com")
            .first()
        )
        assert gdrive_row is not None
        assert gdrive_row.refresh_token == "BUNDLE_REFRESH"


        gcal_setting = (
            db.query(Setting).filter(Setting.key == "gcal_token_json").first()
        )
        assert gcal_setting is not None and gcal_setting.value
        assert "BUNDLE_REFRESH" in gcal_setting.value
    finally:
        db.close()


def test_drive_disconnect_also_clears_calendar_token(app_client):
    client, factory = app_client


    db = factory()
    try:
        db.add(
            GDriveToken(
                email="coach@example.com",
                access_token="A",
                refresh_token="R",
                token_expiry=None,
                scopes='["x"]',
                connection_status="active",
            )
        )
        db.add(Setting(key="gcal_token_json", value='{"token":"x"}'))
        db.commit()
    finally:
        db.close()

    resp = client.post("/api/gdrive/auth/disconnect")
    assert resp.status_code == 200

    db = factory()
    try:

        assert (
            db.query(GDriveToken)
            .filter(GDriveToken.email == "coach@example.com")
            .first()
            is None
        )


        gcal_setting = (
            db.query(Setting).filter(Setting.key == "gcal_token_json").first()
        )
        assert gcal_setting is None or not gcal_setting.value
    finally:
        db.close()


def test_disconnect_clears_stored_token(app_client):
    client, factory = app_client


    db = factory()
    try:
        db.add(Setting(key="gcal_token_json", value='{"token":"x"}'))
        db.commit()
    finally:
        db.close()

    resp = client.post("/api/calendar/auth/disconnect")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"

    db = factory()
    try:
        row = db.query(Setting).filter(Setting.key == "gcal_token_json").first()
        assert row is None or row.value in (None, "")
    finally:
        db.close()
