# Custom Parser Guide

BeStrong HQ ships with the default `bestrong` parser, which handles the bundled spreadsheet templates (`templates/bestrong_template_4day.xlsx` and `bestrong_template_5day.xlsx`). If your team uses a different format (different column order, different rep/RPE notation, weeks arranged vertically instead of horizontally), you'll want to write your own parser.

This guide walks through how. It assumes basic Python comfort. **You don't need to be a senior dev.** If you can read code and ask an AI assistant good questions, you can do this.

## Don't want to do this yourself?

Email **alex@bestronghq.com** with "Custom parser" in the subject. Free 15-minute consultation, hourly rate after that based on how messy your spreadsheet is. Or skip the work entirely with the [Hosted Version](https://bestronghq.com). Custom parsers are included in Team and Gym plans.

## How adapters work

Every adapter is a Python file with two methods:

- **`can_parse(workbook)`:** returns `True` if this adapter recognizes the workbook's structure (typically by checking sheet names, header cells, or layout markers)
- **`extract(workbook, filename)`:** does the actual parsing and returns a `ProgramData` object

The parser engine auto-discovers all registered adapters at startup and picks the first one whose `can_parse()` returns `True`.

### Where the file goes

If you're **self-hosting** the Community edition (this guide's audience), drop your adapter in `bestrong/parser/adapters/` alongside the bundled `bestrong_parser.py`. That's the only path the public package ships with, and the loader picks up everything in there automatically.

If you're on the **Hosted version**, you don't write or place the file yourself. Alex builds it and it lands in the private hosted overlay (a separate directory not part of the open-source package). Same `BaseAdapter` interface, same workflow on your end: tell us your spreadsheet format and we install it. This is what the "custom parser" line item on Team and Gym plans covers.

## The data shape you need to produce

Your `extract()` method must return a `ProgramData` containing:

```python
ProgramData(
    athlete=AthleteInfo(name="...", squat_max_lbs=..., ...),
    program_name="...",
    program_number=1,
    block_type="strength",        # "strength" | "peaking" | "hypertrophy"
    sessions=[
        SessionData(
            info=SessionInfo(week_number=1, day_number=1, day_name="Monday"),
            exercises=[
                ExerciseRow(
                    exercise_name="Competition Squat",
                    exercise_order=1,
                    set_type="top_set",         # "top_set" | "backdown" | "accessory"
                    lift_category="squat",      # "squat" | "bench" | "deadlift" | "accessory"
                    sets=1, reps=3, weight_lbs=405, target_rpe="8", actual_rpe=8.5,
                ),
                # ... more exercises
            ],
        ),
        # ... more sessions
    ],
    primary_squat_day=1,
    primary_bench_day=2,
    primary_deadlift_day=3,
)
```

See the full type definitions in [`bestrong/parser/adapters/__init__.py`](../bestrong/parser/adapters/__init__.py).

## Step-by-step

### 1. Copy the existing adapter as a starting point

```bash
cp bestrong/parser/adapters/bestrong_parser.py bestrong/parser/adapters/my_team.py
```

Open it. Don't worry about understanding every line. Focus on the shape.

### 2. Update the class metadata

```python
@register
class MyTeamAdapter(BaseAdapter):
    name = "my_team"                    # match your subdomain if you're going hosted
    description = "My team's program format"

    @staticmethod
    def can_parse(workbook):
        # Return True only for YOUR spreadsheet layout.
        # Look for something unique: a sheet name, a header cell, a logo cell.
        return "MyTeamHomePage" in workbook.sheetnames
```

### 3. Use AI to translate your spreadsheet into the parser

This is where AI assistance shines. Open Claude (or your AI of choice) and paste:

> I'm writing a Python parser for a powerlifting spreadsheet. The target output is a `ProgramData` object with this shape: [paste the example above].
>
> My spreadsheet looks like this: [describe the layout: where weeks live, where days live, where RPE/weight/reps are stored, what color codes mean, anything special].
>
> Here's the existing parser I'm modifying as a reference: [paste `bestrong_parser.py`].
>
> Help me modify the `extract()` method to read my layout instead.

Iterate. Drop the AI a screenshot of your sheet. It'll get most of the way there in one or two passes.

### 4. Test it

Drop a sample copy of your spreadsheet into `tests/fixtures/` and run:

```bash
python -c "
import openpyxl
from bestrong.parser.adapters.my_team import MyTeamAdapter
wb = openpyxl.load_workbook('tests/fixtures/your_sheet.xlsx', data_only=True)
data = MyTeamAdapter().extract(wb, 'your_sheet.xlsx')
print(f'{len(data.sessions)} sessions, athlete: {data.athlete.name}')
for s in data.sessions[:2]:
    print(f'  Week {s.info.week_number} Day {s.info.day_number}: {len(s.exercises)} exercises')
"
```

If sessions and exercises come out right, you're done. Rebuild the container so it picks up your adapter (`cd BeStrongHQ/docker && docker compose build && docker compose up -d`), sync a sheet from Google Drive, and your adapter will pick it up automatically.

### 5. Commit it (optional, but encouraged)

If your adapter handles a common spreadsheet format that other coaches might use, open a PR. Other coaches benefit, you get credit in the [Contributors](../README.md#contributors) section.

## Common gotchas

- **Merged cells:** `cell.value` is only set on the top-left of a merged range. Use `worksheet.merged_cells` to detect them.
- **Color-coded cells:** coaches often use fill color to mark set type (top set vs. backdown). Check `cell.fill.fgColor.rgb`. Save common colors as constants at the top of your adapter so the AI can find them.
- **RPE notation varies:** "@8", "8 RPE", "RPE 8", "8/10". Use `bestrong/parser/rpe_cell.py` (`parse_rpe_cell`); it handles most variants already.
- **Empty rows:** guard every cell read with a None check. Coaches leave blank rows for spacing all the time.
- **Weeks arranged vertically vs. horizontally:** the biggest source of structural difference. Decide your iteration order first, then everything else falls into place.

## When to ask for help

If you've spent more than two hours and still can't get a clean parse, email **alex@bestronghq.com**. Often it's a one-line fix when someone who's seen a hundred of these takes a look.
