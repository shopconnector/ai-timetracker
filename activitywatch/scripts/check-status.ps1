# ActivityWatch Status Check - Windows
# Uruchom w PowerShell

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "  ActivityWatch Status Check" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

# 1. Sprawdz API
Write-Host "`n🔍 Sprawdzanie API..." -ForegroundColor Yellow

try {
    $response = Invoke-RestMethod -Uri "http://localhost:5600/api/0/info" -ErrorAction Stop
    Write-Host "✅ ActivityWatch działa (v$($response.version))" -ForegroundColor Green
} catch {
    Write-Host "❌ ActivityWatch API nie odpowiada" -ForegroundColor Red
    Write-Host "   Uruchom ActivityWatch i spróbuj ponownie" -ForegroundColor Yellow
    exit 1
}

# 2. Lista bucketów
Write-Host "`n📦 Dostępne buckety:" -ForegroundColor Yellow

try {
    $buckets = Invoke-RestMethod -Uri "http://localhost:5600/api/0/buckets/"

    foreach ($bucket in $buckets.PSObject.Properties) {
        $name = $bucket.Name
        $data = $bucket.Value
        $type = $data.type
        $last = $data.last_updated

        # Ikona
        $icon = switch -Regex ($type) {
            "window" { "🪟" }
            "web|browser" { "🌐" }
            "afk" { "💤" }
            "editor|vscode|cursor" { "📝" }
            default { "📦" }
        }

        Write-Host "  $icon $name" -ForegroundColor White
        Write-Host "     Type: $type | Last: $last" -ForegroundColor Gray
    }
} catch {
    Write-Host "Błąd pobierania bucketów: $_" -ForegroundColor Red
}

# 3. Procesy
Write-Host "`n🔧 Aktywne procesy ActivityWatch:" -ForegroundColor Yellow
Get-Process | Where-Object { $_.ProcessName -like "*aw-*" -or $_.ProcessName -like "*activitywatch*" } |
    ForEach-Object { Write-Host "  $($_.ProcessName)" -ForegroundColor White }

Write-Host "`n=========================================" -ForegroundColor Cyan
