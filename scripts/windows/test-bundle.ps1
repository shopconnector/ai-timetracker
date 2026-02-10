# Quick local test of the Windows bundle
# Usage: .\scripts\windows\test-bundle.ps1

param(
    [string]$BundleDir = "dist\windows",
    [int]$Port = 5666,
    [int]$WaitSeconds = 15
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  TimeTracker Bundle Test" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Verify bundle exists
if (-not (Test-Path "$BundleDir\node\node.exe")) {
    Write-Host "ERROR: Bundle not found at $BundleDir" -ForegroundColor Red
    Write-Host "Run build-bundle.ps1 first" -ForegroundColor Yellow
    exit 1
}

if (-not (Test-Path "$BundleDir\app\apps\web\server.js")) {
    Write-Host "ERROR: Server not found in bundle" -ForegroundColor Red
    exit 1
}

Write-Host "[1/3] Starting server..." -ForegroundColor Yellow

# Set environment
$env:NODE_ENV = "production"
$env:HOSTNAME = "localhost"
$env:PORT = $Port
$env:ACTIVITYWATCH_URL = "http://localhost:5600"

# Start server process
$ServerProcess = Start-Process -FilePath "$BundleDir\node\node.exe" `
    -ArgumentList "$BundleDir\app\apps\web\server.js" `
    -PassThru -NoNewWindow

Write-Host "      Server PID: $($ServerProcess.Id)" -ForegroundColor Gray
Write-Host "      Waiting $WaitSeconds seconds for startup..." -ForegroundColor Gray

Start-Sleep -Seconds $WaitSeconds

Write-Host "[2/3] Testing endpoints..." -ForegroundColor Yellow

$TestUrl = "http://localhost:$Port/timetracker"
$StatusUrl = "$TestUrl/api/status"

$TestsPassed = $true

# Test main page
try {
    $Response = Invoke-WebRequest -Uri $TestUrl -TimeoutSec 5 -ErrorAction Stop
    if ($Response.StatusCode -eq 200) {
        Write-Host "      OK - Main page ($TestUrl)" -ForegroundColor Green
    }
} catch {
    Write-Host "      FAIL - Main page: $_" -ForegroundColor Red
    $TestsPassed = $false
}

# Test status API
try {
    $Response = Invoke-WebRequest -Uri $StatusUrl -TimeoutSec 5 -ErrorAction Stop
    $StatusData = $Response.Content | ConvertFrom-Json
    Write-Host "      OK - Status API" -ForegroundColor Green
    
    foreach ($api in $StatusData.apis) {
        $Color = if ($api.status -eq "ok") { "Green" } elseif ($api.status -eq "error") { "Yellow" } else { "Gray" }
        Write-Host "           - $($api.name): $($api.status)" -ForegroundColor $Color
    }
} catch {
    Write-Host "      WARN - Status API (expected without ActivityWatch)" -ForegroundColor Yellow
}

Write-Host "[3/3] Cleanup..." -ForegroundColor Yellow

# Stop server
Stop-Process -Id $ServerProcess.Id -Force -ErrorAction SilentlyContinue
Write-Host "      Server stopped" -ForegroundColor Gray

Write-Host ""
if ($TestsPassed) {
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "  TEST PASSED" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
} else {
    Write-Host "========================================" -ForegroundColor Red
    Write-Host "  TEST FAILED" -ForegroundColor Red
    Write-Host "========================================" -ForegroundColor Red
    exit 1
}
