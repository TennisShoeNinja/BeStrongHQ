"""CLI entry point for BeStrong."""

from __future__ import annotations

import os
from pathlib import Path

import typer
from rich.console import Console
from rich.table import Table

from .plugins import get_hook


def _load_dotenv() -> None:
    """Load .env file from the project root if it exists.

    Simple loader that handles KEY=value lines, ignoring comments and blanks.
    Skips keys that are already set in the environment so explicit exports
    always take precedence.
    """
    env_path = Path(__file__).resolve().parent.parent / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip()

        if key and key not in os.environ:
            os.environ[key] = value


_load_dotenv()

app = typer.Typer(
    name="bestrong",
    help="Powerlifting coaching analytics: parse training programs, visualize progress.",
)
console = Console()


@app.command()
def serve(
    port: int = typer.Option(8080, help="Port to serve on"),
    host: str = typer.Option("127.0.0.1", help="Host to bind to (use 0.0.0.0 for network access)"),
    no_browser: bool = typer.Option(False, help="Don't auto-open browser"),
    dev: bool = typer.Option(False, help="Enable development mode with auto-reload"),
):
    """Start the BeStrong web UI."""
    from .models.database import init_db

    init_db()
    console.print(f"[bold green]BeStrong[/bold green] starting on http://{host}:{port}")

    if not no_browser and not dev:
        import webbrowser
        webbrowser.open(f"http://localhost:{port}")

    import uvicorn
    uvicorn.run(
        "bestrong.api:create_app",
        host=host,
        port=port,
        reload=dev,
        factory=True,
    )


@app.command()
def info(
    db: Path | None = typer.Option(None, help="Database path"),
):
    """Show database stats."""
    from .models.database import get_session, init_db
    from .models.orm import Athlete, ExerciseEntry, Program, Session

    init_db(db)
    session = get_session(db)

    athletes = session.query(Athlete).count()
    programs = session.query(Program).count()
    sessions = session.query(Session).count()
    exercises = session.query(ExerciseEntry).count()

    table = Table(title="BeStrong Database")
    table.add_column("Entity", style="bold")
    table.add_column("Count", justify="right")
    table.add_row("Athletes", str(athletes))
    table.add_row("Programs", str(programs))
    table.add_row("Sessions", str(sessions))
    table.add_row("Exercise Entries", str(exercises))
    console.print(table)

    if athletes > 0:
        console.print("\n[bold]Athletes:[/bold]")
        for a in session.query(Athlete).all():
            prog_count = session.query(Program).filter(Program.athlete_id == a.id).count()
            console.print(
                f"  • {a.name}: S{a.squat_max_lbs}/B{a.bench_max_lbs}/D{a.deadlift_max_lbs} "
                f"({prog_count} program{'s' if prog_count != 1 else ''})"
            )

    session.close()


@app.command()
def run(
    api_port: int = typer.Option(8080, help="Port for the FastAPI backend"),
    ui_port: int = typer.Option(3000, help="Port for the Next.js UI"),
    host: str = typer.Option("127.0.0.1", help="Host to bind to (use 0.0.0.0 for network access)"),
):
    """Start both the API server and Next.js UI in one command."""
    import os as _os
    import shutil as _shutil
    import subprocess
    import sys
    import time

    from .models.database import init_db

    init_db()

    _is_windows = _os.name == "nt"

    def _resolve(name: str, win_name: str, fallbacks: list[str]) -> str:
        """Find an executable, preferring PATH but falling back to known install
        locations. Returns the original name if nothing is found, so subprocess
        will produce a clear FileNotFoundError instead of failing silently."""
        target = win_name if _is_windows else name
        found = _shutil.which(target)
        if found:
            return found
        for path in fallbacks:
            expanded = _os.path.expandvars(path)
            if _os.path.exists(expanded):
                return expanded
        return target

    _npx = _resolve(
        "npx", "npx.cmd",
        [r"%PROGRAMFILES%\nodejs\npx.cmd", r"%PROGRAMFILES(X86)%\nodejs\npx.cmd"],
    )
    _node = _resolve(
        "node", "node.exe",
        [r"%PROGRAMFILES%\nodejs\node.exe", r"%PROGRAMFILES(X86)%\nodejs\node.exe"],
    )

    console.print(f"\n[bold green]BeStrong[/bold green] is running at [bold cyan]http://{host}:{ui_port}[/bold cyan]\n")


    api_proc = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "bestrong.api:create_app",
         "--host", host, "--port", str(api_port), "--factory"],
    )


    time.sleep(1)


    web_dir = Path(__file__).parent.parent / "web"
    overlay_sync = web_dir / "scripts" / "sync-cloud-routes.mjs"

    if overlay_sync.exists():
        subprocess.run([_node, str(overlay_sync)], cwd=str(web_dir), check=True)

    ui_proc = None
    try:


        standalone_flat = web_dir / "server.js"
        standalone_nested = web_dir / ".next" / "standalone" / "server.js"
        build_id = web_dir / ".next" / "BUILD_ID"

        base_env = {
            **__import__("os").environ,
            "NEXT_PUBLIC_API_URL": f"http://{host}:{api_port}",
        }

        if standalone_flat.exists():
            next_cmd = [_node, str(standalone_flat)]
            next_cwd = str(web_dir)
            ui_env = {**base_env, "PORT": str(ui_port), "HOSTNAME": host}
        elif standalone_nested.exists():
            next_cmd = [_node, "server.js"]
            next_cwd = str(standalone_nested.parent)
            ui_env = {**base_env, "PORT": str(ui_port), "HOSTNAME": host}
        elif build_id.exists():
            next_cmd = [_npx, "next", "start", "--port", str(ui_port), "--hostname", host]
            next_cwd = str(web_dir)
            ui_env = base_env
        else:
            next_cmd = [_npx, "next", "dev", "--port", str(ui_port), "--hostname", host]
            next_cwd = str(web_dir)
            ui_env = base_env

        ui_proc = subprocess.Popen(
            next_cmd,
            cwd=next_cwd,
            env=ui_env,
        )
        ui_proc.wait()
    except KeyboardInterrupt:
        pass
    finally:
        if ui_proc and ui_proc.poll() is None:
            ui_proc.terminate()
            ui_proc.wait()
        api_proc.terminate()
        api_proc.wait()
        console.print("[bold red]BeStrong stopped.[/bold red]")


@app.command(hidden=True)
def ui(
    api_port: int = typer.Option(8080),
    ui_port: int = typer.Option(3000),
    host: str = typer.Option("127.0.0.1"),
):
    """Alias for 'run'."""
    run(api_port=api_port, ui_port=ui_port, host=host)


@app.command("resync-all")
def resync_all(
    api_host: str = typer.Option("127.0.0.1", help="Host of the running API server"),
    api_port: int = typer.Option(8080, help="Port of the running API server"),
    poll_interval: float = typer.Option(2.0, help="Seconds between status polls"),
):
    """Force-reimport every GDrive-imported program through the current parser.

    Use this after a parser upgrade so existing rows get re-classified with
    the new logic. Requires ``bestrong run`` (or equivalent) to be already
    running so the API can download sheets and re-parse them.
    """
    import time
    import urllib.error
    import urllib.request
    import json

    base = f"http://{api_host}:{api_port}/api/gdrive"

    def _call(method: str, path: str) -> dict:
        req = urllib.request.Request(f"{base}{path}", method=method)
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.URLError as e:
            console.print(
                f"[bold red]Can't reach the API at {base}.[/bold red] "
                f"Start it with 'bestrong run' first. ({e})"
            )
            raise typer.Exit(code=1)

    start = _call("POST", "/force-resync-all")
    if start.get("running") and start.get("phase") == "resyncing" and start.get("total", 0) == 0:

        pass
    elif start.get("phase") == "resyncing" and start.get("resynced", 0) > 0:
        console.print("[yellow]A resync is already in progress. Following along...[/yellow]")

    last_resynced = -1
    last_total = 0
    while True:
        status = _call("GET", "/force-resync-status")
        phase = status.get("phase", "idle")
        total = status.get("total", 0) or 0
        resynced = status.get("resynced", 0) or 0
        errors = status.get("errors", []) or []

        if total != last_total or resynced != last_resynced:
            last_total = total
            last_resynced = resynced
            if total:
                pct = resynced / total * 100
                console.print(
                    f"  {resynced}/{total} programs resynced ({pct:.0f}%)"
                    + (f"  [red]{len(errors)} errors[/red]" if errors else "")
                )

        if phase == "done":
            break
        time.sleep(poll_interval)

    console.print(
        f"\n[green]Done.[/green] Resynced {last_resynced}/{last_total} programs."
    )
    if errors:
        console.print(f"[red]{len(errors)} errors:[/red]")
        for err in errors:
            console.print(f"  • {err}")


@app.command("backfill-prs")
def backfill_prs(
    db: Path | None = typer.Option(None, help="Database path"),
    yes: bool = typer.Option(False, "--yes", "-y", help="Skip confirmation prompt"),
    athlete_id: int | None = typer.Option(
        None, "--athlete-id", help="Rebuild only this athlete (default: all athletes)"
    ),
):
    """Rebuild auto-generated PRs from scratch from current training data.

    For each athlete, clears their program-derived max_history rows
    (sources import/resync/comp_match) and replays PR detection over their
    programs in chronological order, so the surviving rows reflect only the
    current exercise data. Meet, OPL, manual, and floor rows are preserved.

    Use after a PR-logic upgrade so historical rows pick up the new rules,
    or after a parser fix to purge PRs sourced from once-corrupt data
    (pass --athlete-id to scope it). Works against SQLite directly, no
    running API server required.
    """
    from .models.database import init_db, get_session
    from .models.orm import Athlete, MaxHistory
    from .services.pr_tracking import rebuild_pr_history

    if not yes:
        scope = f"athlete {athlete_id}" if athlete_id is not None else "every athlete"
        confirm = typer.confirm(
            f"This will delete auto-generated PRs from max_history for {scope} "
            "and rebuild them from current program data. Manual, meet, and OPL "
            "entries are kept. Continue?"
        )
        if not confirm:
            raise typer.Abort()

    init_db(db)
    session = get_session(db)

    try:
        athlete_ids = (
            [athlete_id]
            if athlete_id is not None
            else [row[0] for row in session.query(Athlete.id).all()]
        )
        console.print(f"Rebuilding PR history for {len(athlete_ids)} athlete(s)...")

        total_prs = 0
        for i, aid in enumerate(athlete_ids, 1):
            total_prs += rebuild_pr_history(session, athlete_id=aid, source="import")
            if i % 25 == 0:
                session.commit()
        session.commit()

        console.print(f"\n[bold green]Backfill complete[/bold green]: {total_prs} PRs logged")

        from sqlalchemy import func as sa_func

        table = Table(title="Rep PR distribution")
        table.add_column("Rep count", style="bold")
        table.add_column("PRs", justify="right")
        rep_q = session.query(MaxHistory.reps, sa_func.count()).filter(
            MaxHistory.reps.isnot(None)
        )
        total_q = session.query(sa_func.count()).filter(MaxHistory.lift == "total")
        if athlete_id is not None:
            rep_q = rep_q.filter(MaxHistory.athlete_id == athlete_id)
            total_q = total_q.filter(MaxHistory.athlete_id == athlete_id)
        rep_rows = rep_q.group_by(MaxHistory.reps).order_by(MaxHistory.reps).all()
        for reps, count in rep_rows:
            table.add_row(f"{reps}RM", str(count))
        table.add_row("Training total", str(total_q.scalar()))
        console.print(table)
    finally:
        session.close()


@app.command("repair-flagged-maxes")
def repair_flagged_maxes(
    db: Path | None = typer.Option(None, help="Database path"),
    apply: bool = typer.Option(
        False, "--apply", help="Apply fixes. Default is a dry-run report only."
    ),
    yes: bool = typer.Option(
        False, "--yes", "-y", help="Skip the confirmation prompt when applying."
    ),
):
    """Find (and with --apply, fix) cached maxes inflated by an over-max RPE single.

    A single logged at an RPE above 10 is flagged for review by the parser
    (rpe_needs_review) and is no longer trusted as a made max. This finds any
    athlete whose declared squat / bench / deadlift max is still backed by such
    a flagged single, then for each one clears the auto-generated PRs, rebuilds
    them from the corrected entries (flagged sets now excluded), and recomputes
    the cached competition maxes down to real evidence. Manual entries, meet
    results, and unaffected athletes are left untouched. Dry-run by default.
    """
    from datetime import datetime

    from sqlalchemy import func as sa_func, or_ as sa_or

    from .models.database import get_session, init_db
    from .models.orm import (
        Athlete,
        ExerciseEntry,
        MaxHistory,
        MeetResult,
        Program,
        Session as SessionModel,
    )
    from .services.max_tracking import (
        COMPETITION_LIFTS,
        MAX_FIELD_BY_LIFT,
        _meet_recency_cutoff,
        reconcile_competition_maxes,
    )
    from .services.pr_tracking import log_prs_for_program

    AUTO_SOURCES = ("import", "resync", "comp_match")

    init_db(db)
    session = get_session(db)

    def best_nonflagged_evidence(athlete_id: int, lift: str) -> float | None:
        """Heaviest trustworthy made single on file: best made meet attempt
        within the recency window, or best non-failed, non-flagged 1-rep top
        set. Used only to preview the post-repair max in the dry-run report."""
        cutoff = _meet_recency_cutoff()
        best_meet = (
            session.query(sa_func.max(MeetResult.weight_lbs))
            .filter(
                MeetResult.athlete_id == athlete_id,
                MeetResult.lift == lift,
                MeetResult.made.is_(True),
                sa_or(MeetResult.meet_date.is_(None), MeetResult.meet_date >= cutoff),
            )
            .scalar()
        )
        best_training = (
            session.query(sa_func.max(ExerciseEntry.weight_lbs))
            .join(SessionModel, ExerciseEntry.session_id == SessionModel.id)
            .join(Program, SessionModel.program_id == Program.id)
            .filter(
                Program.athlete_id == athlete_id,
                ExerciseEntry.lift_category == lift,
                ExerciseEntry.set_type == "top_set",
                ExerciseEntry.is_accessory.is_(False),
                ExerciseEntry.failed.is_(False),
                ExerciseEntry.rpe_needs_review.is_(False),
                ExerciseEntry.reps == 1,
            )
            .scalar()
        )
        cands = [v for v in (best_meet, best_training) if v is not None]
        return max(cands) if cands else None

    try:
        flagged_rows = (
            session.query(Athlete, ExerciseEntry, Program, SessionModel)
            .join(Program, Program.athlete_id == Athlete.id)
            .join(SessionModel, SessionModel.program_id == Program.id)
            .join(ExerciseEntry, ExerciseEntry.session_id == SessionModel.id)
            .filter(ExerciseEntry.rpe_needs_review.is_(True))
            .filter(ExerciseEntry.lift_category.in_(COMPETITION_LIFTS))
            .filter(ExerciseEntry.weight_lbs.isnot(None))
            .filter(ExerciseEntry.reps == 1)
            .all()
        )

        # athlete_id -> {"athlete": Athlete, "lifts": {lift -> info}}, keeping
        # the heaviest flagged single per lift that sits at or above the
        # current declared max (the one that plausibly set it).
        affected: dict[int, dict] = {}
        for ath, ex, prog, sess in flagged_rows:
            declared = getattr(ath, MAX_FIELD_BY_LIFT[ex.lift_category], None)
            if declared is None or ex.weight_lbs < declared:
                continue
            bucket = affected.setdefault(ath.id, {"athlete": ath, "lifts": {}})
            prev = bucket["lifts"].get(ex.lift_category)
            if prev is None or ex.weight_lbs > prev["weight"]:
                bucket["lifts"][ex.lift_category] = {
                    "weight": ex.weight_lbs,
                    "declared": declared,
                    "raw_rpe": ex.rpe_raw_value,
                    "where": f"{prog.program_name or f'Program {prog.program_number}'} "
                    f"W{sess.week_number}D{sess.day_number}",
                }

        if not affected:
            console.print(
                "[green]No cached maxes are backed by a flagged over-max RPE single.[/green]"
            )
            return

        report = Table(title="Maxes backed by a flagged over-max RPE single")
        report.add_column("Athlete")
        report.add_column("Lift")
        report.add_column("Declared", justify="right")
        report.add_column("Flagged", justify="right")
        report.add_column("Raw RPE")
        report.add_column("Projected", justify="right")
        report.add_column("Logged in")
        for aid, bucket in sorted(
            affected.items(), key=lambda kv: kv[1]["athlete"].name.lower()
        ):
            ath = bucket["athlete"]
            for lift in COMPETITION_LIFTS:
                info = bucket["lifts"].get(lift)
                if info is None:
                    continue
                projected = best_nonflagged_evidence(aid, lift)
                report.add_row(
                    ath.name,
                    lift.capitalize(),
                    f"{info['declared']:g}",
                    f"{info['weight']:g}",
                    info["raw_rpe"] or "?",
                    f"{projected:g}" if projected is not None else "(no evidence)",
                    info["where"],
                )
        console.print(report)

        if not apply:
            console.print(
                f"\n[yellow]Dry run.[/yellow] {len(affected)} athlete(s) affected. "
                "Re-run with --apply to rebuild PRs and recompute these maxes."
            )
            return

        if not yes and not typer.confirm(
            f"Rebuild PRs and recompute maxes for {len(affected)} athlete(s)?"
        ):
            raise typer.Abort()

        def prog_sort_key(p: Program) -> tuple:
            for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%m/%d/%y"):
                try:
                    if p.date_start:
                        return (datetime.strptime(p.date_start.strip(), fmt), p.imported_at)
                except ValueError:
                    continue
            return (p.imported_at, p.imported_at)

        results = []
        for aid, bucket in affected.items():
            ath = bucket["athlete"]
            before = {
                "squat": ath.squat_max_lbs,
                "bench": ath.bench_max_lbs,
                "deadlift": ath.deadlift_max_lbs,
                "total": ath.total_lbs,
            }
            # Drop this athlete's auto-generated PRs (manual / meet / opl kept),
            # then rebuild them so the now-excluded flagged single disappears.
            session.query(MaxHistory).filter(
                MaxHistory.athlete_id == aid,
                MaxHistory.source.in_(AUTO_SOURCES),
            ).delete(synchronize_session=False)
            programs = sorted(
                session.query(Program).filter(Program.athlete_id == aid).all(),
                key=prog_sort_key,
            )
            for prog in programs:
                log_prs_for_program(session, athlete_id=aid, program_id=prog.id, source="import")
            # The session factory runs autoflush=False, so the rebuilt PR rows
            # are still pending. Flush them before reconcile reads max_history,
            # or it recomputes against stale evidence and skips the demotion.
            session.flush()
            # log_prs only ever raises a cached max; this recompute is what
            # demotes it back down to current evidence.
            reconcile_competition_maxes(
                session, ath, source="repair", note="flagged-rpe cleanup"
            )
            results.append(
                (
                    ath,
                    before,
                    {
                        "squat": ath.squat_max_lbs,
                        "bench": ath.bench_max_lbs,
                        "deadlift": ath.deadlift_max_lbs,
                        "total": ath.total_lbs,
                    },
                )
            )
        session.commit()

        out = Table(title="Maxes recomputed")
        out.add_column("Athlete")
        for label in ("Squat", "Bench", "Deadlift", "Total"):
            out.add_column(label, justify="right")
        for ath, before, after in sorted(results, key=lambda r: r[0].name.lower()):
            cells = [ath.name]
            for lift in ("squat", "bench", "deadlift", "total"):
                b, a = before[lift], after[lift]
                bs = f"{b:g}" if b is not None else "-"
                as_ = f"{a:g}" if a is not None else "-"
                cells.append(f"{bs} -> {as_}" if b != a else as_)
            out.add_row(*cells)
        console.print(out)
        console.print(
            f"\n[bold green]Repair complete[/bold green]: {len(results)} athlete(s) updated."
        )
    finally:
        session.close()


@app.command("opl-autolink")
def opl_autolink(
    db: Path | None = typer.Option(None, help="Database path"),
):
    """Auto-link athletes with one clear OpenPowerlifting match."""
    from .models.database import get_session, init_db
    from .opl.autolink import run_opl_autolink

    init_db(db)
    session = get_session(db)
    try:
        summary = run_opl_autolink(session)
    finally:
        session.close()

    linked = summary["linked"]
    needs_review = summary["needs_review"]
    no_match = summary["no_match"]

    console.print(
        "[bold green]OPL auto-link complete[/bold green]: "
        f"{len(linked)} linked, {len(needs_review)} needs review, "
        f"{len(no_match)} no match"
    )

    for title, rows in (
        ("Linked", linked),
        ("Needs review", needs_review),
        ("No match", no_match),
    ):
        if not rows:
            continue
        console.print(f"\n[bold]{title}:[/bold]")
        for row in rows:
            console.print(f"  • {row['name']}")


@app.command("get-athlete-emails")
def get_athlete_emails(
    db: Path | None = typer.Option(None, help="Database path"),
    force: bool = typer.Option(
        False, "--force",
        help="Re-detect for every athlete, including those who already have an email set",
    ),
):
    """Fill in athlete emails by reading Drive sharing on their program sheets.

    By default, only athletes with no email set are touched. Use --force to
    re-resolve for everyone (e.g. after a sharing change). A new email is
    only written when a single non-coach address resolves; ambiguous or
    empty results never overwrite what's already there.
    """
    from .models.database import init_db, get_session
    from .models.orm import Athlete, GDriveImport, Program
    from .gdrive import client as gdrive_client
    from .gdrive.email_scrape import scrape_for_athlete

    init_db(db)
    session = get_session(db)
    try:
        if not gdrive_client.is_authenticated(db=session):
            console.print("[red]Drive is not connected. Connect it first.[/red]")
            raise typer.Exit(code=1)

        coach_email = gdrive_client.get_connected_email(db=session)

        query = session.query(Athlete)
        if not force:
            query = query.filter(Athlete.email.is_(None))
        athletes = query.all()

        if not athletes:
            console.print("[green]Nothing to do — every athlete already has an email.[/green]")
            return

        updated = 0
        unresolved = 0
        for athlete in athletes:
            file_ids = [
                imp.gdrive_file_id
                for imp in (
                    session.query(GDriveImport)
                    .join(Program, GDriveImport.program_id == Program.id)
                    .filter(Program.athlete_id == athlete.id)
                    .order_by(GDriveImport.imported_at.desc())
                    .all()
                )
            ]
            if not file_ids:
                unresolved += 1
                continue

            try:
                if scrape_for_athlete(
                    session, athlete, file_ids, coach_email, force=force
                ):
                    session.commit()
                    updated += 1
                else:
                    unresolved += 1
            except Exception as exc:
                session.rollback()
                console.print(f"[yellow]{athlete.name}: {exc}[/yellow]")
                unresolved += 1

        console.print(
            f"[green]Updated {updated} athletes.[/green] {unresolved} unresolved."
        )
    finally:
        session.close()


@app.command("reset-db")
def reset_db(
    db: Path | None = typer.Option(None, help="Database path"),
    yes: bool = typer.Option(False, "--yes", "-y", help="Skip confirmation prompt"),
):
    """Delete the database and recreate it fresh (for clean re-syncs)."""
    from .models.database import get_db_path, init_db, _cleanup_stale_journals

    db_path = Path(db) if db else get_db_path()

    if db_path.exists():
        if not yes:
            confirm = typer.confirm(f"This will delete {db_path} and all imported data. Continue?")
            if not confirm:
                raise typer.Abort()

        db_path.unlink()
        _cleanup_stale_journals(db_path)
        console.print(f"[yellow]Deleted[/yellow] {db_path}")
    else:
        _cleanup_stale_journals(db_path)
        console.print(f"[dim]No database found at {db_path}[/dim]")


    init_db(db)
    console.print("[green]Fresh database created.[/green]")


_register_cli = get_hook("register_cli")
if _register_cli is not None:
    _register_cli(app)


def main():
    app()


if __name__ == "__main__":
    main()
