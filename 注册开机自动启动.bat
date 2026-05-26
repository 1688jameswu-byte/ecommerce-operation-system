@echo off
chcp 65001 >nul
set "ROOT=%~dp0"
set "START_SCRIPT=%ROOT%start-dev-server.ps1"

powershell -NoProfile -ExecutionPolicy Bypass -Command "$startup=[Environment]::GetFolderPath('Startup'); $target='C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe'; $args='-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """' + $env:START_SCRIPT + '"""'; $shortcut=Join-Path $startup 'TEMUOperationsDashboard.lnk'; $shell=New-Object -ComObject WScript.Shell; $link=$shell.CreateShortcut($shortcut); $link.TargetPath=$target; $link.Arguments=$args; $link.WorkingDirectory=$env:ROOT; $link.WindowStyle=7; $link.Description='Start TEMU operations dashboard service'; $link.Save(); Write-Host ('Startup shortcut created: ' + $shortcut)"

echo.
echo Done. The service will start after Windows login.
echo It will open http://127.0.0.1:5176/admin when ready.
echo You can also start it now by running: start-dev-server.ps1
pause
