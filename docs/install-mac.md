# Installing BeStrong HQ on macOS

This guide walks you through setting up BeStrong HQ on a Mac. No programming experience required.

> **You will need a Google account.** BeStrong HQ imports training programs from Google Drive. There's no manual file-upload path — Drive sync is the only way to get spreadsheet data into the app. Budget about 10 extra minutes for the Google setup at the end.

## The easy way: one-line install

This is the recommended path. Press **Cmd + Space**, type **Terminal**, hit Enter. Then paste this single line and press Enter:

```bash
curl -fsSL https://raw.githubusercontent.com/TennisShoeNinja/BeStrongHQ/main/install.sh | bash
```

The installer will:

1. Install **Homebrew** if you don't have it (it'll ask for your Mac password)
2. Install **Python 3.12** and **Node.js LTS** via Homebrew
3. Clone BeStrong HQ to `~/BeStrongHQ`
4. Install the Python and Node dependencies and build the frontend

It takes 10–15 minutes. You'll see progress messages as each step runs. When it finishes, jump down to **[Final step: Google Setup](#final-step-google-setup)**.

> **If the installer fails part-way through** — it's safe to re-run. Already-installed pieces are skipped automatically. If a permissions issue trips up Homebrew, follow the [Manual installation](#manual-installation) section below.

## Final step: Google Setup

BeStrong HQ uses Google Drive to import program spreadsheets. There's no manual upload, so this step is required even if you only want to test with a single athlete. Follow the [Google Setup guide](google-setup.md) — it'll walk you through creating the OAuth credentials and laying out your Drive folder.

## Start BeStrong HQ

```bash
cd ~/BeStrongHQ
bestrong run
```

Open your browser and go to **http://127.0.0.1:3000**. You should see the BeStrong HQ dashboard.

> Use `127.0.0.1`, not `localhost`. They usually behave the same, but Google OAuth treats them as different origins, so sticking with `127.0.0.1` everywhere keeps things consistent with the redirect URIs you registered in Google Setup.

## Stopping and Restarting

To stop BeStrong HQ, go back to Terminal and press **Ctrl + C**.

To start it again later:

```bash
cd ~/BeStrongHQ
bestrong run
```

Your data is saved automatically. Nothing is lost when you stop the app.

## Updating

Re-run the installer. It detects an existing checkout and `git pull`s the latest changes instead of cloning fresh:

```bash
curl -fsSL https://raw.githubusercontent.com/TennisShoeNinja/BeStrongHQ/main/install.sh | bash
```

Your database and `.env` are preserved across updates — only the app code changes.

---

## Manual installation

Use this if the one-liner fails, you want to install somewhere other than `~/BeStrongHQ`, or you just want to see what's happening.

### Step 1: Install Homebrew

Homebrew is the standard package manager for macOS. Paste this into Terminal:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

It will ask for your Mac password (the one you use to log in). Type it and press Enter — you won't see the characters as you type, but it's working.

When it finishes, it may show "Next steps" asking you to run a couple of commands to add Homebrew to your PATH. **Run those commands exactly as shown.** They usually look like:

```bash
echo >> ~/.zprofile
echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
eval "$(/opt/homebrew/bin/brew shellenv)"
```

### Step 2: Install Python and Node.js

```bash
brew install python@3.12 node
```

Most Macs already have Git installed. If `git --version` says it needs Xcode Command Line Tools, click **Install** when prompted.

### Step 3: Download BeStrong HQ

```bash
cd ~
git clone https://github.com/TennisShoeNinja/BeStrongHQ.git
cd BeStrongHQ
```

### Step 4: Install BeStrong HQ

```bash
python3 -m pip install -e .
cd web && npm install && npm run build && cd ..
```

`npm run build` is technically optional, but strongly recommended: it pre-compiles the UI so the first page load is fast instead of waiting 30–60 seconds for the dev server to compile on demand.

### Step 5: Continue from "Final step: Google Setup" above

---

## Troubleshooting

**"command not found: bestrong"**. Close Terminal and open a new one. If that doesn't work, try running `python3 -m pip install -e .` again from the BeStrongHQ folder.

**"command not found: brew"**. Make sure you ran the "Next steps" commands after installing Homebrew. Close Terminal, open a new one, and try again.

**"address already in use"**. Something else is running on port 3000 or 8080. Either close that application or check if BeStrong HQ is already running in another Terminal window.

**`npm install` fails with permission errors**. Do not use `sudo`. Instead, try:
```bash
npm cache clean --force
cd ~/BeStrongHQ/web && npm install && cd ..
```
