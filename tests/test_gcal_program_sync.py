"""Tests for Google Calendar program-due sync + BeStrongHQ provisioning.

These tests stub out ``client._get_service`` and ``client.is_authenticated``
so we never hit the network. They focus on:

  * ``sync_all_programs`` skipping the right athletes
  * Per-instance isolation of the program-event mapping during a sync
  * ``ensure_bestronghq_calendar`` idempotency + auto-selecting the new
    calendar when no calendar is selected yet
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest

from bestrong.gcal import client as gcal_client
from bestrong.gcal import sync as gcal_sync
from bestrong.models.database import get_session, init_db
from bestrong.models.orm import Athlete, Meet


def _open_db(path: Path):
    init_db(path)
    return get_session(path)


class _FakeEvents:
    def __init__(self, store: dict[str, dict]):
        self._store = store
        self._counter = 0

    def insert(self, calendarId: str, body: dict):  # noqa: N803
        self._counter += 1
        event_id = f"evt-{self._counter}"
        self._store[event_id] = {"id": event_id, "calendar": calendarId, **body}

        class _Exec:
            def __init__(self, payload):
                self._payload = payload

            def execute(self_inner):
                return self_inner._payload

        return _Exec(self._store[event_id])

    def update(self, calendarId: str, eventId: str, body: dict):  # noqa: N803
        if eventId not in self._store:
            raise RuntimeError(f"no such event {eventId}")
        self._store[eventId] = {"id": eventId, "calendar": calendarId, **body}

        class _Exec:
            def __init__(self, payload):
                self._payload = payload

            def execute(self_inner):
                return self_inner._payload

        return _Exec(self._store[eventId])


class _FakeCalendarList:
    def __init__(self, items: list[dict]):
        self._items = items

    def list(self, **_kwargs: Any):
        items = self._items

        class _Exec:
            def execute(self_inner):
                return {"items": items}

        return _Exec()


class _FakeCalendars:
    def __init__(self, items: list[dict]):
        self._items = items
        self._counter = 0

    def insert(self, body: dict):
        self._counter += 1
        cal = {"id": f"cal-{self._counter}", **body}
        self._items.append(cal)

        class _Exec:
            def __init__(self, payload):
                self._payload = payload

            def execute(self_inner):
                return self_inner._payload

        return _Exec(cal)


class _FakeService:
    def __init__(
        self,
        events_store: dict[str, dict] | None = None,
        calendars: list[dict] | None = None,
    ):
        self._events_store = events_store if events_store is not None else {}
        self._calendars = calendars if calendars is not None else []

    def events(self):
        return _FakeEvents(self._events_store)

    def calendarList(self):  # noqa: N802
        return _FakeCalendarList(self._calendars)

    def calendars(self):
        return _FakeCalendars(self._calendars)


@pytest.fixture
def fake_service(monkeypatch):
    """Replace the gcal client's authenticated service with a fake. Multiple
    instances share the same fake (which is itself stateless across instances
    because all per-instance state is read from the db, not from the service).
    """
    service = _FakeService()
    monkeypatch.setattr(gcal_client, "_get_service", lambda **_: service)
    monkeypatch.setattr(gcal_client, "is_authenticated", lambda **_: True)
    return service


def test_sync_all_programs_skips_archived_and_due_less_athletes(tmp_path, fake_service):
    db = _open_db(tmp_path / "instance.db")
    try:


        db.add(Athlete(name="Active Andy", program_due="2026-05-01"))
        db.add(Athlete(name="Archived Annie", program_due="2026-05-01", archived=True))
        db.add(Athlete(name="No Due Ned"))
        db.commit()

        result = gcal_sync.sync_all_programs(db)
        assert result["total_programs"] == 1
        assert result["created"] == 1
        assert result["updated"] == 0
        assert result["errors"] == []

        mapping = gcal_client.get_program_event_mapping(db=db)

        assert len(mapping) == 1
    finally:
        db.close()


def test_sync_all_programs_updates_existing_event_on_second_run(tmp_path, fake_service):
    db = _open_db(tmp_path / "instance.db")
    try:
        andy = Athlete(name="Active Andy", program_due="2026-05-01")
        db.add(andy)
        db.commit()

        first = gcal_sync.sync_all_programs(db)
        assert first["created"] == 1
        assert first["updated"] == 0


        andy.program_due = "2026-05-15"
        db.commit()

        second = gcal_sync.sync_all_programs(db)
        assert second["created"] == 0
        assert second["updated"] == 1

        assert len(gcal_client.get_program_event_mapping(db=db)) == 1
    finally:
        db.close()


def test_program_mapping_does_not_bleed_across_instances(tmp_path, fake_service):
    """Coach B's sync must only see coach B's athletes, even though both
    instances share the same fake Google service. Isolation is enforced by
    the per-instance DB session that ``sync_all_programs`` reads from.
    """
    db_a = _open_db(tmp_path / "instance-a.db")
    db_b = _open_db(tmp_path / "instance-b.db")

    try:
        db_a.add(Athlete(name="Instance A Andy", program_due="2026-05-01"))
        db_a.commit()

        db_b.add(Athlete(name="Instance B Bob", program_due="2026-06-01"))
        db_b.add(Athlete(name="Instance B Beth", program_due="2026-06-15"))
        db_b.commit()

        result_a = gcal_sync.sync_all_programs(db_a)
        result_b = gcal_sync.sync_all_programs(db_b)

        assert result_a["created"] == 1
        assert result_b["created"] == 2

        map_a = gcal_client.get_program_event_mapping(db=db_a)
        map_b = gcal_client.get_program_event_mapping(db=db_b)


        athlete_ids_a = {str(a.id) for a in db_a.query(Athlete).all()}
        athlete_ids_b = {str(a.id) for a in db_b.query(Athlete).all()}
        assert set(map_a.keys()) <= athlete_ids_a
        assert set(map_b.keys()) <= athlete_ids_b
        assert len(map_a) == 1
        assert len(map_b) == 2


        assert gcal_client.get_program_event_mapping(db=db_a) != map_b
        assert gcal_client.get_program_event_mapping(db=db_b) != map_a
    finally:
        db_a.close()
        db_b.close()


def test_ensure_bestronghq_creates_calendar_when_missing(tmp_path, monkeypatch):
    db = _open_db(tmp_path / "instance.db")
    try:

        service = _FakeService(calendars=[{"id": "primary", "summary": "Primary"}])
        monkeypatch.setattr(gcal_client, "_get_service", lambda **_: service)

        cal_id = gcal_client.ensure_bestronghq_calendar(db=db)
        assert cal_id.startswith("cal-")


        names = [c["summary"] for c in service._calendars]
        assert "BeStrongHQ" in names


        assert gcal_client.get_calendar_id(db=db) == cal_id
    finally:
        db.close()


def test_ensure_bestronghq_is_idempotent(tmp_path, monkeypatch):
    db = _open_db(tmp_path / "instance.db")
    try:
        service = _FakeService(
            calendars=[
                {"id": "primary", "summary": "Primary"},
                {"id": "existing", "summary": "BeStrongHQ"},
            ]
        )
        monkeypatch.setattr(gcal_client, "_get_service", lambda **_: service)

        cal_id_1 = gcal_client.ensure_bestronghq_calendar(db=db)
        cal_id_2 = gcal_client.ensure_bestronghq_calendar(db=db)

        assert cal_id_1 == "existing"
        assert cal_id_2 == "existing"

        names = [c["summary"] for c in service._calendars]
        assert names.count("BeStrongHQ") == 1
    finally:
        db.close()


def test_sync_options_default_to_meets_and_programs(tmp_path):
    """Coaches who haven't visited the new UI should keep getting meets
    and program-due events (legacy behavior); availability and birthdays
    should be off by default since they're opt-in additions.
    """
    db = _open_db(tmp_path / "instance.db")
    try:
        opts = gcal_client.get_sync_options(db=db)
        assert opts == {
            "meets": True,
            "programs": True,
            "availability": False,
            "birthdays": False,
        }
    finally:
        db.close()


def test_sync_options_persist_per_instance(tmp_path):
    db_a = _open_db(tmp_path / "instance-a.db")
    db_b = _open_db(tmp_path / "instance-b.db")
    try:
        gcal_client.save_sync_options(
            {"meets": False, "programs": True, "availability": True, "birthdays": True},
            db=db_a,
        )

        assert gcal_client.get_sync_options(db=db_a) == {
            "meets": False,
            "programs": True,
            "availability": True,
            "birthdays": True,
        }

        assert gcal_client.get_sync_options(db=db_b) == {
            "meets": True,
            "programs": True,
            "availability": False,
            "birthdays": False,
        }
    finally:
        db_a.close()
        db_b.close()


def test_save_sync_options_drops_unknown_keys(tmp_path):
    db = _open_db(tmp_path / "instance.db")
    try:

        gcal_client.save_sync_options(
            {"meets": True, "programs": True, "availability": False, "birthdays": False, "rogue": True},
            db=db,
        )
        opts = gcal_client.get_sync_options(db=db)
        assert "rogue" not in opts
    finally:
        db.close()


def test_sync_all_skips_disabled_categories(tmp_path, fake_service, monkeypatch):
    """``sync_all`` should call only the helpers for categories the coach
    has toggled on, and return zeroed counts for the rest. We monkey-patch
    each per-category helper to assert it was or wasn't called.
    """
    from bestrong.gcal import sync as gcal_sync

    db = _open_db(tmp_path / "instance.db")
    try:


        gcal_client.save_sync_options(
            {"meets": False, "programs": False, "availability": True, "birthdays": False},
            db=db,
        )

        called: dict[str, bool] = {
            "meets": False,
            "programs": False,
            "availability": False,
            "birthdays": False,
        }

        def make_stub(name, payload):
            def stub(_db):
                called[name] = True
                return payload
            return stub

        monkeypatch.setattr(
            gcal_sync, "sync_all_meets",
            make_stub("meets", {"total_meets": 5, "created": 5, "updated": 0, "errors": []}),
        )
        monkeypatch.setattr(
            gcal_sync, "sync_all_programs",
            make_stub("programs", {"total_programs": 3, "created": 3, "updated": 0, "errors": []}),
        )
        monkeypatch.setattr(
            gcal_sync, "sync_all_availability",
            make_stub("availability", {"total_athletes": 2, "created": 2, "updated": 0, "errors": []}),
        )
        monkeypatch.setattr(
            gcal_sync, "sync_all_birthdays",
            make_stub("birthdays", {"total_athletes": 9, "created": 9, "updated": 0, "errors": []}),
        )

        result = gcal_sync.sync_all(db)


        assert called == {
            "meets": False,
            "programs": False,
            "availability": True,
            "birthdays": False,
        }


        assert result["meets"] == {"total_meets": 0, "created": 0, "updated": 0, "errors": []}
        assert result["programs"] == {"total_programs": 0, "created": 0, "updated": 0, "errors": []}
        assert result["availability"]["total_athletes"] == 2
        assert result["birthdays"] == {"total_athletes": 0, "created": 0, "updated": 0, "errors": []}
    finally:
        db.close()


def test_sync_availability_skips_athletes_missing_either_date(tmp_path, fake_service):
    """Need both start AND end to make a sensible date-range event."""
    from datetime import date, timedelta

    from bestrong.gcal import sync as gcal_sync

    today = date.today()
    start = (today + timedelta(days=7)).isoformat()
    end = (today + timedelta(days=14)).isoformat()

    db = _open_db(tmp_path / "instance.db")
    try:
        db.add(Athlete(name="Both Dates Bob", out_from=start, out_through=end))
        db.add(Athlete(name="Start Only Sam", out_from=start))
        db.add(Athlete(name="End Only Ed", out_through=end))
        db.add(Athlete(name="No Dates Ned"))
        db.add(Athlete(name="Archived Anne", out_from=start, out_through=end, archived=True))
        db.commit()

        result = gcal_sync.sync_all_availability(db)
        assert result["total_athletes"] == 1
        assert result["created"] == 1
        assert result["errors"] == []

        mapping = gcal_client.get_availability_event_mapping(db=db)
        assert len(mapping) == 1
    finally:
        db.close()


def test_sync_availability_handles_unparseable_end_date(tmp_path, fake_service):
    from bestrong.gcal import sync as gcal_sync

    db = _open_db(tmp_path / "instance.db")
    try:
        db.add(Athlete(name="Bad Date Bob", out_from="2026-05-01", out_through="not-a-date"))
        db.commit()

        result = gcal_sync.sync_all_availability(db)


        assert result["created"] == 0
        assert result["updated"] == 0
        assert any("Bad Date Bob" in err for err in result["errors"])
    finally:
        db.close()


def test_sync_birthdays_creates_yearly_recurring_events(tmp_path, monkeypatch):
    """Birthdays should create one event per athlete with RRULE:FREQ=YEARLY
    in the body so Google handles the yearly recurrence for us.
    """
    from bestrong.gcal import sync as gcal_sync

    captured_bodies: list[dict] = []

    class _CapturingEvents:
        def __init__(self, store, captured):
            self._store = store
            self._captured = captured
            self._counter = 0

        def insert(self, calendarId, body):  # noqa: N803
            self._counter += 1
            event_id = f"bday-{self._counter}"
            self._store[event_id] = body
            self._captured.append(body)

            class _Exec:
                def execute(self_inner):
                    return {"id": event_id, **body}
            return _Exec()

    class _CapturingService:
        def __init__(self, captured):
            self._store: dict = {}
            self._captured = captured

        def events(self):
            return _CapturingEvents(self._store, self._captured)

        def calendarList(self):  # noqa: N802
            class _Empty:
                def list(self, **_):
                    class _E:
                        def execute(s):
                            return {"items": []}
                    return _E()
            return _Empty()

    service = _CapturingService(captured_bodies)
    monkeypatch.setattr(gcal_client, "_get_service", lambda **_: service)
    monkeypatch.setattr(gcal_client, "is_authenticated", lambda **_: True)

    db = _open_db(tmp_path / "instance.db")
    try:
        db.add(Athlete(name="Iso Ivy", dob="1995-03-14"))
        db.add(Athlete(name="Slash Sam", dob="07/04/1990"))
        db.add(Athlete(name="No DOB Ned"))
        db.add(Athlete(name="Garbage Greta", dob="not-real"))
        db.commit()

        result = gcal_sync.sync_all_birthdays(db)

        assert result["created"] == 2
        assert any("Garbage Greta" in err for err in result["errors"])


        assert len(captured_bodies) == 2
        for body in captured_bodies:
            assert body.get("recurrence") == ["RRULE:FREQ=YEARLY"]
            assert body.get("transparency") == "transparent"
    finally:
        db.close()


def test_sync_all_meets_skips_past_meets(tmp_path, fake_service):
    """Past meets stay on the calendar but no longer get re-pushed; only
    upcoming + in-progress meets count toward created/updated.
    """
    from datetime import date, timedelta

    db = _open_db(tmp_path / "instance.db")
    try:
        today = date.today()
        past = (today - timedelta(days=30)).isoformat()
        upcoming = (today + timedelta(days=14)).isoformat()
        in_progress_start = (today - timedelta(days=1)).isoformat()
        in_progress_end = (today + timedelta(days=1)).isoformat()

        db.add(Meet(name="Old Nationals", meet_date=past))
        db.add(Meet(name="Spring Open", meet_date=upcoming))
        db.add(
            Meet(
                name="Live Multi-Day",
                meet_date=in_progress_start,
                meet_date_end=in_progress_end,
            )
        )
        db.commit()

        result = gcal_sync.sync_all_meets(db)

        assert result["created"] == 2
        assert result["updated"] == 0
        assert result["errors"] == []

        mapping = gcal_client.get_event_mapping(db=db)

        past_meet_id = db.query(Meet).filter(Meet.name == "Old Nationals").one().id
        assert str(past_meet_id) not in mapping
    finally:
        db.close()


def test_sync_single_meet_rejects_past_meet(tmp_path, fake_service):
    from datetime import date, timedelta

    db = _open_db(tmp_path / "instance.db")
    try:
        past = (date.today() - timedelta(days=7)).isoformat()
        meet = Meet(name="Old Nationals", meet_date=past)
        db.add(meet)
        db.commit()

        with pytest.raises(ValueError, match="already passed"):
            gcal_sync.sync_single_meet(db, meet.id)
    finally:
        db.close()


def test_sync_single_meet_allows_meet_ending_today(tmp_path, fake_service):
    """A meet whose end date is today is still in progress, not past."""
    from datetime import date

    db = _open_db(tmp_path / "instance.db")
    try:
        meet = Meet(name="Today's Meet", meet_date=date.today().isoformat())
        db.add(meet)
        db.commit()

        event_id = gcal_sync.sync_single_meet(db, meet.id)
        assert event_id
    finally:
        db.close()


def test_sync_all_availability_skips_past_windows(tmp_path, fake_service):
    """Once an athlete's time-off window has ended, it stops being pushed —
    the past event already on the calendar stays put, but no fresh write.
    """
    from datetime import date, timedelta

    db = _open_db(tmp_path / "instance.db")
    try:
        today = date.today()
        past_start = (today - timedelta(days=30)).isoformat()
        past_end = (today - timedelta(days=20)).isoformat()
        upcoming_start = (today + timedelta(days=14)).isoformat()
        upcoming_end = (today + timedelta(days=21)).isoformat()
        ongoing_start = (today - timedelta(days=2)).isoformat()
        ongoing_end = (today + timedelta(days=2)).isoformat()

        db.add(Athlete(name="Past Pat", out_from=past_start, out_through=past_end))
        db.add(Athlete(name="Upcoming Uma", out_from=upcoming_start, out_through=upcoming_end))
        db.add(Athlete(name="Ongoing Otis", out_from=ongoing_start, out_through=ongoing_end))
        db.commit()

        result = gcal_sync.sync_all_availability(db)

        assert result["created"] == 2
        assert result["updated"] == 0
        assert result["errors"] == []

        mapping = gcal_client.get_availability_event_mapping(db=db)
        past_id = db.query(Athlete).filter(Athlete.name == "Past Pat").one().id
        assert str(past_id) not in mapping
    finally:
        db.close()


def test_sync_single_athlete_availability_rejects_past_window(tmp_path, fake_service):
    from datetime import date, timedelta

    db = _open_db(tmp_path / "instance.db")
    try:
        today = date.today()
        athlete = Athlete(
            name="Past Pat",
            out_from=(today - timedelta(days=30)).isoformat(),
            out_through=(today - timedelta(days=20)).isoformat(),
        )
        db.add(athlete)
        db.commit()

        with pytest.raises(ValueError, match="already passed"):
            gcal_sync.sync_single_athlete_availability(db, athlete.id)
    finally:
        db.close()


def test_sync_single_athlete_availability_allows_window_ending_today(tmp_path, fake_service):
    """A window ending today is still active, not past."""
    from datetime import date, timedelta

    db = _open_db(tmp_path / "instance.db")
    try:
        today = date.today()
        athlete = Athlete(
            name="Last Day Larry",
            out_from=(today - timedelta(days=3)).isoformat(),
            out_through=today.isoformat(),
        )
        db.add(athlete)
        db.commit()

        event_id = gcal_sync.sync_single_athlete_availability(db, athlete.id)
        assert event_id
    finally:
        db.close()


def test_ensure_bestronghq_does_not_overwrite_user_chosen_calendar(tmp_path, monkeypatch):
    db = _open_db(tmp_path / "instance.db")
    try:

        gcal_client.set_calendar_id("personal-cal", db=db)

        service = _FakeService(calendars=[{"id": "primary", "summary": "Primary"}])
        monkeypatch.setattr(gcal_client, "_get_service", lambda **_: service)

        gcal_client.ensure_bestronghq_calendar(db=db)


        assert gcal_client.get_calendar_id(db=db) == "personal-cal"
    finally:
        db.close()
