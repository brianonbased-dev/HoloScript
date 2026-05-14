# Mirror paper .tex sources from ai-ecosystem/research/ into HoloScript/research/
# so structural verification commands (wc -l, grep -c, etc.) work locally.
#
# Canonical source of truth: $env:USERPROFILE\.ai-ecosystem\research\*.tex
# Mirror target:            $PSScriptRoot\..\research\*.tex
#
# Run this after editing papers in ai-ecosystem to refresh the local mirror.

$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$SourceDir = Join-Path $env:USERPROFILE ".ai-ecosystem" "research"
$TargetDir = Join-Path $RepoRoot "research"

if (-not (Test-Path $SourceDir)) {
    Write-Error "Source directory not found: $SourceDir`nEnsure ai-ecosystem repo is cloned/clinked at ~/.ai-ecosystem"
}

$files = Get-ChildItem -Path $SourceDir -Filter "*.tex"
$count = 0
foreach ($file in $files) {
    $target = Join-Path $TargetDir $file.Name
    Copy-Item -Path $file.FullName -Destination $target -Force
    Write-Host "Mirrored: $($file.Name)"
    $count++
}

Write-Host "Done. $count files mirrored."
Write-Host "NOTE: Mirrored files are gitignored in HoloScript; commit changes in ai-ecosystem."
