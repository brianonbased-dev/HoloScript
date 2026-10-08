# Publish holoscript to PyPI — HoloCI decides whether this commit may go out.
#
#   .\scripts\publish-pypi.ps1                 # dry run: readiness + build + twine check
#   .\scripts\publish-pypi.ps1 -Publish        # uploads, then verifies what PyPI serves
#   .\scripts\publish-pypi.ps1 -Sha <full-sha> # check a specific commit
#
# The quality decision is NOT made here. publish-readiness-gate.mjs answers one
# question against the repo's declared HoloCI gates (gates.mjs, full profile):
# does THIS sha have a passing verdict? Unknown is a refusal, and there is no
# bypass flag in this script either — if the gate is wrong, fix what it measures.
#
# The 6.0.8 gates meant to guard this, holo-ci/python-honesty and holo-ci/strict-corpus,
# are NOT in the live catalog (@holoscript/holorepo src/ci/gates.mjs). They were parked
# on 2026-10-07 because main still carried 6.0.7's tests, which assert the fake success;
# the parked copy is ai-ecosystem scripts/holo-ci/gates.mjs.bak-20261007-with-6.0.8-gates-parked.
# Until they are restored, HoloCI does not run the Python tests, and the pre-flight below
# is the only check on what this package claims.
#
# The PyPI token never passes through Claude and is never printed. It is read at
# run time from $env:PYPI_API_TOKEN, or a PYPI_API_TOKEN= line in this package's
# .env. With HoloKey, put it in the shell first:
#   $env:PYPI_API_TOKEN = (<your holokey command to read the pypi token>)

param(
  [switch]$Publish,
  [switch]$SkipBuild,
  [string]$Sha,
  [string]$Repo = 'brianonbased-dev/HoloScript'
)

$ErrorActionPreference = 'Stop'
$pkg = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $pkg

# --- 1. the tree must be the tree CI saw -------------------------------------
if (-not $Sha) { $Sha = (git rev-parse HEAD).Trim() }
$dirty = git status --porcelain
if ($dirty) {
  throw "working tree is dirty - CI never saw these changes. Commit and push, let HoloCI run, then publish:`n$dirty"
}

# --- 2. HoloCI readiness ------------------------------------------------------
$holoCi = $env:HOLO_CI_DIR
if (-not $holoCi) { $holoCi = Join-Path $pkg '..\..\..\..\ai-ecosystem\scripts\holo-ci' }
$gate = Join-Path $holoCi 'publish-readiness-gate.mjs'
if (-not (Test-Path $gate)) {
  throw "publish-readiness-gate.mjs not found at $gate. Set HOLO_CI_DIR to your holo-ci directory."
}

Write-Host "== HoloCI readiness for $Sha ==" -ForegroundColor Cyan
node $gate --repo $Repo --sha $Sha
$verdict = $LASTEXITCODE
switch ($verdict) {
  0 { Write-Host 'ready - every declared gate passed' -ForegroundColor Green }
  4 { throw 'HoloCI says FAILED for this commit. Fix the gate, not this script.' }
  5 { throw 'HoloCI has no verdict for this commit (untested). Push it and let the ci lane run.' }
  6 { throw 'HoloCI is still running for this commit. Ask again when it settles.' }
  8 { throw 'HoloCI coverage is PARTIAL - some declared gates never reported. Absence of a verdict is not a verdict.' }
  7 { throw 'Could not read the CI verdict. Never assume pass.' }
  default { throw "publish-readiness-gate exited $verdict" }
}

# --- 3. build + check ---------------------------------------------------------
if ($SkipBuild -and $Publish) {
  throw '-SkipBuild cannot be combined with -Publish: dist/ is git-ignored, so nothing proves an existing wheel came from this commit.'
}
if ($SkipBuild) {
  Write-Host '== build == (skipped, checking dist/ as it stands)' -ForegroundColor Cyan
} else {
  Write-Host '== build ==' -ForegroundColor Cyan
  # Clear old artifacts first, so a failed build cannot leave a stale wheel to check and upload.
  Remove-Item dist/holoscript-6.0.8* -ErrorAction SilentlyContinue
  python -m build
  # Windows PowerShell 5.1 does not stop on a failing native command under ErrorActionPreference.
  if ($LASTEXITCODE -ne 0) { throw 'python -m build failed' }
}
python -m twine check dist/holoscript-6.0.8*
if ($LASTEXITCODE -ne 0) { throw 'twine check failed' }

# --- pre-flight: do the artifact's claims hold when installed? ----------------
# twine check validates the METADATA. It cannot tell you that parse() returns success for
# SQL, which is how 6.0.7 shipped. This installs the wheel into a clean venv with no
# extras - what a user actually gets - and checks every claim the release makes. It runs
# on the dry run too, so you see the verdict before deciding to upload.
Write-Host "== pre-flight: do the artifact's claims hold when installed? ==" -ForegroundColor Cyan
$pf = Join-Path $env:TEMP ("holoscript-preflight-" + [guid]::NewGuid().ToString('N').Substring(0,8))
python -m venv $pf
& (Join-Path $pf 'Scripts\pip.exe') install --quiet --no-cache-dir dist/holoscript-6.0.8-py3-none-any.whl
if ($LASTEXITCODE -ne 0) { throw 'could not install the built wheel into a clean venv' }
& (Join-Path $pf 'Scripts\python.exe') scripts/preflight-release.py --expect 6.0.8
if ($LASTEXITCODE -ne 0) { throw 'pre-flight failed - the built artifact does not hold its own claims. Nothing uploaded.' }

if (-not $Publish) {
  Write-Host ''
  Write-Host 'Dry run complete. Re-run with -Publish to upload.' -ForegroundColor Green
  exit 0
}

# --- 4. upload ----------------------------------------------------------------
$token = $env:PYPI_API_TOKEN
if (-not $token -and (Test-Path '.env')) {
  $line = Select-String -Path '.env' -Pattern '^\s*PYPI_API_TOKEN\s*=' | Select-Object -First 1
  if ($line) { $token = ($line.Line -split '=', 2)[1].Trim().Trim('"').Trim("'") }
}
if (-not $token) {
  throw 'No PyPI token. Set $env:PYPI_API_TOKEN for this shell (from HoloKey or wherever you keep it) and re-run.'
}

Write-Host '== upload ==' -ForegroundColor Cyan
$env:TWINE_USERNAME = '__token__'
$env:TWINE_PASSWORD = $token
try {
  python -m twine upload dist/holoscript-6.0.8*
  if ($LASTEXITCODE -ne 0) { throw 'twine upload failed - check pypi.org/project/holoscript before re-running' }
}
finally {
  Remove-Item Env:TWINE_PASSWORD -ErrorAction SilentlyContinue
  Remove-Item Env:TWINE_USERNAME -ErrorAction SilentlyContinue
}

# --- 5. grade what PyPI actually serves ---------------------------------------
Write-Host '== verifying the published artifact ==' -ForegroundColor Cyan
$tmp = Join-Path $env:TEMP ("holoscript-verify-" + [guid]::NewGuid().ToString('N').Substring(0,8))
python -m venv $tmp
Start-Sleep -Seconds 30   # let PyPI finish processing the upload
& (Join-Path $tmp 'Scripts\pip.exe') install --quiet --no-cache-dir holoscript==6.0.8
& (Join-Path $tmp 'Scripts\python.exe') -c @'
import holoscript, sys
print("published version:", holoscript.__version__)
try:
    holoscript.parse("{{{@@@")
except NotImplementedError:
    print("published package refuses garbage: ok")
else:
    sys.exit("the PUBLISHED package accepts garbage")
'@
if ($LASTEXITCODE -ne 0) { throw 'the published artifact failed its own smoke test' }

Write-Host ''
Write-Host 'Published and verified.' -ForegroundColor Green
Write-Host 'Do not yank 6.0.7 on its own: 6.0.8 needs Python 3.10+, so 3.8/3.9 users would fall back to 6.0.6, which has the same fake parser.'
Write-Host 'Tell Harbor to re-grade: pip install holoscript==6.0.8'
