# Mirror IN-PROGRESS paper .tex sources from ai-ecosystem/research/ into
# HoloScript/research/ so structural verification commands (wc -l, grep -c, etc.)
# work locally.
#
# Lifecycle homes (founder ruling 2026-05-25):
#   - In-progress / draft papers + research  -> ai-ecosystem is canonical (edit there);
#     this script mirrors them into HoloScript for local verification.
#   - FINISHED + SUBMITTED papers            -> HoloScript is canonical (they LIVE here).
#     They are EXCLUDED below so the ai-ecosystem mirror never overwrites the
#     submitted artifact. Edit finished papers in HoloScript, not ai-ecosystem.
#
# Canonical source of truth (in-progress): $env:USERPROFILE\.ai-ecosystem\research\*.tex
# Mirror target:                           $PSScriptRoot\..\research\*.tex
#
# When a paper is submitted, ADD its filename to $FinishedSubmitted below so the
# mirror stops clobbering its HoloScript-canonical copy.

$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$SourceDir = Join-Path $env:USERPROFILE ".ai-ecosystem" "research"
$TargetDir = Join-Path $RepoRoot "research"

# Finished + submitted papers: HoloScript-canonical, NOT mirrored from ai-ecosystem.
$FinishedSubmitted = @(
    "trust-by-construction-paper.tex"   # IEEE TVCG — submitted 2026-05-17, under review
)

if (-not (Test-Path $SourceDir)) {
    Write-Error "Source directory not found: $SourceDir`nEnsure ai-ecosystem repo is cloned/clinked at ~/.ai-ecosystem"
}

$files = Get-ChildItem -Path $SourceDir -Filter "*.tex"
$count = 0
$skipped = 0
foreach ($file in $files) {
    if ($FinishedSubmitted -contains $file.Name) {
        Write-Host "SKIP (HoloScript-canonical, finished+submitted): $($file.Name)"
        $skipped++
        continue
    }
    $target = Join-Path $TargetDir $file.Name
    Copy-Item -Path $file.FullName -Destination $target -Force
    Write-Host "Mirrored: $($file.Name)"
    $count++
}

Write-Host "Done. $count files mirrored, $skipped finished+submitted skipped (HoloScript-canonical)."
Write-Host "NOTE: In-progress mirrors are gitignored in HoloScript; commit in-progress changes in ai-ecosystem."
Write-Host "NOTE: Finished+submitted papers are canonical in HoloScript; edit them here, not in ai-ecosystem."
