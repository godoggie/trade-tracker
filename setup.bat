@echo off
echo === NHL Trade Tracker Setup ===
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed. Download it from https://nodejs.org
    pause
    exit /b 1
)

echo Installing dependencies...
npm install --production
echo.

if not exist .env (
    copy .env.example .env
    echo.
    echo Created .env file. Please edit it with your Gmail credentials and recipient emails.
    echo Open .env in a text editor and fill in your values.
    echo.
    echo After editing .env, run start.bat to start the tracker.
) else (
    echo .env already exists.
    echo Run start.bat to start the tracker.
)
echo.
pause
