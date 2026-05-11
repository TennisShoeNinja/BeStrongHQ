param(
    [Parameter(Position = 0)]
    [string]$Command = "help"
)

$ErrorActionPreference = "Stop"

$AppName = "BeStrong HQ"
$DefaultImage = "ghcr.io/tennisshoeninja/bestrong-hq:latest"
$UiUrl = "http://127.0.0.1:3000"
$ApiUrl = "http://127.0.0.1:8080"
$DockerDownloadUrl = "https://www.docker.com/products/docker-desktop/"

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

function Test-ComposeServiceRunning {
    $Services = & docker compose --env-file $EnvFile -f $ComposeFile ps --services --status running 2>$null
    return $Services -contains "bestrong"
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

function Open-DockerDownload {
    Write-Info "Docker Desktop is not installed. Opening the Docker Desktop download page..."
    Start-Process $DockerDownloadUrl
}

function Wait-DockerEngine {
    param([int]$Attempts = 60)
    for ($i = 0; $i -lt $Attempts; $i++) {
        if (Test-DockerRunning) {
            return $true
        }
        Start-Sleep -Seconds 2
    }
    return $false
}

function Start-DockerDesktop {
    $ProgramFiles = [Environment]::GetFolderPath("ProgramFiles")
    $ProgramFilesX86 = [Environment]::GetFolderPath("ProgramFilesX86")
    $Candidates = @()

    if ($ProgramFiles) {
        $Candidates += Join-Path $ProgramFiles "Docker\Docker\Docker Desktop.exe"
    }
    if ($ProgramFilesX86) {
        $Candidates += Join-Path $ProgramFilesX86 "Docker\Docker\Docker Desktop.exe"
    }

    $DockerDesktop = $Candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
    if (-not $DockerDesktop) {
        $Command = Get-Command "Docker Desktop.exe" -ErrorAction SilentlyContinue
        if ($Command) {
            $DockerDesktop = $Command.Source
        }
    }

    if (-not $DockerDesktop) {
        return $false
    }

    Write-Info "Docker is installed but not running. Opening Docker Desktop..."
    Start-Process -FilePath $DockerDesktop | Out-Null
    Write-Info "Waiting for Docker Desktop to start..."

    if (Wait-DockerEngine) {
        Write-Info "Docker Desktop is running."
        return $true
    }

    return $false
}

function Require-Docker {
    if (-not (Test-DockerCommand)) {
        Open-DockerDownload
        throw "Install Docker Desktop, open it once, then run 'Open BeStrong.cmd' again."
    }
    if (-not (Test-DockerCompose)) {
        throw "Docker Compose is not available. Update Docker Desktop, then run 'bestrong start' again."
    }
    if (-not (Test-DockerRunning)) {
        if (Start-DockerDesktop) {
            return
        }
        Write-Info "Open Docker Desktop, wait for it to finish starting, then run 'Open BeStrong.cmd' again."
        throw "Docker is installed but not running."
    }
}

function Get-PortListeners {
    param([int]$Port)
    if (-not (Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue)) {
        return @()
    }

    $Connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if (-not $Connections) {
        return @()
    }

    $Rows = @()
    foreach ($Connection in $Connections) {
        $ProcessName = "unknown"
        try {
            $ProcessName = (Get-Process -Id $Connection.OwningProcess -ErrorAction Stop).ProcessName
        } catch {
            $ProcessName = "unknown"
        }
        $Rows += "  $ProcessName pid $($Connection.OwningProcess) on port $Port"
    }
    return $Rows
}

function Test-PortsAvailable {
    if (-not (Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue)) {
        return
    }

    if (Test-ComposeServiceRunning) {
        return
    }

    $Conflicts = @()
    foreach ($Port in @(3000, 8080)) {
        $Listeners = @(Get-PortListeners -Port $Port)
        if ($Listeners.Count -gt 0) {
            Write-Info "Port ${Port} is already in use:"
            foreach ($Listener in $Listeners) {
                Write-Info $Listener
            }
            $Conflicts += $Port
        }
    }

    if ($Conflicts.Count -gt 0) {
        Write-Info "Stop the app using those ports, then run Open BeStrong.cmd again."
        throw "$AppName needs ports 3000 and 8080."
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
        Test-PortsAvailable
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
        Test-PortsAvailable
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
        Write-Info "- If Docker is missing, run Open BeStrong.cmd to open the Docker Desktop download page."
        Write-Info "- If Docker is not running, run Open BeStrong.cmd to let BeStrong try to open it, or open Docker Desktop manually."
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
