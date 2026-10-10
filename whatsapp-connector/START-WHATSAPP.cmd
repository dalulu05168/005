@echo off
setlocal EnableExtensions
chcp 65001 >nul
title Nuvexa Pro - WhatsApp Device Connector
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo.
  echo Node.js 20 or newer is required. Install from https://nodejs.org/
  echo After installing Node.js, double-click this file again.
  pause
  exit /b 1
)
where npm >nul 2>&1
if errorlevel 1 (
  echo npm is missing from PATH. Reinstall the Node.js LTS version.
  pause
  exit /b 1
)
if not exist "node_modules\whatsapp-web.js" (
  echo Installing the official published npm packages for this local connector...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo Dependency installation failed. Network and disk permissions should be checked.
    pause
    exit /b 1
  )
)
echo.
echo Starting Nuvexa WhatsApp Connector...
echo Keep this window open for continuous WhatsApp session monitoring.
echo.
node connector.mjs
echo.
echo Connector stopped. Any previous sessions remain on this computer.
pause
