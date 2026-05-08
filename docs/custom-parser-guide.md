# Custom Parser Guide

BeStrong HQ ships with a default `bestrong` parser for the public 4-day and
5-day Google Sheets templates:

- [4-day template](https://docs.google.com/spreadsheets/d/1ssQenOGnuRsti_l97GCFJicgsJpEhUjDbfckuVgZYKA/copy)
- [5-day template](https://docs.google.com/spreadsheets/d/10nngfk-GLd9qQobHO0WPgyW8-W9bjJ38RSDd8ywvqAg/copy)

If your team uses a different spreadsheet layout, write a custom parser adapter.
This guide assumes basic Python comfort. You do not need to be a senior
developer, but you should be comfortable editing a Python file and running a
small test command.

## Do Not Overwrite the Default Parser

Do not replace `bestrong/parser/adapters/bestrong_parser.py`.

Instead, add your own file next to it, for example:

```text
bestrong/parser/adapters/my_team.py
```

When the app starts, parser adapter modules in that folder are imported and any
class decorated with `@register` becomes available to the parser engine. Keeping
your parser in a separate file means updates can keep the built-in parser intact.

## How Adapters Work

Every adapter is a Python class with:

- `name`: a unique parser id, such as `"my_team"`
- `description`: a short human-readable description
- `can_parse(workbook)`: returns `True` when the adapter recognizes a workbook
- `extract(workbook, filename)`: returns a `ProgramData` object

BeStrong HQ auto-detects the first adapter whose `can_parse()` returns `True`.
Keep the adapter's `name` unique so logs and parser errors are easy to read.

## Data Shape

Your adapter's `extract()` method returns `ProgramData`.

Skeleton — just the shape, no real data:

```python
from bestrong.parser.adapters import BaseAdapter, ProgramData, register


@register
class MyTeamAdapter(BaseAdapter):
    name = "my_team"
    description = "My team's program format"

    @staticmethod
    def can_parse(workbook):
        return False  # tighten this once you can detect your layout

    def extract(self, workbook, filename: str = "") -> ProgramData:
        ...  # build and return a ProgramData
```

Working example with one session and one exercise:

```python
from bestrong.parser.adapters import (
    AthleteInfo,
    BaseAdapter,
    ExerciseRow,
    ProgramData,
    SessionData,
    SessionInfo,
    register,
)


@register
class MyTeamAdapter(BaseAdapter):
    name = "my_team"
    description = "My team's program format"

    @staticmethod
    def can_parse(workbook):
        return "Program" in workbook.sheetnames

    def extract(self, workbook, filename: str = "") -> ProgramData:
        return ProgramData(
            athlete=AthleteInfo(name="Example Athlete"),
            program_name=filename,
            program_number=1,
            date_start="01/01/26",
            date_end="01/28/26",
            block_type="Strength Block",
            sessions=[
                SessionData(
                    info=SessionInfo(
                        week_number=1,
                        day_number=1,
                        day_name="Day 1",
                    ),
                    exercises=[
                        ExerciseRow(
                            exercise_name="Competition Squat",
                            exercise_order=1,
                            exercise_group=1,  # groups exercises shown together (e.g., supersets)
                            set_type="top_set",
                            lift_category="squat",
                            sets=1,
                            reps=3,
                            weight_lbs=405,
                            target_rpe="8",
                            actual_rpe=8.5,
                        )
                    ],
                )
            ],
            primary_squat_day=1,
            primary_bench_day=2,
            primary_deadlift_day=3,
        )
```

See the full type definitions in
[`bestrong/parser/adapters/__init__.py`](../bestrong/parser/adapters/__init__.py).

## Step 1: Create an Adapter File

Start from a copy of the built-in parser if your layout is similar:

```bash
cp bestrong/parser/adapters/bestrong_parser.py bestrong/parser/adapters/my_team.py
```

Then edit:

- the class name
- `name`
- `description`
- `can_parse()`
- `extract()`

Give `name` a unique value. Do not leave it as `"bestrong"`.

## Step 2: Make `can_parse()` Specific

`can_parse()` should return `True` only for your spreadsheet layout. Look for
something stable:

- a required sheet name
- a title cell
- a logo/header marker
- a unique set of columns

Example:

```python
@staticmethod
def can_parse(workbook):
    if "Training Plan" not in workbook.sheetnames:
        return False
    ws = workbook["Training Plan"]
    return ws["A1"].value == "My Team Programming"
```

Avoid returning `True` for every workbook. If multiple adapters match, the first
matching adapter wins.

## Step 3: Extract Program Data

Inside `extract()`:

1. Read the workbook with `openpyxl`.
2. Find athlete/program metadata.
3. Loop through weeks, days, and exercise rows.
4. Create `SessionData` and `ExerciseRow` records.
5. Return one `ProgramData`.

Useful fields:

- `ProgramData.date_start` / `date_end`
- `ProgramData.weekly_volume`
- `ProgramData.daily_wellness`
- `ProgramData.primary_squat_day`
- `ProgramData.primary_bench_day`
- `ProgramData.primary_deadlift_day`
- `ExerciseRow.weight_expected`
- `ExerciseRow.rpe_expected`
- `ExerciseRow.rpe_needs_review`

Use `parse_rpe_cell` for messy RPE notation:

```python
from bestrong.parser.rpe_cell import parse_rpe_cell
```

## Multi-Program Workbooks

Most adapters return one `ProgramData` from `extract()`.

If one workbook contains several separate programs, you can also implement:

```python
def extract_all(self, workbook, filename: str = "") -> list[ProgramData]:
    ...
```

When present, the import service can use `extract_all()` to create or update
multiple program records from one workbook.

The `parse_file()` pipeline test in Step 4 only exercises single-program
extraction. If your adapter implements `extract_all()`, test it directly
(`MyTeamAdapter().extract_all(wb, filename)`) or end-to-end through Drive
sync after rebuilding Docker.

## Step 4: Test Locally

Put a sample spreadsheet in `tests/fixtures/`, then save this as
`scripts/test_my_team.py` (or any path outside `bestrong/`):

```python
import openpyxl
from bestrong.parser.adapters.my_team import MyTeamAdapter

wb = openpyxl.load_workbook("tests/fixtures/your_sheet.xlsx", data_only=True)
data = MyTeamAdapter().extract(wb, "your_sheet.xlsx")

print(f"{len(data.sessions)} sessions, athlete: {data.athlete.name}")
for s in data.sessions[:2]:
    print(f"  Week {s.info.week_number} Day {s.info.day_number}: {len(s.exercises)} exercises")
```

Run it:

```bash
python scripts/test_my_team.py
```

To exercise the full parser pipeline (auto-detect + extract), use:

```python
from bestrong.parser.pipeline import parse_file
data = parse_file("tests/fixtures/your_sheet.xlsx")
print(data.athlete.name, len(data.sessions))
```

## Step 5: Rebuild Docker

If you run BeStrong HQ through Docker, rebuild after adding or editing an
adapter:

```bash
cd BeStrongHQ/docker
docker compose build
docker compose up -d
```

Then sync a test sheet from Google Drive.

## Common Gotchas

- **Merged cells:** `cell.value` is only set on the top-left cell of a merged range.
- **Colors:** use `cell.fill.fgColor.rgb`, and save important colors as constants.
- **RPE notation:** use `parse_rpe_cell` instead of writing a one-off parser.
- **Empty rows:** guard every cell read with a `None` check.
- **Exercise grouping:** set `exercise_group` consistently so supersets and repeated exercise blocks stay understandable.
- **Filename metadata:** Drive sync passes the real Google Drive title into the parser, so use the `filename` argument when you need program number or date ranges.
- **Adapter identity:** keep a unique `name`; do not reuse `"bestrong"` for a custom parser.

## When to Ask for Help

If you have spent more than a couple of hours and still cannot get a clean parse,
email **alex@bestronghq.com** with "Custom parser" in the subject. You can build
a parser yourself or commission one tailored to your spreadsheet format.
