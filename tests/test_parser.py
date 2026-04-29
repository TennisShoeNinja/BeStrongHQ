"""Tests for the parser against the 4-day fixture (Program 35)."""

import sys
from pathlib import Path


sys.path.insert(0, str(Path(__file__).parent.parent))

from bestrong.parser.pipeline import parse_file, parse_file_preview


FIXTURE = Path(__file__).parent / "fixtures" / "athlete_b_program_35.xlsx"
PARSER_ID = "bestrong"


def test_preview():
    """Test the preview summary output."""
    preview = parse_file_preview(FIXTURE, parser_id=PARSER_ID)

    print("\n" + "=" * 60)
    print("IMPORT PREVIEW")
    print("=" * 60)
    print(f"  Athlete:      {preview['athlete_name']}")
    print(f"  Squat Max:    {preview['squat_max']} lbs")
    print(f"  Bench Max:    {preview['bench_max']} lbs")
    print(f"  Deadlift Max: {preview['deadlift_max']} lbs")
    print(f"  Total:        {preview['total']} lbs")
    print(f"  Program:      #{preview['program_number']} — {preview['program_name']}")
    print(f"  Block Type:   {preview['block_type']}")
    print(f"  Dates:        {preview['date_start']} → {preview['date_end']}")
    print(f"  Sessions:     {preview['session_count']}")
    print(f"  Exercises:    {preview['exercise_count']} unique")
    print(f"  Weeks:        {preview['weeks']}")
    print("\n  Weekly Volume:")
    for wk, vols in sorted(preview["weekly_volume"].items()):
        print(f"    Week {wk}: S={vols.get('squat')}  B={vols.get('bench')}  D={vols.get('deadlift')}")
    print("\n  Exercise Names:")
    for name in preview["exercise_names"]:
        print(f"    - {name}")


    assert preview["athlete_name"] == "Ed Coan"
    assert preview["squat_max"] == 501.0
    assert preview["bench_max"] == 308.0
    assert preview["deadlift_max"] == 508.0
    assert preview["total"] == 1317.0
    assert preview["session_count"] >= 12
    assert preview["exercise_count"] >= 15
    print("\n✅ Preview assertions passed")


def test_full_parse():
    """Test the full parse and inspect all sessions."""
    program = parse_file(FIXTURE, parser_id=PARSER_ID)

    print("\n" + "=" * 60)
    print("FULL PARSE RESULTS")
    print("=" * 60)

    print(f"\nAthlete: {program.athlete.name}")
    print(f"Goal: {program.athlete.goal}")
    print(f"Maxes: S{program.athlete.squat_max_lbs} / B{program.athlete.bench_max_lbs} / D{program.athlete.deadlift_max_lbs}")

    total_exercises = 0
    total_compounds = 0
    total_accessories = 0
    total_volume = 0

    for session in program.sessions:
        info = session.info
        print(f"\n--- Week {info.week_number} | Day {info.day_number} ({info.day_name}) | {info.session_label or 'N/A'} ---")

        for ex in session.exercises:
            total_exercises += 1
            if ex.is_accessory:
                total_accessories += 1
                rpe_str = ex.target_rpe or ""
                print(f"  [{ex.exercise_group}] {ex.exercise_name:45s} {ex.sets}×{ex.reps or '?':>3}  {rpe_str:15s}  (accessory)")
            else:
                total_compounds += 1
                if ex.volume:
                    total_volume += ex.volume
                w_str = f"{ex.weight_lbs:.0f}lbs" if ex.weight_lbs else "??"
                rpe_str = ex.target_rpe or ""
                actual = f"actual:{ex.actual_rpe}" if ex.actual_rpe else ""
                print(
                    f"  [{ex.exercise_group}] {ex.exercise_name:45s} "
                    f"{ex.sets}×{ex.reps or '?':>3} @ {w_str:>7s}  {rpe_str:15s}  "
                    f"{ex.set_type:10s} [{ex.lift_category}] {actual}"
                )

    print(f"\n{'=' * 60}")
    print("SUMMARY")
    print(f"{'=' * 60}")
    print(f"  Sessions:       {len(program.sessions)}")
    print(f"  Total exercises: {total_exercises}")
    print(f"  Compounds:      {total_compounds}")
    print(f"  Accessories:    {total_accessories}")
    print(f"  Total volume:   {total_volume:,.0f} lbs")


    assert program.athlete.name == "Ed Coan"
    assert len(program.sessions) >= 12
    assert total_exercises > 0
    assert total_compounds > 0
    assert total_accessories > 0
    print("\n✅ Full parse assertions passed")


def test_exercise_classification():
    """Verify lift classification is working correctly."""
    program = parse_file(FIXTURE, parser_id=PARSER_ID)

    categories = {"squat": [], "bench": [], "deadlift": [], "accessory": []}
    seen = set()

    for session in program.sessions:
        for ex in session.exercises:
            key = (ex.exercise_name, ex.lift_category)
            if key not in seen:
                seen.add(key)
                categories[ex.lift_category].append(ex.exercise_name)

    print("\n" + "=" * 60)
    print("LIFT CLASSIFICATION")
    print("=" * 60)
    for cat, names in sorted(categories.items()):
        print(f"\n  {cat.upper()}:")
        for name in sorted(set(names)):
            print(f"    - {name}")


    squat_names = [n.lower() for n in categories["squat"]]
    bench_names = [n.lower() for n in categories["bench"]]
    dead_names = [n.lower() for n in categories["deadlift"]]

    assert any("competition squat" in n for n in squat_names), "Competition Squat should be classified as squat"
    assert any("competition bench" in n or "bench press" in n for n in bench_names), "Competition Bench should be classified as bench"
    assert any("sumo deadlift" in n for n in dead_names), "Sumo Deadlift should be classified as deadlift"
    print("\n✅ Classification assertions passed")


def test_multi_row_grouping():
    """Verify that top set + backdown grouping works."""
    program = parse_file(FIXTURE, parser_id=PARSER_ID)

    print("\n" + "=" * 60)
    print("MULTI-ROW GROUPINGS")
    print("=" * 60)

    for session in program.sessions:
        info = session.info

        groups: dict[int, list] = {}
        for ex in session.exercises:
            groups.setdefault(ex.exercise_group, []).append(ex)

        multi_row = {g: exs for g, exs in groups.items() if len(exs) > 1}
        if multi_row:
            print(f"\n  Week {info.week_number} Day {info.day_number} ({info.day_name}):")
            for group_id, exs in multi_row.items():
                types = [f"{e.set_type}({e.sets}×{e.reps}@{e.weight_lbs or '??'})" for e in exs]
                print(f"    Group {group_id}: {exs[0].exercise_name} → {', '.join(types)}")

    print("\n✅ Multi-row grouping check complete")


if __name__ == "__main__":
    test_preview()
    test_full_parse()
    test_exercise_classification()
    test_multi_row_grouping()
    print("\n" + "=" * 60)
    print("ALL TESTS PASSED ✅")
    print("=" * 60)


def test_color_classifier_bench():
    """Light green 3 should classify as bench."""
    from bestrong.parser.adapters.bestrong_parser import _rgb_distance, _COLOR_MAP, _BRIGHT_YELLOW, _COLOR_TOLERANCE

    bench_color = (0xD9, 0xEA, 0xD3)
    assert _rgb_distance(bench_color, _COLOR_MAP["bench"]) == 0


def test_color_classifier_squat():
    """Light yellow 3 should classify as squat."""
    from bestrong.parser.adapters.bestrong_parser import _rgb_distance, _COLOR_MAP

    squat_color = (0xFF, 0xF2, 0xCC)
    assert _rgb_distance(squat_color, _COLOR_MAP["squat"]) == 0


def test_color_classifier_deadlift():
    """Light cornflower blue 3 should classify as deadlift."""
    from bestrong.parser.adapters.bestrong_parser import _rgb_distance, _COLOR_MAP

    dl_color = (0xC9, 0xDA, 0xF8)
    assert _rgb_distance(dl_color, _COLOR_MAP["deadlift"]) == 0


def test_bright_yellow_is_not_squat():
    """Bright yellow (#FFFF00) should NOT match squat (light yellow 3)."""
    from bestrong.parser.adapters.bestrong_parser import _rgb_distance, _COLOR_MAP, _BRIGHT_YELLOW, _COLOR_TOLERANCE


    assert _rgb_distance(_BRIGHT_YELLOW, (0xFF, 0xFF, 0x00)) == 0


    squat_dist = _rgb_distance(_BRIGHT_YELLOW, _COLOR_MAP["squat"])
    assert squat_dist > _COLOR_TOLERANCE, f"Bright yellow too close to squat: dist={squat_dist}"


def test_color_tolerance_handles_slight_shifts():
    """Colors shifted slightly during xlsx export should still match."""
    from bestrong.parser.adapters.bestrong_parser import _rgb_distance, _COLOR_MAP, _COLOR_TOLERANCE


    shifted_bench = (0xD9 + 5, 0xEA - 3, 0xD3 + 2)
    assert _rgb_distance(shifted_bench, _COLOR_MAP["bench"]) < _COLOR_TOLERANCE


def test_name_indicates_accessory_rdl_variants():
    """RDL variants must be flagged as accessory regardless of casing or spelling."""
    from bestrong.parser.adapters.bestrong_parser import name_indicates_accessory


    assert name_indicates_accessory("Barbell RDLs 2-0-0")
    assert name_indicates_accessory("rdl")
    assert name_indicates_accessory("RDL")
    assert name_indicates_accessory("RDLs")
    assert name_indicates_accessory("Rdl")
    assert name_indicates_accessory("R.D.L.")

    assert name_indicates_accessory("Deficit RDL")
    assert name_indicates_accessory("Snatch Grip RDL")
    assert name_indicates_accessory("Single Leg RDL")
    assert name_indicates_accessory("B-Stance RDL")
    assert name_indicates_accessory("Tempo RDLs 3-1-1")

    assert name_indicates_accessory("Romanian Deadlift")
    assert name_indicates_accessory("Romanian DL")
    assert name_indicates_accessory("Romanian Deadlifts")

    assert name_indicates_accessory("Stiff Leg Deadlift")
    assert name_indicates_accessory("Stiff-Leg Deadlift")
    assert name_indicates_accessory("Stiff Legged Deadlift")
    assert name_indicates_accessory("SLDL 3x8")


def test_name_indicates_accessory_hip_hinge_family():
    """Other hip-hinge accessory variants are flagged too."""
    from bestrong.parser.adapters.bestrong_parser import name_indicates_accessory

    assert name_indicates_accessory("Good Morning")
    assert name_indicates_accessory("GHR")
    assert name_indicates_accessory("Glute Ham Raise")
    assert name_indicates_accessory("Hyperextension")
    assert name_indicates_accessory("Reverse Hyper")


def test_name_indicates_accessory_squat_family():
    """Squat-day accessory variants must be flagged."""
    from bestrong.parser.adapters.bestrong_parser import name_indicates_accessory

    assert name_indicates_accessory("Hack Squat")
    assert name_indicates_accessory("Belt Squat 3x10")
    assert name_indicates_accessory("Bulgarian Split Squat")
    assert name_indicates_accessory("Goblet Squat")
    assert name_indicates_accessory("Walking Lunge")
    assert name_indicates_accessory("Leg Press")
    assert name_indicates_accessory("Leg Extension")
    assert name_indicates_accessory("Leg Curl")
    assert name_indicates_accessory("Hip Thrust")


def test_name_indicates_accessory_bench_family():
    """Bench-day press / arm accessory variants must be flagged."""
    from bestrong.parser.adapters.bestrong_parser import name_indicates_accessory

    assert name_indicates_accessory("Tricep Extension")
    assert name_indicates_accessory("Pec Deck")
    assert name_indicates_accessory("Cable Fly")
    assert name_indicates_accessory("Tricep Pushdown")
    assert name_indicates_accessory("Skull Crusher")
    assert name_indicates_accessory("DB Lateral Raise")
    assert name_indicates_accessory("Overhead Press")
    assert name_indicates_accessory("OHP")
    assert name_indicates_accessory("Military Press")
    assert name_indicates_accessory("Push Up")
    assert name_indicates_accessory("Smith Machine Incline Bench Press")
    assert name_indicates_accessory("Decline Bench")
    assert name_indicates_accessory("DB Bench Press (3-1-0)")
    assert name_indicates_accessory("Dumbbell Bench Press")
    assert name_indicates_accessory("Machine Chest Press")


def test_name_indicates_accessory_ignores_real_compounds():
    """Tracked competition lifts and comp-style variations must NOT be flagged."""
    from bestrong.parser.adapters.bestrong_parser import name_indicates_accessory


    assert not name_indicates_accessory("Competition Deadlift")
    assert not name_indicates_accessory("Sumo Deadlift")
    assert not name_indicates_accessory("Conventional Deadlift")
    assert not name_indicates_accessory("Deficit Deadlift")
    assert not name_indicates_accessory("Block Pull")

    assert not name_indicates_accessory("Competition Squat")
    assert not name_indicates_accessory("Paused Squat")
    assert not name_indicates_accessory("Tempo Squat")
    assert not name_indicates_accessory("Box Squat")
    assert not name_indicates_accessory("Front Squat")
    assert not name_indicates_accessory("SSB Squat")

    assert not name_indicates_accessory("Competition Bench")
    assert not name_indicates_accessory("Paused Bench")
    assert not name_indicates_accessory("Close Grip Bench")
    assert not name_indicates_accessory("Bench Press")
