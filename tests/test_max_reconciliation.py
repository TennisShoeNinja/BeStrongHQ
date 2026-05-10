"""Tests for competition-max reconciliation across evidence changes.

The cached ``athlete.<lift>_max_lbs`` is meant to be the highest value
any source supports. Pre-fix, the OPL refresh path used a "raise only"
rule that left phantom maxes when a backing meet was retired. The fix
recomputes from all current evidence so the cached value never claims
a number with no supporting evidence.

Routine adds-only flows (a new meet, a new training PR) still only
ever raise — that's an emergent property of ``max(...)`` over a
growing evidence set, not a special case in the code.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from bestrong.models.orm import (
    Athlete,
    Base,
    ExerciseEntry,
    MaxHistory,
    MeetResult,
    Program,
    Session as SessionModel,
)
from bestrong.services.max_tracking import (
    MEET_RECENCY_CUTOFF_DAYS,
    floor_declared_maxes_to_history,
    reconcile_competition_maxes,
    recompute_canonical_max,
)


def _iso_days_ago(days: int) -> str:
    return (
        datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=days)
    ).strftime("%Y-%m-%d")


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    s = sessionmaker(bind=engine)()
    yield s
    s.close()


def _seed_athlete(db, **kwargs) -> Athlete:
    a = Athlete(name="Tester", **kwargs)
    db.add(a)
    db.commit()
    db.refresh(a)
    return a


def _add_meet(db, athlete, lift, weight, source="opl", made=True, meet_date=None):
    db.add(
        MeetResult(
            athlete_id=athlete.id,
            lift=lift,
            attempt_number=1,
            weight_lbs=weight,
            made=made,
            source=source,
            meet_date=meet_date,
        )
    )


def _add_history(db, athlete, lift, *, old, new, source):
    db.add(
        MaxHistory(
            athlete_id=athlete.id,
            lift=lift,
            old_value=old,
            new_value=new,
            source=source,
        )
    )


# --- recompute_canonical_max ---


def test_recompute_uses_best_meet_when_higher_than_history(db):
    a = _seed_athlete(db, squat_max_lbs=350)
    _add_meet(db, a, "squat", 365, source="opl")
    db.commit()
    assert recompute_canonical_max(db, a, "squat") == 365


def test_recompute_falls_back_to_non_meet_history_floor(db):
    """Training PR from program import survives meet evidence removal."""
    a = _seed_athlete(db, squat_max_lbs=370)
    _add_history(db, a, "squat", old=350, new=370, source="import")
    db.commit()
    assert recompute_canonical_max(db, a, "squat") == 370


def test_recompute_uses_declared_baseline_from_first_history_old_value(db):
    """A coach-typed declared max stays a floor even if the first meet
    that triggered a MaxHistory bump later gets retracted."""
    a = _seed_athlete(db, squat_max_lbs=405)
    _add_history(db, a, "squat", old=400, new=405, source="opl")
    db.commit()
    assert recompute_canonical_max(db, a, "squat") == 400


def test_recompute_returns_none_with_no_evidence(db):
    a = _seed_athlete(db)
    assert recompute_canonical_max(db, a, "squat") is None


# --- reconcile_competition_maxes scenarios ---


def test_routine_meet_addition_raises_max(db):
    """Adding a new heavier meet bumps the cached max — pre-existing
    behavior preserved."""
    a = _seed_athlete(db, squat_max_lbs=350, bench_max_lbs=250, deadlift_max_lbs=400)
    _add_meet(db, a, "squat", 365, source="opl")
    db.commit()

    reconcile_competition_maxes(db, a, source="opl")

    assert a.squat_max_lbs == 365


def test_opl_retired_result_demotes_to_remaining_evidence(db):
    """Scenario A: athlete had a 365 max from an OPL meet, OPL retired
    it. Cached max falls back to the next-best evidence (a 350 meet
    that's still present)."""
    a = _seed_athlete(db, squat_max_lbs=365)
    _add_history(db, a, "squat", old=350, new=365, source="opl")
    _add_meet(db, a, "squat", 350, source="opl")
    db.commit()

    reconcile_competition_maxes(db, a, source="opl_resync")

    assert a.squat_max_lbs == 350, (
        "When OPL retires the meet that bumped the max, the cached "
        "value should fall back to whatever remaining evidence "
        "supports — pre-fix it stuck at the phantom 365."
    )


def test_opl_retired_result_demotes_to_training_pr_floor(db):
    """Scenario A with non-meet floor: training PR from program import
    holds the line when meet evidence is removed."""
    a = _seed_athlete(db, squat_max_lbs=365)
    _add_history(db, a, "squat", old=355, new=365, source="opl")
    _add_history(db, a, "squat", old=350, new=355, source="import")
    db.commit()

    reconcile_competition_maxes(db, a, source="opl_resync")

    assert a.squat_max_lbs == 355


def test_opl_retired_result_demotes_to_declared_baseline(db):
    """Scenario A edge case: nothing else supports the value, but the
    coach declared a max on profile creation. That declared baseline
    is recoverable from the very first MaxHistory row's old_value."""
    a = _seed_athlete(db, squat_max_lbs=405)
    _add_history(db, a, "squat", old=400, new=405, source="opl")
    db.commit()

    reconcile_competition_maxes(db, a, source="opl_resync")

    assert a.squat_max_lbs == 400


def test_routine_flow_does_not_demote_when_evidence_unchanged(db):
    """Calling reconcile when nothing has changed should not demote a
    max that was set declaratively (no MaxHistory rows for this lift)."""
    a = _seed_athlete(db, squat_max_lbs=500)
    db.commit()

    reconcile_competition_maxes(db, a, source="opl")

    assert a.squat_max_lbs == 500


def test_demotion_logged_in_max_history(db):
    """The demotion itself should be tracked so a coach can see why
    their athlete's max dropped after a sync."""
    a = _seed_athlete(db, squat_max_lbs=365)
    _add_history(db, a, "squat", old=350, new=365, source="opl")
    db.commit()

    reconcile_competition_maxes(db, a, source="opl_resync", note="OPL retired result")

    rows = db.query(MaxHistory).filter(
        MaxHistory.athlete_id == a.id,
        MaxHistory.lift == "squat",
        MaxHistory.source == "opl_resync",
    ).all()
    assert len(rows) == 1
    assert rows[0].old_value == 365
    assert rows[0].new_value == 350


def test_total_recomputed_when_all_three_lifts_present(db):
    a = _seed_athlete(
        db, squat_max_lbs=400, bench_max_lbs=250, deadlift_max_lbs=500, total_lbs=1150
    )
    _add_meet(db, a, "squat", 410, source="opl")
    _add_meet(db, a, "bench", 250, source="opl")
    _add_meet(db, a, "deadlift", 500, source="opl")
    db.commit()

    reconcile_competition_maxes(db, a, source="opl")

    assert a.squat_max_lbs == 410
    assert a.total_lbs == 1160


def test_missed_attempts_do_not_count(db):
    a = _seed_athlete(db, squat_max_lbs=350)
    _add_meet(db, a, "squat", 400, source="opl", made=False)
    db.commit()

    reconcile_competition_maxes(db, a, source="opl")

    assert a.squat_max_lbs == 350


# --- Recency cutoff (Scenario B: backdated old meets shouldn't bump) ---


def test_meet_older_than_cutoff_does_not_drive_max(db):
    """Scenario B: linking an athlete to OPL surfaces a five-year-old
    PR. That meet imports into history but must not auto-bump the
    cached max — old equipment, retired weight class, or capability
    that's drifted by now. Coach can declare the older value manually
    if they want to keep it."""
    a = _seed_athlete(db, squat_max_lbs=350)
    old_date = _iso_days_ago(MEET_RECENCY_CUTOFF_DAYS + 30)
    _add_meet(db, a, "squat", 405, source="opl", meet_date=old_date)
    db.commit()

    reconcile_competition_maxes(db, a, source="opl")

    assert a.squat_max_lbs == 350, (
        "A meet older than the recency cutoff must not bump the cached "
        "max — pre-fix it did, surprising coaches with backdated PRs."
    )


def test_recent_meet_still_drives_max(db):
    """Within the recency window the bump still happens — preserves
    the routine import experience for current PRs."""
    a = _seed_athlete(db, squat_max_lbs=350)
    recent_date = _iso_days_ago(MEET_RECENCY_CUTOFF_DAYS - 30)
    _add_meet(db, a, "squat", 365, source="opl", meet_date=recent_date)
    db.commit()

    reconcile_competition_maxes(db, a, source="opl")

    assert a.squat_max_lbs == 365


def test_null_meet_date_treated_as_modern(db):
    """Backward compat: manual coach entries that omit the date should
    keep contributing as before. Only dated-and-old meets are excluded."""
    a = _seed_athlete(db, squat_max_lbs=350)
    _add_meet(db, a, "squat", 365, source="manual", meet_date=None)
    db.commit()

    reconcile_competition_maxes(db, a, source="opl")

    assert a.squat_max_lbs == 365


def test_old_meet_ignored_recent_meet_used_in_same_history(db):
    """Mixed history: old PR doesn't count, recent meet does. Cached
    max reflects only the recent evidence."""
    a = _seed_athlete(db, squat_max_lbs=350)
    _add_meet(
        db, a, "squat", 405, source="opl", meet_date=_iso_days_ago(MEET_RECENCY_CUTOFF_DAYS + 60)
    )
    _add_meet(
        db, a, "squat", 360, source="opl", meet_date=_iso_days_ago(MEET_RECENCY_CUTOFF_DAYS - 60)
    )
    db.commit()

    reconcile_competition_maxes(db, a, source="opl")

    assert a.squat_max_lbs == 360


# --- floor_declared_maxes_to_history ---


def _add_top_set(
    db,
    athlete,
    lift,
    weight,
    *,
    reps=1,
    failed=False,
    is_accessory=False,
    set_type="top_set",
    program=None,
    session=None,
):
    """Seed an exercise_entries row, creating a Program+Session lazily.

    The floor reads training evidence from exercise_entries directly so
    failed attempts and accessory rows don't sneak into the cached max.
    """
    if program is None:
        program = Program(athlete_id=athlete.id, program_name="Test")
        db.add(program)
        db.flush()
    if session is None:
        session = SessionModel(
            program_id=program.id, week_number=1, day_number=1, day_name="Monday"
        )
        db.add(session)
        db.flush()
    db.add(
        ExerciseEntry(
            session_id=session.id,
            exercise_name=f"Test {lift}",
            exercise_order=1,
            exercise_group=1,
            set_type=set_type,
            lift_category=lift,
            sets=1,
            reps=reps,
            weight_lbs=weight,
            is_accessory=is_accessory,
            failed=failed,
        )
    )


def test_floor_raises_cached_max_to_training_pr(db):
    """Coach manually lowered bench_max_lbs below an existing training
    PR (e.g. matched a comp result). The next import must restore the
    cached value to the higher training evidence."""
    a = _seed_athlete(db, bench_max_lbs=375)
    _add_top_set(db, a, "bench", 380)
    db.commit()

    floor_declared_maxes_to_history(db, a)

    assert a.bench_max_lbs == 380


def test_floor_does_not_lower_cached_max(db):
    """Floor is monotonic upward only. A coach value above evidence
    (declared training max for programming) must stick."""
    a = _seed_athlete(db, bench_max_lbs=400)
    _add_top_set(db, a, "bench", 380)
    db.commit()

    floor_declared_maxes_to_history(db, a)

    assert a.bench_max_lbs == 400


def test_floor_ignores_failed_attempts(db):
    """Critical: a missed single must NOT drive the cached max. Tray's
    P22 W4D4 had a 595 made and a 628 failed — the floor must pick 595,
    not 628. (Pre-fix, a backfill row in max_history with the failed
    weight could leak through.)"""
    a = _seed_athlete(db, deadlift_max_lbs=600)
    program = Program(athlete_id=a.id, program_name="P22")
    db.add(program)
    db.flush()
    session = SessionModel(
        program_id=program.id, week_number=4, day_number=4, day_name="Saturday"
    )
    db.add(session)
    db.flush()
    _add_top_set(db, a, "deadlift", 595, program=program, session=session, failed=False)
    _add_top_set(db, a, "deadlift", 628, program=program, session=session, failed=True)
    db.commit()

    floor_declared_maxes_to_history(db, a)

    assert a.deadlift_max_lbs == 600, (
        "Floor must ignore failed attempts; 628 was missed, 595 was made."
    )


def test_floor_ignores_accessory_and_backdown_rows(db):
    """Accessory variants and backdowns aren't comp-lift PR evidence."""
    a = _seed_athlete(db, bench_max_lbs=300)
    _add_top_set(db, a, "bench", 350, is_accessory=True)
    _add_top_set(db, a, "bench", 340, set_type="backdown")
    db.commit()

    floor_declared_maxes_to_history(db, a)

    assert a.bench_max_lbs == 300


def test_floor_ignores_multi_rep_top_sets(db):
    """A 3-rep top set isn't 1RM evidence."""
    a = _seed_athlete(db, bench_max_lbs=275)
    _add_top_set(db, a, "bench", 320, reps=3)
    db.commit()

    floor_declared_maxes_to_history(db, a)

    assert a.bench_max_lbs == 275


def test_floor_uses_meet_evidence_too(db):
    """Made meet attempts within recency cutoff also raise the floor."""
    a = _seed_athlete(db, bench_max_lbs=350)
    _add_meet(db, a, "bench", 365, source="opl", meet_date=_iso_days_ago(30))
    db.commit()

    floor_declared_maxes_to_history(db, a)

    assert a.bench_max_lbs == 365


def test_floor_recomputes_total_when_all_three_present(db):
    a = _seed_athlete(
        db, squat_max_lbs=400, bench_max_lbs=250, deadlift_max_lbs=500, total_lbs=1150
    )
    _add_top_set(db, a, "bench", 300)
    db.commit()

    floor_declared_maxes_to_history(db, a)

    assert a.bench_max_lbs == 300
    assert a.total_lbs == 1200


def test_floor_logs_change_to_max_history(db):
    a = _seed_athlete(db, bench_max_lbs=375)
    _add_top_set(db, a, "bench", 380)
    db.commit()

    floor_declared_maxes_to_history(db, a, source="floor_history", note="P22")
    db.commit()

    floor_rows = (
        db.query(MaxHistory)
        .filter(
            MaxHistory.athlete_id == a.id,
            MaxHistory.source == "floor_history",
        )
        .all()
    )
    assert len(floor_rows) == 1
    assert floor_rows[0].old_value == 375
    assert floor_rows[0].new_value == 380
    assert floor_rows[0].note == "P22"


def test_floor_noop_when_no_evidence(db):
    a = _seed_athlete(db, bench_max_lbs=375)
    db.commit()

    floor_declared_maxes_to_history(db, a)

    assert a.bench_max_lbs == 375
