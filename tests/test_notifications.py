"""Regression tests for inbox notification behavior."""

from __future__ import annotations

from fastapi.testclient import TestClient

from bestrong.api import create_app
from bestrong.api.deps import get_db
from bestrong.models.database import get_engine, get_session_factory
from bestrong.models.orm import Athlete, Base, Notification


def _client_with_db(tmp_path):
    db_path = tmp_path / "notifications.db"
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


def test_archiving_athlete_archives_their_inbox_notifications(tmp_path):
    client, factory = _client_with_db(tmp_path)
    db = factory()
    try:
        athlete = Athlete(name="Notify Nina", program_due="2000-01-01")
        db.add(athlete)
        db.flush()
        db.add(
            Notification(
                athlete_id=athlete.id,
                title="Program due",
                notification_type="program_due",
                due_date="2000-01-01",
            )
        )
        athlete_id = athlete.id
        db.commit()
    finally:
        db.close()

    try:
        resp = client.post(f"/api/athletes/{athlete_id}/archive")
        assert resp.status_code == 200, resp.text

        assert client.get("/api/notifications").json() == []
        assert client.get("/api/notifications/count").json() == {"count": 0}

        db = factory()
        try:
            notif = db.query(Notification).filter(Notification.athlete_id == athlete_id).one()
            assert bool(notif.archived) is True
            assert bool(notif.read) is True
        finally:
            db.close()
    finally:
        client.close()
