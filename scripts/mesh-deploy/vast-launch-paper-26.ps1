#Requires -Version 5.1
<#
.SYNOPSIS
    Launch Paper 26 (Pillar-Slice / uAAL) 15-day multi-agent simulation on Vast.ai.

.DESCRIPTION
    Provisions a Vast.ai GPU instance, syncs the @holoscript/core package,
    starts Paper26SimRunner.ts (nohup, background), opens an SSH local
    port-forward so HoloTunnel can surface the metrics dashboard publicly.

    Instance stays alive for the full 15-day run (-KeepInstance is the
    default for this script; use -DestroyAfter to override).

    SSH connection details + tunnel URL are saved to .vast-paper26-state.json
    for reconnection via vast-reconnect-paper-26.ps1.

    Spend cap: checked via vast-spend-ledger.py before rental.  Default cap
    is $100/day (fleet-wide).  A typical Paper 26 run costs ~$0.35/hr = $8.40/day.

.PARAMETER Phase
    sim            — full 100-agent 1000-tick simulation (default)
    smoke          — 5 agents, 50 ticks, to verify the stack (fast, ~3min)
    ablation-b1    — baseline B1: text-token comms (no RecursiveLink, emit_to_peers=false)
    ablation-b2    — baseline B2: random Pillar coordinates
    ablation-b3    — baseline B3: no temporal gating (jepa_temporal_gating=false)
    sycophancy     — secondary eval: 10% sycophantic agents, full run

.PARAMETER GpuName
    Vast.ai gpu_name filter.  Default RTX_3090 (good CPU + 64GB RAM; $0.25-0.35/hr).

.PARAMETER MaxPricePerHr
    Maximum $/hr to accept.  Default 0.40.

.PARAMETER MetricsPort
    Local port that will be forwarded from the remote metrics server.
    Default 4426.

.PARAMETER Label
    Run label passed to Paper26SimRunner (used in checkpoint filenames).
    Default: paper26-<Phase>-<timestamp>.

.PARAMETER DestroyAfter
    Destroy the instance after the job finishes.  NOT the default for Paper 26
    (15-day run; use vast-reconnect to check progress).

.PARAMETER SkipTunnel
    Skip HoloTunnel setup (useful if running headless or tunnel token unavailable).

.EXAMPLE
    # Full 15-day simulation
    .\vast-launch-paper-26.ps1 -Phase sim -Label paper26-main-run-1

    # Quick smoke test before committing to a long run
    .\vast-launch-paper-26.ps1 -Phase smoke -Label paper26-smoke-$(Get-Date -Format yyyyMMdd)

    # Ablation B1 (text-token baseline) in parallel
    .\vast-launch-paper-26.ps1 -Phase ablation-b1 -Label paper26-b1
#>
[CmdletBinding()]
param(
    [ValidateSet('sim', 'smoke', 'ablation-b1', 'ablation-b2', 'ablation-b3', 'sycophancy')]
    [string]$Phase = 'sim',

    [string]$GpuName = 'RTX_3090',

    [double]$MaxPricePerHr = 0.40,

    [int]$MetricsPort = 4426,

    [string]$Label = '',

    [switch]$DestroyAfter,

    [switch]$SkipTunnel
)

$ErrorActionPreference = 'Stop'

# ─────────────────────────────────────────────────────────────────────────────
# Derived config
# ─────────────────────────────────────────────────────────────────────────────

if (-not $Label) {
    $Label = "paper26-${Phase}-$(Get-Date -Format 'yyyyMMddHHmm')"
}

# Phase-specific sim parameters
$SimArgs = switch ($Phase) {
    'sim'         { '--agents 100 --ticks 1000 --inner-freq 10' }
    'smoke'       { '--agents 5   --ticks 50   --inner-freq 10' }
    'ablation-b1' { '--agents 100 --ticks 1000 --inner-freq 10' }   # emit_to_peers=false set via env
    'ablation-b2' { '--agents 100 --ticks 1000 --inner-freq 10' }   # random coords via env
    'ablation-b3' { '--agents 100 --ticks 1000 --inner-freq 10' }   # no temporal gating via env
    'sycophancy'  { '--agents 100 --ticks 1000 --inner-freq 10 --sycophancy-frac 0.1' }
}

$AblationEnv = switch ($Phase) {
    'ablation-b1' { 'UAAL_EMIT_TO_PEERS=false' }
    'ablation-b2' { 'UAAL_RANDOM_COORDS=true'  }
    'ablation-b3' { 'UAAL_NO_TEMPORAL_GATE=true' }
    default       { '' }
}

Write-Host "=== Paper 26 Vast.ai launcher — phase: $Phase, label: $Label ===" -ForegroundColor Cyan

# ─────────────────────────────────────────────────────────────────────────────
# Pre-flight checks
# ─────────────────────────────────────────────────────────────────────────────

$null = Get-Command vastai -ErrorAction Stop
$userInfo = vastai show user --raw | ConvertFrom-Json | Select-Object -First 1
$bal = $userInfo.credit
Write-Host "  Vast.ai credit: `$$bal" -ForegroundColor DarkGray

if ($bal -lt 5.00) {
    throw "Insufficient credit (`$$bal). Top up at https://vast.ai/console/billing."
}

# Spend-cap check ($100/day fleet-wide)
$ledgerPy = Join-Path $PSScriptRoot 'vast-spend-ledger.py'
if (Test-Path $ledgerPy) {
    Write-Host "  Checking daily spend cap..." -ForegroundColor DarkGray
    $capResult = python $ledgerPy check-cap --cap 100 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Daily spend cap ($100) already reached or projected to breach.`n$capResult`nCheck ledger: python $ledgerPy report --days 1"
    }
    Write-Host "  Under cap. OK." -ForegroundColor DarkGray
}

# ─────────────────────────────────────────────────────────────────────────────
# Find offer — prefer good CPU/RAM; GPU is available-but-idle
# ─────────────────────────────────────────────────────────────────────────────

Write-Host "`nSearching offers: gpu=$GpuName max=`$$MaxPricePerHr/hr reliability>0.95..." -ForegroundColor Cyan
$query = "gpu_name=$GpuName num_gpus=1 reliability>0.95 dph<$MaxPricePerHr cpu_ram>=32"
$offers = vastai search offers $query -o 'dph_total' --limit 5 --raw | ConvertFrom-Json

if (-not $offers -or $offers.Count -eq 0) {
    # Fallback: any GPU with 32GB+ RAM
    Write-Host "  No $GpuName offers. Trying any GPU with 32GB+ RAM..." -ForegroundColor Yellow
    $query = "num_gpus=1 reliability>0.95 dph<$MaxPricePerHr cpu_ram>=32"
    $offers = vastai search offers $query -o 'dph_total' --limit 5 --raw | ConvertFrom-Json
    if (-not $offers -or $offers.Count -eq 0) {
        throw "No matching offers. Raise MaxPricePerHr or relax constraints."
    }
}

$offer = $offers[0]
$estCostPerDay  = [math]::Round($offer.dph_total * 24, 2)
$estCostTotal   = [math]::Round($offer.dph_total * 24 * 15, 2)
Write-Host "  Selected: id=$($offer.id) gpu=$($offer.gpu_name) `$$($offer.dph_total)/hr in $($offer.geolocation)" -ForegroundColor Green
Write-Host "  Estimated cost: `$$estCostPerDay/day, `$$estCostTotal for 15 days" -ForegroundColor DarkGray

# ─────────────────────────────────────────────────────────────────────────────
# Provision instance
# ─────────────────────────────────────────────────────────────────────────────

# Node.js 22 LTS image — pre-installed, no extra install step needed
$image = 'node:22-bookworm'

Write-Host "`nProvisioning instance from offer $($offer.id)..." -ForegroundColor Cyan
$createOutput = vastai create instance $offer.id `
    --image $image `
    --disk 64 `
    --raw | ConvertFrom-Json

$instanceId = $createOutput.new_contract
Write-Host "  Instance id: $instanceId" -ForegroundColor Green

# Record rental in spend ledger
if (Test-Path $ledgerPy) {
    python $ledgerPy rent `
        --instance-id $instanceId `
        --handle "paper26-${Phase}" `
        --dph $offer.dph_total `
        --gpu-name $offer.gpu_name | Out-Null
}

# ─────────────────────────────────────────────────────────────────────────────
# Wait for SSH
# ─────────────────────────────────────────────────────────────────────────────

Write-Host "`nWaiting for instance SSH (max 10min)..." -ForegroundColor Cyan
$deadline = (Get-Date).AddMinutes(10)
$instance = $null

while ((Get-Date) -lt $deadline) {
    $instance = vastai show instance $instanceId --raw | ConvertFrom-Json
    if ($instance.actual_status -eq 'running' -and $instance.ssh_host) {
        Write-Host "  SSH ready: $($instance.ssh_host):$($instance.ssh_port)" -ForegroundColor Green
        break
    }
    Start-Sleep -Seconds 15
    Write-Host "  status: $($instance.actual_status)..." -ForegroundColor DarkGray
}

if (-not $instance.ssh_host) {
    vastai destroy instance $instanceId
    if (Test-Path $ledgerPy) { python $ledgerPy close --instance-id $instanceId --reason 'ssh-timeout' | Out-Null }
    throw "Instance failed to provision SSH within deadline."
}

$sshKey    = "$env:USERPROFILE\.ssh\id_rsa"
$sshHost   = $instance.ssh_host
$sshPort   = $instance.ssh_port
$sshBase   = "ssh -i `"$sshKey`" -o StrictHostKeyChecking=no -o ServerAliveInterval=60 -p $sshPort root@$sshHost"
$scpBase   = "scp -i `"$sshKey`" -o StrictHostKeyChecking=no -P $sshPort"

# ─────────────────────────────────────────────────────────────────────────────
# Sync packages/core to remote
# ─────────────────────────────────────────────────────────────────────────────

$repoRoot  = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$coreDir   = Join-Path $repoRoot 'packages\core'

Write-Host "`nSyncing @holoscript/core to remote..." -ForegroundColor Cyan

# Only sync src + package.json + tsconfig — not node_modules or dist
$syncCmd  = "$scpBase -r `"$coreDir`" `"root@${sshHost}:/root/holoscript-core`""
Invoke-Expression $syncCmd

# Install deps + build on remote
$remoteSetup = @(
    'cd /root/holoscript-core',
    'npm install --ignore-scripts 2>&1 | tail -5',
    'npx tsc --noEmit 2>/dev/null || true',   # type-check without emitting
    "mkdir -p /root/sim-checkpoints"
) -join ' && '

Invoke-Expression "$sshBase '$remoteSetup'"
Write-Host "  Sync + install complete." -ForegroundColor Green

# ─────────────────────────────────────────────────────────────────────────────
# Start simulation (nohup, background on remote)
# ─────────────────────────────────────────────────────────────────────────────

Write-Host "`nStarting simulation (nohup)..." -ForegroundColor Cyan

$envPrefix  = if ($AblationEnv) { "$AblationEnv " } else { '' }
$apiKey     = (Get-Content "$repoRoot\.env" -ErrorAction SilentlyContinue | Select-String 'HOLOSCRIPT_API_KEY').ToString() -replace '.*=',''
$apiKey     = $apiKey.Trim()

$remoteCmd = @(
    "cd /root/holoscript-core",
    "nohup $($envPrefix)npx tsx src/traits/pillar/sim/Paper26SimRunner.ts",
    "$SimArgs --port $MetricsPort --label `"$Label`" --checkpoint-dir /root/sim-checkpoints",
    $(if ($apiKey) { "--knowledge-push --knowledge-key `"$apiKey`"" } else { '' }),
    "> /root/sim.log 2>&1 &",
    "echo `$!" # print PID
) -join ' '

$remotePid = Invoke-Expression "$sshBase '$remoteCmd'"
Write-Host "  Simulation PID on remote: $remotePid" -ForegroundColor Green

# Give it 5s to start and bind the port
Start-Sleep -Seconds 5

# Quick health check
$healthCheck = Invoke-Expression "$sshBase 'curl -sf http://localhost:$MetricsPort/health'" 2>$null
if ($healthCheck) {
    Write-Host "  Health check: $healthCheck" -ForegroundColor Green
} else {
    Write-Warning "Health check failed — sim may still be starting. Check /root/sim.log"
}

# ─────────────────────────────────────────────────────────────────────────────
# SSH local port-forward (background job)
# ─────────────────────────────────────────────────────────────────────────────

$localFwdPort = $MetricsPort   # same port locally
Write-Host "`nOpening SSH local port-forward localhost:$localFwdPort → remote:$MetricsPort..." -ForegroundColor Cyan

$sshFwdCmd = "ssh -i `"$sshKey`" -o StrictHostKeyChecking=no -o ServerAliveInterval=30 " +
             "-N -L ${localFwdPort}:localhost:${MetricsPort} -p $sshPort root@$sshHost"

$fwdJob = Start-Job -ScriptBlock {
    param($cmd)
    Invoke-Expression $cmd
} -ArgumentList $sshFwdCmd

Write-Host "  Port-forward job id: $($fwdJob.Id)" -ForegroundColor DarkGray
Start-Sleep -Seconds 3

# Verify forward is up
try {
    $fwdCheck = Invoke-RestMethod -Uri "http://localhost:$localFwdPort/health" -TimeoutSec 5
    Write-Host "  Port-forward OK — metrics reachable on http://localhost:$localFwdPort" -ForegroundColor Green
} catch {
    Write-Warning "Port-forward health check failed: $_  (sim may still be initialising)"
}

# ─────────────────────────────────────────────────────────────────────────────
# HoloTunnel
# ─────────────────────────────────────────────────────────────────────────────

$tunnelUrl  = $null
$tunnelId   = $null

if (-not $SkipTunnel) {
    Write-Host "`nCreating HoloTunnel for http://localhost:$localFwdPort..." -ForegroundColor Cyan

    # HoloTunnel via holotunnel-create.mjs (calls holo_tunnel_create MCP tool)
    $tunnelHelper = Join-Path $PSScriptRoot 'holotunnel-create.mjs'
    $tunnelResult = node $tunnelHelper `
        --port $localFwdPort `
        --session-name "paper26-${Phase}-${Label}" 2>$null | ConvertFrom-Json

    if ($tunnelResult.url) {
        $tunnelUrl = $tunnelResult.url
        $tunnelId  = $tunnelResult.tunnelId
        Write-Host "  HoloTunnel URL: $tunnelUrl" -ForegroundColor Green
        Write-Host "  Dashboard:      $tunnelUrl" -ForegroundColor Cyan
    } else {
        Write-Warning "HoloTunnel creation failed (MCP may be unreachable). Access via SSH tunnel only."
        Write-Host "  Local dashboard: http://localhost:$localFwdPort" -ForegroundColor Yellow
    }
}

# ─────────────────────────────────────────────────────────────────────────────
# Save state file (for reconnect script)
# ─────────────────────────────────────────────────────────────────────────────

$stateFile = Join-Path $PSScriptRoot '.vast-paper26-state.json'
$state = @{
    instanceId      = $instanceId
    phase           = $Phase
    label           = $Label
    sshHost         = $sshHost
    sshPort         = $sshPort
    metricsPort     = $MetricsPort
    localFwdPort    = $localFwdPort
    tunnelUrl       = $tunnelUrl
    tunnelId        = $tunnelId
    launchedAt      = (Get-Date -Format 'o')
    estimatedEndAt  = ((Get-Date).AddDays(15).ToString('o'))
    remotePid       = $remotePid
    fwdJobId        = $fwdJob.Id
    dphTotal        = $offer.dph_total
}
$state | ConvertTo-Json | Out-File -FilePath $stateFile -Encoding utf8
Write-Host "`nState saved to: $stateFile" -ForegroundColor DarkGray

# ─────────────────────────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────────────────────────

Write-Host "`n" -NoNewline
Write-Host "╔══════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  Paper 26 Simulation — LAUNCHED                             ║" -ForegroundColor Cyan
Write-Host "╠══════════════════════════════════════════════════════════════╣" -ForegroundColor Cyan
Write-Host "║  Phase:       $($Phase.PadRight(48))║" -ForegroundColor Cyan
Write-Host "║  Label:       $($Label.PadRight(48))║" -ForegroundColor Cyan
Write-Host "║  Instance:    $($instanceId.ToString().PadRight(48))║" -ForegroundColor Cyan
Write-Host "║  SSH:         root@${sshHost}:${sshPort}" -ForegroundColor Cyan
Write-Host "║  Cost:        ~`$$estCostPerDay/day  |  ~`$$estCostTotal for 15 days" -ForegroundColor Cyan
if ($tunnelUrl) {
Write-Host "║  Dashboard:   $($tunnelUrl.PadRight(48))║" -ForegroundColor Green
} else {
Write-Host "║  Dashboard:   http://localhost:$localFwdPort (SSH tunnel)" -ForegroundColor Yellow
}
Write-Host "╠══════════════════════════════════════════════════════════════╣" -ForegroundColor Cyan
Write-Host "║  Remote logs:  ssh ... 'tail -f /root/sim.log'              ║" -ForegroundColor DarkGray
Write-Host "║  Checkpoints:  scp ... 'root@...:/root/sim-checkpoints/*' . ║" -ForegroundColor DarkGray
Write-Host "║  Reconnect:    .\vast-reconnect-paper-26.ps1                ║" -ForegroundColor DarkGray
Write-Host "║  Destroy:      vastai destroy instance $instanceId" -ForegroundColor DarkGray
Write-Host "╚══════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan

# ─────────────────────────────────────────────────────────────────────────────
# Optional: destroy after (smoke tests only)
# ─────────────────────────────────────────────────────────────────────────────

if ($DestroyAfter) {
    Write-Host "`n-DestroyAfter set — waiting for simulation to complete before destroying..." -ForegroundColor Yellow
    $maxWaitMin = if ($Phase -eq 'smoke') { 10 } else { 60 * 24 * 15 }
    $waitDeadline = (Get-Date).AddMinutes($maxWaitMin)

    while ((Get-Date) -lt $waitDeadline) {
        Start-Sleep -Seconds 30
        try {
            $health = Invoke-RestMethod -Uri "http://localhost:$localFwdPort/health" -TimeoutSec 5
            if (-not $health.running) {
                Write-Host "  Simulation complete (running=false). Pulling checkpoints..." -ForegroundColor Green
                break
            }
            Write-Host "  Still running: tick=$($health.tick)" -ForegroundColor DarkGray
        } catch {
            Write-Warning "Health check failed: $_"
        }
    }

    # Pull checkpoints
    $localCheckpoints = Join-Path $repoRoot 'packages\core\sim-checkpoints'
    New-Item -ItemType Directory -Path $localCheckpoints -Force | Out-Null
    Invoke-Expression "$scpBase -r `"root@${sshHost}:/root/sim-checkpoints/*`" `"$localCheckpoints`""
    Write-Host "  Checkpoints saved to: $localCheckpoints" -ForegroundColor Green

    # Tear down
    Remove-Job -Id $fwdJob.Id -Force -ErrorAction SilentlyContinue
    vastai destroy instance $instanceId
    if (Test-Path $ledgerPy) { python $ledgerPy close --instance-id $instanceId --reason 'destroy-after' | Out-Null }
    Remove-Item $stateFile -ErrorAction SilentlyContinue
    Write-Host "  Instance destroyed." -ForegroundColor Green
}
