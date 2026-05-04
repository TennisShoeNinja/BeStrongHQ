"""HTTP client for OpenPowerlifting.

Two operations:

* ``search_lifters(name)`` returns up to N candidate lifters with enough
  disambiguation context (federation, state, last meet, best total)
  that a coach can pick the right one. The site's
  ``/api/search/rankings/`` only returns an offset, not lifter rows, so
  we hop the search → rankings slice pair until we have enough matches.
* ``fetch_lifter_csv(slug)`` returns every meet result on file for a
  resolved slug. Uses the lifter-csv endpoint rather than scraping the
  rendered profile; the CSV carries best-of-three per lift, equipment,
  tested flag, place, dots — far richer than the rendered table.

OpenPowerlifting publishes meet data under CC0; respectful use is the
unwritten norm. We hit at most a handful of endpoints per coach
interaction (search → confirm → import) so no rate limiter is needed.
"""

from __future__ import annotations

import csv
import io
import logging
from typing import Any
from urllib.parse import quote

import requests

logger = logging.getLogger(__name__)

OPL_BASE = "https://www.openpowerlifting.org"

# Wide-enough to absorb a slow response on the rankings slice without
# stalling the whole import flow. Each call is one HTTP round-trip.
_HTTP_TIMEOUT = 15.0
_USER_AGENT = "BeStrongHQ/1.0 (+https://bestronghq.com)"

# How many rankings rows to fetch per search hop. The site's autocomplete
# scrolls one row at a time; we grab a small window so a search for a
# common first name (e.g. "John") returns more than the single best-DOTS
# match before we run out of hops.
_SLICE_SIZE = 8

# Hard cap on search hops to keep a "nobody by that name" query bounded.
# Each hop is one search call plus one rankings call.
_MAX_HOPS = 6


class OplError(RuntimeError):
    """Raised on any non-recoverable HTTP error from OpenPowerlifting."""


def _http_get(path: str, params: dict[str, Any] | None = None) -> requests.Response:
    url = f"{OPL_BASE}{path}"
    try:
        resp = requests.get(
            url,
            params=params,
            headers={"User-Agent": _USER_AGENT},
            timeout=_HTTP_TIMEOUT,
        )
    except requests.RequestException as e:
        raise OplError(f"Could not reach OpenPowerlifting: {e}") from e
    if resp.status_code >= 500:
        raise OplError(f"OpenPowerlifting returned {resp.status_code} for {path}")
    return resp


# Rankings rows arrive as positional arrays; these indices are the
# stable ones we read. Anything else (rank, rowId, the two unknowns)
# we skip. Indices verified from the production endpoint.
_R_NAME = 2
_R_SLUG = 3
_R_COUNTRY = 6
_R_STATE = 7
_R_FEDERATION = 8
_R_DATE = 9
_R_SEX = 13
_R_EQUIPMENT = 14
_R_AGE_CLASS = 15
_R_DIVISION = 16
_R_BODYWEIGHT_LBS = 17
_R_WEIGHT_CLASS_LBS = 18
_R_SQUAT = 19
_R_BENCH = 20
_R_DEADLIFT = 21
_R_TOTAL = 22
_R_DOTS = 23


def _row_to_candidate(row: list[Any]) -> dict[str, Any] | None:
    if not row or len(row) <= _R_DOTS:
        return None
    slug = row[_R_SLUG]
    name = row[_R_NAME]
    if not slug or not name:
        return None
    return {
        "slug": str(slug),
        "name": str(name),
        "federation": _maybe_str(row[_R_FEDERATION]),
        "country": _maybe_str(row[_R_COUNTRY]),
        "state": _maybe_str(row[_R_STATE]),
        "sex": _maybe_str(row[_R_SEX]),
        "equipment": _maybe_str(row[_R_EQUIPMENT]),
        "age_class": _maybe_str(row[_R_AGE_CLASS]),
        "division": _maybe_str(row[_R_DIVISION]),
        "best_total_lbs": _maybe_float(row[_R_TOTAL]),
        "best_dots": _maybe_float(row[_R_DOTS]),
        "weight_class_lbs": _maybe_str(row[_R_WEIGHT_CLASS_LBS]),
        "last_meet_date": _maybe_str(row[_R_DATE]),
    }


def _maybe_str(v: Any) -> str | None:
    if v is None or v == "":
        return None
    return str(v)


def _maybe_float(v: Any) -> float | None:
    if v is None or v == "":
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def search_lifters(query: str, limit: int = 10) -> list[dict[str, Any]]:
    """Return up to ``limit`` candidate lifters whose display name matches ``query``.

    Loose match: case-insensitive substring in either direction so
    "Brandon" matches "Brandon Lilly" and vice versa. Returns an empty
    list rather than raising on no matches.
    """
    q = (query or "").strip()
    if not q:
        return []

    needle = q.lower()
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    cursor = 0

    for _ in range(_MAX_HOPS):
        try:
            search = _http_get(
                "/api/search/rankings/", params={"q": q, "start": cursor}
            )
        except OplError:
            break
        if search.status_code != 200:
            break
        try:
            data = search.json()
        except ValueError:
            break
        next_index = data.get("next_index")
        if next_index is None or next_index < 0:
            break

        end = next_index + _SLICE_SIZE
        try:
            slice_resp = _http_get(
                "/api/rankings/by-dots",
                params={
                    "start": next_index,
                    "end": end,
                    "lang": "en",
                    "units": "lbs",
                },
            )
        except OplError:
            break
        if slice_resp.status_code != 200:
            break
        try:
            slice_rows = slice_resp.json().get("rows") or []
        except ValueError:
            break

        for row in slice_rows:
            cand = _row_to_candidate(row)
            if not cand:
                continue
            if cand["slug"] in seen:
                continue
            hay = cand["name"].lower()
            if needle not in hay and hay not in needle:
                continue
            seen.add(cand["slug"])
            out.append(cand)
            if len(out) >= limit:
                return out

        cursor = end + 1

    return out


_ATTEMPT_LIFTS = ("squat", "bench", "deadlift")
_ATTEMPT_NUMBERS = (1, 2, 3)
_LBS_PER_KG = 2.2046226218


def _kg_to_lbs(kg: float) -> float:
    return kg * _LBS_PER_KG


def _attempts_for_lift(row: dict[str, str], lift: str) -> list[dict[str, Any]]:
    """Pull the three attempts for one lift from a CSV row.

    OpenPowerlifting encodes a missed attempt as a negative weight and
    a made attempt as a positive weight. An empty cell means the
    attempt wasn't taken (either skipped, or the lifter only competed
    one or two lifts on the day). Returns one dict per attempt that
    was actually taken; skipped attempts are omitted entirely so the
    importer doesn't write zero-weight rows.

    The 4th-attempt column is for record-attempts only and is ignored
    here: the meet_results model is per-attempt 1-3 and adding a 4th
    would mean changing validation everywhere it's consumed.
    """
    csv_prefix = {"squat": "Squat", "bench": "Bench", "deadlift": "Deadlift"}[lift]
    out: list[dict[str, Any]] = []
    for n in _ATTEMPT_NUMBERS:
        raw_kg = _maybe_float(row.get(f"{csv_prefix}{n}Kg"))
        if raw_kg is None or raw_kg == 0:
            continue
        out.append(
            {
                "lift": lift,
                "attempt_number": n,
                "weight_lbs": round(_kg_to_lbs(abs(raw_kg)), 2),
                "made": raw_kg > 0,
            }
        )
    return out


def _row_to_meet(row: dict[str, str]) -> dict[str, Any]:
    """Translate a CSV row into our normalized meet dict.

    OPL uses ``Yes``/``No`` for boolean-like columns, so we convert
    ``Tested`` to a real bool. Per-attempt weights are split into a
    list of attempt dicts under ``attempts`` so the importer can
    write one meet_results row per attempt directly. Best-of-three
    fields are no longer surfaced because the UI derives best from
    the made attempts.
    """
    def s(key: str) -> str | None:
        v = row.get(key)
        if v is None or v == "":
            return None
        return v

    tested_raw = (row.get("Tested") or "").strip().lower()
    tested = True if tested_raw == "yes" else (False if tested_raw == "no" else None)

    meet_name = s("MeetName") or "Unknown meet"

    attempts: list[dict[str, Any]] = []
    for lift in _ATTEMPT_LIFTS:
        attempts.extend(_attempts_for_lift(row, lift))

    return {
        "meet_path": _meet_path(row),
        "meet_name": meet_name,
        "meet_date": s("Date"),
        "federation": s("Federation"),
        "parent_federation": s("ParentFederation"),
        "meet_country": s("MeetCountry"),
        "meet_state": s("MeetState"),
        "event": s("Event"),
        "equipment": s("Equipment"),
        "division": s("Division"),
        "age_class": s("AgeClass"),
        "weight_class_kg": s("WeightClassKg"),
        "bodyweight_kg": _maybe_float(row.get("BodyweightKg")),
        "total_kg": _maybe_float(row.get("TotalKg")),
        "sex": s("Sex"),
        "place": s("Place"),
        "dots": _maybe_float(row.get("Dots")),
        "tested": tested,
        "attempts": attempts,
    }


def _meet_path(row: dict[str, str]) -> str:
    """Stable identifier for one meet within a lifter's history.

    The CSV doesn't include a meet path column, so we synthesize one
    from federation+date+name. Two lifters competing at the same meet
    will produce the same key; collisions are scoped to (athlete, key)
    by the upsert logic, so this is fine.
    """
    parts = [
        (row.get("Federation") or "").strip(),
        (row.get("Date") or "").strip(),
        (row.get("MeetName") or "").strip(),
    ]
    return "|".join(p for p in parts if p) or "unknown"


def fetch_lifter_csv(slug: str) -> list[dict[str, Any]]:
    """Return every meet result on file for the given OpenPowerlifting slug.

    Raises ``OplError`` if the slug is unknown (404) or the endpoint is
    unreachable. Returns an empty list if the lifter exists but has no
    competition rows on file (possible for a brand-new profile).
    """
    if not slug:
        raise OplError("slug is required")

    resp = _http_get(f"/api/liftercsv/{quote(slug, safe='')}")
    if resp.status_code == 404:
        raise OplError(f"OpenPowerlifting profile not found: {slug}")
    if resp.status_code != 200:
        raise OplError(f"OpenPowerlifting returned {resp.status_code} for {slug}")

    text = resp.text
    if not text.strip():
        return []

    reader = csv.DictReader(io.StringIO(text))
    out: list[dict[str, Any]] = []
    for raw in reader:
        try:
            out.append(_row_to_meet(raw))
        except Exception:
            logger.warning("Failed to parse OPL row for %s: %r", slug, raw, exc_info=True)
            continue
    return out
