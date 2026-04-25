#Requires -Version 5.1
<#
.SYNOPSIS
    Deploy the @holoscript/holoscript-agent runtime onto N rented Vast.ai
    instances, one mesh agent per instance.

.DESCRIPTION
    For each live Vast.ai instance:
      1. Resolves identity (wallet, x402 bearer, brain composition,
         provider, model, budget) from agents.json + .env.
      2. Composes per-instance env vars.
      3. SCPs bootstrap-agent.sh + the agent's brain composition file
         to /root on the instance.
      4. SSHes in, runs bootstrap.sh under nohup.
      5. Captures the bootstrap log to local mesh-deploy-logs/<instance-id>.log

    Idempotent: re-running picks up the latest commit on each instance
    (bootstrap.sh git-pulls on existing checkout). Re-running does NOT
    duplicate agents - bootstrap kills the previous daemon before starting.

    Founder runs this script LOCALLY from a shell with:
      - vastai CLI authenticated
      - ssh-agent loaded with the key matching what's registered on
        the Vast.ai account
      - .env populated with HOLOSCRIPT_AGENT_WALLET_<HANDLE> +
        HOLOSCRIPT_AGENT_X402_BEARER_<HANDLE> for each agent in
        agents.json

.PARAMETER ConfigPath
    Path to agents.json (see agents-template.json for schema).

.PARAMETER InstanceFilter
    Optional regex to limit deployment to a subset (matches on
    "<id> <gpu_name>"). Useful for staged rollout.

.PARAMETER DryRun
    If set, prints the per-instance plan without executing.

.PARAMETER MaxParallel
    Cap on simultaneous deployments. Default 5 (so 31 instances complete
    in ~6 batches × ~3min/batch = ~18 min total).

.EXAMPLE
    # Dry run - see the plan, no execution
    .\Deploy-MeshAgents.ps1 -ConfigPath agents.json -DryRun

    # Deploy to all 31, max 5 parallel
    .\Deploy-MeshAgents.ps1 -ConfigPath agents.json

    # Stage-1: only the H200 first to validate
    .\Deploy-MeshAgents.ps1 -ConfigPath agents.json -InstanceFilter "H200"
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ConfigPath,

    [string]$InstanceFilter = '',

    [switch]$DryRun,

    [int]$MaxParallel = 5,

    [string]$SshKey = "$env:USERPROFILE\.ssh\id_rsa",

    [string]$LogDir = '.\mesh-deploy-logs',

    # If set, env vars from this file are loaded into the local shell
    # before resolving wallet/bearer references. Default is HoloScript/.env
    # (the SSOT per F.012).
    [string]$EnvFile = "$env:USERPROFILE\Documents\GitHub\HoloScript\.env"
)

$ErrorActionPreference = 'Stop'

# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------
Write-Host "=== Mesh Deploy - $(Get-Date -Format o) ===" -ForegroundColor Cyan
Write-Host "  ConfigPath:     $ConfigPath"
Write-Host "  InstanceFilter: $(if ($InstanceFilter) { $InstanceFilter } else { '<none>' })"
Write-Host "  DryRun:         $DryRun"
Write-Host "  MaxParallel:    $MaxParallel"
Write-Host "  SshKey:         $SshKey"
Write-Host "  LogDir:         $LogDir"
Write-Host "  EnvFile:        $EnvFile"
Write-Host ""

# ---------------------------------------------------------------------------
# Pre-flight
# ---------------------------------------------------------------------------
if (-not (Test-Path $ConfigPath)) { throw "ConfigPath does not exist: $ConfigPath" }
if (-not (Test-Path $SshKey)) { throw "SshKey does not exist: $SshKey" }
if (-not (Get-Command vastai -ErrorAction SilentlyContinue)) { throw "vastai CLI not on PATH" }
if (-not (Get-Command ssh -ErrorAction SilentlyContinue)) { throw "ssh not on PATH" }
if (-not (Get-Command scp -ErrorAction SilentlyContinue)) { throw "scp not on PATH" }
New-Item -ItemType Directory -Path $LogDir -Force | Out-Null

# Source the .env file so HOLOSCRIPT_AGENT_WALLET_* / *_X402_BEARER_*
# vars are visible to this script. Bash-style; convert to PS by line.
if (Test-Path $EnvFile) {
    Write-Host "[envfile] loading $EnvFile" -ForegroundColor DarkGray
    Get-Content $EnvFile | ForEach-Object {
        if ($_ -match '^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.+)\s*$') {
            $name = $Matches[1]
            $value = $Matches[2].Trim('"').Trim("'")
            Set-Item -Path "Env:\$name" -Value $value -ErrorAction SilentlyContinue
        }
    }
} else {
    Write-Warning "EnvFile not found: $EnvFile - proceeding without (wallet/bearer lookups will fail loudly)"
}

# ---------------------------------------------------------------------------
# Load instance list + agent config
# ---------------------------------------------------------------------------
Write-Host "[vastai] fetching live instance list..." -ForegroundColor Cyan
$instancesRaw = vastai show instances --raw | ConvertFrom-Json
if ($instancesRaw -isnot [array]) { $instancesRaw = @($instancesRaw) }
$instances = $instancesRaw | Where-Object { $_.actual_status -eq 'running' -and $_.ssh_host }
if ($InstanceFilter) {
    $instances = $instances | Where-Object {
        "$($_.id) $($_.gpu_name)" -match $InstanceFilter
    }
}
Write-Host "  $($instances.Count) instance(s) match filter"

$config = Get-Content $ConfigPath -Raw | ConvertFrom-Json
$agents = $config.agents | Where-Object { $_.enabled -ne $false }
Write-Host "  $($agents.Count) agent(s) enabled in config"
Write-Host ""

if ($instances.Count -eq 0) { Write-Warning "No instances match - exiting"; exit 0 }
if ($agents.Count -eq 0) { Write-Warning "No agents enabled - exiting"; exit 0 }

# Match agents to instances.
# Phase 1: agents with `instanceMatch` regex consume their preferred
#          instance first (e.g. mesh-worker-01 instanceMatch=H200).
# Phase 2: remaining agents fill remaining instances by index order.
# Wrap-around if more instances than agents; truncate if fewer.
$pairs = @()
$consumedInstanceIds = @{}
$consumedAgentHandles = @{}

# Phase 1: instanceMatch-pinned agents
foreach ($agent in $agents) {
    if (-not $agent.instanceMatch) { continue }
    $match = $instances | Where-Object {
        (-not $consumedInstanceIds.ContainsKey($_.id)) -and
        ("$($_.id) $($_.gpu_name)" -match $agent.instanceMatch)
    } | Select-Object -First 1
    if ($match) {
        $pairs += [PSCustomObject]@{
            Instance = $match
            Agent    = $agent
            Index    = $pairs.Count
            Pinned   = $true
        }
        $consumedInstanceIds[$match.id] = $true
        $consumedAgentHandles[$agent.handle] = $true
        Write-Host "  [pin] $($agent.handle) -> instance $($match.id) ($($match.gpu_name)) via instanceMatch=$($agent.instanceMatch)" -ForegroundColor Magenta
    } else {
        Write-Warning "  [pin] $($agent.handle) instanceMatch=$($agent.instanceMatch) had no available instance match; will fall through to index-order matching"
    }
}

# Phase 2: index-order fill for remaining agents/instances
$remainingInstances = $instances | Where-Object { -not $consumedInstanceIds.ContainsKey($_.id) }
$remainingAgents = $agents | Where-Object { -not $consumedAgentHandles.ContainsKey($_.handle) }
for ($i = 0; $i -lt $remainingInstances.Count; $i++) {
    if ($remainingAgents.Count -eq 0) { break }
    $agent = $remainingAgents[$i % $remainingAgents.Count]
    $pairs += [PSCustomObject]@{
        Instance = $remainingInstances[$i]
        Agent    = $agent
        Index    = $pairs.Count
        Pinned   = $false
    }
}

# ---------------------------------------------------------------------------
# Per-pair plan + execution
# ---------------------------------------------------------------------------
function Resolve-EnvKey {
    param([string]$Key)
    $val = [Environment]::GetEnvironmentVariable($Key, 'Process')
    if (-not $val) { return $null }
    return $val
}

function Plan-One {
    param($Pair)
    $inst = $Pair.Instance
    $agent = $Pair.Agent
    $idx = $Pair.Index

    $wallet = Resolve-EnvKey $agent.walletEnvKey
    $bearer = Resolve-EnvKey $agent.bearerEnvKey

    $issues = @()
    if (-not $wallet) { $issues += "wallet env $($agent.walletEnvKey) missing" }
    if (-not $bearer) { $issues += "bearer env $($agent.bearerEnvKey) missing" }
    if (-not (Test-Path "$env:USERPROFILE\Documents\GitHub\ai-ecosystem\$($agent.brainPath)")) {
        # Brain may live in HoloScript repo too; bootstrap will resolve at runtime.
    }

    return [PSCustomObject]@{
        Index       = $idx
        InstanceId  = $inst.id
        SshHost     = $inst.ssh_host
        SshPort     = $inst.ssh_port
        GpuName     = $inst.gpu_name
        Handle      = "$($agent.handle)-$idx"
        Provider    = $agent.provider
        Model       = $agent.model
        BrainPath   = $agent.brainPath
        Wallet      = $wallet
        Bearer      = $bearer
        Budget      = if ($agent.budgetUsdPerDay) { $agent.budgetUsdPerDay } else { 5 }
        Scope       = if ($agent.scopeTier) { $agent.scopeTier } else { 'warm' }
        Issues      = $issues
        Ok          = $issues.Count -eq 0
    }
}

$plans = @($pairs | ForEach-Object { Plan-One $_ })

# Show the plan
Write-Host "=== PLAN ===" -ForegroundColor Cyan
$plans | Format-Table -Property Index, InstanceId, GpuName, Handle, Provider, Model, Ok | Out-Host

$blocked = $plans | Where-Object { -not $_.Ok }
if ($blocked) {
    Write-Host "BLOCKED - missing identity material for $($blocked.Count) agent(s):" -ForegroundColor Yellow
    $blocked | ForEach-Object {
        Write-Host "  [$($_.Index)] $($_.Handle): $($_.Issues -join ', ')" -ForegroundColor Yellow
    }
    if (-not $DryRun) {
        Write-Host "Aborting non-dry-run because identities are incomplete." -ForegroundColor Red
        Write-Host "  Provision wallets + x402 seats, populate $EnvFile, retry." -ForegroundColor Red
        exit 3
    }
}

if ($DryRun) {
    Write-Host "DryRun - no execution." -ForegroundColor Green
    exit 0
}

# ---------------------------------------------------------------------------
# Per-instance execution (parallel via PS jobs, capped at MaxParallel)
# ---------------------------------------------------------------------------
$bootstrapScript = Join-Path $PSScriptRoot 'bootstrap-agent.sh'
if (-not (Test-Path $bootstrapScript)) { throw "bootstrap-agent.sh not found: $bootstrapScript" }

$deployJob = {
    param($plan, $sshKey, $bootstrapScript, $logDir)

    $sshArgs = @(
        '-i', $sshKey,
        '-o', 'StrictHostKeyChecking=no',
        '-o', 'UserKnownHostsFile=/dev/null',
        '-o', 'ConnectTimeout=20',
        '-p', $plan.SshPort
    )
    $scpArgs = @(
        '-i', $sshKey,
        '-o', 'StrictHostKeyChecking=no',
        '-o', 'UserKnownHostsFile=/dev/null',
        '-o', 'ConnectTimeout=20',
        '-P', $plan.SshPort
    )
    $remote = "root@$($plan.SshHost)"
    $logFile = Join-Path $logDir "$($plan.InstanceId)-$($plan.Handle).log"

    "[$(Get-Date -Format o)] [$($plan.Handle)] starting deploy to $($plan.SshHost):$($plan.SshPort)" |
        Out-File -FilePath $logFile -Encoding utf8

    # 1. Push bootstrap.sh
    & scp @scpArgs $bootstrapScript "${remote}:/root/bootstrap-agent.sh" 2>&1 |
        Out-File -Append -FilePath $logFile -Encoding utf8
    if ($LASTEXITCODE -ne 0) { return @{ Handle = $plan.Handle; Ok = $false; Step = 'scp'; Log = $logFile } }

    # 2. Compose env block + run bootstrap
    $envExports = @(
        "export HOLOSCRIPT_AGENT_HANDLE='$($plan.Handle)'"
        "export HOLOSCRIPT_AGENT_PROVIDER='$($plan.Provider)'"
        "export HOLOSCRIPT_AGENT_MODEL='$($plan.Model)'"
        "export HOLOSCRIPT_AGENT_BRAIN='$($plan.BrainPath)'"
        "export HOLOSCRIPT_AGENT_WALLET='$($plan.Wallet)'"
        "export HOLOSCRIPT_AGENT_X402_BEARER='$($plan.Bearer)'"
        "export HOLOSCRIPT_AGENT_BUDGET_USD_DAY='$($plan.Budget)'"
        "export HOLOSCRIPT_AGENT_SCOPE_TIER='$($plan.Scope)'"
        "export HOLOMESH_TEAM_ID='$env:HOLOMESH_TEAM_ID'"
    )
    if ($plan.Provider -eq 'anthropic')   { $envExports += "export ANTHROPIC_API_KEY='$env:ANTHROPIC_API_KEY'" }
    elseif ($plan.Provider -eq 'openai')  { $envExports += "export OPENAI_API_KEY='$env:OPENAI_API_KEY'" }
    elseif ($plan.Provider -eq 'gemini')  { $envExports += "export GEMINI_API_KEY='$env:GEMINI_API_KEY'" }
    elseif ($plan.Provider -eq 'local-llm') {
        $envExports += "export START_LOCAL_LLM_SERVER='1'"
        $envExports += "export LOCAL_LLM_MODEL='$($plan.Model)'"
    }
    $envBlock = $envExports -join '; '
    $cmd = "$envBlock; chmod +x /root/bootstrap-agent.sh; /root/bootstrap-agent.sh"

    & ssh @sshArgs $remote $cmd 2>&1 | Out-File -Append -FilePath $logFile -Encoding utf8
    $ok = $LASTEXITCODE -eq 0

    "[$(Get-Date -Format o)] [$($plan.Handle)] deploy " + $(if ($ok) { 'OK' } else { 'FAILED' }) |
        Out-File -Append -FilePath $logFile -Encoding utf8

    return @{
        Handle = $plan.Handle
        InstanceId = $plan.InstanceId
        Ok = $ok
        Log = $logFile
    }
}

Write-Host "=== EXECUTING ($($plans.Count) instances, MaxParallel=$MaxParallel) ===" -ForegroundColor Cyan
$results = New-Object System.Collections.ArrayList
$queue = [System.Collections.Queue]::new()
foreach ($p in $plans) { [void]$queue.Enqueue($p) }
$activeJobs = New-Object System.Collections.ArrayList

while ($queue.Count -gt 0 -or $activeJobs.Count -gt 0) {
    # Launch new jobs up to MaxParallel
    while ($activeJobs.Count -lt $MaxParallel -and $queue.Count -gt 0) {
        $plan = $queue.Dequeue()
        Write-Host "  [+] launching deploy #$($plan.Index) -> $($plan.Handle)" -ForegroundColor DarkGray
        $job = Start-Job -ScriptBlock $deployJob -ArgumentList $plan, $SshKey, $bootstrapScript, $LogDir
        [void]$activeJobs.Add([PSCustomObject]@{ Plan = $plan; Job = $job })
    }
    # Drain finished jobs (iterate by index because we mutate)
    $stillRunning = New-Object System.Collections.ArrayList
    foreach ($entry in $activeJobs) {
        if ($entry.Job.State -eq 'Running') {
            [void]$stillRunning.Add($entry)
            continue
        }
        $r = Receive-Job -Job $entry.Job -ErrorAction SilentlyContinue
        $jobError = $entry.Job.ChildJobs[0].JobStateInfo.Reason
        Remove-Job -Job $entry.Job -Force -ErrorAction SilentlyContinue
        if ($null -eq $r) {
            $r = @{ Handle = $entry.Plan.Handle; InstanceId = $entry.Plan.InstanceId; Ok = $false; Log = "(no output; jobError=$jobError)" }
        }
        [void]$results.Add($r)
        $status = if ($r.Ok) { 'OK  ' } else { 'FAIL' }
        Write-Host "  [$status] #$($entry.Plan.Index) $($r.Handle) - log: $($r.Log)" -ForegroundColor $(if ($r.Ok) { 'Green' } else { 'Red' })
    }
    $activeJobs = $stillRunning
    if ($activeJobs.Count -gt 0) { Start-Sleep -Seconds 2 }
}

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "=== SUMMARY ===" -ForegroundColor Cyan
$ok = @($results | Where-Object { $_.Ok }).Count
$fail = @($results | Where-Object { -not $_.Ok }).Count
Write-Host "  $ok / $($results.Count) deploys succeeded"
if ($fail -gt 0) {
    Write-Host "  $fail FAILED - inspect logs in $LogDir" -ForegroundColor Red
}
Write-Host "  Verify mesh state via: vastai show instances; or via /room (next /presence tick should show new agents)"
