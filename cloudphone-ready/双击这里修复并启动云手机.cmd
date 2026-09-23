@echo off
setlocal
title CloudPhone Repair
color 0A
echo CloudPhone 2.2.0 repair is starting. Keep this window open.
echo This may take 30 to 90 seconds.
echo.
C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "C:\Users\USER\Desktop\cloudphone-ready\local\Repair-CloudPhone.ps1"
set "RC=%ERRORLEVEL%"
echo.
if not "%RC%"=="0" (
  color 0C
  echo Repair failed. Error code: %RC%
  echo Please keep this window open.
 ) else (
  echo Repair completed.
 )
echo.
pause
exit /b %RC%
