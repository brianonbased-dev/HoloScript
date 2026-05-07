# Restore Codex hardware shell resolution for Node, Corepack, and pnpm.
#
# Codex Desktop can put an inaccessible WindowsApps-packaged node.exe ahead of
# the real runtime. This script installs lightweight command shims in a stable
# user directory and in the active Codex arg shim directory when present.

[CmdletBinding()]
param(
    [switch]$NoUserPathUpdate
)

$ErrorActionPreference = "Stop"

$NodeRoot = Join-Path $env:ProgramFiles "nodejs"
$NpmRoot = Join-Path $env:APPDATA "npm"
$ShimRoot = Join-Path $env:USERPROFILE ".codex\hardware-bin"
$NodeExe = Join-Path $NodeRoot "node.exe"
$CorepackCmd = Join-Path $NodeRoot "corepack.cmd"
$PnpmCmd = Join-Path $NpmRoot "pnpm.cmd"

foreach ($required in @($NodeExe, $CorepackCmd, $PnpmCmd)) {
    if (-not (Test-Path -LiteralPath $required)) {
        throw "Required runtime component not found: $required"
    }
}

function Split-PathList {
    param([string]$Value)
    if ([string]::IsNullOrWhiteSpace($Value)) { return @() }
    return $Value -split ';' | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
}

function Get-CodexArgShimRoot {
    Split-PathList $env:PATH |
        Where-Object { $_ -match '\\\.codex\\tmp\\arg0\\codex-arg' -and (Test-Path -LiteralPath $_) } |
        Select-Object -First 1
}

function Write-CmdShim {
    param(
        [string]$Root,
        [string]$Name,
        [string]$Body
    )

    New-Item -ItemType Directory -Force -Path $Root | Out-Null
    Set-Content -LiteralPath (Join-Path $Root $Name) -Value $Body -Encoding ASCII
}

function Install-Shims {
    param([string]$Root)

    Write-CmdShim -Root $Root -Name "node.cmd" -Body @"
@echo off
"$NodeExe" %*
"@

    Write-CmdShim -Root $Root -Name "corepack.cmd" -Body @"
@echo off
set "PATH=$NodeRoot;$NpmRoot;%PATH%"
call "$CorepackCmd" %*
"@

    Write-CmdShim -Root $Root -Name "pnpm.cmd" -Body @"
@echo off
set "PATH=$NodeRoot;$NpmRoot;%PATH%"
call "$PnpmCmd" %*
"@
}

$ShimRoots = New-Object System.Collections.Generic.List[string]
$ShimRoots.Add($ShimRoot)
$ArgShimRoot = Get-CodexArgShimRoot
if ($ArgShimRoot) { $ShimRoots.Add($ArgShimRoot) }

foreach ($root in $ShimRoots) {
    Install-Shims -Root $root
}

$ProcessPrepend = @($ShimRoot, $NodeRoot, $NpmRoot)
if ($ArgShimRoot) { $ProcessPrepend = @($ArgShimRoot) + $ProcessPrepend }
$ExistingProcessPath = Split-PathList $env:PATH
$env:PATH = (($ProcessPrepend + $ExistingProcessPath) | Select-Object -Unique) -join ';'

if (-not $NoUserPathUpdate) {
    $UserPath = Split-PathList ([Environment]::GetEnvironmentVariable('Path', 'User'))
    $UserPrepend = @($ShimRoot, $NodeRoot, $NpmRoot)
    $NewUserPath = (($UserPrepend + $UserPath) | Select-Object -Unique) -join ';'
    [Environment]::SetEnvironmentVariable('Path', $NewUserPath, 'User')
}

$nodeVersion = (& node -v).Trim()
$corepackVersion = (& corepack --version).Trim()
$pnpmVersion = (& pnpm -v).Trim()

Write-Host "Codex hardware PATH restored"
Write-Host "node: $nodeVersion"
Write-Host "corepack: $corepackVersion"
Write-Host "pnpm: $pnpmVersion"
Write-Host "shim_root: $ShimRoot"
if ($ArgShimRoot) { Write-Host "active_codex_arg_shim_root: $ArgShimRoot" }
