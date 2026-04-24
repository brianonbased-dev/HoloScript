#Requires -Version 5.1
<#
.SYNOPSIS
    Launch Paper 19 (ATI) Phase 3 training on Vast.ai.

.DESCRIPTION
    Mirrors the vast-bench-runner.ps1 pattern but for training jobs.
    Provisions a single GPU instance, syncs the trait-inference package,
    runs the requested job (smoke / baseline / model-train), pulls
    measurement JSON, then destroys the instance.

    Phases:
      smoke      — runs trait-inference smoke (synthetic data; ~2min)
      baseline   — runs the 3 baselines on a real dataset (CPU-bound; ~10min)
      train      — full contribution model training (GPU; ~6hr per cell)

.PARAMETER Phase
    Job phase: smoke | baseline | train.

.PARAMETER GpuName
    Vast.ai gpu_name filter. Default RTX_4090.

.PARAMETER MaxPricePerHr
    Maximum $/hr to accept (default 0.30 — 4090 typical).

.PARAMETER DatasetPath
    For baseline/train phases: path to JSONL dataset. Required for
    baseline + train; ignored for smoke.

.PARAMETER Label
    Label appended to the measurements/ output filename.

.EXAMPLE
    # Cheapest single-GPU smoke test (~$0.30, ~5min)
    .\vast-launch-paper-19.ps1 -Phase smoke -Label paper19-smoke-test

    # Run all 3 baselines on the real dataset
    .\vast-launch-paper-19.ps1 -Phase baseline -DatasetPath data/atimark.jsonl -Label paper19-baselines

    # Full training run (REQUIRES preregistration.md frozen)
    .\vast-launch-paper-19.ps1 -Phase train -GpuName RTX_4090 -DatasetPath data/atimark.jsonl -Label paper19-headline-cell-1
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('smoke', 'baseline', 'train')]
    [string]$Phase,

    [Parameter(Mandatory = $true)]
    [string]$Label,

    [string]$GpuName = 'RTX_4090',

    [double]$MaxPricePerHr = 0.30,

    [string]$DatasetPath = '',

    # Optional: keep instance alive after job (for SSH inspection / debugging)
    [switch]$KeepInstance
)

$ErrorActionPreference = 'Stop'

# ---------------------------------------------------------------------------
# Pre-flight
# ---------------------------------------------------------------------------

Write-Host "=== Paper 19 Vast.ai launcher — phase: $Phase, label: $Label ===" -ForegroundColor Cyan

# Verify vastai CLI + auth
$null = Get-Command vastai -ErrorAction Stop
$bal = (vastai show user --raw | ConvertFrom-Json | Select-Object -First 1).credit
Write-Host "  Account credit: `$$bal" -ForegroundColor DarkGray
if ($bal -lt 0.50 -and $Phase -eq 'train') {
    throw "Train phase requires more than `$0.50 credit (have `$$bal). Top up via vast.ai dashboard."
}

# Verify dataset exists for baseline/train
if ($Phase -in @('baseline', 'train')) {
    if (-not $DatasetPath -or -not (Test-Path $DatasetPath)) {
        throw "Phase '$Phase' requires -DatasetPath pointing to an existing JSONL file."
    }
}

# ---------------------------------------------------------------------------
# Find offer
# ---------------------------------------------------------------------------

Write-Host "`nSearching offers: gpu=$GpuName, max=`$$MaxPricePerHr/hr..." -ForegroundColor Cyan
$query = "gpu_name=$GpuName num_gpus=1 reliability>0.95 dph<$MaxPricePerHr"
$offers = vastai search offers $query -o 'dph_total' --limit 5 --raw | ConvertFrom-Json
if (-not $offers -or $offers.Count -eq 0) {
    throw "No matching offers found. Try a higher MaxPricePerHr or different GpuName."
}
$offer = $offers[0]
Write-Host "  Selected: id=$($offer.id) `$$($offer.dph_total)/hr in $($offer.geolocation)" -ForegroundColor Green

# ---------------------------------------------------------------------------
# Create instance
# ---------------------------------------------------------------------------

# Image with python 3.11 + git pre-installed; enough for our pipeline.
$image = 'pytorch/pytorch:2.4.1-cuda12.1-cudnn9-runtime'

Write-Host "`nProvisioning instance from offer $($offer.id)..." -ForegroundColor Cyan
$createOutput = vastai create instance $offer.id --image $image --disk 32 --raw | ConvertFrom-Json
$instanceId = $createOutput.new_contract
Write-Host "  Instance id: $instanceId" -ForegroundColor Green
$instanceId | Out-File -FilePath '.vast-instance-id' -Encoding utf8

# ---------------------------------------------------------------------------
# Wait for SSH ready
# ---------------------------------------------------------------------------

Write-Host "`nWaiting for instance SSH (max 5min)..." -ForegroundColor Cyan
$deadline = (Get-Date).AddMinutes(5)
$instance = $null
while ((Get-Date) -lt $deadline) {
    $instance = vastai show instance $instanceId --raw | ConvertFrom-Json
    if ($instance.actual_status -eq 'running' -and $instance.ssh_host) {
        Write-Host "  SSH ready: $($instance.ssh_host):$($instance.ssh_port)" -ForegroundColor Green
        break
    }
    Start-Sleep -Seconds 10
    Write-Host "  status: $($instance.actual_status)..." -ForegroundColor DarkGray
}
if (-not $instance.ssh_host) {
    Write-Warning "SSH never came up. Destroying instance."
    vastai destroy instance $instanceId
    throw "Instance failed to provision SSH within deadline."
}

$ssh = "ssh -i $env:USERPROFILE\.ssh\id_rsa -o StrictHostKeyChecking=no -p $($instance.ssh_port) root@$($instance.ssh_host)"

# ---------------------------------------------------------------------------
# Sync code + install
# ---------------------------------------------------------------------------

Write-Host "`nSyncing trait-inference package..." -ForegroundColor Cyan
$pkgRoot = Split-Path $PSScriptRoot -Parent  # packages/trait-inference/
& scp -i $env:USERPROFILE\.ssh\id_rsa -o StrictHostKeyChecking=no -P $instance.ssh_port -r $pkgRoot "root@$($instance.ssh_host):/root/trait-inference"

if ($Phase -in @('baseline', 'train')) {
    Write-Host "  Syncing dataset..." -ForegroundColor DarkGray
    & scp -i $env:USERPROFILE\.ssh\id_rsa -o StrictHostKeyChecking=no -P $instance.ssh_port $DatasetPath "root@$($instance.ssh_host):/root/dataset.jsonl"
}

Write-Host "`nInstalling deps on instance..." -ForegroundColor Cyan
$installCmd = 'cd /root/trait-inference && pip install -e .'
if ($Phase -eq 'train') { $installCmd += '[model]' }
& Invoke-Expression "$ssh '$installCmd'"

# ---------------------------------------------------------------------------
# Run job
# ---------------------------------------------------------------------------

Write-Host "`nRunning $Phase phase..." -ForegroundColor Cyan
$measurementsRel = "measurements/$Label-$(Get-Date -Format 'yyyy-MM-ddTHHmmss').json"
$remoteOut = "/root/trait-inference/$measurementsRel"

switch ($Phase) {
    'smoke' {
        $cmd = "cd /root/trait-inference && trait-inference smoke --output $remoteOut --bootstrap-b 200 --n 200"
    }
    'baseline' {
        $cmd = @(
            "cd /root/trait-inference",
            "trait-inference dataset split /root/dataset.jsonl --output-dir /root/splits",
            "trait-inference baseline run keyword --train /root/splits/train.jsonl --eval /root/splits/held_out_novel.jsonl --output ${remoteOut}.keyword",
            "trait-inference baseline run tfidf   --train /root/splits/train.jsonl --eval /root/splits/held_out_novel.jsonl --val /root/splits/val.jsonl --tune-threshold --output ${remoteOut}.tfidf"
        ) -join ' && '
    }
    'train' {
        $cmd = "echo 'Phase 3 train command not yet implemented — depends on contribution model module landing'"
        # When model module ships, replace with: trait-inference model train --train ... --val ... --output $remoteOut
    }
}
& Invoke-Expression "$ssh '$cmd'"

# ---------------------------------------------------------------------------
# Pull results
# ---------------------------------------------------------------------------

Write-Host "`nPulling measurements..." -ForegroundColor Cyan
$localMeasurements = Join-Path $pkgRoot 'measurements'
New-Item -ItemType Directory -Path $localMeasurements -Force | Out-Null
& scp -i $env:USERPROFILE\.ssh\id_rsa -o StrictHostKeyChecking=no -P $instance.ssh_port -r "root@$($instance.ssh_host):/root/trait-inference/measurements/*" $localMeasurements
Write-Host "  Saved to: $localMeasurements" -ForegroundColor Green

# ---------------------------------------------------------------------------
# Destroy instance (unless -KeepInstance)
# ---------------------------------------------------------------------------

if ($KeepInstance) {
    Write-Host "`n-KeepInstance set — instance left running. Destroy with:" -ForegroundColor Yellow
    Write-Host "  vastai destroy instance $instanceId" -ForegroundColor Yellow
} else {
    Write-Host "`nDestroying instance..." -ForegroundColor Cyan
    vastai destroy instance $instanceId
    Remove-Item '.vast-instance-id' -ErrorAction SilentlyContinue
    Write-Host "  Destroyed." -ForegroundColor Green
}

Write-Host "`n=== DONE — phase $Phase / label $Label ===" -ForegroundColor Cyan
