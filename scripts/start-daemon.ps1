# HoloDaemon background launcher
# Usage: .\scripts\start-daemon.ps1 [options]
#
# Options (all optional):
#   -Provider   anthropic | xai | openai | ollama  (default: anthropic)
#   -Model      override model name  (default: provider default)
#   -Interval   cycle sleep in seconds  (default: 30)
#   -SkillsDir  path to custom skills dir
#   -Commit     auto-commit daemon improvements  (switch)
#   -Debug      verbose daemon output  (switch)
#
# Examples:
#   .\scripts\start-daemon.ps1
#   .\scripts\start-daemon.ps1 -Provider xai -Model grok-3
#   .\scripts\start-daemon.ps1 -Provider anthropic -Interval 60 -Commit

param(
    [string]$Provider      = "anthropic",
    [string]$Model         = "",
    [int]   $Interval      = 30,
    [string]$SkillsDir     = "",
    [switch]$Commit,
    [switch]$Debug
)

$RepoRoot   = Split-Path -Parent $PSScriptRoot
$Composition = Join-Path $RepoRoot "compositions\self-improve-daemon.hsplus"

if (-not (Test-Path $Composition)) {
    Write-Error "Composition not found: $Composition"
    exit 1
}

# Build arg list
$Args = @(
    "daemon", $Composition,
    "--provider", $Provider,
    "--always-on",
    "--cycle-interval-sec", $Interval
)

if ($Model)    { $Args += "--model", $Model }
if ($SkillsDir){ $Args += "--skills-dir", $SkillsDir }
if ($Commit)   { $Args += "--commit" }
if ($Debug)    { $Args += "--debug" }

$LogDir  = Join-Path $RepoRoot ".holoscript"
$LogFile = Join-Path $LogDir "daemon.log"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

Write-Host ""
Write-Host "  HoloDaemon starting (always-on)" -ForegroundColor Cyan
Write-Host "  Composition : $Composition"       -ForegroundColor Gray
Write-Host "  Provider    : $Provider$(if ($Model) { " / $Model" })"  -ForegroundColor Gray
Write-Host "  Interval    : ${Interval}s"       -ForegroundColor Gray
Write-Host "  Log         : $LogFile"           -ForegroundColor Gray
Write-Host "  Commit      : $($Commit.IsPresent)" -ForegroundColor Gray
Write-Host ""
Write-Host "  Check status any time:"           -ForegroundColor DarkGray
Write-Host "    holoscript daemon status"        -ForegroundColor DarkGray
Write-Host "    holoscript daemon status --json" -ForegroundColor DarkGray
Write-Host ""

Start-Process -FilePath "holoscript" `
    -ArgumentList $Args `
    -RedirectStandardOutput $LogFile `
    -RedirectStandardError  "$LogFile.err" `
    -WindowStyle Hidden `
    -PassThru | ForEach-Object {
        Write-Host "  Daemon PID  : $($_.Id)" -ForegroundColor Green
        $_.Id | Out-File (Join-Path $LogDir "daemon.pid") -Encoding utf8
    }

Write-Host ""
Write-Host "  Daemon launched in background. Tail logs with:" -ForegroundColor DarkGray
Write-Host "    Get-Content $LogFile -Wait"                   -ForegroundColor DarkGray
Write-Host ""
