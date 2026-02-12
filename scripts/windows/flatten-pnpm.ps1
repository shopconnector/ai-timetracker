# Flatten pnpm node_modules structure for Windows MAX_PATH compatibility
# Replaces .pnpm symlink-based structure with flat npm-style node_modules
# This prevents Windows installer failures caused by paths exceeding 260 chars
#
# Usage: .\scripts\windows\flatten-pnpm.ps1 -AppDir "dist\windows\app"

param(
    [Parameter(Mandatory=$true)]
    [string]$AppDir
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "  Flattening pnpm node_modules (MAX_PATH fix)..." -ForegroundColor Yellow
Write-Host "  App directory: $AppDir" -ForegroundColor Gray
Write-Host ""

# Find all node_modules directories that contain .pnpm
$nodeModulesDirs = @()
Get-ChildItem -Path $AppDir -Directory -Recurse -Filter "node_modules" -ErrorAction SilentlyContinue | ForEach-Object {
    $pnpmPath = Join-Path $_.FullName ".pnpm"
    if (Test-Path $pnpmPath) {
        $nodeModulesDirs += $_.FullName
    }
}

if ($nodeModulesDirs.Count -eq 0) {
    Write-Host "  No .pnpm directories found - nothing to flatten" -ForegroundColor Gray
    return
}

Write-Host "  Found $($nodeModulesDirs.Count) node_modules with .pnpm:" -ForegroundColor Gray
foreach ($dir in $nodeModulesDirs) {
    Write-Host "    - $dir" -ForegroundColor Gray
}

foreach ($nodeModulesPath in $nodeModulesDirs) {
    $pnpmDir = Join-Path $nodeModulesPath ".pnpm"

    Write-Host ""
    Write-Host "  Processing: $nodeModulesPath" -ForegroundColor Cyan

    # Step 1: Collect all packages from .pnpm/*/node_modules/
    $packagesCopied = 0

    Get-ChildItem $pnpmDir -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -ne "node_modules" } | ForEach-Object {
        $pnpmEntry = $_
        $innerNodeModules = Join-Path $pnpmEntry.FullName "node_modules"

        if (Test-Path $innerNodeModules) {
            # Process non-scoped packages
            Get-ChildItem $innerNodeModules -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -notlike "@*" } | ForEach-Object {
                $pkgName = $_.Name
                $targetPath = Join-Path $nodeModulesPath $pkgName

                # Only copy if target doesn't already exist as a real directory
                $isRealDir = (Test-Path $targetPath) -and -not ((Get-Item $targetPath -Force).Attributes -band [System.IO.FileAttributes]::ReparsePoint)

                if (-not $isRealDir) {
                    # Remove symlink/junction if exists
                    if (Test-Path $targetPath) {
                        Remove-Item $targetPath -Force -ErrorAction SilentlyContinue
                    }
                    Copy-Item -Recurse -Force $_.FullName $targetPath
                    $packagesCopied++
                }
            }

            # Process scoped packages (@scope/pkg)
            Get-ChildItem $innerNodeModules -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -like "@*" } | ForEach-Object {
                $scopeDir = $_
                $scopeTargetPath = Join-Path $nodeModulesPath $scopeDir.Name

                if (-not (Test-Path $scopeTargetPath)) {
                    New-Item -ItemType Directory -Path $scopeTargetPath -Force | Out-Null
                }

                Get-ChildItem $scopeDir.FullName -Directory -ErrorAction SilentlyContinue | ForEach-Object {
                    $pkgPath = Join-Path $scopeTargetPath $_.Name
                    $isRealDir = (Test-Path $pkgPath) -and -not ((Get-Item $pkgPath -Force).Attributes -band [System.IO.FileAttributes]::ReparsePoint)

                    if (-not $isRealDir) {
                        if (Test-Path $pkgPath) {
                            Remove-Item $pkgPath -Force -ErrorAction SilentlyContinue
                        }
                        Copy-Item -Recurse -Force $_.FullName $pkgPath
                        $packagesCopied++
                    }
                }
            }
        }
    }

    Write-Host "    Copied $packagesCopied packages to flat layout" -ForegroundColor Green

    # Step 2: Remove all symlinks/junctions in node_modules (they pointed to .pnpm)
    $symlinksRemoved = 0
    Get-ChildItem $nodeModulesPath -Force -ErrorAction SilentlyContinue | Where-Object {
        ($_.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -and ($_.Name -ne ".pnpm")
    } | ForEach-Object {
        Remove-Item $_.FullName -Force
        $symlinksRemoved++
    }

    # Also check scoped directories for symlinks
    Get-ChildItem $nodeModulesPath -Directory -Force -ErrorAction SilentlyContinue | Where-Object { $_.Name -like "@*" } | ForEach-Object {
        Get-ChildItem $_.FullName -Force -ErrorAction SilentlyContinue | Where-Object {
            $_.Attributes -band [System.IO.FileAttributes]::ReparsePoint
        } | ForEach-Object {
            Remove-Item $_.FullName -Force
            $symlinksRemoved++
        }
    }

    Write-Host "    Removed $symlinksRemoved symlinks/junctions" -ForegroundColor Green

    # Step 3: Remove .pnpm directory
    Remove-Item -Recurse -Force $pnpmDir
    Write-Host "    Removed .pnpm directory" -ForegroundColor Green
}

# Step 4: Remove ALL nested node_modules directories (except the root one we just flattened)
# On Windows, Copy-Item resolves junctions to real copies, so packages like 'next'
# end up as real directories in apps/web/node_modules/. If Node.js finds 'next' there
# first, it can't resolve next's dependencies (styled-jsx, react, etc.) which are only
# in the root node_modules. Removing nested node_modules forces Node.js to use the
# flat root node_modules where ALL packages are available.
$rootNodeModules = $nodeModulesDirs[0]  # The first (highest-level) node_modules we flattened
Write-Host ""
Write-Host "  Root node_modules (keeping): $rootNodeModules" -ForegroundColor Gray
Get-ChildItem -Path $AppDir -Directory -Recurse -Filter "node_modules" -ErrorAction SilentlyContinue | Where-Object {
    $_.FullName -ne $rootNodeModules
} | ForEach-Object {
    Remove-Item $_.FullName -Recurse -Force
    Write-Host "    Removed nested: $($_.FullName)" -ForegroundColor Green
}

# Step 5: Verify max path length
Write-Host ""
Write-Host "  Verifying path lengths..." -ForegroundColor Yellow

$maxPath = 0
$maxFile = ""
$totalFiles = 0
# Simulate Windows install base path
$winBase = "C:\Users\LongUsername\AppData\Local\TimeTracker\app\"
$appDirNormalized = $AppDir.Replace("\", "/").TrimEnd("/")

Get-ChildItem -Path $AppDir -Recurse -File -ErrorAction SilentlyContinue | ForEach-Object {
    $totalFiles++
    $relativePath = $_.FullName.Replace("\", "/").Replace("$appDirNormalized/", "").Replace("/", "\")
    $simulatedWinPath = $winBase + $relativePath

    if ($simulatedWinPath.Length -gt $maxPath) {
        $maxPath = $simulatedWinPath.Length
        $maxFile = $simulatedWinPath
    }
}

Write-Host ""
Write-Host "  ====== Flatten Summary ======" -ForegroundColor Cyan
Write-Host "  Total files: $totalFiles" -ForegroundColor Gray
Write-Host "  Max Windows path length: $maxPath chars" -ForegroundColor $(if ($maxPath -lt 260) { "Green" } else { "Red" })
Write-Host "  Longest path: $maxFile" -ForegroundColor Gray

if ($maxPath -ge 260) {
    Write-Host ""
    Write-Host "  WARNING: Some paths still exceed 260 chars!" -ForegroundColor Red
    exit 1
} else {
    Write-Host "  OK - All paths within MAX_PATH limit" -ForegroundColor Green
}

Write-Host ""
