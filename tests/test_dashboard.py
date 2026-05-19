"""Tests for dashboard summary endpoints."""

from __future__ import annotations

from datetime import date, datetime, timedelta

from fastapi.testclient import TestClient

from bestrong.api import create_app
from bestrong.api.deps import get_db
from bestrong.models.database import get_engine, get_session_factory
from bestrong.models.orm import (
    Athlete,
    Base,
    GDriveImport,
    MaxHistory,
    Notification,
    Program,
)


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


class TestWeeklyStats:
    def test_empty_roster(self, tmp_path):
        client, _factory = _client_with_db(tmp_path)
        try:
            resp = client.get("/api/dashboard/weekly-stats")
            assert resp.status_code == 200, resp.text
            data = resp.json()

            assert data["prs_this_week"] == 0
            assert data["prs_delta"] == 0
            assert data["prs_spark"] == [0] * 8
            assert data["sessions_this_week"] == 0
            assert data["sessions_spark"] == [0] * 8
            assert data["flagged_now"] == 0
            assert data["flagged_delta"] == 0
            assert data["flagged_spark"] == [0] * 8
        finally:
            client.close()

    def test_seeded_counts(self, tmp_path):
        client, factory = _client_with_db(tmp_path)
        now = datetime.now()

        db = factory()
        try:
            athlete = Athlete(name="PR Patty")
            db.add(athlete)
            db.flush()

            db.add(
                MaxHistory(
                    athlete_id=athlete.id,
                    lift="squat",
                    old_value=400.0,
                    new_value=405.0,
                    recorded_at=now - timedelta(days=1),
                )
            )
            db.add(
                Program(
                    athlete_id=athlete.id,
                    program_number=1,
                    imported_at=now - timedelta(days=2),
                )
            )
            db.add(
                Notification(
                    athlete_id=athlete.id,
                    title="Program due",
                    archived=False,
                )
            )
            db.commit()
        finally:
            db.close()

        try:
            resp = client.get("/api/dashboard/weekly-stats")
            assert resp.status_code == 200, resp.text
            data = resp.json()

            assert data["prs_this_week"] == 1
            assert data["prs_delta"] == 1
            assert len(data["prs_spark"]) == 8
            assert data["prs_spark"][-1] == 1

            assert data["sessions_this_week"] == 1
            assert len(data["sessions_spark"]) == 8
            assert data["sessions_spark"][-1] == 1

            assert data["flagged_now"] == 1
            assert data["flagged_spark"] == [0, 0, 0, 0, 0, 0, 0, 1]
        finally:
            client.close()


class TestNeedsReview:
    def test_empty(self, tmp_path):
        client, _factory = _client_with_db(tmp_path)
        try:
            resp = client.get("/api/dashboard/needs-review")
            assert resp.status_code == 200, resp.text
            assert resp.json() == []
        finally:
            client.close()

    def test_recent_prs_use_thirty_day_window(self, tmp_path):
        client, factory = _client_with_db(tmp_path)
        today = date.today()
        now = datetime.now()

        db = factory()
        try:
            pr_athlete = Athlete(name="Sara K")
            miss_athlete = Athlete(name="Diego R")
            db.add_all([pr_athlete, miss_athlete])
            db.flush()

            db.add(
                MaxHistory(
                    athlete_id=pr_athlete.id,
                    lift="squat",
                    old_value=300.0,
                    new_value=320.0,
                    reps=3,
                    recorded_at=now - timedelta(days=20),
                )
            )

            db.add(
                Program(
                    athlete_id=miss_athlete.id,
                    program_number=1,
                    date_end=(today + timedelta(days=7)).isoformat(),
                    imported_at=now - timedelta(days=10),
                )
            )
            db.commit()
        finally:
            db.close()

        try:
            resp = client.get("/api/dashboard/needs-review?limit=5")
            assert resp.status_code == 200, resp.text
            data = resp.json()

            assert len(data) == 1
            assert data[0]["kind"] == "pr"
            assert data[0]["athlete_name"] == "Sara K"
            assert data[0]["athlete_initials"] == "SK"
            assert data[0]["avatar_class"].startswith("cloud-av-")
            assert "320" in data[0]["title"]
            assert data[0]["occurred_at"].endswith("Z")
            assert data[0]["target_id"] is not None
        finally:
            client.close()


class TestTodaySchedule:
    def test_empty(self, tmp_path):
        client, _factory = _client_with_db(tmp_path)
        try:
            resp = client.get("/api/dashboard/today-schedule")
            assert resp.status_code == 200, resp.text
            assert resp.json() == []
        finally:
            client.close()

    def test_two_buckets(self, tmp_path):
        client, factory = _client_with_db(tmp_path)
        today_weekday = date.today().isoweekday()

        db = factory()
        try:
            db.add_all(
                [
                    Athlete(name="Squatter One", primary_squat_day=today_weekday),
                    Athlete(name="Squatter Two", primary_squat_day=today_weekday),
                    Athlete(name="Bencher", primary_bench_day=today_weekday),
                ]
            )
            db.commit()
        finally:
            db.close()

        try:
            resp = client.get("/api/dashboard/today-schedule")
            assert resp.status_code == 200, resp.text
            data = resp.json()

            assert len(data) == 2
            squat_bucket = next(row for row in data if row["title"] == "Squat day")
            bench_bucket = next(row for row in data if row["title"] == "Bench day")
            assert squat_bucket["athlete_count"] == 2
            assert squat_bucket["kind"] == "group"
            assert [athlete["name"] for athlete in squat_bucket["athletes"]] == [
                "Squatter One",
                "Squatter Two",
            ]
            assert bench_bucket["athlete_count"] == 1
            assert bench_bucket["kind"] == "individual"
            assert bench_bucket["athletes"][0]["name"] == "Bencher"
        finally:
            client.close()
