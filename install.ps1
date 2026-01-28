# TimeTracker + ActivityWatch Installer for Windows
# Uruchom w PowerShell jako Administrator
# Set-ExecutionPolicy Bypass -Scope Process -Force; .\install.ps1

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host "     TimeTracker + ActivityWatch Installer                        " -ForegroundColor Cyan
Write-Host "     Automatyczne logowanie czasu pracy do Tempo/Jira             " -ForegroundColor Cyan
Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host ""

# ═══════════════════════════════════════════════════════════════
# KROK 1: Sprawdzanie wymagań
# ═══════════════════════════════════════════════════════════════
Write-Host "📋 Sprawdzanie wymagań..." -ForegroundColor Yellow
Write-Host ""

$missing = $false

# Node.js
if (Get-Command node -ErrorAction SilentlyContinue) {
    $nodeVersion = (node -v).TrimStart('v').Split('.')[0]
    if ([int]$nodeVersion -ge 18) {
        Write-Host "✅ Node.js v$((node -v))" -ForegroundColor Green
    } else {
        Write-Host "⚠️ Node.js $nodeVersion jest za stary. Wymagana >= 18" -ForegroundColor Yellow
        $missing = $true
    }
} else {
    Write-Host "❌ Brak Node.js. Zainstaluj z: https://nodejs.org/" -ForegroundColor Red
    $missing = $true
}

# pnpm
if (Get-Command pnpm -ErrorAction SilentlyContinue) {
    Write-Host "✅ pnpm $(pnpm -v)" -ForegroundColor Green
} else {
    Write-Host "⚠️ Instaluję pnpm..." -ForegroundColor Yellow
    npm install -g pnpm
    if (Get-Command pnpm -ErrorAction SilentlyContinue) {
        Write-Host "✅ pnpm zainstalowany" -ForegroundColor Green
    } else {
        Write-Host "❌ Nie udało się zainstalować pnpm" -ForegroundColor Red
        $missing = $true
    }
}

# git
if (Get-Command git -ErrorAction SilentlyContinue) {
    Write-Host "✅ git $(git --version)" -ForegroundColor Green
} else {
    Write-Host "❌ Brak git. Zainstaluj z: https://git-scm.com/" -ForegroundColor Red
    $missing = $true
}

if ($missing) {
    Write-Host ""
    Write-Host "❌ Brakuje wymaganych narzędzi. Zainstaluj je i uruchom ponownie." -ForegroundColor Red
    exit 1
}

Write-Host ""

# ═══════════════════════════════════════════════════════════════
# KROK 2: Instalacja ActivityWatch
# ═══════════════════════════════════════════════════════════════
Write-Host "📦 Instalacja ActivityWatch..." -ForegroundColor Yellow
Write-Host ""

$awPath = "$env:LOCALAPPDATA\activitywatch"
$awExe = "$awPath\aw-qt.exe"

if (Test-Path $awExe) {
    Write-Host "✅ ActivityWatch już zainstalowany" -ForegroundColor Green
} else {
    Write-Host "ℹ️ Pobieram ActivityWatch..." -ForegroundColor Blue

    try {
        # Pobierz najnowszą wersję z GitHub
        $releases = Invoke-RestMethod "https://api.github.com/repos/ActivityWatch/activitywatch/releases/latest"
        $asset = $releases.assets | Where-Object { $_.name -like "*windows*" -and $_.name -like "*.zip" } | Select-Object -First 1

        if ($asset) {
            $downloadPath = "$env:TEMP\activitywatch.zip"
            Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $downloadPath

            Write-Host "ℹ️ Rozpakowuję..." -ForegroundColor Blue
            Expand-Archive -Path $downloadPath -DestinationPath $env:LOCALAPPDATA -Force
            Remove-Item $downloadPath

            Write-Host "✅ ActivityWatch zainstalowany" -ForegroundColor Green
        } else {
            Write-Host "⚠️ Nie znaleziono wersji Windows. Pobierz z: https://activitywatch.net/downloads/" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "⚠️ Błąd pobierania. Pobierz ręcznie z: https://activitywatch.net/downloads/" -ForegroundColor Yellow
    }
}

Write-Host ""

# ═══════════════════════════════════════════════════════════════
# KROK 3: Uruchomienie ActivityWatch
# ═══════════════════════════════════════════════════════════════
Write-Host "🚀 Uruchamianie ActivityWatch..." -ForegroundColor Yellow
Write-Host ""

$awProcess = Get-Process | Where-Object { $_.ProcessName -like "*aw-*" }
if (-not $awProcess) {
    if (Test-Path $awExe) {
        Start-Process $awExe -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 3
    }
}

# Sprawdź czy API działa
try {
    $null = Invoke-RestMethod -Uri "http://localhost:5600/api/0/info" -ErrorAction Stop
    Write-Host "✅ ActivityWatch działa na http://localhost:5600" -ForegroundColor Green
} catch {
    Write-Host "⚠️ ActivityWatch może wymagać ręcznego uruchomienia" -ForegroundColor Yellow
}

Write-Host ""

# ═══════════════════════════════════════════════════════════════
# KROK 4: Instalacja TimeTracker
# ═══════════════════════════════════════════════════════════════
Write-Host "📥 Instalacja TimeTracker..." -ForegroundColor Yellow
Write-Host ""

# Sprawdź czy jesteśmy już w folderze projektu
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$webPackageJson = Join-Path $scriptPath "apps\web\package.json"

if (Test-Path $webPackageJson) {
    Set-Location $scriptPath
    Write-Host "ℹ️ Używam istniejącego folderu: $scriptPath" -ForegroundColor Blue
} else {
    if (Test-Path "ai-timetracker") {
        Write-Host "ℹ️ Folder timetracker już istnieje, aktualizuję..." -ForegroundColor Blue
        Set-Location ai-timetracker
        git pull
    } else {
        Write-Host "ℹ️ Klonuję repozytorium..." -ForegroundColor Blue
        git clone https://github.com/shopconnector/ai-timetracker.git
        Set-Location ai-timetracker
    }
}

Write-Host "ℹ️ Instaluję zależności (pnpm install)..." -ForegroundColor Blue
pnpm install

Write-Host "✅ TimeTracker zainstalowany" -ForegroundColor Green
Write-Host ""

# ═══════════════════════════════════════════════════════════════
# KROK 5: Konfiguracja API
# ═══════════════════════════════════════════════════════════════
Write-Host "⚙️ Konfiguracja API..." -ForegroundColor Yellow
Write-Host ""

$envFile = "apps\web\.env.local"

if (Test-Path $envFile) {
    Write-Host "✅ Plik $envFile już istnieje" -ForegroundColor Green
    $overwrite = Read-Host "Czy chcesz go nadpisać? (y/N)"
    if ($overwrite -notmatch "^[Yy]$") {
        Write-Host "Zachowuję istniejącą konfigurację." -ForegroundColor Gray
    } else {
        Remove-Item $envFile
    }
}

if (-not (Test-Path $envFile)) {
    Write-Host ""
    Write-Host "Podaj dane do API (pozostaw puste aby pominąć):" -ForegroundColor White
    Write-Host ""

    $tempoToken = Read-Host "TEMPO_API_TOKEN"
    $jiraUrl = Read-Host "JIRA_BASE_URL (np. https://firma.atlassian.net)"
    $jiraEmail = Read-Host "JIRA_SERVICE_EMAIL"
    $jiraKey = Read-Host "JIRA_API_KEY"
    $openrouterKey = Read-Host "OPENROUTER_API_KEY (opcjonalnie, dla AI)"

    @"
# ActivityWatch
ACTIVITYWATCH_URL=http://localhost:5600

# Tempo API
TEMPO_API_TOKEN=$tempoToken

# Jira API
JIRA_BASE_URL=$jiraUrl
JIRA_SERVICE_EMAIL=$jiraEmail
JIRA_API_KEY=$jiraKey

# OpenRouter (opcjonalnie - dla sugestii AI)
OPENROUTER_API_KEY=$openrouterKey
"@ | Out-File -FilePath $envFile -Encoding UTF8

    Write-Host "✅ Konfiguracja zapisana w $envFile" -ForegroundColor Green
}

Write-Host ""

# ═══════════════════════════════════════════════════════════════
# KROK 6: Podsumowanie i uruchomienie
# ═══════════════════════════════════════════════════════════════
Write-Host ""
Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host "                   🎉 Instalacja zakończona!                      " -ForegroundColor Green
Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  ActivityWatch:  http://localhost:5600" -ForegroundColor White
Write-Host "  TimeTracker:    http://localhost:5666" -ForegroundColor White
Write-Host ""
Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host ""

$runNow = Read-Host "Czy uruchomić TimeTracker teraz? (Y/n)"

if ($runNow -notmatch "^[Nn]$") {
    Write-Host ""
    Write-Host "ℹ️ Uruchamiam TimeTracker..." -ForegroundColor Blue
    Write-Host ""
    pnpm dev
} else {
    Write-Host ""
    Write-Host "ℹ️ Aby uruchomić później:" -ForegroundColor Blue
    Write-Host "  cd ai-timetracker" -ForegroundColor White
    Write-Host "  pnpm dev" -ForegroundColor White
    Write-Host ""
}
