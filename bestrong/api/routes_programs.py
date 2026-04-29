"""CRUD routes for programs."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..models.orm import ExerciseEntry, Program, Session as SessionModel, WeeklyVolume
from .deps import get_db
from .schemas import ProgramListResponse, ProgramPrimaryDaysUpdate, ProgramResponse, SessionResponse, WeeklyVolumeResponse

router = APIRouter(prefix="/api/programs", tags=["programs"])


_JUNK_FILENAME_PATTERNS = [
    "copy of",
    "deleteeee",
    "delete ",
]


_TMP_FILENAME_RE = r"^tmp[^/\\]*\.xlsx$"


def _is_junk_filename(filename: str | None) -> bool:
    """Return True if this filename marks the program as a duplicate or junk."""
    if not filename:
        return False
    lower = filename.lower()
    import re
    if re.match(_TMP_FILENAME_RE, lower):
        return True
    return any(pat in lower for pat in _JUNK_FILENAME_PATTERNS)


class DeduplicateResult(BaseModel):
    """Summary of a deduplication run."""
    deleted_count: int
    kept_count: int
    details: list[dict]


@router.post("/deduplicate", response_model=DeduplicateResult)
def deduplicate_programs(db: Session = Depends(get_db)):
    """Remove duplicate and junk program records.

    Two categories are cleaned up:

    1. **Junk filenames** — programs whose source_filename contains "Copy of",
       "DELETEEEE", or looks like a tmp upload artefact (``tmp*.xlsx``).
       These are deleted unconditionally regardless of program_number.

    2. **Duplicate program numbers** — when the same (athlete_id, program_number)
       appears more than once and program_number is not NULL, only the copy with
       the most session data is kept. Ties are broken by keeping the lowest ID
       (first import).

    All associated sessions, exercise entries, and weekly_volume rows are
    cascade-deleted with the program. GDriveImport history rows have their
    program_id cleared but the import audit trail is preserved.
    """
    deleted: list[dict] = []
    kept_ids: set[int] = set()


    all_programs = db.query(Program).all()
    for prog in all_programs:
        if _is_junk_filename(prog.source_filename):
            deleted.append({
                "program_id": prog.id,
                "athlete_id": prog.athlete_id,
                "program_number": prog.program_number,
                "reason": "junk_filename",
                "source_filename": prog.source_filename,
            })
            db.delete(prog)
        else:
            kept_ids.add(prog.id)

    db.flush()


    from collections import defaultdict
    groups: dict[tuple[int, int | None], list[Program]] = defaultdict(list)
    surviving = db.query(Program).filter(Program.id.in_(kept_ids)).all()
    for prog in surviving:


        if prog.program_number is not None:
            groups[(prog.athlete_id, prog.program_number)].append(prog)

    for (athlete_id, prog_num), group in groups.items():
        if len(group) <= 1:
            continue


        def _session_count(p: Program) -> int:
            return db.query(SessionModel).filter(SessionModel.program_id == p.id).count()

        sorted_group = sorted(group, key=lambda p: (_session_count(p), -p.id), reverse=True)
        winner = sorted_group[0]

        for loser in sorted_group[1:]:
            deleted.append({
                "program_id": loser.id,
                "athlete_id": loser.athlete_id,
                "program_number": loser.program_number,
                "reason": "duplicate_program_number",
                "source_filename": loser.source_filename,
                "kept_program_id": winner.id,
            })
            db.delete(loser)

    db.commit()

    return DeduplicateResult(
        deleted_count=len(deleted),
        kept_count=db.query(Program).count(),
        details=deleted,
    )


@router.get("", response_model=list[ProgramListResponse])
def list_programs(
    athlete_id: int | None = Query(None, description="Filter by athlete"),
    db: Session = Depends(get_db),
):
    q = db.query(Program)
    if athlete_id is not None:
        q = q.filter(Program.athlete_id == athlete_id)
    programs = q.order_by(Program.imported_at.desc()).all()

    results = []
    for p in programs:
        sess_count = db.query(SessionModel).filter(SessionModel.program_id == p.id).count()
        item = ProgramListResponse.model_validate(p)
        item.session_count = sess_count
        results.append(item)
    return results


@router.get("/{program_id}", response_model=ProgramResponse)
def get_program(program_id: int, db: Session = Depends(get_db)):
    program = db.query(Program).filter(Program.id == program_id).first()
    if not program:
        raise HTTPException(status_code=404, detail="Program not found")

    sess_count = db.query(SessionModel).filter(SessionModel.program_id == program.id).count()
    ex_count = (
        db.query(ExerciseEntry)
        .join(SessionModel)
        .filter(SessionModel.program_id == program.id)
        .count()
    )

    resp = ProgramResponse.model_validate(program)
    resp.session_count = sess_count
    resp.exercise_count = ex_count
    return resp


@router.get("/{program_id}/sessions", response_model=list[SessionResponse])
def list_program_sessions(
    program_id: int,
    week: int | None = Query(None, description="Filter by week number"),
    db: Session = Depends(get_db),
):
    program = db.query(Program).filter(Program.id == program_id).first()
    if not program:
        raise HTTPException(status_code=404, detail="Program not found")

    q = db.query(SessionModel).filter(SessionModel.program_id == program_id)
    if week is not None:
        q = q.filter(SessionModel.week_number == week)
    sessions = q.order_by(SessionModel.week_number, SessionModel.day_number).all()

    results = []
    for s in sessions:
        ex_count = db.query(ExerciseEntry).filter(ExerciseEntry.session_id == s.id).count()
        item = SessionResponse.model_validate(s)
        item.exercise_count = ex_count
        results.append(item)
    return results


@router.get("/{program_id}/volume", response_model=list[WeeklyVolumeResponse])
def get_program_volume(program_id: int, db: Session = Depends(get_db)):
    program = db.query(Program).filter(Program.id == program_id).first()
    if not program:
        raise HTTPException(status_code=404, detail="Program not found")

    volumes = (
        db.query(WeeklyVolume)
        .filter(WeeklyVolume.program_id == program_id)
        .order_by(WeeklyVolume.week_number)
        .all()
    )
    return [WeeklyVolumeResponse.model_validate(v) for v in volumes]


@router.put("/{program_id}/primary-days", response_model=ProgramResponse)
def update_primary_days(
    program_id: int,
    body: ProgramPrimaryDaysUpdate,
    db: Session = Depends(get_db),
):
    """Set primary lift days for a specific program.

    Each field maps a lift to the day number that's the primary day for that lift
    in this program. For example, primary_squat_day=1 means Day 1 is the primary
    squat day. Set to null to clear (falls back to athlete-level default).
    """
    program = db.query(Program).filter(Program.id == program_id).first()
    if not program:
        raise HTTPException(status_code=404, detail="Program not found")

    program.primary_squat_day = body.primary_squat_day
    program.primary_bench_day = body.primary_bench_day
    program.primary_deadlift_day = body.primary_deadlift_day
    db.commit()
    db.refresh(program)

    sess_count = db.query(SessionModel).filter(SessionModel.program_id == program.id).count()
    ex_count = (
        db.query(ExerciseEntry)
        .join(SessionModel)
        .filter(SessionModel.program_id == program.id)
        .count()
    )

    resp = ProgramResponse.model_validate(program)
    resp.session_count = sess_count
    resp.exercise_count = ex_count
    return resp


@router.delete("/{program_id}", status_code=204)
def delete_program(program_id: int, db: Session = Depends(get_db)):
    program = db.query(Program).filter(Program.id == program_id).first()
    if not program:
        raise HTTPException(status_code=404, detail="Program not found")
    db.delete(program)
    db.commit()
