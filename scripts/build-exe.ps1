# build-exe.ps1
# Buduje pojedynczy plik TimeTracker.exe używając pkg
#
# Wymagania:
#   - Node.js 20+
#   - pnpm
#
# Użycie:
#   .\scripts\build-exe.ps1

param(
    [string]$NodeVersion = "20.11.1",
    [switch]$SkipBuild,
    [switch]$SkipNodeDownload
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$ROOT_DIR = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$WEB_DIR = Join-Path $ROOT_DIR "apps/web"
$STANDALONE_DIR = Join-Path $WEB_DIR ".next/standalone"
$LAUNCHER_DIR = Join-Path $ROOT_DIR "pkg-launcher"
$ASSETS_DIR = Join-Path $LAUNCHER_DIR "assets"
$DIST_DIR = Join-Path $ROOT_DIR "dist"
$TEMP_DIR = Join-Path $ROOT_DIR "temp-bundle"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  AI TimeTracker - Build EXE" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# ========================================
# Krok 1: Build Next.js
# ========================================
if (-not $SkipBuild) {
    Write-Host "[1/6] Budowanie Next.js..." -ForegroundColor Yellow

    Push-Location $ROOT_DIR
    try {
        Write-Host "  -> pnpm install"
        pnpm install --frozen-lockfile 2>&1 | Out-Null

        Write-Host "  -> pnpm build"
        pnpm build 2>&1 | Out-Null

        if (-not (Test-Path $STANDALONE_DIR)) {
            throw "Standalone output nie został wygenerowany!"
        }
        Write-Host "  OK" -ForegroundColor Green
    }
    finally {
        Pop-Location
    }
}
else {
    Write-Host "[1/6] Pomijam build (--SkipBuild)" -ForegroundColor Gray
}

# ========================================
# Krok 2: Przygotuj temp folder
# ========================================
Write-Host "[2/6] Przygotowanie bundle..." -ForegroundColor Yellow

if (Test-Path $TEMP_DIR) {
    Remove-Item -Recurse -Force $TEMP_DIR
}
New-Item -ItemType Directory -Path $TEMP_DIR -Force | Out-Null

# Kopiuj standalone
Write-Host "  -> Kopiowanie standalone..."
Copy-Item -Recurse "$STANDALONE_DIR\*" $TEMP_DIR

# Kopiuj public
$PUBLIC_DIR = Join-Path $WEB_DIR "public"
if (Test-Path $PUBLIC_DIR) {
    $destPublic = Join-Path $TEMP_DIR "apps\web\public"
    New-Item -ItemType Directory -Path $destPublic -Force | Out-Null
    Copy-Item -Recurse "$PUBLIC_DIR\*" $destPublic
}

# Kopiuj static
$STATIC_SRC = Join-Path $WEB_DIR ".next\static"
if (Test-Path $STATIC_SRC) {
    $destStatic = Join-Path $TEMP_DIR "apps\web\.next\static"
    New-Item -ItemType Directory -Path (Split-Path $destStatic) -Force | Out-Null
    Copy-Item -Recurse $STATIC_SRC $destStatic
}

# Kopiuj .env.example
$envExample = Join-Path $ROOT_DIR ".env.example"
if (Test-Path $envExample) {
    Copy-Item $envExample (Join-Path $TEMP_DIR "apps\web\.env.example")
}

Write-Host "  OK" -ForegroundColor Green

# ========================================
# Krok 3: Pobierz Node.js portable
# ========================================
if (-not $SkipNodeDownload) {
    Write-Host "[3/6] Pobieranie Node.js $NodeVersion..." -ForegroundColor Yellow

    $nodeZipUrl = "https://nodejs.org/dist/v$NodeVersion/node-v$NodeVersion-win-x64.zip"
    $nodeZipPath = Join-Path $env:TEMP "node-portable.zip"
    $nodeExtractPath = Join-Path $env:TEMP "node-portable"

    Write-Host "  -> Pobieranie..."
    Invoke-WebRequest -Uri $nodeZipUrl -OutFile $nodeZipPath

    Write-Host "  -> Rozpakowywanie..."
    if (Test-Path $nodeExtractPath) {
        Remove-Item -Recurse -Force $nodeExtractPath
    }
    Expand-Archive -Path $nodeZipPath -DestinationPath $nodeExtractPath

    # Kopiuj node.exe do bundle
    $nodeExe = Get-ChildItem -Path $nodeExtractPath -Recurse -Filter "node.exe" | Select-Object -First 1
    if ($nodeExe) {
        Copy-Item $nodeExe.FullName (Join-Path $TEMP_DIR "node.exe")
        Write-Host "  OK - node.exe dodany" -ForegroundColor Green
    }
    else {
        throw "Nie znaleziono node.exe"
    }

    # Cleanup
    Remove-Item -Force $nodeZipPath -ErrorAction SilentlyContinue
    Remove-Item -Recurse -Force $nodeExtractPath -ErrorAction SilentlyContinue
}
else {
    Write-Host "[3/6] Pomijam pobieranie Node.js (--SkipNodeDownload)" -ForegroundColor Gray
}

# ========================================
# Krok 4: Utwórz app.zip
# ========================================
Write-Host "[4/6] Tworzenie app.zip..." -ForegroundColor Yellow

if (-not (Test-Path $ASSETS_DIR)) {
    New-Item -ItemType Directory -Path $ASSETS_DIR -Force | Out-Null
}

$appZipPath = Join-Path $ASSETS_DIR "app.zip"
if (Test-Path $appZipPath) {
    Remove-Item -Force $appZipPath
}

Compress-Archive -Path "$TEMP_DIR\*" -DestinationPath $appZipPath -CompressionLevel Optimal
$zipSize = [math]::Round((Get-Item $appZipPath).Length / 1MB, 2)
Write-Host "  OK - app.zip ($zipSize MB)" -ForegroundColor Green

# Cleanup temp
Remove-Item -Recurse -Force $TEMP_DIR

# ========================================
# Krok 5: Kompiluj launcher z pkg
# ========================================
Write-Host "[5/6] Kompilowanie TimeTracker.exe..." -ForegroundColor Yellow

if (-not (Test-Path $DIST_DIR)) {
    New-Item -ItemType Directory -Path $DIST_DIR -Force | Out-Null
}

Push-Location $LAUNCHER_DIR
try {
    # Zainstaluj pkg jeśli nie ma
    Write-Host "  -> npm install"
    npm install 2>&1 | Out-Null

    # Kompiluj
    Write-Host "  -> pkg build"
    npx @yao-pkg/pkg . --target node20-win-x64 --output "$DIST_DIR\TimeTracker.exe" 2>&1

    if (Test-Path "$DIST_DIR\TimeTracker.exe") {
        $exeSize = [math]::Round((Get-Item "$DIST_DIR\TimeTracker.exe").Length / 1MB, 2)
        Write-Host "  OK - TimeTracker.exe ($exeSize MB)" -ForegroundColor Green
    }
    else {
        throw "Nie utworzono TimeTracker.exe"
    }
}
finally {
    Pop-Location
}

# ========================================
# Krok 6: Podsumowanie
# ========================================
Write-Host "[6/6] Gotowe!" -ForegroundColor Yellow
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Build zakończony pomyślnie!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Output: $DIST_DIR\TimeTracker.exe" -ForegroundColor White
Write-Host ""

# Lista plików
Write-Host "  Pliki:" -ForegroundColor White
Get-ChildItem $DIST_DIR | ForEach-Object {
    $size = [math]::Round($_.Length / 1MB, 2)
    Write-Host "    - $($_.Name) ($size MB)" -ForegroundColor Gray
}
Write-Host ""
