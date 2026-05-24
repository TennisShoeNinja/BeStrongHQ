"""Analytics endpoints — volume trends, PRs, program comparisons."""

from __future__ import annotations

import os
import re
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..utils.dates import session_is_future
from ..utils.exercise_names import canonicalize_with_aliases, load_alias_map

from ..models.orm import (
    Athlete,
    ExerciseEntry,
    MaxHistory,
    Program,
    Session as SessionModel,
    WeeklyVolume,
)
from ..analytics.e1rm import calculate_e1rm, calculate_e1rm_epley, peak_e1rm
from ..analytics.outliers import flag_outliers, OutlierInput
from ..analytics.pr_events import PRSetInput, derive_pr_events
from ..utils.feature_flags import tracks_rpe
from ..analytics.volume_response import (
    aggregate_profile,
    build_explanation,
    classify_trailing_volume_with_reason,
    compute_confidence,
    profile_human_label,
    split_trailing_volume,
)
from .deps import get_db
from .schemas import (
    AthleteAnalytics,
    DataQualityIssue,
    DataQualityResponse,
    E1RMDataPoint,
    EstimatedMaxForLift,
    FeaturedAthletePoint,
    FeaturedAthleteResponse,
    OutlierReferencePoint,
    PRRecord,
    PREventResponse,
    RecentPR,
    SessionsStats,
    VolumeDataPoint,
    VolumeResponseConfidence,
    VolumeResponsePeak,
    VolumeResponseProfile,
    VolumeResponseResponse,
    RPEComplianceResponse,
    RPEComplianceByLift,
    RPEComplianceByProgram,
)

_COMPETITION_LIFTS = ("squat", "bench", "deadlift")

_ESTIMATE_FLAG_PCT = 0.025
_ESTIMATE_FLAG_MIN_LBS = 5.0

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


@router.get("/athletes/{athlete_id}", response_model=AthleteAnalytics)
def get_athlete_analytics(athlete_id: int, db: Session = Depends(get_db)):
    """Full analytics summary for an athlete across all programs."""
    athlete = db.query(Athlete).filter(Athlete.id == athlete_id).first()
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")

    programs = (
        db.query(Program)
        .filter(Program.athlete_id == athlete_id)
        .order_by(Program.program_number)
        .all()
    )

    total_sessions = 0
    total_exercises = 0
    volume_points: list[VolumeDataPoint] = []
    pr_map: dict[str, PRRecord] = {}
    alias_map = load_alias_map(db, athlete_id)

    for program in programs:

        volumes = (
            db.query(WeeklyVolume)
            .filter(WeeklyVolume.program_id == program.id)
            .order_by(WeeklyVolume.week_number)
            .all()
        )
        for v in volumes:
            total_vol = sum(
                x for x in [v.squat_volume, v.bench_volume, v.deadlift_volume] if x is not None
            )
            volume_points.append(
                VolumeDataPoint(
                    week_number=v.week_number,
                    program_number=program.program_number,
                    program_name=program.program_name,
                    squat_volume=v.squat_volume,
                    bench_volume=v.bench_volume,
                    deadlift_volume=v.deadlift_volume,
                    total_volume=total_vol if total_vol > 0 else None,
                )
            )


        sessions = db.query(SessionModel).filter(SessionModel.program_id == program.id).all()
        total_sessions += len(sessions)

        for sess in sessions:
            exercises = (
                db.query(ExerciseEntry).filter(ExerciseEntry.session_id == sess.id).all()
            )
            total_exercises += len(exercises)

            for ex in exercises:
                if ex.is_accessory or ex.weight_lbs is None:
                    continue


                canon = canonicalize_with_aliases(ex.exercise_name, alias_map)
                if canon not in pr_map or (ex.weight_lbs > pr_map[canon].weight_lbs):
                    pr_map[canon] = PRRecord(
                        exercise_name=ex.exercise_name,
                        canonical_exercise_name=canon,
                        lift_category=ex.lift_category,
                        weight_lbs=ex.weight_lbs,
                        reps=ex.reps,
                        sets=ex.sets,
                        volume=ex.volume,
                        date=program.date_start,
                        program_number=program.program_number,
                        week_number=sess.week_number,
                        day_number=sess.day_number,
                    )

    return AthleteAnalytics(
        athlete_id=athlete.id,
        athlete_name=athlete.name,
        total_programs=len(programs),
        total_sessions=total_sessions,
        total_exercises=total_exercises,
        volume_over_time=volume_points,
        prs=sorted(pr_map.values(), key=lambda r: r.weight_lbs, reverse=True),
    )


@router.get("/athletes/{athlete_id}/pr-events", response_model=list[PREventResponse])
def get_athlete_pr_events(athlete_id: int, db: Session = Depends(get_db)):
    """Block-level celebration PRs for an athlete."""
    athlete = db.query(Athlete).filter(Athlete.id == athlete_id).first()
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")

    rows = (
        db.query(ExerciseEntry, SessionModel, Program)
        .join(SessionModel, ExerciseEntry.session_id == SessionModel.id)
        .join(Program, SessionModel.program_id == Program.id)
        .filter(Program.athlete_id == athlete_id)
        .filter(ExerciseEntry.failed == False)  # noqa: E712
        .filter(ExerciseEntry.weight_lbs.isnot(None))
        .filter(ExerciseEntry.weight_lbs > 0)
        .filter(ExerciseEntry.reps.isnot(None))
        .filter(ExerciseEntry.reps > 0)
        .filter(ExerciseEntry.reps <= 8)
        .all()
    )

    today = datetime.utcnow()
    rows = [(ex, sess, prog) for ex, sess, prog in rows if not session_is_future(prog, sess, today)]

    alias_map = load_alias_map(db, athlete_id)
    events = derive_pr_events(
        [
            PRSetInput(
                exercise_name=ex.exercise_name,
                lift_category=ex.lift_category,
                weight_lbs=ex.weight_lbs,
                reps=ex.reps,
                actual_rpe=ex.actual_rpe,
                failed=ex.failed,
                program_id=prog.id,
                program_name=prog.program_name,
                program_number=prog.program_number,
                date_start=prog.date_start,
                imported_at=prog.imported_at,
            )
            for ex, _sess, prog in rows
        ],
        alias_map=alias_map,
    )
    return [PREventResponse(**event.__dict__) for event in events]


@router.get("/volume", response_model=list[VolumeDataPoint])
def get_volume_trends(
    athlete_id: int = Query(..., description="Athlete ID"),
    program_id: int | None = Query(None, description="Filter to a single program"),
    db: Session = Depends(get_db),
):
    """Volume-over-time data for charts.

    Computes weekly volume by summing ExerciseEntry.volume per lift category
    rather than relying on pre-extracted WeeklyVolume rows (which depend on
    spreadsheet summary formulas that may be absent or inaccurate).
    """
    from sqlalchemy import func


    today = datetime.utcnow()
    sess_q = db.query(SessionModel, Program).join(Program, SessionModel.program_id == Program.id)
    if program_id:
        sess_q = sess_q.filter(Program.id == program_id)
    else:
        sess_q = sess_q.filter(Program.athlete_id == athlete_id)
    future_session_ids = {
        sess.id for sess, prog in sess_q.all() if session_is_future(prog, sess, today)
    }

    q = (
        db.query(
            SessionModel.week_number,
            Program.id.label("program_id"),
            Program.program_number,
            Program.program_name,
            ExerciseEntry.lift_category,
            func.sum(ExerciseEntry.volume).label("total"),
        )
        .join(SessionModel, ExerciseEntry.session_id == SessionModel.id)
        .join(Program, SessionModel.program_id == Program.id)
        .filter(
            ExerciseEntry.lift_category.in_(["squat", "bench", "deadlift"]),
            ExerciseEntry.volume.isnot(None),
        )
    )

    if program_id:
        q = q.filter(Program.id == program_id)
    else:
        q = q.filter(Program.athlete_id == athlete_id)

    if future_session_ids:
        q = q.filter(~SessionModel.id.in_(future_session_ids))

    q = q.group_by(
        Program.id, SessionModel.week_number, ExerciseEntry.lift_category
    ).order_by(Program.program_number, SessionModel.week_number)

    rows = q.all()


    buckets: dict[tuple[int, int], VolumeDataPoint] = {}
    for row in rows:
        key = (row.program_id, row.week_number)
        if key not in buckets:
            buckets[key] = VolumeDataPoint(
                week_number=row.week_number,
                program_number=row.program_number,
                program_name=row.program_name,
            )
        point = buckets[key]
        vol = round(row.total, 1) if row.total else None
        if row.lift_category == "squat":
            point.squat_volume = vol
        elif row.lift_category == "bench":
            point.bench_volume = vol
        elif row.lift_category == "deadlift":
            point.deadlift_volume = vol


    results = []
    for point in buckets.values():
        total = sum(
            x for x in [point.squat_volume, point.bench_volume, point.deadlift_volume]
            if x is not None
        )
        point.total_volume = total if total > 0 else None
        results.append(point)

    results.sort(key=lambda p: (p.program_number or 0, p.week_number))
    return results


@router.get("/prs", response_model=list[PRRecord])
def get_prs(
    athlete_id: int = Query(..., description="Athlete ID"),
    lift_category: str | None = Query(None, description="Filter by lift category (squat/bench/deadlift)"),
    db: Session = Depends(get_db),
):
    """Personal records across all programs for an athlete."""
    q = (
        db.query(ExerciseEntry, SessionModel, Program)
        .join(SessionModel, ExerciseEntry.session_id == SessionModel.id)
        .join(Program, SessionModel.program_id == Program.id)
        .filter(Program.athlete_id == athlete_id)
        .filter(ExerciseEntry.is_accessory == False)  # noqa: E712
        .filter(ExerciseEntry.failed == False)  # noqa: E712
        .filter(ExerciseEntry.weight_lbs.isnot(None))
    )

    if lift_category:
        q = q.filter(ExerciseEntry.lift_category == lift_category)

    rows = q.all()


    alias_map = load_alias_map(db, athlete_id)
    pr_map: dict[str, PRRecord] = {}
    for ex, sess, prog in rows:
        canon = canonicalize_with_aliases(ex.exercise_name, alias_map)
        if canon not in pr_map or ex.weight_lbs > pr_map[canon].weight_lbs:
            pr_map[canon] = PRRecord(
                exercise_name=ex.exercise_name,
                canonical_exercise_name=canon,
                lift_category=ex.lift_category,
                weight_lbs=ex.weight_lbs,
                reps=ex.reps,
                sets=ex.sets,
                volume=ex.volume,
                date=prog.date_start,
                program_number=prog.program_number,
                week_number=sess.week_number,
                day_number=sess.day_number,
            )

    return sorted(pr_map.values(), key=lambda r: r.weight_lbs, reverse=True)


@router.get("/e1rm", response_model=list[E1RMDataPoint])
def get_e1rm_trends(
    athlete_id: int = Query(..., description="Athlete ID"),
    lift_category: str | None = Query(None, description="Filter by lift category (squat/bench/deadlift)"),
    program_id: int | None = Query(None, description="Filter to a single program"),
    min_reps: int | None = Query(None, description="Minimum reps (e.g., 1 for singles only)"),
    max_reps: int | None = Query(None, description="Maximum reps (e.g., 3 for singles/doubles/triples)"),
    primary_only: bool = Query(False, description="Only include lifts from the athlete's primary day for each lift"),
    db: Session = Depends(get_db),
):
    """E1RM trend data for charts. Returns one data point per top set with a calculable E1RM.

    When primary_only=True, only returns data from the athlete's configured primary day
    for each lift category (e.g., if primary_bench_day=3, only bench data from Day 3).
    """

    athlete = db.query(Athlete).filter(Athlete.id == athlete_id).first()
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")


    athlete_primary_days = {}
    if primary_only:
        if athlete.primary_squat_day:
            athlete_primary_days["squat"] = athlete.primary_squat_day
        if athlete.primary_bench_day:
            athlete_primary_days["bench"] = athlete.primary_bench_day
        if athlete.primary_deadlift_day:
            athlete_primary_days["deadlift"] = athlete.primary_deadlift_day


    q = (
        db.query(ExerciseEntry, SessionModel, Program)
        .join(SessionModel, ExerciseEntry.session_id == SessionModel.id)
        .join(Program, SessionModel.program_id == Program.id)
        .filter(Program.athlete_id == athlete_id)
        .filter(ExerciseEntry.is_accessory == False)  # noqa: E712
        .filter(ExerciseEntry.failed == False)  # noqa: E712
        .filter(ExerciseEntry.weight_lbs.isnot(None))
        .filter(ExerciseEntry.reps.isnot(None))
        .filter(ExerciseEntry.set_type == "top_set")
    )

    if lift_category:
        q = q.filter(ExerciseEntry.lift_category == lift_category)
    if program_id:
        q = q.filter(Program.id == program_id)
    if min_reps is not None:
        q = q.filter(ExerciseEntry.reps >= min_reps)
    if max_reps is not None:
        q = q.filter(ExerciseEntry.reps <= max_reps)

    q = q.order_by(Program.program_number, SessionModel.week_number, SessionModel.day_number)
    rows = q.all()


    today = datetime.utcnow()
    rows = [(ex, sess, prog) for ex, sess, prog in rows if not session_is_future(prog, sess, today)]

    e1rm_alias_map = load_alias_map(db, athlete_id)
    results = []
    for ex, sess, prog in rows:


        if primary_only and ex.lift_category:
            lift = ex.lift_category

            prog_primary = getattr(prog, f"primary_{lift}_day", None)

            primary_day = prog_primary if prog_primary is not None else athlete_primary_days.get(lift)
            if primary_day is not None and sess.day_number != primary_day:
                continue


        # Use peak_e1rm so sets logged without an RPE still get an estimate
        # via the Epley fallback. Tenants with tracks_rpe=False have no RPE
        # on any set; computing e1rm from the RPE table alone would return
        # null for every point and leave their progression chart empty.
        e1rm, e1rm_method = peak_e1rm(ex.weight_lbs, ex.reps, ex.actual_rpe)
        if e1rm is None:
            e1rm_method = None
        results.append(
            E1RMDataPoint(
                exercise_name=ex.exercise_name,
                canonical_exercise_name=canonicalize_with_aliases(
                    ex.exercise_name, e1rm_alias_map
                ),
                lift_category=ex.lift_category,
                weight_lbs=ex.weight_lbs,
                reps=ex.reps,
                actual_rpe=ex.actual_rpe,
                e1rm=e1rm,
                week_number=sess.week_number,
                day_number=sess.day_number,
                day_name=sess.day_name,
                program_id=prog.id,
                program_number=prog.program_number,
                program_name=prog.program_name,
                google_sheet_url=prog.google_sheet_url,
                e1rm_method=e1rm_method,
            )
        )


    flags = flag_outliers(
        [
            OutlierInput(
                e1rm=r.e1rm,
                lift_category=r.lift_category,
                program_number=r.program_number,
                week_number=r.week_number,
                day_number=r.day_number,
            )
            for r in results
        ]
    )
    for r, f in zip(results, flags, strict=True):
        r.is_outlier = f.is_outlier
        r.outlier_reason = f.reason
        r.outlier_average = f.trailing_median
        if f.is_outlier:
            r.outlier_reference_points = [
                OutlierReferencePoint(
                    exercise_name=results[i].exercise_name,
                    weight_lbs=results[i].weight_lbs,
                    reps=results[i].reps,
                    actual_rpe=results[i].actual_rpe,
                    e1rm=results[i].e1rm,
                    program_number=results[i].program_number,
                    week_number=results[i].week_number,
                    day_number=results[i].day_number,
                    day_name=results[i].day_name,
                    google_sheet_url=results[i].google_sheet_url,
                )
                for i in f.reference_indices
            ]

    return results


_FEATURED_LIFT = "squat"
_FEATURED_MIN_DELTA_LBS = 10.0
_FEATURED_POOL_SIZE = 5


@router.get("/featured-athlete", response_model=FeaturedAthleteResponse | None)
def get_featured_athlete(db: Session = Depends(get_db)):
    """Pick the roster page's rotating "featured athlete" card.

    Ranks active athletes by squat e1RM gain within their current block
    (best minus first, so a deload week or a dropped rep scheme can't make
    real progress look flat), keeps the top few who gained at least
    ``_FEATURED_MIN_DELTA_LBS``, and rotates daily through that pool so the
    card always shows real, recent progression without going stale. Falls
    back to the strongest current squat when nobody clears the bar yet.
    """
    from sqlalchemy import func

    athletes = (
        db.query(Athlete)
        .filter(Athlete.archived == False)  # noqa: E712
        .order_by(Athlete.name)
        .all()
    )
    athletes_by_id = {a.id: a for a in athletes}
    if not athletes_by_id:
        return None

    # Latest program per athlete in one window-function query (no N+1).
    latest_programs = (
        db.query(
            Program.id.label("program_id"),
            func.row_number()
            .over(
                partition_by=Program.athlete_id,
                order_by=(Program.program_number.desc(), Program.id.desc()),
            )
            .label("rank"),
        )
        .filter(Program.athlete_id.in_(list(athletes_by_id)))
        .subquery()
    )
    programs = (
        db.query(Program)
        .join(latest_programs, Program.id == latest_programs.c.program_id)
        .filter(latest_programs.c.rank == 1)
        .all()
    )
    if not programs:
        return None
    programs_by_id = {p.id: p for p in programs}
    programs_by_athlete = {p.athlete_id: p for p in programs}

    # All squat top sets for those current blocks, in one query.
    rows = (
        db.query(ExerciseEntry, SessionModel)
        .join(SessionModel, ExerciseEntry.session_id == SessionModel.id)
        .filter(SessionModel.program_id.in_(list(programs_by_id)))
        .filter(ExerciseEntry.lift_category == _FEATURED_LIFT)
        .filter(ExerciseEntry.is_accessory == False)  # noqa: E712
        .filter(ExerciseEntry.failed == False)  # noqa: E712
        .filter(ExerciseEntry.set_type == "top_set")
        .filter(ExerciseEntry.weight_lbs.isnot(None))
        .filter(ExerciseEntry.reps.isnot(None))
        .order_by(
            SessionModel.program_id,
            SessionModel.week_number,
            SessionModel.day_number,
            SessionModel.id,
            ExerciseEntry.id,
        )
        .all()
    )

    today = datetime.utcnow()
    # athlete_id -> ordered list of (e1rm, week_number, actual_rpe)
    series: dict[int, list[tuple[float, int, float | None]]] = {}
    for ex, sess in rows:
        program = programs_by_id.get(sess.program_id)
        if program is None or session_is_future(program, sess, today):
            continue
        athlete = athletes_by_id.get(program.athlete_id)
        if athlete is None:
            continue
        # Restrict to the primary squat day when one is configured (program
        # override wins over the athlete default); a no-op when neither is set.
        primary_day = program.primary_squat_day
        if primary_day is None:
            primary_day = athlete.primary_squat_day
        if primary_day is not None and sess.day_number != primary_day:
            continue
        e1rm, _method = peak_e1rm(ex.weight_lbs, ex.reps, ex.actual_rpe)
        if e1rm is None:
            continue
        series.setdefault(program.athlete_id, []).append(
            (e1rm, sess.week_number, ex.actual_rpe)
        )

    candidates = []
    for athlete_id, pts in series.items():
        if len(pts) < 2:
            continue
        e1rms = [p[0] for p in pts]
        rpes = [p[2] for p in pts if isinstance(p[2], (int, float))]
        candidates.append(
            {
                "athlete_id": athlete_id,
                "delta": round(max(e1rms) - e1rms[0], 1),
                "current_e1rm": round(e1rms[-1], 1),
                "rpe_avg": round(sum(rpes) / len(rpes), 1) if rpes else None,
                "points": pts,
            }
        )
    if not candidates:
        return None

    pool = sorted(
        (c for c in candidates if c["delta"] >= _FEATURED_MIN_DELTA_LBS),
        key=lambda c: c["delta"],
        reverse=True,
    )[:_FEATURED_POOL_SIZE]

    if pool:
        # Deterministic daily rotation: stable all day, fresh each morning.
        chosen = pool[today.timetuple().tm_yday % len(pool)]
    else:
        # Early in a block nobody has gained yet, so feature the strongest
        # squat to keep the card from sitting empty or showing a negative delta.
        chosen = max(candidates, key=lambda c: c["current_e1rm"])

    athlete = athletes_by_id[chosen["athlete_id"]]
    program = programs_by_athlete.get(athlete.id)
    return FeaturedAthleteResponse(
        athlete_id=athlete.id,
        athlete_name=athlete.name,
        lift_category=_FEATURED_LIFT,
        block_type=program.block_type if program else None,
        current_e1rm=chosen["current_e1rm"],
        block_delta=chosen["delta"],
        rpe_avg=chosen["rpe_avg"],
        points=[
            FeaturedAthletePoint(idx=i, e1rm=round(e1rm, 1), week_number=week)
            for i, (e1rm, week, _rpe) in enumerate(chosen["points"])
        ],
    )


@router.get(
    "/athletes/{athlete_id}/data-quality",
    response_model=DataQualityResponse,
)
def get_data_quality(athlete_id: int, db: Session = Depends(get_db)):
    """Summarize Progression-Charts data-quality issues for one athlete.

    Returns the lists powering the "Review" banner above the Peak Lifts
    chart: outliers flagged by the percent-of-median pass, and top sets
    that can't be plotted because they're structurally incomplete
    (missing weight or reps, or the weight/reps are zero).
    """
    athlete = db.query(Athlete).filter(Athlete.id == athlete_id).first()
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")

    rows = (
        db.query(ExerciseEntry, SessionModel, Program)
        .join(SessionModel, ExerciseEntry.session_id == SessionModel.id)
        .join(Program, SessionModel.program_id == Program.id)
        .filter(Program.athlete_id == athlete_id)
        .filter(ExerciseEntry.is_accessory == False)  # noqa: E712
        .filter(ExerciseEntry.set_type == "top_set")
        .order_by(Program.program_number, SessionModel.week_number, SessionModel.day_number)
        .all()
    )

    total_top_sets = len(rows)

    def _issue(ex, sess, prog, category: str, reason: str, e1rm: float | None = None) -> DataQualityIssue:
        return DataQualityIssue(
            category=category,
            reason=reason,
            lift_category=ex.lift_category,
            exercise_name=ex.exercise_name,
            weight_lbs=ex.weight_lbs,
            reps=ex.reps,
            actual_rpe=ex.actual_rpe,
            e1rm=e1rm,
            week_number=sess.week_number,
            day_number=sess.day_number,
            day_name=sess.day_name,
            program_id=prog.id,
            program_number=prog.program_number,
            program_name=prog.program_name,
            google_sheet_url=prog.google_sheet_url,
        )

    excluded: list[DataQualityIssue] = []

    plottable_rows: list[tuple[object, object, object, float | None]] = []
    for ex, sess, prog in rows:
        if ex.failed:
            excluded.append(_issue(ex, sess, prog, "failed_attempt", "Failed attempt"))
            continue
        if ex.weight_lbs is None:
            excluded.append(_issue(ex, sess, prog, "missing_weight", "Weight not recorded"))
            continue
        if ex.reps is None:
            excluded.append(_issue(ex, sess, prog, "missing_reps", "Reps not recorded"))
            continue
        if ex.weight_lbs <= 0:
            excluded.append(_issue(ex, sess, prog, "zero_weight", "Weight is zero"))
            continue
        if ex.reps <= 0:
            excluded.append(_issue(ex, sess, prog, "zero_reps", "Reps is zero"))
            continue
        e1rm = (
            calculate_e1rm(ex.weight_lbs, ex.reps, ex.actual_rpe)
            if ex.actual_rpe is not None
            else None
        )
        plottable_rows.append((ex, sess, prog, e1rm))

    flags = flag_outliers(
        [
            OutlierInput(
                e1rm=e1rm,
                lift_category=ex.lift_category,
                program_number=prog.program_number,
                week_number=sess.week_number,
                day_number=sess.day_number,
            )
            for ex, sess, prog, e1rm in plottable_rows
        ]
    )
    outliers: list[DataQualityIssue] = []
    for (ex, sess, prog, e1rm), flag in zip(plottable_rows, flags, strict=True):
        if flag.is_outlier and flag.reason is not None:
            outliers.append(_issue(ex, sess, prog, "outlier", flag.reason, e1rm=e1rm))

    return DataQualityResponse(
        athlete_id=athlete.id,
        total_top_sets=total_top_sets,
        plotted_top_sets=len(plottable_rows),
        outliers=outliers,
        excluded=excluded,
    )


@router.get("/estimated-max", response_model=list[EstimatedMaxForLift])
def get_estimated_max(
    athlete_id: int = Query(..., description="Athlete ID"),
    max_reps: int = Query(3, ge=1, le=5, description="Cap on rep count for source set (defaults to 3)"),
    db: Session = Depends(get_db),
):
    """Per-lift best estimated 1RM from RPE-gated training top sets.

    Scans all top sets with reps in [1, max_reps] that have an actual RPE
    logged, computes the Tuchscherer-table e1RM for each, and returns the
    single highest per lift along with the source set's metadata.

    ``exceeds_declared`` is True only when the estimate is meaningfully
    above the athlete's declared max (both a minimum percentage and a
    minimum absolute delta) — this drives the "consider bumping the
    training max" badge on the profile page. Low-delta estimates are
    returned (for display under the card) but won't light up the badge.
    """
    athlete = db.query(Athlete).filter(Athlete.id == athlete_id).first()
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")

    declared_map = {
        "squat": athlete.squat_max_lbs,
        "bench": athlete.bench_max_lbs,
        "deadlift": athlete.deadlift_max_lbs,
    }

    rpe_tracked = tracks_rpe(db)

    query = (
        db.query(ExerciseEntry, SessionModel, Program)
        .join(SessionModel, ExerciseEntry.session_id == SessionModel.id)
        .join(Program, SessionModel.program_id == Program.id)
        .filter(Program.athlete_id == athlete_id)
        .filter(ExerciseEntry.is_accessory == False)  # noqa: E712
        .filter(ExerciseEntry.failed == False)  # noqa: E712
        .filter(ExerciseEntry.set_type == "top_set")
        .filter(ExerciseEntry.lift_category.in_(_COMPETITION_LIFTS))
        .filter(ExerciseEntry.weight_lbs.isnot(None))
        .filter(ExerciseEntry.reps.isnot(None))
        .filter(ExerciseEntry.reps >= 1)
        .filter(ExerciseEntry.reps <= max_reps)
    )


    if rpe_tracked:
        query = query.filter(ExerciseEntry.actual_rpe.isnot(None))
    rows = query.all()

    best: dict[str, tuple[float, ExerciseEntry, SessionModel, Program]] = {}
    for ex, sess, prog in rows:
        if rpe_tracked:
            e1rm = calculate_e1rm(ex.weight_lbs, ex.reps, ex.actual_rpe)
        else:
            e1rm = calculate_e1rm_epley(ex.weight_lbs, ex.reps)
        if e1rm is None:
            continue
        lift = ex.lift_category
        cur = best.get(lift)
        if cur is None or e1rm > cur[0]:
            best[lift] = (e1rm, ex, sess, prog)

    out: list[EstimatedMaxForLift] = []
    for lift in _COMPETITION_LIFTS:
        declared = declared_map.get(lift)
        declared_f = float(declared) if declared is not None else None
        entry = best.get(lift)
        if entry is None:
            out.append(
                EstimatedMaxForLift(
                    lift=lift,
                    declared=declared_f,
                    estimated=None,
                    exceeds_declared=False,
                )
            )
            continue
        e1rm, ex, sess, prog = entry
        exceeds = False
        if declared_f is not None and e1rm > declared_f:
            delta = e1rm - declared_f
            if delta >= _ESTIMATE_FLAG_MIN_LBS and delta / declared_f >= _ESTIMATE_FLAG_PCT:
                exceeds = True
        elif declared_f is None and e1rm > 0:

            exceeds = True
        out.append(
            EstimatedMaxForLift(
                lift=lift,
                declared=declared_f,
                estimated=round(e1rm, 1),
                weight_lbs=ex.weight_lbs,
                reps=ex.reps,
                actual_rpe=ex.actual_rpe,
                exercise_name=ex.exercise_name,
                program_id=prog.id,
                program_number=prog.program_number,
                program_name=prog.program_name,
                week_number=sess.week_number,
                day_number=sess.day_number,
                exceeds_declared=exceeds,
            )
        )
    return out


@router.get("/primary-day-debug")
def get_primary_day_debug(
    athlete_id: int = Query(..., description="Athlete ID"),
    program_id: int | None = Query(None, description="Specific program ID (default: latest)"),
    db: Session = Depends(get_db),
):
    """Debug endpoint: show what exercises exist on each primary lift day
    in the latest (or specified) program, and why they do or don't qualify for E1RM.
    """

    if os.environ.get("DEPLOYMENT_MODE", "local").lower().strip() == "cloud":
        raise HTTPException(status_code=404, detail="Not found")

    athlete = db.query(Athlete).filter(Athlete.id == athlete_id).first()
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")

    primary_days = {
        "squat": athlete.primary_squat_day,
        "bench": athlete.primary_bench_day,
        "deadlift": athlete.primary_deadlift_day,
    }


    if program_id:
        program = db.query(Program).filter(Program.id == program_id).first()
    else:
        program = (
            db.query(Program)
            .filter(Program.athlete_id == athlete_id)
            .order_by(Program.program_number.desc(), Program.id.desc())
            .first()
        )

    if not program:
        return {"program": None, "days": {}}


    sessions = (
        db.query(SessionModel)
        .filter(SessionModel.program_id == program.id)
        .order_by(SessionModel.week_number, SessionModel.day_number)
        .all()
    )


    day_names = {}
    for s in sessions:
        if s.day_number not in day_names:
            day_names[s.day_number] = s.day_name


    days_debug = {}
    for lift, day_num in primary_days.items():
        if day_num is None:
            days_debug[lift] = {"day_number": None, "status": "not_set", "exercises": []}
            continue


        target_session = None
        for s in reversed(sessions):
            if s.day_number == day_num:
                target_session = s
                break

        if not target_session:
            days_debug[lift] = {
                "day_number": day_num,
                "day_name": day_names.get(day_num, f"Day {day_num}"),
                "status": "no_session_found",
                "exercises": [],
                "available_days": sorted(day_names.keys()),
            }
            continue


        exercises = (
            db.query(ExerciseEntry)
            .filter(ExerciseEntry.session_id == target_session.id)
            .filter(ExerciseEntry.is_accessory == False)  # noqa: E712
            .order_by(ExerciseEntry.exercise_order)
            .all()
        )

        exercise_list = []
        for ex in exercises:

            issues = []
            if ex.set_type != "top_set":
                issues.append(f"set_type is '{ex.set_type}' (need 'top_set')")
            if ex.weight_lbs is None:
                issues.append("no weight")
            if ex.reps is None:
                issues.append("no reps")
            if ex.actual_rpe is None:
                issues.append("no RPE")

            e1rm_val = None
            if not issues:
                e1rm_val = calculate_e1rm(ex.weight_lbs, ex.reps, ex.actual_rpe)
                if e1rm_val is None:
                    issues.append("E1RM calculation returned None (RPE/rep combo not in table)")

            exercise_list.append({
                "exercise_name": ex.exercise_name,
                "lift_category": ex.lift_category,
                "set_type": ex.set_type,
                "sets": ex.sets,
                "reps": ex.reps,
                "weight_lbs": ex.weight_lbs,
                "actual_rpe": ex.actual_rpe,
                "e1rm": round(e1rm_val) if e1rm_val else None,
                "e1rm_eligible": len(issues) == 0,
                "issues": issues,
            })


        matching = [e for e in exercise_list if e["lift_category"].lower() == lift]
        other = [e for e in exercise_list if e["lift_category"].lower() != lift]

        days_debug[lift] = {
            "day_number": day_num,
            "day_name": day_names.get(day_num, f"Day {day_num}"),
            "week_sampled": target_session.week_number,
            "status": "ok" if matching else "no_matching_exercises",
            "matching_exercises": matching,
            "other_exercises_on_day": other,
        }

    return {
        "program": {
            "id": program.id,
            "name": program.program_name,
            "number": program.program_number,
            "date_start": program.date_start,
            "date_end": program.date_end,
        },
        "available_days": {num: name for num, name in sorted(day_names.items())},
        "primary_config": primary_days,
        "days": days_debug,
    }


_RPE_NUMBER_RE = re.compile(r"\d+(?:\.\d+)?")
_RPE_RANGE_RE = re.compile(r"(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)")


def _parse_target_rpe(target_rpe_str: str | None) -> float | None:
    """Parse a prescribed-RPE cell into a single numeric target.

    Coaches write RPE targets in a lot of shapes: ``"8"``, ``"7-8"``,
    ``"@7.5"``, ``"RPE 8"``, ``"~8"``, ``"7+"``, ``"@ 7 RPE"``.  We extract
    the numeric RPE rather than silently dropping anything that isn't a bare
    number — a skipped row tanks the fill rate and misleads the coach about
    how much data the compliance stats are based on.

    Returns the midpoint when the cell contains a ``N-M`` range with both
    endpoints in the 1-10 RPE scale; otherwise returns the first in-range
    number it finds.  Returns ``None`` only when no RPE-scale number is
    present at all.
    """
    if not target_rpe_str or not target_rpe_str.strip():
        return None

    raw = target_rpe_str.strip()

    range_match = _RPE_RANGE_RE.search(raw)
    if range_match:
        low = float(range_match.group(1))
        high = float(range_match.group(2))
        if 1 <= low <= 10 and 1 <= high <= 10:
            return (low + high) / 2.0

    for token in _RPE_NUMBER_RE.findall(raw):
        value = float(token)
        if 1 <= value <= 10:
            return value

    return None


@router.get("/rpe-compliance", response_model=RPEComplianceResponse)
def get_rpe_compliance(
    athlete_id: int = Query(..., description="Athlete ID"),
    program_id: int | None = Query(None, description="Filter to a single program"),
    db: Session = Depends(get_db),
):
    """RPE target vs actual compliance tracking.

    Returns a breakdown of how well the athlete hit their prescribed RPE targets
    across exercises.

    Two complementary counts are reported:
    - ``total_prescribed``: every entry where a target_rpe was set by the coach,
      regardless of whether the athlete filled in their actual RPE.
    - ``total_entries`` (a.k.a. "filled"): the subset of prescribed entries that
      also have an actual_rpe logged — these are the ones used for avg_rpe_diff
      and over/undershoot counts.
    - ``fill_rate_pct``: total_entries / total_prescribed × 100.  A low fill rate
      means the compliance numbers are based on a small, potentially
      unrepresentative sample.
    """
    athlete = db.query(Athlete).filter(Athlete.id == athlete_id).first()
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")


    if not tracks_rpe(db):
        return RPEComplianceResponse(
            enabled=False,
            athlete_id=athlete_id,
            total_entries=0,
            total_prescribed=0,
            fill_rate_pct=0.0,
            avg_rpe_diff=0.0,
            overshoot_count=0,
            undershoot_count=0,
            on_target_count=0,
            by_lift=[],
            by_program=[],
        )


    base_q = (
        db.query(ExerciseEntry, SessionModel, Program)
        .join(SessionModel, ExerciseEntry.session_id == SessionModel.id)
        .join(Program, SessionModel.program_id == Program.id)
        .filter(Program.athlete_id == athlete_id)
        .filter(ExerciseEntry.is_accessory == False)  # noqa: E712
        .filter(ExerciseEntry.target_rpe.isnot(None))
    )
    if program_id:
        base_q = base_q.filter(Program.id == program_id)

    all_prescribed_rows = base_q.all()


    today = datetime.utcnow()
    all_prescribed_rows = [
        (ex, sess, prog)
        for ex, sess, prog in all_prescribed_rows
        if not session_is_future(prog, sess, today)
    ]


    prescribed_by_lift: dict[str, int] = {}
    prescribed_by_prog: dict[int, int] = {}
    for ex, sess, prog in all_prescribed_rows:

        if _parse_target_rpe(ex.target_rpe) is None:
            continue
        lift = ex.lift_category
        prescribed_by_lift[lift] = prescribed_by_lift.get(lift, 0) + 1
        prescribed_by_prog[prog.id] = prescribed_by_prog.get(prog.id, 0) + 1

    total_prescribed = sum(prescribed_by_lift.values())


    filled_rows = [(ex, sess, prog) for ex, sess, prog in all_prescribed_rows if ex.actual_rpe is not None]


    entries_data = []
    for ex, sess, prog in filled_rows:
        target_midpoint = _parse_target_rpe(ex.target_rpe)
        if target_midpoint is None:
            continue

        actual = ex.actual_rpe


        if actual < 1 or actual > 10:
            continue

        diff = actual - target_midpoint
        entries_data.append(
            {
                "exercise": ex,
                "session": sess,
                "program": prog,
                "target_midpoint": target_midpoint,
                "actual": actual,
                "diff": diff,
            }
        )


    total = len(entries_data)
    fill_rate = round(total / total_prescribed * 100, 1) if total_prescribed > 0 else 0.0

    if total == 0:
        return RPEComplianceResponse(
            athlete_id=athlete_id,
            total_entries=0,
            total_prescribed=total_prescribed,
            fill_rate_pct=fill_rate,
            avg_rpe_diff=0.0,
            overshoot_count=0,
            undershoot_count=0,
            on_target_count=0,
            by_lift=[],
            by_program=[],
        )

    avg_diff = sum(e["diff"] for e in entries_data) / total
    overshoot = sum(1 for e in entries_data if e["diff"] > 0)
    undershoot = sum(1 for e in entries_data if e["diff"] < 0)
    on_target = sum(1 for e in entries_data if e["diff"] == 0)


    by_lift_map: dict[str, list] = {}
    for e in entries_data:
        lift = e["exercise"].lift_category
        if lift not in by_lift_map:
            by_lift_map[lift] = []
        by_lift_map[lift].append(e)

    by_lift = []
    for lift, entries in sorted(by_lift_map.items()):
        presc = prescribed_by_lift.get(lift, 0)
        filled = len(entries)
        by_lift.append(
            RPEComplianceByLift(
                lift_category=lift,
                total_entries=filled,
                total_prescribed=presc,
                fill_rate_pct=round(filled / presc * 100, 1) if presc > 0 else 0.0,
                avg_rpe_diff=sum(e["diff"] for e in entries) / filled,
                overshoot_count=sum(1 for e in entries if e["diff"] > 0),
                undershoot_count=sum(1 for e in entries if e["diff"] < 0),
                on_target_count=sum(1 for e in entries if e["diff"] == 0),
            )
        )


    by_program_map: dict[int, list] = {}
    for e in entries_data:
        prog_id = e["program"].id
        if prog_id not in by_program_map:
            by_program_map[prog_id] = []
        by_program_map[prog_id].append(e)

    by_program = []
    for prog_id, entries in sorted(by_program_map.items(), key=lambda x: x[0]):
        presc = prescribed_by_prog.get(prog_id, 0)
        filled = len(entries)
        by_program.append(
            RPEComplianceByProgram(
                program_id=entries[0]["program"].id,
                program_number=entries[0]["program"].program_number,
                program_name=entries[0]["program"].program_name,
                total_entries=filled,
                total_prescribed=presc,
                fill_rate_pct=round(filled / presc * 100, 1) if presc > 0 else 0.0,
                avg_rpe_diff=sum(e["diff"] for e in entries) / filled,
                overshoot_count=sum(1 for e in entries if e["diff"] > 0),
                undershoot_count=sum(1 for e in entries if e["diff"] < 0),
                on_target_count=sum(1 for e in entries if e["diff"] == 0),
            )
        )

    return RPEComplianceResponse(
        athlete_id=athlete_id,
        total_entries=total,
        total_prescribed=total_prescribed,
        fill_rate_pct=fill_rate,
        avg_rpe_diff=round(avg_diff, 2),
        overshoot_count=overshoot,
        undershoot_count=undershoot,
        on_target_count=on_target,
        by_lift=by_lift,
        by_program=by_program,
    )


_LIFT_VOLUME_COLUMN = {
    "squat": "squat_volume",
    "bench": "bench_volume",
    "deadlift": "deadlift_volume",
}


def _build_volume_response_profile(
    athlete_id: int,
    lift_category: str,
    db: Session,
    top_n: int,
    trailing_weeks: int,
    max_peak_reps: int,
) -> VolumeResponseProfile:
    """Compute a volume-response profile for a single lift category.

    Walks every top_set for the athlete on this lift, computes a peak e1rm
    using the RPE table when available and Epley otherwise, picks the top N
    by e1rm (only sets of 1-3 reps are eligible as peak candidates), and for
    each peak looks at the trailing N weeks of per-lift volume to classify
    the volume trajectory leading into it. Aggregates those classifications
    into a profile label with a confidence score.
    """
    vol_col = _LIFT_VOLUME_COLUMN.get(lift_category.lower())
    if vol_col is None:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported lift_category '{lift_category}' — expected squat/bench/deadlift",
        )


    rows = (
        db.query(ExerciseEntry, SessionModel, Program)
        .join(SessionModel, ExerciseEntry.session_id == SessionModel.id)
        .join(Program, SessionModel.program_id == Program.id)
        .filter(Program.athlete_id == athlete_id)
        .filter(ExerciseEntry.is_accessory == False)  # noqa: E712
        .filter(ExerciseEntry.failed == False)  # noqa: E712
        .filter(ExerciseEntry.weight_lbs.isnot(None))
        .filter(ExerciseEntry.reps.isnot(None))
        .filter(ExerciseEntry.set_type == "top_set")
        .filter(ExerciseEntry.lift_category == lift_category.lower())
        .order_by(Program.program_number, SessionModel.week_number, SessionModel.day_number)
        .all()
    )


    candidates = []
    total_top_sets = 0
    rpe_top_sets = 0
    for ex, sess, prog in rows:
        total_top_sets += 1
        if ex.actual_rpe is not None and ex.actual_rpe >= 6.0:
            rpe_top_sets += 1
        if ex.reps is None or ex.reps < 1 or ex.reps > max_peak_reps:
            continue
        e1rm_val, method = peak_e1rm(ex.weight_lbs, ex.reps, ex.actual_rpe)
        if e1rm_val is None:
            continue
        candidates.append(
            {
                "entry": ex,
                "session": sess,
                "program": prog,
                "e1rm": e1rm_val,
                "method": method,
            }
        )


    candidates.sort(key=lambda c: c["e1rm"], reverse=True)
    seen_slots: set[tuple] = set()
    top_peaks = []
    for c in candidates:
        slot = (
            c["program"].program_number,
            c["session"].week_number,
            c["session"].day_number,
        )
        if slot in seen_slots:
            continue
        seen_slots.add(slot)
        top_peaks.append(c)
        if len(top_peaks) >= top_n:
            break


    weekly_rows = (
        db.query(WeeklyVolume, Program)
        .join(Program, WeeklyVolume.program_id == Program.id)
        .filter(Program.athlete_id == athlete_id)
        .order_by(Program.program_number, WeeklyVolume.week_number)
        .all()
    )
    volume_series = [
        {
            "program_number": prog.program_number,
            "week_number": wv.week_number,
            "volume": getattr(wv, vol_col),
        }
        for wv, prog in weekly_rows
        if prog.program_number is not None and wv.week_number is not None
    ]

    def _trailing_window(
        program_number: int | None, week_number: int
    ) -> list[float | None]:
        """Return the trailing volume window up to and including the given week.

        Prefers an exact (program_number, week_number) match, but falls back
        to the latest volume entry that chronologically precedes the peak.
        This handles cases where the peak's exact week is not in the
        WeeklyVolume table (e.g. a 5-week block whose weekly-volume summary
        rows only cover weeks 1-4, or a testing week that wasn't ingested as
        a volume row). Without the fallback, those peaks would be silently
        labeled "no volume history before this peak" even when the lift has
        a perfectly usable trailing volume series.
        """
        if not volume_series or program_number is None:
            return []
        peak_key = (program_number, week_number)
        target_idx: int | None = None
        for idx, v in enumerate(volume_series):
            v_key = (v["program_number"], v["week_number"])
            if v_key > peak_key:
                break
            target_idx = idx
        if target_idx is None:
            return []
        start = max(0, target_idx - trailing_weeks + 1)
        window = volume_series[start : target_idx + 1]
        return [v["volume"] for v in window]


    response_peaks: list[VolumeResponsePeak] = []
    peak_slopes: list[str] = []
    for c in top_peaks:
        window = _trailing_window(
            c["program"].program_number, c["session"].week_number
        )
        slope, reason = classify_trailing_volume_with_reason(window)
        peak_slopes.append(slope)
        first_half, second_half = split_trailing_volume(window)
        clean_weeks = len([v for v in window if v is not None and v > 0])
        response_peaks.append(
            VolumeResponsePeak(
                exercise_name=c["entry"].exercise_name,
                lift_category=c["entry"].lift_category,
                weight_lbs=c["entry"].weight_lbs,
                reps=c["entry"].reps,
                actual_rpe=c["entry"].actual_rpe,
                e1rm=round(c["e1rm"], 1),
                e1rm_method=c["method"],
                program_number=c["program"].program_number,
                program_name=c["program"].program_name,
                week_number=c["session"].week_number,
                day_number=c["session"].day_number,
                trailing_weeks_available=clean_weeks,
                trailing_volume_first_half=first_half,
                trailing_volume_second_half=second_half,
                trailing_slope=slope,
                trailing_reason=reason,
            )
        )


    profile_label, agreement_fraction = aggregate_profile(peak_slopes)
    weeks_logged = len(
        {(v["program_number"], v["week_number"]) for v in volume_series if v["volume"]}
    )
    rpe_coverage = rpe_top_sets / total_top_sets if total_top_sets > 0 else 0.0
    valid_peak_count = sum(
        1 for s in peak_slopes if s in ("rising", "tapered", "steady")
    )

    rpe_tracked = tracks_rpe(db)

    score, subscores = compute_confidence(
        weeks_logged=weeks_logged,
        rpe_coverage=rpe_coverage,
        pattern_agreement=agreement_fraction,
        peak_count=valid_peak_count,
        rpe_tracked=rpe_tracked,
    )

    confidence = VolumeResponseConfidence(
        score=score,
        data_volume_score=subscores["data_volume_score"],
        rpe_coverage_score=subscores["rpe_coverage_score"],
        pattern_consistency_score=subscores["pattern_consistency_score"],
        weeks_logged=weeks_logged,
        rpe_coverage_pct=round(rpe_coverage * 100, 1),
        pattern_agreement_pct=round(agreement_fraction * 100, 1),
        explanation=build_explanation(
            weeks_logged=weeks_logged,
            rpe_coverage_pct=rpe_coverage * 100,
            peak_count=valid_peak_count,
            top_n=top_n,
            profile=profile_label,
            rpe_tracked=rpe_tracked,
        ),
    )

    return VolumeResponseProfile(
        lift_category=lift_category.lower(),
        profile=profile_label,
        profile_label=profile_human_label(profile_label),
        confidence=confidence,
        peaks=response_peaks,
        trailing_weeks_window=trailing_weeks,
        top_n=top_n,
        total_peak_candidates=len(candidates),
    )


@router.get("/volume-response", response_model=VolumeResponseResponse)
def get_volume_response(
    athlete_id: int = Query(..., description="Athlete ID"),
    lift_category: str | None = Query(
        None,
        description="squat/bench/deadlift. Omit for all three lifts.",
    ),
    top_n: int = Query(5, ge=1, le=20, description="Number of top peaks to analyze"),
    trailing_weeks: int = Query(
        6, ge=2, le=12, description="Trailing volume window size in weeks"
    ),
    max_peak_reps: int = Query(
        3, ge=1, le=6, description="Max reps eligible for peak detection (cap at 3 by default)"
    ),
    db: Session = Depends(get_db),
):
    """Volume-response profile analysis for an athlete.

    For each lift, finds the top N estimated 1RM moments across all programs,
    looks at the trailing volume window leading into each, and classifies the
    athlete as a rising/tapered/steady/mixed volume responder with a 0-100
    confidence score. The UI overlays the peak moments on the volume chart
    and displays the profile label with its confidence as a coaching cheat
    sheet.

    Peak eligibility: only sets of 1-max_peak_reps count as peak candidates
    (default cap = 3). Higher-rep sets still show up in the volume series but
    cannot produce a peak. E1RM is computed via the RPE table when actual_rpe
    is present, otherwise via the Epley formula as a fallback.
    """
    athlete = db.query(Athlete).filter(Athlete.id == athlete_id).first()
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")

    lifts = (
        [lift_category.lower()]
        if lift_category
        else ["squat", "bench", "deadlift"]
    )

    profiles = [
        _build_volume_response_profile(
            athlete_id=athlete_id,
            lift_category=lift,
            db=db,
            top_n=top_n,
            trailing_weeks=trailing_weeks,
            max_peak_reps=max_peak_reps,
        )
        for lift in lifts
    ]

    return VolumeResponseResponse(athlete_id=athlete_id, profiles=profiles)


@router.get("/recent-prs", response_model=list[RecentPR])
def get_recent_prs(
    days: int = Query(7, ge=1, le=90, description="Rolling window in days"),
    limit: int = Query(25, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """Roster-wide PRs recorded in the last ``days`` days, most recent first.

    Uses MaxHistory as the source of truth: each row there is a logged
    change to an athlete's max. Require a real prior best — rows with a
    null old_value are first-time baselines, not PRs, and would flood the
    feed for new athletes or new (exercise, reps) lanes. The filter also
    drops downgrades and no-op re-imports.
    """
    from datetime import datetime, timedelta

    cutoff = datetime.utcnow() - timedelta(days=days)
    rows = (
        db.query(MaxHistory, Athlete)
        .join(Athlete, MaxHistory.athlete_id == Athlete.id)
        .filter(Athlete.archived == False)  # noqa: E712
        .filter(MaxHistory.recorded_at >= cutoff)
        .filter(MaxHistory.old_value.is_not(None))
        .filter(MaxHistory.new_value > MaxHistory.old_value)
        .order_by(MaxHistory.recorded_at.desc())
        .limit(limit)
        .all()
    )
    out: list[RecentPR] = []
    for h, a in rows:
        delta = (h.new_value - h.old_value) if h.old_value else None
        out.append(
            RecentPR(
                id=h.id,
                athlete_id=a.id,
                athlete_name=a.name,
                lift=h.lift,
                exercise_name=h.exercise_name,
                weight_lbs=h.new_value,
                prior_best_lbs=h.old_value,
                delta_lbs=delta,
                reps=h.reps,
                recorded_at=h.recorded_at,
            )
        )
    return out


@router.get("/sessions", response_model=SessionsStats)
def get_sessions_stats(
    window: str = Query("week", description="Rolling window: 'week' = 7 days"),
    db: Session = Depends(get_db),
):
    """Roster-wide session counts for the current and prior window.

    Session date is approximated as ``program.date_start + (week_number-1) * 7``
    — we don't store a per-session absolute date, but program start plus
    week-offset is accurate enough for this stat card. Delta is percent
    change vs. the same-sized prior window.
    """
    from datetime import date, timedelta

    window_days = 7 if window == "week" else 30
    today = date.today()
    this_start = today - timedelta(days=window_days)
    last_start = today - timedelta(days=window_days * 2)

    rows = (
        db.query(SessionModel.week_number, SessionModel.day_number, Program.date_start)
        .join(Program, SessionModel.program_id == Program.id)
        .join(Athlete, Program.athlete_id == Athlete.id)
        .filter(Athlete.archived == False)  # noqa: E712
        .filter(Program.date_start.isnot(None))
        .all()
    )

    this_count = 0
    last_count = 0
    for week_number, day_number, date_start in rows:
        try:
            start = date.fromisoformat(str(date_start).strip()[:10])
        except (ValueError, TypeError):
            continue
        session_date = start + timedelta(days=(week_number - 1) * 7 + (day_number - 1))
        if this_start <= session_date <= today:
            this_count += 1
        elif last_start <= session_date < this_start:
            last_count += 1

    delta_pct: float | None = None
    if last_count > 0:
        delta_pct = round(((this_count - last_count) / last_count) * 100, 1)

    return SessionsStats(
        window_days=window_days,
        this_window=this_count,
        last_window=last_count,
        delta_pct=delta_pct,
    )
