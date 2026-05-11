# Install BeStrong HQ Community Edition

BeStrong HQ Community Edition runs on your own computer. The early installer
uses Docker in the background, but normal use is just opening BeStrong in your
browser.

The current Mac and Windows install helpers are unsigned while we validate
demand before paying for code signing.

Your data stays on your machine in a regular BeStrong HQ data folder.

## What You Need

- Docker Desktop on Windows or macOS
- A Google account
- About 10 to 20 minutes for the first setup

Linux users need Docker Engine and the Docker Compose plugin.

## Recommended Community Edition Install

### macOS

1. Install Docker Desktop from <https://www.docker.com/products/docker-desktop/>.
2. Open Docker Desktop once and wait until it says Docker is running.
3. Open Terminal.
4. Run:

   ```bash
   curl -fsSL https://bestronghq.com/install.sh | bash
   bestrong open
   ```

The app opens at:

```text
http://127.0.0.1:3000
```

### Windows

1. Install Docker Desktop from <https://www.docker.com/products/docker-desktop/>.
2. Open Docker Desktop once and wait until it says Docker is running.
3. Download
   [BeStrongHQ-Community-Windows.zip](https://github.com/TennisShoeNinja/BeStrongHQ/releases/latest/download/BeStrongHQ-Community-Windows.zip).
4. Right-click the ZIP and choose **Extract All**.
5. Open the extracted folder.
6. Double-click **Open BeStrong.cmd**.

The app opens at:

```text
http://127.0.0.1:3000
```

Windows uses Docker Desktop with WSL2. If Docker asks for a reboot, reboot,
open Docker Desktop again, then double-click **Open BeStrong.cmd**.

### Linux

Linux is the advanced path:

```bash
curl -fsSL https://bestronghq.com/install.sh | bash
bestrong open
```

The script expects Docker Engine and the Docker Compose plugin to already be
installed.

## Early Installer Commands

macOS and Linux get a `bestrong` terminal command:

```bash
bestrong open
bestrong start
bestrong stop
bestrong update
bestrong logs
bestrong doctor
```

The Windows ZIP includes double-click launchers:

- **Open BeStrong.cmd**: start BeStrong and open the browser
- **Start BeStrong.cmd**: start BeStrong without opening the browser
- **Stop BeStrong.cmd**: stop the local containers
- **Update BeStrong.cmd**: back up the database, pull the latest image, and restart
- **Troubleshoot BeStrong.cmd**: check Docker, WSL, ports, and local folders

## Data Location

The early installer stores your local data in a normal folder:

| Platform | Data folder |
|---|---|
| macOS | `~/Library/Application Support/BeStrongHQ/` |
| Windows | `%LOCALAPPDATA%\BeStrongHQ\` |
| Linux | `${XDG_DATA_HOME:-~/.local/share}/bestrong-hq/` |

`bestrong update` and **Update BeStrong.cmd** create a database backup before
pulling a new image.

## Google Drive And Calendar Setup

BeStrong HQ can open before Google is connected. Drive sync and Calendar sync
need one Google OAuth client before your first sync.

1. Follow the full [Google Setup guide](google-setup.md).
2. Enable both **Google Drive API** and **Google Calendar API**.
3. Create a **Web application** OAuth client.
4. Add these authorized redirect URIs:

```text
http://127.0.0.1:8080/api/gdrive/auth/callback
http://127.0.0.1:8080/api/calendar/auth/callback
```

Then edit the BeStrong HQ runtime config file.

macOS:

```bash
open "$HOME/Library/Application Support/BeStrongHQ/runtime/.env"
```

Windows PowerShell:

```powershell
notepad "$env:LOCALAPPDATA\BeStrongHQ\runtime\.env"
```

Fill in:

```env
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_OAUTH_TESTING_MODE=true
```

After saving the file, restart BeStrong.

macOS/Linux:

```bash
bestrong stop
bestrong open
```

Windows:

1. Double-click **Stop BeStrong.cmd**.
2. Double-click **Open BeStrong.cmd**.

Go to **Google Drive sync**, connect Google, choose your folders, and run your
first sync.

## Recommended First Test

Before syncing your whole coaching folder:

1. Create one test athlete folder in Google Drive.
2. Copy one BeStrong HQ template into that folder.
3. Rename the file using the expected pattern.
4. Sync it in BeStrong HQ.
5. Confirm the athlete, sessions, lifts, and block data appear correctly.

Templates:

- [4-day template](https://docs.google.com/spreadsheets/d/1ssQenOGnuRsti_l97GCFJicgsJpEhUjDbfckuVgZYKA/copy)
- [5-day template](https://docs.google.com/spreadsheets/d/10nngfk-GLd9qQobHO0WPgyW8-W9bjJ38RSDd8ywvqAg/copy)

These are demo programs, not training prescriptions. Use them to test the file
structure, then replace the training contents with your own programming.

## Google Drive Folder Layout

Recommended layout:

```text
My Drive/
└── Coaching/
    ├── Athlete One/
    │   └── Athlete One's Program 1 - (01/01/26 - 01/28/26) - Strength Block
    ├── Athlete Two/
    │   └── Athlete Two's Program 4 - (02/01/26 - 02/28/26) - Peaking Block
    └── Athlete Three/
        └── Athlete Three's Program 2 - (03/01/26 - 03/28/26) - Hypertrophy Block
```

Use:

- One main coaching folder
- One folder per athlete
- One or more Google Sheets or `.xlsx` programs inside each athlete folder

The default filename pattern is:

```text
Athlete Name's Program Number - (Start Date - End Date) - Block Theme
```

Using a different naming pattern? Configure it in BeStrong HQ under
**Google Drive sync > Naming pattern**.

## Later Signed Installers

The repo also contains scaffolding for future signed Mac and Windows installers.
Those are not the current recommendation because Apple and Windows signing cost
money. Use the install path above until real demand justifies that spend.

## Manual Docker Reference

If you prefer direct Docker commands, see the [Docker reference](../docker/README.md).
