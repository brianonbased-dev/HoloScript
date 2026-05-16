#!/usr/bin/env pwsh
# safe-commit.ps1 -- Windows-native entrypoint for scripts/safe-commit.sh.
#
# This wrapper deliberately resolves Git-for-Windows Bash instead of relying on
# a generic `bash` lookup, which can route through WSL on Windows hosts.

[CmdletBinding()]
param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]] $RemainingArgs
)

$ErrorActionPreference = 'Stop'
if (Get-Variable -Name PSNativeCommandUseErrorActionPreference -Scope Local -ErrorAction SilentlyContinue) {
  $PSNativeCommandUseErrorActionPreference = $false
}

function Find-GitBash {
  if ($env:SAFE_COMMIT_BASH) {
    $candidate = [Environment]::ExpandEnvironmentVariables($env:SAFE_COMMIT_BASH)
    if (Test-Path -LiteralPath $candidate -PathType Leaf) {
      return (Resolve-Path -LiteralPath $candidate).Path
    }
    throw "SAFE_COMMIT_BASH is set but does not point to a file: $candidate"
  }

  $candidates = @(
    "$env:ProgramFiles\Git\bin\bash.exe",
    "$env:ProgramFiles\Git\usr\bin\bash.exe",
    "${env:ProgramFiles(x86)}\Git\bin\bash.exe",
    "${env:ProgramFiles(x86)}\Git\usr\bin\bash.exe"
  ) | Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Leaf) }

  if ($candidates.Count -gt 0) {
    return (Resolve-Path -LiteralPath $candidates[0]).Path
  }

  $pathBash = Get-Command bash.exe -ErrorAction SilentlyContinue
  if ($pathBash -and $pathBash.Source -match '\\Git\\') {
    return $pathBash.Source
  }

  throw @'
Git-for-Windows bash.exe was not found.

Install Git for Windows or set SAFE_COMMIT_BASH to an explicit bash.exe path.
Do not rely on C:\Windows\System32\bash.exe; that usually enters WSL and can
mis-handle this repository's Windows paths.
'@
}

function Convert-ToGitBashPath([string] $Path) {
  $full = [System.IO.Path]::GetFullPath($Path)
  if ($full -notmatch '^[A-Za-z]:\\') {
    return ($full -replace '\\', '/')
  }

  $drive = $full.Substring(0, 1).ToLowerInvariant()
  $rest = $full.Substring(2) -replace '\\', '/'
  return "/$drive$rest"
}

function Normalize-CommitPath([string] $Arg, [string] $RepoRoot) {
  $candidate = $Arg
  if (-not [System.IO.Path]::IsPathRooted($candidate)) {
    $candidate = Join-Path $RepoRoot $candidate
  }

  if (Test-Path -LiteralPath $candidate) {
    $resolved = (Resolve-Path -LiteralPath $candidate).Path
    if ($resolved.StartsWith($RepoRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
      $relative = [System.IO.Path]::GetRelativePath($RepoRoot, $resolved)
      return ($relative -replace '\\', '/')
    }
  }

  return ($Arg -replace '\\', '/')
}

$repoRoot = (& git rev-parse --show-toplevel 2>$null)
if ($LASTEXITCODE -ne 0 -or -not $repoRoot) {
  Write-Error '[safe-commit.ps1] not in a git repo'
  exit 1
}
$repoRoot = [System.IO.Path]::GetFullPath($repoRoot.Trim())

$bash = Find-GitBash
$scriptPath = Join-Path $repoRoot 'scripts\safe-commit.sh'
if (-not (Test-Path -LiteralPath $scriptPath -PathType Leaf)) {
  Write-Error "[safe-commit.ps1] missing Bash implementation: $scriptPath"
  exit 1
}

$normalizedArgs = New-Object System.Collections.Generic.List[string]
$expectFlagValue = $false
$flagsWithValues = @(
  '-m', '--message', '-F', '--file', '--author', '--date', '-C', '--reuse-message',
  '-c', '--reedit-message', '--cleanup', '--gpg-sign', '--no-gpg-sign', '-S'
)

foreach ($arg in $RemainingArgs) {
  if ($expectFlagValue) {
    $normalizedArgs.Add($arg)
    $expectFlagValue = $false
    continue
  }

  if ($flagsWithValues -contains $arg) {
    $normalizedArgs.Add($arg)
    $expectFlagValue = $true
    continue
  }

  if ($arg.StartsWith('-')) {
    $normalizedArgs.Add($arg)
    continue
  }

  $normalizedArgs.Add((Normalize-CommitPath $arg $repoRoot))
}

$bashScript = Convert-ToGitBashPath $scriptPath

Push-Location $repoRoot
$exitCode = 0
try {
  & $bash $bashScript @normalizedArgs
  $exitCode = $LASTEXITCODE
}
finally {
  Pop-Location
}

exit $exitCode
