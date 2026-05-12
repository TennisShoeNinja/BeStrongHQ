"""Tests for dashboard summary endpoints."""

from __future__ import annotations

from datetime import date, datetime, timedelta

from fastapi.testclient import TestClient

from bestrong.api import create_app
from bestrong.api.deps import get_db
from bestrong.models.database import get_engine, get_session_factory
from bestrong.models.orm import Athlete, Base, GDriveImport, Program


def _client_with_db(tmp_path):
    db_path = tmp_path / "dashboard.db"
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
    return TestClient(app), factory


def test_today_status_empty_roster(tmp_path):
    client, _factory = _client_with_db(tmp_path)
    try:
        resp = client.get("/api/dashboard/today-status")
        assert resp.status_code == 200, resp.text
        data = resp.json()

        assert data["roster_total"] == 0
        assert data["scheduled_today"] == 0
        assert data["with_active_program"] == 0
        assert data["synced_today"] == 0
        assert data["computed_at"].endswith("Z")
    finally:
        client.close()


def test_today_status_counts_seeded_roster(tmp_path):
    client, factory = _client_with_db(tmp_path)
    today = date.today()
    weekday = today.isoweekday()

    db = factory()
    try:
        scheduled = Athlete(name="Scheduled Sam", primary_squat_day=weekday)
        active_program = Athlete(name="Program Pat")
        unscheduled = Athlete(name="Open Ollie")
        db.add_all([scheduled, active_program, unscheduled])
        db.flush()

        program = Program(
            athlete_id=active_program.id,
            program_number=1,
            date_start=today.isoformat(),
            date_end=(today + timedelta(days=7)).isoformat(),
        )
        db.add(program)
        db.flush()

        db.add(
            GDriveImport(
                gdrive_file_id="today-file",
                gdrive_file_name="Program.xlsx",
                gdrive_modified_time=today.isoformat(),
                program_id=program.id,
                imported_at=datetime.utcnow(),
                status="success",
            )
        )
        db.commit()
    finally:
        db.close()

    try:
        resp = client.get("/api/dashboard/today-status")
        assert resp.status_code == 200, resp.text
        data = resp.json()

        assert data["roster_total"] == 3
        assert data["scheduled_today"] == 1
        assert data["with_active_program"] == 1
        assert data["synced_today"] == 1
        assert data["computed_at"].endswith("Z")
    finally:
        client.close()
