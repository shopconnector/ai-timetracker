@echo off
title TimeTracker - Stop All
cd /d "%~dp0"

echo.
echo ============================================
echo    TimeTracker - Stopping All Services
echo ============================================
echo.

:: Stop TimeTracker (Node.js server on port 5666)
echo [1/2] Stopping TimeTracker server...
for /f "tokens=5" %%a in ('netstat -ano ^| find ":5666" ^| find "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
    echo       Stopped process PID: %%a
)

:: Alternative: kill all node processes running server.js
tasklist /FI "IMAGENAME eq node.exe" 2>NUL | find /I "node.exe" >NUL
if not errorlevel 1 (
    echo       Checking for remaining Node.js processes...
    :: Only kill node processes in our directory
    wmic process where "name='node.exe' and commandline like '%%server.js%%'" call terminate >nul 2>&1
)

:: Stop ActivityWatch
echo [2/2] Stopping ActivityWatch...
taskkill /F /IM aw-qt.exe >nul 2>&1
taskkill /F /IM aw-server.exe >nul 2>&1
taskkill /F /IM aw-watcher-window.exe >nul 2>&1
taskkill /F /IM aw-watcher-afk.exe >nul 2>&1

echo.
echo ============================================
echo    All services stopped.
echo ============================================
echo.
echo To start again, run: TimeTracker-Start.bat
echo.
pause
