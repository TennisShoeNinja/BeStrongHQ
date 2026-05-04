# Installing BeStrong HQ on Windows

This guide walks you through setting up BeStrong HQ on Windows from scratch. No programming experience required.

> **You will need a Google account.** BeStrong HQ imports training programs from Google Drive. There's no manual file-upload path — Drive sync is the only way to get spreadsheet data into the app. Budget about 10 extra minutes for the Google setup in Step 5.

## Step 1: Open PowerShell

Press the **Windows key**, type `powershell`, and hit Enter. A blue (or black) window will open. This is where you'll type all the commands below.

Every command in this guide should be copied and pasted into PowerShell, then press **Enter** to run it.

> **Don't have winget?** Steps 2–4 use `winget`, the built-in Windows package manager. It's preinstalled on Windows 10 (May 2020 update or newer) and Windows 11. If `winget --version` says "not recognized," install the **App Installer** from the Microsoft Store and reopen PowerShell. Or skip to the [Manual installation fallback](#manual-installation-fallback) section at the bottom of this page.

## Step 2: Install Python, Node.js, and Git

Three commands, one per tool:

```
winget install Python.Python.3.12
winget install OpenJS.NodeJS.LTS
winget install Git.Git
```

Each one takes 30–60 seconds. You'll see a progress bar, then "Successfully installed."

> The first time you run a `winget install` command, it may ask you to accept the source agreements. Type **Y** and press Enter.

**Now close PowerShell completely and open a new window.** This is critical — newly installed tools don't show up on the PATH of your current session, only in fresh ones.

Verify all three are working in the new window:

```
python --version
node --version
git --version
```

You should see Python 3.12.x, Node v20+ (or v22), and Git 2.x.

> If `python --version` says **"Python was not found; run without arguments to install from the Microsoft Store..."**, the Microsoft Store alias is intercepting your real Python. Open **Settings → Apps → Advanced app settings → App execution aliases** and turn off both `python.exe` and `python3.exe`. Close and reopen PowerShell.

## Step 3: Download BeStrong HQ

```
cd $env:USERPROFILE
git clone https://github.com/TennisShoeNinja/BeStrongHQ.git
cd BeStrongHQ
```

## Step 4: Install BeStrong HQ

Run these from inside the `BeStrongHQ` folder, **one at a time** (PowerShell 5.1 doesn't support chaining with `&&`, so wait for each one to finish before running the next):

```
python -m pip install -e .
cd web
npm install
npm run build
cd ..
```

> **Why `python -m pip` and not just `pip`?** On many Windows installs, only `python` ends up on PATH, not `pip` — especially in PowerShell. Going through `python -m pip` always works as long as `python` itself runs.

This takes a few minutes. You'll see a lot of text scrolling by — that's normal. The `npm run build` step at the end is optional but strongly recommended: it pre-compiles the UI so the first page load is fast instead of waiting 30–60 seconds for the dev server to compile on demand.

## Step 5: Google setup (required)

BeStrong HQ uses Google Drive to import program spreadsheets. There's no manual upload, so this step is required even if you only want to test with a single athlete. Follow the [Google Setup guide](google-setup.md) — it'll walk you through creating the OAuth credentials and laying out your Drive folder. Come back here when you're done.

## Step 6: Start BeStrong HQ

```
bestrong run
```

Open your browser and go to **http://127.0.0.1:3000**. You should see the BeStrong HQ dashboard.

> Use `127.0.0.1`, not `localhost`. They usually behave the same, but Google OAuth treats them as different origins, so sticking with `127.0.0.1` everywhere keeps things consistent with the redirect URIs you registered in Step 5.

## Stopping and Restarting

To stop BeStrong HQ, go back to PowerShell and press **Ctrl + C**.

To start it again later:

```
cd $env:USERPROFILE\BeStrongHQ
bestrong run
```

Your data is saved automatically. Nothing is lost when you stop the app.

## Updating

When a new version is available, run these one at a time:

```
cd $env:USERPROFILE\BeStrongHQ
git pull
python -m pip install -e .
cd web
npm install
npm run build
cd ..
bestrong run
```

Your database and `.env` are preserved across updates — only the app code changes.

## Manual installation fallback

If `winget` isn't available on your machine and updating App Installer didn't help, you can install the prerequisites by hand:

- **Python:** Download Python 3.12 from [python.org/downloads](https://www.python.org/downloads/) and run the installer. **Critical:** check the **"Add python.exe to PATH"** box at the bottom of the first screen, then click **Install Now**.
- **Node.js:** Download the **LTS** version from [nodejs.org](https://nodejs.org/) and run the installer with the defaults.
- **Git:** Download from [git-scm.com/download/win](https://git-scm.com/download/win) and run the installer with the defaults.

Then continue from **Step 3** above.

## Troubleshooting

**"winget is not recognized"**. Your Windows version is too old or the App Installer is missing. Open the Microsoft Store, search for **App Installer**, and update or install it. Then close PowerShell and reopen it. If that doesn't work, use the [Manual installation fallback](#manual-installation-fallback) above.

**"Python was not found; run without arguments to install from the Microsoft Store..."**. This is the Microsoft Store stub kicking in. It means either (a) the `winget install Python.Python.3.12` step didn't complete — try it again, or (b) Python is installed but the MS Store stub is winning the PATH race. To disable the stub: **Settings → Apps → Advanced app settings → App execution aliases**, then turn off both `python.exe` and `python3.exe`. Close and reopen PowerShell.

**"python is not recognized"**. The PATH didn't pick up the new Python. Close PowerShell completely and open a fresh window. If you used the manual installer, you missed the "Add to PATH" checkbox — re-run the Python installer, choose **Modify**, check **"Add Python to environment variables"**, and finish.

**"pip is not recognized"** (common in PowerShell). Use `python -m pip install -e .` instead of `pip install -e .`. The `python -m pip` form always works as long as `python` itself is on PATH, even when the standalone `pip` shim isn't.

**"The token '&&' is not a valid statement separator in this version"** (PowerShell). PowerShell 5.1 (the default on Windows) doesn't support `&&`. Run the commands in Step 4 one at a time instead. If you'd rather use chained commands, upgrade to PowerShell 7 with `winget install Microsoft.PowerShell` and use the new `pwsh` window where `&&` works.

**"bestrong is not recognized"**. Close PowerShell and open a new one. If that doesn't work, the Python `Scripts\` folder isn't on your PATH — this can happen with per-user Python installs. Run `python -m bestrong run` instead.

**"address already in use"**. Something else is running on port 3000 or 8080. Either close that application or check if BeStrong HQ is already running in another PowerShell window.

**npm install fails**. Try running PowerShell as Administrator (right-click the PowerShell icon, "Run as administrator"), then run the install commands again.

**"FileNotFoundError" or the UI doesn't start**. Make sure you ran `npm install` inside the `web` folder. If you're on a fresh checkout and only the API starts, run `cd web`, `npm install`, `npm run build`, `cd ..` (one at a time) and try `bestrong run` again.
