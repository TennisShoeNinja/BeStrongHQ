"""Tests for the athlete body metrics / wellness feature.

Covers:
- Wellness parser (_extract_daily_wellness from HomePage tab)
- Date computation (_compute_wellness_date)
- Em dash title regex fix
- Wellness API endpoints
- Wellness data in the import pipeline
"""

from __future__ import annotations

from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from fastapi.testclient import TestClient

from bestrong.models.orm import (
    Base, Athlete, DailyWellness, Program,
)
from bestrong.services import (
    _compute_wellness_date,
    _write_to_db,
    import_file,
)
from bestrong.parser.pipeline import parse_file
from bestrong.parser.adapters.bestrong_parser import parse_filename
from bestrong.api import create_app
from bestrong.models.database import get_engine, get_session_factory
from bestrong.api.deps import get_db


FIXTURE_LAMAR = Path(__file__).parent / "fixtures" / "athlete_a_program_38.xlsx"
FIXTURE_ED = Path(__file__).parent / "fixtures" / "athlete_b_program_35.xlsx"
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


class TestComputeWellnessDate:
    def test_basic_monday_week1(self):
        """Week 1, Monday with a Monday start date should return the start date."""
        result = _compute_wellness_date("03/29/26", 1, "Monday")


        assert result == "2026-03-23"

    def test_week1_wednesday(self):
        """Week 1, Wednesday."""
        result = _compute_wellness_date("03/29/26", 1, "Wednesday")

        assert result == "2026-03-25"

    def test_week2_monday(self):
        """Week 2 starts 7 days after Week 1."""
        result = _compute_wellness_date("03/29/26", 2, "Monday")

        assert result == "2026-03-30"

    def test_week1_sunday(self):
        """Sunday is day offset 6 from Monday."""
        result = _compute_wellness_date("03/29/26", 1, "Sunday")

        assert result == "2026-03-29"

    def test_mm_dd_yyyy_format(self):
        """Handles 4-digit year format."""
        result = _compute_wellness_date("03/29/2026", 1, "Monday")
        assert result == "2026-03-23"

    def test_iso_format(self):
        """Handles YYYY-MM-DD format (fallback for stored dates)."""
        result = _compute_wellness_date("2026-03-29", 1, "Monday")
        assert result == "2026-03-23"

    def test_none_start_date(self):
        """Returns None when start date is unavailable."""
        assert _compute_wellness_date(None, 1, "Monday") is None

    def test_empty_start_date(self):
        """Returns None for empty string."""
        assert _compute_wellness_date("", 1, "Monday") is None

    def test_invalid_start_date(self):
        """Returns None for unparseable date."""
        assert _compute_wellness_date("not-a-date", 1, "Monday") is None

    def test_invalid_day_name(self):
        """Returns None for unknown day name."""
        assert _compute_wellness_date("03/29/26", 1, "Funday") is None

    def test_monday_start_date(self):
        """When start date is already a Monday, week1_monday = start date."""

        result = _compute_wellness_date("01/05/26", 1, "Monday")
        assert result == "2026-01-05"

    def test_week4_friday(self):
        """Multi-week offset: Week 4, Friday."""


        result = _compute_wellness_date("01/05/26", 4, "Friday")
        assert result == "2026-01-30"


class TestWellnessParser:
    def test_lamar_has_wellness_entries(self):
        """Lamar's Program 38 has goal macros on the HomePage, producing wellness entries."""
        program = parse_file(FIXTURE_LAMAR, parser_id=PARSER_ID)
        assert len(program.daily_wellness) > 0

    def test_lamar_goal_macros(self):
        """Lamar's goals are extracted: 2772 cal, 199 carbs, 63 fat, 227 protein."""
        program = parse_file(FIXTURE_LAMAR, parser_id=PARSER_ID)

        week1_entries = [e for e in program.daily_wellness if e.week_number == 1]
        assert len(week1_entries) > 0

        monday = next((e for e in week1_entries if e.day_of_week == "Monday"), None)
        assert monday is not None
        assert monday.goal_calories == 2772.0
        assert monday.goal_carbs == 199.0
        assert monday.goal_fat == 63.0
        assert monday.goal_protein == 227.0

    def test_lamar_no_actuals(self):
        """Lamar's Program 38 has no actual daily data filled in."""
        program = parse_file(FIXTURE_LAMAR, parser_id=PARSER_ID)
        for entry in program.daily_wellness:
            assert entry.actual_calories is None
            assert entry.bodyweight_lbs is None

    def test_lamar_four_weeks_of_entries(self):
        """Should have entries for all 4 weeks (goals are set for each week)."""
        program = parse_file(FIXTURE_LAMAR, parser_id=PARSER_ID)
        weeks = {e.week_number for e in program.daily_wellness}
        assert weeks == {1, 2, 3, 4}

    def test_lamar_seven_days_per_week(self):
        """Each week should have 7 entries (goals are set, so every day has data)."""
        program = parse_file(FIXTURE_LAMAR, parser_id=PARSER_ID)
        for wk in range(1, 5):
            wk_entries = [e for e in program.daily_wellness if e.week_number == wk]
            assert len(wk_entries) == 7, f"Week {wk}: expected 7 entries, got {len(wk_entries)}"

    def test_ed_has_wellness_entries(self):
        """Ed's fixture also has the HomePage template (goals only, no actuals)."""
        program = parse_file(FIXTURE_ED, parser_id=PARSER_ID)

        assert isinstance(program.daily_wellness, list)

    def test_wellness_entry_day_names(self):
        """All entries should have valid day names."""
        program = parse_file(FIXTURE_LAMAR, parser_id=PARSER_ID)
        valid_days = {"Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"}
        for entry in program.daily_wellness:
            assert entry.day_of_week in valid_days, f"Invalid day: {entry.day_of_week}"


class TestEmDashTitleParsing:
    def test_en_dash_title(self):
        """Standard en dash (U+2013) titles parse correctly."""
        result = parse_filename(
            "Lamar\u2019s Program 41 \u2013 (03/29/26 \u2013 05/03/26) "
            "\u2013 Strength Block.xlsx"
        )
        assert result["athlete_name"] == "Lamar"
        assert result["program_number"] == 41
        assert result["date_start"] == "03/29/26"
        assert result["date_end"] == "05/03/26"
        assert "Strength Block" in result["program_name"]

    def test_em_dash_title(self):
        """Em dash (U+2014) titles parse correctly after the regex fix."""
        result = parse_filename(
            "Lamar\u2019s Program 41 \u2014 (03/29/26 \u2013 05/03/26) "
            "\u2014 Strength Block.xlsx"
        )
        assert result["athlete_name"] == "Lamar"
        assert result["program_number"] == 41
        assert result["date_start"] == "03/29/26"
        assert result["date_end"] == "05/03/26"

    def test_hyphen_title(self):
        """Plain hyphen titles still work."""
        result = parse_filename(
            "Ed's Program 35 - (02/01/26 - 02/22/26) - Strength Block.xlsx"
        )
        assert result["athlete_name"] == "Ed"
        assert result["program_number"] == 35
        assert result["date_start"] == "02/01/26"
        assert result["date_end"] == "02/22/26"

    def test_mixed_dashes_title(self):
        """Handles mixed dash types (em dash outer, en dash inner)."""
        result = parse_filename(
            "Juan\u2019s Program 12 \u2014 (02/15/26 \u2013 03/15/26) "
            "\u2014 Strength Block.xlsx"
        )
        assert result["athlete_name"] == "Juan"
        assert result["program_number"] == 12
        assert result["date_start"] == "02/15/26"


class TestWellnessImportPipeline:
    def test_import_creates_wellness_entries(self, db_path):
        """Full import pipeline writes wellness entries to the database."""
        result = import_file(
            path=FIXTURE_LAMAR,
            db_path=db_path,
            title="Lamar\u2019s Program 38 \u2013 (01/04/26 \u2013 02/01/26) "
                  "\u2013 Strength Block",
            athlete_name="Lamar Gant",
            parser_id=PARSER_ID,
        )
        assert result["wellness_entries"] > 0

    def test_import_wellness_entries_have_dates(self, db_path):
        """Wellness entries should have computed dates, not None."""
        import_file(
            path=FIXTURE_LAMAR,
            db_path=db_path,
            title="Lamar\u2019s Program 38 \u2013 (01/04/26 \u2013 02/01/26) "
                  "\u2013 Strength Block",
            athlete_name="Lamar Gant",
            parser_id=PARSER_ID,
        )

        engine = create_engine(f"sqlite:///{db_path}")
        factory = sessionmaker(bind=engine)
        session = factory()
        try:
            entries = session.query(DailyWellness).all()
            assert len(entries) > 0
            for e in entries:
                assert e.date is not None, f"Wellness entry {e.id} has None date"
                assert len(e.date) == 10, f"Expected YYYY-MM-DD format, got: {e.date}"
        finally:
            session.close()

    def test_reimport_cleans_old_wellness(self, db_path):
        """Re-importing a program should delete old wellness entries and create new ones."""
        result1 = import_file(
            path=FIXTURE_LAMAR,
            db_path=db_path,
            title="Lamar\u2019s Program 38 \u2013 (01/04/26 \u2013 02/01/26) "
                  "\u2013 Strength Block",
            athlete_name="Lamar Gant",
            parser_id=PARSER_ID,
        )
        count1 = result1["wellness_entries"]

        result2 = import_file(
            path=FIXTURE_LAMAR,
            db_path=db_path,
            title="Lamar\u2019s Program 38 \u2013 (01/04/26 \u2013 02/01/26) "
                  "\u2013 Strength Block",
            athlete_name="Lamar Gant",
            parser_id=PARSER_ID,
        )
        count2 = result2["wellness_entries"]


        assert count1 == count2

        engine = create_engine(f"sqlite:///{db_path}")
        factory = sessionmaker(bind=engine)
        session = factory()
        try:
            total = session.query(DailyWellness).count()
            assert total == count1, f"Expected {count1} entries, got {total} (duplicates?)"
        finally:
            session.close()


@pytest.fixture(scope="module")
def wellness_db_path(tmp_path_factory):
    return tmp_path_factory.mktemp("wellness_api") / "test.db"


@pytest.fixture(scope="module")
def wellness_client(wellness_db_path):
    """Create a test client with wellness data imported."""

    import_file(
        path=FIXTURE_LAMAR,
        db_path=wellness_db_path,
        title="Lamar\u2019s Program 38 \u2013 (01/04/26 \u2013 02/01/26) "
              "\u2013 Strength Block",
        athlete_name="Lamar Gant",
        parser_id=PARSER_ID,
    )

    app = create_app()
    engine = get_engine(wellness_db_path)
    factory = get_session_factory(wellness_db_path)

    def override_get_db():
        db = factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db

    with TestClient(app) as c:
        yield c


def test_wellness_endpoint_returns_data(wellness_client):
    """GET /api/wellness/athletes/{id} returns wellness data."""

    resp = wellness_client.get("/api/athletes")
    athletes = resp.json()
    lamar = next(a for a in athletes if a["name"] == "Lamar Gant")

    resp = wellness_client.get(f"/api/wellness/athletes/{lamar['id']}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["athlete_id"] == lamar["id"]
    assert data["athlete_name"] == "Lamar Gant"
    assert data["summary"]["total_entries"] > 0


def test_wellness_summary_fields(wellness_client):
    """Summary should have the expected computed fields."""
    resp = wellness_client.get("/api/athletes")
    athletes = resp.json()
    lamar = next(a for a in athletes if a["name"] == "Lamar Gant")

    resp = wellness_client.get(f"/api/wellness/athletes/{lamar['id']}")
    summary = resp.json()["summary"]


    assert summary["total_entries"] > 0
    assert summary["latest_bodyweight"] is None
    assert summary["min_bodyweight"] is None
    assert summary["bodyweight_change"] is None
    assert summary["starting_bodyweight_program"] is None


def test_wellness_data_points(wellness_client):
    """Data points should have the expected structure."""
    resp = wellness_client.get("/api/athletes")
    athletes = resp.json()
    lamar = next(a for a in athletes if a["name"] == "Lamar Gant")

    resp = wellness_client.get(f"/api/wellness/athletes/{lamar['id']}")
    data = resp.json()["data"]
    assert len(data) > 0

    point = data[0]
    assert "id" in point
    assert "date" in point
    assert "week_number" in point
    assert "day_of_week" in point
    assert "goal_calories" in point
    assert "actual_calories" in point
    assert "bodyweight_lbs" in point


def test_wellness_endpoint_404(wellness_client):
    """GET /api/wellness/athletes/99999 returns 404."""
    resp = wellness_client.get("/api/wellness/athletes/99999")
    assert resp.status_code == 404


def test_bodyweight_trend_endpoint(wellness_client):
    """GET /api/wellness/athletes/{id}/bodyweight returns list."""
    resp = wellness_client.get("/api/athletes")
    athletes = resp.json()
    lamar = next(a for a in athletes if a["name"] == "Lamar Gant")

    resp = wellness_client.get(f"/api/wellness/athletes/{lamar['id']}/bodyweight")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)

    assert len(data) == 0


def test_bodyweight_trend_404(wellness_client):
    """GET /api/wellness/athletes/99999/bodyweight returns 404."""
    resp = wellness_client.get("/api/wellness/athletes/99999/bodyweight")
    assert resp.status_code == 404


def test_wellness_filter_by_program(wellness_client):
    """Filtering by program_id returns only that program's entries."""
    resp = wellness_client.get("/api/athletes")
    athletes = resp.json()
    lamar = next(a for a in athletes if a["name"] == "Lamar Gant")


    resp = wellness_client.get(f"/api/wellness/athletes/{lamar['id']}")
    all_data = resp.json()
    total = all_data["summary"]["total_entries"]


    resp = wellness_client.get("/api/programs", params={"athlete_id": lamar["id"]})
    programs = resp.json()
    assert len(programs) > 0


    pid = programs[0]["id"]
    resp = wellness_client.get(
        f"/api/wellness/athletes/{lamar['id']}",
        params={"program_id": pid},
    )
    filtered = resp.json()
    assert filtered["program_id"] == pid
    assert filtered["summary"]["total_entries"] <= total
    assert filtered["summary"]["total_entries"] > 0
