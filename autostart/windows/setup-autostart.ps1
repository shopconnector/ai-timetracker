# TimeTracker + ActivityWatch - Windows Autostart Setup
# Dodaje wpisy do rejestru HKCU\Software\Microsoft\Windows\CurrentVersion\Run
# Uruchom: powershell -ExecutionPolicy Bypass -File setup-autostart.ps1

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "=== TimeTracker + ActivityWatch - Konfiguracja autostartu ===" -ForegroundColor Cyan
Write-Host ""

$regPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"

# --- ActivityWatch ---
Write-Host "Szukam ActivityWatch..." -ForegroundColor Yellow

$awExe = $null
$awSearchPaths = @(
    "$env:LOCALAPPDATA\activitywatch\aw-qt.exe",
    "$env:LOCALAPPDATA\ActivityWatch\aw-qt.exe",
    "$env:ProgramFiles\ActivityWatch\aw-qt.exe",
    "${env:ProgramFiles(x86)}\ActivityWatch\aw-qt.exe",
    "$env:APPDATA\activitywatch\aw-qt.exe"
)

foreach ($path in $awSearchPaths) {
    if (Test-Path $path) {
        $awExe = $path
        break
    }
}

if ($awExe) {
    Set-ItemProperty -Path $regPath -Name "ActivityWatch" -Value "`"$awExe`""
    Write-Host "  ActivityWatch: $awExe" -ForegroundColor Green
} else {
    Write-Host "  ActivityWatch nie znaleziony. Zainstaluj z: https://activitywatch.net/downloads/" -ForegroundColor Yellow
    Write-Host "  Podaj sciezke do aw-qt.exe (lub Enter aby pominac):" -ForegroundColor Yellow
    $customPath = Read-Host "  Sciezka"
    if ($customPath -and (Test-Path $customPath)) {
        $awExe = $customPath
        Set-ItemProperty -Path $regPath -Name "ActivityWatch" -Value "`"$awExe`""
        Write-Host "  ActivityWatch: $awExe" -ForegroundColor Green
    } else {
        Write-Host "  Pomijam ActivityWatch autostart" -ForegroundColor Gray
    }
}

# --- PM2 (TimeTracker) ---
Write-Host ""
Write-Host "Konfiguruję PM2 (TimeTracker)..." -ForegroundColor Yellow

$pm2Path = $null
if (Get-Command pm2 -ErrorAction SilentlyContinue) {
    $pm2Path = (Get-Command pm2).Source
}

if (-not $pm2Path) {
    # Szukaj w znanych lokalizacjach
    $npmPrefix = $null
    if (Get-Command npm -ErrorAction SilentlyContinue) {
        $npmPrefix = (npm config get prefix 2>$null)
    }
    $pm2SearchPaths = @(
        "$npmPrefix\pm2.cmd",
        "$npmPrefix\node_modules\.bin\pm2.cmd",
        "$env:APPDATA\npm\pm2.cmd",
        "$env:ProgramFiles\nodejs\pm2.cmd"
    )
    foreach ($path in $pm2SearchPaths) {
        if ($path -and (Test-Path $path)) {
            $pm2Path = $path
            break
        }
    }
}

if ($pm2Path) {
    # Upewnij sie ze PM2 ma zapisany stan
    Write-Host "  Zapisuję stan PM2 (pm2 save)..." -ForegroundColor Gray
    & pm2 save 2>$null

    $pm2Command = "`"$pm2Path`" resurrect"
    Set-ItemProperty -Path $regPath -Name "PM2-TimeTracker" -Value $pm2Command
    Write-Host "  PM2-TimeTracker: $pm2Path resurrect" -ForegroundColor Green
} else {
    Write-Host "  PM2 nie znaleziony. Zainstaluj: npm install -g pm2" -ForegroundColor Red
}

# --- Podsumowanie ---
Write-Host ""
Write-Host "=== Autostart skonfigurowany ===" -ForegroundColor Green
Write-Host ""
Write-Host "Wpisy w rejestrze ($regPath):" -ForegroundColor White

$entries = Get-ItemProperty -Path $regPath -ErrorAction SilentlyContinue
if ($entries.ActivityWatch) {
    Write-Host "  ActivityWatch: $($entries.ActivityWatch)" -ForegroundColor Gray
}
if ($entries.'PM2-TimeTracker') {
    Write-Host "  PM2-TimeTracker: $($entries.'PM2-TimeTracker')" -ForegroundColor Gray
}

Write-Host ""
Write-Host "Restart komputera uruchomi oba programy automatycznie." -ForegroundColor Cyan
Write-Host ""
