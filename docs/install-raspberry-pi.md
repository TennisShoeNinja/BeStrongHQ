# Installing BeStrong HQ on Raspberry Pi

This guide walks you through setting up BeStrong HQ on a Raspberry Pi. Tested on Raspberry Pi 4 and 5 running Raspberry Pi OS (64-bit).

## Before You Start

You'll need a Raspberry Pi with Raspberry Pi OS installed and an internet connection. If you haven't set up your Pi yet, follow the official guide at [raspberrypi.com/software](https://www.raspberrypi.com/software/).

All commands below are run in the Terminal. You can open it from the desktop menu, or if you're using SSH, you're already there.

## Step 1: Update Your System

```bash
sudo apt update && sudo apt upgrade -y
```

This may take a few minutes.

## Step 2: Install Python 3.10+

Raspberry Pi OS usually comes with Python 3, but check your version:

```bash
python3 --version
```

If it shows 3.10 or higher, you're good. Skip to Step 3.

If it shows something older (like 3.9), you'll need to install a newer version:

```bash
sudo apt install -y python3.12 python3.12-venv python3-pip
```

If that package isn't available on your OS version, you may need to build from source or upgrade to a newer Raspberry Pi OS.

## Step 3: Install Node.js 20

The version of Node.js in the default Raspberry Pi repos is usually too old. Install version 20 using NodeSource:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

Verify:

```bash
node --version
```

Should show version 20 or higher.

## Step 4: Install Git

```bash
sudo apt install -y git
```

## Step 5: Download BeStrong HQ

```bash
cd ~
git clone https://github.com/TennisShoeNinja/BeStrongHQ.git
cd BeStrongHQ
```

## Step 6: Install BeStrong HQ

```bash
pip3 install -e . --break-system-packages
cd web && npm install && npm run build && cd ..
```

The `--break-system-packages` flag is needed on newer versions of Raspberry Pi OS. The `npm install` and `npm run build` steps can take 10+ minutes on a Pi since it's compiling some packages from source. The build step is optional but strongly recommended on a Pi: without it, every page load will recompile on demand and feel painfully slow.

## Step 7: Google setup (required)

BeStrong HQ uses Google Drive to import program spreadsheets. There's no manual upload, so this step is required even if you only want to test with a single athlete. Follow the [Google Setup guide](google-setup.md) — it'll walk you through creating the OAuth credentials and laying out your Drive folder. Come back here when you're done.

If you're running headless and plan to access the app over your LAN at `http://YOUR_PI_IP:3000`, register these as additional redirect URIs on your Google OAuth client:

- `http://YOUR_PI_IP:8080/api/gdrive/auth/callback`
- `http://YOUR_PI_IP:8080/api/calendar/auth/callback` *(only if you'll use Calendar sync)*

## Step 8: Start BeStrong HQ

```bash
bestrong run
```

Open a browser on your Pi (or any device on the same network) and go to **http://127.0.0.1:3000**.

If you want to access BeStrong HQ from another device on your network (like your phone or laptop), use your Pi's IP address instead:

```bash
hostname -I
```

That shows your Pi's IP address. Then go to **http://YOUR_PI_IP:3000** from any device on the same WiFi.

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
ExecStart=$HOME/.local/bin/bestrong run
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
```

Enable and start it:

```bash
sudo systemctl enable bestrong
sudo systemctl start bestrong
```

Now BeStrong HQ runs in the background and starts automatically on boot.

To check status, stop, or restart:

```bash
sudo systemctl status bestrong
sudo systemctl stop bestrong
sudo systemctl restart bestrong
```

## Stopping and Restarting (Manual)

If you're running BeStrong HQ manually (not as a service), stop it with **Ctrl + C** in the terminal.

To start again:

```bash
cd ~/BeStrongHQ
bestrong run
```

Your data is saved automatically. Nothing is lost when you stop the app.

## Updating

```bash
cd ~/BeStrongHQ
git pull
pip3 install -e . --break-system-packages
cd web && npm install && npm run build && cd ..
bestrong run
```

If running as a service, restart it after updating:

```bash
sudo systemctl restart bestrong
```

## Troubleshooting

**"command not found: bestrong"**. The pip install put it in `~/.local/bin/` which may not be in your PATH. Add it:
```bash
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

**npm install is extremely slow**. This is normal on a Raspberry Pi, especially the first time. Some packages need to compile native code. Give it 5-10 minutes.

**Out of memory during npm install**. If you're on a Pi with 1GB RAM, you may need to add swap space:
```bash
sudo dphys-swapfile swapoff
sudo sed -i 's/CONF_SWAPSIZE=.*/CONF_SWAPSIZE=2048/' /etc/dphys-swapfile
sudo dphys-swapfile setup
sudo dphys-swapfile swapon
```
Then try `npm install` again.

**Can't access from other devices on the network**. Make sure you're using the Pi's actual IP address (from `hostname -I`), not "localhost." Also check that your Pi's firewall isn't blocking ports 3000 and 8080.
