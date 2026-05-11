param(
    [string]$Version = "0.1.0-preview"
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$CommunityDir = Split-Path -Parent $ScriptDir
$RootDir = Split-Path -Parent (Split-Path -Parent $CommunityDir)
$OutDir = Join-Path $RootDir "dist\installers"
$StageRoot = Join-Path $RootDir "dist\windows-preview"
$PackageName = "BeStrongHQ-Community-Windows-Preview-$Version"
$StageDir = Join-Path $StageRoot $PackageName
$ZipPath = Join-Path $OutDir "BeStrongHQ-Community-Windows-Preview.zip"

if (Test-Path $StageRoot) {
    Remove-Item -Recurse -Force $StageRoot
}
New-Item -ItemType Directory -Force -Path $StageDir, (Join-Path $StageDir "bin"), $OutDir | Out-Null

Copy-Item -Path (Join-Path $CommunityDir "bin\bestrong.ps1") -Destination (Join-Path $StageDir "bin\bestrong.ps1")
Copy-Item -Path (Join-Path $CommunityDir "bin\bestrong.cmd") -Destination (Join-Path $StageDir "bin\bestrong.cmd")

function Write-Launcher {
    param(
        [string]$Name,
        [string]$Command,
        [switch]$KeepOpen
    )

    $SuccessPause = if ($KeepOpen) {
        @"
if "%BESTRONG_EXIT%"=="0" pause
"@
    } else {
        ""
    }
    @"
@echo off
setlocal
cd /d "%~dp0"
call ".\bin\bestrong.cmd" $Command
set "BESTRONG_EXIT=%ERRORLEVEL%"
if not "%BESTRONG_EXIT%"=="0" pause
$SuccessPause
exit /b %BESTRONG_EXIT%
"@ | Set-Content -Path (Join-Path $StageDir $Name) -Encoding ASCII
}

Write-Launcher -Name "Open BeStrong.cmd" -Command "open"
Write-Launcher -Name "Start BeStrong.cmd" -Command "start"
Write-Launcher -Name "Stop BeStrong.cmd" -Command "stop"
Write-Launcher -Name "Update BeStrong.cmd" -Command "update" -KeepOpen
Write-Launcher -Name "Troubleshoot BeStrong.cmd" -Command "doctor" -KeepOpen

@"
BeStrong HQ Community Preview

This preview ZIP is unsigned. Windows may warn you because the first preview
release is not code signed.

Before opening BeStrong:

1. Install Docker Desktop from https://www.docker.com/products/docker-desktop/
2. Open Docker Desktop once and wait for it to say Docker is running.
3. Double-click Open BeStrong.cmd.

Useful files:

- Open BeStrong.cmd starts BeStrong and opens the browser.
- Update BeStrong.cmd backs up your database, pulls the newest image, and restarts.
- Troubleshoot BeStrong.cmd checks Docker, WSL, ports, and local folders.

BeStrong opens at:

http://127.0.0.1:3000

Your data folder is:

%LOCALAPPDATA%\BeStrongHQ
"@ | Set-Content -Path (Join-Path $StageDir "README-FIRST.txt") -Encoding ASCII

if (Test-Path $ZipPath) {
    Remove-Item -Force $ZipPath
}
Compress-Archive -Path (Join-Path $StageDir "*") -DestinationPath $ZipPath -Force

Write-Host "Built $ZipPath"
