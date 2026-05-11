# TimeTracker Windows Bundle Builder
# This script creates a standalone Windows package with embedded Node.js runtime
# Usage: .\scripts\windows\build-bundle.ps1

param(
    [string]$OutputDir = "dist\windows",
    [string]$NodeVersion = "20.18.1",
    [switch]$SkipBuild,
    [switch]$SkipNodeDownload
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"  # Faster downloads

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Resolve-Path (Join-Path $ScriptDir "..\..") 
Set-Location $RootDir

Write-Host ""
Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host "  TimeTracker Windows Bundle Builder" -ForegroundColor Cyan
Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Output: $OutputDir" -ForegroundColor Gray
Write-Host "  Node.js: v$NodeVersion" -ForegroundColor Gray
Write-Host ""

# ═══════════════════════════════════════════════════════════════════════════════
# Step 1: Build the Next.js app
# ═══════════════════════════════════════════════════════════════════════════════
if (-not $SkipBuild) {
    Write-Host "[1/5] Building Next.js app..." -ForegroundColor Yellow
    
    # Ensure dependencies are installed
    if (-not (Test-Path "node_modules")) {
        Write-Host "      Installing dependencies..." -ForegroundColor Gray
        pnpm install
    }
    
    # Build the project
    Write-Host "      Running pnpm build..." -ForegroundColor Gray
    pnpm build
    
    if (-not (Test-Path "apps/web/.next/standalone")) {
        Write-Host "ERROR: Standalone output not found!" -ForegroundColor Red
        Write-Host "      Make sure next.config.ts has output: 'standalone'" -ForegroundColor Red
        exit 1
    }
    Write-Host "      OK - Build complete" -ForegroundColor Green
} else {
    Write-Host "[1/5] Skipping build (--SkipBuild)" -ForegroundColor Gray
}

# ═══════════════════════════════════════════════════════════════════════════════
# Step 2: Download Node.js runtime
# ═══════════════════════════════════════════════════════════════════════════════
$NodeDir = "$OutputDir\node"
$NodeZip = "$env:TEMP\node-v$NodeVersion-win-x64.zip"
$NodeUrl = "https://nodejs.org/dist/v$NodeVersion/node-v$NodeVersion-win-x64.zip"

if (-not $SkipNodeDownload -or -not (Test-Path "$NodeDir\node.exe")) {
    Write-Host "[2/5] Downloading Node.js v$NodeVersion..." -ForegroundColor Yellow
    
    if (-not (Test-Path $NodeZip)) {
        Write-Host "      URL: $NodeUrl" -ForegroundColor Gray
        Invoke-WebRequest -Uri $NodeUrl -OutFile $NodeZip
    } else {
        Write-Host "      Using cached download" -ForegroundColor Gray
    }
    
    # Extract Node.js
    Write-Host "      Extracting..." -ForegroundColor Gray
    $TempNodeDir = "$env:TEMP\node-extract"
    if (Test-Path $TempNodeDir) { Remove-Item -Recurse -Force $TempNodeDir }
    Expand-Archive -Path $NodeZip -DestinationPath $TempNodeDir
    
    # Move to output
    if (Test-Path $NodeDir) { Remove-Item -Recurse -Force $NodeDir }
    New-Item -ItemType Directory -Path $NodeDir -Force | Out-Null
    
    # Copy only essential files
    $NodeExtracted = Get-ChildItem $TempNodeDir | Select-Object -First 1
    Copy-Item "$($NodeExtracted.FullName)\node.exe" "$NodeDir\"
    
    # Clean up
    Remove-Item -Recurse -Force $TempNodeDir
    
    Write-Host "      OK - Node.js ready" -ForegroundColor Green
} else {
    Write-Host "[2/5] Skipping Node.js download (already exists)" -ForegroundColor Gray
}

# ═══════════════════════════════════════════════════════════════════════════════
# Step 3: Copy standalone build
# ═══════════════════════════════════════════════════════════════════════════════
Write-Host "[3/5] Copying standalone build..." -ForegroundColor Yellow

$AppDir = "$OutputDir\app"
if (Test-Path $AppDir) { Remove-Item -Recurse -Force $AppDir }
New-Item -ItemType Directory -Path $AppDir -Force | Out-Null

# Copy standalone output
Copy-Item -Recurse "apps/web/.next/standalone/*" "$AppDir\"

# Copy static files (required for Next.js)
if (Test-Path "apps/web/.next/static") {
    New-Item -ItemType Directory -Path "$AppDir/apps/web/.next/static" -Force | Out-Null
    Copy-Item -Recurse "apps/web/.next/static/*" "$AppDir/apps/web/.next/static/"
}

# Copy public folder
if (Test-Path "apps/web/public") {
    New-Item -ItemType Directory -Path "$AppDir/apps/web/public" -Force | Out-Null
    Copy-Item -Recurse "apps/web/public/*" "$AppDir/apps/web/public/"
}

Write-Host "      OK - App copied" -ForegroundColor Green

# ═══════════════════════════════════════════════════════════════════════════════
# Step 3.5: Flatten pnpm node_modules (fix Windows MAX_PATH issue)
# ═══════════════════════════════════════════════════════════════════════════════
Write-Host "[3.5/5] Flattening pnpm node_modules..." -ForegroundColor Yellow

& "$ScriptDir\flatten-pnpm.ps1" -AppDir "$AppDir"

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Flatten script failed!" -ForegroundColor Red
    exit 1
}

Write-Host "      OK - pnpm paths flattened" -ForegroundColor Green

# ═══════════════════════════════════════════════════════════════════════════════
# Step 4: Create launcher and config files
# ═══════════════════════════════════════════════════════════════════════════════
Write-Host "[4/5] Creating launcher files..." -ForegroundColor Yellow

# Create data directory
New-Item -ItemType Directory -Path "$OutputDir\data" -Force | Out-Null

# Copy env example
Copy-Item ".env.example" "$OutputDir\data\.env.example"

# Create start-server.js (loads .env.local from Node.js side — reliable cross-platform)
$StartServerContent = @'
// TimeTracker start-server.js
// Loads env vars from data\.env.local before starting the Next.js server.
// This replaces the fragile batch-file env parser that broke on Windows
// with values containing special characters or empty values.
const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, 'data');
// Export so the Next.js process (settings PUT) writes back to the SAME file we read from.
// Without this, the UI may write to process.cwd()/.env.local instead of data/.env.local
// and tokens "disappear" after restart.
process.env.TIMETRACKER_DATA_DIR = dataDir;
const envFile = path.join(dataDir, '.env.local');
if (fs.existsSync(envFile)) {
  const lines = fs.readFileSync(envFile, 'utf-8').split(/\r?\n/);
  let loaded = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.substring(0, eqIdx).trim();
      let val = trimmed.substring(eqIdx + 1).trim();
      // Strip surrounding quotes if present
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (val) {
        process.env[key] = val;
        loaded++;
      }
    }
  }
  console.log(`[start-server] Loaded ${loaded} env vars from data/.env.local`);
} else {
  console.log('[start-server] No data/.env.local found — using system env vars only');
}

// Log Jira config status (helps diagnose "tasks not loading" issues)
const jiraUrl = process.env.JIRA_BASE_URL;
const jiraEmail = process.env.JIRA_SERVICE_EMAIL;
const jiraKey = process.env.JIRA_API_KEY;
if (jiraUrl && jiraEmail && jiraKey) {
  console.log(`[start-server] Jira: configured (${jiraUrl})`);
} else {
  const missing = [];
  if (!jiraUrl) missing.push('JIRA_BASE_URL');
  if (!jiraEmail) missing.push('JIRA_SERVICE_EMAIL');
  if (!jiraKey) missing.push('JIRA_API_KEY');
  console.log(`[start-server] WARNING: Jira not fully configured — missing: ${missing.join(', ')}`);
}

// Start the Next.js server
require('./app/apps/web/server.js');
'@

Set-Content -Path "$OutputDir\start-server.js" -Value $StartServerContent -Encoding UTF8
Write-Host "      OK - start-server.js created" -ForegroundColor Green

# Create launcher batch file
$LauncherContent = @'
@echo off
chcp 65001 >nul 2>&1
title AI TimeTracker
cd /d "%~dp0"

:: Configuration
set PORT=5666
set APP_URL=http://localhost:%PORT%/timetracker
set AW_URL=http://localhost:5600

echo.
echo ══════════════════════════════════════════════════════════════════════
echo              AI TimeTracker - Starting...
echo ══════════════════════════════════════════════════════════════════════
echo.

:: ═══════════════════════════════════════════════════════════════════════════
:: Check ActivityWatch
:: ═══════════════════════════════════════════════════════════════════════════
echo [1/3] Checking ActivityWatch...

curl -s -o nul -w "" %AW_URL%/api/0/info >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo      ╔══════════════════════════════════════════════════════════════╗
    echo      ║  WARNING: ActivityWatch is not running!                      ║
    echo      ║                                                              ║
    echo      ║  TimeTracker requires ActivityWatch to track your activity.  ║
    echo      ║  Download from: https://activitywatch.net/downloads/         ║
    echo      ╚══════════════════════════════════════════════════════════════╝
    echo.
    
    :: Try to find and start ActivityWatch
    if exist "%LOCALAPPDATA%\activitywatch\aw-qt.exe" (
        echo      Found ActivityWatch, starting...
        start "" "%LOCALAPPDATA%\activitywatch\aw-qt.exe"
        timeout /t 5 /nobreak >nul
    ) else if exist "%LOCALAPPDATA%\Programs\activitywatch\aw-qt.exe" (
        echo      Found ActivityWatch, starting...
        start "" "%LOCALAPPDATA%\Programs\activitywatch\aw-qt.exe"
        timeout /t 5 /nobreak >nul
    )
) else (
    echo      OK - ActivityWatch running on %AW_URL%
)

:: ═══════════════════════════════════════════════════════════════════════════
:: Check/Create configuration
:: ═══════════════════════════════════════════════════════════════════════════
echo [2/3] Checking configuration...

if not exist "data\.env.local" (
    if exist "data\.env.example" (
        copy "data\.env.example" "data\.env.local" >nul
        echo.
        echo      ╔══════════════════════════════════════════════════════════════╗
        echo      ║  FIRST RUN: Configuration needed!                            ║
        echo      ║                                                              ║
        echo      ║  Please edit data\.env.local with your API tokens:           ║
        echo      ║  - TEMPO_API_TOKEN                                           ║
        echo      ║  - JIRA_BASE_URL, JIRA_SERVICE_EMAIL, JIRA_API_KEY           ║
        echo      ╚══════════════════════════════════════════════════════════════╝
        echo.
        notepad "data\.env.local"
        echo      Press any key after saving configuration...
        pause >nul
    )
) else (
    echo      OK - Configuration exists
)

:: ═══════════════════════════════════════════════════════════════════════════
:: Start the server
:: ═══════════════════════════════════════════════════════════════════════════
echo [3/3] Starting TimeTracker server...
echo.
echo ══════════════════════════════════════════════════════════════════════
echo   TimeTracker:   %APP_URL%
echo   ActivityWatch: %AW_URL%
echo ══════════════════════════════════════════════════════════════════════
echo.
echo   Opening browser in 3 seconds...
echo   Press Ctrl+C or close this window to stop.
echo.

:: Set environment variables
set NODE_ENV=production
set HOSTNAME=localhost
set PORT=5666

:: Env vars from data\.env.local are loaded by start-server.js (Node.js side)
:: Only set vars that the batch/node process itself needs:
if not defined ACTIVITYWATCH_URL set "ACTIVITYWATCH_URL=http://localhost:5600"

:: Open browser after delay
start "" /min cmd /c "timeout /t 3 /nobreak >nul && start %APP_URL%"

:: Create logs directory
if not exist "logs" mkdir logs

:: Log startup
echo [%date% %time%] Starting TimeTracker... >> "logs\timetracker.log"

:: Start Node.js server with auto-restart on crash
:start_server
"node\node.exe" "start-server.js" 2>> "logs\timetracker.log"
echo [%date% %time%] Server exited (code: %errorlevel%) >> "logs\timetracker.log"
echo.
echo   Server stopped. Restarting in 5 seconds... (close window to stop)
timeout /t 5 /nobreak >nul
goto start_server
'@

Set-Content -Path "$OutputDir\TimeTracker.bat" -Value $LauncherContent -Encoding UTF8

# Create PowerShell launcher (alternative)
$PsLauncherContent = @'
# AI TimeTracker Launcher (PowerShell)
$ErrorActionPreference = "SilentlyContinue"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

$Port = 5666
$AppUrl = "http://localhost:$Port/timetracker"
$AwUrl = "http://localhost:5600"

Write-Host ""
Write-Host "AI TimeTracker - Starting..." -ForegroundColor Cyan
Write-Host ""

# Check ActivityWatch
try {
    $null = Invoke-RestMethod -Uri "$AwUrl/api/0/info" -TimeoutSec 2
    Write-Host "[OK] ActivityWatch running" -ForegroundColor Green
} catch {
    Write-Host "[!] ActivityWatch not running!" -ForegroundColor Yellow
    Write-Host "    Download: https://activitywatch.net/downloads/" -ForegroundColor Gray
    
    # Try to start
    $awPaths = @(
        "$env:LOCALAPPDATA\activitywatch\aw-qt.exe",
        "$env:LOCALAPPDATA\Programs\activitywatch\aw-qt.exe"
    )
    foreach ($path in $awPaths) {
        if (Test-Path $path) {
            Write-Host "    Starting ActivityWatch..." -ForegroundColor Gray
            Start-Process $path
            Start-Sleep -Seconds 5
            break
        }
    }
}

# Check config
if (-not (Test-Path "data\.env.local")) {
    if (Test-Path "data\.env.example") {
        Copy-Item "data\.env.example" "data\.env.local"
        Write-Host "[!] First run - please configure data\.env.local" -ForegroundColor Yellow
        Start-Process notepad "data\.env.local" -Wait
    }
}

# Env vars from data\.env.local are loaded by start-server.js (Node.js side)

# Set server env
$env:NODE_ENV = "production"
$env:HOSTNAME = "localhost"
$env:PORT = $Port

Write-Host ""
Write-Host "Starting server on $AppUrl" -ForegroundColor Cyan
Write-Host "Press Ctrl+C to stop" -ForegroundColor Gray
Write-Host ""

# Open browser
Start-Job { Start-Sleep -Seconds 3; Start-Process $using:AppUrl } | Out-Null

# Start server (start-server.js loads .env.local before launching Next.js)
& "node\node.exe" "start-server.js"
'@

Set-Content -Path "$OutputDir\TimeTracker.ps1" -Value $PsLauncherContent -Encoding UTF8

# Copy VBS silent launcher
Copy-Item "$ScriptDir\TimeTrackerSilent.vbs" "$OutputDir\TimeTrackerSilent.vbs"

Write-Host "      OK - Launchers created" -ForegroundColor Green

# ═══════════════════════════════════════════════════════════════════════════════
# Step 5: Summary
# ═══════════════════════════════════════════════════════════════════════════════
Write-Host "[5/5] Bundle complete!" -ForegroundColor Yellow
Write-Host ""

$BundleSize = (Get-ChildItem -Recurse $OutputDir | Measure-Object -Property Length -Sum).Sum / 1MB
Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host "  Bundle created: $OutputDir" -ForegroundColor Green
Write-Host "  Size: $([math]::Round($BundleSize, 2)) MB" -ForegroundColor Gray
Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Contents:" -ForegroundColor White
Write-Host "  - node\node.exe    (Node.js runtime)" -ForegroundColor Gray
Write-Host "  - app\             (Next.js standalone)" -ForegroundColor Gray
Write-Host "  - data\            (Configuration)" -ForegroundColor Gray
Write-Host "  - TimeTracker.bat  (Launcher)" -ForegroundColor Gray
Write-Host ""
Write-Host "  To test: cd $OutputDir && .\TimeTracker.bat" -ForegroundColor Yellow
Write-Host ""
