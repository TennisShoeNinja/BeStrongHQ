"""CLI entry point for BeStrong."""

from __future__ import annotations

import os
from pathlib import Path

import typer
from rich.console import Console
from rich.table import Table


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
    import subprocess
    import sys
    import time

    from .models.database import init_db

    init_db()

    console.print(f"\n[bold green]BeStrong[/bold green] is running at [bold cyan]http://{host}:{ui_port}[/bold cyan]\n")


    api_proc = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "bestrong.api:create_app",
         "--host", host, "--port", str(api_port), "--factory"],
    )


    time.sleep(1)


    web_dir = Path(__file__).parent.parent / "web"
    overlay_sync = web_dir / "scripts" / "sync-cloud-routes.mjs"

    if overlay_sync.exists():
        subprocess.run(["node", str(overlay_sync)], cwd=str(web_dir), check=True)

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
            next_cmd = ["node", str(standalone_flat)]
            next_cwd = str(web_dir)
            ui_env = {**base_env, "PORT": str(ui_port), "HOSTNAME": host}
        elif standalone_nested.exists():
            next_cmd = ["node", "server.js"]
            next_cwd = str(standalone_nested.parent)
            ui_env = {**base_env, "PORT": str(ui_port), "HOSTNAME": host}
        elif build_id.exists():
            next_cmd = ["npx", "next", "start", "--port", str(ui_port), "--hostname", host]
            next_cwd = str(web_dir)
            ui_env = base_env
        else:
            next_cmd = ["npx", "next", "dev", "--port", str(ui_port), "--hostname", host]
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
):
    """Recompute all auto-generated PRs from scratch across every program.

    Clears max_history rows with source 'import' or 'resync' (manual entries
    are preserved), then walks every program in chronological order and
    re-runs PR detection. Use after a PR-logic upgrade so historical rows
    pick up the new rules (e.g. per-(exercise, reps) tracking). Works
    against SQLite directly, no running API server required.
    """
    from datetime import datetime

    from .models.database import init_db, get_session
    from .models.orm import Program, MaxHistory
    from .services.pr_tracking import log_prs_for_program

    if not yes:
        confirm = typer.confirm(
            "This will delete all auto-generated PRs from max_history and "
            "rebuild them by walking every program. Manual entries are kept. "
            "Continue?"
        )
        if not confirm:
            raise typer.Abort()

    init_db(db)
    session = get_session(db)

    try:
        cleared = (
            session.query(MaxHistory)
            .filter(MaxHistory.source.in_(("import", "resync")))
            .delete(synchronize_session=False)
        )
        console.print(f"[yellow]Cleared[/yellow] {cleared} auto-generated max_history rows (manual entries kept)")
        session.commit()

        def sort_key(p: Program) -> tuple:


            for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%m/%d/%y"):
                try:
                    if p.date_start:
                        return (datetime.strptime(p.date_start.strip(), fmt), p.imported_at)
                except ValueError:
                    continue
            return (p.imported_at, p.imported_at)

        programs = sorted(session.query(Program).all(), key=sort_key)
        console.print(f"Processing {len(programs)} programs chronologically...")

        total_prs = 0
        for i, prog in enumerate(programs, 1):
            prs = log_prs_for_program(
                session,
                athlete_id=prog.athlete_id,
                program_id=prog.id,
                source="import",
            )
            total_prs += prs
            if i % 50 == 0:
                session.commit()
        session.commit()

        console.print(f"\n[bold green]Backfill complete[/bold green]: {total_prs} PRs logged")

        from sqlalchemy import func as sa_func

        table = Table(title="Rep PR distribution")
        table.add_column("Rep count", style="bold")
        table.add_column("PRs", justify="right")
        rep_rows = (
            session.query(MaxHistory.reps, sa_func.count())
            .filter(MaxHistory.reps.isnot(None))
            .group_by(MaxHistory.reps)
            .order_by(MaxHistory.reps)
            .all()
        )
        for reps, count in rep_rows:
            table.add_row(f"{reps}RM", str(count))
        total_count = session.query(sa_func.count()).filter(MaxHistory.lift == "total").scalar()
        table.add_row("Training total", str(total_count))
        console.print(table)
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


try:
    from bestrong_cloud.cli import register as _register_cloud_commands
except ImportError:
    pass
else:
    _register_cloud_commands(app)


def main():
    app()


if __name__ == "__main__":
    main()
