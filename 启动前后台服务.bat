@echo off
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command "Start-Process -FilePath 'powershell.exe' -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File ""%~dp0start-dev-server.ps1""' -WorkingDirectory '%~dp0' -WindowStyle Hidden"
exit /b 0
