# Project Structure

```
BeStrongHQ/
├── bestrong/
│   ├── api/              # FastAPI routes, schemas, auth middleware
│   ├── models/           # SQLAlchemy ORM + database management
│   ├── parser/           # Spreadsheet parsing engine + adapters
│   ├── services/         # Import pipeline, max tracking, backfill
│   ├── analytics/        # e1RM calculation (Tuchscherer RPE table)
│   ├── gdrive/           # Google Drive OAuth + sync
│   ├── gcal/             # Google Calendar sync
│   ├── utils/            # Date helpers, log sanitizer, feature flags, OAuth config
│   └── cli.py            # Typer CLI entry point
├── web/                  # Next.js React frontend
│   ├── src/app/          # App Router pages
│   ├── src/components/   # Shared UI components (shadcn/ui)
│   └── src/lib/          # API client, auth provider, theme provider, types
├── tests/
│   └── fixtures/         # Test spreadsheets
└── pyproject.toml
```

## Where things live

- **Adding a new API route?** `bestrong/api/routes_*.py`. Pydantic schemas live in `bestrong/api/schemas.py` or inline in the route file.
- **Adding a new database column?** Update the ORM in `bestrong/models/` *and* add a migration to `migrate_db()` in `bestrong/models/database.py`.
- **Writing a parser for a new spreadsheet format?** Drop an adapter in `bestrong/parser/adapters/`. See the [Custom Parser Guide](custom-parser-guide.md).
- **Adding a frontend page?** `web/src/app/<route>/page.tsx`. API calls go through the `APIClient` class in `web/src/lib/api.ts`, never raw `fetch`/`axios`.
