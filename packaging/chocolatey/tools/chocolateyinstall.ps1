# HoloScript Chocolatey Installation Script

$ErrorActionPreference = 'Stop'

$packageName = 'holoscript'
$toolsDir = "$(Split-Path -parent $MyInvocation.MyCommand.Definition)"
$version = '3.0.0'

# Download URLs for Windows binaries
$url64 = "https://github.com/brianonbased-dev/HoloScript/releases/download/v$version/holoscript-win32-x64.zip"

$packageArgs = @{
  packageName    = $packageName
  unzipLocation  = $toolsDir
  url64bit       = $url64
  checksum64     = 'TODO_CALCULATE_CHECKSUM'
  checksumType64 = 'sha256'
}

# Download and extract
Install-ChocolateyZipPackage @packageArgs

# Add to PATH
$binPath = Join-Path $toolsDir 'bin'
Install-ChocolateyPath -PathToInstall $binPath -PathType 'Machine'

# Verify installation
$holoscriptExe = Join-Path $binPath 'holoscript.exe'
if (Test-Path $holoscriptExe) {
  Write-Host "HoloScript installed successfully!" -ForegroundColor Green
  Write-Host "Run 'holoscript --version' to verify." -ForegroundColor Green
} else {
  throw "Installation failed: holoscript.exe not found"
}
