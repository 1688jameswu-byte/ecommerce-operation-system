$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$logDir = Join-Path $root 'logs'
$log = Join-Path $logDir 'startup.log'

New-Item -ItemType Directory -Force -Path $logDir | Out-Null
Add-Content -Path $log -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] starting dev server"

Start-Process -FilePath 'C:\Program Files\nodejs\npm.cmd' `
  -ArgumentList 'run', 'dev' `
  -WorkingDirectory $root `
  -WindowStyle Minimized
