# Repository Layout

Top-level directories in this repo:

- **`bestrong/`** — Python application: the FastAPI backend, parser adapters,
  ORM models, CLI commands, and shared business logic. The single source of
  truth for what the app does.
- **`web/`** — Next.js 16 frontend (TypeScript + React 19). The dashboard UI
  served at the app's root URL. Talks to `bestrong/` over HTTP.
- **`tests/`** — pytest suite for the Python backend. Runs with plain `pytest`
  from the repo root.
- **`docs/`** — Documentation for contributors and self-hosters. Architecture
  notes, parser-onboarding guides, deployment overview.
- **`.github/`** — GitHub Actions workflows and issue templates.

Root files of note:

- `pyproject.toml` — Python package metadata, dependencies, lint config.
- `web/package.json` — Frontend dependencies.
- `.env.example` — Reference for required environment variables. Copy to `.env`
  for local development.
- `CLAUDE.md`, `CONTRIBUTING.md` — Conventions for contributors (and AI
  assistants) working in this repo.
