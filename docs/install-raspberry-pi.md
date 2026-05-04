# Installing BeStrong HQ on Raspberry Pi

This guide gets BeStrong HQ running on a Raspberry Pi — perfect for an always-on home server you can leave plugged in next to your router.

> **You will need a Google account.** BeStrong HQ imports training programs from Google Drive. There's no manual file-upload path — Drive sync is the only way to get spreadsheet data into the app.

> **Pi 4 or newer recommended.** Pi 3 will work but `npm run build` may run out of memory. If you're on a Pi 3, increase swap to at least 2GB before running the installer (`sudo dphys-swapfile swapoff && sudo nano /etc/dphys-swapfile` to edit `CONF_SWAPSIZE=2048`, then `sudo dphys-swapfile setup && sudo dphys-swapfile swapon`).

## The easy way: one-line install

Open a Terminal on your Pi (or SSH in from another machine), then paste this single line:

```bash
curl -fsSL https://raw.githubusercontent.com/TennisShoeNinja/BeStrongHQ/main/install.sh | bash
```

The installer:

1. `apt-get install`s **Python 3**, **npm**, and **Git** (will ask for your sudo password)
2. Installs **Node.js 20** via NodeSource (apt's default Node is too old)
3. Asks where to install (default: `~/BeStrongHQ`)
4. Clones the repo, installs Python and Node dependencies, and builds the frontend

It takes 20–40 minutes on a Pi (longer than a desktop because Node packages compile from source). Walk away and check back. When it finishes, jump down to **[Final step: Google Setup](#final-step-google-setup)**.

> **If the installer fails** — it's safe to re-run. Already-installed pieces are skipped. The most common Pi failure is `npm run build` running out of memory; bump up swap as described above and re-run.

## Final step: Google Setup

BeStrong HQ uses Google Drive to import program spreadsheets. Follow the [Google Setup guide](google-setup.md) to create the OAuth credentials and lay out your Drive folder.

If you're running headless and plan to access the app over your LAN at `http://YOUR_PI_IP:3000`, register these as additional redirect URIs on your Google OAuth client:

- `http://YOUR_PI_IP:8080/api/gdrive/auth/callback`
- `http://YOUR_PI_IP:8080/api/calendar/auth/callback` *(only if you'll use Calendar sync)*

## Start BeStrong HQ

```bash
cd ~/BeStrongHQ
bestrong run
```

Open a browser on your Pi (or any device on the same network) and go to **http://127.0.0.1:3000**.

To access from another device on your network, find your Pi's IP address:

```bash
hostname -I
```

Then go to **http://YOUR_PI_IP:3000** from any device on the same WiFi. Note: you'll need to start with `--host 0.0.0.0` for network access (the default binds to localhost only). The systemd service below does this automatically.

## Running on Startup (Optional)

```bash
sudo tee /etc/systemd/system/bestrong.service > /dev/null <<EOF
[Unit]
Description=BeStrong HQ
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$HOME/BeStrongHQ
ExecStart=$HOME/.local/bin/bestrong run --host 0.0.0.0
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable bestrong
sudo systemctl start bestrong
```

Check status with `sudo systemctl status bestrong`. View live logs with `journalctl -u bestrong -f`.

## Updating

Re-run the installer:

```bash
curl -fsSL https://raw.githubusercontent.com/TennisShoeNinja/BeStrongHQ/main/install.sh | bash
```

If running as a service, restart it after updating:

```bash
sudo systemctl restart bestrong
```

---

## Manual installation

### Step 1: Update your Pi

```bash
sudo apt update && sudo apt upgrade -y
```

### Step 2: Install Python and Git

```bash
sudo apt install -y python3 python3-pip python3-venv git curl
```

### Step 3: Install Node.js 20

The default `apt` Node is too old. Use NodeSource:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node --version   # should show v20.x or higher
```

### Step 4: Download BeStrong HQ

```bash
cd ~
git clone https://github.com/TennisShoeNinja/BeStrongHQ.git
cd BeStrongHQ
```

### Step 5: Install BeStrong HQ

```bash
python3 -m pip install -e . --break-system-packages
cd web
npm install
NEXT_PUBLIC_API_URL=http://127.0.0.1:8080 npm run build
[ -f .next/standalone/server.js ] && cp -R .next/static .next/standalone/.next/ && cp -R public .next/standalone/
cd ..
```

The `--break-system-packages` flag is required on newer Raspberry Pi OS releases. `npm install` and `npm run build` can take 10+ minutes since they compile some packages from source. The `cp` commands copy static assets into the Next.js standalone bundle (without them, the dashboard 404s every JS chunk).

### Step 6: Continue from "Final step: Google Setup" above

---

## Troubleshooting

**`npm run build` killed (out of memory)**. Bump up swap as described in the intro. Essential on Pi 3.

**`bestrong: command not found`**. Add `~/.local/bin` to your PATH:
```bash
echo 'export PATH=$HOME/.local/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
```

**Can't reach the app from another device**. Make sure you're starting with `--host 0.0.0.0` (the systemd service above does this automatically). Otherwise BeStrong HQ only listens on `127.0.0.1` and isn't reachable over the LAN.

**Dashboard loads to a white screen with "Loading..." forever**. Either `NEXT_PUBLIC_API_URL` wasn't set when `npm run build` ran, or the standalone static-copy step was skipped. Both fixed by re-running Step 5 above.
