# ============================================================
#  BeStrong HQ - Community Edition Dockerfile
#
#  Self-hosted local install. Single container running both the
#  FastAPI backend (port 8080) and the Next.js standalone server
#  (port 3000). Defaults to local mode -- no auth, the local SQLite
#  is the access boundary.
#
#  This file ALSO defines the `system-base` stage that the private
#  cloud Dockerfile (in BeStrongOps) extends via:
#      FROM bestrong-hq:system-base AS system-base
#  Keep `system-base` minimal and stable -- shared OS packages only.
#  Anything community-specific belongs in the stages below it.
#
#  Drift surface that still needs manual mirroring between this file
#  and cloud's Dockerfile: the standalone-static-copy step, the
#  EXPOSE ports, and BESTRONG_DB_PATH. Everything else (apt packages,
#  Python/Node base versions, system deps) syncs automatically via
#  system-base.
# ============================================================

# ----- system-base (SHARED with cloud/Dockerfile) ----------
# OS packages only. Both editions FROM this. Bumping versions here
# bumps both.
FROM python:3.11-slim AS system-base

# gcc + curl for building Python wheels and fetching NodeSource.
# git is needed by the parser for any future git-driven workflows
# and is small enough to include unconditionally.
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        gcc curl git ca-certificates && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y --no-install-recommends nodejs && \
    rm -rf /var/lib/apt/lists/*

# Debian enforces PEP 668 by default and refuses pip install into the
# system site-packages without this. Inside a container we WANT
# system-wide installs, so opt out of the protection.
ENV PIP_BREAK_SYSTEM_PACKAGES=1

WORKDIR /app

# ----- frontend (community-only) ---------------------------
# Build the Next.js bundle with the local API URL baked in. Cloud's
# Dockerfile has its own frontend stage that adds Sentry args + the
# cloud_pkg overlay; this one keeps it simple.
FROM system-base AS frontend
WORKDIR /app/web

# Copy package files first so npm install caches across rebuilds.
COPY web/package.json web/package-lock.json* ./
RUN npm install --no-audit --no-fund

COPY web/ ./

# NEXT_PUBLIC_API_URL is read at BUILD time and inlined into the
# bundle. The same container runs the API on 8080. Without this, the
# frontend defaults to relative /api paths which hit port 3000 (Next)
# instead of 8080 (FastAPI), causing the dashboard to hang on
# "Loading..." forever.
ENV NEXT_PUBLIC_API_URL=http://127.0.0.1:8080
RUN npm run build

# next.config.js sets output: "standalone". The standalone server
# expects static assets under .next/standalone/.next/static and any
# public/ files under .next/standalone/public, but Next does NOT copy
# them there. Without these, every JS chunk 404s on page load.
# (DRIFT: cloud/Dockerfile has the same step -- mirror any change.)
RUN cp -r .next/static .next/standalone/.next/static && \
    cp -r public .next/standalone/public

# ----- runtime (community-only) ----------------------------
# Final image. pip install the bestrong package, copy the standalone
# frontend in, expose the ports, and CMD bestrong run.
FROM system-base

# Copy only what setup needs first so the pip layer caches.
COPY pyproject.toml README.md ./
COPY bestrong/ ./bestrong/
# Editable install so cli.py's __file__ resolves to /app/bestrong/cli.py
# and Path(__file__).parent.parent finds /app/web/ (where the standalone
# frontend gets copied below). A non-editable install puts bestrong/ in
# site-packages, breaking the relative web/ lookup at runtime.
RUN pip install --no-cache-dir -e .

# Bring in the built standalone frontend from the frontend stage.
# cli.py detects .next/standalone/server.js and runs `node server.js`
# from that directory.
COPY --from=frontend /app/web/.next/standalone /app/web/.next/standalone

# Persistent data lives in /data (SQLite) and /app/.bestrong
# (gdrive OAuth tokens). docker-compose.yml mounts volumes for both.
RUN mkdir -p /data /app/.bestrong/gdrive

# (DRIFT: cloud/Dockerfile mirrors this default. Keep them aligned.)
ENV BESTRONG_DB_PATH=/data/bestrong.db

# (DRIFT: cloud/Dockerfile mirrors these ports. Keep them aligned.)
EXPOSE 3000 8080

# `bestrong run` starts both processes. --host 0.0.0.0 makes them
# reachable from outside the container; docker-compose.yml binds the
# published ports to 127.0.0.1 on the host so they don't accidentally
# face the public internet.
CMD ["bestrong", "run", "--host", "0.0.0.0"]
