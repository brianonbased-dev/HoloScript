$ErrorActionPreference = 'Stop'

$source = Join-Path $PSScriptRoot 'Program.cs'
$outputDirectory = Join-Path (Split-Path $PSScriptRoot -Parent) 'windows-x64'
$output = Join-Path $outputDirectory 'holosystem-sandbox-launcher.exe'
$canarySource = Join-Path $PSScriptRoot 'Canary.c'
$canaryOutput = Join-Path $outputDirectory 'holosystem-appcontainer-canary.exe'
$compiler = Join-Path $env:SystemRoot 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'

if (-not (Test-Path -LiteralPath $compiler -PathType Leaf)) {
  throw 'The Windows .NET Framework AMD64 compiler is unavailable.'
}

New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
& $compiler /nologo /target:exe /platform:x64 /optimize+ /debug- /out:$output $source
if ($LASTEXITCODE -ne 0) {
  throw "Native sandbox launcher compilation failed with exit code $LASTEXITCODE."
}

$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
$visualStudio = & $vswhere -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if (-not $visualStudio) {
  throw 'The Visual C++ AMD64 build tools are unavailable.'
}
$msvc = Get-ChildItem (Join-Path $visualStudio 'VC\Tools\MSVC') -Directory | Sort-Object Name -Descending | Select-Object -First 1
$kitsRoot = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits\10'
$kit = Get-ChildItem (Join-Path $kitsRoot 'Include') -Directory | Sort-Object Name -Descending | Select-Object -First 1
if (-not $msvc -or -not $kit) {
  throw 'The Visual C++ or Windows SDK directories are unavailable.'
}
$env:Path = "$(Join-Path $msvc.FullName 'bin\Hostx64\x64');$env:Path"
$env:Include = @(
  (Join-Path $msvc.FullName 'include'),
  (Join-Path $kit.FullName 'ucrt'),
  (Join-Path $kit.FullName 'shared'),
  (Join-Path $kit.FullName 'um')
) -join ';'
$env:Lib = @(
  (Join-Path $msvc.FullName 'lib\x64'),
  (Join-Path $kitsRoot "Lib\$($kit.Name)\ucrt\x64"),
  (Join-Path $kitsRoot "Lib\$($kit.Name)\um\x64")
) -join ';'
& cl.exe /nologo /O2 /MT /W4 /WX /DUNICODE /D_UNICODE "/Fe:$canaryOutput" $canarySource /link ws2_32.lib advapi32.lib
if ($LASTEXITCODE -ne 0) {
  throw "Native AppContainer canary compilation failed with exit code $LASTEXITCODE."
}

Get-FileHash -LiteralPath $output, $canaryOutput -Algorithm SHA256 | Select-Object Path, Hash
