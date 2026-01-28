@echo off
chcp 65001 >nul 2>&1
title AI TimeTracker
color 0A

echo.
echo ════════════════════════════════════════════════════════════════
echo              AI TimeTracker - Uruchamianie
echo ════════════════════════════════════════════════════════════════
echo.

:: Przejdz do folderu skryptu
cd /d "%~dp0"

:: ═══════════════════════════════════════════════════════════════
:: KROK 1: Sprawdz czy pnpm jest dostepny
:: ═══════════════════════════════════════════════════════════════
echo [1/6] Sprawdzanie pnpm...

where pnpm >nul 2>&1
if %errorlevel% neq 0 (
    echo.
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
echo [2/6] Sprawdzanie ActivityWatch...
echo.
echo       TimeTracker WYMAGA dzialajacego ActivityWatch!
echo       ActivityWatch zbiera dane o aktywnosci na komputerze.
echo       TimeTracker odczytuje te dane z: http://localhost:5600
echo.

:: Sprawdz czy ActivityWatch API odpowiada
curl -s -o nul -w "" http://localhost:5600/api/0/info >nul 2>&1
if %errorlevel% neq 0 (
    echo       ActivityWatch NIE DZIALA. Szukam...
    echo.

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
        echo       Znaleziono ActivityWatch: %AW_PATH%
        echo       Uruchamiam...
        start "" "%AW_PATH%"
        echo       Czekam 8 sekund na uruchomienie...
        timeout /t 8 /nobreak >nul

        :: Sprawdz ponownie
        curl -s -o nul -w "" http://localhost:5600/api/0/info >nul 2>&1
        if %errorlevel% neq 0 (
            echo.
            echo       UWAGA: ActivityWatch nie odpowiada!
            echo       Sprawdz czy dziala: http://localhost:5600
            echo.
        ) else (
            echo       OK - ActivityWatch uruchomiony i dziala!
        )
    ) else (
        echo.
        echo       ════════════════════════════════════════════════════════
        echo       UWAGA: Nie znaleziono ActivityWatch!
        echo       ════════════════════════════════════════════════════════
        echo.
        echo       TimeTracker NIE BEDZIE DZIALAC bez ActivityWatch!
        echo.
        echo       Pobierz ActivityWatch z: https://activitywatch.net/downloads/
        echo       Po instalacji uruchom ponownie ten skrypt.
        echo.
        echo       Kontynuuje mimo to (ale dane nie beda dostepne)...
        echo.
        timeout /t 5 /nobreak >nul
    )
) else (
    echo       OK - ActivityWatch dziala na http://localhost:5600
)

:: ═══════════════════════════════════════════════════════════════
:: KROK 3: Sprawdz zaleznosci projektu
:: ═══════════════════════════════════════════════════════════════
echo [3/6] Sprawdzanie zaleznosci projektu...

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
echo [4/6] Sprawdzanie konfiguracji...

if not exist "apps\web\.env.local" (
    echo       Brak pliku konfiguracyjnego - tworze...
    copy ".env.example" "apps\web\.env.local" >nul 2>&1

    if exist "apps\web\.env.local" (
        echo.
        echo       ════════════════════════════════════════════════════════
        echo       UWAGA: Musisz skonfigurowac tokeny API!
        echo       ════════════════════════════════════════════════════════
        echo.
        echo       Otwieram plik konfiguracyjny w Notatniku...
        echo.
        echo       WAZNE: Nie zmieniaj linii:
        echo       ACTIVITYWATCH_URL=http://localhost:5600
        echo.
        echo       Ta linia mowi TimeTrackerowi gdzie szukac danych!
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
:: KROK 5: Sprawdz ponownie ActivityWatch
:: ═══════════════════════════════════════════════════════════════
echo [5/6] Finalne sprawdzenie ActivityWatch...

curl -s -o nul -w "" http://localhost:5600/api/0/info >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo       ════════════════════════════════════════════════════════
    echo       OSTRZEZENIE: ActivityWatch nie odpowiada!
    echo       ════════════════════════════════════════════════════════
    echo.
    echo       TimeTracker uruchomi sie, ale bez danych!
    echo       Upewnij sie, ze ActivityWatch dziala: http://localhost:5600
    echo.
) else (
    echo       OK - ActivityWatch gotowy (http://localhost:5600)
)

:: ═══════════════════════════════════════════════════════════════
:: KROK 6: Uruchom TimeTracker
:: ═══════════════════════════════════════════════════════════════
echo [6/6] Uruchamianie TimeTracker...
echo.
echo ════════════════════════════════════════════════════════════════
echo.
echo   TimeTracker:    http://localhost:5666
echo   ActivityWatch:  http://localhost:5600  (zrodlo danych!)
echo.
echo   TimeTracker odczytuje aktywnosci z ActivityWatch.
echo   Jesli ActivityWatch nie dziala, dane beda puste.
echo.
echo   Przegladarka otworzy sie automatycznie za 10 sekund.
echo.
echo   Aby zatrzymac: nacisnij Ctrl+C lub zamknij to okno.
echo.
echo ════════════════════════════════════════════════════════════════
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
