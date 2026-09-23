@echo off
chcp 65001 >nul
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0local\Prepare-CloudPhone.ps1"
if errorlevel 1 (echo.&echo 准备失败，请保留上方错误信息。&pause&exit /b 1)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0local\Start-CloudPhone.ps1"
if errorlevel 1 (echo.&echo 启动失败。日志位于 %%LOCALAPPDATA%%\CloudPhone。&pause&exit /b 1)
