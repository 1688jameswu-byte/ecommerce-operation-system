$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$logDir = Join-Path $root 'logs'
$log = Join-Path $logDir 'startup.log'
$outLog = Join-Path $logDir 'vite-out.log'
$errLog = Join-Path $logDir 'vite-error.log'
$npm = 'C:\Program Files\nodejs\npm.cmd'
$port = 5176
$url = "http://127.0.0.1:$port/admin"

New-Item -ItemType Directory -Force -Path $logDir | Out-Null
Add-Content -Path $log -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] starting dev server"

try {
  $listening = Get-NetTCPConnection -LocalAddress '127.0.0.1' -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  if ($listening) {
    Add-Content -Path $log -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] port $port already listening"
    Start-Process $url
    exit 0
  }

  if (-not (Test-Path -LiteralPath $npm)) {
    Add-Content -Path $log -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] npm not found: $npm"
    exit 1
  }

  $command = "cd /d `"$root`" && `"$npm`" run dev -- --host 127.0.0.1 --port $port >> `"$outLog`" 2>> `"$errLog`""
  Add-Content -Path $log -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] command: $command"

  $process = Start-Process -FilePath 'cmd.exe' `
    -ArgumentList '/d', '/c', $command `
    -WorkingDirectory $root `
    -WindowStyle Hidden `
    -PassThru
  Add-Content -Path $log -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] process started pid=$($process.Id)"

  for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Seconds 1
    try {
      $response = Invoke-WebRequest -Uri "http://127.0.0.1:$port/" -UseBasicParsing -TimeoutSec 2
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
        Add-Content -Path $log -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] service ready, opening $url"
        Start-Process $url
        exit 0
      }
    } catch {
      Add-Content -Path $log -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] waiting for port $port"
    }
  }

  Add-Content -Path $log -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] service not ready after 60 seconds"
} catch {
  Add-Content -Path $log -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] failed: $($_.Exception.Message)"
  exit 1
}
