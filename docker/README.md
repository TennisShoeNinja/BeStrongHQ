# BeStrong HQ Docker Reference

This folder contains the local Docker setup for BeStrong HQ. Normal users should
start with the [install guide](../docs/install.md). This file is the command and
operations reference once Docker is already installed.

The compose setup runs one container that hosts both services and persists
data to two Docker volumes:

- Services: FastAPI on port `8080`, Next.js UI on port `3000`
- Volumes: `bestrong-data` (SQLite database), `bestrong-auth` (Google OAuth tokens)

Open the app at:

```text
http://127.0.0.1:3000
```

## Start and Stop

Run commands from this `docker/` folder.

```bash
docker compose up -d        # Start in the background
docker compose down         # Stop the app
docker compose restart      # Restart without rebuilding
docker compose logs -f      # Follow logs
docker compose ps           # Check container status
```

Force a clean rebuild:

```bash
docker compose build --no-cache
docker compose up -d
```

## Google Credentials

The container reads environment variables from `.env` in the repo root, one
level above this folder.

```env
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_OAUTH_TESTING_MODE=true
```

After editing `.env`, restart the container:

```bash
docker compose down
docker compose up -d
```

See [Google Setup](../docs/google-setup.md) for the OAuth walkthrough.

## Data and Volumes

Docker named volumes keep your data outside the container image.

| Volume | Contents | Container path |
|---|---|---|
| `bestrong-data` | SQLite database | `/data` |
| `bestrong-auth` | App auth/config files | `/app/.bestrong` |

These survive:

- `docker compose restart`
- `docker compose down`
- rebuilding the image

These are deleted by:

```bash
docker compose down -v
```

## Backups

Stop the app first so SQLite is quiet:

```bash
docker compose stop
```

The commands below assume the volumes are named `docker_bestrong-data` and
`docker_bestrong-auth`. Compose prefixes volume names with the project name,
which defaults to the folder you ran `docker compose` from. If you cloned into
a different folder or set `COMPOSE_PROJECT_NAME`, run `docker volume ls` and
substitute the actual names.

macOS/Linux/Git Bash:

```bash
docker run --rm -v docker_bestrong-data:/data -v "$(pwd):/backup" alpine tar czf /backup/bestrong-data.tar.gz -C / data
docker run --rm -v docker_bestrong-auth:/auth -v "$(pwd):/backup" alpine tar czf /backup/bestrong-auth.tar.gz -C / auth
```

PowerShell:

```powershell
docker run --rm -v docker_bestrong-data:/data -v ${PWD}:/backup alpine tar czf /backup/bestrong-data.tar.gz -C / data
docker run --rm -v docker_bestrong-auth:/auth -v ${PWD}:/backup alpine tar czf /backup/bestrong-auth.tar.gz -C / auth
```

Start the app again:

```bash
docker compose up -d
```

## Updating

Git install:

```bash
cd BeStrongHQ
git pull
cd docker
docker compose build
docker compose up -d
```

ZIP install:

1. Download the newest ZIP from GitHub.
2. Replace the app files.
3. Keep your `.env`.
4. Rebuild:

```bash
cd BeStrongHQ/docker
docker compose build
docker compose up -d
```

Your database and Google tokens stay in Docker volumes.

## LAN Access

By default, ports bind to `127.0.0.1`, which means only the current computer can
open the app.

To allow other trusted devices on your network, edit `docker-compose.yml`:

```yaml
ports:
  - "127.0.0.1:3000:3000"
  - "127.0.0.1:8080:8080"
```

Change to:

```yaml
ports:
  - "3000:3000"
  - "8080:8080"
```

Then restart:

```bash
docker compose up -d
```

The app will be reachable at:

```text
http://YOUR_HOST_IP:3000
```

If you use LAN access with Google OAuth, add matching redirect URIs for the host
IP, for example:

```text
http://YOUR_HOST_IP:8080/api/gdrive/auth/callback
http://YOUR_HOST_IP:8080/api/calendar/auth/callback
```

Only do this on a trusted network. The local community install is designed for
single-user local access.

## Reset Everything

This deletes the local database and saved Google tokens:

```bash
docker compose down -v
docker compose up -d
```

Use it only when you want a clean start.
