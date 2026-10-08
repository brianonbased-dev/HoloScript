# Publish holoscript to PyPI - HoloCI decides whether this commit may go out.
#
#   .\scripts\publish-pypi.ps1               # dry run: build HEAD, pre-flight it, ask HoloCI
#   .\scripts\publish-pypi.ps1 -Sha <sha>    # dry run against another commit
#   .\scripts\publish-pypi.ps1 -Publish      # upload HEAD's wheel, then verify what pypi.org serves
#
# What goes up is tied to the commit HoloCI judged, by construction:
#   - The wheel is built from `git archive <sha>`, never from the working tree. Local
#     edits, git-ignored files and another agent switching branches cannot reach it.
#   - With -Publish the commit must be HEAD and already on origin/main. The repo is
#     pinned to brianonbased-dev/HoloScript; there is no -Repo.
#   - Only the wheel is uploaded (no sdist), and only if its sha256 still matches the
#     hash recorded when pre-flight installed it.
#   - The upload target is pinned to upload.pypi.org. Afterwards the wheel is downloaded
#     back from pypi.org/simple and its sha256 compared again before it is pre-flighted.
#
# The quality decision is NOT made here. publish-readiness-gate.mjs answers one
# question against the repo's declared HoloCI gates (full profile): does THIS sha have
# a passing verdict? Unknown is a refusal, and there is no bypass flag in this script
# either - if the gate is wrong, fix what it measures. With -Publish the gate must come
# from its default location (HOLO_CI_DIR and HOLO_CI_RUN_PROOF_DIR are refused) and
# that checkout's HoloCI paths must have no uncommitted changes.
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
  [string]$Sha
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$Repo = 'brianonbased-dev/HoloScript'   # pinned on purpose: not a parameter
$Version = '6.0.8'
$PypiUpload = 'https://upload.pypi.org/legacy/'
$PypiIndex = 'https://pypi.org/simple'
$pkg = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

function Invoke-Native {
  # Run a native command, return its stdout, throw "$What (exit N)" if it fails.
  # Windows PowerShell 5.1 does not stop on a failing native command, and under
  # 'Stop' it can turn a command's stderr into a terminating error; both are handled here.
  param([Parameter(Mandatory)][string]$What, [Parameter(Mandatory)][scriptblock]$Command)
  $saved = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try { $out = & $Command } finally { $ErrorActionPreference = $saved }
  if ($LASTEXITCODE -ne 0) { throw "$What (exit $LASTEXITCODE)" }
  return $out
}

function Get-Sha256([string]$Path) {
  return (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash.ToLowerInvariant()
}

# --- 1. which commit ---------------------------------------------------------------
$root = ([string](Invoke-Native 'git rev-parse --show-toplevel failed' { git -C $pkg rev-parse --show-toplevel })).Trim()
$head = ([string](Invoke-Native 'git rev-parse HEAD failed' { git -C $root rev-parse HEAD })).Trim()
$want = $Sha
if (-not $want) { $want = $head }
$Sha = ([string](Invoke-Native "$want is not a commit in this checkout" { git -C $root rev-parse --verify --quiet "$want^{commit}" })).Trim()

if ($Publish) {
  if ($Sha -ne $head) {
    throw "-Publish uploads HEAD only. $($Sha) is not HEAD ($($head)). Check out the commit you mean to publish."
  }
  if ($env:HOLO_CI_DIR) {
    throw 'HOLO_CI_DIR is set. With -Publish the readiness gate must come from its default location. Remove HOLO_CI_DIR and re-run.'
  }
  if ($env:HOLO_CI_RUN_PROOF_DIR) {
    throw 'HOLO_CI_RUN_PROOF_DIR is set. With -Publish the gate reads run proofs from its default location. Remove it and re-run.'
  }
  Write-Host '== is this commit on origin/main? ==' -ForegroundColor Cyan
  Invoke-Native 'git fetch origin main failed' { git -C $root fetch -q origin main } | Out-Null
  $saved = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try { git -C $root merge-base --is-ancestor $Sha origin/main } finally { $ErrorActionPreference = $saved }
  switch ($LASTEXITCODE) {
    0 { Write-Host "$($Sha) is on origin/main" -ForegroundColor Green }
    1 { throw "$($Sha) is not on origin/main. Publish only what has merged." }
    default { throw "git merge-base --is-ancestor failed (exit $LASTEXITCODE)" }
  }
}

# Uncommitted changes never reach the wheel (it is built from the commit), so a dirty
# package is refused on -Publish only because the operator may think they are shipping.
$dirty = Invoke-Native 'git status failed - refusing rather than guessing the tree is clean' {
  git -C $root status --porcelain -- packages/python-bindings
}
if ($dirty) {
  $msg = "packages/python-bindings has uncommitted changes. They are NOT in the wheel, which is built from $($Sha):`n" + (@($dirty) -join "`n")
  if ($Publish) { throw $msg } else { Write-Warning $msg }
}

# --- 2. find the readiness gate before spending time on a build ----------------------
if ($env:HOLO_CI_DIR) {
  $holoCi = $env:HOLO_CI_DIR
  Write-Warning "using HOLO_CI_DIR=$($env:HOLO_CI_DIR) (dry run only; -Publish refuses it)"
} else {
  $holoCi = Join-Path $pkg '..\..\..\..\ai-ecosystem\scripts\holo-ci'
}
$gate = Join-Path $holoCi 'publish-readiness-gate.mjs'
if (-not (Test-Path -LiteralPath $gate)) {
  throw "publish-readiness-gate.mjs not found at $gate."
}
$ciRoot = ([string](Invoke-Native "could not find the git checkout that holds $holoCi" { git -C $holoCi rev-parse --show-toplevel })).Trim()
$ciDirty = Invoke-Native "git status failed in $ciRoot - refusing rather than guessing the gate is clean" {
  git -C $ciRoot status --porcelain -- scripts/holo-ci packages/holorepo/src/ci config/holo-ci
}
if ($ciDirty) {
  $msg = "the HoloCI checkout at $ciRoot has uncommitted changes in its gate paths, so the gate set judging this commit is not one anybody reviewed:`n" + (@($ciDirty) -join "`n")
  if ($Publish) { throw $msg } else { Write-Warning $msg }
}

# --- 3. build the wheel from the commit, not the working tree -------------------------
Write-Host "== build: wheel from git archive $($Sha) ==" -ForegroundColor Cyan
$work = Join-Path ([IO.Path]::GetTempPath()) ('holoscript-release-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
$srcRoot = Join-Path $work 'src'
$dist = Join-Path $work 'dist'
New-Item -ItemType Directory -Path $srcRoot, $dist -Force | Out-Null
$zip = Join-Path $work 'src.zip'
Invoke-Native 'git archive failed' { git -c core.autocrlf=false -C $root archive --format=zip -o $zip $Sha packages/python-bindings } | Out-Null
Expand-Archive -LiteralPath $zip -DestinationPath $srcRoot
$src = Join-Path $srcRoot 'packages\python-bindings'
Invoke-Native 'python -m build failed' { python -m build --wheel --outdir $dist $src } | Out-Host

$wheelName = "holoscript-$Version-py3-none-any.whl"
$built = @(Get-ChildItem -LiteralPath $dist -File)
if ($built.Count -ne 1 -or $built[0].Name -ne $wheelName) {
  throw "expected exactly $wheelName in the build output, found: $(@($built | ForEach-Object { $_.Name }) -join ', ')"
}
$wheel = $built[0].FullName
Invoke-Native 'twine check failed' { python -m twine check $wheel } | Out-Host

# --- 4. pre-flight: do the artifact's claims hold when installed? ---------------------
# twine check validates the METADATA. It cannot tell you that parse() returns success for
# SQL, which is how 6.0.7 shipped. This installs the wheel into a clean venv with no
# extras - what a user actually gets - and runs the judged commit's own pre-flight in
# isolated mode (-I: no PYTHONPATH, no user site), so only the installed copy is graded.
Write-Host "== pre-flight: do the artifact's claims hold when installed? ==" -ForegroundColor Cyan
$wheelSha256 = Get-Sha256 $wheel
Write-Host "wheel sha256 $wheelSha256"
$pfVenv = Join-Path $work 'preflight-venv'
Invoke-Native 'python -m venv failed' { python -m venv $pfVenv } | Out-Null
$pfPy = Join-Path $pfVenv 'Scripts\python.exe'
Invoke-Native 'could not install the built wheel into a clean venv' {
  & $pfPy -I -m pip --isolated install --quiet --no-index --no-deps --no-cache-dir $wheel
} | Out-Host
$preflight = Join-Path $src 'scripts\preflight-release.py'
Push-Location $work
try {
  Invoke-Native 'pre-flight failed - the built artifact does not hold its own claims. Nothing uploaded.' {
    & $pfPy -I $preflight --expect $Version
  } | Out-Host
} finally { Pop-Location }

# --- 5. HoloCI readiness --------------------------------------------------------------
Write-Host "== HoloCI readiness for $Repo at $($Sha) ==" -ForegroundColor Cyan
$saved = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
try { node $gate --repo $Repo --sha $Sha } finally { $ErrorActionPreference = $saved }
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

if (-not $Publish) {
  Write-Host ''
  Write-Host "Dry run complete: $wheelName built from $($Sha), pre-flight passed, HoloCI ready." -ForegroundColor Green
  Write-Host "wheel: $wheel (sha256 $wheelSha256)"
  Write-Host 'Re-run with -Publish to upload.'
  exit 0
}

# --- 6. re-check, then upload exactly the wheel pre-flight installed ------------------
$headNow = ([string](Invoke-Native 'git rev-parse HEAD failed' { git -C $root rev-parse HEAD })).Trim()
if ($headNow -ne $Sha) {
  throw "HEAD moved to $headNow during this run (it was $($Sha)). Nothing uploaded; re-run."
}
$hashNow = Get-Sha256 $wheel
if ($hashNow -ne $wheelSha256) {
  throw "the wheel changed after pre-flight installed it (sha256 was $wheelSha256, now $hashNow). Nothing uploaded."
}

$token = $env:PYPI_API_TOKEN
$envFile = Join-Path $pkg '.env'
if (-not $token -and (Test-Path -LiteralPath $envFile)) {
  $line = Select-String -LiteralPath $envFile -Pattern '^\s*PYPI_API_TOKEN\s*=' | Select-Object -First 1
  if ($line) { $token = ($line.Line -split '=', 2)[1].Trim().Trim('"').Trim("'") }
}
if (-not $token) {
  throw 'No PyPI token. Set $env:PYPI_API_TOKEN for this shell (from HoloKey or wherever you keep it) and re-run.'
}

Write-Host "== upload: $wheelName (sha256 $wheelSha256) to $PypiUpload ==" -ForegroundColor Cyan
$env:TWINE_USERNAME = '__token__'
$env:TWINE_PASSWORD = $token
try {
  Invoke-Native 'twine upload failed - check pypi.org/project/holoscript before re-running' {
    python -m twine upload --repository-url $PypiUpload --non-interactive $wheel
  } | Out-Host
}
finally {
  Remove-Item Env:TWINE_PASSWORD -ErrorAction SilentlyContinue
  Remove-Item Env:TWINE_USERNAME -ErrorAction SilentlyContinue
  $token = $null
}

# --- 7. grade what pypi.org actually serves -------------------------------------------
Write-Host '== verifying what pypi.org serves ==' -ForegroundColor Cyan
$vVenv = Join-Path $work 'verify-venv'
Invoke-Native 'python -m venv failed' { python -m venv $vVenv } | Out-Null
$vPy = Join-Path $vVenv 'Scripts\python.exe'
$download = Join-Path $work 'download'
$served = Join-Path $download $wheelName
for ($attempt = 1; $attempt -le 5 -and -not (Test-Path -LiteralPath $served); $attempt++) {
  Start-Sleep -Seconds 30   # the simple index can lag the upload
  $saved = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    & $vPy -I -m pip --isolated download --quiet --no-cache-dir --no-deps --only-binary=:all: --index-url $PypiIndex -d $download "holoscript==$Version"
  } finally { $ErrorActionPreference = $saved }
}
if (-not (Test-Path -LiteralPath $served)) {
  throw "pypi.org/simple did not serve $wheelName after 5 tries. Check pypi.org/project/holoscript by hand."
}
$servedSha256 = Get-Sha256 $served
if ($servedSha256 -ne $wheelSha256) {
  throw "pypi.org serves different bytes for $wheelName (sha256 $servedSha256; uploaded $wheelSha256)."
}
Write-Host "pypi.org serves the bytes that were uploaded (sha256 $servedSha256)" -ForegroundColor Green
Invoke-Native 'could not install the downloaded wheel' {
  & $vPy -I -m pip --isolated install --quiet --no-index --no-deps --no-cache-dir $served
} | Out-Host
Push-Location $work
try {
  Invoke-Native 'the PUBLISHED artifact failed pre-flight' { & $vPy -I $preflight --expect $Version } | Out-Host
} finally { Pop-Location }

Write-Host ''
Write-Host 'Published and verified.' -ForegroundColor Green
Write-Host 'Do not yank 6.0.7 on its own: 6.0.8 needs Python 3.10+, so 3.8/3.9 users would fall back to 6.0.6, which has the same fake parser.'
Write-Host "Tell Harbor to re-grade: pip install holoscript==$Version"
