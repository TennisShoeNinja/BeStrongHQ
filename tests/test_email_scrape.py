"""Tests for the Drive-sharing-based athlete email resolver."""

from __future__ import annotations

import pytest

from bestrong.gdrive import email_scrape
from bestrong.models.database import get_engine, get_session_factory
from bestrong.models.orm import Athlete, Base


@pytest.fixture
def factory(tmp_path):
    db_path = tmp_path / "instance.db"
    engine = get_engine(db_path)
    Base.metadata.create_all(bind=engine)
    return get_session_factory(db_path)


def test_resolve_email_single_non_coach():
    candidates = [
        {"email": "athlete@gmail.com", "role": "writer"},
    ]
    assert email_scrape.resolve_email(candidates, "coach@gmail.com") == "athlete@gmail.com"


def test_resolve_email_empty_list():
    assert email_scrape.resolve_email([], "coach@gmail.com") is None


def test_resolve_email_only_coach():
    candidates = [{"email": "coach@gmail.com", "role": "writer"}]
    assert email_scrape.resolve_email(candidates, "coach@gmail.com") is None


def test_resolve_email_coach_case_insensitive():
    candidates = [
        {"email": "Coach@Gmail.com", "role": "writer"},
        {"email": "athlete@gmail.com", "role": "reader"},
    ]
    assert email_scrape.resolve_email(candidates, "coach@gmail.com") == "athlete@gmail.com"


def test_resolve_email_multiple_non_coach_returns_none():
    candidates = [
        {"email": "athlete@gmail.com", "role": "writer"},
        {"email": "stranger@gmail.com", "role": "reader"},
    ]
    assert email_scrape.resolve_email(candidates, "coach@gmail.com") is None


def test_resolve_email_no_coach_known_still_resolves_single():
    candidates = [{"email": "athlete@gmail.com", "role": "writer"}]
    assert email_scrape.resolve_email(candidates, None) == "athlete@gmail.com"


def test_resolve_email_skips_entries_without_email():
    candidates = [
        {"role": "domain"},
        {"email": "athlete@gmail.com", "role": "writer"},
    ]
    assert email_scrape.resolve_email(candidates, "coach@gmail.com") == "athlete@gmail.com"


def test_find_athlete_by_folder_exact_match(factory):
    db = factory()
    try:
        db.add(Athlete(name="Joshua Onadeko"))
        db.commit()

        result = email_scrape.find_athlete_by_folder(db, "joshua onadeko")
        assert result is not None
        assert result.name == "Joshua Onadeko"
    finally:
        db.close()


def test_find_athlete_by_folder_prefix_match(factory):
    db = factory()
    try:
        db.add(Athlete(name="Joshua Onadeko"))
        db.commit()

        result = email_scrape.find_athlete_by_folder(db, "Joshua")
        assert result is not None
        assert result.name == "Joshua Onadeko"
    finally:
        db.close()


def test_find_athlete_by_folder_ambiguous_prefix_returns_none(factory):
    db = factory()
    try:
        db.add(Athlete(name="Mike Smith"))
        db.add(Athlete(name="Mike Jones"))
        db.commit()

        result = email_scrape.find_athlete_by_folder(db, "Mike")
        assert result is None
    finally:
        db.close()


def test_find_athlete_by_folder_no_match(factory):
    db = factory()
    try:
        db.add(Athlete(name="Joshua Onadeko"))
        db.commit()

        assert email_scrape.find_athlete_by_folder(db, "Brandon") is None
    finally:
        db.close()


def test_find_athlete_by_folder_empty_string(factory):
    db = factory()
    try:
        db.add(Athlete(name="Joshua Onadeko"))
        db.commit()

        assert email_scrape.find_athlete_by_folder(db, "  ") is None
    finally:
        db.close()


def test_scrape_for_athlete_writes_when_email_blank(factory, monkeypatch):
    monkeypatch.setattr(
        email_scrape.client,
        "get_shared_emails",
        lambda file_id, **kw: [{"email": "athlete@gmail.com", "role": "writer"}],
    )

    db = factory()
    try:
        athlete = Athlete(name="Joshua Onadeko")
        db.add(athlete)
        db.commit()

        updated = email_scrape.scrape_for_athlete(
            db, athlete, ["file1"], coach_email="coach@gmail.com"
        )
        assert updated is True
        assert athlete.email == "athlete@gmail.com"
    finally:
        db.close()


def test_scrape_for_athlete_skips_when_email_already_set(factory, monkeypatch):
    called = {"n": 0}

    def fake_get(file_id, **kw):
        called["n"] += 1
        return [{"email": "new@gmail.com", "role": "writer"}]

    monkeypatch.setattr(email_scrape.client, "get_shared_emails", fake_get)

    db = factory()
    try:
        athlete = Athlete(name="Joshua Onadeko", email="existing@gmail.com")
        db.add(athlete)
        db.commit()

        updated = email_scrape.scrape_for_athlete(
            db, athlete, ["file1"], coach_email="coach@gmail.com"
        )
        assert updated is False
        assert athlete.email == "existing@gmail.com"
        assert called["n"] == 0
    finally:
        db.close()


def test_scrape_for_athlete_force_overwrites_when_new_resolves(factory, monkeypatch):
    monkeypatch.setattr(
        email_scrape.client,
        "get_shared_emails",
        lambda file_id, **kw: [{"email": "new@gmail.com", "role": "writer"}],
    )

    db = factory()
    try:
        athlete = Athlete(name="Joshua Onadeko", email="old@gmail.com")
        db.add(athlete)
        db.commit()

        updated = email_scrape.scrape_for_athlete(
            db, athlete, ["file1"], coach_email="coach@gmail.com", force=True
        )
        assert updated is True
        assert athlete.email == "new@gmail.com"
    finally:
        db.close()


def test_scrape_for_athlete_force_does_not_blank_when_ambiguous(factory, monkeypatch):
    monkeypatch.setattr(
        email_scrape.client,
        "get_shared_emails",
        lambda file_id, **kw: [
            {"email": "a@gmail.com", "role": "writer"},
            {"email": "b@gmail.com", "role": "reader"},
        ],
    )

    db = factory()
    try:
        athlete = Athlete(name="Joshua Onadeko", email="old@gmail.com")
        db.add(athlete)
        db.commit()

        updated = email_scrape.scrape_for_athlete(
            db, athlete, ["file1"], coach_email="coach@gmail.com", force=True
        )
        assert updated is False
        assert athlete.email == "old@gmail.com"
    finally:
        db.close()


def test_scrape_for_athlete_walks_files_until_resolution(factory, monkeypatch):
    responses = {
        "file1": [],
        "file2": [
            {"email": "stranger1@gmail.com", "role": "writer"},
            {"email": "stranger2@gmail.com", "role": "reader"},
        ],
        "file3": [{"email": "athlete@gmail.com", "role": "writer"}],
    }
    monkeypatch.setattr(
        email_scrape.client,
        "get_shared_emails",
        lambda file_id, **kw: responses[file_id],
    )

    db = factory()
    try:
        athlete = Athlete(name="Joshua Onadeko")
        db.add(athlete)
        db.commit()

        updated = email_scrape.scrape_for_athlete(
            db, athlete, ["file1", "file2", "file3"], coach_email="coach@gmail.com"
        )
        assert updated is True
        assert athlete.email == "athlete@gmail.com"
    finally:
        db.close()


def test_scrape_for_athlete_returns_false_when_nothing_resolves(factory, monkeypatch):
    monkeypatch.setattr(
        email_scrape.client,
        "get_shared_emails",
        lambda file_id, **kw: [],
    )

    db = factory()
    try:
        athlete = Athlete(name="Joshua Onadeko")
        db.add(athlete)
        db.commit()

        updated = email_scrape.scrape_for_athlete(
            db, athlete, ["file1", "file2"], coach_email="coach@gmail.com"
        )
        assert updated is False
        assert athlete.email is None
    finally:
        db.close()
