@echo off
setlocal enabledelayedexpansion
title TimeTracker Complete Launcher
cd /d "%~dp0"

echo.
echo ============================================
echo    TimeTracker Complete - Starting...
echo ============================================
echo.

:: === STEP 1: Check/Download ActivityWatch ===
set "AW_DIR=%~dp0ActivityWatch"
set "AW_EXE=%AW_DIR%\aw-qt.exe"
set "AW_ZIP=%~dp0activitywatch-download.zip"
set "AW_VERSION=v0.13.1"
set "AW_URL=https://github.com/ActivityWatch/activitywatch/releases/download/%AW_VERSION%/activitywatch-%AW_VERSION%-windows-x86_64.zip"

if not exist "%AW_EXE%" (
    echo [1/4] ActivityWatch not found - downloading...
    echo       Version: %AW_VERSION%
    echo       This is a one-time download (~100MB^)
    echo.

    :: Check if curl exists
    where curl >nul 2>&1
    if errorlevel 1 (
        echo [ERROR] curl not found. Please install Windows 10+ or download curl.
        echo         Or download ActivityWatch manually from: https://activitywatch.net
        pause
        exit /b 1
    )

    :: Download using curl
    echo       Downloading from GitHub...
    curl -L --progress-bar -o "%AW_ZIP%" "%AW_URL%"
    if errorlevel 1 (
        echo.
        echo [ERROR] Failed to download ActivityWatch!
        echo         Please check your internet connection.
        echo         Or download manually from: https://activitywatch.net
        del "%AW_ZIP%" 2>nul
        pause
        exit /b 1
    )

    :: Extract using PowerShell
    echo.
    echo       Extracting ActivityWatch...
    powershell -NoProfile -Command "Expand-Archive -Path '%AW_ZIP%' -DestinationPath '%~dp0' -Force"
    if errorlevel 1 (
        echo [ERROR] Failed to extract ActivityWatch!
        del "%AW_ZIP%" 2>nul
        pause
        exit /b 1
    )

    :: Rename extracted folder (GitHub releases extract to 'activitywatch' folder)
    if exist "%~dp0activitywatch" (
        if not exist "%AW_DIR%" (
            move "%~dp0activitywatch" "%AW_DIR%" >nul 2>&1
        ) else (
            xcopy /E /Y "%~dp0activitywatch\*" "%AW_DIR%\" >nul 2>&1
            rmdir /S /Q "%~dp0activitywatch" 2>nul
        )
    )

    :: Cleanup
    del "%AW_ZIP%" 2>nul

    if exist "%AW_EXE%" (
        echo [1/4] ActivityWatch installed successfully!
    ) else (
        echo [ERROR] ActivityWatch installation failed!
        echo         Expected file: %AW_EXE%
        pause
        exit /b 1
    )
) else (
    echo [1/4] ActivityWatch found.
)

:: === STEP 2: Start ActivityWatch ===
echo [2/4] Starting ActivityWatch...
tasklist /FI "IMAGENAME eq aw-qt.exe" 2>NUL | find /I "aw-qt.exe" >NUL
if errorlevel 1 (
    start "" /MIN "%AW_EXE%"
    echo       Waiting for ActivityWatch to start...
    timeout /t 5 /nobreak >nul
) else (
    echo       ActivityWatch is already running.
)

:: Verify ActivityWatch API is responding
curl -s http://localhost:5600/api/0/info >nul 2>&1
if errorlevel 1 (
    echo       Waiting for ActivityWatch API...
    timeout /t 5 /nobreak >nul
    curl -s http://localhost:5600/api/0/info >nul 2>&1
    if errorlevel 1 (
        echo [WARNING] ActivityWatch API not responding.
        echo          TimeTracker will start but activity tracking may not work.
    )
)

:: === STEP 3: Start TimeTracker ===
echo [3/4] Starting TimeTracker server...
set "TT_DIR=%~dp0TimeTracker"

:: Check if TimeTracker exists
if not exist "%TT_DIR%\node\node.exe" (
    echo [ERROR] TimeTracker not found!
    echo         Expected: %TT_DIR%\node\node.exe
    echo         Please ensure the TimeTracker folder is present.
    pause
    exit /b 1
)

cd /d "%TT_DIR%"

:: Load .env.local if exists
if exist "data\.env.local" (
    for /f "usebackq tokens=1,* delims==" %%a in ("data\.env.local") do (
        if not "%%a"=="" if not "%%b"=="" (
            set "%%a=%%b"
        )
    )
)

:: Set default port
set "PORT=5666"
set "HOSTNAME=localhost"

:: Check if port is already in use
netstat -an | find ":%PORT% " | find "LISTENING" >nul 2>&1
if not errorlevel 1 (
    echo       TimeTracker is already running on port %PORT%.
) else (
    :: Start the server
    start "" /MIN "node\node.exe" "app\apps\web\server.js"
    echo       Server starting on port %PORT%...
    timeout /t 3 /nobreak >nul
)

:: === STEP 4: Open browser ===
echo [4/4] Opening browser...
timeout /t 2 /nobreak >nul
start "" http://localhost:5666/timetracker

echo.
echo ============================================
echo    TimeTracker is running!
echo ============================================
echo.
echo    TimeTracker:   http://localhost:5666/timetracker
echo    ActivityWatch: http://localhost:5600
echo.
echo    To configure connections (Jira, Tempo, AI):
echo    http://localhost:5666/timetracker/connections
echo.
echo ============================================
echo.
echo Press any key to close this window...
echo (TimeTracker will continue running in background)
pause >nul
