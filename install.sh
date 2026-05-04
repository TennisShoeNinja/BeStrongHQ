#!/usr/bin/env bash
# ============================================================
#  BeStrong HQ - macOS / Linux / Raspberry Pi installer
#
#  Detects the platform and installs Python 3.10+, Node.js 20+,
#  and Git via the right package manager (Homebrew on macOS,
#  apt on Debian/Ubuntu/Pi). Clones the repo into ~/BeStrongHQ
#  and builds the app. Safe to re-run.
# ============================================================

set -e

INSTALL_DIR="${BESTRONG_DIR:-$HOME/BeStrongHQ}"
REPO_URL="https://github.com/TennisShoeNinja/BeStrongHQ.git"

# ----- pretty output ----------------------------------------
say() { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[warn]\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m[error]\033[0m %s\n' "$*" >&2; exit 1; }

cat <<EOF

============================================================
  BeStrong HQ Installer
============================================================

This will install Python 3.12, Node.js LTS, and Git if you
don't already have them, then download and build BeStrong HQ.

Install location: $INSTALL_DIR
Estimated time:   10-15 minutes (longer on a Raspberry Pi)

EOF

read -r -p "Press Enter to continue, or Ctrl+C to cancel..." _

# ----- detect OS --------------------------------------------
OS="$(uname -s)"
case "$OS" in
    Darwin)  PLATFORM="mac" ;;
    Linux)   PLATFORM="linux" ;;
    *)       fail "Unsupported OS: $OS. This installer supports macOS and Linux only." ;;
esac

say "Detected platform: $PLATFORM"

# ----- platform-specific dependency install -----------------
install_mac_deps() {
    if ! command -v brew >/dev/null 2>&1; then
        say "Installing Homebrew..."
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
        # Add brew to PATH for this session (Apple Silicon vs Intel)
        if [ -x /opt/homebrew/bin/brew ]; then
            eval "$(/opt/homebrew/bin/brew shellenv)"
        elif [ -x /usr/local/bin/brew ]; then
            eval "$(/usr/local/bin/brew shellenv)"
        fi
    else
        say "Homebrew already installed."
    fi

    say "Installing Python 3.12 and Node.js via Homebrew..."
    brew install python@3.12 node || true

    # macOS ships with git, no install needed.
}

install_linux_deps() {
    if ! command -v apt-get >/dev/null 2>&1; then
        fail "This installer currently supports apt-based Linux only (Debian, Ubuntu, Raspberry Pi OS). For other distros, follow the manual install at https://github.com/TennisShoeNinja/BeStrongHQ/blob/main/docs/install.md"
    fi

    say "Updating apt package list (you may be prompted for your password)..."
    sudo apt-get update -qq

    say "Installing Python and Git via apt..."
    sudo apt-get install -y python3 python3-pip python3-venv git curl

    # apt's default 'nodejs' on older Debian/Pi OS is too old (v12 or v18).
    # We need Node 20+, so use NodeSource if the existing one is too old or missing.
    NODE_OK=0
    if command -v node >/dev/null 2>&1; then
        NODE_MAJOR=$(node -v | sed 's/^v//; s/\..*$//')
        if [ "$NODE_MAJOR" -ge 20 ] 2>/dev/null; then
            NODE_OK=1
        fi
    fi

    if [ "$NODE_OK" -ne 1 ]; then
        say "Installing Node.js 20 via NodeSource (apt's default is too old)..."
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
        sudo apt-get install -y nodejs
    else
        say "Node.js $(node -v) already installed."
    fi
}

case "$PLATFORM" in
    mac)   install_mac_deps ;;
    linux) install_linux_deps ;;
esac

# ----- pick the right python / pip command ------------------
if command -v python3 >/dev/null 2>&1; then
    PYTHON=python3
elif command -v python >/dev/null 2>&1; then
    PYTHON=python
else
    fail "python is not on PATH after install. Open a new terminal and re-run install.sh."
fi

# Newer Debian/Pi require --break-system-packages for system pip.
PIP_FLAGS=""
if [ "$PLATFORM" = "linux" ]; then
    PIP_FLAGS="--break-system-packages"
fi

# ----- clone or update --------------------------------------
say "Downloading BeStrong HQ to $INSTALL_DIR..."
if [ -d "$INSTALL_DIR/.git" ]; then
    say "Existing checkout found, pulling latest..."
    git -C "$INSTALL_DIR" pull --ff-only
elif [ -d "$INSTALL_DIR" ]; then
    fail "$INSTALL_DIR exists but is not a git checkout. Move or delete it, then re-run."
else
    git clone "$REPO_URL" "$INSTALL_DIR"
fi

# ----- build the app ----------------------------------------
say "Installing Python dependencies..."
cd "$INSTALL_DIR"
$PYTHON -m pip install -e . --quiet --disable-pip-version-check $PIP_FLAGS

say "Installing Node dependencies (this takes a few minutes)..."
cd "$INSTALL_DIR/web"
npm install --silent --no-audit --no-fund

say "Building the frontend (this also takes a few minutes)..."
npm run build

cd "$INSTALL_DIR"

# ----- done -------------------------------------------------
cat <<EOF

============================================================
  Installation complete!
============================================================

Installed to: $INSTALL_DIR

Next steps:

  1. Set up Google Drive OAuth (required to import programs):
     https://github.com/TennisShoeNinja/BeStrongHQ/blob/main/docs/google-setup.md

  2. Start BeStrong HQ:
       cd $INSTALL_DIR
       bestrong run

  3. Open http://127.0.0.1:3000 in your browser.

If 'bestrong' is not found when you start it, open a new
terminal so the PATH refreshes.

EOF
