"""Pydantic response/request schemas for the API."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from ..utils.dates import compute_days_out, compute_weeks_out


class MeetBase(BaseModel):
    name: str
    federation: str | None = None
    meet_date: str | None = None
    meet_date_end: str | None = None
    weeks_out: int | None = None
    days_out: int | None = None
    location: str | None = None
    non_team_athletes: str | None = None
    liftingcast_link: str | None = None

    @field_validator("liftingcast_link", mode="before")
    @classmethod
    def validate_liftingcast_link(cls, v):
        if v is None or v == "":
            return v
        v = str(v).strip()
        if not v.startswith(("https://", "http://")):
            raise ValueError("URL must start with https:// or http://")
        return v

    @model_validator(mode="after")
    def recompute_countdown(self):


        self.weeks_out = compute_weeks_out(self.meet_date)
        self.days_out = compute_days_out(self.meet_date)
        return self


class MeetListResponse(MeetBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    athlete_count: int = 0


class MeetCreate(MeetBase):
    pass


class MeetUpdate(BaseModel):
    name: str | None = None
    federation: str | None = None
    meet_date: str | None = None
    meet_date_end: str | None = None
    location: str | None = None
    non_team_athletes: str | None = None
    liftingcast_link: str | None = None


class MeetResponse(MeetBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    created_at: datetime
    updated_at: datetime
    athlete_count: int = 0
    competing_athletes: list[dict] = []


class AthleteBase(BaseModel):
    name: str
    squat_max_lbs: float | None = None
    bench_max_lbs: float | None = None
    deadlift_max_lbs: float | None = None
    total_lbs: float | None = None
    goal: str | None = None
    next_meet_date: str | None = None
    age: int | None = None
    dob: str | None = None
    division: str | None = None
    weight_class: str | None = None
    program_due: str | None = None
    next_meet_name: str | None = None
    next_meet_id: int | None = None
    meet_date: str | None = None
    weeks_out: int | None = None
    days_out: int | None = None

    availability_status: str | None = None
    out_from: str | None = None
    out_through: str | None = None
    email: str | None = None
    phone: str | None = None
    membership_no: int | None = None
    lifting_db_link: str | None = None
    tags: str | None = None
    reminder_days_before: int | None = 1
    primary_squat_day: int | None = None
    primary_bench_day: int | None = None
    primary_deadlift_day: int | None = None
    sex: str | None = None
    equipment: str | None = None
    goal_bodyweight_lbs: float | None = None
    body_metrics_hidden: bool = False
    archived: bool = False
    portal_disabled: bool = False

    @field_validator("lifting_db_link", mode="before")
    @classmethod
    def validate_lifting_db_link(cls, v):
        if v is None or v == "":
            return v
        v = str(v).strip()
        if not v.startswith(("https://", "http://")):
            raise ValueError("URL must start with https:// or http://")
        return v

    @model_validator(mode="after")
    def recompute_countdown(self):


        self.weeks_out = compute_weeks_out(self.meet_date)
        self.days_out = compute_days_out(self.meet_date)
        return self


def _clear_past_meet_fields(model) -> None:
    """Null out next_meet_* when the cached meet_date has already passed.

    Response-only shaping - lives outside AthleteBase so it doesn't strip
    incoming AthleteCreate payloads (a coach backdating an assignment should
    still reach the DB). Callers invoke this from response-class validators.
    """
    days = compute_days_out(model.meet_date)
    if days is not None and days < 0:
        model.next_meet_id = None
        model.next_meet_name = None
        model.meet_date = None
        model.weeks_out = None
        model.days_out = None


class AthleteCreate(AthleteBase):
    pass


class AthleteUpdate(BaseModel):
    name: str | None = None
    squat_max_lbs: float | None = None
    bench_max_lbs: float | None = None
    deadlift_max_lbs: float | None = None
    total_lbs: float | None = None
    goal: str | None = None
    next_meet_date: str | None = None
    age: int | None = None
    dob: str | None = None
    division: str | None = None
    weight_class: str | None = None
    program_due: str | None = None
    next_meet_name: str | None = None
    next_meet_id: int | None = None
    meet_date: str | None = None
    weeks_out: int | None = None
    days_out: int | None = None
    out_from: str | None = None
    out_through: str | None = None
    email: str | None = None
    phone: str | None = None
    membership_no: int | None = None
    lifting_db_link: str | None = None
    tags: str | None = None
    reminder_days_before: int | None = None
    primary_squat_day: int | None = None
    primary_bench_day: int | None = None
    primary_deadlift_day: int | None = None
    sex: str | None = None
    goal_bodyweight_lbs: float | None = None
    body_metrics_hidden: bool | None = None
    archived: bool | None = None
    portal_disabled: bool | None = None


class PendingMeetResults(BaseModel):
    """A past meet the athlete was assigned to that still needs results logged.

    Surfaced separately from ``next_meet_*`` because the base response nulls
    those fields once the meet date has passed. The profile's "log results"
    banner reads from here instead of guessing from the cleared fields.

    ``meet_date_end`` is included so the Log Meet Results dialog can offer
    a day picker when the meet spans more than one day. Null for single-day
    meets and any meet whose end date isn't recorded.
    """
    meet_id: int | None = None
    meet_name: str | None = None
    meet_date: str | None = None
    meet_date_end: str | None = None


class AthleteResponse(AthleteBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    created_at: datetime
    updated_at: datetime
    program_count: int = 0
    latest_program_name: str | None = None
    latest_program_id: int | None = None
    latest_program_sheet_url: str | None = None
    latest_block_type: str | None = None
    pending_meet_results: PendingMeetResults | None = None
    last_synced_at: datetime | None = None
    portal_last_login_at: datetime | None = None

    @model_validator(mode="after")
    def clear_past_meet(self):
        _clear_past_meet_fields(self)
        return self


class AthleteListResponse(AthleteBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    program_count: int = 0
    latest_program_name: str | None = None
    latest_program_id: int | None = None
    latest_program_sheet_url: str | None = None
    latest_block_type: str | None = None
    latest_bodyweight_lbs: float | None = None
    portal_last_login_at: datetime | None = None

    @model_validator(mode="after")
    def clear_past_meet(self):
        _clear_past_meet_fields(self)
        return self


class MergeRequest(BaseModel):
    """Request body for merging two athletes."""
    keep_name: str | None = None


class MergePreview(BaseModel):
    """Preview of what a merge would produce."""
    primary_id: int
    primary_name: str
    secondary_id: int
    secondary_name: str
    primary_program_count: int
    secondary_program_count: int
    programs_to_transfer: int


class MergeResult(BaseModel):
    """Result of a successful merge."""
    merged_athlete_id: int
    merged_athlete_name: str
    programs_transferred: int
    total_programs: int


class ProgramBase(BaseModel):
    program_number: int | None = None
    program_name: str | None = None
    date_start: str | None = None
    date_end: str | None = None
    block_type: str | None = None


class ProgramResponse(ProgramBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    athlete_id: int
    source_filename: str | None = None
    google_sheet_url: str | None = None
    imported_at: datetime
    session_count: int = 0
    exercise_count: int = 0
    primary_squat_day: int | None = None
    primary_bench_day: int | None = None
    primary_deadlift_day: int | None = None

    @field_validator("google_sheet_url", mode="before")
    @classmethod
    def validate_google_sheet_url(cls, v):
        if v is None or v == "":
            return v
        v = str(v).strip()
        if not v.startswith(("https://", "http://")):
            raise ValueError("URL must start with https:// or http://")
        return v


class ProgramListResponse(ProgramBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    athlete_id: int
    google_sheet_url: str | None = None
    imported_at: datetime

    @field_validator("google_sheet_url", mode="before")
    @classmethod
    def validate_google_sheet_url(cls, v):
        if v is None or v == "":
            return v
        v = str(v).strip()
        if not v.startswith(("https://", "http://")):
            raise ValueError("URL must start with https:// or http://")
        return v
    session_count: int = 0
    primary_squat_day: int | None = None
    primary_bench_day: int | None = None
    primary_deadlift_day: int | None = None


class ProgramPrimaryDaysUpdate(BaseModel):
    primary_squat_day: int | None = None
    primary_bench_day: int | None = None
    primary_deadlift_day: int | None = None


class SessionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    program_id: int
    week_number: int
    day_number: int
    day_name: str
    session_label: str | None = None
    nutrition_rating: str | None = None
    stress_rating: str | None = None
    sleep_rating: str | None = None
    fatigue_rating: str | None = None
    exercise_count: int = 0


class ExerciseEntryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    session_id: int
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
    is_accessory: bool
    failed: bool = False
    notes: str | None = None


class TodayExercise(BaseModel):
    exercise_name: str
    lift_category: str
    sets: int
    reps: int | None = None
    weight_lbs: float | None = None
    target_rpe: str | None = None
    is_accessory: bool


class TodaySessionSummary(BaseModel):
    id: int
    week_number: int
    day_number: int
    day_name: str
    session_label: str | None = None
    status: Literal["not_started", "in_progress", "completed", "unknown"]
    exercises: list[TodayExercise]


class TodaySessionEntry(BaseModel):
    athlete_id: int
    program_id: int
    program_name: str | None = None
    week_number: int
    total_weeks: int
    week_confidence: Literal["logged", "estimated", "unknown"]
    match_mode: Literal["weekday", "next_up"]
    session: TodaySessionSummary | None = None


class WeeklyVolumeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    program_id: int
    week_number: int
    squat_volume: float | None = None
    bench_volume: float | None = None
    deadlift_volume: float | None = None


class VolumeDataPoint(BaseModel):
    """Single data point for volume-over-time charts."""
    week_number: int
    program_number: int | None = None
    program_name: str | None = None
    squat_volume: float | None = None
    bench_volume: float | None = None
    deadlift_volume: float | None = None
    total_volume: float | None = None


class PRRecord(BaseModel):
    """A personal record for a lift."""
    exercise_name: str


    canonical_exercise_name: str
    lift_category: str
    weight_lbs: float
    reps: int | None = None
    sets: int
    volume: float | None = None
    date: str | None = None
    program_number: int | None = None
    week_number: int
    day_number: int


class AthleteAnalytics(BaseModel):
    """Aggregated analytics for an athlete."""
    athlete_id: int
    athlete_name: str
    total_programs: int
    total_sessions: int
    total_exercises: int
    volume_over_time: list[VolumeDataPoint]
    prs: list[PRRecord]


class RecentPR(BaseModel):
    """A single PR event within the last N days, roster-wide."""
    athlete_id: int
    athlete_name: str
    lift: str
    exercise_name: str | None = None
    weight_lbs: float
    prior_best_lbs: float | None = None
    delta_lbs: float | None = None
    reps: int | None = None
    recorded_at: datetime


class SessionsStats(BaseModel):
    """Roster-wide training-session counts for a rolling window."""
    window_days: int
    this_window: int
    last_window: int
    delta_pct: float | None = None


class SearchAthleteHit(BaseModel):
    id: int
    name: str


class SearchMeetHit(BaseModel):
    id: int
    name: str
    meet_date: str | None = None
    federation: str | None = None


class SearchResponse(BaseModel):
    athletes: list[SearchAthleteHit]
    meets: list[SearchMeetHit]


class OutlierReferencePoint(BaseModel):
    """One of the prior e1RM points that built the "average" a flagged
    outlier was scored against.

    Surfaced so the coach can see exactly which rows the detector used -
    every number in the explainer modal should be one click from its
    source cell, so a suspect average can be audited end-to-end.
    """
    exercise_name: str
    weight_lbs: float
    reps: int
    actual_rpe: float | None = None
    e1rm: float
    program_number: int | None = None
    week_number: int
    day_number: int
    day_name: str | None = None
    google_sheet_url: str | None = None


class E1RMDataPoint(BaseModel):
    """Single E1RM data point for trend charts.

    actual_rpe and e1rm are optional: top sets without a logged RPE are still
    returned so "Peak Weight" charts include them, but their computed e1rm
    will be None.

    Extra provenance fields (``day_name``, ``program_id``, ``google_sheet_url``,
    ``e1rm_method``) let the frontend build a "where did this number come
    from?" tooltip and a deep-link to the source spreadsheet. ``is_outlier``,
    ``outlier_reason``, ``outlier_average``, and ``outlier_reference_points``
    are populated when the server-side pass flags the point for review;
    the reference-point list is what the explainer modal renders.
    """
    exercise_name: str


    canonical_exercise_name: str
    lift_category: str
    weight_lbs: float
    reps: int
    actual_rpe: float | None = None
    e1rm: float | None = None
    week_number: int
    day_number: int
    day_name: str | None = None
    program_id: int | None = None
    program_number: int | None = None
    program_name: str | None = None
    google_sheet_url: str | None = None
    e1rm_method: str | None = None
    is_outlier: bool = False
    outlier_reason: str | None = None
    outlier_average: float | None = None
    outlier_reference_points: list[OutlierReferencePoint] = []


class DataQualityIssue(BaseModel):
    """A single plot-eligible top set that deserves coach attention.

    Used for both outliers (flagged by the percent-of-median pass) and
    excluded rows (structurally can't be plotted - missing weight, reps,
    etc.). The shape is intentionally shared so the UI can render them
    in one table with a typed category column.
    """
    category: str
    reason: str
    lift_category: str | None = None
    exercise_name: str | None = None
    weight_lbs: float | None = None
    reps: int | None = None
    actual_rpe: float | None = None
    e1rm: float | None = None
    week_number: int | None = None
    day_number: int | None = None
    day_name: str | None = None
    program_id: int | None = None
    program_number: int | None = None
    program_name: str | None = None
    google_sheet_url: str | None = None


class DataQualityResponse(BaseModel):
    """Per-athlete data-quality summary for the Progression Charts banner.

    ``total_top_sets`` counts every top set on file. ``plotted_top_sets`` is
    the subset that survives the structural exclusions and shows up on
    Peak Weight charts. ``outliers`` and ``excluded`` are the two issue
    lists the review panel renders.
    """
    athlete_id: int
    total_top_sets: int
    plotted_top_sets: int
    outliers: list[DataQualityIssue]
    excluded: list[DataQualityIssue]


class EstimatedMaxForLift(BaseModel):
    """Best estimated 1RM for a lift from RPE-gated training singles, doubles,
    or triples - used to flag when an athlete's declared max may be stale.

    All source-set fields are null when no qualifying set exists (no top set
    at 1-3 reps with an actual RPE logged). ``exceeds_declared`` is True only
    when the estimate is meaningfully above the declared max - the threshold
    is set in the endpoint to avoid nagging on trivial differences.
    """
    lift: str
    declared: float | None = None
    estimated: float | None = None
    weight_lbs: float | None = None
    reps: int | None = None
    actual_rpe: float | None = None
    exercise_name: str | None = None
    program_id: int | None = None
    program_number: int | None = None
    program_name: str | None = None
    week_number: int | None = None
    day_number: int | None = None
    exceeds_declared: bool = False


class VolumeResponsePeak(BaseModel):
    """A single peak e1rm moment with its trailing volume context."""
    exercise_name: str
    lift_category: str
    weight_lbs: float
    reps: int
    actual_rpe: float | None = None
    e1rm: float


    e1rm_method: str
    program_number: int | None = None
    program_name: str | None = None
    week_number: int
    day_number: int

    trailing_weeks_available: int
    trailing_volume_first_half: float | None = None
    trailing_volume_second_half: float | None = None
    trailing_slope: str


    trailing_reason: str | None = None


class VolumeResponseConfidence(BaseModel):
    """Breakdown of the confidence score for a volume-response profile."""
    score: int
    data_volume_score: float
    rpe_coverage_score: float
    pattern_consistency_score: float
    weeks_logged: int
    rpe_coverage_pct: float
    pattern_agreement_pct: float
    explanation: str


class VolumeResponseProfile(BaseModel):
    """Volume-response classification for a single lift."""
    lift_category: str
    profile: str
    profile_label: str
    confidence: VolumeResponseConfidence
    peaks: list[VolumeResponsePeak]
    trailing_weeks_window: int
    top_n: int
    total_peak_candidates: int


class VolumeResponseResponse(BaseModel):
    """Volume-response analysis for an athlete across one or more lifts."""
    athlete_id: int
    profiles: list[VolumeResponseProfile]


class RPEComplianceByLift(BaseModel):
    """RPE compliance stats for a single lift category."""
    lift_category: str
    total_entries: int
    total_prescribed: int
    fill_rate_pct: float
    avg_rpe_diff: float
    overshoot_count: int
    undershoot_count: int
    on_target_count: int


class RPEComplianceByProgram(BaseModel):
    """RPE compliance stats for a single program."""
    program_id: int
    program_number: int | None = None
    program_name: str | None = None
    total_entries: int
    total_prescribed: int
    fill_rate_pct: float
    avg_rpe_diff: float
    overshoot_count: int
    undershoot_count: int
    on_target_count: int


class RPEComplianceResponse(BaseModel):
    """RPE target vs actual comparison for an athlete.

    ``enabled`` is False when the instance has turned off RPE tracking.
    The frontend uses that flag to hide the compliance card entirely
    instead of showing zeroed-out metrics.
    """
    enabled: bool = True
    athlete_id: int
    total_entries: int
    total_prescribed: int
    fill_rate_pct: float
    avg_rpe_diff: float
    overshoot_count: int
    undershoot_count: int
    on_target_count: int
    by_lift: list[RPEComplianceByLift]
    by_program: list[RPEComplianceByProgram]


class WellnessDataPoint(BaseModel):
    """A single day's nutrition and bodyweight data."""
    model_config = ConfigDict(from_attributes=True)
    id: int
    date: str | None = None
    week_number: int | None = None
    day_of_week: str | None = None
    goal_calories: float | None = None
    goal_protein: float | None = None
    goal_carbs: float | None = None
    goal_fat: float | None = None
    actual_calories: float | None = None
    actual_protein: float | None = None
    actual_carbs: float | None = None
    actual_fat: float | None = None
    bodyweight_lbs: float | None = None


class WellnessSummary(BaseModel):
    """Aggregated wellness stats for an athlete."""
    total_entries: int
    entries_with_calories: int
    min_bodyweight: float | None = None
    min_bodyweight_date: str | None = None
    latest_bodyweight: float | None = None
    latest_bodyweight_date: str | None = None
    starting_bodyweight: float | None = None
    starting_bodyweight_date: str | None = None
    starting_bodyweight_program: float | None = None
    starting_bodyweight_program_date: str | None = None
    bodyweight_change: float | None = None
    change_30d: float | None = None
    avg_bw_this_week: float | None = None
    avg_bw_last_week: float | None = None
    avg_actual_calories: float | None = None
    avg_actual_protein: float | None = None
    avg_actual_carbs: float | None = None
    avg_actual_fat: float | None = None
    avg_goal_calories: float | None = None
    calorie_compliance_pct: float | None = None


class WellnessResponse(BaseModel):
    """Full wellness data for an athlete, optionally filtered by program."""
    athlete_id: int
    athlete_name: str
    program_id: int | None = None
    summary: WellnessSummary
    data: list[WellnessDataPoint]


class NotificationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    athlete_id: int
    athlete_name: str = ""
    notification_type: str
    title: str
    message: str | None = None
    due_date: str | None = None
    archived: bool = False
    read: bool = False
    created_at: datetime


class ManualQueueRequest(BaseModel):
    """Request body for manually adding an athlete to the work queue."""
    athlete_id: int
    note: str | None = None


class FixDuplicateDaysResult(BaseModel):
    """Result of fixing duplicate Day 3 sessions."""
    athlete_name: str
    programs_checked: int
    weeks_fixed: int
    sessions_updated: int
    details: list[str]


class MaxHistoryEntry(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    athlete_id: int
    lift: str
    old_value: float | None = None
    new_value: float
    source: str
    note: str | None = None
    recorded_at: datetime


    reps: int | None = None
    exercise_name: str | None = None


class ExerciseAliasEntry(BaseModel):
    """Single alias row - one variant mapped to its primary name."""
    model_config = ConfigDict(from_attributes=True)
    id: int
    primary_name: str
    alias_name: str


class ExerciseAliasGroup(BaseModel):
    """Grouped view of aliases by primary name - the shape the UI wants."""
    primary_name: str


    aliases: list[ExerciseAliasEntry]


class CreateExerciseAliasRequest(BaseModel):
    """Create one or more alias rows under a single primary name.

    Posting the same primary_name multiple times is fine - new aliases
    are appended to the existing group. Aliases that already point at a
    different primary will be moved.
    """
    primary_name: str
    aliases: list[str]


class MeetAttemptInput(BaseModel):
    """A single attempt in a meet-results write payload.

    ``weight_lbs`` is optional so the Log Meet Results modal can post a full
    3×3 attempt grid and have the backend skip blank cells. A missing
    ``made`` defaults to True - coaches typically only bother logging
    attempts they made; misses are opt-in.
    """
    lift: str
    attempt_number: int
    weight_lbs: float | None = None
    made: bool = True
    notes: str | None = None


class MeetResultsWrite(BaseModel):
    """Write payload for the Log Meet Results modal - one call per meet.

    Either ``meet_id`` or the denormalized meet fields (``meet_name`` +
    ``meet_date``) must be provided so the result has identifiable
    provenance.
    """
    athlete_id: int
    meet_id: int | None = None
    meet_name: str | None = None
    meet_date: str | None = None
    federation: str | None = None
    weight_class: str | None = None
    division: str | None = None
    attempts: list[MeetAttemptInput]
    replace_existing: bool = False


class MeetResultEntry(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    athlete_id: int
    meet_id: int | None = None
    meet_name: str | None = None
    meet_date: str | None = None
    federation: str | None = None
    weight_class: str | None = None
    division: str | None = None
    lift: str
    attempt_number: int
    weight_lbs: float
    made: bool
    notes: str | None = None
    bodyweight_kg: float | None = None
    dots_score: float | None = None
    gl_points: float | None = None
    place: str | None = None
    created_at: datetime


class CompetitionMaxForLift(BaseModel):
    """Best made attempt per lift across every meet on record."""
    lift: str
    weight_lbs: float | None = None
    meet_id: int | None = None
    meet_name: str | None = None
    meet_date: str | None = None
    federation: str | None = None
    weight_class: str | None = None


class AthleteReadiness(BaseModel):
    """Readiness info for an athlete at a specific meet."""
    athlete_id: int
    athlete_name: str
    weight_class: str | None = None
    division: str | None = None
    squat_max_lbs: float | None = None
    bench_max_lbs: float | None = None
    deadlift_max_lbs: float | None = None
    total_lbs: float | None = None
    current_program_name: str | None = None
    current_block_type: str | None = None
    program_week: str | None = None
    days_until_meet: int | None = None
    weeks_until_meet: int | None = None


class MeetPrepResponse(BaseModel):
    """Meet prep readiness for all assigned athletes."""
    meet_id: int
    meet_name: str
    meet_date: str | None = None
    athletes: list[AthleteReadiness]


class WorkLogCreate(BaseModel):
    athlete_id: int
    notification_id: int | None = None
    # Duration is bounded so a runaway timer or hand-crafted payload can't
    # corrupt dashboard totals. 24h is a generous ceiling for any single
    # work-queue session.
    duration_seconds: int = Field(ge=0, le=86_400)
    # Restrict to known actions so the dashboard summaries don't have to
    # treat unknown strings as a fallback. Add new values here as the
    # frontend adds buttons.
    action: Literal["complete", "skip", "snooze"] = "complete"
    note: str | None = None


class WorkLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    athlete_id: int
    athlete_name: str = ""
    notification_id: int | None = None
    duration_seconds: int
    action: str
    note: str | None = None
    created_at: datetime


class WorkLogStats(BaseModel):
    total_entries: int
    total_seconds: int
    avg_seconds_per_entry: float
    by_athlete: list[dict]
    by_week: list[dict]
    by_month: list[dict]
