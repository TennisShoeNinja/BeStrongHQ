# CLI Commands

BeStrong HQ ships with a `bestrong` command for day-to-day operations. Since Community Edition runs in Docker, run these *inside* the container via `docker compose exec`. From the `BeStrongHQ/docker/` folder:

```bash
docker compose exec bestrong bestrong info             # Show database stats
docker compose exec bestrong bestrong resync-all       # Re-import every Drive program through the current parser
docker compose exec bestrong bestrong backfill-prs     # Recompute auto-generated PRs across every program
docker compose exec bestrong bestrong reset-db         # Wipe and recreate the database
```

> The container is already running `bestrong run` as its main process (started by `docker compose up`), so you don't run that one yourself. The commands below operate against the same container, against the same SQLite database mounted at `/data`.

> **Tip:** if you'll be running several commands, `docker compose exec bestrong bash` opens a shell inside the container. From there you can just type `bestrong info`, `bestrong reset-db`, etc. directly without the prefix.

## `bestrong info`

Prints a quick summary of what's in your local database: athlete count, session count, program count. Handy for sanity-checking a sync.

## `bestrong resync-all`

Force-reimports every Google Drive program through whatever parser is currently configured. Use this after upgrading or swapping a parser so existing rows get re-classified with the new logic. Requires the container to be running (which it normally is — `docker compose ps` should show it `Up`).

## `bestrong backfill-prs`

Recomputes all auto-generated PRs from scratch across every program. Clears `max_history` rows that came from import or resync (manual entries are preserved), then walks every program in chronological order and re-runs PR detection. Use after a PR-logic change so historical rows pick up the new rules. Works directly against SQLite, no running API server needed. Pass `--yes` to skip the confirmation prompt.

## `bestrong reset-db`

**Destructive.** Wipes the SQLite database and recreates it empty. Your Google Drive data is untouched, so you can re-sync afterward. Use this if your database has gotten into a weird state and you want to start fresh.

## Starting and stopping the app

These are not `bestrong` subcommands — they're Docker compose commands you run from `BeStrongHQ/docker/`:

```bash
docker compose up -d        # Start in background
docker compose down         # Stop
docker compose restart      # Restart without rebuilding
docker compose logs -f      # Tail logs
docker compose ps           # Check container status
```

See [docker/README.md](../docker/README.md) for backups, updates, and LAN access.
