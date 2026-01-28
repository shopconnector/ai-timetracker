@echo off
chcp 65001 >nul 2>&1
title AI TimeTracker
color 0A

echo.
echo ╔════════════════════════════════════════════════════════════╗
echo ║              AI TimeTracker - Uruchamianie                 ║
echo ╚════════════════════════════════════════════════════════════╝
echo.

:: Przejdz do folderu skryptu (wazne dla autostartu!)
cd /d "%~dp0"

:: ═══════════════════════════════════════════════════════════════
:: KROK 1: Sprawdz czy pnpm jest dostepny
:: ═══════════════════════════════════════════════════════════════
echo [1/5] Sprawdzanie pnpm...

where pnpm >nul 2>&1
if %errorlevel% neq 0 (
    echo       BLAD: pnpm nie jest zainstalowany!
    echo.
    echo       Zainstaluj pnpm:
    echo       1. Otworz PowerShell
    echo       2. Wpisz: iwr https://get.pnpm.io/install.ps1 -useb ^| iex
    echo       3. Zamknij i otworz ponownie PowerShell
    echo.
    pause
    exit /b 1
)
echo       OK - pnpm znaleziony

:: ═══════════════════════════════════════════════════════════════
:: KROK 2: Sprawdz ActivityWatch
:: ═══════════════════════════════════════════════════════════════
echo [2/5] Sprawdzanie ActivityWatch...

:: Sprawdz czy ActivityWatch API odpowiada
curl -s -o nul -w "" http://localhost:5600/api/0/info >nul 2>&1
if %errorlevel% neq 0 (
    echo       ActivityWatch nie dziala. Szukam...

    :: Lista mozliwych lokalizacji ActivityWatch
    set "AW_FOUND="

    if exist "%LOCALAPPDATA%\activitywatch\aw-qt.exe" (
        set "AW_PATH=%LOCALAPPDATA%\activitywatch\aw-qt.exe"
        set "AW_FOUND=1"
    )
    if exist "%LOCALAPPDATA%\Programs\activitywatch\aw-qt.exe" (
        set "AW_PATH=%LOCALAPPDATA%\Programs\activitywatch\aw-qt.exe"
        set "AW_FOUND=1"
    )
    if exist "%ProgramFiles%\ActivityWatch\aw-qt.exe" (
        set "AW_PATH=%ProgramFiles%\ActivityWatch\aw-qt.exe"
        set "AW_FOUND=1"
    )
    if exist "%ProgramFiles(x86)%\ActivityWatch\aw-qt.exe" (
        set "AW_PATH=%ProgramFiles(x86)%\ActivityWatch\aw-qt.exe"
        set "AW_FOUND=1"
    )

    if defined AW_FOUND (
        echo       Uruchamiam ActivityWatch...
        start "" "%AW_PATH%"
        echo       Czekam 5 sekund na uruchomienie...
        timeout /t 5 /nobreak >nul
    ) else (
        echo.
        echo       UWAGA: Nie znaleziono ActivityWatch!
        echo       Pobierz z: https://activitywatch.net/downloads/
        echo       Kontynuuje bez ActivityWatch...
        echo.
        timeout /t 3 /nobreak >nul
    )
) else (
    echo       OK - ActivityWatch dziala
)

:: ═══════════════════════════════════════════════════════════════
:: KROK 3: Sprawdz zaleznosci projektu
:: ═══════════════════════════════════════════════════════════════
echo [3/5] Sprawdzanie zaleznosci projektu...

if not exist "node_modules" (
    echo       Brak node_modules - instaluje zaleznosci...
    echo       To moze potrwac kilka minut...
    call pnpm install
    if %errorlevel% neq 0 (
        echo       BLAD: Nie udalo sie zainstalowac zaleznosci!
        pause
        exit /b 1
    )
    echo       OK - zaleznosci zainstalowane
) else (
    echo       OK - zaleznosci istnieja
)

:: ═══════════════════════════════════════════════════════════════
:: KROK 4: Sprawdz plik konfiguracyjny
:: ═══════════════════════════════════════════════════════════════
echo [4/5] Sprawdzanie konfiguracji...

if not exist "apps\web\.env.local" (
    echo       Brak pliku konfiguracyjnego - tworze...
    copy ".env.example" "apps\web\.env.local" >nul 2>&1

    if exist "apps\web\.env.local" (
        echo.
        echo       ╔════════════════════════════════════════════════════════╗
        echo       ║  UWAGA: Musisz skonfigurowac tokeny API!               ║
        echo       ║  Otwieram plik konfiguracyjny w Notatniku...           ║
        echo       ║  Uzupelnij dane i zapisz plik (Ctrl+S)                 ║
        echo       ╚════════════════════════════════════════════════════════╝
        echo.
        notepad "apps\web\.env.local"
        echo       Po zapisaniu pliku nacisnij dowolny klawisz...
        pause >nul
    ) else (
        echo       BLAD: Nie mozna utworzyc pliku konfiguracyjnego!
    )
) else (
    echo       OK - konfiguracja istnieje
)

:: ═══════════════════════════════════════════════════════════════
:: KROK 5: Uruchom TimeTracker
:: ═══════════════════════════════════════════════════════════════
echo [5/5] Uruchamianie TimeTracker...
echo.
echo ╔════════════════════════════════════════════════════════════╗
echo ║                                                            ║
echo ║   TimeTracker:    http://localhost:5666                    ║
echo ║   ActivityWatch:  http://localhost:5600                    ║
echo ║                                                            ║
echo ║   Przegladarka otworzy sie automatycznie za 10 sekund.     ║
echo ║                                                            ║
echo ║   Aby zatrzymac: nacisnij Ctrl+C lub zamknij to okno.      ║
echo ║                                                            ║
echo ╚════════════════════════════════════════════════════════════╝
echo.

:: Uruchom przegladarke w tle po 10 sekundach
start "" /min cmd /c "timeout /t 10 /nobreak >nul && start http://localhost:5666"

:: Uruchom serwer deweloperski
echo Uruchamiam serwer...
echo ────────────────────────────────────────────────────────────────
echo.
call pnpm dev

:: Jesli serwer sie zatrzymal
echo.
echo ════════════════════════════════════════════════════════════════
echo TimeTracker zostal zatrzymany.
echo ════════════════════════════════════════════════════════════════
pause
