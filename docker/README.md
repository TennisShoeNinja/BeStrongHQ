# BeStrong HQ - Docker (Community Edition)

Run BeStrong HQ in a single Docker container. Same app as the bare-metal install (Python + Next.js), just packaged so you don't have to install the toolchain on your host. Both the FastAPI backend (port 8080) and the Next.js UI (port 3000) run inside one container.

## Prerequisites

- **Docker Desktop** (Mac, Windows) or **Docker Engine** (Linux/Raspberry Pi). Get it from [docker.com](https://www.docker.com/products/docker-desktop/).
- A clone of this repo (the Docker build needs the source).

> **Same image works on Windows, Mac, Linux, and Pi.** Docker abstracts the host OS — the container is Linux internally regardless of where you run it. The base images (`python:3.11-slim`, `node:20-slim`) ship multi-arch builds, so amd64 (Mac/Windows/x86 Linux) and arm64 (Apple Silicon, Raspberry Pi 4/5) are both covered automatically. Pi build will be slower (10–30 minutes) due to ARM CPU + SD card I/O.

## Quick start

```bash
git clone https://github.com/TennisShoeNinja/BeStrongHQ.git
cd BeStrongHQ/docker
docker compose up -d
```

First build takes 5-10 minutes (Node + Python deps + frontend build). Subsequent starts are seconds.

Open **http://127.0.0.1:3000** in your browser.

## Google Drive setup

BeStrong HQ imports programs from Google Drive (the only ingestion path — there's no manual file upload). You'll need OAuth credentials before the first sync.

1. Follow [docs/google-setup.md](../docs/google-setup.md) to create your OAuth client.
2. Create a `.env` file in the **BeStrongApp root** (one level above `docker/`):
   ```
   GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=your-client-secret
   ```
3. Restart the container so it picks up the new env vars:
   ```bash
   docker compose down
   docker compose up -d
   ```

## Common commands

```bash
docker compose up -d              # Start in background
docker compose down               # Stop
docker compose logs -f            # Tail logs
docker compose restart            # Restart without rebuilding
docker compose build --no-cache   # Force a clean rebuild
docker compose pull               # (Not used — we build locally, not pull from a registry)
```

## Updating

```bash
cd BeStrongHQ
git pull
cd docker
docker compose build
docker compose up -d
```

Your data persists across rebuilds (it lives in the `bestrong-data` and `bestrong-auth` named volumes, not in the image).

## Data and backups

Two named Docker volumes hold everything you don't want to lose:

| Volume | What's in it | Mounted at (inside container) |
|---|---|---|
| `bestrong-data` | SQLite database (`bestrong.db`) | `/data` |
| `bestrong-auth` | Google Drive OAuth tokens | `/app/.bestrong` |

Back them up:

```bash
# Stop the container first so SQLite isn't writing during the snapshot
docker compose stop

# Tar each volume to a file in your current directory
docker run --rm -v docker_bestrong-data:/data -v "$(pwd):/backup" alpine tar czf /backup/bestrong-data.tar.gz -C / data
docker run --rm -v docker_bestrong-auth:/auth -v "$(pwd):/backup" alpine tar czf /backup/bestrong-auth.tar.gz -C / auth

docker compose up -d
```

To wipe everything (irreversibly):

```bash
docker compose down -v   # -v removes the named volumes too
```

## Accessing from other devices on your LAN

By default the ports are bound to `127.0.0.1` (your local machine only). To allow other devices to connect, edit [docker-compose.yml](docker-compose.yml) and change:

```yaml
ports:
  - "127.0.0.1:3000:3000"
  - "127.0.0.1:8080:8080"
```

to:

```yaml
ports:
  - "3000:3000"
  - "8080:8080"
```

Then `docker compose up -d` again. The app will be reachable at `http://YOUR_HOST_IP:3000`. Remember to register `http://YOUR_HOST_IP:8080/api/gdrive/auth/callback` as an additional OAuth redirect URI in your Google Cloud project.

## What this Docker setup is NOT

This is the **Community Edition** — local, single-tenant, no auth required (the local SQLite is your access boundary). It deliberately does not include:

- Sentry monitoring
- Multi-tenant routing
- Cloud auth / OAuth login (you don't need to log in at all locally)
- The marketing website service
- The `bestrong_cloud` plugin overlay

Those live in a separate private deployment configuration.
