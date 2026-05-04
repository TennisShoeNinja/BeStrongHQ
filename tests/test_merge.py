"""Regression test for the athlete merge endpoint.

Pre-fix behavior: the merge endpoint reassigned only Program and Notification
rows before deleting the secondary athlete, so the ORM cascade silently dropped
max_history / work_logs / daily_wellness / meet_results, and FK rows without
cascade (opl_links, opl_meets, athlete_sessions) raised IntegrityError.
"""

from __future__ import annotations

from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from bestrong.api import create_app
from bestrong.api.deps import get_db
from bestrong.models.database import get_engine, get_session_factory
from bestrong.models.orm import (
    Athlete,
    AthleteSession,
    Base,
    DailyWellness,
    MaxHistory,
    MeetResult,
    Notification,
    OplLink,
    OplMeet,
    Program,
    WorkLog,
)


@pytest.fixture()
def client(tmp_path):
    db_path = tmp_path / "merge_test.db"
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
    with TestClient(app) as c:
        yield c, factory


def _seed_athlete(session, name: str, *, with_opl: bool = True) -> int:
    athlete = Athlete(name=name)
    session.add(athlete)
    session.flush()

    program = Program(athlete_id=athlete.id, program_number=1, program_name=f"{name} Block")
    session.add(program)
    session.add(Notification(athlete_id=athlete.id, title=f"Notify {name}"))
    session.add(MaxHistory(athlete_id=athlete.id, lift="squat", new_value=400.0, source="manual"))
    session.add(WorkLog(athlete_id=athlete.id, duration_seconds=600, action="complete"))
    session.add(
        DailyWellness(athlete_id=athlete.id, program_id=program.id, date="2026-01-01")
    )
    session.add(
        MeetResult(
            athlete_id=athlete.id,
            lift="squat",
            attempt_number=1,
            weight_lbs=405.0,
            made=True,
        )
    )
    session.add(
        AthleteSession(
            session_token=f"tok-{name}",
            athlete_id=athlete.id,
            email=f"{name.lower()}@example.com",
            expires_at=datetime.utcnow() + timedelta(days=1),
        )
    )

    if with_opl:
        session.add(OplLink(athlete_id=athlete.id, slug=f"slug-{name.lower()}"))
        session.add(
            OplMeet(athlete_id=athlete.id, meet_path=f"meets/{name.lower()}/2025-01")
        )

    session.flush()
    return athlete.id


def test_merge_preserves_all_related_history(client):
    c, factory = client
    db = factory()
    try:
        primary_id = _seed_athlete(db, "Primary", with_opl=False)
        secondary_id = _seed_athlete(db, "Secondary", with_opl=False)
        db.commit()
    finally:
        db.close()

    resp = c.post(
        f"/api/athletes/{primary_id}/merge/{secondary_id}",
        json={"keep_name": "Primary"},
    )
    assert resp.status_code == 200, resp.text

    db = factory()
    try:
        assert db.query(Athlete).filter(Athlete.id == secondary_id).first() is None

        # Every related row from secondary should now point at primary, and
        # primary's own rows are still there: counts of 2 prove neither side
        # was silently dropped by cascade.
        assert db.query(Program).filter(Program.athlete_id == primary_id).count() == 2
        assert (
            db.query(Notification).filter(Notification.athlete_id == primary_id).count() == 2
        )
        assert (
            db.query(MaxHistory).filter(MaxHistory.athlete_id == primary_id).count() == 2
        )
        assert db.query(WorkLog).filter(WorkLog.athlete_id == primary_id).count() == 2
        assert (
            db.query(DailyWellness).filter(DailyWellness.athlete_id == primary_id).count()
            == 2
        )
        assert (
            db.query(MeetResult).filter(MeetResult.athlete_id == primary_id).count() == 2
        )
        assert (
            db.query(AthleteSession).filter(AthleteSession.athlete_id == primary_id).count()
            == 2
        )
    finally:
        db.close()


def test_merge_handles_opl_link_conflict(client):
    """Both athletes have OPL data: primary keeps its link, secondary's drops."""
    c, factory = client
    db = factory()
    try:
        primary_id = _seed_athlete(db, "Primary", with_opl=True)
        secondary_id = _seed_athlete(db, "Secondary", with_opl=True)
        db.commit()
    finally:
        db.close()

    resp = c.post(
        f"/api/athletes/{primary_id}/merge/{secondary_id}",
        json={"keep_name": "Primary"},
    )
    assert resp.status_code == 200, resp.text

    db = factory()
    try:
        # Primary still has exactly one OPL link (its own); secondary's was dropped
        # because the unique constraint allows only one per athlete and primary
        # already had one.
        assert db.query(OplLink).filter(OplLink.athlete_id == primary_id).count() == 1
        assert db.query(OplLink).filter(OplLink.athlete_id == secondary_id).count() == 0
        # OPL meets follow the link: primary's stay, secondary's were treated as
        # duplicates and removed.
        assert db.query(OplMeet).filter(OplMeet.athlete_id == primary_id).count() == 1
        assert db.query(OplMeet).filter(OplMeet.athlete_id == secondary_id).count() == 0
    finally:
        db.close()


def test_merge_reassigns_secondary_only_opl(client):
    """Only secondary has OPL data: link and meets move to primary."""
    c, factory = client
    db = factory()
    try:
        primary_id = _seed_athlete(db, "Primary", with_opl=False)
        secondary_id = _seed_athlete(db, "Secondary", with_opl=True)
        db.commit()
    finally:
        db.close()

    resp = c.post(
        f"/api/athletes/{primary_id}/merge/{secondary_id}",
        json={"keep_name": "Primary"},
    )
    assert resp.status_code == 200, resp.text

    db = factory()
    try:
        assert db.query(OplLink).filter(OplLink.athlete_id == primary_id).count() == 1
        assert db.query(OplMeet).filter(OplMeet.athlete_id == primary_id).count() == 1
    finally:
        db.close()
