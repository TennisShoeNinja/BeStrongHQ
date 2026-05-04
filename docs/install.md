# Install BeStrong HQ (Community Edition)

Community Edition is the free, self-hosted version of BeStrong HQ. Install it on your own machine and your data stays local. Nothing is uploaded to us, nothing leaks to a third party, your athletes' data lives in a SQLite file on your own disk.

> **First-time installer? Don't use Quick Start.** It assumes Python and Node are already installed. If you're new, jump straight to your platform's step-by-step guide below — they walk you through installing the prerequisites first.

## Quick Start

You need Python 3.10+ and Node.js 20+ already installed, then:

```bash
git clone https://github.com/TennisShoeNinja/BeStrongHQ.git
cd BeStrongHQ
python -m pip install -e .
cd web && npm install && npm run build && cd ..
bestrong run
```

> **On Windows PowerShell**, the `&&` chain doesn't work in PowerShell 5.1 (the default). Run the `cd web`, `npm install`, `npm run build`, `cd ..` lines one at a time instead. Also: `pip` may not be on PATH even when `python` is, so always use `python -m pip install -e .` rather than bare `pip`.

> On macOS/Linux with multiple Python versions, `python3 -m pip install -e .` is the safest form.

Open **http://127.0.0.1:3000** in your browser.

> Drive sync is the only way to import program spreadsheets — there's no manual file upload. You'll need to set up Google Drive OAuth credentials before your first sync. See [Google Setup](google-setup.md) for the 5-minute walkthrough.

## Installation Guides

New to this? Follow the step-by-step guide for your platform:

- [macOS](install-mac.md)
- [Windows](install-windows.md)
- [Raspberry Pi](install-raspberry-pi.md)

Each install guide covers everything you need: prerequisites, Google setup, and first run.

> **On Linux?** The Raspberry Pi guide works for any Debian-based Linux distribution (Ubuntu, Debian, Pop!_OS, etc.). The commands are identical.

## Google Setup

BeStrong HQ Community Edition uses Google Drive to import program spreadsheets, and (optionally) Google Calendar to push meet schedules. There's no built-in user login — your local machine is the access boundary — so the only OAuth client you need to create is for Drive (and Calendar if you want it). See the [Google Setup guide](google-setup.md) for the step-by-step.

## The Parser

Ships with the default `bestrong` parser and two ready-to-use program templates hosted on Google Sheets. Make a copy into your own Drive, fill it in for each athlete, and BeStrong HQ extracts athletes, sessions, sets, reps, weight, RPE, and accessory work across Strength, Peaking, and Hypertrophy blocks.

- **4-day template:** [Make a copy](https://docs.google.com/spreadsheets/d/1ssQenOGnuRsti_l97GCFJicgsJpEhUjDbfckuVgZYKA/copy)
- **5-day template:** [Make a copy](https://docs.google.com/spreadsheets/d/10nngfk-GLd9qQobHO0WPgyW8-W9bjJ38RSDd8ywvqAg/copy)

> **These are demo programs, not training prescriptions.** Don't use them to train anyone. They're fabricated to show you the spreadsheet structure the default parser understands. Swap in your own volumes, intensities, and exercise selection for real athletes; just keep the structural pieces below intact and the parser will pick up the rest.

### What the parser actually reads

- **Compound color coding.** The exercise-name cell color tells the parser whether a row is a compound or an accessory. The default palette uses Google Sheets' named colors:
  - **Light yellow 3** (`#FFF2CC`) = Squat
  - **Light green 3** (`#D9EAD3`) = Bench
  - **Light cornflower blue 3** (`#C9DAF8`) = Deadlift
  - Anything else (white, bright yellow, etc.) is treated as an accessory.
- **Pink RPE cell.** Cells painted **light red berry 2** (`#EA9999`) in the RPE column are athlete-input cells: the parser reads what your athlete typed there as the RPE they actually hit, and that number drives the RPE Compliance card. Unpainted RPE cells are treated as prescribed-only and ignored for compliance.
- **Green weight cell.** Cells painted **light green 2** (`#B6D7A8`) on the weight column are the "what you hit" input. The parser uses these for actuals (what you load into PR detection and e1RM trends), and the prescribed weight in the unpainted cell as the target.
- **Set type by row position.** Top sets vs backdown sets are inferred from the row layout in each day block. Keep the template's row order and the e1RM estimator and PR detector pick the right rows automatically.
- **Day numbering.** Each day in the program is labeled `Day 1`, `Day 2`, etc. In the BeStrong HQ app, you tag which day is the "real" squat / bench / deadlift session, so your charts track the same session week-over-week.
- **Filename pattern.** Program metadata comes straight from the filename: `Athlete's Program N – (MM/DD/YY – MM/DD/YY) – Theme`. Example: `Sam's Program 3 – (1/15/26 – 2/5/26) – Strength Block`. The parser pulls the athlete name, program number, date range, and block theme (Strength / Peaking / Hypertrophy) from this string. Match the pattern when you save each athlete's copy.

Already have your own spreadsheet format? Build your own parser with the [Custom Parser Guide](custom-parser-guide.md), or email **alex@bestronghq.com** (subject: "Custom parser") for a free 15-minute consultation and we'll build it with you.
