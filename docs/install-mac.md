# Installing BeStrong HQ on macOS

This guide walks you through setting up BeStrong HQ on a Mac. No programming experience required.

> **You will need a Google account.** BeStrong HQ imports training programs from Google Drive. There's no manual file-upload path — Drive sync is the only way to get spreadsheet data into the app. Budget about 10 extra minutes for the Google setup at the end.

## The easy way: one-line install

Open **Terminal** (Cmd+Space, type `Terminal`, press Enter), paste this single line, and press Enter:

```bash
curl -fsSL https://raw.githubusercontent.com/TennisShoeNinja/BeStrongHQ/main/install.sh | bash
```

The installer:

1. Installs **Homebrew** if you don't have it (will ask for your Mac password)
2. Installs **Python 3.12** and **Node.js LTS** via Homebrew
3. Asks where you want BeStrong HQ installed (default: `~/BeStrongHQ`)
4. Clones the repo, installs Python and Node dependencies, and builds the frontend

Walk away for 10–15 minutes. When it finishes, jump down to **[Final step: Google Setup](#final-step-google-setup)**.

> **If the installer fails part-way through** — it's safe to re-run. Already-installed pieces are skipped automatically. If a permissions issue trips up Homebrew, follow the [Manual installation](#manual-installation) section below.

## Final step: Google Setup

BeStrong HQ uses Google Drive to import program spreadsheets. Follow the [Google Setup guide](google-setup.md) — it'll walk you through creating the OAuth credentials and laying out your Drive folder.

## Start BeStrong HQ

```bash
cd ~/BeStrongHQ
bestrong run
```

Open your browser and go to **http://127.0.0.1:3000**.

> Use `127.0.0.1`, not `localhost`. They usually behave the same, but Google OAuth treats them as different origins.

## Stopping and Restarting

Stop with **Ctrl + C** in Terminal. Restart with `bestrong run` from the install folder. Your data persists across restarts.

## Updating

Re-run the installer. It detects an existing checkout and pulls latest:

```bash
curl -fsSL https://raw.githubusercontent.com/TennisShoeNinja/BeStrongHQ/main/install.sh | bash
```

---

## Manual installation

### Step 1: Install Homebrew

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

It'll ask for your Mac password (you won't see the characters as you type). When it finishes, it may show "Next steps" — run those commands exactly as shown:

```bash
echo >> ~/.zprofile
echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
eval "$(/opt/homebrew/bin/brew shellenv)"
```

### Step 2: Install Python and Node.js

```bash
brew install python@3.12 node
```

Most Macs already have Git. If `git --version` prompts for Xcode Command Line Tools, click **Install**.

### Step 3: Download BeStrong HQ

```bash
cd ~
git clone https://github.com/TennisShoeNinja/BeStrongHQ.git
cd BeStrongHQ
```

### Step 4: Install BeStrong HQ

```bash
python3 -m pip install -e .
cd web
npm install
NEXT_PUBLIC_API_URL=http://127.0.0.1:8080 npm run build
[ -f .next/standalone/server.js ] && cp -R .next/static .next/standalone/.next/ && cp -R public .next/standalone/
cd ..
```

Why each step:
- `NEXT_PUBLIC_API_URL` is baked in at build time so the frontend hits the FastAPI on 8080.
- The `cp` commands copy static assets into the standalone bundle that `next.config.js` produces. Without them, every JS chunk 404s.

### Step 5: Continue from "Final step: Google Setup" above

---

## Troubleshooting

**"command not found: bestrong"**. Close Terminal and open a new one. If that doesn't work, try `python3 -m pip install -e .` again from the BeStrongHQ folder.

**"command not found: brew"**. Make sure you ran the "Next steps" commands after installing Homebrew. Close Terminal, open a new one, try again.

**"address already in use"**. Something else is running on port 3000 or 8080.

**`npm install` fails with permission errors**. Don't use `sudo`. Try:
```bash
npm cache clean --force
cd ~/BeStrongHQ/web && npm install
```

**Dashboard loads to a white screen with "Loading..." forever**. The `NEXT_PUBLIC_API_URL` env var wasn't set when `npm run build` ran, or the standalone static-copy step was skipped. Both are fixed by re-running Step 4 above.
