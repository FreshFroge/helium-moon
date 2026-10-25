@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js LTS from https://nodejs.org/ and try again.
  pause
  exit /b 1
)
echo Starting Helium Moon. Keep this window open while playing.
echo Open the address printed below in your browser.
node server/server.js %*
if errorlevel 1 pause
