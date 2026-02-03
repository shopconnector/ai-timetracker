@echo off
title TimeTracker - Install Autostart
cd /d "%~dp0"

echo.
echo ============================================
echo    TimeTracker - Install Autostart
echo ============================================
echo.

:: Get the full path to the launcher
set "LAUNCHER_PATH=%~dp0TimeTracker-Start.bat"

:: Check if launcher exists
if not exist "%LAUNCHER_PATH%" (
    echo [ERROR] TimeTracker-Start.bat not found!
    echo         Please run this from the TimeTracker folder.
    pause
    exit /b 1
)

echo This will configure TimeTracker to start automatically
echo when you log in to Windows.
echo.
echo Launcher path: %LAUNCHER_PATH%
echo.

:: Add to Windows Registry (Current User - no admin required)
echo Adding to Windows startup...
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" ^
    /v "TimeTracker" ^
    /t REG_SZ ^
    /d "\"%LAUNCHER_PATH%\"" ^
    /f >nul 2>&1

if errorlevel 1 (
    echo [ERROR] Failed to add autostart entry!
    echo         Please try running as Administrator.
    pause
    exit /b 1
)

echo.
echo ============================================
echo    SUCCESS!
echo ============================================
echo.
echo TimeTracker will now start automatically when you log in.
echo.
echo To remove autostart, run: Uninstall-Autostart.bat
echo.
pause
