"""Coach-managed exercise-name merges (instance-wide).

Lets the coach declare "these two raw names are the same exercise" so
PR tracking and variation dropdowns collapse them. See the ExerciseAlias
ORM class for the design rationale.

Endpoints:
- GET    /api/exercise-aliases            — list groups
- POST   /api/exercise-aliases            — add aliases under a primary
- DELETE /api/exercise-aliases/{alias_id} — un-merge a single alias
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..models.orm import ExerciseAlias
from .deps import get_db
from .schemas import (
    CreateExerciseAliasRequest,
    ExerciseAliasEntry,
    ExerciseAliasGroup,
)

router = APIRouter(prefix="/api/exercise-aliases", tags=["exercise-aliases"])


@router.get("", response_model=list[ExerciseAliasGroup])
def list_exercise_aliases(db: Session = Depends(get_db)):
    """Return every merge group, grouped by primary name.

    Groups are returned sorted by primary_name; aliases within each
    group are sorted by their raw spelling so the UI renders
    consistently across loads.
    """
    rows = db.query(ExerciseAlias).order_by(ExerciseAlias.primary_name, ExerciseAlias.alias_name).all()
    grouped: dict[str, list[ExerciseAlias]] = {}
    for row in rows:
        grouped.setdefault(row.primary_name, []).append(row)
    return [
        ExerciseAliasGroup(
            primary_name=primary,
            aliases=[ExerciseAliasEntry.model_validate(a) for a in aliases],
        )
        for primary, aliases in sorted(grouped.items())
    ]


@router.post(
    "",
    response_model=ExerciseAliasGroup,
    status_code=status.HTTP_201_CREATED,
)
def create_exercise_aliases(
    payload: CreateExerciseAliasRequest,
    db: Session = Depends(get_db),
):
    """Add (or extend) a merge group.

    - ``primary_name`` is the display name the coach wants to see.
    - Each entry in ``aliases`` is a raw exercise_name that should fold
      into ``primary_name``.
    - Aliases that already exist under a different primary are moved,
      not duplicated. Aliases equal to the primary_name are no-ops.
    - Rejects an attempt to alias a name that is itself a primary_name
      for other rows — that would create a chain and complicate the
      lookup.
    """
    primary = payload.primary_name.strip()
    if not primary:
        raise HTTPException(status_code=400, detail="primary_name cannot be empty")


    chain_conflicts = (
        db.query(ExerciseAlias.primary_name)
        .filter(ExerciseAlias.primary_name.in_([a.strip() for a in payload.aliases if a.strip()]))
        .distinct()
        .all()
    )
    if chain_conflicts:
        names = sorted({row[0] for row in chain_conflicts})
        raise HTTPException(
            status_code=409,
            detail=(
                "Cannot alias names that are already the primary of another "
                f"merge: {', '.join(names)}. Un-merge those first."
            ),
        )

    for raw in payload.aliases:
        alias = raw.strip()
        if not alias or alias == primary:
            continue
        existing = db.query(ExerciseAlias).filter(ExerciseAlias.alias_name == alias).first()
        if existing:
            existing.primary_name = primary
        else:
            db.add(ExerciseAlias(primary_name=primary, alias_name=alias))
    db.commit()

    rows = (
        db.query(ExerciseAlias)
        .filter(ExerciseAlias.primary_name == primary)
        .order_by(ExerciseAlias.alias_name)
        .all()
    )
    return ExerciseAliasGroup(
        primary_name=primary,
        aliases=[ExerciseAliasEntry.model_validate(r) for r in rows],
    )


@router.delete("/{alias_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_exercise_alias(alias_id: int, db: Session = Depends(get_db)):
    """Remove a single alias row. The primary name / other aliases stay."""
    row = db.query(ExerciseAlias).filter(ExerciseAlias.id == alias_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Alias not found")
    db.delete(row)
    db.commit()
