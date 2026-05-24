"""Regression tests for pr_tracking.log_prs_for_program.

The session factory uses ``autoflush=False`` so PR-tracking has to flush
its own pending writes before re-reading max_history. Without that, batch
runs (backfill-prs) see stale committed state and re-issue PRs that the
prior program already set.
"""

from __future__ import annotations

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from bestrong.models.orm import (
    Athlete,
    Base,
    ExerciseAlias,
    ExerciseEntry,
    MaxHistory,
    MeetResult,
    Program,
    Session as SessionModel,
)
from bestrong.services.max_tracking import sync_competition_lane_prs
from bestrong.services.pr_tracking import (
    COMP_MATCH_SOURCE,
    log_prs_for_program,
    rebuild_pr_history,
)


@pytest.fixture()
def session():
    """In-memory DB with the production autoflush=False semantics."""
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    factory = sessionmaker(bind=engine, autocommit=False, autoflush=False)
    s = factory()
    yield s
    s.close()


def _make_program(session, athlete_id: int, program_number: int, date_start: str) -> Program:
    prog = Program(
        athlete_id=athlete_id,
        program_number=program_number,
        program_name=f"Program {program_number}",
        date_start=date_start,
        date_end=date_start,
    )
    session.add(prog)
    session.flush()
    return prog


def _make_top_set(
    session,
    program: Program,
    week: int,
    day: int,
    weight: float,
    reps: int = 3,
    exercise: str = "Competition Squat",
    lift_category: str = "squat",
):
    sess = SessionModel(
        program_id=program.id,
        week_number=week,
        day_number=day,
        day_name=f"Day {day}",
    )
    session.add(sess)
    session.flush()
    entry = ExerciseEntry(
        session_id=sess.id,
        exercise_name=exercise,
        exercise_order=1,
        exercise_group=1,
        set_type="top_set",
        lift_category=lift_category,
        sets=1,
        reps=reps,
        weight_lbs=weight,
    )
    session.add(entry)
    session.flush()


def test_chain_holds_across_programs_without_commits(session):
    """log_prs_for_program must see prior calls' writes even without commits.

    Backfill-prs walks every program in one session and only commits every
    50 iterations. With autoflush=False, a naive implementation would let
    each program's _current_rep_prs read stale committed state and re-issue
    PRs that an earlier program in the same batch had already set.

    Reproduces by walking three programs in one session: P1 establishes
    240, P2 hits 240 again (no PR — tied), P3 hits 245 (PR of +5 over
    240, NOT +9 over the original 236 baseline).
    """
    athlete = Athlete(name="Test Athlete")
    session.add(athlete)
    session.flush()


    p1 = _make_program(session, athlete.id, program_number=1, date_start="2025-01-01")
    _make_top_set(session, p1, week=1, day=1, weight=240.0)
    p2 = _make_program(session, athlete.id, program_number=2, date_start="2025-02-01")
    _make_top_set(session, p2, week=1, day=1, weight=240.0)
    p3 = _make_program(session, athlete.id, program_number=3, date_start="2025-03-01")
    _make_top_set(session, p3, week=1, day=1, weight=245.0)
    session.commit()


    log_prs_for_program(session, athlete_id=athlete.id, program_id=p1.id, source="import")
    log_prs_for_program(session, athlete_id=athlete.id, program_id=p2.id, source="import")
    log_prs_for_program(session, athlete_id=athlete.id, program_id=p3.id, source="import")

    session.flush()
    rows = (
        session.query(MaxHistory)
        .filter(MaxHistory.athlete_id == athlete.id)
        .filter(MaxHistory.lift == "squat")
        .filter(MaxHistory.reps == 3)
        .order_by(MaxHistory.recorded_at)
        .all()
    )

    assert len(rows) == 2, (
        f"expected 2 PRs (P1 establishing 240, P3 beating with 245); got {len(rows)} "
        f"with values {[(r.old_value, r.new_value) for r in rows]}"
    )

    p1_row, p3_row = rows
    assert p1_row.old_value is None and p1_row.new_value == 240.0
    assert p3_row.old_value == 240.0 and p3_row.new_value == 245.0, (
        f"P3 should chain from P1's 240, not seed from None or a stale baseline. "
        f"Got old={p3_row.old_value}, new={p3_row.new_value}"
    )


def test_spelling_variants_collapse_to_one_pr_lane(session):
    """Paused Squat / Paused Squats / Tempo Sqaut must share a PR lane.

    Coaches enter free text in the spreadsheet, so the same lift shows
    up with different casing, pluralization, and occasional typos. PR
    tracking groups by canonical name so 240 on "Paused Squat" and 238
    on "Paused Squats" don't produce two parallel PR lanes.
    """
    athlete = Athlete(name="Test Athlete")
    session.add(athlete)
    session.flush()

    p1 = _make_program(session, athlete.id, program_number=1, date_start="2025-01-01")
    _make_top_set(session, p1, week=1, day=1, weight=240.0, exercise="Paused Squat (0-1-0)")
    p2 = _make_program(session, athlete.id, program_number=2, date_start="2025-02-01")


    _make_top_set(session, p2, week=1, day=1, weight=238.0, exercise="Paused Squats (0-1-0)")
    p3 = _make_program(session, athlete.id, program_number=3, date_start="2025-03-01")

    _make_top_set(session, p3, week=1, day=1, weight=250.0, exercise="Paused Sqaut (0-1-0)")
    session.commit()

    log_prs_for_program(session, athlete_id=athlete.id, program_id=p1.id, source="import")
    log_prs_for_program(session, athlete_id=athlete.id, program_id=p2.id, source="import")
    log_prs_for_program(session, athlete_id=athlete.id, program_id=p3.id, source="import")

    session.flush()
    rows = (
        session.query(MaxHistory)
        .filter(MaxHistory.athlete_id == athlete.id)
        .filter(MaxHistory.lift == "squat")
        .filter(MaxHistory.reps == 3)
        .order_by(MaxHistory.recorded_at)
        .all()
    )
    assert len(rows) == 2, (
        "P2's lighter 238 under a plural spelling must not register as a new PR. "
        f"Got {[(r.exercise_name, r.old_value, r.new_value) for r in rows]}"
    )


    assert rows[0].exercise_name == "Paused Squat (0-1-0)"
    assert rows[1].exercise_name == "Paused Sqaut (0-1-0)"
    assert rows[1].old_value == 240.0 and rows[1].new_value == 250.0


def test_coach_declared_aliases_fold_into_one_pr_lane(session):
    """Coach-managed aliases merge names that structural fold can't.

    The structural canonicalizer intentionally preserves parenthetical
    cues ("just off the floor" vs "right off the floor") because those
    can be real distinctions. When the coach declares two such variants
    equivalent via the exercise_aliases table, PR tracking must honor
    that and fold them into a single lane.
    """
    athlete = Athlete(name="Test Athlete")
    session.add(athlete)
    session.flush()


    session.add_all([
        ExerciseAlias(
            primary_name="Paused Deadlift",
            alias_name="Pause Deadlift 0-1-0 (just off the floor)",
        ),
        ExerciseAlias(
            primary_name="Paused Deadlift",
            alias_name="Paused Deadlift (0-1-0) (right off the floor)",
        ),
    ])

    p1 = _make_program(session, athlete.id, program_number=1, date_start="2025-01-01")
    _make_top_set(
        session, p1, week=1, day=1, weight=480.0,
        exercise="Pause Deadlift 0-1-0 (just off the floor)",
        lift_category="deadlift",
    )
    p2 = _make_program(session, athlete.id, program_number=2, date_start="2025-02-01")


    _make_top_set(
        session, p2, week=1, day=1, weight=495.0,
        exercise="Paused Deadlift (0-1-0) (right off the floor)",
        lift_category="deadlift",
    )
    session.commit()

    log_prs_for_program(session, athlete_id=athlete.id, program_id=p1.id, source="import")
    log_prs_for_program(session, athlete_id=athlete.id, program_id=p2.id, source="import")

    session.flush()
    rows = (
        session.query(MaxHistory)
        .filter(MaxHistory.athlete_id == athlete.id)
        .filter(MaxHistory.lift == "deadlift")
        .filter(MaxHistory.reps == 3)
        .order_by(MaxHistory.recorded_at)
        .all()
    )
    assert len(rows) == 2, (
        "Coach-declared aliases should chain the two variants. "
        f"Got {[(r.exercise_name, r.old_value, r.new_value) for r in rows]}"
    )


    assert rows[0].old_value is None and rows[0].new_value == 480.0
    assert rows[1].old_value == 480.0 and rows[1].new_value == 495.0

    assert rows[0].exercise_name == "Pause Deadlift 0-1-0 (just off the floor)"
    assert rows[1].exercise_name == "Paused Deadlift (0-1-0) (right off the floor)"


def _make_meet_attempt(session, athlete_id, lift, weight, meet_date="2025-09-05", meet_name="Test Meet"):
    row = MeetResult(
        athlete_id=athlete_id,
        meet_id=None,
        meet_name=meet_name,
        meet_date=meet_date,
        lift=lift,
        attempt_number=2,
        weight_lbs=weight,
        made=True,
    )
    session.add(row)
    session.flush()
    return row


def test_training_single_tying_comp_pr_logs_comp_match_row(session):
    """A training single that ties an existing comp PR fires a Comp Match
    row, not a +0 PR over the prior training value.

    Pre-fix: the per-exercise lane only saw training rows, so a 540 in
    the gym after a 540 at a meet would land as a "+6 PR" over the
    prior training single of 534. After fix: the comp 540 is synced
    into the lane via sync_competition_lane_prs, the lane prev becomes
    540, and pr_tracking writes a tagged comp_match row instead of
    treating the tie as a regression.
    """
    athlete = Athlete(name="Tester")
    session.add(athlete)
    session.flush()

    # Comp 540 happened first at the meet.
    _make_meet_attempt(session, athlete.id, "deadlift", 540.0)
    sync_competition_lane_prs(session, athlete.id, source="meet")
    session.flush()

    # A prior training single at 534 sets the lane's training history.
    p_old = _make_program(session, athlete.id, program_number=1, date_start="2025-08-01")
    _make_top_set(
        session, p_old, week=2, day=4, weight=534.0, reps=1,
        exercise="Competition Deadlift", lift_category="deadlift",
    )

    # Then a training session ties the comp PR at 540.
    p_match = _make_program(session, athlete.id, program_number=2, date_start="2026-04-01")
    _make_top_set(
        session, p_match, week=3, day=4, weight=540.0, reps=1,
        exercise="Competition Deadlift", lift_category="deadlift",
    )
    session.commit()

    log_prs_for_program(session, athlete_id=athlete.id, program_id=p_old.id, source="import")
    log_prs_for_program(session, athlete_id=athlete.id, program_id=p_match.id, source="import")
    session.flush()

    rows = (
        session.query(MaxHistory)
        .filter(MaxHistory.athlete_id == athlete.id)
        .filter(MaxHistory.lift == "deadlift")
        .filter(MaxHistory.reps == 1)
        .order_by(MaxHistory.id)
        .all()
    )
    sources = [r.source for r in rows]
    values = [(r.old_value, r.new_value) for r in rows]
    assert COMP_MATCH_SOURCE in sources, (
        f"expected a comp_match row for the training tie of comp 540; got sources={sources}, values={values}"
    )
    match_row = next(r for r in rows if r.source == COMP_MATCH_SOURCE)
    assert match_row.new_value == 540.0
    assert match_row.old_value == 540.0


def test_comp_match_does_not_fire_twice_at_same_weight(session):
    """Once a training rep has matched the comp PR, subsequent training
    reps at the same weight don't re-fire the celebration. The card is
    "first time you matched it," not "every time you match it."
    """
    athlete = Athlete(name="Tester")
    session.add(athlete)
    session.flush()

    _make_meet_attempt(session, athlete.id, "deadlift", 540.0)
    sync_competition_lane_prs(session, athlete.id, source="meet")

    p1 = _make_program(session, athlete.id, program_number=1, date_start="2026-04-01")
    _make_top_set(
        session, p1, week=3, day=4, weight=540.0, reps=1,
        exercise="Competition Deadlift", lift_category="deadlift",
    )
    p2 = _make_program(session, athlete.id, program_number=2, date_start="2026-05-01")
    _make_top_set(
        session, p2, week=2, day=4, weight=540.0, reps=1,
        exercise="Competition Deadlift", lift_category="deadlift",
    )
    session.commit()

    log_prs_for_program(session, athlete_id=athlete.id, program_id=p1.id, source="import")
    log_prs_for_program(session, athlete_id=athlete.id, program_id=p2.id, source="import")
    session.flush()

    match_rows = (
        session.query(MaxHistory)
        .filter(MaxHistory.athlete_id == athlete.id)
        .filter(MaxHistory.source == COMP_MATCH_SOURCE)
        .all()
    )
    assert len(match_rows) == 1, (
        f"comp_match should fire only the first time training catches up; got {len(match_rows)} rows"
    )


def test_pause_variant_does_not_trigger_comp_match(session):
    """Comp Match only fires on the comp variant of the lift. Variations
    like Pause Bench or High Bar Squat happening at the same weight as
    the comp PR are ordinary in-lane PRs, not comp matches.
    """
    athlete = Athlete(name="Tester")
    session.add(athlete)
    session.flush()

    _make_meet_attempt(session, athlete.id, "bench", 285.0)
    sync_competition_lane_prs(session, athlete.id, source="meet")

    p = _make_program(session, athlete.id, program_number=1, date_start="2026-04-01")
    _make_top_set(
        session, p, week=1, day=1, weight=285.0, reps=1,
        exercise="Pause Bench Press", lift_category="bench",
    )
    session.commit()

    log_prs_for_program(session, athlete_id=athlete.id, program_id=p.id, source="import")
    session.flush()

    match_rows = (
        session.query(MaxHistory)
        .filter(MaxHistory.athlete_id == athlete.id)
        .filter(MaxHistory.source == COMP_MATCH_SOURCE)
        .all()
    )
    assert match_rows == [], (
        "A pause-bench tie of the comp PR is not a comp match (different exercise)"
    )


def test_accessory_named_entry_never_enters_comp_lane(session):
    """An accessory mis-tagged as a competition lift is kept out of PRs.

    Color-based parsing can promote a blue-highlighted "Dumbbell RDL" into
    lift_category="deadlift". Even with that bad tag, the RDL must not log a
    deadlift PR (it would skew the deadlift progression and could inflate the
    declared max), while a genuine deadlift in the same program still does.
    """
    athlete = Athlete(name="RDL Athlete")
    session.add(athlete)
    session.flush()

    p = _make_program(session, athlete.id, program_number=1, date_start="2025-01-01")
    # Mis-tagged accessory: heavier than the real deadlift, single rep.
    _make_top_set(
        session, p, week=1, day=1, weight=500.0, reps=1,
        exercise="Dumbbell RDL", lift_category="deadlift",
    )
    # Genuine competition deadlift on the same program.
    _make_top_set(
        session, p, week=1, day=2, weight=405.0, reps=1,
        exercise="Competition Deadlift", lift_category="deadlift",
    )
    session.commit()

    log_prs_for_program(session, athlete_id=athlete.id, program_id=p.id, source="import")
    session.flush()

    dl_rows = (
        session.query(MaxHistory)
        .filter(MaxHistory.athlete_id == athlete.id)
        .filter(MaxHistory.lift == "deadlift")
        .all()
    )
    names = {r.exercise_name for r in dl_rows}
    assert "Dumbbell RDL" not in names, "RDL must not log a deadlift PR"
    assert names == {"Competition Deadlift"}
    # The RDL's 500 lb single must not become the declared deadlift max.
    session.refresh(athlete)
    assert athlete.deadlift_max_lbs == 405.0


def test_rebuild_purges_stale_pr_after_data_correction(session):
    """A PR sourced from once-corrupt data must not survive a rebuild.

    Reproduces the coerced multi-set bug: a squat top set lands with an
    impossible weight (424424402), logged as a 4RM PR and a training-total
    PR. After the parser is fixed and exercise_entries carry a sane weight,
    rebuild_pr_history must drop the phantom rows and reflect only the
    corrected data, which is what a re-import now triggers.
    """
    athlete = Athlete(name="Test Athlete")
    session.add(athlete)
    session.flush()

    p1 = _make_program(session, athlete.id, program_number=1, date_start="2025-01-01")
    _make_top_set(
        session, p1, week=1, day=1, weight=424424402.0, reps=4,
        exercise="Competition Squat", lift_category="squat",
    )
    # Bench + deadlift in the same session so a training total can form.
    _make_top_set(
        session, p1, week=1, day=1, weight=300.0, reps=1,
        exercise="Competition Bench Press", lift_category="bench",
    )
    _make_top_set(
        session, p1, week=1, day=1, weight=500.0, reps=1,
        exercise="Competition Deadlift", lift_category="deadlift",
    )
    session.commit()

    log_prs_for_program(session, athlete_id=athlete.id, program_id=p1.id, source="import")
    session.flush()

    # The phantom 4RM and the inflated training total are now in history.
    assert (
        session.query(MaxHistory)
        .filter(MaxHistory.athlete_id == athlete.id, MaxHistory.new_value > 2000)
        .count()
        > 0
    )

    # Parser fix: the squat top set now carries a sane weight, exactly as a
    # corrected re-import would rewrite exercise_entries.
    entry = (
        session.query(ExerciseEntry)
        .join(SessionModel, ExerciseEntry.session_id == SessionModel.id)
        .filter(
            SessionModel.program_id == p1.id,
            ExerciseEntry.lift_category == "squat",
        )
        .one()
    )
    entry.weight_lbs = 405.0
    session.flush()

    written = rebuild_pr_history(session, athlete_id=athlete.id, source="resync")
    session.flush()

    assert written > 0
    assert (
        session.query(MaxHistory)
        .filter(MaxHistory.athlete_id == athlete.id, MaxHistory.new_value > 2000)
        .count()
        == 0
    ), "phantom rows must be gone after rebuild"

    squat_4rm = (
        session.query(MaxHistory)
        .filter(
            MaxHistory.athlete_id == athlete.id,
            MaxHistory.lift == "squat",
            MaxHistory.reps == 4,
        )
        .all()
    )
    assert len(squat_4rm) == 1 and squat_4rm[0].new_value == 405.0


def test_rebuild_preserves_meet_and_manual_rows(session):
    """Rebuild must not touch meet-derived or manually-entered history.

    Only program-derived rows (import/resync/comp_match) are cleared and
    replayed; a coach's manual max edit and a meet PR lane row both survive,
    so legitimate evidence isn't collateral damage of the reconciliation.
    """
    athlete = Athlete(name="Test Athlete")
    session.add(athlete)
    session.flush()

    # A manual coach edit and a meet-derived comp lane row.
    session.add(
        MaxHistory(
            athlete_id=athlete.id, lift="bench", old_value=200.0, new_value=315.0,
            source="manual", reps=1, exercise_name="Competition Bench Press",
        )
    )
    _make_meet_attempt(session, athlete.id, "squat", 600.0)
    session.flush()
    sync_competition_lane_prs(session, athlete.id, source="meet")
    session.flush()

    p1 = _make_program(session, athlete.id, program_number=1, date_start="2025-01-01")
    # A genuine training PR over the meet best, so a program-derived row exists.
    _make_top_set(
        session, p1, week=1, day=1, weight=650.0, reps=1,
        exercise="Competition Squat", lift_category="squat",
    )
    session.commit()
    log_prs_for_program(session, athlete_id=athlete.id, program_id=p1.id, source="import")
    session.flush()

    manual_before = (
        session.query(MaxHistory).filter(MaxHistory.source == "manual").count()
    )
    meet_before = (
        session.query(MaxHistory).filter(MaxHistory.source == "meet").count()
    )
    assert manual_before == 1 and meet_before >= 1

    rebuild_pr_history(session, athlete_id=athlete.id, source="resync")
    session.flush()

    assert (
        session.query(MaxHistory).filter(MaxHistory.source == "manual").count()
        == manual_before
    )
    assert (
        session.query(MaxHistory).filter(MaxHistory.source == "meet").count()
        == meet_before
    )
    # The program-derived rows were rebuilt under the resync source.
    assert (
        session.query(MaxHistory).filter(MaxHistory.source == "resync").count() > 0
    )
