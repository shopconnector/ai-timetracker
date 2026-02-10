# TimeTracker + ActivityWatch - Usuwanie autostartu Windows
# Usuwa wpisy z rejestru HKCU\Software\Microsoft\Windows\CurrentVersion\Run

$regPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"

Write-Host ""
Write-Host "=== Usuwanie autostartu TimeTracker + ActivityWatch ===" -ForegroundColor Yellow
Write-Host ""

$removed = 0

if (Get-ItemProperty -Path $regPath -Name "ActivityWatch" -ErrorAction SilentlyContinue) {
    Remove-ItemProperty -Path $regPath -Name "ActivityWatch"
    Write-Host "  Usunięto: ActivityWatch" -ForegroundColor Green
    $removed++
}

if (Get-ItemProperty -Path $regPath -Name "PM2-TimeTracker" -ErrorAction SilentlyContinue) {
    Remove-ItemProperty -Path $regPath -Name "PM2-TimeTracker"
    Write-Host "  Usunięto: PM2-TimeTracker" -ForegroundColor Green
    $removed++
}

# Stary wpis z Inno Setup
if (Get-ItemProperty -Path $regPath -Name "AITimeTracker" -ErrorAction SilentlyContinue) {
    Remove-ItemProperty -Path $regPath -Name "AITimeTracker"
    Write-Host "  Usunięto: AITimeTracker (stary)" -ForegroundColor Green
    $removed++
}

if ($removed -eq 0) {
    Write-Host "  Nie znaleziono wpisów do usunięcia" -ForegroundColor Gray
} else {
    Write-Host ""
    Write-Host "Usunięto $removed wpisów z autostartu." -ForegroundColor Green
}

Write-Host ""
