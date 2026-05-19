"""SQLite database connection and session management."""

from __future__ import annotations

import logging
import os
from pathlib import Path

from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker

from ..plugins import get_hook
from .orm import Base

logger = logging.getLogger(__name__)

_default_db_path: Path | None = None
_engines: dict[str, object] = {}
_session_factories: dict[str, sessionmaker] = {}


def staging_dir_for(db_path: Path | str | None = None) -> Path:
    """Return the per-instance raw-program staging directory.

    Lives next to the instance DB at ``<db_dir>/raw_programs/`` so cloud
    deploys (each instance under ``/data/instances/<sub>/``) keep raw xlsx
    files isolated alongside their database. Created on demand.
    """
    path = Path(db_path) if db_path else get_db_path()
    staging = path.parent / "raw_programs"
    staging.mkdir(parents=True, exist_ok=True)
    return staging


def get_db_path() -> Path:
    """Get the default database path.

    Checks BESTRONG_DB_PATH env var first (for Docker), then falls back to ~/.bestrong/bestrong.db.
    """
    global _default_db_path
    if _default_db_path is None:
        env_path = os.environ.get("BESTRONG_DB_PATH")
        if env_path:
            _default_db_path = Path(env_path)
            _default_db_path.parent.mkdir(parents=True, exist_ok=True)
        else:
            data_dir = Path.home() / ".bestrong"
            data_dir.mkdir(parents=True, exist_ok=True)
            _default_db_path = data_dir / "bestrong.db"
    return _default_db_path


def get_engine(db_path: Path | str | None = None):
    """Get or create the SQLAlchemy engine."""
    path = Path(db_path) if db_path else get_db_path()
    key = str(path)
    if key not in _engines:
        path.parent.mkdir(parents=True, exist_ok=True)
        engine = create_engine(
            f"sqlite:///{path}",
            echo=False,
            connect_args={"check_same_thread": False},
        )

        @event.listens_for(engine, "connect")
        def set_sqlite_pragma(dbapi_connection, connection_record):
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

        _engines[key] = engine

    return _engines[key]


def get_session_factory(db_path: Path | str | None = None) -> sessionmaker:
    """Get or create the session factory."""
    path = Path(db_path) if db_path else get_db_path()
    key = str(path)
    if key not in _session_factories:
        engine = get_engine(db_path)
        _session_factories[key] = sessionmaker(
            bind=engine, autocommit=False, autoflush=False
        )
    return _session_factories[key]


def get_session(db_path: Path | str | None = None) -> Session:
    """Get a new database session."""
    factory = get_session_factory(db_path)
    return factory()


def _cleanup_stale_journals(db_path: Path) -> None:
    """Remove orphaned WAL/SHM files if the main .db file is missing.

    SQLite can fail with 'disk I/O error' if journal files exist
    without the main database file.
    """
    if db_path.exists():
        return
    for suffix in ("-wal", "-shm", "-journal"):
        journal = db_path.parent / (db_path.name + suffix)
        if journal.exists():
            journal.unlink()


_COLUMN_RENAMES: dict[str, list[tuple[str, str]]] = {
    "athletes": [
        ("vacation_status", "availability_status"),
        ("vacation_start", "out_from"),
        ("vacation_end", "out_through"),
    ],
}


_COLUMN_MIGRATIONS: dict[str, list[tuple[str, str]]] = {
    "athletes": [
        ("age", "INTEGER"),
        ("dob", "VARCHAR(20)"),
        ("division", "VARCHAR(100)"),
        ("weight_class", "VARCHAR(50)"),
        ("program_due", "VARCHAR(50)"),
        ("next_meet_name", "VARCHAR(200)"),
        ("next_meet_id", "INTEGER REFERENCES meets(id)"),
        ("meet_date", "VARCHAR(100)"),
        ("weeks_out", "INTEGER"),
        ("days_out", "INTEGER"),
        ("availability_status", "VARCHAR(50)"),
        ("out_from", "VARCHAR(20)"),
        ("out_through", "VARCHAR(20)"),
        ("status", "VARCHAR(100)"),
        ("email", "VARCHAR(200)"),
        ("phone", "VARCHAR(50)"),
        ("membership_no", "INTEGER"),
        ("lifting_db_link", "VARCHAR(500)"),
        ("tags", "VARCHAR(500)"),
        ("notion_page_id", "VARCHAR(100)"),
        ("archived", "INTEGER DEFAULT 0 NOT NULL"),
        ("reminder_days_before", "INTEGER DEFAULT 1"),
        ("primary_squat_day", "INTEGER"),
        ("primary_bench_day", "INTEGER"),
        ("primary_deadlift_day", "INTEGER"),
        ("sex", "VARCHAR(10)"),
        ("equipment", "VARCHAR(50)"),
        ("goal_bodyweight_lbs", "REAL"),
        ("body_metrics_hidden", "INTEGER DEFAULT 0 NOT NULL"),
        ("price", "REAL"),
        ("product_name", "VARCHAR(200)"),
        ("billing_customer_id", "VARCHAR(200)"),
        ("last_payment_date", "VARCHAR(20)"),
        ("portal_last_login_at", "DATETIME"),
        ("portal_disabled", "INTEGER NOT NULL DEFAULT 0"),
    ],
    "programs": [
        ("google_sheet_url", "VARCHAR(500)"),
        ("primary_squat_day", "INTEGER"),
        ("primary_bench_day", "INTEGER"),
        ("primary_deadlift_day", "INTEGER"),
    ],
    "notifications": [
        ("read", "INTEGER DEFAULT 0 NOT NULL"),
    ],
    "exercise_entries": [
        ("failed", "INTEGER NOT NULL DEFAULT 0"),
        ("weight_expected", "INTEGER NOT NULL DEFAULT 0"),
        ("rpe_expected", "INTEGER NOT NULL DEFAULT 0"),
        ("rpe_needs_review", "INTEGER NOT NULL DEFAULT 0"),
        ("rpe_raw_value", "VARCHAR(100)"),
    ],
    "max_history": [
        ("reps", "INTEGER"),
        ("exercise_name", "VARCHAR(300)"),
    ],
    "allowed_users": [
        ("is_admin", "INTEGER NOT NULL DEFAULT 0"),
    ],
    "gdrive_tokens": [
        ("connection_status", "VARCHAR(20) NOT NULL DEFAULT 'active'"),
        ("last_error", "TEXT"),
        ("last_error_at", "DATETIME"),
        ("last_successful_sync_at", "DATETIME"),
        ("refresh_token_issued_at", "DATETIME"),
    ],
    "meet_results": [
        ("source", "VARCHAR(16) NOT NULL DEFAULT 'manual'"),
        ("external_meet_path", "VARCHAR(300)"),
        ("bodyweight_kg", "REAL"),
        ("dots_score", "REAL"),
        ("gl_points", "REAL"),
        ("place", "VARCHAR(20)"),
    ],
}


_TABLE_CREATES: dict[str, str] = {
    "allowed_users": """
        CREATE TABLE allowed_users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email VARCHAR(200) NOT NULL UNIQUE,
            name VARCHAR(200),
            added_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """,
    "auth_sessions": """
        CREATE TABLE auth_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_token VARCHAR(200) NOT NULL UNIQUE,
            email VARCHAR(200) NOT NULL,
            name VARCHAR(200),
            picture VARCHAR(500),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            expires_at DATETIME NOT NULL
        )
    """,
    "athlete_sessions": """
        CREATE TABLE athlete_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_token VARCHAR(200) NOT NULL UNIQUE,
            athlete_id INTEGER NOT NULL REFERENCES athletes(id),
            email VARCHAR(200) NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            expires_at DATETIME NOT NULL
        )
    """,
    "daily_wellness": """
        CREATE TABLE daily_wellness (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            athlete_id INTEGER NOT NULL REFERENCES athletes(id),
            program_id INTEGER REFERENCES programs(id),
            date VARCHAR(20) NOT NULL,
            week_number INTEGER,
            day_of_week VARCHAR(10),
            goal_calories REAL,
            goal_protein REAL,
            goal_carbs REAL,
            goal_fat REAL,
            actual_calories REAL,
            actual_protein REAL,
            actual_carbs REAL,
            actual_fat REAL,
            bodyweight_lbs REAL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """,
    "work_logs": """
        CREATE TABLE work_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            athlete_id INTEGER NOT NULL REFERENCES athletes(id),
            notification_id INTEGER,
            duration_seconds INTEGER NOT NULL,
            action VARCHAR(50) NOT NULL DEFAULT 'complete',
            note TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """,
    "gdrive_tokens": """
        CREATE TABLE gdrive_tokens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email VARCHAR(200) NOT NULL UNIQUE,
            access_token TEXT NOT NULL,
            refresh_token TEXT NOT NULL,
            token_expiry DATETIME,
            scopes TEXT,
            connection_status VARCHAR(20) NOT NULL DEFAULT 'active',
            last_error TEXT,
            last_error_at DATETIME,
            last_successful_sync_at DATETIME,
            refresh_token_issued_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """,
    "meet_results": """
        CREATE TABLE meet_results (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            athlete_id INTEGER NOT NULL REFERENCES athletes(id),
            meet_id INTEGER REFERENCES meets(id),
            meet_name VARCHAR(300),
            meet_date VARCHAR(20),
            federation VARCHAR(50),
            weight_class VARCHAR(50),
            division VARCHAR(100),
            lift VARCHAR(20) NOT NULL,
            attempt_number INTEGER NOT NULL,
            weight_lbs REAL NOT NULL,
            made INTEGER NOT NULL DEFAULT 1,
            notes TEXT,
            source VARCHAR(16) NOT NULL DEFAULT 'manual',
            external_meet_path VARCHAR(300),
            bodyweight_kg REAL,
            dots_score REAL,
            gl_points REAL,
            place VARCHAR(20),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """,
    "exercise_aliases": """
        CREATE TABLE exercise_aliases (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            primary_name VARCHAR(300) NOT NULL,
            alias_name VARCHAR(300) NOT NULL,
            athlete_id INTEGER REFERENCES athletes(id),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT uq_exercise_alias_name_athlete UNIQUE (alias_name, athlete_id)
        )
    """,
    "raw_programs": """
        CREATE TABLE raw_programs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            gdrive_file_id VARCHAR(200) NOT NULL UNIQUE,
            gdrive_file_name VARCHAR(500) NOT NULL,
            gdrive_modified_time VARCHAR(50) NOT NULL,
            folder_name VARCHAR(500),
            local_path VARCHAR(1000) NOT NULL,
            staged_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            processed_at DATETIME,
            error_message TEXT
        )
    """,
    "opl_links": """
        CREATE TABLE opl_links (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            athlete_id INTEGER NOT NULL UNIQUE REFERENCES athletes(id),
            slug VARCHAR(200) NOT NULL,
            display_name VARCHAR(200),
            last_synced_at DATETIME,
            last_sync_error TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """,
    "opl_meets": """
        CREATE TABLE opl_meets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            athlete_id INTEGER NOT NULL REFERENCES athletes(id),
            meet_path VARCHAR(300) NOT NULL,
            meet_name VARCHAR(300),
            federation VARCHAR(80),
            parent_federation VARCHAR(80),
            meet_date VARCHAR(20),
            meet_country VARCHAR(80),
            meet_state VARCHAR(80),
            event VARCHAR(20),
            equipment VARCHAR(40),
            division VARCHAR(120),
            age_class VARCHAR(40),
            weight_class_kg VARCHAR(40),
            bodyweight_kg REAL,
            squat_kg REAL,
            bench_kg REAL,
            deadlift_kg REAL,
            total_kg REAL,
            place VARCHAR(20),
            dots REAL,
            tested INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (athlete_id, meet_path)
        )
    """,
}


_DATA_MIGRATIONS: list[tuple[int, str, str]] = [
    (1, "backfill google_sheet_url from gdrive_imports", """
        UPDATE programs
        SET google_sheet_url = 'https://docs.google.com/spreadsheets/d/' || (
            SELECT gi.gdrive_file_id
            FROM gdrive_imports gi
            WHERE gi.program_id = programs.id
              AND gi.status = 'success'
            LIMIT 1
        )
        WHERE google_sheet_url IS NULL
          AND id IN (
              SELECT program_id FROM gdrive_imports
              WHERE status = 'success' AND program_id IS NOT NULL
          )
    """),
    (2, "set first allowed_user as admin", """
        UPDATE allowed_users SET is_admin = 1
        WHERE id = (SELECT MIN(id) FROM allowed_users)
          AND is_admin = 0
    """),
    (3, "backfill competition PR lane rows from meet_results", """
        INSERT INTO max_history (
            athlete_id, lift, old_value, new_value, source, note,
            recorded_at, reps, exercise_name
        )
        SELECT
            sub.athlete_id,
            sub.lift,
            NULL,
            sub.weight_lbs,
            'meet',
            sub.meet_name,
            COALESCE(sub.meet_date, CURRENT_TIMESTAMP),
            1,
            sub.canonical_name
        FROM (
            SELECT
                mr.athlete_id,
                mr.lift,
                mr.weight_lbs,
                mr.meet_name,
                mr.meet_date,
                CASE mr.lift
                    WHEN 'squat' THEN 'Competition Squat'
                    WHEN 'bench' THEN 'Competition Bench Press'
                    WHEN 'deadlift' THEN 'Competition Deadlift'
                END AS canonical_name,
                ROW_NUMBER() OVER (
                    PARTITION BY mr.athlete_id, mr.lift
                    ORDER BY mr.weight_lbs DESC, mr.id ASC
                ) AS rn
            FROM meet_results mr
            WHERE mr.made = 1
              AND mr.lift IN ('squat', 'bench', 'deadlift')
        ) sub
        WHERE sub.rn = 1
          AND NOT EXISTS (
              SELECT 1 FROM max_history mh
              WHERE mh.athlete_id = sub.athlete_id
                AND mh.lift = sub.lift
                AND mh.exercise_name = sub.canonical_name
                AND mh.reps = 1
                AND mh.source IN ('meet', 'opl')
          )
    """),
]


def _ensure_columns(conn, table: str, columns: list[tuple[str, str]]) -> None:
    """Add any missing columns to *table*. Idempotent."""
    from sqlalchemy import text

    result = conn.execute(text(f"PRAGMA table_info({table})"))
    existing = {row[1] for row in result}
    for col_name, col_type in columns:
        if col_name not in existing:
            conn.execute(
                text(f"ALTER TABLE {table} ADD COLUMN {col_name} {col_type}")
            )


def _rename_columns(
    conn, table: str, renames: list[tuple[str, str]]
) -> None:
    """Rename columns on *table*. Idempotent — skips entries whose old
    column is gone or whose new column already exists. Safe to leave
    in place across upgrades; existing instances get one rename, fresh
    DBs (created via ORM ``create_all``) already have the new names so
    every entry is a no-op.
    """
    from sqlalchemy import text

    table_exists = conn.execute(
        text("SELECT name FROM sqlite_master WHERE type='table' AND name=:t"),
        {"t": table},
    ).fetchone()
    if not table_exists:
        return

    result = conn.execute(text(f"PRAGMA table_info({table})"))
    existing = {row[1] for row in result}
    for old_name, new_name in renames:
        if old_name in existing and new_name not in existing:
            conn.execute(
                text(
                    f"ALTER TABLE {table} RENAME COLUMN {old_name} TO {new_name}"
                )
            )


def _ensure_table(conn, table: str, create_sql: str) -> None:
    """Create *table* if it does not exist. Idempotent."""
    from sqlalchemy import text

    result = conn.execute(
        text("SELECT name FROM sqlite_master WHERE type='table' AND name=:t"),
        {"t": table},
    )
    if not result.fetchone():
        conn.execute(text(create_sql))


def _drop_legacy_exercise_aliases(conn) -> None:
    """Drop a pre-athlete-scoping exercise_aliases table so it rebuilds.

    The table gained an ``athlete_id`` column so merges can be scoped to a
    single athlete instead of the whole instance. SQLite cannot add the
    column and swap the UNIQUE constraint in one ALTER, and existing
    instance-wide merges are intentionally cleared as part of this change,
    so the simplest correct path is to drop the old table and let
    ``_ensure_table`` recreate it from the current schema.

    Idempotent: a table that already has ``athlete_id`` (or no table at
    all) is left untouched, so this is safe on every startup.
    """
    from sqlalchemy import text

    exists = conn.execute(
        text(
            "SELECT name FROM sqlite_master "
            "WHERE type='table' AND name='exercise_aliases'"
        )
    ).fetchone()
    if not exists:
        return
    cols = {
        row[1]
        for row in conn.execute(text("PRAGMA table_info(exercise_aliases)"))
    }
    if "athlete_id" not in cols:
        conn.execute(text("DROP TABLE exercise_aliases"))


def _ensure_version_table(conn) -> None:
    """Create the migration version tracker if it does not exist."""
    from sqlalchemy import text

    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS _migration_version (
            version INTEGER PRIMARY KEY,
            description TEXT,
            applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """))


def _run_data_migrations(conn) -> None:
    """Run any one-off data migrations that haven't been applied yet.

    Each migration runs in its own savepoint. The version row is only
    inserted after the SQL succeeds, so a failed migration is not
    marked as applied and will be retried on the next startup. Failures
    log via ``logger.exception`` (visible in stdout locally and Sentry
    in production) but do not block startup.
    """
    from sqlalchemy import text

    _ensure_version_table(conn)
    result = conn.execute(text("SELECT version FROM _migration_version"))
    applied = {row[0] for row in result}

    for version, description, sql in _DATA_MIGRATIONS:
        if version in applied:
            continue
        savepoint = conn.begin_nested()
        try:
            conn.execute(text(sql))
            conn.execute(
                text(
                    "INSERT INTO _migration_version (version, description) "
                    "VALUES (:v, :d)"
                ),
                {"v": version, "d": description},
            )
            savepoint.commit()
        except Exception:
            savepoint.rollback()
            logger.exception(
                "data_migration_failed",
                extra={"version": version, "description": description},
            )


def _migrate_gdrive_imports_fk(conn) -> None:
    """Rebuild gdrive_imports so program_id's FK cascades as SET NULL.

    Older databases were created with ``FOREIGN KEY(program_id) REFERENCES
    programs(id)`` (no ON DELETE clause), which blocks ``db.delete(program)``
    when any gdrive_imports row still points at it. The correct behavior is
    to null the ref and keep the import history row as an audit trail.

    SQLite can't ALTER a FK constraint, so we rebuild the table. Idempotent:
    inspects PRAGMA foreign_key_list and skips if program_id is already
    on_delete=SET NULL.
    """
    from sqlalchemy import text


    table_exists = conn.execute(
        text("SELECT name FROM sqlite_master WHERE type='table' AND name='gdrive_imports'")
    ).fetchone()
    if not table_exists:
        return

    fk_rows = conn.execute(text("PRAGMA foreign_key_list(gdrive_imports)")).fetchall()
    for row in fk_rows:

        if row[3] == "program_id" and row[6] == "SET NULL":
            return


    conn.execute(text("PRAGMA foreign_keys=OFF"))
    try:
        conn.execute(text("""
            CREATE TABLE gdrive_imports_new (
                id INTEGER NOT NULL,
                gdrive_file_id VARCHAR(200) NOT NULL,
                gdrive_file_name VARCHAR(500) NOT NULL,
                gdrive_modified_time VARCHAR(50) NOT NULL,
                program_id INTEGER,
                imported_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
                status VARCHAR(20) NOT NULL,
                error_message TEXT,
                PRIMARY KEY (id),
                UNIQUE (gdrive_file_id),
                FOREIGN KEY(program_id) REFERENCES programs (id) ON DELETE SET NULL
            )
        """))
        conn.execute(text("""
            INSERT INTO gdrive_imports_new
              (id, gdrive_file_id, gdrive_file_name, gdrive_modified_time,
               program_id, imported_at, status, error_message)
            SELECT id, gdrive_file_id, gdrive_file_name, gdrive_modified_time,
                   program_id, imported_at, status, error_message
            FROM gdrive_imports
        """))
        conn.execute(text("DROP TABLE gdrive_imports"))
        conn.execute(text("ALTER TABLE gdrive_imports_new RENAME TO gdrive_imports"))
    finally:
        conn.execute(text("PRAGMA foreign_keys=ON"))


def migrate_db(db_path: Path | str | None = None) -> None:
    """Ensure the database schema is up to date.

    1. Create any tables that predate ORM coverage.
    2. Add missing columns to existing tables.
    3. Run versioned one-off data migrations.

    Everything is idempotent and safe to call on every startup.
    """
    engine = get_engine(db_path)

    column_migrations = {table: list(cols) for table, cols in _COLUMN_MIGRATIONS.items()}
    extend = get_hook("extend_migrations")
    if extend is not None:
        extend(column_migrations)

    with engine.connect() as conn:

        _drop_legacy_exercise_aliases(conn)

        for table, create_sql in _TABLE_CREATES.items():
            _ensure_table(conn, table, create_sql)


        for table, renames in _COLUMN_RENAMES.items():
            _rename_columns(conn, table, renames)


        for table, columns in column_migrations.items():
            _ensure_columns(conn, table, columns)


        _migrate_gdrive_imports_fk(conn)


        _run_data_migrations(conn)

        conn.commit()


def init_db(db_path: Path | str | None = None) -> None:
    """Create all tables if they don't exist, then run migrations."""
    path = Path(db_path) if db_path else get_db_path()
    _cleanup_stale_journals(path)
    engine = get_engine(db_path)
    Base.metadata.create_all(bind=engine)
    migrate_db(db_path)


def reset_db(db_path: Path | str | None = None) -> None:
    """Drop and recreate all tables."""
    engine = get_engine(db_path)
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
