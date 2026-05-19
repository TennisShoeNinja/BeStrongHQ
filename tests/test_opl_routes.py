from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text

from bestrong.api import create_app
from bestrong.api import routes_opl
from bestrong.api.deps import get_db
from bestrong.models.database import get_engine, get_session_factory, init_db, migrate_db
from bestrong.models.orm import Athlete, Base, OplLink
from bestrong.opl import autolink as opl_autolink


def _athletes_columns(db_path: Path) -> set[str]:
    conn = sqlite3.connect(str(db_path))
    try:
        rows = conn.execute("PRAGMA table_info(athletes)").fetchall()
        return {row[1] for row in rows}
    finally:
        conn.close()


@pytest.fixture()
def client(tmp_path):
    db_path = tmp_path / "opl_routes.db"
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
    app.dependency_overrides.clear()


def _seed_athlete(
    factory,
    *,
    name: str = "OPL Test Athlete",
    linked: bool = False,
    not_applicable: int = 0,
    archived: int = 0,
    division: str | None = None,
    weight_class: str | None = None,
) -> int:
    db = factory()
    try:
        athlete = Athlete(
            name=name,
            division=division,
            weight_class=weight_class,
        )
        athlete.opl_not_applicable = not_applicable
        athlete.archived = archived
        db.add(athlete)
        db.flush()
        if linked:
            db.add(OplLink(athlete_id=athlete.id, slug="opl-test-athlete"))
        athlete_id = athlete.id
        db.commit()
        return athlete_id
    finally:
        db.close()


def _opl_meet(
    *,
    meet_date: str | None,
    division: str | None = "Open",
    weight_class_kg: str | None = "82.5",
) -> dict:
    return {
        "meet_path": f"meets/{meet_date or 'unknown'}",
        "meet_name": "OPL Test Meet",
        "meet_date": meet_date,
        "division": division,
        "weight_class_kg": weight_class_kg,
        "sex": "F",
        "attempts": [],
    }


def _stub_opl_meets(monkeypatch: pytest.MonkeyPatch, meets: list[dict]) -> None:
    monkeypatch.setattr(routes_opl, "fetch_lifter_csv", lambda _slug: meets)


def _stub_autolink_sleep(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(opl_autolink.time, "sleep", lambda _seconds: None)


def _run_autolink(factory) -> dict:
    db = factory()
    try:
        return opl_autolink.run_opl_autolink(db, sleep_seconds=0)
    finally:
        db.close()


def _get_athlete(factory, athlete_id: int) -> Athlete:
    db = factory()
    try:
        athlete = db.query(Athlete).filter(Athlete.id == athlete_id).one()
        db.expunge(athlete)
        return athlete
    finally:
        db.close()


def test_opl_not_applicable_column_exists_after_create_all_and_migrate_db(
    tmp_path: Path,
) -> None:
    fresh_db = tmp_path / "fresh.db"
    engine = create_engine(f"sqlite:///{fresh_db}")
    Base.metadata.create_all(bind=engine)
    engine.dispose()

    assert "opl_not_applicable" in _athletes_columns(fresh_db)

    migrated_db = tmp_path / "migrated.db"
    init_db(migrated_db)
    engine = create_engine(f"sqlite:///{migrated_db}")
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE athletes DROP COLUMN opl_not_applicable"))
    engine.dispose()

    assert "opl_not_applicable" not in _athletes_columns(migrated_db)

    migrate_db(migrated_db)

    assert "opl_not_applicable" in _athletes_columns(migrated_db)


def test_put_sets_opl_not_applicable_and_status_reflects_value(client) -> None:
    test_client, factory = client
    athlete_id = _seed_athlete(factory)

    response = test_client.put(
        f"/api/opl/athletes/{athlete_id}/not-applicable",
        json={"value": True},
    )

    assert response.status_code == 200
    assert response.json() == {
        "linked": False,
        "link": None,
        "not_applicable": True,
    }
    assert _get_athlete(factory, athlete_id).opl_not_applicable == 1

    status = test_client.get(f"/api/opl/athletes/{athlete_id}/status")
    assert status.status_code == 200
    assert status.json()["not_applicable"] is True


def test_put_clears_opl_not_applicable(client) -> None:
    test_client, factory = client
    athlete_id = _seed_athlete(factory, not_applicable=1)

    response = test_client.put(
        f"/api/opl/athletes/{athlete_id}/not-applicable",
        json={"value": False},
    )

    assert response.status_code == 200
    assert response.json()["not_applicable"] is False
    assert _get_athlete(factory, athlete_id).opl_not_applicable == 0


def test_put_opl_not_applicable_for_missing_athlete_returns_404(client) -> None:
    test_client, _factory = client

    response = test_client.put(
        "/api/opl/athletes/999999/not-applicable",
        json={"value": True},
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Athlete not found"


def test_marking_opl_not_applicable_while_linked_returns_409(client) -> None:
    test_client, factory = client
    athlete_id = _seed_athlete(factory, linked=True)

    response = test_client.put(
        f"/api/opl/athletes/{athlete_id}/not-applicable",
        json={"value": True},
    )

    assert response.status_code == 409
    assert response.json()["detail"] == "Unlink from OpenPowerlifting first"
    assert _get_athlete(factory, athlete_id).opl_not_applicable == 0


def test_clearing_opl_not_applicable_while_linked_succeeds(client) -> None:
    test_client, factory = client
    athlete_id = _seed_athlete(factory, linked=True, not_applicable=1)

    response = test_client.put(
        f"/api/opl/athletes/{athlete_id}/not-applicable",
        json={"value": False},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["linked"] is True
    assert data["not_applicable"] is False
    assert data["link"]["slug"] == "opl-test-athlete"
    assert _get_athlete(factory, athlete_id).opl_not_applicable == 0


def test_link_backfills_empty_division_and_weight_class_from_latest_meet(
    client,
    monkeypatch,
) -> None:
    test_client, factory = client
    athlete_id = _seed_athlete(factory)
    _stub_opl_meets(
        monkeypatch,
        [_opl_meet(meet_date="2025-03-01", division="Open", weight_class_kg="82.5")],
    )

    response = test_client.post(
        f"/api/opl/athletes/{athlete_id}/link",
        json={"slug": "opl-test-athlete"},
    )

    assert response.status_code == 200
    athlete = _get_athlete(factory, athlete_id)
    assert athlete.division == "Open"
    assert athlete.weight_class == "82.5 kg"


def test_link_does_not_overwrite_coach_set_division_or_weight_class(
    client,
    monkeypatch,
) -> None:
    test_client, factory = client
    athlete_id = _seed_athlete(
        factory,
        division="Coach Division",
        weight_class="Coach Class",
    )
    _stub_opl_meets(
        monkeypatch,
        [_opl_meet(meet_date="2025-03-01", division="Open", weight_class_kg="82.5")],
    )

    response = test_client.post(
        f"/api/opl/athletes/{athlete_id}/link",
        json={"slug": "opl-test-athlete"},
    )

    assert response.status_code == 200
    athlete = _get_athlete(factory, athlete_id)
    assert athlete.division == "Coach Division"
    assert athlete.weight_class == "Coach Class"


def test_refresh_backfills_field_that_is_still_empty(client, monkeypatch) -> None:
    test_client, factory = client
    athlete_id = _seed_athlete(factory, linked=True, division="Coach Division")
    _stub_opl_meets(
        monkeypatch,
        [_opl_meet(meet_date="2025-03-01", division="Open", weight_class_kg="82.5")],
    )

    response = test_client.post(f"/api/opl/athletes/{athlete_id}/refresh")

    assert response.status_code == 200
    athlete = _get_athlete(factory, athlete_id)
    assert athlete.division == "Coach Division"
    assert athlete.weight_class == "82.5 kg"


def test_link_with_no_opl_meets_leaves_division_and_weight_class_empty(
    client,
    monkeypatch,
) -> None:
    test_client, factory = client
    athlete_id = _seed_athlete(factory)
    _stub_opl_meets(monkeypatch, [])

    response = test_client.post(
        f"/api/opl/athletes/{athlete_id}/link",
        json={"slug": "opl-test-athlete"},
    )

    assert response.status_code == 200
    athlete = _get_athlete(factory, athlete_id)
    assert athlete.division is None
    assert athlete.weight_class is None


def test_backfill_uses_most_recent_opl_meet(client, monkeypatch) -> None:
    test_client, factory = client
    athlete_id = _seed_athlete(factory)
    _stub_opl_meets(
        monkeypatch,
        [
            _opl_meet(
                meet_date="2024-02-01",
                division="Older Division",
                weight_class_kg="75",
            ),
            _opl_meet(
                meet_date="2025-02-01",
                division="Later Division",
                weight_class_kg="82.5",
            ),
        ],
    )

    response = test_client.post(
        f"/api/opl/athletes/{athlete_id}/link",
        json={"slug": "opl-test-athlete"},
    )

    assert response.status_code == 200
    athlete = _get_athlete(factory, athlete_id)
    assert athlete.division == "Later Division"
    assert athlete.weight_class == "82.5 kg"


def test_autolink_unique_match_links_athlete(client, monkeypatch) -> None:
    _test_client, factory = client
    athlete_id = _seed_athlete(factory, name="Unique Athlete")
    monkeypatch.setattr(
        opl_autolink,
        "search_lifters",
        lambda _name: [{"slug": "unique-athlete", "name": "Unique Athlete"}],
    )
    _stub_opl_meets(monkeypatch, [])

    summary = _run_autolink(factory)

    assert summary == {
        "linked": [
            {
                "athlete_id": athlete_id,
                "name": "Unique Athlete",
                "slug": "unique-athlete",
                "imported_attempts": 0,
            }
        ],
        "needs_review": [],
        "no_match": [],
    }
    db = factory()
    try:
        link = db.query(OplLink).filter(OplLink.athlete_id == athlete_id).one()
        assert link.slug == "unique-athlete"
    finally:
        db.close()


def test_autolink_multi_match_needs_review_without_link(client, monkeypatch) -> None:
    _test_client, factory = client
    athlete_id = _seed_athlete(factory, name="Common Athlete")
    candidates = [
        {"slug": "common-a", "name": "Common Athlete A"},
        {"slug": "common-b", "name": "Common Athlete B"},
    ]
    monkeypatch.setattr(opl_autolink, "search_lifters", lambda _name: candidates)

    summary = _run_autolink(factory)

    assert summary == {
        "linked": [],
        "needs_review": [
            {
                "athlete_id": athlete_id,
                "name": "Common Athlete",
                "candidates": candidates,
            }
        ],
        "no_match": [],
    }
    db = factory()
    try:
        assert db.query(OplLink).filter(OplLink.athlete_id == athlete_id).count() == 0
    finally:
        db.close()


def test_autolink_zero_match_no_match_without_link(client, monkeypatch) -> None:
    _test_client, factory = client
    athlete_id = _seed_athlete(factory, name="Missing Athlete")
    monkeypatch.setattr(opl_autolink, "search_lifters", lambda _name: [])

    summary = _run_autolink(factory)

    assert summary == {
        "linked": [],
        "needs_review": [],
        "no_match": [{"athlete_id": athlete_id, "name": "Missing Athlete"}],
    }
    db = factory()
    try:
        assert db.query(OplLink).filter(OplLink.athlete_id == athlete_id).count() == 0
    finally:
        db.close()


def test_autolink_skips_archived_na_and_already_linked_athletes(
    client,
    monkeypatch,
) -> None:
    _test_client, factory = client
    _seed_athlete(factory, name="Archived Athlete", archived=1)
    _seed_athlete(factory, name="Not Applicable Athlete", not_applicable=1)
    _seed_athlete(factory, name="Already Linked Athlete", linked=True)
    searched: list[str] = []

    def fake_search(name: str) -> list[dict]:
        searched.append(name)
        return [{"slug": "unexpected", "name": name}]

    monkeypatch.setattr(opl_autolink, "search_lifters", fake_search)

    summary = _run_autolink(factory)

    assert searched == []
    assert summary == {"linked": [], "needs_review": [], "no_match": []}


def test_autolink_endpoint_returns_summary_shape(client, monkeypatch) -> None:
    test_client, factory = client
    athlete_id = _seed_athlete(factory, name="Endpoint Athlete")
    monkeypatch.setattr(
        opl_autolink,
        "search_lifters",
        lambda _name: [{"slug": "endpoint-athlete", "name": "Endpoint Athlete"}],
    )
    _stub_opl_meets(monkeypatch, [])
    _stub_autolink_sleep(monkeypatch)

    response = test_client.post("/api/opl/autolink")

    assert response.status_code == 200
    assert response.json() == {
        "linked": [
            {
                "athlete_id": athlete_id,
                "name": "Endpoint Athlete",
                "slug": "endpoint-athlete",
                "imported_attempts": 0,
            }
        ],
        "needs_review": [],
        "no_match": [],
    }


def test_opl_coverage_counts_roster_buckets_and_excludes_archived(client) -> None:
    test_client, _factory = client
    linked_id = _seed_athlete(_factory, name="Linked Athlete", linked=True)
    na_id = _seed_athlete(_factory, name="Not Applicable Athlete", not_applicable=1)
    beta_id = _seed_athlete(_factory, name="Beta Needs Link")
    charlie_id = _seed_athlete(_factory, name="Charlie Needs Link")
    _seed_athlete(_factory, name="Archived Unlinked", archived=1)
    _seed_athlete(_factory, name="Archived Linked", archived=1, linked=True)
    _seed_athlete(
        _factory,
        name="Linked And Not Applicable",
        linked=True,
        not_applicable=1,
    )

    response = test_client.get("/api/opl/coverage")

    assert response.status_code == 200
    assert response.json() == {
        "linked": 2,
        "needs_linking": 2,
        "not_applicable": 1,
        "total": 5,
        "needs_linking_athletes": [
            {"athlete_id": beta_id, "name": "Beta Needs Link"},
            {"athlete_id": charlie_id, "name": "Charlie Needs Link"},
        ],
    }
    data = response.json()
    all_ids = [row["athlete_id"] for row in data["needs_linking_athletes"]]
    assert linked_id not in all_ids
    assert na_id not in all_ids


def test_opl_coverage_empty_roster(client) -> None:
    test_client, _factory = client

    response = test_client.get("/api/opl/coverage")

    assert response.status_code == 200
    assert response.json() == {
        "linked": 0,
        "needs_linking": 0,
        "not_applicable": 0,
        "total": 0,
        "needs_linking_athletes": [],
    }
