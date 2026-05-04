"""Tests for the per-instance ``tracks_rpe`` toggle.

Covers the auth-status surfacing, the ``/estimated-max`` Epley fallback,
and the ``/rpe-compliance`` short-circuit. Volume-response confidence
behavior under ``rpe_tracked=False`` is covered as pure unit tests in
``test_volume_response.py`` since it doesn't need an HTTP round trip.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from bestrong.api import create_app
from bestrong.api.deps import get_db
from bestrong.models.database import get_engine, get_session_factory
from bestrong.models.orm import (
    Athlete,
    Base,
    ExerciseEntry,
    Program,
    Session as SessionModel,
    Setting,
)


def _seed_one_top_set(factory, *, with_rpe: bool) -> int:
    """Create one athlete with a single 1RM-eligible top set.

    Returns the athlete id. The set is 405 lbs x 2 reps; the RPE column
    is filled in only when ``with_rpe`` is True so the instance looks like
    one that opts in or out of logging actual RPE.
    """
    db = factory()
    try:
        athlete = Athlete(name="Test Athlete", squat_max_lbs=400.0)
        db.add(athlete)
        db.flush()
        program = Program(
            athlete_id=athlete.id,
            program_number=1,
            program_name="Test block",
            date_start="2026-01-01",
        )
        db.add(program)
        db.flush()
        sess = SessionModel(
            program_id=program.id,
            week_number=1,
            day_number=1,
            day_name="Day 1",
        )
        db.add(sess)
        db.flush()
        entry = ExerciseEntry(
            session_id=sess.id,
            exercise_name="Squat",
            exercise_order=1,
            exercise_group="A",
            lift_category="squat",
            set_type="top_set",
            is_accessory=False,
            failed=False,
            sets=1,
            weight_lbs=405.0,
            reps=2,
            actual_rpe=8.0 if with_rpe else None,
        )
        db.add(entry)
        db.commit()
        return athlete.id
    finally:
        db.close()


def _set_tracks_rpe(factory, value: bool) -> None:
    db = factory()
    try:
        row = db.query(Setting).filter(Setting.key == "tracks_rpe").first()
        if row:
            row.value = "true" if value else "false"
        else:
            db.add(Setting(key="tracks_rpe", value="true" if value else "false"))
        db.commit()
    finally:
        db.close()


@pytest.fixture
def app_client(tmp_path):
    """Fresh app + instance DB per test."""
    db_path = tmp_path / "instance.db"
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
        yield c, factory


def test_auth_status_default_tracks_rpe_true(app_client):
    """A instance with no setting row should default to tracks_rpe=True."""
    client, _factory = app_client
    resp = client.get("/api/auth/status")
    assert resp.status_code == 200
    body = resp.json()
    assert body["instance_settings"]["tracks_rpe"] is True


def test_auth_status_reflects_disabled_tracks_rpe(app_client):
    client, factory = app_client
    _set_tracks_rpe(factory, False)

    resp = client.get("/api/auth/status")
    assert resp.status_code == 200
    body = resp.json()
    assert body["instance_settings"]["tracks_rpe"] is False


def test_estimated_max_returns_empty_when_rpe_required_but_missing(app_client):
    """RPE-tracking instance whose set has no logged RPE should return no
    estimate — the existing behavior, not changed by the toggle."""
    client, factory = app_client
    athlete_id = _seed_one_top_set(factory, with_rpe=False)

    resp = client.get(f"/api/analytics/estimated-max?athlete_id={athlete_id}")
    assert resp.status_code == 200
    by_lift = {row["lift"]: row for row in resp.json()}
    assert by_lift["squat"]["estimated"] is None


def test_estimated_max_uses_epley_when_tracks_rpe_disabled(app_client):
    """When the instance has tracks_rpe=False, the endpoint should drop
    the RPE filter and fall back to Epley so the no-RPE instance still
    sees an estimate."""
    client, factory = app_client
    athlete_id = _seed_one_top_set(factory, with_rpe=False)
    _set_tracks_rpe(factory, False)

    resp = client.get(f"/api/analytics/estimated-max?athlete_id={athlete_id}")
    assert resp.status_code == 200
    by_lift = {row["lift"]: row for row in resp.json()}

    assert by_lift["squat"]["estimated"] == 432.0


def test_rpe_compliance_short_circuits_when_disabled(app_client):
    """A instance who turned RPE tracking off should get an explicit
    ``enabled: false`` payload instead of zero metrics, so the frontend
    can hide the card entirely."""
    client, factory = app_client
    athlete_id = _seed_one_top_set(factory, with_rpe=True)
    _set_tracks_rpe(factory, False)

    resp = client.get(f"/api/analytics/rpe-compliance?athlete_id={athlete_id}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["enabled"] is False
    assert body["by_lift"] == []
    assert body["by_program"] == []


def test_rpe_compliance_enabled_by_default(app_client):
    """The default instance should still get the full compliance payload."""
    client, factory = app_client
    athlete_id = _seed_one_top_set(factory, with_rpe=True)

    resp = client.get(f"/api/analytics/rpe-compliance?athlete_id={athlete_id}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["enabled"] is True
