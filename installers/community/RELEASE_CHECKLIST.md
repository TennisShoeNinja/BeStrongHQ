# Community Preview Release Checklist

Use this before publishing Community Edition preview assets to coaches.

## One-Time GitHub Setup

- Confirm `ghcr.io/tennisshoeninja/bestrong-hq` exists after the first app image
  workflow run.
- Make the GHCR app image public so coaches can pull it without logging in.
- Keep `ghcr.io/tennisshoeninja/bestrong-hq-base` public for the shared base
  image.
- Configure `https://bestronghq.com/install.sh` to serve or redirect to the
  latest `install.sh` release asset.

## Preview Build Order

1. Merge the app image workflow and preview installer assets to `main`.
2. Wait for **Publish Community Docker image** to finish.
3. Verify the image can be pulled without authentication:

   ```bash
   docker pull ghcr.io/tennisshoeninja/bestrong-hq:latest
   ```

4. Run **Package Community preview** with the preview version.
5. Download the generated artifacts:
   - `install.sh`
   - `bestrong-posix`
   - `BeStrongHQ-Community-Windows-Preview.zip`
6. Attach those assets to the GitHub Release.
7. Generate checksums for the release assets.
8. Update website download links:
   - Mac/Linux: `https://bestronghq.com/install.sh`
   - Windows: the release ZIP asset

## Smoke Test Matrix

- macOS Apple Silicon, Docker Desktop missing.
- macOS Apple Silicon, Docker Desktop already running.
- Windows 11, Docker Desktop missing.
- Windows 11, Docker Desktop already running.
- Windows 11 after reboot required by Docker Desktop.
- Existing install upgraded with `bestrong update` or `Update BeStrong.cmd`.

For each case:

1. Confirm Docker guidance is readable if Docker is missing.
2. Confirm the app opens at `http://127.0.0.1:3000`.
3. Confirm `http://127.0.0.1:8080/api/health` returns `ok`.
4. Run Troubleshoot and confirm it identifies Docker, Compose, engine state,
   data folder, runtime folder, disk space, and port status.
5. Add Google credentials to the runtime `.env`, restart, and connect Drive.
6. Run the update command and confirm it creates a DB backup.

## Manual Local Builds

Build the Windows preview ZIP:

```powershell
installers/community/windows/build-preview-zip.ps1 -Version 1.3.0-preview.1
```

Prepare POSIX assets:

```bash
mkdir -p dist/installers
cp installers/community/install.sh dist/installers/install.sh
cp installers/community/bin/bestrong dist/installers/bestrong-posix
chmod +x dist/installers/install.sh dist/installers/bestrong-posix
```

## Later Paid Signing Path

Only move to signed installers after the preview gets real demand.

Paid requirements:

- Apple Developer Program membership.
- Developer ID Installer certificate for signing `.pkg` files.
- App Store Connect notarization credentials, preferably an API key.
- Windows code signing certificate or Azure Artifact Signing.

Future signed assets:

- macOS `.pkg` from `installers/community/macos/build-pkg.sh`
- Windows `.exe` from `installers/community/windows/BeStrongSetup.iss`

Do not publish unsigned `.pkg` or `.exe` assets to coaches. For the free preview,
use the terminal script and Windows ZIP instead.

## Known Follow-Ups

- Move Google OAuth credential entry into the web app so coaches do not edit
  `.env`.
- Add an in-app update banner that points to the OS-specific update command.
- Add branded icons to future macOS `.app` launchers and Windows Start Menu
  shortcuts.
- Automate signed release attachment if signing credentials are added later.
