"""Parser adapters for different spreadsheet formats.

Each adapter knows how to detect and parse a specific spreadsheet layout.
The registry auto-discovers adapters and selects the right one for a given
workbook. The default adapter shipped with this package (``bestrong_parser``)
is imported unconditionally and handles the bundled templates; additional
adapters dropped into this directory are picked up automatically.
"""

from __future__ import annotations

import importlib
import pkgutil
from abc import ABC, abstractmethod
from dataclasses import dataclass, field

import openpyxl


@dataclass
class AthleteInfo:
    name: str
    squat_max_lbs: float | None = None
    bench_max_lbs: float | None = None
    deadlift_max_lbs: float | None = None
    total_lbs: float | None = None
    goal: str | None = None
    next_meet_date: str | None = None


@dataclass
class SessionInfo:
    week_number: int
    day_number: int
    day_name: str
    session_label: str | None = None
    nutrition_rating: str | None = None
    stress_rating: str | None = None
    sleep_rating: str | None = None
    fatigue_rating: str | None = None


@dataclass
class ExerciseRow:
    exercise_name: str
    exercise_order: int
    exercise_group: int
    set_type: str
    lift_category: str
    sets: int
    reps: int | None = None
    weight_lbs: float | None = None
    target_rpe: str | None = None
    actual_rpe: float | None = None
    volume: float | None = None
    is_accessory: bool = False
    failed: bool = False
    notes: str | None = None

    weight_expected: bool = False
    rpe_expected: bool = False
    rpe_needs_review: bool = False
    rpe_raw_value: str | None = None


@dataclass
class SessionData:
    info: SessionInfo
    exercises: list[ExerciseRow] = field(default_factory=list)


@dataclass
class WellnessEntry:
    """A single day's nutrition and bodyweight data from the HomePage tab."""
    week_number: int
    day_of_week: str
    goal_calories: float | None = None
    goal_protein: float | None = None
    goal_carbs: float | None = None
    goal_fat: float | None = None
    actual_calories: float | None = None
    actual_protein: float | None = None
    actual_carbs: float | None = None
    actual_fat: float | None = None
    bodyweight_lbs: float | None = None


@dataclass
class ProgramData:
    """Complete parsed output from an adapter."""
    athlete: AthleteInfo
    program_name: str | None = None
    program_number: int | None = None
    date_start: str | None = None
    date_end: str | None = None
    block_type: str | None = None
    sessions: list[SessionData] = field(default_factory=list)
    weekly_volume: dict[int, dict[str, float | None]] = field(default_factory=dict)
    daily_wellness: list[WellnessEntry] = field(default_factory=list)


    primary_squat_day: int | None = None
    primary_bench_day: int | None = None
    primary_deadlift_day: int | None = None


_registry: list[type[BaseAdapter]] = []


class BaseAdapter(ABC):
    """Base class for spreadsheet format adapters."""

    name: str = "base"
    description: str = "Base adapter"

    @staticmethod
    @abstractmethod
    def can_parse(workbook: openpyxl.Workbook) -> bool:
        """Return True if this adapter can handle the given workbook."""
        ...

    @abstractmethod
    def extract(self, workbook: openpyxl.Workbook, filename: str = "") -> ProgramData:
        """Parse the workbook and return structured program data."""
        ...


def register(cls: type[BaseAdapter]) -> type[BaseAdapter]:
    """Decorator to register an adapter class."""
    _registry.append(cls)
    return cls


def find_adapter(workbook: openpyxl.Workbook) -> BaseAdapter | None:
    """Find the first adapter that can parse the given workbook."""
    for adapter_cls in _registry:
        if adapter_cls.can_parse(workbook):
            return adapter_cls()
    return None


def find_adapter_by_id(parser_id: str) -> BaseAdapter | None:
    """Find a registered adapter whose ``name`` equals ``parser_id``.

    Used when the import pipeline has a configured parser_id. Returns
    ``None`` when no adapter with that name has been registered — the
    caller surfaces that as a clear error rather than falling back to
    ``find_adapter``, since a missing named adapter is an installation
    problem, not a classification problem.
    """
    for adapter_cls in _registry:
        if adapter_cls.name == parser_id:
            return adapter_cls()
    return None


def has_adapter(parser_id: str | None) -> bool:
    """Return True when an adapter named ``parser_id`` is registered.

    ``None`` short-circuits to True so callers without a configured
    parser_id take the parse-on-import path that auto-detects via
    ``can_parse``. When a parser_id is configured but no adapter with
    that name exists, the GDrive sync layer uses False to switch to
    download-only staging until the adapter is built.

    Defensively triggers adapter discovery before inspecting the
    registry — callers (sync layer, CLI) shouldn't have to remember to
    import ``bestrong.parser.pipeline`` first to populate it.
    """
    if parser_id is None:
        return True
    load_overlay_adapters()
    importlib.import_module("bestrong.parser.adapters.bestrong_parser")
    return any(cls.name == parser_id for cls in _registry)


def get_registry() -> list[type[BaseAdapter]]:
    """Return all registered adapters."""
    return list(_registry)


_overlay_loaded = False


def load_overlay_adapters(package_name: str = "bestrong_cloud.parser.adapters") -> int:
    """Import every adapter module in an optional sibling package, if present.

    Returns the number of modules imported. Idempotent — repeat calls are
    no-ops after the first successful run. A missing package is treated
    as zero modules and is the supported default configuration.
    """
    global _overlay_loaded
    if _overlay_loaded:
        return 0
    try:
        pkg = importlib.import_module(package_name)
    except ModuleNotFoundError:
        _overlay_loaded = True
        return 0

    count = 0
    for module_info in pkgutil.iter_modules(pkg.__path__):
        if module_info.name.startswith("_"):
            continue
        importlib.import_module(f"{package_name}.{module_info.name}")
        count += 1

    _overlay_loaded = True
    return count
