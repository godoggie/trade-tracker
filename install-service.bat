@echo off
echo === Install NHL Trade Tracker as a Windows Service ===
echo This will install the tracker to run automatically in the background.
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed.
    pause
    exit /b 1
)

if not exist node_modules (
    echo Installing dependencies...
    npm install --production
)

echo Installing node-windows...
npm install node-windows

echo Creating Windows service...
node service-install.js

echo.
echo Service installed! It will start automatically and survive reboots.
echo To remove it later, run uninstall-service.bat
pause
