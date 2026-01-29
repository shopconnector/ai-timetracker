@echo off
chcp 65001 >nul 2>&1
title AI TimeTracker
color 0A

:: Przejdz do folderu instalacji
cd /d "%~dp0"

echo.
echo ========================================
echo        AI TimeTracker
echo ========================================
echo.

:: ========================================
:: Sprawdz ActivityWatch
:: ========================================
echo [1/3] Sprawdzanie ActivityWatch...

curl -s -o nul -w "" http://localhost:5600/api/0/info >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo   UWAGA: ActivityWatch nie dziala!
    echo.
    echo   TimeTracker wymaga ActivityWatch do zbierania danych.
    echo   Pobierz z: https://activitywatch.net/downloads/
    echo.
    echo   Po instalacji uruchom ActivityWatch i sprobuj ponownie.
    echo.

    choice /C TN /M "Czy kontynuowac mimo to? (T=Tak, N=Nie)"
    if errorlevel 2 exit /b 1
    echo.
) else (
    echo   OK - ActivityWatch dziala
)

:: ========================================
:: Sprawdz czy port 5666 jest wolny
:: ========================================
echo [2/3] Sprawdzanie portu 5666...

netstat -ano | findstr ":5666 " | findstr "LISTENING" >nul 2>&1
if %errorlevel% equ 0 (
    echo   Port 5666 jest juz zajety.
    echo   TimeTracker moze juz dzialac.
    echo.
    echo   Otwieram przegladarke...
    start "" "http://localhost:5666/timetracker"
    exit /b 0
)
echo   OK - port 5666 wolny

:: ========================================
:: Uruchom serwer
:: ========================================
echo [3/3] Uruchamianie serwera...
echo.
echo   TimeTracker:   http://localhost:5666/timetracker
echo   ActivityWatch: http://localhost:5600
echo.
echo   Zamknij to okno aby zatrzymac serwer.
echo.
echo ========================================
echo.

:: Uruchom przegladarke po 3 sekundach
start "" /min cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:5666/timetracker"

:: Uruchom Node.js z serverem
"%~dp0node.exe" "%~dp0server.js"

echo.
echo TimeTracker zatrzymany.
pause
