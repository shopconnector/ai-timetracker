@echo off
chcp 65001 >nul
title AI TimeTracker
color 0A

echo.
echo ╔════════════════════════════════════════════╗
echo ║       AI TimeTracker - Uruchamianie        ║
echo ╚════════════════════════════════════════════╝
echo.

:: Przejdz do folderu skryptu
cd /d "%~dp0"

:: ═══════════════════════════════════════════════════════════════
:: KROK 1: Sprawdz ActivityWatch
:: ═══════════════════════════════════════════════════════════════
echo [1/4] Sprawdzanie ActivityWatch...

curl -s -o nul -w "" http://localhost:5600/api/0/info >nul 2>&1
if %errorlevel% neq 0 (
    echo       ActivityWatch nie dziala. Szukam i uruchamiam...

    :: Szukaj ActivityWatch w roznych lokalizacjach
    if exist "%LOCALAPPDATA%\activitywatch\aw-qt.exe" (
        start "" "%LOCALAPPDATA%\activitywatch\aw-qt.exe"
        echo       Uruchomiono z: %LOCALAPPDATA%\activitywatch
    ) else if exist "%LOCALAPPDATA%\Programs\activitywatch\aw-qt.exe" (
        start "" "%LOCALAPPDATA%\Programs\activitywatch\aw-qt.exe"
        echo       Uruchomiono z: %LOCALAPPDATA%\Programs\activitywatch
    ) else if exist "%ProgramFiles%\activitywatch\aw-qt.exe" (
        start "" "%ProgramFiles%\activitywatch\aw-qt.exe"
        echo       Uruchomiono z: %ProgramFiles%\activitywatch
    ) else (
        echo       UWAGA: Nie znaleziono ActivityWatch!
        echo       Pobierz z: https://activitywatch.net/downloads/
    )

    :: Czekaj az ActivityWatch sie uruchomi
    echo       Czekam na uruchomienie ActivityWatch...
    timeout /t 5 /nobreak >nul
) else (
    echo       OK - ActivityWatch dziala
)

:: ═══════════════════════════════════════════════════════════════
:: KROK 2: Sprawdz zaleznosci
:: ═══════════════════════════════════════════════════════════════
echo [2/4] Sprawdzanie zaleznosci...

if not exist "node_modules" (
    echo       Brak node_modules - instaluje zaleznosci...
    call pnpm install
    if %errorlevel% neq 0 (
        echo       BLAD: Nie udalo sie zainstalowac zaleznosci!
        echo       Upewnij sie ze masz zainstalowane: Node.js i pnpm
        pause
        exit /b 1
    )
) else (
    echo       OK - zaleznosci zainstalowane
)

:: ═══════════════════════════════════════════════════════════════
:: KROK 3: Sprawdz konfiguracje
:: ═══════════════════════════════════════════════════════════════
echo [3/4] Sprawdzanie konfiguracji...

if not exist "apps\web\.env.local" (
    echo       Brak pliku konfiguracyjnego - tworze...
    copy ".env.example" "apps\web\.env.local" >nul
    echo       UWAGA: Otworz apps\web\.env.local i uzupelnij tokeny API!
    notepad "apps\web\.env.local"
    echo       Po zapisaniu pliku nacisnij dowolny klawisz...
    pause >nul
) else (
    echo       OK - konfiguracja istnieje
)

:: ═══════════════════════════════════════════════════════════════
:: KROK 4: Uruchom TimeTracker
:: ═══════════════════════════════════════════════════════════════
echo [4/4] Uruchamianie TimeTracker...
echo.
echo ╔════════════════════════════════════════════╗
echo ║  TimeTracker:    http://localhost:5666     ║
echo ║  ActivityWatch:  http://localhost:5600     ║
echo ╚════════════════════════════════════════════╝
echo.

:: Uruchom przegladarke po 8 sekundach (czas na start serwera)
echo Otwieram przegladarke za 8 sekund...
start "" /min cmd /c "timeout /t 8 /nobreak >nul && start http://localhost:5666"

echo.
echo Serwer uruchomiony. Nacisnij Ctrl+C aby zatrzymac.
echo ─────────────────────────────────────────────
echo.

:: Uruchom dev server
call pnpm dev

:: Jesli serwer sie zatrzymal
echo.
echo TimeTracker zatrzymany.
pause
