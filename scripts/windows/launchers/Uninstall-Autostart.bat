@echo off
title TimeTracker - Remove Autostart
cd /d "%~dp0"

echo.
echo ============================================
echo    TimeTracker - Remove Autostart
echo ============================================
echo.

:: Check if autostart entry exists
reg query "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "TimeTracker" >nul 2>&1
if errorlevel 1 (
    echo TimeTracker autostart is not currently configured.
    echo Nothing to remove.
    echo.
    pause
    exit /b 0
)

echo Removing TimeTracker from Windows startup...

:: Remove from Windows Registry
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" ^
    /v "TimeTracker" /f >nul 2>&1

if errorlevel 1 (
    echo [ERROR] Failed to remove autostart entry!
    pause
    exit /b 1
)

echo.
echo ============================================
echo    SUCCESS!
echo ============================================
echo.
echo TimeTracker will no longer start automatically.
echo.
echo To re-enable autostart, run: Install-Autostart.bat
echo.
pause
