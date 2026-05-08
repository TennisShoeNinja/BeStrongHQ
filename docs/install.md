# Install BeStrong HQ

BeStrong HQ runs locally on your own computer with Docker. You do not need to
install Python, Node.js, or a database. Your data stays on your machine in a
Docker volume.

BeStrong HQ imports program spreadsheets from Google Drive. There is no manual
spreadsheet upload flow, so you will need a Google account and OAuth credentials
before your first sync.

## What You Need

- Docker Desktop on Windows or macOS, or Docker Engine on Linux/Raspberry Pi
- A Google account
- About 10 to 20 minutes for the first setup
- Optional: Git, if you want the easiest update path

## Part 1: Install Docker

### Windows

1. Download Docker Desktop from <https://www.docker.com/products/docker-desktop/>.
2. Run the installer and keep the default options.
3. Reboot if Docker asks you to.
4. Open Docker Desktop and wait until it says Docker is running.

Docker Desktop on Windows uses WSL2. The installer usually enables it for you.

### macOS

1. Download Docker Desktop from <https://www.docker.com/products/docker-desktop/>.
2. Pick Apple Silicon for M1/M2/M3/M4 Macs, or Intel for older Macs.
3. Drag Docker into Applications.
4. Open Docker Desktop and wait until it is running.

### Linux or Raspberry Pi

```bash
curl -fsSL https://get.docker.com | sudo bash
sudo usermod -aG docker $USER
```

Log out and back in, or reboot. Then test Docker:

```bash
docker run hello-world
```

## Part 2: Download BeStrong HQ

You can use Git or download a ZIP. Git is easier for future updates, but ZIP is
friendlier if you have never used developer tools before.

### Option A: Git

Open PowerShell on Windows, or Terminal on macOS/Linux.

Windows:

```powershell
cd C:\
mkdir Apps
cd Apps
git clone https://github.com/TennisShoeNinja/BeStrongHQ.git
cd BeStrongHQ\docker
docker compose up -d
```

macOS/Linux/Raspberry Pi:

```bash
cd ~
git clone https://github.com/TennisShoeNinja/BeStrongHQ.git
cd BeStrongHQ/docker
docker compose up -d
```

### Option B: ZIP Download

1. Open <https://github.com/TennisShoeNinja/BeStrongHQ>.
2. Click **Code**.
3. Click **Download ZIP**.
4. Extract it somewhere easy to find.
5. Rename the extracted folder to `BeStrongHQ`.

Then open PowerShell or Terminal in that folder and start Docker.

Windows example:

```powershell
cd C:\Apps\BeStrongHQ\docker
docker compose up -d
```

macOS/Linux example:

```bash
cd ~/BeStrongHQ/docker
docker compose up -d
```

The first build can take several minutes because Docker builds the app. Later
starts are much faster.

When it finishes, open:

```text
http://127.0.0.1:3000
```

Use `127.0.0.1`, not `localhost`, unless you also registered localhost in
Google OAuth. Google treats those as different redirect origins.

The app will load without a Google connection. That is expected. Part 3 sets up
the Google credentials Drive sync needs.

## Part 3: Set Up Google

Drive sync and Calendar sync use one Google OAuth client.

1. Follow the full [Google Setup guide](google-setup.md).
2. Enable both **Google Drive API** and **Google Calendar API**.
3. Create a **Web application** OAuth client.
4. Add these authorized redirect URIs:

```text
http://127.0.0.1:8080/api/gdrive/auth/callback
http://127.0.0.1:8080/api/calendar/auth/callback
```

## Part 4: Add Google Credentials

Once you have a Client ID and Client Secret from the Google Setup guide, come
back here.

Create a `.env` file in the BeStrong HQ repo root, one level above `docker/`.

Windows:

```powershell
cd C:\Apps\BeStrongHQ
copy .env.example .env
notepad .env
```

macOS/Linux/Raspberry Pi:

```bash
cd ~/BeStrongHQ
cp .env.example .env
nano .env
```

Fill in the client ID and client secret from Google:

```env
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_OAUTH_TESTING_MODE=true
```

Save the file, then restart BeStrong HQ:

```bash
cd docker
docker compose down
docker compose up -d
```

Open:

```text
http://127.0.0.1:3000
```

Go to **Google Drive sync**, connect Google, choose your folders, and run your
first sync.

## Part 5: Set Up Google Drive Folders

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

Example:

```text
Lupe's Program 12 - (03/01/26 - 03/28/26) - Strength Block
```

Using a different naming pattern? Configure it in BeStrong HQ under
**Google Drive sync -> Naming pattern**.

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

## Daily Use

Start BeStrong HQ:

```bash
cd BeStrongHQ/docker
docker compose up -d
```

Stop BeStrong HQ:

```bash
cd BeStrongHQ/docker
docker compose down
```

Restart BeStrong HQ:

```bash
cd BeStrongHQ/docker
docker compose restart
```

View logs:

```bash
cd BeStrongHQ/docker
docker compose logs -f
```

Your data persists across normal restarts and `docker compose down`.

## Updating

If you installed with Git:

```bash
cd BeStrongHQ
git pull
cd docker
docker compose build
docker compose up -d
```

If you installed from a ZIP, download the newest ZIP, replace the app files, keep
your `.env`, then rebuild from the `docker/` folder. Your database and Google
tokens live in Docker volumes, not in the app folder.

## Troubleshooting

### Docker says the port is already in use

Another app may already be using port `3000` or `8080`.

```bash
cd BeStrongHQ/docker
docker compose down
docker compose up -d
```

If it still fails, close the app using that port or change the Docker port
mapping in `docker/docker-compose.yml`.

### Google says `invalid_client`

Your `.env` file is missing, the client ID/secret is wrong, or the container was
not restarted after editing `.env`.

Check:

```env
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

Then restart:

```bash
cd BeStrongHQ/docker
docker compose down
docker compose up -d
```

### Google says `redirect_uri_mismatch`

Make sure Google has these exact authorized redirect URIs:

```text
http://127.0.0.1:8080/api/gdrive/auth/callback
http://127.0.0.1:8080/api/calendar/auth/callback
```

Also make sure you are opening the app at:

```text
http://127.0.0.1:3000
```

### Google warns that the app is not verified

That is expected for a private local OAuth app in Testing mode. Make sure you are
signed into the Google account you added as a test user, then continue through
the warning.

### Google asks you to connect again after a few days

That is normal while your Google OAuth app is in Testing mode. Google expires
refresh tokens after 7 days in Testing mode. Reconnect Google Drive when the app
shows the renewal banner.

### You changed `.env`, but nothing happened

Restart the container:

```bash
cd BeStrongHQ/docker
docker compose down
docker compose up -d
```

### Reset everything

This deletes your local BeStrong HQ database and saved Google tokens.

```bash
cd BeStrongHQ/docker
docker compose down -v
docker compose up -d
```

Only do this if you are okay starting over.

## More

- [Google Setup](google-setup.md)
- [Docker reference](../docker/README.md)
- [CLI reference](cli.md)
- [Custom Parser Guide](custom-parser-guide.md)
