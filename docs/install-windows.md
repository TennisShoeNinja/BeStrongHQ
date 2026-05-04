# Installing BeStrong HQ on Windows

This guide walks you through setting up BeStrong HQ on Windows. No programming experience required.

> **You will need a Google account.** BeStrong HQ imports training programs from Google Drive. There's no manual file-upload path — Drive sync is the only way to get spreadsheet data into the app. Budget about 10 extra minutes for the Google setup at the end.

## The easy way: one-line install

Open **Command Prompt** (Windows key, type `cmd`, press Enter), paste this single line, and press Enter:

```
curl -L -o "%TEMP%\install.bat" https://raw.githubusercontent.com/TennisShoeNinja/BeStrongHQ/main/install.bat && "%TEMP%\install.bat"
```

The installer:

1. Checks for `winget` (the Windows package manager that ships with Windows 10 and 11)
2. Installs **Python 3.12**, **Node.js LTS**, and **Git** if you don't already have them
3. Asks where you want BeStrong HQ installed (default: `BeStrongHQ` inside whatever folder you ran the command from)
4. Clones the repo, installs Python and Node dependencies, and builds the frontend

Walk away for 10–15 minutes. When it finishes, jump down to **[Final step: Google Setup](#final-step-google-setup)**.

> **If the installer fails with "winget did not respond"** — your Windows version is too old or App Installer is missing. Open the Microsoft Store, search for **App Installer**, and click Update or Get. Then close Command Prompt and try the one-liner again. If that still doesn't work, follow the [Manual installation](#manual-installation) section below.

> **If the installer fails part-way through** — it's safe to re-run. Close Command Prompt, open a fresh one, and paste the one-liner again. Already-installed pieces are skipped automatically.

## Final step: Google Setup

BeStrong HQ uses Google Drive to import program spreadsheets. There's no manual upload, so this step is required even if you only want to test with a single athlete. Follow the [Google Setup guide](google-setup.md) — it'll walk you through creating the OAuth credentials and laying out your Drive folder.

## Start BeStrong HQ

Open a **fresh** Command Prompt (so PATH picks up the newly installed tools), then:

```
cd %USERPROFILE%\BeStrongHQ
bestrong run
```

(Substitute the path you chose during install if it wasn't the default.) Open your browser and go to **http://127.0.0.1:3000**.

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

Use this if the one-liner fails, you want full visibility into each step, or you prefer to install the prerequisites yourself.

### Step 1: Install Python, Node.js, and Git

In Command Prompt, run these one at a time (press Y if prompted to accept source agreements):

```
winget install --id Python.Python.3.12 -e
winget install --id OpenJS.NodeJS.LTS -e
winget install --id Git.Git -e
```

**Then close Command Prompt completely and open a fresh window.** Newly installed tools don't show up on PATH in your current session, only in fresh ones.

Verify:

```
python --version
node --version
git --version
```

### Step 2: Download BeStrong HQ

```
cd %USERPROFILE%
git clone https://github.com/TennisShoeNinja/BeStrongHQ.git
cd BeStrongHQ
```

### Step 3: Install BeStrong HQ

Run these one at a time:

```
python -m pip install -e .
cd web
npm install
set NEXT_PUBLIC_API_URL=http://127.0.0.1:8080
npm run build
xcopy /E /I /Y .next\static .next\standalone\.next\static
xcopy /E /I /Y public .next\standalone\public
cd ..
```

Why each step:
- `python -m pip install -e .` installs the BeStrong CLI and Python deps. Use `python -m pip` (not bare `pip`) so it works in PowerShell too.
- `set NEXT_PUBLIC_API_URL=...` is read by Next.js at *build time* and baked into the bundle. Without it, the frontend tries `/api` paths against port 3000 instead of the FastAPI on 8080, leaving the dashboard stuck on "Loading..." forever.
- The `xcopy` lines copy static assets into the standalone bundle that `next.config.js` produces. Without them, every JS chunk 404s when you load the page.

### Step 4: Continue from "Final step: Google Setup" above

---

## Troubleshooting

**"winget did not respond"**. Your Windows version is too old or App Installer is missing. Open the Microsoft Store, search for **App Installer**, install or update it, then reopen Command Prompt.

**"Python was not found; run without arguments to install from the Microsoft Store..."**. This is the Microsoft Store stub kicking in. Either Python isn't actually installed yet, or the MS Store stub is winning the PATH race. To disable the stub: **Settings → Apps → Advanced app settings → App execution aliases**, then turn off both `python.exe` and `python3.exe`. Close and reopen Command Prompt.

**"python is not recognized"**. Close Command Prompt and open a fresh window — PATH won't refresh in your current session after install.

**"pip is not recognized"** (common in PowerShell). Use `python -m pip install -e .` instead of `pip install -e .`.

**"bestrong is not recognized"**. Close Command Prompt and open a new one. If that still doesn't work, the Python `Scripts\` folder isn't on your PATH. Run `python -m bestrong run` instead.

**"address already in use"**. Something else is running on port 3000 or 8080. Either close that application or check if BeStrong HQ is already running in another Command Prompt window.

**Dashboard loads to a white screen with "Loading..." forever**. Two known causes: (a) `NEXT_PUBLIC_API_URL` wasn't set when `npm run build` ran, so the bundle has the wrong API URL; (b) the standalone bundle is missing static assets. Both are fixed by the install commands in Step 3 above. If you built manually without those, redo the `set NEXT_PUBLIC_API_URL=...` and `xcopy` steps.

**`npm install` fails**. Try running Command Prompt as Administrator (right-click the Command Prompt icon, "Run as administrator"), then run the install commands again.
