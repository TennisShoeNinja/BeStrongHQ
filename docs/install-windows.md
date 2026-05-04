# Installing BeStrong HQ on Windows

This guide walks you through setting up BeStrong HQ on Windows from scratch. No programming experience required.

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
cd web && npm install && cd ..
```

This will take a minute or two. You'll see a lot of text scrolling by. That's normal.

## Step 6: Google setup

BeStrong HQ uses Google for sign-in and Google Drive sync. You'll need to create your own OAuth credentials and tidy up your Drive folder layout before the app will work end to end. Follow the [Google Setup guide](google-setup.md), then come back here.

## Step 7: Start BeStrong HQ

```
bestrong run
```

Open your browser and go to **http://localhost:3000**. You should see the BeStrong HQ dashboard.

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
cd web && npm install && cd ..
bestrong run
```

## Troubleshooting

**"python is not recognized"**. You missed the "Add to PATH" checkbox during Python install. Uninstall Python, reinstall it, and make sure to check that box. Then restart your computer.

**"bestrong is not recognized"**. Close Command Prompt and open a new one. If that doesn't work, try running `pip install -e .` again from the BeStrongHQ folder.

**"address already in use"**. Something else is running on port 3000 or 8080. Either close that application or check if BeStrong HQ is already running in another Command Prompt window.

**npm install fails**. Try running Command Prompt as Administrator (right-click, "Run as administrator"), then run the install commands again.
