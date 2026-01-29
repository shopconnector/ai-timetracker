# build-windows.ps1
# Skrypt budujacy paczke Windows dla AI TimeTracker
#
# Uzycie:
#   .\scripts\build-windows.ps1
#
# Wymagania:
#   - Node.js 20+
#   - pnpm
#   - curl (do pobrania Node.js portable)

param(
    [string]$NodeVersion = "20.11.1",
    [string]$OutputDir = "dist/windows",
    [switch]$SkipBuild,
    [switch]$SkipNodeDownload
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$ROOT_DIR = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$WEB_DIR = Join-Path $ROOT_DIR "apps/web"
$STANDALONE_DIR = Join-Path $WEB_DIR ".next/standalone"
$OUTPUT_DIR = Join-Path $ROOT_DIR $OutputDir

Write-Host ""
Write-Host "========================================"  -ForegroundColor Cyan
Write-Host "  AI TimeTracker - Windows Build"         -ForegroundColor Cyan
Write-Host "========================================"  -ForegroundColor Cyan
Write-Host ""

# ========================================
# Krok 1: Build Next.js
# ========================================
if (-not $SkipBuild) {
    Write-Host "[1/5] Budowanie aplikacji Next.js..." -ForegroundColor Yellow

    Push-Location $ROOT_DIR
    try {
        # Instalacja zaleznosci
        Write-Host "  -> pnpm install"
        pnpm install --frozen-lockfile

        # Build
        Write-Host "  -> pnpm build"
        pnpm build

        if (-not (Test-Path $STANDALONE_DIR)) {
            throw "Standalone output nie zostal wygenerowany!"
        }
        Write-Host "  OK" -ForegroundColor Green
    } finally {
        Pop-Location
    }
} else {
    Write-Host "[1/5] Pomijam build (--SkipBuild)" -ForegroundColor Gray
}

# ========================================
# Krok 2: Przygotuj folder output
# ========================================
Write-Host "[2/5] Przygotowanie folderu wyjsciowego..." -ForegroundColor Yellow

if (Test-Path $OUTPUT_DIR) {
    Remove-Item -Recurse -Force $OUTPUT_DIR
}
New-Item -ItemType Directory -Path $OUTPUT_DIR -Force | Out-Null
Write-Host "  OK - $OUTPUT_DIR" -ForegroundColor Green

# ========================================
# Krok 3: Kopiuj standalone build
# ========================================
Write-Host "[3/5] Kopiowanie standalone build..." -ForegroundColor Yellow

# Kopiuj standalone
Copy-Item -Recurse "$STANDALONE_DIR/*" $OUTPUT_DIR

# Kopiuj public (jesli istnieje)
$PUBLIC_DIR = Join-Path $WEB_DIR "public"
if (Test-Path $PUBLIC_DIR) {
    Copy-Item -Recurse $PUBLIC_DIR "$OUTPUT_DIR/public"
}

# Kopiuj static assets
$STATIC_SRC = Join-Path $WEB_DIR ".next/static"
$STATIC_DST = Join-Path $OUTPUT_DIR ".next/static"
if (Test-Path $STATIC_SRC) {
    New-Item -ItemType Directory -Path (Split-Path $STATIC_DST) -Force | Out-Null
    Copy-Item -Recurse $STATIC_SRC $STATIC_DST
}

Write-Host "  OK" -ForegroundColor Green

# ========================================
# Krok 4: Pobierz Node.js portable
# ========================================
if (-not $SkipNodeDownload) {
    Write-Host "[4/5] Pobieranie Node.js $NodeVersion portable..." -ForegroundColor Yellow

    $nodeZipUrl = "https://nodejs.org/dist/v$NodeVersion/node-v$NodeVersion-win-x64.zip"
    $nodeZipPath = Join-Path $env:TEMP "node-portable.zip"
    $nodeExtractPath = Join-Path $env:TEMP "node-portable"

    Write-Host "  -> Pobieranie z $nodeZipUrl"
    Invoke-WebRequest -Uri $nodeZipUrl -OutFile $nodeZipPath

    Write-Host "  -> Rozpakowywanie"
    if (Test-Path $nodeExtractPath) {
        Remove-Item -Recurse -Force $nodeExtractPath
    }
    Expand-Archive -Path $nodeZipPath -DestinationPath $nodeExtractPath

    # Kopiuj node.exe
    $nodeExe = Get-ChildItem -Path $nodeExtractPath -Recurse -Filter "node.exe" | Select-Object -First 1
    if ($nodeExe) {
        Copy-Item $nodeExe.FullName "$OUTPUT_DIR/node.exe"
        Write-Host "  OK - node.exe skopiowany" -ForegroundColor Green
    } else {
        throw "Nie znaleziono node.exe w pobranym archiwum"
    }

    # Cleanup
    Remove-Item -Force $nodeZipPath
    Remove-Item -Recurse -Force $nodeExtractPath
} else {
    Write-Host "[4/5] Pomijam pobieranie Node.js (--SkipNodeDownload)" -ForegroundColor Gray
}

# ========================================
# Krok 5: Kopiuj launcher
# ========================================
Write-Host "[5/5] Kopiowanie launchera..." -ForegroundColor Yellow

$LAUNCHER_DIR = Join-Path $ROOT_DIR "launcher"
Copy-Item "$LAUNCHER_DIR/start.bat" $OUTPUT_DIR
Copy-Item "$LAUNCHER_DIR/start-hidden.vbs" $OUTPUT_DIR

# Kopiuj przykladowy .env
$envExample = Join-Path $ROOT_DIR ".env.example"
if (Test-Path $envExample) {
    Copy-Item $envExample "$OUTPUT_DIR/.env.example"
}

Write-Host "  OK" -ForegroundColor Green

# ========================================
# Podsumowanie
# ========================================
Write-Host ""
Write-Host "========================================"  -ForegroundColor Green
Write-Host "  Build zakonczony!"                       -ForegroundColor Green
Write-Host "========================================"  -ForegroundColor Green
Write-Host ""
Write-Host "  Output: $OUTPUT_DIR" -ForegroundColor White
Write-Host ""

# Pokaz rozmiar
$size = (Get-ChildItem -Recurse $OUTPUT_DIR | Measure-Object -Property Length -Sum).Sum / 1MB
Write-Host "  Rozmiar: $([math]::Round($size, 2)) MB" -ForegroundColor White
Write-Host ""

# Lista plikow
Write-Host "  Pliki:" -ForegroundColor White
Get-ChildItem $OUTPUT_DIR | ForEach-Object {
    Write-Host "    - $($_.Name)" -ForegroundColor Gray
}
Write-Host ""
