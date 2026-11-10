@echo off
REM Everest Connect - WhatsApp link service
REM Double-click to start. Keep this window open (or use pm2, see README.md).

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
    echo.
    echo Node.js is not installed on this computer.
    echo Download and install the LTS version from https://nodejs.org
    echo then double-click this file again.
    echo.
    pause
    exit /b 1
)

if not exist node_modules (
    echo Installing packages, first time only...
    call npm install --omit=dev
    if errorlevel 1 (
        echo npm install failed. Check the internet connection and try again.
        pause
        exit /b 1
    )
)

echo.
echo Starting WhatsApp service on http://127.0.0.1:3005 ...
echo Open Everest Connect in the website and press "Connect my WhatsApp".
echo Do not close this window.
echo.
node index.js
pause
