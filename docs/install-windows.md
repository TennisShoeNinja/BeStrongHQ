# Installing BeStrong HQ on Windows

This guide walks you through setting up BeStrong HQ on Windows. No programming experience required.

> **You will need a Google account.** BeStrong HQ imports training programs from Google Drive. There's no manual file-upload path — Drive sync is the only way to get spreadsheet data into the app. Budget about 10 extra minutes for the Google setup at the end.

## The easy way: one-line install

This is the recommended path. Open **Command Prompt** (press the Windows key, type `cmd`, hit Enter), then paste this single line and press Enter:

```
curl -L -o "%TEMP%\install.bat" https://raw.githubusercontent.com/TennisShoeNinja/BeStrongHQ/main/install.bat && "%TEMP%\install.bat"
```

The installer will:

1. Check that you have `winget` (the Windows package manager that ships with Windows 10 and 11)
2. Install **Python 3.12**, **Node.js LTS**, and **Git** if you don't already have them
3. Clone BeStrong HQ to `%USERPROFILE%\BeStrongHQ`
4. Install the Python and Node dependencies and build the frontend

It takes 10–15 minutes. You'll see progress messages as each step runs. When it finishes, jump down to **[Final step: Google Setup](#final-step-google-setup)**.

> **If the installer fails with "winget is not recognized"** — your Windows version is too old or the App Installer is missing. Open the Microsoft Store, search for **App Installer**, and update or install it. Then close Command Prompt and try the one-liner again. If that still doesn't work, follow the [Manual installation](#manual-installation) section below.

> **If the installer fails part-way through** — it's safe to re-run. Close Command Prompt, open a new one (so the PATH refreshes with anything that did install), and paste the one-liner again. Already-installed pieces are skipped automatically.

## Final step: Google Setup

BeStrong HQ uses Google Drive to import program spreadsheets. There's no manual upload, so this step is required even if you only want to test with a single athlete. Follow the [Google Setup guide](google-setup.md) — it'll walk you through creating the OAuth credentials and laying out your Drive folder.

## Start BeStrong HQ

```
cd %USERPROFILE%\BeStrongHQ
bestrong run
```

Open your browser and go to **http://127.0.0.1:3000**. You should see the BeStrong HQ dashboard.

> Use `127.0.0.1`, not `localhost`. They usually behave the same, but Google OAuth treats them as different origins, so sticking with `127.0.0.1` everywhere keeps things consistent with the redirect URIs you registered in Google Setup.

## Stopping and Restarting

To stop BeStrong HQ, go back to Command Prompt and press **Ctrl + C**.

To start it again later:

```
cd %USERPROFILE%\BeStrongHQ
bestrong run
```

Your data is saved automatically. Nothing is lost when you stop the app.

## Updating

Re-run the installer. It detects an existing checkout and `git pull`s the latest changes instead of cloning fresh:

```
curl -L -o "%TEMP%\install.bat" https://raw.githubusercontent.com/TennisShoeNinja/BeStrongHQ/main/install.bat && "%TEMP%\install.bat"
```

Your database and `.env` are preserved across updates — only the app code changes.

---

## Manual installation

Use this if the one-liner fails, you want to install somewhere other than `%USERPROFILE%\BeStrongHQ`, or you just want to see what's happening.

### Step 1: Install Python, Node.js, and Git

Open **Command Prompt** and run these one at a time:

```
winget install --id Python.Python.3.12 -e
winget install --id OpenJS.NodeJS.LTS -e
winget install --id Git.Git -e
```

The first time you run a `winget install`, it may ask you to accept the source agreements — type **Y** and press Enter.

**Then close Command Prompt completely and open a fresh window.** Newly installed tools don't show up on PATH in your current session, only in fresh ones.

Verify everything is on PATH:

```
python --version
node --version
git --version
```

You should see Python 3.12.x, Node v20+ (or v22), and Git 2.x.

### Step 2: Download BeStrong HQ

```
cd %USERPROFILE%
git clone https://github.com/TennisShoeNinja/BeStrongHQ.git
cd BeStrongHQ
```

### Step 3: Install BeStrong HQ

Run these one at a time, from inside the `BeStrongHQ` folder:

```
python -m pip install -e .
cd web
npm install
npm run build
cd ..
```

`npm run build` is technically optional, but strongly recommended: it pre-compiles the UI so the first page load is fast instead of waiting 30–60 seconds for the dev server to compile on demand.

### Step 4: Continue from "Final step: Google Setup" above

---

## Troubleshooting

**"winget is not recognized"**. Your Windows version is too old or App Installer is missing. Open the Microsoft Store, search for **App Installer**, install or update it, then reopen Command Prompt.

**"Python was not found; run without arguments to install from the Microsoft Store..."**. This is the Microsoft Store stub kicking in. Either Python isn't actually installed, or the MS Store stub is winning the PATH race. To disable the stub: **Settings → Apps → Advanced app settings → App execution aliases**, then turn off both `python.exe` and `python3.exe`. Close and reopen Command Prompt.

**"python is not recognized"**. Close Command Prompt and open a fresh window — the PATH won't refresh in your current session after install. If you used the manual installer instead of `winget` and skipped the "Add to PATH" checkbox, re-run the Python installer, choose **Modify**, check **"Add Python to environment variables"**, and finish.

**"pip is not recognized"** (common in PowerShell). Use `python -m pip install -e .` instead of `pip install -e .`. The `python -m pip` form always works as long as `python` itself is on PATH.

**"bestrong is not recognized"**. Close Command Prompt and open a new one. If that doesn't work, the Python `Scripts\` folder isn't on your PATH. Run `python -m bestrong run` instead.

**"address already in use"**. Something else is running on port 3000 or 8080. Either close that application or check if BeStrong HQ is already running in another Command Prompt window.

**`npm install` fails**. Try running Command Prompt as Administrator (right-click the Command Prompt icon, "Run as administrator"), then run the install commands again. If you see "MAX_PATH" errors, enable long paths: open PowerShell as Administrator and run `New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" -Name "LongPathsEnabled" -Value 1 -PropertyType DWORD -Force`, then reboot.

**The installer hangs at "Installing Node dependencies"**. `npm install` is slow on a fresh machine — give it 5–10 minutes. If it's been longer than 15 minutes with no output, press Ctrl+C, close Command Prompt, open a new one, and re-run the installer.
