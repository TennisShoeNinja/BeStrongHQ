"""Exercise-name canonicalization.

Coaches enter free text in the spreadsheet, so the same lift ends up
spelled several ways — "Paused Squat" vs "Paused Squats", "Tempo Squat"
vs "Tempo Sqaut", "Slow TO Knee" vs "Slow To Knee". The raw names are
preserved on disk (the coach wrote what they wrote), but anywhere we
group by exercise — variation dropdowns, rep-PR lanes, the peak table —
we want these collisions to collapse.

The canonicalizer is intentionally narrow: casing, whitespace, plurals,
and a short dictionary of known typos. No fuzzy matching — that would
risk collapsing genuinely distinct variations ("Paused Deadlift" vs
"Paused Deadlift Very Low") which are different lifts.
"""

from __future__ import annotations

import re


_TYPO_FIXES: dict[str, str] = {
    "sqaut": "squat",
    "sqauts": "squats",
    "deadlfit": "deadlift",
    "deadlfits": "deadlifts",


    "paused": "pause",
}


def _singularize(word: str) -> str:
    """Strip a plural 's' / 'es' from the tail of a single word.

    Intentionally conservative — leaves 'press', 'bench press' alone
    (double-s), handles 'presses' → 'press' via the -sses path, and
    turns 'squats' / 'deadlifts' into 'squat' / 'deadlift'.
    """
    if len(word) < 4:
        return word
    lower = word.lower()

    if lower.endswith(("sses", "shes", "ches", "xes")):
        return word[:-2]

    if lower.endswith("ss"):
        return word
    if lower.endswith("s"):
        return word[:-1]
    return word


_TOKEN_SPLIT = re.compile(r"(\s+)")

# Trailing tempo notation that some coaches append to the exercise
# name in their spreadsheet ("Competition Bench Press 0-1-0",
# "Pause Squat (3-1-0)"). Tempo is metadata about how the rep is
# performed, not a different exercise, so strip it before the
# structural fold so "Competition Bench Press" and
# "Competition Bench Press 0-1-0" collapse to the same lane. Only
# dash-separated triples are recognized; bare space-separated digits
# stay put so a numeric suffix that means something else (set count,
# attempt number) doesn't accidentally vanish.
_TEMPO_SUFFIX = re.compile(
    r"\s*\(?\s*\d+\s*-\s*\d+\s*-\s*\d+\s*\)?\s*$"
)


def canonicalize_exercise_name(name: str | None) -> str:
    """Return a comparable key for an exercise name.

    Returns the empty string for None / empty input. Output is always
    lowercase with collapsed whitespace; tokens are typo-fixed and
    singularized. The result is only meant for grouping / equality —
    never to render back to the coach.
    """
    if not name:
        return ""
    text = name.strip()
    if not text:
        return ""

    text = _TEMPO_SUFFIX.sub("", text).strip()
    if not text:
        return ""

    text = " ".join(text.split())
    tokens = text.split(" ")
    out: list[str] = []
    for token in tokens:
        lower = token.lower()


        core_match = re.match(r"^([A-Za-z]+)(.*)$", token)
        if core_match:
            core, tail = core_match.group(1), core_match.group(2)
            fixed = _TYPO_FIXES.get(core.lower(), core)
            fixed = _singularize(fixed)
            out.append((fixed + tail).lower())
        else:
            out.append(lower)
    return " ".join(out)


def canonicalize_with_aliases(
    name: str | None,
    alias_map: dict[str, str] | None = None,
) -> str:
    """Resolve coach-declared aliases before running the structural fold.

    ``alias_map`` is the instance-wide {alias_name: primary_name} dict built
    from the ``exercise_aliases`` table. When present, the raw name is
    replaced by its primary before the plural/typo/case fold runs — so
    two radically differently-phrased names that the coach has declared
    equivalent collapse into a single key, and the structural pass is
    still applied on top of the primary for consistent casing/plurals.

    Passing ``None`` or an empty alias_map makes this a drop-in
    equivalent to ``canonicalize_exercise_name``.
    """
    if not name:
        return ""
    if alias_map:


        primary = alias_map.get(name)
        if primary is None:
            primary = alias_map.get(canonicalize_exercise_name(name))
        if primary is not None:
            return canonicalize_exercise_name(primary)
    return canonicalize_exercise_name(name)


def load_alias_map(db, athlete_id: int | None = None) -> dict[str, str]:
    """Read the alias table once per request into a lookup dict.

    Keys are both the raw alias spellings AND their canonical form, so
    the caller doesn't have to retry with canonicalization. Values are
    the primary names (raw) as the coach wrote them.

    Merges are hybrid-scoped. Rows with a null ``athlete_id`` apply to
    every athlete; rows with an ``athlete_id`` apply only to that athlete.
    When ``athlete_id`` is passed, the returned map is the instance-wide
    merges overlaid with that athlete's own merges (the athlete-specific
    primary wins on conflict). When it is omitted, only the instance-wide
    merges are returned.
    """

    from sqlalchemy import or_

    from ..models.orm import ExerciseAlias

    q = db.query(
        ExerciseAlias.alias_name,
        ExerciseAlias.primary_name,
        ExerciseAlias.athlete_id,
    )
    if athlete_id is None:
        q = q.filter(ExerciseAlias.athlete_id.is_(None))
    else:
        q = q.filter(
            or_(
                ExerciseAlias.athlete_id.is_(None),
                ExerciseAlias.athlete_id == athlete_id,
            )
        )

    # Apply instance-wide rows first, then athlete-specific rows, so a
    # per-athlete merge overrides an instance-wide one for the same name.
    rows = sorted(q.all(), key=lambda r: r[2] is not None)
    out: dict[str, str] = {}
    for alias_name, primary_name, _scope in rows:
        out[alias_name] = primary_name
        out[canonicalize_exercise_name(alias_name)] = primary_name
    return out


def most_common_raw_name(names: list[str]) -> str:
    """Pick the most-frequent raw spelling from a list.

    Ties break by first occurrence. Used by UI groupers to show one
    representative label per canonical group.
    """
    counts: dict[str, int] = {}
    order: list[str] = []
    for n in names:
        if n not in counts:
            order.append(n)
        counts[n] = counts.get(n, 0) + 1
    if not order:
        return ""
    return max(order, key=lambda n: (counts[n], -order.index(n)))
