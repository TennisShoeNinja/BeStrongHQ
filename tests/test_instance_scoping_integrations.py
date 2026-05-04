from pathlib import Path

from bestrong.gcal import client as gcal_client
from bestrong.gdrive.scheduler import SyncScheduler, get_scheduler
from bestrong.models.database import get_session, init_db


def _open_db(path: Path):
    init_db(path)
    return get_session(path)


def test_gcal_settings_are_scoped_to_the_provided_instance_db(tmp_path):
    instance_a = tmp_path / "instance-a.db"
    instance_b = tmp_path / "instance-b.db"

    db_a = _open_db(instance_a)
    db_b = _open_db(instance_b)

    try:
        gcal_client.set_calendar_id("calendar-a", db=db_a)
        gcal_client.save_event_mapping({"12": "evt-12"}, db=db_a)
        gcal_client.save_program_event_mapping({"7": "prog-evt-7"}, db=db_a)

        assert gcal_client.get_calendar_id(db=db_a) == "calendar-a"
        assert gcal_client.get_event_mapping(db=db_a) == {"12": "evt-12"}
        assert gcal_client.get_program_event_mapping(db=db_a) == {"7": "prog-evt-7"}

        assert gcal_client.get_calendar_id(db=db_b) == "primary"
        assert gcal_client.get_event_mapping(db=db_b) == {}


        assert gcal_client.get_program_event_mapping(db=db_b) == {}
    finally:
        db_a.close()
        db_b.close()


def test_gdrive_scheduler_instances_are_scoped_per_instance_db(tmp_path, monkeypatch):
    instance_a = tmp_path / "instance-a.db"
    instance_b = tmp_path / "instance-b.db"
    init_db(instance_a)
    init_db(instance_b)

    monkeypatch.setattr(SyncScheduler, "start", lambda self: None)

    scheduler_a = get_scheduler(instance_a)
    scheduler_b = get_scheduler(instance_b)

    scheduler_a.set_interval(15)

    assert scheduler_a is not scheduler_b
    assert scheduler_a.status["interval_minutes"] == 15
    assert scheduler_b.status["interval_minutes"] == 0
