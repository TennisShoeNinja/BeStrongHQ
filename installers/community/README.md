# BeStrong HQ Community Preview Packaging

This directory contains the no-cost Community Edition preview install path.
Docker remains the runtime, but coaches should interact with BeStrong through
`bestrong` commands or Windows double-click launchers instead of direct Docker
commands.

The signed Mac and Windows installer scaffolds are still here for later, but
the current preview release should use:

- macOS: `curl -fsSL https://bestronghq.com/install.sh | bash`
- Windows: `BeStrongHQ-Community-Windows-Preview.zip`
- Linux: `curl -fsSL https://bestronghq.com/install.sh | bash`

## Runtime Model

- App image: `ghcr.io/tennisshoeninja/bestrong-hq:latest`
- UI: <http://127.0.0.1:3000>
- API: <http://127.0.0.1:8080>
- macOS data: `~/Library/Application Support/BeStrongHQ/`
- Windows data: `%LOCALAPPDATA%\BeStrongHQ\`
- Linux data: `${XDG_DATA_HOME:-~/.local/share}/bestrong-hq/`

The manager writes a local Compose file and `.env` file into the runtime folder.
Coach data is stored in a normal host folder, not an opaque Docker named volume.

## POSIX Commands

```bash
bestrong setup
bestrong open
bestrong start
bestrong stop
bestrong update
bestrong logs
bestrong doctor
```

`update` backs up `bestrong.db` before pulling the newest image.

## Windows Preview ZIP

Build locally:

```powershell
installers/community/windows/build-preview-zip.ps1 -Version 1.3.0-preview.1
```

The ZIP contains:

- `Open BeStrong.cmd`
- `Start BeStrong.cmd`
- `Stop BeStrong.cmd`
- `Update BeStrong.cmd`
- `Troubleshoot BeStrong.cmd`
- `README-FIRST.txt`
- `bin/bestrong.cmd`
- `bin/bestrong.ps1`

The `.cmd` files call PowerShell with `-ExecutionPolicy Bypass`, scoped only to
that invocation.

## POSIX Script

Linux and macOS use the same script:

```bash
curl -fsSL https://bestronghq.com/install.sh | bash
```

The hosted script should serve `installers/community/install.sh` or redirect to
the matching release asset. The script downloads `bestrong-posix` from the
latest GitHub Release and installs the POSIX manager into `~/.local/bin`.

## Packaging Workflow

Run **Package Community preview** from GitHub Actions with a version number to
produce preview artifacts:

- `install.sh`
- `bestrong-posix`
- `BeStrongHQ-Community-Windows-Preview.zip`

Use [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) before publishing anything to
coaches.

## Future Signed Installer Scaffolds

macOS package:

```bash
installers/community/macos/build-pkg.sh
```

Windows Inno Setup script:

```text
installers/community/windows/BeStrongSetup.iss
```

Do not make these the recommended coach path until signing and notarization are
funded and tested.
