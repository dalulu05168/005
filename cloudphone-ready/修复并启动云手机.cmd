@echo off
chcp 65001 >nul
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0local\Repair-CloudPhone.ps1"
if errorlevel 1 (echo.&echo 修复启动失败，请保留上方错误信息。&pause&exit /b 1)
