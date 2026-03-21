# Stop a running HoloDaemon process
# Usage: .\scripts\stop-daemon.ps1

$RepoRoot = Split-Path -Parent $PSScriptRoot
$PidFile  = Join-Path $RepoRoot ".holoscript\daemon.pid"

if (-not (Test-Path $PidFile)) {
    Write-Host "No daemon.pid found — daemon may not be running." -ForegroundColor Yellow
    exit 0
}

$Pid = (Get-Content $PidFile -Raw).Trim()

try {
    $proc = Get-Process -Id $Pid -ErrorAction Stop
    $proc | Stop-Process -Force
    Remove-Item $PidFile -Force
    Write-Host "Daemon (PID $Pid) stopped." -ForegroundColor Green
} catch {
    Write-Host "Process $Pid not found — already stopped." -ForegroundColor Yellow
    Remove-Item $PidFile -Force
}
