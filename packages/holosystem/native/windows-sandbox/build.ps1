$ErrorActionPreference = 'Stop'

$source = Join-Path $PSScriptRoot 'Program.cs'
$outputDirectory = Join-Path (Split-Path $PSScriptRoot -Parent) 'windows-x64'
$output = Join-Path $outputDirectory 'holosystem-sandbox-launcher.exe'
$compiler = Join-Path $env:SystemRoot 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'

if (-not (Test-Path -LiteralPath $compiler -PathType Leaf)) {
  throw 'The Windows .NET Framework AMD64 compiler is unavailable.'
}

New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
& $compiler /nologo /target:exe /platform:x64 /optimize+ /debug- /out:$output $source
if ($LASTEXITCODE -ne 0) {
  throw "Native sandbox launcher compilation failed with exit code $LASTEXITCODE."
}

Get-FileHash -LiteralPath $output -Algorithm SHA256 | Select-Object Path, Hash
