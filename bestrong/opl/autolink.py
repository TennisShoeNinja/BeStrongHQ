"""OpenPowerlifting auto-link sweep."""

from __future__ import annotations

import time
from typing import Any

from sqlalchemy.orm import Session

from ..models.orm import Athlete, OplLink
from .client import OplError, search_lifters


def _candidate_athletes(db: Session) -> list[Athlete]:
    return (
        db.query(Athlete)
        .outerjoin(OplLink, OplLink.athlete_id == Athlete.id)
        .filter(Athlete.archived == 0)
        .filter(Athlete.opl_not_applicable == 0)
        .filter(OplLink.id.is_(None))
        .order_by(Athlete.name)
        .all()
    )


def run_opl_autolink(db: Session, sleep_seconds: float = 0.5) -> dict[str, list[dict[str, Any]]]:
    """Search and link athletes with exactly one OpenPowerlifting candidate."""
    from ..api.routes_opl import _perform_link

    summary: dict[str, list[dict[str, Any]]] = {
        "linked": [],
        "needs_review": [],
        "no_match": [],
    }
    athletes = _candidate_athletes(db)

    for index, athlete in enumerate(athletes):
        try:
            candidates = search_lifters(athlete.name)
            if len(candidates) == 1:
                candidate = candidates[0]
                slug = candidate["slug"]

                imported_attempts = _perform_link(
                    db,
                    athlete,
                    slug,
                    display_name=candidate.get("name"),
                )
                db.commit()
                summary["linked"].append(
                    {
                        "athlete_id": athlete.id,
                        "name": athlete.name,
                        "slug": slug,
                        "imported_attempts": imported_attempts,
                    }
                )
            elif len(candidates) > 1:
                summary["needs_review"].append(
                    {
                        "athlete_id": athlete.id,
                        "name": athlete.name,
                        "candidates": candidates,
                    }
                )
            else:
                summary["no_match"].append(
                    {"athlete_id": athlete.id, "name": athlete.name}
                )
        except OplError:
            db.rollback()
            summary["no_match"].append(
                {"athlete_id": athlete.id, "name": athlete.name}
            )

        if index < len(athletes) - 1:
            time.sleep(sleep_seconds)

    return summary
