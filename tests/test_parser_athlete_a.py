"""Parser tests against Lamar's Program 38 — second athlete validation.

Validates that the parser handles:
- 5-day training weeks (vs the 4-day fixture)
- Uppercase day names (SUNDAY, TUESDAY, etc.)
- Filenames with underscored dates (01_04_26 vs 02/01/26)
- Accessory exercises with ?? weight
"""

from pathlib import Path

from bestrong.parser.pipeline import parse_file, parse_file_preview
from bestrong.parser.adapters.bestrong_parser import parse_filename


FIXTURE = Path(__file__).parent / "fixtures" / "athlete_a_program_38.xlsx"
PARSER_ID = "bestrong"


DRIVE_TITLE = (
    "Lamar\u2019s Program 38 \u2013 (01_04_26 \u2013 02_01_26) "
    "\u2013 Strength Block.xlsx"
)


def test_lamar_preview():
    """Test basic preview output for Lamar's file."""
    preview = parse_file_preview(FIXTURE, parser_id=PARSER_ID)

    assert preview["athlete_name"] == "Lamar Gant"
    assert preview["squat_max"] == 396.0
    assert preview["bench_max"] == 182.0
    assert preview["deadlift_max"] == 443.0
    assert preview["total"] == 1021.0
    assert preview["session_count"] >= 20
    assert preview["exercise_count"] >= 20


def test_lamar_full_parse():
    """Test full parse — exercises, compounds, accessories."""
    program = parse_file(FIXTURE, parser_id=PARSER_ID)

    assert program.athlete.name == "Lamar Gant"
    assert len(program.sessions) >= 20

    compounds = [e for s in program.sessions for e in s.exercises if not e.is_accessory]
    accessories = [e for s in program.sessions for e in s.exercises if e.is_accessory]

    assert len(compounds) > 0
    assert len(accessories) > 0


    for e in compounds:
        assert e.lift_category in ("squat", "bench", "deadlift")


def test_lamar_five_day_weeks():
    """Verify the parser finds 5 days in Week 1."""
    program = parse_file(FIXTURE, parser_id=PARSER_ID)

    week1_sessions = [s for s in program.sessions if s.info.week_number == 1]
    assert len(week1_sessions) == 5, f"Expected 5 days in Week 1, got {len(week1_sessions)}"


def test_lamar_four_weeks():
    """Verify the parser finds all 4 weeks (column band detection fix)."""
    program = parse_file(FIXTURE, parser_id=PARSER_ID)

    weeks = {s.info.week_number for s in program.sessions}
    assert weeks == {1, 2, 3, 4}, f"Expected weeks 1-4, got {weeks}"


    for wk in range(1, 5):
        wk_sessions = [s for s in program.sessions if s.info.week_number == wk]
        assert len(wk_sessions) == 5, f"Week {wk}: expected 5 sessions, got {len(wk_sessions)}"


def test_lamar_day_names():
    """Verify day names are extracted and normalized (uppercase → title case)."""
    program = parse_file(FIXTURE, parser_id=PARSER_ID)

    week1_sessions = sorted(
        [s for s in program.sessions if s.info.week_number == 1],
        key=lambda s: s.info.day_number,
    )
    day_names = [s.info.day_name for s in week1_sessions]


    assert "Sunday" in day_names
    assert "Tuesday" in day_names
    assert "Saturday" in day_names


def test_lamar_volume_extraction():
    """Verify weekly volume is extracted (was broken — rows were beyond scan range)."""
    program = parse_file(FIXTURE, parser_id=PARSER_ID)

    assert 1 in program.weekly_volume
    vol = program.weekly_volume[1]
    assert vol["squat"] == 8533.0
    assert vol["bench"] == 6439.0
    assert vol["deadlift"] == 6517.0


def test_lamar_accessory_classification():
    """Verify that exercises with ?? weight and accessory classification stay as accessories."""
    program = parse_file(FIXTURE, parser_id=PARSER_ID)


    banded = [
        e
        for s in program.sessions
        for e in s.exercises
        if "banded pull" in e.exercise_name.lower()
    ]
    assert len(banded) > 0
    for e in banded:
        assert e.is_accessory, f"Banded Pull Aparts should be accessory, got set_type={e.set_type}"


def test_lamar_lift_classification():
    """Verify that Lamar's compound lifts are classified correctly."""
    program = parse_file(FIXTURE, parser_id=PARSER_ID)

    categories = {"squat": set(), "bench": set(), "deadlift": set()}
    for s in program.sessions:
        for e in s.exercises:
            if e.lift_category in categories:
                categories[e.lift_category].add(e.exercise_name)

    squat_names = {n.lower() for n in categories["squat"]}
    bench_names = {n.lower() for n in categories["bench"]}
    dead_names = {n.lower() for n in categories["deadlift"]}

    assert any("squat" in n for n in squat_names)
    assert any("bench" in n for n in bench_names)
    assert any("deadlift" in n for n in dead_names)


def test_lamar_filename_parsing():
    """Verify filename/title parsing with underscored dates."""
    result = parse_filename(DRIVE_TITLE)

    assert result["athlete_name"] == "Lamar"
    assert result["program_number"] == 38
    assert result["date_start"] == "01/04/26"
    assert result["date_end"] == "02/01/26"
    assert "Strength Block" in result["program_name"]
