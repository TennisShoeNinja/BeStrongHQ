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

You should see Python 3.12 or similar. If you get "not recognized," restart your computer and try again.

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

```
pip install -e .
cd web
npm install
npm run build
cd ..
```

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
pip install -e .
cd web
npm install
npm run build
cd ..
bestrong run
```

Your database and `.env` are preserved across updates — only the app code changes.

## Troubleshooting

**"python is not recognized"**. You missed the "Add to PATH" checkbox during Python install. Uninstall Python, reinstall it, and make sure to check that box. Then restart your computer.

**"bestrong is not recognized"**. Close Command Prompt and open a new one. If that doesn't work, the Python `Scripts\` folder probably isn't on your PATH — this can happen with per-user Python installs. Run `python -m pip install -e .` from the BeStrongHQ folder and then try `python -m bestrong run` instead, or reinstall Python with "Add to PATH" checked.

**"address already in use"**. Something else is running on port 3000 or 8080. Either close that application or check if BeStrong HQ is already running in another Command Prompt window.

**npm install fails**. Try running Command Prompt as Administrator (right-click, "Run as administrator"), then run the install commands again.

**"FileNotFoundError" or the UI doesn't start**. Make sure you ran `npm install` inside the `web` folder. If you're on a fresh checkout and only the API starts, run `cd web && npm install && npm run build && cd ..` and try `bestrong run` again.
