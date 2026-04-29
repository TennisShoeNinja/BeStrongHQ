# Installing BeStrong HQ on macOS

This guide walks you through setting up BeStrong HQ on a Mac from scratch. No programming experience required.

## Step 1: Open Terminal

Press **Cmd + Space**, type **Terminal**, and hit Enter. A black (or white) window will open. This is where you'll type all the commands below.

Every command in this guide should be copied and pasted into Terminal, then press **Enter** to run it.

## Step 2: Install Homebrew

Homebrew is a tool that makes installing software on a Mac easy. Paste this into Terminal:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

It will ask for your Mac password (the one you use to log in). Type it and press Enter. You won't see the characters as you type, but it's working.

When it finishes, it may show a "Next steps" message telling you to run a couple of commands to add Homebrew to your PATH. **Run those commands exactly as shown.** They usually look something like:

```
echo >> ~/.zprofile
echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
eval "$(/opt/homebrew/bin/brew shellenv)"
```

To verify Homebrew is working:

```bash
brew --version
```

You should see a version number. If you get "command not found," close Terminal and open a new one, then try again.

## Step 3: Install Python and Node.js

```bash
brew install python@3.12 node
```

Verify both installed correctly:

```bash
python3 --version
node --version
```

Python should show 3.10 or higher. Node should show 20 or higher.

## Step 4: Install Git (if needed)

Most Macs already have Git installed. Check by running:

```bash
git --version
```

If you see a version number, you're good. If it asks you to install Xcode Command Line Tools, click **Install** and wait for it to finish.

## Step 5: Download BeStrong HQ

Pick a folder where you want BeStrong HQ to live. Your home folder works fine:

```bash
cd ~
git clone https://github.com/TennisShoeNinja/BeStrongHQ.git
cd BeStrongHQ
```

## Step 6: Install BeStrong HQ

Run these two commands:

```bash
pip3 install -e .
cd web && npm install && cd ..
```

This will take a minute or two. You'll see a lot of text scrolling by. That's normal.

## Step 7: Google setup

BeStrong HQ uses Google for sign-in and Google Drive sync. You'll need to create your own OAuth credentials and tidy up your Drive folder layout before the app will work end to end. Follow the [Google Setup guide](google-setup.md), then come back here.

## Step 8: Start BeStrong HQ

```bash
bestrong run
```

Open your browser and go to **http://localhost:3000**. You should see the BeStrong HQ dashboard.

## Stopping and Restarting

To stop BeStrong HQ, go back to Terminal and press **Ctrl + C**.

To start it again later:

```bash
cd ~/BeStrongHQ
bestrong run
```

Your data is saved automatically. Nothing is lost when you stop the app.

## Updating

When a new version is available:

```bash
cd ~/BeStrongHQ
git pull
pip3 install -e .
cd web && npm install && cd ..
bestrong run
```

## Troubleshooting

**"command not found: bestrong"**. Close Terminal and open a new one. If that doesn't work, try running `pip3 install -e .` again from the BeStrongHQ folder.

**"command not found: brew"**. Make sure you ran the "Next steps" commands after installing Homebrew. Close Terminal, open a new one, and try again.

**"address already in use"**. Something else is running on port 3000 or 8080. Either close that application or check if BeStrong HQ is already running in another Terminal window.

**npm install fails with permission errors**. Do not use `sudo`. Instead, try:
```bash
npm cache clean --force
cd web && npm install && cd ..
```
