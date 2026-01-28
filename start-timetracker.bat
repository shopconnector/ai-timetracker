@echo off
title AI TimeTracker
color 0A

echo.
echo ========================================
echo    AI TimeTracker - Uruchamianie
echo ========================================
echo.

:: Sprawdz czy ActivityWatch dziala
echo [1/3] Sprawdzanie ActivityWatch...
curl -s http://localhost:5600/api/0/info >nul 2>&1
if %errorlevel% neq 0 (
    echo      ActivityWatch nie dziala. Uruchamiam...
    start "" "%LOCALAPPDATA%\activitywatch\aw-qt.exe" 2>nul
    if %errorlevel% neq 0 (
        start "" "%LOCALAPPDATA%\Programs\activitywatch\aw-qt.exe" 2>nul
    )
    timeout /t 3 /nobreak >nul
) else (
    echo      ActivityWatch dziala OK
)

:: Przejdz do folderu projektu
echo [2/3] Przechodzenie do folderu projektu...
cd /d "%~dp0"

:: Sprawdz czy node_modules istnieje
if not exist "node_modules" (
    echo      Brak node_modules. Instaluje zaleznosci...
    call pnpm install
)

:: Uruchom aplikacje
echo [3/3] Uruchamianie TimeTracker...
echo.
echo ========================================
echo    TimeTracker: http://localhost:3000
echo    ActivityWatch: http://localhost:5600
echo ========================================
echo.
echo Nacisnij Ctrl+C aby zatrzymac.
echo.

:: Otworz przegladarke po 5 sekundach
start "" cmd /c "timeout /t 5 /nobreak >nul && start http://localhost:3000"

:: Uruchom dev server
call pnpm dev
