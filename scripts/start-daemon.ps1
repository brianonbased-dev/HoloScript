# HoloDaemon background launcher
# Usage: .\scripts\start-daemon.ps1 [options]
#
# Options (all optional):
#   -Provider   anthropic | xai | openai | ollama  (default: anthropic)
#   -Model      override model name  (default: provider default)
#   -Interval   cycle sleep in seconds  (default: 30)
#   -ProviderRotation  alternate providers by cycle (Claude <-> Grok)
#   -EnvFile    env file path to load API keys from (default: .env)
#   -SkillsDir  path to custom skills dir
#   -Commit     auto-commit daemon improvements  (switch)
#   -Debug      verbose daemon output  (switch)
#
# Examples:
#   .\scripts\start-daemon.ps1
#   .\scripts\start-daemon.ps1 -Provider xai -Model grok-3
#   .\scripts\start-daemon.ps1 -Provider anthropic -ProviderRotation
#   .\scripts\start-daemon.ps1 -Provider anthropic -Interval 60 -Commit

param(
    [string]$Provider      = "anthropic",
    [string]$Model         = "",
    [int]   $Interval      = 30,
    [switch]$ProviderRotation,
    [string]$EnvFile       = ".env",
    [string]$SkillsDir     = "",
    [switch]$Commit,
    [switch]$Debug
)

$RepoRoot   = Split-Path -Parent $PSScriptRoot
$Composition = Join-Path $RepoRoot "compositions\self-improve-daemon.hsplus"
$EnvPath = Join-Path $RepoRoot $EnvFile

if (Test-Path $EnvPath) {
    Get-Content $EnvPath | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith('#') -and $line.Contains('=')) {
            $pair = $line.Split('=', 2)
            $name = $pair[0].Trim()
            if ($name.StartsWith('export ')) {
                $name = $name.Substring(7).Trim()
            }
            $value = $pair[1].Trim().Trim('"').Trim("'")
            if ($name) { [Environment]::SetEnvironmentVariable($name, $value, 'Process') }
        }
    }
}

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
if ($ProviderRotation) { $Args += "--provider-rotation" }
if ($SkillsDir){ $Args += "--skills-dir", $SkillsDir }
if ($Commit)   { $Args += "--commit" }
if ($Debug)    { $Args += "--debug" }

if ($ProviderRotation) {
    if (-not $env:ANTHROPIC_API_KEY) {
        Write-Error "Provider rotation requires ANTHROPIC_API_KEY (missing)."
        exit 1
    }
    if (-not $env:XAI_API_KEY) {
        Write-Error "Provider rotation requires XAI_API_KEY (missing)."
        exit 1
    }
    if (-not $env:OPENAI_API_KEY) {
        Write-Error "Provider rotation requires OPENAI_API_KEY (missing)."
        exit 1
    }
} elseif ($Provider -eq 'anthropic' -and -not $env:ANTHROPIC_API_KEY) {
    Write-Error "Provider anthropic requires ANTHROPIC_API_KEY (missing)."
    exit 1
} elseif ($Provider -eq 'xai' -and -not $env:XAI_API_KEY) {
    Write-Error "Provider xai requires XAI_API_KEY (missing)."
    exit 1
} elseif ($Provider -eq 'openai' -and -not $env:OPENAI_API_KEY) {
    Write-Error "Provider openai requires OPENAI_API_KEY (missing)."
    exit 1
}

$LogDir  = Join-Path $RepoRoot ".holoscript"
$LogFile = Join-Path $LogDir "daemon.log"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

Write-Host ""
Write-Host "  HoloDaemon starting (always-on)" -ForegroundColor Cyan
Write-Host "  Composition : $Composition"       -ForegroundColor Gray
Write-Host "  Provider    : $Provider$(if ($Model) { " / $Model" })"  -ForegroundColor Gray
Write-Host "  Rotation    : $($ProviderRotation.IsPresent)" -ForegroundColor Gray
Write-Host "  Env file    : $EnvPath$(if (-not (Test-Path $EnvPath)) { ' (not found)' })" -ForegroundColor Gray
Write-Host "  Interval    : ${Interval}s"       -ForegroundColor Gray
Write-Host "  Log         : $LogFile"           -ForegroundColor Gray
Write-Host "  Commit      : $($Commit.IsPresent)" -ForegroundColor Gray
Write-Host ""
Write-Host "  Check status any time:"           -ForegroundColor DarkGray
Write-Host "    holoscript daemon status"        -ForegroundColor DarkGray
Write-Host "    holoscript daemon status --json" -ForegroundColor DarkGray
Write-Host ""

# Resolve runner — Start-Process can't launch .cmd files directly, so route via cmd /c
$LocalRunner = Join-Path $RepoRoot "packages\core\src\cli\holoscript-runner.ts"
$DistRunner  = Join-Path $RepoRoot "packages\core\dist\cli\holoscript-runner.js"

$ArgString = ($Args | ForEach-Object { "`"$_`"" }) -join " "

if (Test-Path $DistRunner) {
    $LaunchExe  = "node"
    $LaunchArgs = "`"$DistRunner`" $ArgString"
    Write-Host "  Runner      : dist/cli/holoscript-runner.js" -ForegroundColor Gray
} elseif (Test-Path $LocalRunner) {
    $LaunchExe  = "cmd"
    $LaunchArgs = "/c npx tsx `"$LocalRunner`" $ArgString"
    Write-Host "  Runner      : tsx packages/core/src/cli/holoscript-runner.ts" -ForegroundColor Gray
} else {
    $LaunchExe  = "cmd"
    $LaunchArgs = "/c holoscript $ArgString"
    Write-Host "  Runner      : holoscript (global)" -ForegroundColor Gray
}

Start-Process -FilePath $LaunchExe `
    -ArgumentList $LaunchArgs `
    -RedirectStandardOutput $LogFile `
    -RedirectStandardError  ($LogFile + ".err") `
    -WindowStyle Hidden `
    -WorkingDirectory $RepoRoot `
    -PassThru | ForEach-Object {
        Write-Host "  Daemon PID  : $($_.Id)" -ForegroundColor Green
        $_.Id | Out-File (Join-Path $LogDir "daemon.pid") -Encoding utf8
    }

Write-Host ""
Write-Host "  Daemon launched in background. Tail logs with:" -ForegroundColor DarkGray
Write-Host "    Get-Content '$LogFile' -Wait"                 -ForegroundColor DarkGray
Write-Host ""
