# Install BeStrong HQ

BeStrong HQ is free and self-hosted. Install it on your own machine via Docker and your data stays local. Nothing is uploaded to us, nothing leaks to a third party — your athletes' data lives in a SQLite file inside a Docker volume on your own disk.

> **Drive sync is the only way to import program spreadsheets** — there's no manual file upload. You'll need to set up Google Drive OAuth credentials before your first sync. See [Google Setup](google-setup.md) for the 5-minute walkthrough.

## What you need

- **Docker** installed on your machine. One install, every OS.
- **A Google account** for Drive sync.

That's it. We don't ask you to install Python, Node.js, Git, or any other toolchain. Docker handles everything.

## Step 1: Install Docker

Pick your platform:

### Windows

Download **Docker Desktop for Windows** from [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/). Run the installer and click through the defaults.

Docker Desktop on Windows uses WSL2 under the hood. The installer enables it for you if it isn't already on. After install, reboot if it asks you to.

### macOS

Download **Docker Desktop for Mac** from [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/). Pick the right architecture (Apple Silicon for M1/M2/M3, Intel for older Macs). Drag to Applications, launch it.

### Linux

```bash
curl -fsSL https://get.docker.com | sudo bash
sudo usermod -aG docker $USER
```

Then log out and back in (or `newgrp docker`) so your shell picks up the group change. Verify with `docker run hello-world`.

### Raspberry Pi

Same as Linux — the official `get.docker.com` script supports Raspberry Pi OS:

```bash
curl -fsSL https://get.docker.com | sudo bash
sudo usermod -aG docker $USER
```

Reboot the Pi or log out and back in.

## Step 2: Get BeStrong HQ

```bash
git clone https://github.com/TennisShoeNinja/BeStrongHQ.git
cd BeStrongHQ/docker
docker compose up -d
```

The first build takes 5–10 minutes on a desktop, 20–40 minutes on a Raspberry Pi (it compiles some packages from source). Subsequent starts are seconds — Docker only rebuilds when you change something.

When it finishes, open **http://127.0.0.1:3000** in your browser. You should see the BeStrong HQ dashboard.

> Use `127.0.0.1`, not `localhost`. They usually behave the same, but Google OAuth treats them as different origins, and you'll be registering `127.0.0.1` redirect URIs in the next step.

## Step 3: Google Setup (required for Drive sync)

BeStrong HQ uses Google Drive to import program spreadsheets. There's no manual upload, so this step is required even if you only want to test with one athlete. Follow the [Google Setup guide](google-setup.md) — it walks you through creating the OAuth credentials and laying out your Drive folder.

When you have your OAuth client ID and secret, create a `.env` file in the BeStrongApp root (one level above `docker/`):

```
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
```

Restart the container so it picks up the new env vars:

```bash
cd docker
docker compose down
docker compose up -d
```

## Daily use

```bash
cd BeStrongHQ/docker

docker compose up -d        # Start in background
docker compose down         # Stop
docker compose logs -f      # Tail logs
docker compose restart      # Restart without rebuilding
```

Your data persists across restarts and even across `docker compose down` — it lives in a Docker named volume, not in the container itself.

## Updating

```bash
cd BeStrongHQ
git pull
cd docker
docker compose build
docker compose up -d
```

Your database and OAuth tokens are preserved across updates.

## Backups, LAN access, and advanced usage

See [docker/README.md](../docker/README.md) for backup commands, instructions on accessing the app from other devices on your network, and advanced configuration.

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
