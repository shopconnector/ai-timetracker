@echo off
chcp 65001 >nul 2>&1
title AI TimeTracker - Instalacja jako usluga (Standalone)
color 0B

echo.
echo ╔════════════════════════════════════════════════════════════╗
echo ║   AI TimeTracker - Instalacja uslugi (standalone bundle)   ║
echo ╚════════════════════════════════════════════════════════════╝
echo.
echo Ten skrypt zainstaluje TimeTracker jako usluge dzialajaca w tle.
echo Uzywa wbudowanego node.exe ze standalone bundle.
echo.
pause

cd /d "%~dp0"
:: Navigate up to bundle root if run from scripts/windows/
if exist "..\..\node\node.exe" cd /d "%~dp0\..\.."
if exist "node\node.exe" goto :found_bundle

echo BLAD: Nie znaleziono standalone bundle (node\node.exe)!
echo Uruchom ten skrypt z katalogu glownego bundle.
pause
exit /b 1

:found_bundle
set "BUNDLE_DIR=%CD%"
set "NODE_EXE=%BUNDLE_DIR%\node\node.exe"
set "SERVER_JS=%BUNDLE_DIR%\app\apps\web\server.js"

if not exist "%SERVER_JS%" (
    echo BLAD: Nie znaleziono server.js: %SERVER_JS%
    pause
    exit /b 1
)

:: ═══════════════════════════════════════════════════════════════
:: KROK 1: Sprawdz pm2
:: ═══════════════════════════════════════════════════════════════
echo.
echo [1/4] Sprawdzanie pm2...

where pm2 >nul 2>&1
if %errorlevel% neq 0 (
    echo       pm2 nie jest zainstalowany. Instaluje...
    call npm install -g pm2
    if %errorlevel% neq 0 (
        echo       BLAD: Nie udalo sie zainstalowac pm2!
        echo       Sprobuj recznie: npm install -g pm2
        pause
        exit /b 1
    )
)
echo       OK - pm2 zainstalowany

:: ═══════════════════════════════════════════════════════════════
:: KROK 2: Zatrzymaj istniejaca usluge (jesli istnieje)
:: ═══════════════════════════════════════════════════════════════
echo [2/4] Zatrzymywanie poprzedniej uslugi (jesli istnieje)...
call pm2 delete timetracker >nul 2>&1
echo       OK

:: ═══════════════════════════════════════════════════════════════
:: KROK 3: Zaladuj konfiguracje i uruchom usluge
:: ═══════════════════════════════════════════════════════════════
echo [3/4] Uruchamianie TimeTracker jako uslugi...

:: Create logs directory
if not exist "%BUNDLE_DIR%\logs" mkdir "%BUNDLE_DIR%\logs"

:: Load .env.local
if exist "%BUNDLE_DIR%\data\.env.local" (
    for /f "usebackq tokens=1,* delims==" %%a in ("%BUNDLE_DIR%\data\.env.local") do (
        set "line=%%a"
        setlocal enabledelayedexpansion
        if not "!line:~0,1!"=="#" (
            endlocal
            set "%%a=%%b"
        ) else (
            endlocal
        )
    )
)

:: Ensure critical env vars
if not defined ACTIVITYWATCH_URL set "ACTIVITYWATCH_URL=http://localhost:5600"
set NODE_ENV=production
set HOSTNAME=localhost
set PORT=5666

:: Start with pm2 using bundled node.exe
call pm2 start "%SERVER_JS%" --name timetracker --interpreter "%NODE_EXE%" --cwd "%BUNDLE_DIR%" --output "%BUNDLE_DIR%\logs\out.log" --error "%BUNDLE_DIR%\logs\error.log"
if %errorlevel% neq 0 (
    echo       BLAD: Nie udalo sie uruchomic uslugi!
    pause
    exit /b 1
)
echo       OK - usluga uruchomiona

:: ═══════════════════════════════════════════════════════════════
:: KROK 4: Zapisz konfiguracje
:: ═══════════════════════════════════════════════════════════════
echo [4/4] Zapisywanie konfiguracji...
call pm2 save
echo       OK - konfiguracja zapisana

:: ═══════════════════════════════════════════════════════════════
:: GOTOWE
:: ═══════════════════════════════════════════════════════════════
echo.
echo ╔════════════════════════════════════════════════════════════╗
echo ║                   INSTALACJA ZAKONCZONA                    ║
echo ╠════════════════════════════════════════════════════════════╣
echo ║                                                            ║
echo ║   TimeTracker dziala teraz w tle!                          ║
echo ║                                                            ║
echo ║   Otworz: http://localhost:5666/timetracker                ║
echo ║                                                            ║
echo ║   Logi:   logs\out.log, logs\error.log                    ║
echo ║                                                            ║
echo ║   Zarzadzanie (w cmd/PowerShell):                          ║
echo ║   - pm2 status           (sprawdz status)                  ║
echo ║   - pm2 logs timetracker (zobacz logi)                     ║
echo ║   - pm2 restart timetracker (restart)                      ║
echo ║   - pm2 stop timetracker (zatrzymaj)                       ║
echo ║   - pm2 delete timetracker (usun usluge)                   ║
echo ║                                                            ║
echo ╚════════════════════════════════════════════════════════════╝
echo.

:: Otworz przegladarke
start http://localhost:5666/timetracker

echo Nacisnij dowolny klawisz aby zamknac to okno...
pause >nul
