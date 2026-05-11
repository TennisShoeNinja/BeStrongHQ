param(
    [Parameter(Position = 0)]
    [string]$Command = "help"
)

$ErrorActionPreference = "Stop"

$AppName = "BeStrong HQ"
$DefaultImage = "ghcr.io/tennisshoeninja/bestrong-hq:latest"
$UiUrl = "http://127.0.0.1:3000"
$ApiUrl = "http://127.0.0.1:8080"

function Get-BeStrongRoot {
    if ($env:BESTRONG_HOME) {
        return $env:BESTRONG_HOME
    }
    return Join-Path $env:LOCALAPPDATA "BeStrongHQ"
}

$Root = Get-BeStrongRoot
$RuntimeDir = Join-Path $Root "runtime"
$DataDir = Join-Path $Root "data"
$ConfigDir = Join-Path $Root "config"
$LogDir = Join-Path $Root "logs"
$BackupDir = Join-Path $Root "backups"
$ComposeFile = Join-Path $RuntimeDir "compose.yml"
$EnvFile = Join-Path $RuntimeDir ".env"

function Write-Info {
    param([string]$Message)
    Write-Host $Message
}

function Write-ComposeFile {
    New-Item -ItemType Directory -Force -Path $RuntimeDir | Out-Null
    @"
name: bestrong-hq-community

services:
  bestrong:
    image: `${BESTRONG_IMAGE:-ghcr.io/tennisshoeninja/bestrong-hq:latest}
    container_name: bestrong-hq-community
    restart: unless-stopped
    ports:
      - "`${BESTRONG_UI_BIND:-127.0.0.1:3000}:3000"
      - "`${BESTRONG_API_BIND:-127.0.0.1:8080}:8080"
    env_file:
      - ./.env
    environment:
      DEPLOYMENT_MODE: local
      BESTRONG_DB_PATH: /data/bestrong.db
    healthcheck:
      test: ["CMD", "curl", "-fsS", "http://127.0.0.1:8080/api/health"]
      interval: 30s
      timeout: 5s
      retries: 5
      start_period: 30s
    volumes:
      - type: bind
        source: `${BESTRONG_DATA_DIR}
        target: /data
      - type: bind
        source: `${BESTRONG_CONFIG_DIR}
        target: /app/.bestrong
"@ | Set-Content -Path $ComposeFile -Encoding UTF8
}

function Format-EnvValue {
    param([string]$Value)
    $Escaped = $Value.Replace("\", "\\").Replace('"', '\"')
    return '"' + $Escaped + '"'
}

function Write-EnvFile {
    New-Item -ItemType Directory -Force -Path $RuntimeDir, $DataDir, $ConfigDir, $LogDir, $BackupDir | Out-Null
    if (Test-Path $EnvFile) {
        return
    }

    @(
        "BESTRONG_IMAGE=$DefaultImage",
        "BESTRONG_DATA_DIR=$(Format-EnvValue $DataDir)",
        "BESTRONG_CONFIG_DIR=$(Format-EnvValue $ConfigDir)",
        "GOOGLE_CLIENT_ID=",
        "GOOGLE_CLIENT_SECRET=",
        "GOOGLE_OAUTH_TESTING_MODE=true"
    ) | Set-Content -Path $EnvFile -Encoding UTF8
}

function Ensure-Runtime {
    Write-ComposeFile
    Write-EnvFile
}

function Invoke-Compose {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Args)
    & docker compose --env-file $EnvFile -f $ComposeFile @Args
}

function Test-DockerCommand {
    return $null -ne (Get-Command docker -ErrorAction SilentlyContinue)
}

function Test-DockerCompose {
    if (-not (Test-DockerCommand)) {
        return $false
    }
    & docker compose version *> $null
    return $LASTEXITCODE -eq 0
}

function Test-DockerRunning {
    if (-not (Test-DockerCommand)) {
        return $false
    }
    & docker info *> $null
    return $LASTEXITCODE -eq 0
}

function Require-Docker {
    if (-not (Test-DockerCommand)) {
        throw "Docker Desktop is not installed. Install Docker Desktop, open it once, then run 'bestrong start' again."
    }
    if (-not (Test-DockerCompose)) {
        throw "Docker Compose is not available. Update Docker Desktop, then run 'bestrong start' again."
    }
    if (-not (Test-DockerRunning)) {
        throw "Docker is installed but not running. Open Docker Desktop and wait for it to say Docker is running."
    }
}

function Wait-Health {
    for ($i = 0; $i -lt 60; $i++) {
        try {
            Invoke-WebRequest -Uri "$ApiUrl/api/health" -UseBasicParsing -TimeoutSec 2 | Out-Null
            return $true
        } catch {
            Start-Sleep -Seconds 2
        }
    }
    return $false
}

function Backup-Database {
    $Db = Join-Path $DataDir "bestrong.db"
    if (-not (Test-Path $Db)) {
        return
    }

    New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
    $Stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $Backup = Join-Path $BackupDir "bestrong-$Stamp.db"
    Copy-Item -Path $Db -Destination $Backup
    Write-Info "Backed up database to $Backup"
}

function Open-BeStrong {
    Start-Process $UiUrl
}

function Test-Port {
    param([int]$Port)
    if (-not (Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue)) {
        Write-Info "Port ${Port}: unknown"
        return
    }
    $Connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if ($Connections) {
        Write-Info "Port ${Port}: in use"
    } else {
        Write-Info "Port ${Port}: available"
    }
}

function Write-DiskSpace {
    try {
        $DriveRoot = [System.IO.Path]::GetPathRoot((Resolve-Path $Root).Path)
        $Drive = Get-PSDrive -Name $DriveRoot.TrimEnd(":\") -ErrorAction Stop
        $FreeGb = [math]::Round($Drive.Free / 1GB, 1)
        Write-Info "Disk: $FreeGb GB free on $DriveRoot"
    } catch {
        Write-Info "Disk: unknown"
    }
}

function Show-Help {
    @"
BeStrong HQ local manager

Usage:
  bestrong setup      Create local runtime files
  bestrong open       Start BeStrong and open the browser
  bestrong start      Start BeStrong
  bestrong stop       Stop BeStrong
  bestrong status     Show container status
  bestrong logs       Follow app logs
  bestrong update     Back up data, pull the latest image, and restart
  bestrong doctor     Check Docker, ports, and local folders

Environment:
  BESTRONG_HOME       Override the local data folder
  BESTRONG_IMAGE      Set in runtime\.env to pin a specific image tag
"@ | Write-Host
}

switch ($Command.ToLowerInvariant()) {
    "setup" {
        Ensure-Runtime
        Write-Info "$AppName setup files are ready."
        Write-Info "Data folder: $DataDir"
        Write-Info "Config file: $EnvFile"
    }
    "start" {
        Ensure-Runtime
        Require-Docker
        Write-Info "Starting $AppName..."
        Invoke-Compose up -d
        if (Wait-Health) {
            Write-Info "$AppName is running at $UiUrl"
        } else {
            Write-Info "$AppName is starting, but the health check did not answer yet."
            Write-Info "Run 'bestrong logs' if the page does not load."
        }
    }
    "open" {
        Ensure-Runtime
        Require-Docker
        Write-Info "Starting $AppName..."
        Invoke-Compose up -d
        if (Wait-Health) {
            Write-Info "$AppName is running at $UiUrl"
        } else {
            Write-Info "$AppName is starting, but the health check did not answer yet."
        }
        Open-BeStrong
    }
    "stop" {
        Ensure-Runtime
        Require-Docker
        Invoke-Compose down
        Write-Info "$AppName stopped."
    }
    "status" {
        Ensure-Runtime
        if (-not (Test-DockerCompose)) {
            Write-Info "Docker: not ready"
            exit 1
        }
        Invoke-Compose ps
    }
    "logs" {
        Ensure-Runtime
        Require-Docker
        Invoke-Compose logs -f --tail=200
    }
    "update" {
        Ensure-Runtime
        Require-Docker
        Backup-Database
        Write-Info "Updating $AppName..."
        Invoke-Compose pull
        Invoke-Compose up -d
        if (Wait-Health) {
            Write-Info "$AppName is updated and running at $UiUrl"
        } else {
            Write-Info "Update finished, but the health check did not answer yet."
            Write-Info "Run 'bestrong logs' if the page does not load."
        }
    }
    "doctor" {
        Ensure-Runtime
        Write-Info "$AppName doctor"
        Write-Info ""
        Write-Info "Home: $Root"
        Write-Info "Data: $DataDir"
        Write-Info "Runtime: $RuntimeDir"
        Write-Info ""
        if (Test-DockerCommand) { Write-Info "Docker CLI: installed" } else { Write-Info "Docker CLI: missing" }
        if (Test-DockerCompose) { Write-Info "Docker Compose: installed" } else { Write-Info "Docker Compose: missing" }
        if (Test-DockerRunning) { Write-Info "Docker engine: running" } else { Write-Info "Docker engine: not running" }

        if (Get-Command wsl -ErrorAction SilentlyContinue) {
            Write-Info "WSL: installed"
        } else {
            Write-Info "WSL: not detected"
        }

        try {
            $Computer = Get-CimInstance Win32_ComputerSystem
            Write-Info "Hypervisor present: $($Computer.HypervisorPresent)"
        } catch {
            Write-Info "Hypervisor present: unknown"
        }

        Write-DiskSpace
        Test-Port 3000
        Test-Port 8080
        Write-Info ""
        Write-Info "Fixes:"
        Write-Info "- If Docker is missing, install Docker Desktop."
        Write-Info "- If Docker is not running, open Docker Desktop and wait for it to finish starting."
        Write-Info "- If WSL is missing, install Docker Desktop with the WSL2 backend enabled."
        Write-Info "- If a port is in use, stop the other app or restart your computer."
    }
    "help" {
        Show-Help
    }
    "--help" {
        Show-Help
    }
    "-h" {
        Show-Help
    }
    default {
        Write-Info "Unknown command: $Command"
        Show-Help
        exit 1
    }
}
