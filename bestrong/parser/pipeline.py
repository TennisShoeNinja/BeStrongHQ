"""Main parser pipeline.

Usage:
    from bestrong.parser.pipeline import parse_file
    program = parse_file("path/to/program.xlsx")
"""

from __future__ import annotations

from pathlib import Path

import openpyxl

from .adapters import ProgramData, find_adapter, find_adapter_by_id, load_overlay_adapters


load_overlay_adapters()


from .adapters import bestrong_parser as _  # noqa: F401, E402


class ParseError(Exception):
    """Raised when a file cannot be parsed."""


def parse_file(path: str | Path, parser_id: str | None = None) -> ProgramData:
    """Parse a training program spreadsheet and return structured data.

    Args:
        path: Path to the .xlsx file.
        parser_id: When supplied, the adapter with this registered ``name`` is
            used directly and ``can_parse`` is bypassed. If no adapter with
            that name is registered, raises ``ParseError`` instead of falling
            back to auto-detection — the absence of a named adapter for a
            instance configured to use it is an installation problem, not a
            classification problem. When ``None`` (local dev / standalone
            calls), auto-detection runs as before.

    Returns:
        ProgramData with all extracted athlete, session, and exercise information.

    Raises:
        ParseError: If the file cannot be opened, the named parser_id is not
            registered, or no adapter matches via auto-detection.
        FileNotFoundError: If the file doesn't exist.
    """
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"File not found: {path}")

    if not path.suffix.lower() == ".xlsx":
        raise ParseError(f"Unsupported file type: {path.suffix} (expected .xlsx)")

    try:
        wb = openpyxl.load_workbook(path, data_only=True)
    except Exception as e:
        raise ParseError(f"Failed to open workbook: {e}") from e

    if parser_id is not None:
        adapter = find_adapter_by_id(parser_id)
        if adapter is None:
            raise ParseError(
                f"No adapter registered for parser_id={parser_id!r}. "
                f"This instance is configured to use a custom parser that "
                f"is not installed in the current build."
            )
        return adapter.extract(wb, filename=path.name)

    adapter = find_adapter(wb)
    if adapter is None:
        sheets = ", ".join(wb.sheetnames)
        raise ParseError(
            f"No adapter found for this spreadsheet format. "
            f"Sheets: [{sheets}]. "
            f"Ensure the workbook matches a supported template."
        )

    return adapter.extract(wb, filename=path.name)


def parse_file_preview(path: str | Path, parser_id: str | None = None) -> dict:
    """Parse a file and return a summary preview (for import confirmation UI).

    Args:
        path: Path to the .xlsx file.
        parser_id: When supplied, pins the named adapter exactly as in
            ``parse_file``. Use this to bind a preview to a specific adapter
            (e.g. tests that exercise the bundled template should pass
            ``parser_id="bestrong"``) so the result is independent of which
            other adapters happen to be registered.

    Returns a dict with athlete name, maxes, session count, exercise names, etc.
    """
    program = parse_file(path, parser_id=parser_id)

    exercise_names = set()
    for session in program.sessions:
        for ex in session.exercises:
            exercise_names.add(ex.exercise_name)

    return {
        "athlete_name": program.athlete.name,
        "squat_max": program.athlete.squat_max_lbs,
        "bench_max": program.athlete.bench_max_lbs,
        "deadlift_max": program.athlete.deadlift_max_lbs,
        "total": program.athlete.total_lbs,
        "program_name": program.program_name,
        "program_number": program.program_number,
        "block_type": program.block_type,
        "date_start": program.date_start,
        "date_end": program.date_end,
        "session_count": len(program.sessions),
        "exercise_count": len(exercise_names),
        "exercise_names": sorted(exercise_names),
        "weeks": sorted(set(s.info.week_number for s in program.sessions)),
        "weekly_volume": program.weekly_volume,
    }
