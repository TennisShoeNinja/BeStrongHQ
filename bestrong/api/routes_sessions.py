"""Routes for sessions and exercises."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..models.orm import ExerciseEntry, Session as SessionModel
from .deps import get_db
from .schemas import ExerciseEntryResponse, SessionResponse

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


@router.get("/{session_id}", response_model=SessionResponse)
def get_session(session_id: int, db: Session = Depends(get_db)):
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    ex_count = db.query(ExerciseEntry).filter(ExerciseEntry.session_id == session.id).count()
    resp = SessionResponse.model_validate(session)
    resp.exercise_count = ex_count
    return resp


@router.get("/{session_id}/exercises", response_model=list[ExerciseEntryResponse])
def list_session_exercises(session_id: int, db: Session = Depends(get_db)):
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    exercises = (
        db.query(ExerciseEntry)
        .filter(ExerciseEntry.session_id == session_id)
        .order_by(ExerciseEntry.exercise_order)
        .all()
    )
    return [ExerciseEntryResponse.model_validate(e) for e in exercises]
