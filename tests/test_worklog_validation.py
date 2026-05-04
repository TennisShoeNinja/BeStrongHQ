"""Validation tests for the WorkLog create endpoint.

Pre-fix the endpoint accepted arbitrary duration_seconds (negative, huge) and
arbitrary action strings. Both could corrupt dashboard totals or category
breakdowns. The schema now bounds duration and restricts action to a known
enum.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from bestrong.api import create_app
from bestrong.api.deps import get_db
from bestrong.models.database import get_engine, get_session_factory
from bestrong.models.orm import Athlete, Base


@pytest.fixture()
def client(tmp_path):
    db_path = tmp_path / "worklog_test.db"
    app = create_app()
    engine = get_engine(db_path)
    Base.metadata.create_all(bind=engine)
    factory = get_session_factory(db_path)

    def override_get_db():
        db = factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    db = factory()
    db.add(Athlete(name="Test"))
    db.commit()
    athlete_id = db.query(Athlete).first().id
    db.close()

    with TestClient(app) as c:
        yield c, athlete_id


def test_negative_duration_is_rejected(client):
    c, athlete_id = client
    resp = c.post("/api/work-logs", json={"athlete_id": athlete_id, "duration_seconds": -10})
    assert resp.status_code == 422


def test_overflow_duration_is_rejected(client):
    c, athlete_id = client
    resp = c.post(
        "/api/work-logs", json={"athlete_id": athlete_id, "duration_seconds": 10_000_000}
    )
    assert resp.status_code == 422


def test_unknown_action_is_rejected(client):
    c, athlete_id = client
    resp = c.post(
        "/api/work-logs",
        json={"athlete_id": athlete_id, "duration_seconds": 60, "action": "obliterate"},
    )
    assert resp.status_code == 422


def test_known_actions_accepted(client):
    c, athlete_id = client
    for action in ("complete", "skip", "snooze"):
        resp = c.post(
            "/api/work-logs",
            json={"athlete_id": athlete_id, "duration_seconds": 60, "action": action},
        )
        assert resp.status_code == 200, f"{action}: {resp.text}"


def test_zero_duration_accepted(client):
    """Zero is the boundary: useful for action='skip' with no timer."""
    c, athlete_id = client
    resp = c.post(
        "/api/work-logs",
        json={"athlete_id": athlete_id, "duration_seconds": 0, "action": "skip"},
    )
    assert resp.status_code == 200, resp.text
