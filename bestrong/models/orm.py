"""SQLAlchemy ORM models for the training database."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class Meet(Base):
    __tablename__ = "meets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(300), nullable=False)
    federation: Mapped[str | None] = mapped_column(String(50), nullable=True)
    meet_date: Mapped[str | None] = mapped_column(String(20), nullable=True)
    meet_date_end: Mapped[str | None] = mapped_column(String(20), nullable=True)
    weeks_out: Mapped[int | None] = mapped_column(Integer, nullable=True)
    days_out: Mapped[int | None] = mapped_column(Integer, nullable=True)
    location: Mapped[str | None] = mapped_column(Text, nullable=True)
    non_team_athletes: Mapped[str | None] = mapped_column(Text, nullable=True)
    liftingcast_link: Mapped[str | None] = mapped_column(String(500), nullable=True)
    notion_page_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    def __repr__(self) -> str:
        return f"<Meet(id={self.id}, name='{self.name}')>"


class Notification(Base):
    """Inbox notifications (program due reminders, etc.)."""

    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    athlete_id: Mapped[int] = mapped_column(Integer, ForeignKey("athletes.id"), nullable=False)
    notification_type: Mapped[str] = mapped_column(String(50), nullable=False, default="program_due")
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    due_date: Mapped[str | None] = mapped_column(String(20), nullable=True)
    archived: Mapped[bool] = mapped_column(Integer, server_default="0", nullable=False)
    read: Mapped[bool] = mapped_column(Integer, server_default="0", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    athlete: Mapped[Athlete] = relationship("Athlete", back_populates="notifications")

    def __repr__(self) -> str:
        return f"<Notification(id={self.id}, athlete={self.athlete_id}, type={self.notification_type})>"


class Athlete(Base):
    __tablename__ = "athletes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False, unique=True)
    squat_max_lbs: Mapped[float | None] = mapped_column(Float, nullable=True)
    bench_max_lbs: Mapped[float | None] = mapped_column(Float, nullable=True)
    deadlift_max_lbs: Mapped[float | None] = mapped_column(Float, nullable=True)
    total_lbs: Mapped[float | None] = mapped_column(Float, nullable=True)
    goal: Mapped[str | None] = mapped_column(Text, nullable=True)
    next_meet_date: Mapped[str | None] = mapped_column(String(50), nullable=True)
    age: Mapped[int | None] = mapped_column(Integer, nullable=True)
    dob: Mapped[str | None] = mapped_column(String(20), nullable=True)
    division: Mapped[str | None] = mapped_column(String(100), nullable=True)
    weight_class: Mapped[str | None] = mapped_column(String(50), nullable=True)
    program_due: Mapped[str | None] = mapped_column(String(50), nullable=True)
    next_meet_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    next_meet_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("meets.id"), nullable=True)
    meet_date: Mapped[str | None] = mapped_column(String(100), nullable=True)
    weeks_out: Mapped[int | None] = mapped_column(Integer, nullable=True)
    days_out: Mapped[int | None] = mapped_column(Integer, nullable=True)
    availability_status: Mapped[str | None] = mapped_column(String(50), nullable=True)
    out_from: Mapped[str | None] = mapped_column(String(20), nullable=True)
    out_through: Mapped[str | None] = mapped_column(String(20), nullable=True)
    status: Mapped[str | None] = mapped_column(String(100), nullable=True)
    email: Mapped[str | None] = mapped_column(String(200), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    membership_no: Mapped[int | None] = mapped_column(Integer, nullable=True)
    lifting_db_link: Mapped[str | None] = mapped_column(String(500), nullable=True)
    tags: Mapped[str | None] = mapped_column(String(500), nullable=True)
    notion_page_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    price: Mapped[float | None] = mapped_column(Float, nullable=True)
    product_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    billing_customer_id: Mapped[str | None] = mapped_column(String(200), nullable=True)
    last_payment_date: Mapped[str | None] = mapped_column(String(20), nullable=True)
    reminder_days_before: Mapped[int | None] = mapped_column(Integer, nullable=True, default=1)
    primary_squat_day: Mapped[int | None] = mapped_column(Integer, nullable=True)
    primary_bench_day: Mapped[int | None] = mapped_column(Integer, nullable=True)
    primary_deadlift_day: Mapped[int | None] = mapped_column(Integer, nullable=True)


    sex: Mapped[str | None] = mapped_column(String(10), nullable=True)


    equipment: Mapped[str | None] = mapped_column(String(50), nullable=True)
    goal_bodyweight_lbs: Mapped[float | None] = mapped_column(Float, nullable=True)
    body_metrics_hidden: Mapped[bool] = mapped_column(Integer, server_default="0", nullable=False)
    archived: Mapped[bool] = mapped_column(Integer, server_default="0", nullable=False)


    portal_last_login_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    portal_disabled: Mapped[bool] = mapped_column(Integer, server_default="0", nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    programs: Mapped[list[Program]] = relationship("Program", back_populates="athlete", cascade="all, delete-orphan")
    notifications: Mapped[list[Notification]] = relationship("Notification", back_populates="athlete", cascade="all, delete-orphan")
    max_history: Mapped[list[MaxHistory]] = relationship("MaxHistory", back_populates="athlete", cascade="all, delete-orphan")
    work_logs: Mapped[list[WorkLog]] = relationship("WorkLog", back_populates="athlete", cascade="all, delete-orphan")
    daily_wellness: Mapped[list[DailyWellness]] = relationship("DailyWellness", back_populates="athlete", cascade="all, delete-orphan")
    meet_results: Mapped[list[MeetResult]] = relationship("MeetResult", back_populates="athlete", cascade="all, delete-orphan")
    next_meet: Mapped[Meet | None] = relationship("Meet", foreign_keys=[next_meet_id])

    def __repr__(self) -> str:
        return f"<Athlete(id={self.id}, name='{self.name}')>"


class Program(Base):
    __tablename__ = "programs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    athlete_id: Mapped[int] = mapped_column(Integer, ForeignKey("athletes.id"), nullable=False)
    program_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    program_name: Mapped[str | None] = mapped_column(String(300), nullable=True)
    date_start: Mapped[str | None] = mapped_column(String(20), nullable=True)
    date_end: Mapped[str | None] = mapped_column(String(20), nullable=True)
    block_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    source_filename: Mapped[str | None] = mapped_column(String(500), nullable=True)
    google_sheet_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    imported_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    primary_squat_day: Mapped[int | None] = mapped_column(Integer, nullable=True)
    primary_bench_day: Mapped[int | None] = mapped_column(Integer, nullable=True)
    primary_deadlift_day: Mapped[int | None] = mapped_column(Integer, nullable=True)

    athlete: Mapped[Athlete] = relationship("Athlete", back_populates="programs")
    sessions: Mapped[list[Session]] = relationship("Session", back_populates="program", cascade="all, delete-orphan")
    weekly_volumes: Mapped[list[WeeklyVolume]] = relationship("WeeklyVolume", back_populates="program", cascade="all, delete-orphan")
    daily_wellness: Mapped[list[DailyWellness]] = relationship("DailyWellness", back_populates="program", cascade="all, delete-orphan")


    gdrive_imports: Mapped[list[GDriveImport]] = relationship(
        "GDriveImport", back_populates="program", cascade="save-update, merge"
    )

    def __repr__(self) -> str:
        return f"<Program(id={self.id}, name='{self.program_name}')>"


class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    program_id: Mapped[int] = mapped_column(Integer, ForeignKey("programs.id"), nullable=False)
    week_number: Mapped[int] = mapped_column(Integer, nullable=False)
    day_number: Mapped[int] = mapped_column(Integer, nullable=False)
    day_name: Mapped[str] = mapped_column(String(20), nullable=False)
    session_label: Mapped[str | None] = mapped_column(String(200), nullable=True)
    nutrition_rating: Mapped[str | None] = mapped_column(String(50), nullable=True)
    stress_rating: Mapped[str | None] = mapped_column(String(50), nullable=True)
    sleep_rating: Mapped[str | None] = mapped_column(String(50), nullable=True)
    fatigue_rating: Mapped[str | None] = mapped_column(String(50), nullable=True)

    program: Mapped[Program] = relationship("Program", back_populates="sessions")
    exercises: Mapped[list[ExerciseEntry]] = relationship("ExerciseEntry", back_populates="session", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<Session(week={self.week_number}, day={self.day_number}, {self.day_name})>"


class ExerciseEntry(Base):
    __tablename__ = "exercise_entries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[int] = mapped_column(Integer, ForeignKey("sessions.id"), nullable=False)
    exercise_name: Mapped[str] = mapped_column(String(300), nullable=False)
    exercise_order: Mapped[int] = mapped_column(Integer, nullable=False)
    exercise_group: Mapped[int] = mapped_column(Integer, nullable=False)
    set_type: Mapped[str] = mapped_column(String(20), nullable=False)
    lift_category: Mapped[str] = mapped_column(String(20), nullable=False)
    sets: Mapped[int] = mapped_column(Integer, nullable=False)
    reps: Mapped[int | None] = mapped_column(Integer, nullable=True)
    weight_lbs: Mapped[float | None] = mapped_column(Float, nullable=True)
    target_rpe: Mapped[str | None] = mapped_column(String(30), nullable=True)
    actual_rpe: Mapped[float | None] = mapped_column(Float, nullable=True)
    volume: Mapped[float | None] = mapped_column(Float, nullable=True)
    is_accessory: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    failed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)


    weight_expected: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="0")
    rpe_expected: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="0")


    rpe_needs_review: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="0")
    rpe_raw_value: Mapped[str | None] = mapped_column(String(100), nullable=True)

    session: Mapped[Session] = relationship("Session", back_populates="exercises")

    def __repr__(self) -> str:
        return f"<ExerciseEntry({self.exercise_name}, {self.sets}×{self.reps}@{self.weight_lbs})>"


class WeeklyVolume(Base):
    __tablename__ = "weekly_volume"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    program_id: Mapped[int] = mapped_column(Integer, ForeignKey("programs.id"), nullable=False)
    week_number: Mapped[int] = mapped_column(Integer, nullable=False)
    squat_volume: Mapped[float | None] = mapped_column(Float, nullable=True)
    bench_volume: Mapped[float | None] = mapped_column(Float, nullable=True)
    deadlift_volume: Mapped[float | None] = mapped_column(Float, nullable=True)

    program: Mapped[Program] = relationship("Program", back_populates="weekly_volumes")

    def __repr__(self) -> str:
        return f"<WeeklyVolume(week={self.week_number}, S={self.squat_volume} B={self.bench_volume} D={self.deadlift_volume})>"


class MaxHistory(Base):
    """Tracks changes to athlete max lifts over time."""

    __tablename__ = "max_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    athlete_id: Mapped[int] = mapped_column(Integer, ForeignKey("athletes.id"), nullable=False)
    lift: Mapped[str] = mapped_column(String(20), nullable=False)
    old_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    new_value: Mapped[float] = mapped_column(Float, nullable=False)
    source: Mapped[str] = mapped_column(String(50), nullable=False, default="manual")
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    recorded_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


    reps: Mapped[int | None] = mapped_column(Integer, nullable=True)
    exercise_name: Mapped[str | None] = mapped_column(String(300), nullable=True)

    athlete: Mapped[Athlete] = relationship("Athlete", back_populates="max_history")

    def __repr__(self) -> str:
        return f"<MaxHistory(athlete={self.athlete_id}, {self.lift}: {self.old_value} -> {self.new_value})>"


class MeetResult(Base):
    """One attempt at a meet — per lift (squat/bench/deadlift) per athlete.

    Each row is a single attempt (1st/2nd/3rd). A full meet produces up to 9
    rows (3 lifts × 3 attempts). Rows are linked to a `Meet` when possible,
    but meet metadata is denormalized onto the row so historical results
    survive intact if the linked Meet is edited, deleted, or never existed
    (e.g., the coach logs an old meet result without creating a Meet row).

    ``competition maxes`` are derived by querying this table for the
    heaviest ``weight_lbs`` per lift where ``made == True``.
    """

    __tablename__ = "meet_results"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    athlete_id: Mapped[int] = mapped_column(Integer, ForeignKey("athletes.id"), nullable=False)
    meet_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("meets.id"), nullable=True)


    meet_name: Mapped[str | None] = mapped_column(String(300), nullable=True)
    meet_date: Mapped[str | None] = mapped_column(String(20), nullable=True)
    federation: Mapped[str | None] = mapped_column(String(50), nullable=True)
    weight_class: Mapped[str | None] = mapped_column(String(50), nullable=True)
    division: Mapped[str | None] = mapped_column(String(100), nullable=True)

    lift: Mapped[str] = mapped_column(String(20), nullable=False)
    attempt_number: Mapped[int] = mapped_column(Integer, nullable=False)
    weight_lbs: Mapped[float] = mapped_column(Float, nullable=False)
    made: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # 'manual' for coach-entered rows (legacy; entry surface removed),
    # 'opl' for rows imported from OpenPowerlifting. Lets refresh and
    # unlink target only the OPL-sourced rows without touching anything
    # the coach typed in. Defaults to 'manual' so any pre-existing row
    # in a self-hosted DB stays correctly tagged after the migration.
    source: Mapped[str] = mapped_column(String(16), nullable=False, server_default="manual")

    # Stable per-meet identifier from OpenPowerlifting (federation+date+name
    # synthesized in the OPL client). Null for non-OPL rows. Lets the
    # importer upsert by (athlete_id, external_meet_path, lift, attempt)
    # so re-syncs don't duplicate rows.
    external_meet_path: Mapped[str | None] = mapped_column(String(300), nullable=True)

    # Per-meet scoring data, denormalized across the 9 attempt rows of one
    # meet (cheap and keeps the one-table model). Set on OPL imports from
    # the CSV (DOTS) plus the IPF GL formula computed at import time. Null
    # for manually entered rows that have no bodyweight on file.
    bodyweight_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    dots_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    gl_points: Mapped[float | None] = mapped_column(Float, nullable=True)
    # Final placing as recorded by the federation (string because OPL uses
    # "1"/"2"/"3" for podium, but also "DQ", "G" for guest, "DD" for did-not-
    # deadlift). UI medal-render only triggers on the numeric podium values.
    place: Mapped[str | None] = mapped_column(String(20), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    athlete: Mapped[Athlete] = relationship("Athlete", back_populates="meet_results")
    meet: Mapped[Meet | None] = relationship("Meet", foreign_keys=[meet_id])

    def __repr__(self) -> str:
        return f"<MeetResult(athlete={self.athlete_id}, {self.lift} #{self.attempt_number}: {self.weight_lbs} {'✓' if self.made else '✗'})>"


class OplLink(Base):
    """At most one row per athlete linked to an OpenPowerlifting profile.

    Source-of-truth for the link itself; meet rows live in OplMeet and are
    refreshed from the OpenPowerlifting public dataset on demand. Imported
    fields stay separate from the coach's own per-attempt entries in
    ``meet_results`` because the OPL feed is summary-level (best of three
    per lift) and would otherwise pollute that table.
    """

    __tablename__ = "opl_links"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    athlete_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("athletes.id"), nullable=False, unique=True
    )
    slug: Mapped[str] = mapped_column(String(200), nullable=False)
    display_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_sync_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    athlete: Mapped[Athlete] = relationship("Athlete", foreign_keys=[athlete_id])

    def __repr__(self) -> str:
        return f"<OplLink(athlete={self.athlete_id}, slug='{self.slug}')>"


class OplMeet(Base):
    """One row per imported OpenPowerlifting meet result for a linked athlete.

    Identity is (athlete_id, meet_path); refresh upserts on the pair so
    rerunning import doesn't double-insert and doesn't lose row ids the
    UI keys off. Weights stored in kg (OPL's canonical unit); the UI
    converts on render to whatever the coach's display unit is.
    """

    __tablename__ = "opl_meets"
    __table_args__ = (
        UniqueConstraint("athlete_id", "meet_path", name="uq_opl_meets_athlete_meet"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    athlete_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("athletes.id"), nullable=False, index=True
    )
    meet_path: Mapped[str] = mapped_column(String(300), nullable=False)
    meet_name: Mapped[str | None] = mapped_column(String(300), nullable=True)
    federation: Mapped[str | None] = mapped_column(String(80), nullable=True)
    parent_federation: Mapped[str | None] = mapped_column(String(80), nullable=True)
    meet_date: Mapped[str | None] = mapped_column(String(20), nullable=True)
    meet_country: Mapped[str | None] = mapped_column(String(80), nullable=True)
    meet_state: Mapped[str | None] = mapped_column(String(80), nullable=True)

    event: Mapped[str | None] = mapped_column(String(20), nullable=True)
    equipment: Mapped[str | None] = mapped_column(String(40), nullable=True)
    division: Mapped[str | None] = mapped_column(String(120), nullable=True)
    age_class: Mapped[str | None] = mapped_column(String(40), nullable=True)
    weight_class_kg: Mapped[str | None] = mapped_column(String(40), nullable=True)
    bodyweight_kg: Mapped[float | None] = mapped_column(Float, nullable=True)

    squat_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    bench_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    deadlift_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    total_kg: Mapped[float | None] = mapped_column(Float, nullable=True)

    place: Mapped[str | None] = mapped_column(String(20), nullable=True)
    dots: Mapped[float | None] = mapped_column(Float, nullable=True)
    tested: Mapped[bool | None] = mapped_column(Boolean, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    athlete: Mapped[Athlete] = relationship("Athlete", foreign_keys=[athlete_id])

    def __repr__(self) -> str:
        return f"<OplMeet(athlete={self.athlete_id}, meet='{self.meet_name}', total={self.total_kg})>"


class WorkLog(Base):
    """Tracks time spent working on athlete programs in the Work Queue."""

    __tablename__ = "work_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    athlete_id: Mapped[int] = mapped_column(Integer, ForeignKey("athletes.id"), nullable=False)
    notification_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    duration_seconds: Mapped[int] = mapped_column(Integer, nullable=False)
    action: Mapped[str] = mapped_column(String(50), nullable=False, default="complete")
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    athlete: Mapped[Athlete] = relationship("Athlete", back_populates="work_logs")

    def __repr__(self) -> str:
        return f"<WorkLog(athlete={self.athlete_id}, duration={self.duration_seconds}s)>"


class Setting(Base):
    """Key-value settings store (coach profile, preferences, etc.)."""

    __tablename__ = "settings"

    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value: Mapped[str | None] = mapped_column(Text, nullable=True)

    def __repr__(self) -> str:
        return f"<Setting(key='{self.key}', value='{self.value}')>"


class AuthSession(Base):
    """Active login sessions (cookie-based)."""

    __tablename__ = "auth_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_token: Mapped[str] = mapped_column(String(200), nullable=False, unique=True)
    email: Mapped[str] = mapped_column(String(200), nullable=False)
    name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    picture: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)

    def __repr__(self) -> str:
        return f"<AuthSession(email='{self.email}')>"


class AthleteSession(Base):
    """Active athlete-side login sessions (cookie-based).

    Parallel to ``AuthSession`` but keyed to an ``Athlete`` row instead of
    an ``AllowedUser`` (coach) row. Lets athletes log in to view their own
    profile, program, and progression without ever seeing roster-wide data.

    Sessions live in the same per-database scope as the athlete record they
    point to, so a token issued for one database is meaningless in another.
    """

    __tablename__ = "athlete_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_token: Mapped[str] = mapped_column(String(200), nullable=False, unique=True)
    athlete_id: Mapped[int] = mapped_column(Integer, ForeignKey("athletes.id"), nullable=False)
    email: Mapped[str] = mapped_column(String(200), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)

    def __repr__(self) -> str:
        return f"<AthleteSession(athlete_id={self.athlete_id}, email='{self.email}')>"


class OAuthState(Base):
    """CSRF state tokens for the Google OAuth login flow.

    Stored in the database instead of an in-memory dict so that state
    validation works correctly across multiple server workers.
    """

    __tablename__ = "oauth_states"

    state: Mapped[str] = mapped_column(String(64), primary_key=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)

    def __repr__(self) -> str:
        return f"<OAuthState(state='{self.state[:8]}...')>"


class GDriveToken(Base):
    """Per-instance Google Drive OAuth tokens.

    Stores the refresh/access tokens obtained when a instance admin
    authorizes the app to read their Google Drive. The access_token
    is short-lived and refreshed automatically; the refresh_token is
    long-lived and only rotated by Google under certain conditions.
    """

    __tablename__ = "gdrive_tokens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(200), nullable=False, unique=True)
    access_token: Mapped[str] = mapped_column(Text, nullable=False)
    refresh_token: Mapped[str] = mapped_column(Text, nullable=False)
    token_expiry: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    scopes: Mapped[str | None] = mapped_column(Text, nullable=True)


    connection_status: Mapped[str] = mapped_column(String(20), nullable=False, server_default="active")
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_error_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_successful_sync_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


    refresh_token_issued_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    def __repr__(self) -> str:
        return f"<GDriveToken(email='{self.email}', status='{self.connection_status}')>"


class AllowedUser(Base):
    """Email addresses allowed to log in via Google OAuth."""

    __tablename__ = "allowed_users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(200), nullable=False, unique=True)
    name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    is_admin: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="0")
    added_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    def __repr__(self) -> str:
        return f"<AllowedUser(email='{self.email}', is_admin={self.is_admin})>"


class DailyWellness(Base):
    """Daily nutrition and bodyweight tracking parsed from the HomePage tab."""

    __tablename__ = "daily_wellness"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    athlete_id: Mapped[int] = mapped_column(Integer, ForeignKey("athletes.id"), nullable=False)
    program_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("programs.id"), nullable=True)
    date: Mapped[str] = mapped_column(String(20), nullable=False)
    week_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    day_of_week: Mapped[str | None] = mapped_column(String(10), nullable=True)

    goal_calories: Mapped[float | None] = mapped_column(Float, nullable=True)
    goal_protein: Mapped[float | None] = mapped_column(Float, nullable=True)
    goal_carbs: Mapped[float | None] = mapped_column(Float, nullable=True)
    goal_fat: Mapped[float | None] = mapped_column(Float, nullable=True)

    actual_calories: Mapped[float | None] = mapped_column(Float, nullable=True)
    actual_protein: Mapped[float | None] = mapped_column(Float, nullable=True)
    actual_carbs: Mapped[float | None] = mapped_column(Float, nullable=True)
    actual_fat: Mapped[float | None] = mapped_column(Float, nullable=True)

    bodyweight_lbs: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    athlete: Mapped[Athlete] = relationship("Athlete", back_populates="daily_wellness")
    program: Mapped[Program | None] = relationship("Program", back_populates="daily_wellness")

    def __repr__(self) -> str:
        return f"<DailyWellness(athlete={self.athlete_id}, date={self.date}, bw={self.bodyweight_lbs})>"


class GDriveImport(Base):
    """Tracks which Google Drive files have been imported to prevent duplicates."""

    __tablename__ = "gdrive_imports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    gdrive_file_id: Mapped[str] = mapped_column(String(200), nullable=False, unique=True)
    gdrive_file_name: Mapped[str] = mapped_column(String(500), nullable=False)
    gdrive_modified_time: Mapped[str] = mapped_column(String(50), nullable=False)
    program_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("programs.id", ondelete="SET NULL"), nullable=True
    )
    imported_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="success")
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    program: Mapped[Program | None] = relationship("Program", back_populates="gdrive_imports")

    def __repr__(self) -> str:
        return f"<GDriveImport(file='{self.gdrive_file_name}', status={self.status})>"


class RawProgram(Base):
    """A spreadsheet downloaded from Drive but not yet parsed.

    Populated by the GDrive sync when the instance's ``parser_id`` resolves to
    an adapter that hasn't been built yet. The raw xlsx is written to disk
    next to the instance DB, and a row here records where the file came from.
    Once the adapter ships, ``parse-staged`` walks unprocessed rows, runs
    them through the import pipeline, and stamps ``processed_at``.
    """

    __tablename__ = "raw_programs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    gdrive_file_id: Mapped[str] = mapped_column(String(200), nullable=False, unique=True)
    gdrive_file_name: Mapped[str] = mapped_column(String(500), nullable=False)
    gdrive_modified_time: Mapped[str] = mapped_column(String(50), nullable=False)
    folder_name: Mapped[str | None] = mapped_column(String(500), nullable=True)
    local_path: Mapped[str] = mapped_column(String(1000), nullable=False)
    staged_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    processed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    def __repr__(self) -> str:
        return f"<RawProgram(file='{self.gdrive_file_name}', processed={self.processed_at is not None})>"


class ExerciseAlias(Base):
    """Coach-managed exercise-name merges for this instance.

    Coaches enter free text in the spreadsheet so the same lift ends up
    spelled several ways with different parenthetical cues ("Paused
    Deadlift (0-1-0) (just off the floor)" vs "(right off the floor)").
    The structural canonicalizer in ``utils.exercise_names`` handles
    casing, plurals, and known typos, but it can't safely fold
    structurally-different cues without risking collapsing genuinely
    distinct variations.

    This table lets the coach declare instance-wide equivalences. Each row
    says "whenever an exercise is logged as ``alias_name``, treat it as
    ``primary_name`` for PR tracking and variation grouping." The raw
    name stays on every ``exercise_entries`` / ``max_history`` row so no
    data is destroyed; the alias lookup happens at query time.
    """

    __tablename__ = "exercise_aliases"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    primary_name: Mapped[str] = mapped_column(String(300), nullable=False)
    alias_name: Mapped[str] = mapped_column(String(300), nullable=False, unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    def __repr__(self) -> str:
        return f"<ExerciseAlias({self.alias_name!r} -> {self.primary_name!r})>"
