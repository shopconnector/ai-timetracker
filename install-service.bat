@echo off
chcp 65001 >nul 2>&1
title AI TimeTracker - Instalacja jako usluga
color 0B

echo.
echo ╔════════════════════════════════════════════════════════════╗
echo ║     AI TimeTracker - Instalacja jako usluga w tle          ║
echo ╚════════════════════════════════════════════════════════════╝
echo.
echo Ten skrypt zainstaluje TimeTracker jako usluge dzialajaca w tle.
echo Dzieki temu mozesz zamknac PowerShell a aplikacja bedzie dzialac.
echo.
pause

cd /d "%~dp0"

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
:: KROK 3: Uruchom jako usluge
:: ═══════════════════════════════════════════════════════════════
echo [3/4] Uruchamianie TimeTracker jako uslugi...

call pm2 start "pnpm dev" --name timetracker --cwd "%~dp0"
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
echo ║                     INSTALACJA ZAKONCZONA                  ║
echo ╠════════════════════════════════════════════════════════════╣
echo ║                                                            ║
echo ║   TimeTracker dziala teraz w tle!                          ║
echo ║                                                            ║
echo ║   Otworz w przegladarce: http://localhost:5666             ║
echo ║                                                            ║
echo ║   Zarzadzanie usluga (w PowerShell):                       ║
echo ║   - pm2 status           (sprawdz status)                  ║
echo ║   - pm2 logs timetracker (zobacz logi)                     ║
echo ║   - pm2 restart timetracker (restart)                      ║
echo ║   - pm2 stop timetracker (zatrzymaj)                       ║
echo ║   - pm2 delete timetracker (usun usluge)                   ║
echo ║                                                            ║
echo ╚════════════════════════════════════════════════════════════╝
echo.

:: Otworz przegladarke
start http://localhost:5666

echo Nacisnij dowolny klawisz aby zamknac to okno...
pause >nul
