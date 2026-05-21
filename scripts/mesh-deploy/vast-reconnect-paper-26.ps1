#Requires -Version 5.1
<#
.SYNOPSIS
    Reconnect to a running Paper 26 simulation instance on Vast.ai.

.DESCRIPTION
    Reads .vast-paper26-state.json written by vast-launch-paper-26.ps1.
    Re-establishes the SSH local port-forward and creates a fresh HoloTunnel.
    Use this whenever:
      - The SSH tunnel dropped (computer sleep, network change)
      - The previous HoloTunnel expired
      - You want a fresh dashboard URL to share

.PARAMETER SkipTunnel
    Re-establish SSH port-forward only; skip HoloTunnel creation.

.PARAMETER PullCheckpoints
    Also pull the latest checkpoints from the remote to ./sim-checkpoints/.

.PARAMETER Status
    Print simulation status from /health and exit; no tunnel changes.

.EXAMPLE
    # Re-open tunnel after waking from sleep
    .\vast-reconnect-paper-26.ps1

    # Check progress without touching tunnels
    .\vast-reconnect-paper-26.ps1 -Status

    # Re-open tunnel + pull latest checkpoints
    .\vast-reconnect-paper-26.ps1 -PullCheckpoints
#>
[CmdletBinding()]
param(
    [switch]$SkipTunnel,
    [switch]$PullCheckpoints,
    [switch]$Status
)

$ErrorActionPreference = 'Stop'

# ─────────────────────────────────────────────────────────────────────────────
# Load state
# ─────────────────────────────────────────────────────────────────────────────

$stateFile = Join-Path $PSScriptRoot '.vast-paper26-state.json'
if (-not (Test-Path $stateFile)) {
    throw "State file not found: $stateFile`nRun vast-launch-paper-26.ps1 first."
}
$state = Get-Content $stateFile | ConvertFrom-Json

$instanceId  = $state.instanceId
$sshHost     = $state.sshHost
$sshPort     = $state.sshPort
$metricsPort = $state.metricsPort
$localPort   = $state.localFwdPort
$label       = $state.label
$phase       = $state.phase

$sshKey  = "$env:USERPROFILE\.ssh\id_rsa"
$sshBase = "ssh -i `"$sshKey`" -o StrictHostKeyChecking=no -o ServerAliveInterval=60 -p $sshPort root@$sshHost"
$scpBase = "scp -i `"$sshKey`" -o StrictHostKeyChecking=no -P $sshPort"

Write-Host "=== Paper 26 reconnect — instance $instanceId ($label) ===" -ForegroundColor Cyan

# ─────────────────────────────────────────────────────────────────────────────
# Verify instance still running on Vast.ai
# ─────────────────────────────────────────────────────────────────────────────

$instance = vastai show instance $instanceId --raw | ConvertFrom-Json
Write-Host "  Instance status: $($instance.actual_status)" -ForegroundColor $(
    if ($instance.actual_status -eq 'running') { 'Green' } else { 'Yellow' }
)

if ($instance.actual_status -ne 'running') {
    throw "Instance $instanceId is not running (status=$($instance.actual_status)). Check vast.ai console."
}

# ─────────────────────────────────────────────────────────────────────────────
# Status-only mode
# ─────────────────────────────────────────────────────────────────────────────

if ($Status) {
    # Try via SSH direct curl (doesn't require local port-forward)
    $healthJson = Invoke-Expression "$sshBase 'curl -sf http://localhost:$metricsPort/health'" 2>$null
    if ($healthJson) {
        $health = $healthJson | ConvertFrom-Json
        $elapsed = [math]::Round($health.elapsed_h, 2)
        $launched = [datetime]$state.launchedAt
        $eta = $launched.AddDays(15)
        Write-Host "`n  Running: $($health.running)" -ForegroundColor $(if ($health.running) {'Green'} else {'Yellow'})
        Write-Host "  Tick:    $($health.tick) / $($state.metricsPort -replace '.*','?')" -ForegroundColor White
        Write-Host "  Elapsed: ${elapsed}h" -ForegroundColor White
        Write-Host "  ETA:     $eta" -ForegroundColor DarkGray
    } else {
        Write-Warning "Could not reach metrics endpoint (port $metricsPort). Sim may have finished or crashed."
        Write-Host "  Check logs: $sshBase 'tail -50 /root/sim.log'" -ForegroundColor DarkGray
    }
    return
}

# ─────────────────────────────────────────────────────────────────────────────
# Kill any stale port-forward jobs
# ─────────────────────────────────────────────────────────────────────────────

$staleJobs = Get-Job | Where-Object { $_.State -ne 'Running' }
foreach ($j in $staleJobs) { Remove-Job -Id $j.Id -Force -ErrorAction SilentlyContinue }

# Kill any existing ssh tunnel to this host on this port
Get-Process -Name 'ssh' -ErrorAction SilentlyContinue | Where-Object {
    $_.CommandLine -like "*$sshHost*$metricsPort*"
} | Stop-Process -Force -ErrorAction SilentlyContinue

# ─────────────────────────────────────────────────────────────────────────────
# Re-establish SSH local port-forward
# ─────────────────────────────────────────────────────────────────────────────

Write-Host "`nOpening SSH local port-forward localhost:$localPort → remote:$metricsPort..." -ForegroundColor Cyan

$sshFwdCmd = "ssh -i `"$sshKey`" -o StrictHostKeyChecking=no -o ServerAliveInterval=30 " +
             "-N -L ${localPort}:localhost:${metricsPort} -p $sshPort root@$sshHost"

$fwdJob = Start-Job -ScriptBlock {
    param($cmd)
    Invoke-Expression $cmd
} -ArgumentList $sshFwdCmd

Start-Sleep -Seconds 4

# Verify
try {
    $health = Invoke-RestMethod -Uri "http://localhost:$localPort/health" -TimeoutSec 5
    Write-Host "  Port-forward OK — tick=$($health.tick) running=$($health.running)" -ForegroundColor Green
} catch {
    Write-Warning "Port-forward health check timed out: $_"
}

# ─────────────────────────────────────────────────────────────────────────────
# Fresh HoloTunnel
# ─────────────────────────────────────────────────────────────────────────────

$tunnelUrl = $null
$tunnelId  = $null

if (-not $SkipTunnel) {
    Write-Host "`nCreating fresh HoloTunnel for http://localhost:$localPort..." -ForegroundColor Cyan

    $tunnelHelper = Join-Path $PSScriptRoot 'holotunnel-create.mjs'
    $tunnelResult = node $tunnelHelper `
        --port $localPort `
        --session-name "paper26-${phase}-reconnect-$(Get-Date -Format HHmm)" 2>$null | ConvertFrom-Json

    if ($tunnelResult.url) {
        $tunnelUrl = $tunnelResult.url
        $tunnelId  = $tunnelResult.tunnelId
        Write-Host "  New HoloTunnel URL: $tunnelUrl" -ForegroundColor Green
    } else {
        Write-Warning "HoloTunnel creation failed. Using local port: http://localhost:$localPort"
    }

    # Update state file
    $state.tunnelUrl = $tunnelUrl
    $state.tunnelId  = $tunnelId
    $state.fwdJobId  = $fwdJob.Id
    $state | ConvertTo-Json | Out-File -FilePath $stateFile -Encoding utf8
}

# ─────────────────────────────────────────────────────────────────────────────
# Pull checkpoints
# ─────────────────────────────────────────────────────────────────────────────

if ($PullCheckpoints) {
    $repoRoot  = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
    $localDir  = Join-Path $repoRoot 'packages\core\sim-checkpoints'
    New-Item -ItemType Directory -Path $localDir -Force | Out-Null
    Write-Host "`nPulling checkpoints to $localDir..." -ForegroundColor Cyan
    Invoke-Expression "$scpBase -r `"root@${sshHost}:/root/sim-checkpoints/*`" `"$localDir`""
    $latest = Get-ChildItem $localDir -Filter '*.json' | Sort-Object LastWriteTime | Select-Object -Last 1
    Write-Host "  Latest checkpoint: $($latest.Name)" -ForegroundColor Green
}

# ─────────────────────────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────────────────────────

Write-Host "`n" -NoNewline
Write-Host "╔══════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  Paper 26 Sim — RECONNECTED                                 ║" -ForegroundColor Cyan
Write-Host "╠══════════════════════════════════════════════════════════════╣" -ForegroundColor Cyan
Write-Host "║  Instance: $($instanceId.ToString().PadRight(50))║" -ForegroundColor Cyan
if ($tunnelUrl) {
Write-Host "║  Dashboard (public):  $($tunnelUrl.PadRight(38))║" -ForegroundColor Green
}
Write-Host "║  Dashboard (local):   http://localhost:$($localPort.ToString().PadRight(31))║" -ForegroundColor Yellow
Write-Host "╠══════════════════════════════════════════════════════════════╣" -ForegroundColor Cyan
Write-Host "║  Tail logs:  $($sshBase.PadRight(46))" -ForegroundColor DarkGray
Write-Host "║              'tail -f /root/sim.log'" -ForegroundColor DarkGray
Write-Host "╚══════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
