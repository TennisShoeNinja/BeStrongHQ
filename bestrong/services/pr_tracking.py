"""PR tracking for the import/resync pipeline.

Scans a program's training data and logs any new PRs to ``max_history``.

Three PR flavors are tracked:

Rep PRs (per exercise + rep count)
    For every compound top set (squat / bench / deadlift per the
    lift-category tag), track the heaviest load at each integer rep count
    in [1, MAX_REP_PR_COUNT]. A row lands in ``max_history`` when a
    (lift, exercise_name, reps) combo exceeds its all-time high.

    Scoped per-exercise so close-grip bench progress doesn't get mashed
    into competition-bench PRs. ``reps`` and ``exercise_name`` populated.

Lift ATH (aggregate per lift_category)
    The heaviest 1-rep single across all exercises for a lift updates
    the athlete's declared max (``squat_max_lbs`` / ``bench_max_lbs`` /
    ``deadlift_max_lbs``). Preserves the existing behavior of keeping
    the profile metrics cards current.

Training total
    Sourced from the best top set of any rep count on each primary lift
    per session. Squat best + bench best + deadlift best = that
    session's training total. A ``lift='total'`` row is emitted whenever
    this sum exceeds the prior training-total ATH. ``reps`` / ``exercise_name``
    stay null on total rows since they aggregate across lifts and reps.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta

from sqlalchemy import func as sa_func
from sqlalchemy.orm import Session as DBSession

from ..models.orm import Athlete, ExerciseEntry, MaxHistory, MeetResult, Program, Session as SessionModel
from ..utils.dates import parse_program_start, session_is_future
from ..utils.exercise_names import (
    canonicalize_exercise_name,
    canonicalize_with_aliases,
    load_alias_map,
)

logger = logging.getLogger(__name__)

_COMPETITION_LIFTS = ("squat", "bench", "deadlift")

# Source tag for MaxHistory rows where a training single ties an
# existing competition PR for the same lift. The athlete profile
# reframes these as "Comp Match" instead of celebrating a +0 lb PR.
COMP_MATCH_SOURCE = "comp_match"

# Names that count as the competition variant of a given lift, for
# Comp Match purposes only. Pulls in the bare lift name and a couple
# of common synonyms so coaches who log "Bench" or "Bench Press" in
# the gym still get the Comp Match callout, while specific variations
# ("Pause Bench", "High Bar Squat", "Block Pulls") stay separate.
# Values are pre-canonicalized so tempo notation, casing, and plural
# drift on the input side fold to the same key.
_COMP_VARIANT_NAMES = {
    lift: frozenset(canonicalize_exercise_name(n) for n in names)
    for lift, names in {
        "squat": (
            "squat",
            "back squat",
            "low bar squat",
            "competition squat",
            "competition back squat",
            "competition low bar squat",
        ),
        "bench": (
            "bench",
            "bench press",
            "competition bench",
            "competition bench press",
        ),
        "deadlift": (
            "deadlift",
            "conventional deadlift",
            "sumo deadlift",
            "competition deadlift",
            "competition conventional deadlift",
            "competition sumo deadlift",
        ),
    }.items()
}


def _is_comp_variant_name(name: str | None, lift: str) -> bool:
    if not name:
        return False
    return canonicalize_exercise_name(name) in _COMP_VARIANT_NAMES.get(
        lift, frozenset()
    )


MAX_REP_PR_COUNT = 10


def _session_timestamp(program: Program, session: SessionModel) -> datetime:
    """Compute an approximate datetime for a session based on its program's
    start date plus the session's position in the program."""
    base = parse_program_start(program.date_start) or program.imported_at or datetime.utcnow()
    week_offset = max(0, (session.week_number or 1) - 1)
    day_offset = max(0, (session.day_number or 1) - 1)
    return base + timedelta(days=week_offset * 7 + day_offset)


def _current_lift_ath(db: DBSession, athlete_id: int) -> dict[str, float | None]:
    """Return the current all-time-high **1-rep** per lift for an athlete.

    Used to keep the athlete's declared max (``squat_max_lbs`` etc.) in
    sync when a new heaviest single lands. Pulls from existing MaxHistory
    rows with reps=1, plus the athlete's declared max field as a floor.
    """
    ath: dict[str, float | None] = {"squat": None, "bench": None, "deadlift": None, "total": None}
    for lift in ("squat", "bench", "deadlift"):
        value = (
            db.query(sa_func.max(MaxHistory.new_value))
            .filter(
                MaxHistory.athlete_id == athlete_id,
                MaxHistory.lift == lift,

                ((MaxHistory.reps == 1) | (MaxHistory.reps.is_(None))),
            )
            .scalar()
        )
        ath[lift] = float(value) if value is not None else None

    total_value = (
        db.query(sa_func.max(MaxHistory.new_value))
        .filter(MaxHistory.athlete_id == athlete_id, MaxHistory.lift == "total")
        .scalar()
    )
    ath["total"] = float(total_value) if total_value is not None else None

    athlete = db.query(Athlete).filter(Athlete.id == athlete_id).first()
    if athlete is not None:
        declared_map = {
            "squat": athlete.squat_max_lbs,
            "bench": athlete.bench_max_lbs,
            "deadlift": athlete.deadlift_max_lbs,
            "total": athlete.total_lbs,
        }
        for lift, declared in declared_map.items():
            if declared is None:
                continue
            if ath[lift] is None or declared > ath[lift]:
                ath[lift] = float(declared)

    return ath


def _current_rep_prs(
    db: DBSession,
    athlete_id: int,
    alias_map: dict[str, str] | None = None,
) -> dict[tuple[str, str, int], float]:
    """Return the athlete's current ATH per (lift, canonical_name, reps).

    Reads all non-total, non-null-rep rows from ``max_history`` and groups
    by the canonical exercise name so that spelling drift ("Paused Squat"
    vs "Paused Squats", "Tempo Sqaut" typo) collapses to one PR lane.
    Coach-declared aliases are applied first when ``alias_map`` is passed.
    Callers extend the dict as new PRs are discovered during a program scan.
    """
    rep_prs: dict[tuple[str, str, int], float] = {}
    rows = (
        db.query(MaxHistory.lift, MaxHistory.exercise_name, MaxHistory.reps, MaxHistory.new_value)
        .filter(MaxHistory.athlete_id == athlete_id)
        .filter(MaxHistory.lift != "total")
        .filter(MaxHistory.reps.isnot(None))
        .filter(MaxHistory.exercise_name.isnot(None))
        .all()
    )
    for lift, exname, reps, value in rows:
        key = (lift, canonicalize_with_aliases(exname, alias_map), reps)
        if key not in rep_prs or value > rep_prs[key]:
            rep_prs[key] = float(value)
    return rep_prs


def _competition_maxes_by_lift(
    db: DBSession, athlete_id: int
) -> dict[str, float]:
    """Best made attempt per lift across every MeetResult on file.

    Used as the ceiling against which a training single is compared
    when deciding whether the rep is a real PR or a Comp Match (a tie
    of the athlete's all-time competition best).
    """
    rows = (
        db.query(MeetResult.lift, sa_func.max(MeetResult.weight_lbs))
        .filter(
            MeetResult.athlete_id == athlete_id,
            MeetResult.made.is_(True),
            MeetResult.lift.in_(_COMPETITION_LIFTS),
        )
        .group_by(MeetResult.lift)
        .all()
    )
    return {lift: float(weight) for lift, weight in rows if weight is not None}


def _existing_comp_match_high(
    db: DBSession,
    athlete_id: int,
    alias_map: dict[str, str] | None,
) -> dict[tuple[str, str], float]:
    """Highest weight already celebrated as a comp_match per lane.

    Returned as ``{(lift, canonical_exercise_name): max_weight}``. The
    caller only fires a new celebration when the incoming training
    weight strictly exceeds this prior bar, so a lifter who hits the
    same comp PR weekly only gets one card per comp PR; subsequent
    cards require the comp PR itself to have moved.
    """
    rows = (
        db.query(
            MaxHistory.lift,
            MaxHistory.exercise_name,
            sa_func.max(MaxHistory.new_value),
        )
        .filter(
            MaxHistory.athlete_id == athlete_id,
            MaxHistory.source == COMP_MATCH_SOURCE,
            MaxHistory.exercise_name.isnot(None),
        )
        .group_by(MaxHistory.lift, MaxHistory.exercise_name)
        .all()
    )
    out: dict[tuple[str, str], float] = {}
    for lift, exname, weight in rows:
        if weight is None:
            continue
        key = (lift, canonicalize_with_aliases(exname, alias_map))
        cur = out.get(key)
        if cur is None or weight > cur:
            out[key] = float(weight)
    return out


def log_prs_for_program(
    db: DBSession,
    athlete_id: int,
    program_id: int,
    source: str = "import",
) -> int:
    """Scan a program's training data and log any PRs against existing ATHs.

    Tracks three things:
      1. Rep PRs per (lift, exercise_name, reps) for reps in [1, MAX_REP_PR_COUNT].
      2. Declared-max sync: heaviest 1-rep single per lift updates
         ``athlete.<lift>_max_lbs``.
      3. Training total PRs: session-best-per-lift summed across the three
         competition lifts.

    Additive only: existing max_history rows are left alone.

    Returns:
        Number of MaxHistory rows created.
    """
    program = db.query(Program).filter(Program.id == program_id).first()
    if program is None:
        return 0


    db.flush()


    alias_map = load_alias_map(db)

    lift_ath = _current_lift_ath(db, athlete_id)
    rep_prs = _current_rep_prs(db, athlete_id, alias_map)

    # Comp PR per lift, used to reframe a training tie of the
    # competition best as "Comp Match" instead of a +0 PR. The
    # `comp_match_high` dict carries the highest weight already
    # celebrated as a comp_match per lane so the same PR doesn't
    # re-fire on every later training rep at the same weight; a new
    # comp_match only fires when the comp PR itself has climbed.
    comp_max_by_lift = _competition_maxes_by_lift(db, athlete_id)
    comp_match_high = _existing_comp_match_high(db, athlete_id, alias_map)

    rows = (
        db.query(ExerciseEntry, SessionModel)
        .join(SessionModel, ExerciseEntry.session_id == SessionModel.id)
        .filter(SessionModel.program_id == program_id)
        .filter(ExerciseEntry.failed == False)  # noqa: E712
        .filter(ExerciseEntry.weight_lbs.isnot(None))
        .filter(ExerciseEntry.reps.isnot(None))
        .filter(ExerciseEntry.reps >= 1)
        .filter(ExerciseEntry.lift_category.in_(_COMPETITION_LIFTS))
        .all()
    )


    today = datetime.utcnow()
    rows = [(ex, sess) for ex, sess in rows if not session_is_future(program, sess, today)]


    rep_best: dict[tuple[int, str, str, int], tuple[SessionModel, float, str]] = {}
    session_best: dict[tuple[int, str], tuple[SessionModel, float]] = {}

    for entry, session in rows:
        weight = float(entry.weight_lbs or 0)
        if weight <= 0:
            continue
        reps = int(entry.reps or 0)
        if reps <= 0:
            continue


        if 1 <= reps <= MAX_REP_PR_COUNT:
            canon = canonicalize_with_aliases(entry.exercise_name, alias_map)
            key = (session.id, entry.lift_category, canon, reps)
            prev = rep_best.get(key)
            if prev is None or weight > prev[1]:
                rep_best[key] = (session, weight, entry.exercise_name)


        skey = (session.id, entry.lift_category)
        prev_sess = session_best.get(skey)
        if prev_sess is None or weight > prev_sess[1]:
            session_best[skey] = (session, weight)


    sessions_seen = sorted(
        {sid: sess for (sid, _), (sess, _) in session_best.items()}.items(),
        key=lambda kv: (kv[1].week_number or 0, kv[1].day_number or 0),
    )

    entries_created = 0
    program_display = program.program_name or f"Program {program.program_number}"
    athlete = db.query(Athlete).filter(Athlete.id == athlete_id).first()
    declared_field = {"squat": "squat_max_lbs", "bench": "bench_max_lbs", "deadlift": "deadlift_max_lbs"}


    set_shadow: dict[str, float] = {}


    for session_id, session in sessions_seen:
        note_base = f"{program_display} - W{session.week_number}D{session.day_number}"
        timestamp = _session_timestamp(program, session)


        session_rep_keys = [
            (lift, canon, reps, sess, weight, raw)
            for (sid, lift, canon, reps), (sess, weight, raw) in rep_best.items()
            if sid == session_id
        ]
        for lift, canon, reps, _, weight, raw in sorted(
            session_rep_keys, key=lambda x: (x[0], x[1], x[2])
        ):
            prev = rep_prs.get((lift, canon, reps))
            is_pr = prev is None or weight > prev
            comp_max = comp_max_by_lift.get(lift)
            is_comp_match = (
                not is_pr
                and reps == 1
                and lift in _COMPETITION_LIFTS
                and comp_max is not None
                and weight == comp_max
                and prev is not None
                and weight == prev
                and weight > comp_match_high.get((lift, canon), 0.0)
                and _is_comp_variant_name(raw, lift)
            )
            if is_pr or is_comp_match:
                db.add(
                    MaxHistory(
                        athlete_id=athlete_id,
                        lift=lift,
                        old_value=prev,
                        new_value=weight,
                        source=COMP_MATCH_SOURCE if is_comp_match else source,
                        note=note_base,
                        recorded_at=timestamp,
                        reps=reps,
                        exercise_name=raw,
                    )
                )
                entries_created += 1

                if is_comp_match:
                    comp_match_high[(lift, canon)] = weight
                else:
                    rep_prs[(lift, canon, reps)] = weight

                if is_pr and reps == 1:
                    current = lift_ath.get(lift)
                    if current is None or weight > current:
                        lift_ath[lift] = weight
                        if athlete is not None and lift in declared_field:
                            declared = getattr(athlete, declared_field[lift], None)
                            if declared is None or weight > declared:
                                setattr(athlete, declared_field[lift], weight)


        for lift in _COMPETITION_LIFTS:
            best = session_best.get((session_id, lift))
            if best is None:
                continue
            prev = set_shadow.get(lift)
            if prev is None or best[1] > prev:
                set_shadow[lift] = best[1]

        if all(lift in set_shadow for lift in _COMPETITION_LIFTS):
            new_total = sum(set_shadow[lift] for lift in _COMPETITION_LIFTS)
            if lift_ath["total"] is None or new_total > lift_ath["total"]:
                db.add(
                    MaxHistory(
                        athlete_id=athlete_id,
                        lift="total",
                        old_value=lift_ath["total"],
                        new_value=new_total,
                        source=source,
                        note=note_base,
                        recorded_at=timestamp,
                        reps=None,
                        exercise_name=None,
                    )
                )
                lift_ath["total"] = new_total
                entries_created += 1
                if athlete is not None:
                    current_total = athlete.total_lbs
                    if current_total is None or new_total > current_total:
                        athlete.total_lbs = new_total

    return entries_created
