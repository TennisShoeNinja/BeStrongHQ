# Installing BeStrong HQ on Windows

This guide walks you through setting up BeStrong HQ on Windows from scratch. No programming experience required.

> **You will need a Google account.** BeStrong HQ imports training programs from Google Drive. There's no manual file-upload path — Drive sync is the only way to get spreadsheet data into the app. Budget about 10 extra minutes for the Google setup in Step 6.

## Step 1: Install Python

1. Go to [python.org/downloads](https://www.python.org/downloads/)
2. Click the big yellow **Download Python 3.12** button
3. Run the installer
4. **IMPORTANT:** Check the box that says **"Add python.exe to PATH"** at the bottom of the first screen. This is easy to miss and things won't work without it.
5. Click **Install Now**

To verify, open **Command Prompt** (press the Windows key, type `cmd`, hit Enter) and run:

```
python --version
```

You should see Python 3.12 or similar.

> If you get **"Python was not found; run without arguments to install from the Microsoft Store..."**, that's not a real error — it's a stub Windows ships with. Either you skipped the install above, or the stub is intercepting your real Python. Fix: open **Settings → Apps → Advanced app settings → App execution aliases** and turn off both `python.exe` and `python3.exe`. Close and reopen Command Prompt, then try `python --version` again.

> If you get plain **"not recognized,"** you missed the "Add to PATH" checkbox. Re-run the installer, choose **Modify**, check that box, finish, and reopen Command Prompt.

## Step 2: Install Node.js

1. Go to [nodejs.org](https://nodejs.org/)
2. Download the **LTS** version (the one on the left)
3. Run the installer and click through the defaults

Verify in Command Prompt:

```
node --version
```

Should show version 20 or higher.

## Step 3: Install Git

1. Go to [git-scm.com/download/win](https://git-scm.com/download/win)
2. Download and run the installer
3. Click through the defaults (the default settings are fine)

Verify in Command Prompt:

```
git --version
```

## Step 4: Download BeStrong HQ

Open a **new** Command Prompt window (so it picks up the tools you just installed) and run:

```
cd %USERPROFILE%
git clone https://github.com/TennisShoeNinja/BeStrongHQ.git
cd BeStrongHQ
```

## Step 5: Install BeStrong HQ

You can use either **Command Prompt** or **PowerShell** for this — pick whichever you're comfortable with. Run these from inside the `BeStrongHQ` folder:

```
python -m pip install -e .
cd web
npm install
npm run build
cd ..
```

> **Why `python -m pip` and not just `pip`?** On many Windows installs, only `python` ends up on PATH, not `pip` — especially in PowerShell. Going through `python -m pip` always works as long as `python` itself runs.

This takes a few minutes. You'll see a lot of text scrolling by — that's normal. The `npm run build` step at the end is optional but strongly recommended: it pre-compiles the UI so the first page load is fast instead of waiting 30–60 seconds for the dev server to compile on demand.

## Step 6: Google setup (required)

BeStrong HQ uses Google Drive to import program spreadsheets. There's no manual upload, so this step is required even if you only want to test with a single athlete. Follow the [Google Setup guide](google-setup.md) — it'll walk you through creating the OAuth credentials and laying out your Drive folder. Come back here when you're done.

## Step 7: Start BeStrong HQ

```
bestrong run
```

Open your browser and go to **http://127.0.0.1:3000**. You should see the BeStrong HQ dashboard.

> Use `127.0.0.1`, not `localhost`. They usually behave the same, but Google OAuth treats them as different origins, so sticking with `127.0.0.1` everywhere keeps things consistent with the redirect URIs you registered in Step 6.

## Stopping and Restarting

To stop BeStrong HQ, go back to Command Prompt and press **Ctrl + C**.

To start it again later:

```
cd %USERPROFILE%\BeStrongHQ
bestrong run
```

Your data is saved automatically. Nothing is lost when you stop the app.

## Updating

When a new version is available:

```
cd %USERPROFILE%\BeStrongHQ
git pull
python -m pip install -e .
cd web
npm install
npm run build
cd ..
bestrong run
```

Your database and `.env` are preserved across updates — only the app code changes.

## Troubleshooting

**"python is not recognized"**. You missed the "Add to PATH" checkbox during Python install. Re-run the Python installer, choose **Modify**, check **"Add Python to environment variables"**, and finish. Close and reopen your terminal. (No need to fully uninstall.)

**"Python was not found; run without arguments to install from the Microsoft Store..."**. This is the Microsoft Store stub kicking in. It means either (a) you don't actually have Python installed yet — go back to Step 1, or (b) you installed Python but the MS Store stub is winning the PATH race. To disable the stub: **Settings → Apps → Advanced app settings → App execution aliases**, then turn off both `python.exe` and `python3.exe`. Close and reopen your terminal.

**"pip is not recognized"** (common in PowerShell). Use `python -m pip install -e .` instead of `pip install -e .`. The `python -m pip` form always works as long as `python` itself is on PATH, even when the standalone `pip` shim isn't.

**"bestrong is not recognized"**. Close your terminal and open a new one. If that doesn't work, the Python `Scripts\` folder isn't on your PATH — this can happen with per-user Python installs. Run `python -m bestrong run` instead, or reinstall Python with "Add to PATH" checked.

**"address already in use"**. Something else is running on port 3000 or 8080. Either close that application or check if BeStrong HQ is already running in another Command Prompt window.

**npm install fails**. Try running Command Prompt as Administrator (right-click, "Run as administrator"), then run the install commands again.

**"FileNotFoundError" or the UI doesn't start**. Make sure you ran `npm install` inside the `web` folder. If you're on a fresh checkout and only the API starts, run `cd web && npm install && npm run build && cd ..` and try `bestrong run` again.
