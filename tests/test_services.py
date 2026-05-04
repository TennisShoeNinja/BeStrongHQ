"""Tests for the import service — upsert logic, duplicate day fix, display names."""

from __future__ import annotations

from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from bestrong.models.orm import (
    Base, Athlete, Program, Session, ExerciseEntry, WeeklyVolume,
)
from bestrong.services import (
    _build_program_display_name,
    _fix_duplicate_day3_sessions,
    _write_to_db,
    import_file,
)
from bestrong.parser.pipeline import parse_file


FIXTURE_ED = Path(__file__).parent / "fixtures" / "athlete_b_program_35.xlsx"
FIXTURE_LAMAR = Path(__file__).parent / "fixtures" / "athlete_a_program_38.xlsx"
PARSER_ID = "bestrong"


@pytest.fixture()
def db():
    """In-memory SQLite database session for each test."""
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    factory = sessionmaker(bind=engine)
    session = factory()
    yield session
    session.close()


@pytest.fixture()
def db_path(tmp_path):
    """Temporary on-disk SQLite database path for import_file() tests."""
    return tmp_path / "test.db"


class TestBuildProgramDisplayName:
    def test_full_format(self):
        result = _build_program_display_name(
            athlete_name="Andrew Helguera",
            program_number=21,
            date_start="03/08/26",
            date_end="04/11/26",
            theme="Hypertrophy",
        )
        assert result == "Andrew Helguera's Program 21 -- (03/08/26 - 04/11/26) -- Hypertrophy"

    def test_no_theme(self):
        result = _build_program_display_name(
            athlete_name="Andrew",
            program_number=5,
            date_start="01/01/26",
            date_end="01/28/26",
            theme=None,
        )
        assert result == "Andrew's Program 5 -- (01/01/26 - 01/28/26)"

    def test_no_dates(self):
        result = _build_program_display_name(
            athlete_name="Lamar",
            program_number=38,
            date_start=None,
            date_end=None,
            theme="Peaking",
        )
        assert result == "Lamar's Program 38 -- Peaking"

    def test_no_athlete_name(self):
        result = _build_program_display_name(
            athlete_name=None,
            program_number=10,
            date_start="01/01/26",
            date_end="01/28/26",
            theme="Block A",
        )
        assert result == "Program 10 -- (01/01/26 - 01/28/26) -- Block A"

    def test_no_program_number(self):
        result = _build_program_display_name(
            athlete_name="Test",
            program_number=None,
            date_start=None,
            date_end=None,
            theme="My Theme",
        )
        assert result == "My Theme"

    def test_nothing_at_all(self):
        result = _build_program_display_name(
            athlete_name=None,
            program_number=None,
            date_start=None,
            date_end=None,
            theme=None,
        )
        assert result == "Untitled Program"


class TestFixDuplicateDay3Sessions:
    def _make_program_with_sessions(self, db, day_numbers: list[tuple[int, int]]):
        """Helper: create a program with sessions defined by (week, day) tuples."""
        athlete = Athlete(name="Test Athlete")
        db.add(athlete)
        db.flush()

        program = Program(athlete_id=athlete.id, program_number=1, program_name="Test")
        db.add(program)
        db.flush()

        for week, day in day_numbers:
            s = Session(
                program_id=program.id,
                week_number=week,
                day_number=day,
                day_name=f"Day {day}",
            )
            db.add(s)
        db.flush()

        return program

    def test_fixes_duplicate_day3_to_day4(self, db):
        """Two Day 3s in the same week with no Day 4 should fix the second one."""
        program = self._make_program_with_sessions(db, [
            (1, 1), (1, 2), (1, 3), (1, 3),
        ])
        fixed = _fix_duplicate_day3_sessions(db, program.id)

        assert fixed == 1
        sessions = db.query(Session).filter(Session.program_id == program.id).all()
        day_numbers = sorted(s.day_number for s in sessions)
        assert day_numbers == [1, 2, 3, 4]

    def test_no_fix_when_day4_exists(self, db):
        """If Day 4 already exists, leave Day 3 duplicates alone."""
        program = self._make_program_with_sessions(db, [
            (1, 1), (1, 2), (1, 3), (1, 3), (1, 4),
        ])
        fixed = _fix_duplicate_day3_sessions(db, program.id)

        assert fixed == 0

    def test_no_fix_when_single_day3(self, db):
        """Only one Day 3 per week: nothing to fix."""
        program = self._make_program_with_sessions(db, [
            (1, 1), (1, 2), (1, 3), (1, 4),
        ])
        fixed = _fix_duplicate_day3_sessions(db, program.id)

        assert fixed == 0

    def test_fixes_across_multiple_weeks(self, db):
        """Duplicate Day 3 in multiple weeks should fix all of them."""
        program = self._make_program_with_sessions(db, [
            (1, 1), (1, 2), (1, 3), (1, 3),
            (2, 1), (2, 2), (2, 3), (2, 3),
            (3, 1), (3, 2), (3, 3), (3, 4),
        ])
        fixed = _fix_duplicate_day3_sessions(db, program.id)

        assert fixed == 2
        for week in [1, 2]:
            week_sessions = [s for s in db.query(Session).filter(
                Session.program_id == program.id,
                Session.week_number == week,
            ).all()]
            day_nums = sorted(s.day_number for s in week_sessions)
            assert 4 in day_nums, f"Week {week} should have a Day 4 after fix"

    def test_inherits_day4_name(self, db):
        """If another week has a Day 4 name, the fix should use it."""
        athlete = Athlete(name="Test")
        db.add(athlete)
        db.flush()

        program = Program(athlete_id=athlete.id, program_number=1, program_name="Test")
        db.add(program)
        db.flush()


        for day, name in [(1, "Monday"), (2, "Tuesday"), (3, "Wednesday"), (4, "Saturday")]:
            db.add(Session(program_id=program.id, week_number=1, day_number=day, day_name=name))


        db.add(Session(program_id=program.id, week_number=2, day_number=1, day_name="Monday"))
        db.add(Session(program_id=program.id, week_number=2, day_number=3, day_name="Wednesday"))
        db.add(Session(program_id=program.id, week_number=2, day_number=3, day_name="Wednesday"))
        db.flush()

        _fix_duplicate_day3_sessions(db, program.id)

        fixed_session = db.query(Session).filter(
            Session.program_id == program.id,
            Session.week_number == 2,
            Session.day_number == 4,
        ).first()
        assert fixed_session is not None
        assert fixed_session.day_name == "Saturday"


class TestWriteToDb:
    def test_creates_new_athlete_and_program(self, db):
        """First import creates both athlete and program."""
        data = parse_file(FIXTURE_ED, parser_id=PARSER_ID)
        result = _write_to_db(db, data, source_filename="athlete_b_program_35.xlsx")
        db.commit()

        assert result["athlete_created"] is True
        assert result["program_updated"] is False
        assert result["sessions_imported"] > 0
        assert result["exercises_imported"] > 0

        athlete = db.query(Athlete).filter(Athlete.name == result["athlete_name"]).first()
        assert athlete is not None

        program = db.query(Program).filter(Program.id == result["program_id"]).first()
        assert program is not None
        assert program.athlete_id == athlete.id

    def test_second_import_reuses_athlete(self, db):
        """Importing again for the same athlete should not create a duplicate."""
        data = parse_file(FIXTURE_ED, parser_id=PARSER_ID)

        result1 = _write_to_db(db, data, source_filename="athlete_b_program_35.xlsx")
        db.commit()

        result2 = _write_to_db(db, data, source_filename="athlete_b_program_35.xlsx")
        db.commit()

        assert result1["athlete_id"] == result2["athlete_id"]
        assert result2["athlete_created"] is False

    def test_upsert_by_program_number(self, db):
        """Second import with same program_number should update, not create."""
        data = parse_file(FIXTURE_ED, parser_id=PARSER_ID)

        result1 = _write_to_db(db, data, source_filename="ed_35.xlsx")
        db.commit()
        program_id_1 = result1["program_id"]
        sessions_before = db.query(Session).filter(Session.program_id == program_id_1).count()


        result2 = _write_to_db(db, data, source_filename="ed_35_v2.xlsx")
        db.commit()

        assert result2["program_id"] == program_id_1
        assert result2["program_updated"] is True


        sessions_after = db.query(Session).filter(Session.program_id == program_id_1).count()
        assert sessions_after == sessions_before


        total_programs = db.query(Program).filter(
            Program.athlete_id == result1["athlete_id"]
        ).count()
        assert total_programs == 1

    def test_upsert_by_existing_program_id(self, db):
        """Resync path: existing_program_id targets the exact program."""
        data = parse_file(FIXTURE_ED, parser_id=PARSER_ID)

        result1 = _write_to_db(db, data, source_filename="ed_35.xlsx")
        db.commit()
        target_id = result1["program_id"]


        result2 = _write_to_db(
            db, data,
            source_filename="ed_35_resync.xlsx",
            existing_program_id=target_id,
        )
        db.commit()

        assert result2["program_id"] == target_id
        assert result2["program_updated"] is True

    def test_existing_program_id_cleans_old_data(self, db):
        """Resync should delete old exercises/sessions before re-creating."""
        data = parse_file(FIXTURE_ED, parser_id=PARSER_ID)

        result1 = _write_to_db(db, data, source_filename="ed_35.xlsx")
        db.commit()
        pid = result1["program_id"]

        exercises_before = db.query(ExerciseEntry).join(Session).filter(
            Session.program_id == pid
        ).count()


        _write_to_db(db, data, source_filename="resync.xlsx", existing_program_id=pid)
        db.commit()

        exercises_after = db.query(ExerciseEntry).join(Session).filter(
            Session.program_id == pid
        ).count()


        assert exercises_after == exercises_before

    def test_different_program_numbers_create_separate_programs(self, db):
        """Two different fixtures (different athletes/programs) should not collide."""
        data_ed = parse_file(FIXTURE_ED, parser_id=PARSER_ID)
        data_lamar = parse_file(FIXTURE_LAMAR, parser_id=PARSER_ID)

        r1 = _write_to_db(db, data_ed, source_filename="ed_35.xlsx")
        db.commit()
        r2 = _write_to_db(db, data_lamar, source_filename="lamar_38.xlsx")
        db.commit()

        assert r1["program_id"] != r2["program_id"]
        assert r1["athlete_id"] != r2["athlete_id"]

    def test_auto_fixes_duplicate_day3(self, db):
        """Import should auto-run the duplicate Day 3 fix."""
        data = parse_file(FIXTURE_ED, parser_id=PARSER_ID)
        result = _write_to_db(db, data, source_filename="test.xlsx")
        db.commit()


        assert "days_fixed" in result

    def test_updates_athlete_maxes_on_reimport(self, db):
        """Re-importing should update the athlete's max lifts."""
        data = parse_file(FIXTURE_ED, parser_id=PARSER_ID)

        _write_to_db(db, data, source_filename="first.xlsx")
        db.commit()

        athlete = db.query(Athlete).filter(Athlete.name == data.athlete.name).first()
        original_squat = athlete.squat_max_lbs


        data.athlete.squat_max_lbs = 999.0
        _write_to_db(db, data, source_filename="second.xlsx")
        db.commit()

        db.refresh(athlete)
        assert athlete.squat_max_lbs == 999.0
        assert athlete.squat_max_lbs != original_squat


class TestImportFile:
    def test_import_creates_db_and_returns_summary(self, db_path):
        """import_file() should create the DB, parse, and return a valid summary."""
        result = import_file(FIXTURE_ED, db_path=db_path, parser_id=PARSER_ID)

        assert result["athlete_name"] == "Ed Coan"
        assert result["sessions_imported"] > 0
        assert result["exercises_imported"] > 0
        assert "program_id" in result
        assert "athlete_id" in result

    def test_import_with_athlete_name_override(self, db_path):
        """athlete_name parameter should override the filename-derived name."""
        result = import_file(
            FIXTURE_ED,
            db_path=db_path,
            athlete_name="Custom Name",
            parser_id=PARSER_ID,
        )
        assert result["athlete_name"] == "Custom Name"

    def test_import_resync_with_existing_program_id(self, db_path):
        """Resync: import_file with existing_program_id should update in place."""
        r1 = import_file(FIXTURE_ED, db_path=db_path, parser_id=PARSER_ID)
        pid = r1["program_id"]

        r2 = import_file(
            FIXTURE_ED,
            db_path=db_path,
            existing_program_id=pid,
            parser_id=PARSER_ID,
        )

        assert r2["program_id"] == pid
        assert r2["program_updated"] is True
