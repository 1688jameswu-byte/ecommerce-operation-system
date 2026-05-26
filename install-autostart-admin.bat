@echo off
chcp 65001 >nul

net session >nul 2>&1
if not "%errorlevel%"=="0" (
  echo Requesting administrator permission to create startup task...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

set "TASK_NAME=TEMUOperationsDashboard"
set "PS=C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe"
set "SCRIPT=%~dp0start-dev-server.ps1"

schtasks /Create /TN "%TASK_NAME%" /SC ONLOGON /TR "\"%PS%\" -NoProfile -ExecutionPolicy Bypass -File \"%SCRIPT%\"" /RL HIGHEST /F
if not "%errorlevel%"=="0" (
  echo Failed to create startup task.
  pause
  exit /b 1
)

schtasks /Run /TN "%TASK_NAME%"
echo.
echo Startup task created: %TASK_NAME%
echo Service start requested. It will open http://127.0.0.1:5176/admin when ready.
pause
