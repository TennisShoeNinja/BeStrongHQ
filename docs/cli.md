# CLI Commands

BeStrong HQ ships with a `bestrong` command for day-to-day operations. Run these from inside the `BeStrongHQ` folder.

```bash
bestrong run                 # Start both API + React UI
bestrong serve               # Start API server only
bestrong info                # Show database stats
bestrong resync-all          # Re-import every Drive program through the current parser
bestrong backfill-prs        # Recompute auto-generated PRs across every program
bestrong reset-db            # Wipe and recreate the database
```

## `bestrong run`

The main command. Starts the FastAPI backend on port 8080 and the Next.js frontend on port 3000. Open http://127.0.0.1:3000 in your browser. Stop with **Ctrl + C**.

## `bestrong serve`

Starts only the API server on port 8080. Useful if you want to run the frontend separately (e.g. during frontend development with `npm run dev`).

## `bestrong info`

Prints a quick summary of what's in your local database: athlete count, session count, program count. Handy for sanity-checking a sync.

## `bestrong resync-all`

Force-reimports every Google Drive program through whatever parser is currently configured. Use this after upgrading or swapping a parser so existing rows get re-classified with the new logic. Requires `bestrong run` (or `bestrong serve`) to be running so the API can download and re-parse sheets.

## `bestrong backfill-prs`

Recomputes all auto-generated PRs from scratch across every program. Clears `max_history` rows that came from import or resync (manual entries are preserved), then walks every program in chronological order and re-runs PR detection. Use after a PR-logic change so historical rows pick up the new rules. Works directly against SQLite, no running API server needed. Pass `--yes` to skip the confirmation prompt.

## `bestrong reset-db`

**Destructive.** Wipes the SQLite database and recreates it empty. Your Google Drive data is untouched, so you can re-sync afterward. Use this if your database has gotten into a weird state and you want to start fresh.
