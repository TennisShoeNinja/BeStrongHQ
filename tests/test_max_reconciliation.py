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

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from bestrong.models.orm import Athlete, Base, MaxHistory, MeetResult
from bestrong.services.max_tracking import (
    log_max_changes,
    reconcile_competition_maxes,
    recompute_canonical_max,
)


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


def _add_meet(db, athlete, lift, weight, source="opl", made=True):
    db.add(
        MeetResult(
            athlete_id=athlete.id,
            lift=lift,
            attempt_number=1,
            weight_lbs=weight,
            made=made,
            source=source,
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
