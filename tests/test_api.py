"""API endpoint tests using the 4-day fixture data."""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from bestrong.api import create_app
from bestrong.models.database import get_engine, get_session_factory
from bestrong.models.orm import Base
from bestrong.api.deps import get_db

FIXTURE = Path(__file__).parent / "fixtures" / "athlete_b_program_35.xlsx"
PARSER_ID = "bestrong"


@pytest.fixture(scope="module")
def db_path(tmp_path_factory):
    """Create a temporary database for tests."""
    return tmp_path_factory.mktemp("data") / "test.db"


@pytest.fixture(scope="module")
def client(db_path):
    """Create a test client with a fresh database and seeded fixture data."""
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


    from bestrong.services import import_file
    import_file(
        path=FIXTURE,
        db_path=db_path,
        title="Ed's Program 35 \u2013 (02/01/26 \u2013 02/22/26) \u2013 Strength Block",
        parser_id=PARSER_ID,
    )

    with TestClient(app) as c:
        yield c


def test_health(client):
    resp = client.get("/api/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"


def test_list_athletes(client):
    resp = client.get("/api/athletes")
    assert resp.status_code == 200
    athletes = resp.json()
    assert len(athletes) >= 1
    assert athletes[0]["name"] == "Ed Coan"


def test_get_athlete(client):
    resp = client.get("/api/athletes/1")
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "Ed Coan"
    assert data["squat_max_lbs"] == 501.0
    assert data["bench_max_lbs"] == 308.0
    assert data["deadlift_max_lbs"] == 508.0
    assert data["program_count"] >= 1


def test_get_athlete_not_found(client):
    resp = client.get("/api/athletes/999")
    assert resp.status_code == 404


def test_update_athlete(client):
    resp = client.patch("/api/athletes/1", json={"goal": "Hit 1400 total"})
    assert resp.status_code == 200
    assert resp.json()["goal"] == "Hit 1400 total"


def test_list_programs(client):
    resp = client.get("/api/programs")
    assert resp.status_code == 200
    programs = resp.json()
    assert len(programs) >= 1


def test_list_programs_by_athlete(client):
    resp = client.get("/api/programs?athlete_id=1")
    assert resp.status_code == 200
    programs = resp.json()
    assert len(programs) >= 1
    assert all(p["athlete_id"] == 1 for p in programs)


def test_get_program(client):
    resp = client.get("/api/programs/1")
    assert resp.status_code == 200
    data = resp.json()
    assert data["session_count"] >= 12
    assert data["exercise_count"] >= 100


def test_get_program_sessions(client):
    resp = client.get("/api/programs/1/sessions")
    assert resp.status_code == 200
    sessions = resp.json()
    assert len(sessions) >= 12

    for i in range(1, len(sessions)):
        prev = sessions[i - 1]
        curr = sessions[i]
        assert (prev["week_number"], prev["day_number"]) <= (curr["week_number"], curr["day_number"])


def test_get_program_sessions_filter_week(client):
    resp = client.get("/api/programs/1/sessions?week=1")
    assert resp.status_code == 200
    sessions = resp.json()
    assert all(s["week_number"] == 1 for s in sessions)
    assert len(sessions) == 4


def test_get_program_volume(client):
    resp = client.get("/api/programs/1/volume")
    assert resp.status_code == 200
    volumes = resp.json()
    assert len(volumes) >= 1


def test_get_session(client):
    resp = client.get("/api/sessions/1")
    assert resp.status_code == 200
    data = resp.json()
    assert data["exercise_count"] > 0


def test_get_session_exercises(client):
    resp = client.get("/api/sessions/1/exercises")
    assert resp.status_code == 200
    exercises = resp.json()
    assert len(exercises) > 0

    ex = exercises[0]
    assert "exercise_name" in ex
    assert "lift_category" in ex
    assert "sets" in ex


def test_athlete_analytics(client):
    resp = client.get("/api/analytics/athletes/1")
    assert resp.status_code == 200
    data = resp.json()
    assert data["athlete_name"] == "Ed Coan"
    assert data["total_programs"] >= 1
    assert data["total_sessions"] >= 12
    assert data["total_exercises"] >= 100
    assert len(data["volume_over_time"]) >= 1
    assert len(data["prs"]) >= 1


def test_volume_trends(client):
    resp = client.get("/api/analytics/volume?athlete_id=1")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) >= 1

    for point in data:
        assert "week_number" in point
        assert "squat_volume" in point


def test_volume_trends_by_program(client):
    resp = client.get("/api/analytics/volume?athlete_id=1&program_id=1")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) >= 1


def test_prs(client):
    resp = client.get("/api/analytics/prs?athlete_id=1")
    assert resp.status_code == 200
    prs = resp.json()
    assert len(prs) >= 1

    for i in range(1, len(prs)):
        assert prs[i - 1]["weight_lbs"] >= prs[i]["weight_lbs"]


def test_data_quality_shape(client):
    """Data quality endpoint returns the expected top-level structure."""
    resp = client.get("/api/analytics/athletes/1/data-quality")
    assert resp.status_code == 200
    data = resp.json()
    assert data["athlete_id"] == 1
    assert isinstance(data["total_top_sets"], int)
    assert isinstance(data["plotted_top_sets"], int)
    assert data["plotted_top_sets"] <= data["total_top_sets"]
    assert isinstance(data["outliers"], list)
    assert isinstance(data["excluded"], list)


def test_data_quality_issue_fields(client):
    """Each issue carries enough provenance for the review panel to render."""
    resp = client.get("/api/analytics/athletes/1/data-quality")
    data = resp.json()
    for issue in data["outliers"] + data["excluded"]:
        assert "category" in issue
        assert "reason" in issue and isinstance(issue["reason"], str)
        assert "lift_category" in issue

        assert "week_number" in issue
        assert "day_number" in issue


def test_data_quality_404(client):
    resp = client.get("/api/analytics/athletes/99999/data-quality")
    assert resp.status_code == 404


def test_failed_attempts_excluded_from_peaks_and_prs(client, db_path):
    """Failed top sets must not appear on Peak Weight charts or as PRs.

    Regression: a deadlift attempt logged as "failed" in the RPE Last Set
    column was still surfacing as the athlete's peak for the block. The
    `failed` flag is set correctly by the parser — the bug was that all
    the analytics queries ignored it. This test plants an absurdly heavy
    failed single and asserts it appears nowhere except the data-quality
    `excluded` bucket.
    """
    from bestrong.models.database import get_session_factory
    from bestrong.models.orm import ExerciseEntry, Program
    from bestrong.models.orm import Session as SessionModel

    factory = get_session_factory(db_path)
    session = factory()
    try:
        prog = session.query(Program).filter(Program.athlete_id == 1).first()
        assert prog is not None
        training_session = (
            session.query(SessionModel).filter(SessionModel.program_id == prog.id).first()
        )
        assert training_session is not None
        absurd_weight = 9999.0
        failed_entry = ExerciseEntry(
            session_id=training_session.id,
            exercise_name="Competition Deadlift",
            exercise_order=9001,
            exercise_group=9001,
            set_type="top_set",
            lift_category="deadlift",
            sets=1,
            reps=1,
            weight_lbs=absurd_weight,
            actual_rpe=None,
            is_accessory=False,
            failed=True,
        )
        session.add(failed_entry)
        session.commit()
        failed_id = failed_entry.id
    finally:
        session.close()

    try:
        e1rm = client.get("/api/analytics/e1rm?athlete_id=1&lift_category=deadlift").json()
        assert not any(p["weight_lbs"] == absurd_weight for p in e1rm)

        prs = client.get("/api/analytics/prs?athlete_id=1&lift_category=deadlift").json()
        assert not any(p["weight_lbs"] == absurd_weight for p in prs)

        dq = client.get("/api/analytics/athletes/1/data-quality").json()
        assert any(
            issue["category"] == "failed_attempt" and issue["weight_lbs"] == absurd_weight
            for issue in dq["excluded"]
        )
    finally:
        cleanup = factory()
        try:
            cleanup.query(ExerciseEntry).filter(ExerciseEntry.id == failed_id).delete()
            cleanup.commit()
        finally:
            cleanup.close()


def test_prs_by_category(client):
    resp = client.get("/api/analytics/prs?athlete_id=1&lift_category=squat")
    assert resp.status_code == 200
    prs = resp.json()
    assert all(p["lift_category"] == "squat" for p in prs)


def test_create_athlete(client):
    resp = client.post("/api/athletes", json={
        "name": "Test Athlete",
        "squat_max_lbs": 300,
        "bench_max_lbs": 200,
        "deadlift_max_lbs": 400,
    })
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Test Athlete"
    assert data["id"] >= 2


def test_create_duplicate_athlete(client):
    resp = client.post("/api/athletes", json={"name": "Ed Coan"})
    assert resp.status_code == 409


def test_delete_athlete(client):

    resp = client.get("/api/athletes")
    test_athlete = [a for a in resp.json() if a["name"] == "Test Athlete"]
    assert len(test_athlete) == 1

    resp = client.delete(f"/api/athletes/{test_athlete[0]['id']}")
    assert resp.status_code == 204


def test_deduplicate_preserves_gdrive_import_history(client, db_path):
    """Deleting a program via /deduplicate should null the gdrive_import ref,
    not delete the history row. The import table is an audit trail.

    Regression: prior FK (no ON DELETE clause) blocked the delete entirely
    with an IntegrityError, returning 500. The fix adds ON DELETE SET NULL
    plus a save-update-only relationship on Program.gdrive_imports.
    """
    from bestrong.models.database import get_session_factory
    from bestrong.models.orm import GDriveImport, Program

    factory = get_session_factory(db_path)
    session = factory()
    try:
        junk = Program(
            athlete_id=1,
            program_number=9001,
            program_name="Copy test",
            source_filename="Copy of whatever.xlsx",
        )
        session.add(junk)
        session.flush()
        junk_id = junk.id

        imp = GDriveImport(
            gdrive_file_id="test-cascade-file-id",
            gdrive_file_name="Copy of whatever.xlsx",
            gdrive_modified_time="2026-01-01T00:00:00Z",
            program_id=junk_id,
            status="success",
        )
        session.add(imp)
        session.commit()
        imp_id = imp.id
    finally:
        session.close()

    resp = client.post("/api/programs/deduplicate")
    assert resp.status_code == 200
    result = resp.json()
    assert any(d["program_id"] == junk_id for d in result["details"])

    session = factory()
    try:
        assert session.query(Program).filter(Program.id == junk_id).first() is None
        surviving = session.query(GDriveImport).filter(GDriveImport.id == imp_id).one()
        assert surviving.program_id is None
        assert surviving.gdrive_file_name == "Copy of whatever.xlsx"
    finally:
        session.close()


def test_past_meet_null_out(client):
    """Athletes whose meet_date is in the past should surface no upcoming meet.

    Regression: a meet that had already happened kept showing on the
    profile/list as "next meet" because the denormalized fields on the
    athlete row were never cleared. Response-time shaping should null them,
    and pending_meet_results should resurface the meet so the profile's
    "log results" banner still knows what to prompt for.
    """
    create = client.post("/api/athletes", json={
        "name": "Past Meet Athlete",
        "next_meet_name": "Old Meet",
        "meet_date": "2020-01-01",
        "weeks_out": 2,
        "days_out": 14,
    })
    assert create.status_code == 201
    athlete_id = create.json()["id"]

    resp = client.get(f"/api/athletes/{athlete_id}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["next_meet_id"] is None
    assert data["next_meet_name"] is None
    assert data["meet_date"] is None
    assert data["weeks_out"] is None
    assert data["days_out"] is None

    assert data["pending_meet_results"] == {
        "meet_id": None,
        "meet_name": "Old Meet",
        "meet_date": "2020-01-01",
        "meet_date_end": None,
    }


    log = client.post(f"/api/athletes/{athlete_id}/meet-results", json={
        "athlete_id": athlete_id,
        "meet_name": "Old Meet",
        "meet_date": "2020-01-01",
        "attempts": [
            {"lift": "squat", "attempt_number": 1, "weight_lbs": 300, "made": True}
        ],
    })
    assert log.status_code == 200

    resp = client.get(f"/api/athletes/{athlete_id}")
    assert resp.status_code == 200
    assert resp.json()["pending_meet_results"] is None

    client.delete(f"/api/athletes/{athlete_id}")


def test_exercise_aliases_crud(client):
    """Create, list, and delete coach-managed merges."""

    resp = client.get("/api/exercise-aliases")
    assert resp.status_code == 200
    assert resp.json() == []


    resp = client.post(
        "/api/exercise-aliases",
        json={
            "primary_name": "Paused Deadlift",
            "aliases": [
                "Pause Deadlift 0-1-0 (just off the floor)",
                "Paused Deadlift (0-1-0) (right off the floor)",
            ],
        },
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["primary_name"] == "Paused Deadlift"
    assert len(body["aliases"]) == 2
    alias_ids = [a["id"] for a in body["aliases"]]


    listing = client.get("/api/exercise-aliases").json()
    assert len(listing) == 1
    assert listing[0]["primary_name"] == "Paused Deadlift"
    assert {a["alias_name"] for a in listing[0]["aliases"]} == {
        "Pause Deadlift 0-1-0 (just off the floor)",
        "Paused Deadlift (0-1-0) (right off the floor)",
    }


    resp = client.delete(f"/api/exercise-aliases/{alias_ids[0]}")
    assert resp.status_code == 204
    listing = client.get("/api/exercise-aliases").json()
    assert len(listing[0]["aliases"]) == 1


    client.delete(f"/api/exercise-aliases/{alias_ids[1]}")


def test_exercise_aliases_reject_chain(client):
    """Block attempts to alias a name that is already someone else's primary."""

    r = client.post(
        "/api/exercise-aliases",
        json={"primary_name": "Paused Deadlift", "aliases": ["Pause Deadlift"]},
    )
    assert r.status_code == 201
    alias_id = r.json()["aliases"][0]["id"]


    r = client.post(
        "/api/exercise-aliases",
        json={
            "primary_name": "Competition Deadlift",
            "aliases": ["Paused Deadlift"],
        },
    )
    assert r.status_code == 409
    assert "primary" in r.json()["detail"].lower()

    client.delete(f"/api/exercise-aliases/{alias_id}")


def test_exercise_aliases_per_athlete_scope(client):
    """Merges are hybrid-scoped: instance-wide vs scoped to one athlete."""

    a1 = client.post("/api/athletes", json={"name": "Scope Athlete One"}).json()["id"]
    a2 = client.post("/api/athletes", json={"name": "Scope Athlete Two"}).json()["id"]

    # Instance-wide merge: no athlete_id, visible to every athlete.
    r = client.post(
        "/api/exercise-aliases",
        json={"primary_name": "Competition Squat", "aliases": ["Comp Squat"]},
    )
    assert r.status_code == 201
    assert r.json()["aliases"][0]["athlete_id"] is None

    # Per-athlete merge: scoped to athlete one only.
    r = client.post(
        "/api/exercise-aliases",
        json={
            "primary_name": "Competition Squat",
            "aliases": ["High Bar Squat"],
            "athlete_id": a1,
        },
    )
    assert r.status_code == 201
    # The group shows every alias visible to this athlete under the
    # primary: the new per-athlete row plus the instance-wide one.
    scope_by_name = {e["alias_name"]: e["athlete_id"] for e in r.json()["aliases"]}
    assert scope_by_name == {"High Bar Squat": a1, "Comp Squat": None}

    # Athlete one sees the instance-wide merge and their own.
    a1_aliases = {
        e["alias_name"]
        for g in client.get(f"/api/exercise-aliases?athlete_id={a1}").json()
        for e in g["aliases"]
    }
    assert a1_aliases == {"Comp Squat", "High Bar Squat"}

    # Athlete two sees only the instance-wide merge.
    a2_aliases = {
        e["alias_name"]
        for g in client.get(f"/api/exercise-aliases?athlete_id={a2}").json()
        for e in g["aliases"]
    }
    assert a2_aliases == {"Comp Squat"}

    # With no athlete_id, only instance-wide merges come back.
    plain_aliases = {
        e["alias_name"]
        for g in client.get("/api/exercise-aliases").json()
        for e in g["aliases"]
    }
    assert plain_aliases == {"Comp Squat"}
