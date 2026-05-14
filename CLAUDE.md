---
name: agents
description: Always-loaded project anchor. Read this first. Contains project identity, non-negotiables, commands, and pointer to .mex/ROUTER.md for full context.
last_updated: 2026-05-14
---

# BeStrong HQ

## What This Is
Powerlifting coaching CRM and analytics platform. Parses training program spreadsheets, tracks athlete progression, manages meets, and monitors coaching workload via a browser dashboard.

## Non-Negotiables
- Every new ORM column must have a corresponding migration in `migrate_db()` in `bestrong/models/database.py`
- Never commit secrets or API keys; use `.env` for all credentials
- All API endpoints go through `Depends(get_db)` for database sessions; never call `get_session()` directly in route handlers
- Frontend API calls must use the `APIClient` class in `web/src/lib/api.ts`, no raw axios/fetch
- Check `web/AGENTS.md` and `web/node_modules/next/dist/docs/` before writing Next.js code; this is Next.js 16 with breaking changes from prior versions

## Commands
- Dev (API + UI): `bestrong run`. If that errors with "Unknown command: run", a global Community Edition `bestrong` shim is shadowing the project CLI; activate the project venv at `.venv` first, or invoke `.venv/bin/bestrong` directly.
- Test: run pytest on `tests/`
- Lint: run ruff check on `bestrong/`
- Frontend type-check: `cd web && npx tsc --noEmit`
- Resync from Drive: `bestrong resync-all`
- Docker: `docker compose up --build`
- Frontend dev: `cd web && npm run dev`

## After Every Task
If a `.mex/` directory exists locally (Alex's working notes, gitignored), update `.mex/ROUTER.md` and any other `.mex/` files that are now out of date. If no pattern existed for the task you just completed, create one in `.mex/patterns/`. Public contributors without `.mex/` can ignore this section.

## Navigation
If a `.mex/ROUTER.md` exists locally, read it first; it has full project context, patterns, and task guidance. Otherwise this file plus the docs in `docs/` are the canonical entry points.
