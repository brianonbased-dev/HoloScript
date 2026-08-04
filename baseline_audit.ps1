[CmdletBinding()]
param(
  [switch]$Build,
  [switch]$Json
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$script = Join-Path $root 'scripts\holo-ci\baseline-audit.mjs'
$forwardedArgs = @()
if ($Build) { $forwardedArgs += '--build' }
if ($Json) { $forwardedArgs += '--json' }

& node $script @forwardedArgs
exit $LASTEXITCODE
