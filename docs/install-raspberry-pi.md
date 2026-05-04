# Installing BeStrong HQ on Raspberry Pi

This guide gets BeStrong HQ running on a Raspberry Pi, perfect for an always-on home server you can leave plugged in next to your router.

> **You will need a Google account.** BeStrong HQ imports training programs from Google Drive. There's no manual file-upload path — Drive sync is the only way to get spreadsheet data into the app.

> **Pi 4 or newer recommended.** Pi 3 will work but `npm run build` may run out of memory. If you're on a Pi 3, increase swap to at least 2GB before running the installer (`sudo dphys-swapfile swapoff && sudo nano /etc/dphys-swapfile` to edit `CONF_SWAPSIZE=2048`, then `sudo dphys-swapfile setup && sudo dphys-swapfile swapon`).

## The easy way: one-line install

This is the recommended path. Open a Terminal on your Pi (or SSH in from another machine), then paste this single line:

```bash
curl -fsSL https://raw.githubusercontent.com/TennisShoeNinja/BeStrongHQ/main/install.sh | bash
```

The installer will:

1. `apt-get install` **Python 3**, **Node.js**, **npm**, and **Git** (it'll ask for your sudo password)
2. Clone BeStrong HQ to `~/BeStrongHQ`
3. Install the Python and Node dependencies and build the frontend

It takes 20–40 minutes on a Pi (longer than a desktop because Node packages compile from source). Walk away and check back. When it finishes, jump down to **[Final step: Google Setup](#final-step-google-setup)**.

> **If the installer fails part-way through** — it's safe to re-run. Already-installed pieces are skipped automatically. The most common Pi failure is `npm run build` running out of memory; bump up swap as described above and re-run.

## Final step: Google Setup

BeStrong HQ uses Google Drive to import program spreadsheets. Follow the [Google Setup guide](google-setup.md) to create the OAuth credentials and lay out your Drive folder.

If you're running the Pi headless and plan to access the app over your LAN at `http://YOUR_PI_IP:3000`, register these as additional redirect URIs on your Google OAuth client:

- `http://YOUR_PI_IP:8080/api/gdrive/auth/callback`
- `http://YOUR_PI_IP:8080/api/calendar/auth/callback` *(only if you'll use Calendar sync)*

## Start BeStrong HQ

```bash
cd ~/BeStrongHQ
bestrong run
```

Open a browser on your Pi (or any device on the same network) and go to **http://127.0.0.1:3000**.

If you want to access BeStrong HQ from another device on your network (like your phone or laptop), find your Pi's IP address:

```bash
hostname -I
```

Then go to **http://YOUR_PI_IP:3000** from any device on the same WiFi.

## Running on Startup (Optional)

If you want BeStrong HQ to start automatically when your Pi boots, create a systemd service:

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

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable bestrong
sudo systemctl start bestrong
```

Now BeStrong HQ runs on boot. Check status with `sudo systemctl status bestrong` and view logs with `journalctl -u bestrong -f`.

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

Use this if the one-liner fails or you want to see what's happening.

### Step 1: Update your Pi

```bash
sudo apt update && sudo apt upgrade -y
```

### Step 2: Install Python, Node.js, and Git

```bash
sudo apt install -y python3 python3-pip python3-venv nodejs npm git curl
```

### Step 3: Download BeStrong HQ

```bash
cd ~
git clone https://github.com/TennisShoeNinja/BeStrongHQ.git
cd BeStrongHQ
```

### Step 4: Install BeStrong HQ

```bash
python3 -m pip install -e . --break-system-packages
cd web && npm install && npm run build && cd ..
```

The `--break-system-packages` flag is needed on newer Raspberry Pi OS releases. The `npm install` and `npm run build` steps can take 10+ minutes on a Pi since they compile some packages from source.

### Step 5: Continue from "Final step: Google Setup" above

---

## Troubleshooting

**`npm run build` killed (out of memory)**. Bump up swap as described in the intro. If you're on a Pi 3, this is essential.

**`bestrong: command not found`**. Add `~/.local/bin` to your PATH: `echo 'export PATH=$HOME/.local/bin:$PATH' >> ~/.bashrc && source ~/.bashrc`.

**Can't reach the app from another device**. Make sure you're starting with `--host 0.0.0.0` (the systemd service above does this automatically). Otherwise BeStrong HQ only listens on `127.0.0.1` and isn't reachable over the LAN.
