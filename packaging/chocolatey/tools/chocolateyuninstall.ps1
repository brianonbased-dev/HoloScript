# HoloScript Chocolatey Uninstallation Script

$ErrorActionPreference = 'Stop'

$packageName = 'holoscript'
$toolsDir = "$(Split-Path -parent $MyInvocation.MyCommand.Definition)"
$binPath = Join-Path $toolsDir 'bin'

# Remove from PATH
Uninstall-ChocolateyPath -PathToUninstall $binPath -PathType 'Machine'

# Clean up files
if (Test-Path $toolsDir) {
  Remove-Item -Path $toolsDir -Recurse -Force
  Write-Host "HoloScript uninstalled successfully!" -ForegroundColor Green
}
