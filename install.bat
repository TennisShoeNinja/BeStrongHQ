@echo off
setlocal enabledelayedexpansion

REM ============================================================
REM  BeStrong HQ - Windows installer
REM
REM  Installs Python 3.12, Node.js LTS, and Git via winget,
REM  clones the repo into %USERPROFILE%\BeStrongHQ, and builds
REM  the app. Safe to re-run.
REM ============================================================

echo.
echo ============================================================
echo   BeStrong HQ Installer (Windows)
echo ============================================================
echo.
echo This will install Python 3.12, Node.js LTS, and Git if you
echo don't have them, then download and build BeStrong HQ.
echo.
echo Install location: %USERPROFILE%\BeStrongHQ
echo Estimated time:   10-15 minutes
echo.
pause

REM ----- Check for winget --------------------------------------
REM Invoking winget directly is more reliable than 'where winget' --
REM the WindowsApps alias can satisfy 'winget --version' even when
REM 'where' doesn't surface it.
winget --version >nul 2>nul
if errorlevel 1 (
    echo.
    echo [ERROR] 'winget' did not respond on this machine.
    echo.
    echo winget ships with Windows 10 (May 2020 update or newer)
    echo and Windows 11. Open the Microsoft Store, search for
    echo "App Installer", and click Update (or Get if missing),
    echo then close this window, open a new Command Prompt, and
    echo re-run the one-line installer.
    echo.
    echo If your Windows version is too old, follow the manual
    echo install instructions at:
    echo   https://github.com/TennisShoeNinja/BeStrongHQ/blob/main/docs/install-windows.md
    echo.
    pause
    exit /b 1
)

REM ----- Install prerequisites via winget ----------------------
echo.
echo [1/5] Installing Python 3.12...
winget install --id Python.Python.3.12 --silent --accept-source-agreements --accept-package-agreements -e >nul 2>&1
echo       Done.

echo.
echo [2/5] Installing Node.js LTS...
winget install --id OpenJS.NodeJS.LTS --silent --accept-source-agreements --accept-package-agreements -e >nul 2>&1
echo       Done.

echo.
echo [3/5] Installing Git...
winget install --id Git.Git --silent --accept-source-agreements --accept-package-agreements -e >nul 2>&1
echo       Done.

REM ----- Refresh PATH for this cmd session ---------------------
REM winget updates the registry PATH, but the current cmd session
REM has a stale copy. We add the standard install locations
REM directly so the rest of the script can find the tools.

set "PYTHON_DIR=%LOCALAPPDATA%\Programs\Python\Python312"
if exist "%PYTHON_DIR%\python.exe" (
    set "PATH=%PYTHON_DIR%;%PYTHON_DIR%\Scripts;%PATH%"
)

set "NODE_DIR=%PROGRAMFILES%\nodejs"
if exist "%NODE_DIR%\node.exe" (
    set "PATH=%NODE_DIR%;%PATH%"
)

set "GIT_DIR=%PROGRAMFILES%\Git\cmd"
if exist "%GIT_DIR%\git.exe" (
    set "PATH=%GIT_DIR%;%PATH%"
)

REM Disable Microsoft Store python.exe alias for this session by
REM ensuring the real python comes first on PATH. If python still
REM resolves to the MS Store stub, bail with a clear message.
where python >nul 2>nul
if errorlevel 1 (
    echo.
    echo [ERROR] python is not available on PATH after install.
    echo Close this window, open a new Command Prompt, and re-run
    echo install.bat. The new window will pick up the updated PATH.
    echo.
    pause
    exit /b 1
)

REM ----- Clone or update the repo ------------------------------
set "INSTALL_DIR=%USERPROFILE%\BeStrongHQ"

echo.
echo [4/5] Downloading BeStrong HQ to %INSTALL_DIR%...
if exist "%INSTALL_DIR%\.git" (
    echo       Existing checkout found, pulling latest...
    pushd "%INSTALL_DIR%"
    git pull --ff-only
    if errorlevel 1 (
        echo [ERROR] git pull failed. Resolve manually in %INSTALL_DIR% and re-run.
        popd
        pause
        exit /b 1
    )
    popd
) else if exist "%INSTALL_DIR%" (
    echo [ERROR] %INSTALL_DIR% exists but is not a git checkout.
    echo Move or delete it, then re-run install.bat.
    pause
    exit /b 1
) else (
    git clone https://github.com/TennisShoeNinja/BeStrongHQ.git "%INSTALL_DIR%"
    if errorlevel 1 (
        echo [ERROR] git clone failed. Check your internet connection and try again.
        pause
        exit /b 1
    )
)

REM ----- Build the app -----------------------------------------
echo.
echo [5/5] Building BeStrong HQ (this is the slow part, ~5-10 min)...
pushd "%INSTALL_DIR%"

echo       Installing Python dependencies...
python -m pip install -e . --quiet --disable-pip-version-check
if errorlevel 1 (
    echo [ERROR] pip install failed. See output above.
    popd
    pause
    exit /b 1
)

pushd web

echo       Installing Node dependencies (this takes a few minutes)...
call npm install --silent --no-audit --no-fund
if errorlevel 1 (
    echo [ERROR] npm install failed. See output above.
    popd
    popd
    pause
    exit /b 1
)

echo       Building the frontend (this also takes a few minutes)...
call npm run build
if errorlevel 1 (
    echo [ERROR] npm run build failed. See output above.
    popd
    popd
    pause
    exit /b 1
)

popd
popd

REM ----- Done --------------------------------------------------
echo.
echo ============================================================
echo   Installation complete!
echo ============================================================
echo.
echo Installed to: %INSTALL_DIR%
echo.
echo Next steps:
echo   1. Set up Google Drive OAuth (required to import programs):
echo      https://github.com/TennisShoeNinja/BeStrongHQ/blob/main/docs/google-setup.md
echo.
echo   2. Start BeStrong HQ:
echo        cd %INSTALL_DIR%
echo        bestrong run
echo.
echo   3. Open http://127.0.0.1:3000 in your browser.
echo.
echo If 'bestrong' is not recognized when you start it, close this
echo window and open a new Command Prompt - the PATH will refresh.
echo.
pause
endlocal
