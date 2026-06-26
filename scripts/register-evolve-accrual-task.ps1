# register-evolve-accrual-task.ps1 — register the I.023 corpus-accrual daemon as a
# WINDOWLESS (S4U) Windows scheduled task. RUN ELEVATED (S4U needs the batch-logon
# right → admin). Idempotent (-Force re-registers). The ensure-windowless-tasks.ps1
# healer recognizes it (name matches the ecosystem regex) and keeps it S4U.
#
#   pwsh -File scripts\register-evolve-accrual-task.ps1            # default hourly
#   pwsh -File scripts\register-evolve-accrual-task.ps1 -IntervalHours 2
#
# Kill:  Unregister-ScheduledTask -TaskName HoloScript-EvolveAccrual -Confirm:$false
# Status: Get-ScheduledTaskInfo -TaskName HoloScript-EvolveAccrual
[CmdletBinding()]
param(
  [int] $IntervalHours = 1,
  [string] $TaskName = 'HoloScript-EvolveAccrual'
)
$ErrorActionPreference = 'Stop'

# Elevation gate — S4U registration is denied for a standard token.
$principalCheck = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principalCheck.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Write-Error 'Run this ELEVATED (Administrator). S4U/windowless registration needs the batch-logon right.'
  exit 1
}

$nodePath = (Get-Command node -ErrorAction Stop).Source
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$daemon = Join-Path $repoRoot 'scripts\evolve-accrual-daemon.mjs'
if (-not (Test-Path $daemon)) { Write-Error "daemon not found: $daemon"; exit 1 }

# Config: read from User env (set this BEFORE registering). The sovereign-local inference
# endpoint is REQUIRED and explicit — no hardcoded fallback (it must point at real sovereign
# metal: the box's own Ollama or a fleet node), matching the daemon's own require-or-fatal.
function Env-Or([string]$k, [string]$d) {
  $v = [Environment]::GetEnvironmentVariable($k, 'User'); if ([string]::IsNullOrWhiteSpace($v)) { $d } else { $v }
}
function Env-Required([string]$k) {
  $v = [Environment]::GetEnvironmentVariable($k, 'User')
  if ([string]::IsNullOrWhiteSpace($v)) {
    Write-Error "Set the User env var $k first (the sovereign-local inference endpoint / corpus path), e.g.: [Environment]::SetEnvironmentVariable('$k','<value>','User')"
    exit 1
  }
  $v
}
$corpus = Env-Required 'HOLOSCRIPT_AGENT_EVOLVE_CORPUS'
$ollama = Env-Required 'HOLOSCRIPT_AGENT_EVOLVE_OLLAMA_URL'
$model  = Env-Or 'HOLOSCRIPT_AGENT_EVOLVE_MODEL' 'qwen3:4b-instruct'
$maxTk  = Env-Or 'HOLOSCRIPT_AGENT_EVOLVE_MAX_TICKS' '3'
# Persist config at User scope so the S4U task (running as this user) inherits it.
foreach ($kv in @{ HOLOSCRIPT_AGENT_EVOLVE_CORPUS=$corpus; HOLOSCRIPT_AGENT_EVOLVE_OLLAMA_URL=$ollama; HOLOSCRIPT_AGENT_EVOLVE_MODEL=$model; HOLOSCRIPT_AGENT_EVOLVE_MAX_TICKS=$maxTk }.GetEnumerator()) {
  [Environment]::SetEnvironmentVariable($kv.Key, $kv.Value, 'User')
}

$action = New-ScheduledTaskAction -Execute $nodePath -Argument "`"$daemon`"" -WorkingDirectory $repoRoot
$trigger = New-ScheduledTaskTrigger -Once -At ((Get-Date).AddMinutes(2)) -RepetitionInterval (New-TimeSpan -Hours $IntervalHours)
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType S4U -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -Hidden -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 10) -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force `
  -Description "I.023 executor: $IntervalHours-hourly gated HoloScript corpus accrual via $model (`$0 local). Kill: Unregister-ScheduledTask -TaskName $TaskName -Confirm:`$false" | Out-Null

$t = Get-ScheduledTask -TaskName $TaskName
Write-Host ("REGISTERED {0}: state={1} logon={2} hidden={3} every={4}h corpus={5}" -f $TaskName, $t.State, $t.Principal.LogonType, $t.Settings.Hidden, $IntervalHours, $corpus)
Write-Host "Test now:  Start-ScheduledTask -TaskName $TaskName ; Start-Sleep 10 ; Get-ScheduledTaskInfo -TaskName $TaskName | Select LastTaskResult,LastRunTime"
