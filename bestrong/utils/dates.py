"""Date utility functions for meet scheduling and session timing."""

from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any


def compute_days_out(meet_date_str: str | None) -> int | None:
    """Days until meet date."""
    if not meet_date_str:
        return None
    try:
        meet_dt = date.fromisoformat(meet_date_str)
        today = date.today()
        return (meet_dt - today).days
    except (ValueError, TypeError):
        return None


def compute_weeks_out(meet_date_str: str | None) -> int | None:
    """Weeks until meet date."""
    days = compute_days_out(meet_date_str)
    if days is None:
        return None
    return days // 7


def parse_program_start(date_str: str | None) -> datetime | None:
    """Parse a program's date_start in any of the formats we've historically stored."""
    if not date_str:
        return None
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%m/%d/%y"):
        try:
            return datetime.strptime(date_str.strip(), fmt)
        except ValueError:
            continue
    return None


def session_is_future(program: Any, session: Any, today: datetime | None = None) -> bool:
    """True when a session's calendar date lands strictly after ``today``.

    Used to drop weeks the athlete hasn't reached yet from in-progress
    blocks. Without this filter, peaks / volume / PRs / RPE compliance
    would all surface phantom data left over from the template the coach
    copied as a starting point for the new block.

    Returns ``False`` when ``program.date_start`` isn't parseable — without
    a calendar anchor we can't tell if the session is future, so callers
    should treat it as present (include it).
    """
    start = parse_program_start(program.date_start)
    if start is None:
        return False
    week_offset = max(0, (session.week_number or 1) - 1)
    day_offset = max(0, (session.day_number or 1) - 1)
    session_date = start + timedelta(days=week_offset * 7 + day_offset)
    cutoff = today or datetime.utcnow()
    return session_date.date() > cutoff.date()
