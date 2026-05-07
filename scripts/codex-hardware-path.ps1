# Restore Codex hardware shell resolution for Node, Corepack, and pnpm.
#
# Codex Desktop can put an inaccessible WindowsApps-packaged node.exe ahead of
# the real runtime. This script installs lightweight command shims in a stable
# user directory and in the active Codex arg shim directory when present.

[CmdletBinding()]
param(
    [string]$NodeGypPython,
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

function Test-NodeGypPython {
    param([string]$PythonExe)

    if ([string]::IsNullOrWhiteSpace($PythonExe)) { return $false }
    if (-not (Test-Path -LiteralPath $PythonExe)) { return $false }

    $probe = @"
import sys
import setuptools
import distutils
version = sys.version_info[:2]
raise SystemExit(0 if version in ((3, 11), (3, 12)) else 1)
"@

    try {
        & $PythonExe -c $probe *> $null
        return $LASTEXITCODE -eq 0
    } catch {
        return $false
    }
}

function Resolve-PythonFromLauncher {
    param([string]$Version)

    $probe = @"
import sys
import setuptools
import distutils
version = sys.version_info[:2]
if version not in ((3, 11), (3, 12)):
    raise SystemExit(1)
print(sys.executable)
"@

    try {
        $output = & py "-$Version" -c $probe 2>$null
    } catch {
        return $null
    }
    if ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace($output)) {
        $candidate = ($output | Select-Object -First 1).Trim()
        if (Test-NodeGypPython $candidate) { return $candidate }
    }

    return $null
}

function Resolve-NodeGypPython {
    param([string]$RequestedPython)

    if (-not [string]::IsNullOrWhiteSpace($RequestedPython)) {
        if (Test-NodeGypPython $RequestedPython) {
            return (Resolve-Path -LiteralPath $RequestedPython).Path
        }
        throw "Requested node-gyp Python is not Python 3.11/3.12 with setuptools/distutils: $RequestedPython"
    }

    foreach ($version in @("3.12", "3.11")) {
        $fromLauncher = Resolve-PythonFromLauncher $version
        if ($fromLauncher) { return $fromLauncher }
    }

    $candidates = @(
        (Join-Path $env:LOCALAPPDATA "Programs\Python\Python312\python.exe"),
        (Join-Path $env:LOCALAPPDATA "Programs\Python\Python311\python.exe"),
        "C:\Python312\python.exe",
        "C:\Python311\python.exe"
    )

    $uvPythonRoot = Join-Path $env:APPDATA "uv\python"
    if (Test-Path -LiteralPath $uvPythonRoot) {
        $uvCandidates = Get-ChildItem -LiteralPath $uvPythonRoot -Recurse -Filter python.exe -ErrorAction SilentlyContinue |
            Where-Object { $_.FullName -match 'cpython-3\.1[12]\.' } |
            Sort-Object FullName |
            ForEach-Object { $_.FullName }
        $candidates += $uvCandidates
    }

    foreach ($candidate in $candidates | Select-Object -Unique) {
        if (Test-NodeGypPython $candidate) {
            return (Resolve-Path -LiteralPath $candidate).Path
        }
    }

    throw "No node-gyp-safe Python found. Install Python 3.11/3.12 with setuptools, or pass -NodeGypPython <python.exe>."
}

$ResolvedNodeGypPython = Resolve-NodeGypPython $NodeGypPython
$env:npm_config_python = $ResolvedNodeGypPython

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

function Convert-ToShPath {
    param([string]$Path)
    return $Path.Replace('\', '/')
}

function Write-ShShim {
    param(
        [string]$Root,
        [string]$Name,
        [string]$Body
    )

    New-Item -ItemType Directory -Force -Path $Root | Out-Null
    $target = Join-Path $Root $Name
    Set-Content -LiteralPath $target -Value $Body -Encoding ASCII
}

function Install-Shims {
    param([string]$Root)

    $NodeExeSh = Convert-ToShPath $NodeExe
    $NodeRootSh = Convert-ToShPath $NodeRoot
    $NpmRootSh = Convert-ToShPath $NpmRoot
    $CorepackCmdSh = Convert-ToShPath $CorepackCmd
    $PnpmCmdSh = Convert-ToShPath $PnpmCmd
    $NodeGypPythonSh = Convert-ToShPath $ResolvedNodeGypPython

    Write-CmdShim -Root $Root -Name "node.cmd" -Body @"
@echo off
"$NodeExe" %*
"@

    Write-CmdShim -Root $Root -Name "corepack.cmd" -Body @"
@echo off
set "npm_config_python=$ResolvedNodeGypPython"
set "PATH=$NodeRoot;$NpmRoot;%PATH%"
call "$CorepackCmd" %*
"@

    Write-CmdShim -Root $Root -Name "pnpm.cmd" -Body @"
@echo off
set "npm_config_python=$ResolvedNodeGypPython"
set "PATH=$NodeRoot;$NpmRoot;%PATH%"
call "$PnpmCmd" %*
"@

    Write-ShShim -Root $Root -Name "node" -Body @"
#!/usr/bin/env sh
exec "$NodeExeSh" "`$@"
"@

    Write-ShShim -Root $Root -Name "corepack" -Body @"
#!/usr/bin/env sh
export npm_config_python="$NodeGypPythonSh"
export PATH="${NodeRootSh}:${NpmRootSh}:`$PATH"
exec "$CorepackCmdSh" "`$@"
"@

    Write-ShShim -Root $Root -Name "pnpm" -Body @"
#!/usr/bin/env sh
export npm_config_python="$NodeGypPythonSh"
export PATH="${NodeRootSh}:${NpmRootSh}:`$PATH"
exec "$PnpmCmdSh" "`$@"
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
    [Environment]::SetEnvironmentVariable('npm_config_python', $ResolvedNodeGypPython, 'User')
}

$nodeVersion = (& node -v).Trim()
$corepackVersion = (& corepack --version).Trim()
$pnpmVersion = (& pnpm -v).Trim()

Write-Host "Codex hardware PATH restored"
Write-Host "node: $nodeVersion"
Write-Host "corepack: $corepackVersion"
Write-Host "pnpm: $pnpmVersion"
Write-Host "node-gyp-python: $ResolvedNodeGypPython"
Write-Host "shim_root: $ShimRoot"
if ($ArgShimRoot) { Write-Host "active_codex_arg_shim_root: $ArgShimRoot" }
