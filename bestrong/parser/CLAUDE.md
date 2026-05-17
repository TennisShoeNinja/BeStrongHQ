# Parser Engine

Parses training-program `.xlsx` workbooks into structured `ProgramData`.

## Entry point
`parse_file(path, parser_id=None)` in `pipeline.py`. With a `parser_id`, the
adapter whose `name` matches is used directly and `can_parse` is bypassed; if no
adapter with that name is registered it raises `ParseError` rather than falling
back to auto-detection. With `parser_id=None`, each adapter's `can_parse` is
tried in registration order.

## Adding an adapter
- Subclass `BaseAdapter` (`adapters/__init__.py`): implement `can_parse`
  (staticmethod, returns bool) and `extract` (returns `ProgramData`), and
  decorate the class with `@register`.
- Drop the module into `bestrong/parser/adapters/`. It is auto-discovered by
  `load_local_adapters()` at import time, so there is no need to edit
  `adapters/__init__.py`.
- The bundled `bestrong_parser` is imported last, so a more specific custom
  adapter wins `can_parse` ordering during auto-detection.

## Conventions
- `extract()` returns a `ProgramData` (athlete, sessions, weekly_volume,
  daily_wellness). All the dataclasses live in `adapters/__init__.py`.
- Detect layout PER TAB by header content, never by tab index. A single
  workbook can mix layout eras and omit optional fields.
- Before writing a new adapter, run the structural scanner (`scanner.py`) over a
  staged corpus. It emits a markdown report of the tab, column, and color shape
  so the adapter is built from full-corpus knowledge, not a single example.

## Gotchas
- Workbooks are loaded with `data_only=True`, so formula cells return their last
  cached value, not the formula text.
- A single cell may pack multiple sets, and numeric ranges must be skipped
  rather than maxed. See `rpe_cell.py` for RPE-cell parsing.
