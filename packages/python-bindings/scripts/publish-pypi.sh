#!/usr/bin/env bash
# Publish holoscript to PyPI - HoloCI decides whether this commit may go out.
# Same contract as publish-pypi.ps1 (its header explains each rule):
#   - the wheel is built from `git archive <sha>`, never from the working tree;
#   - with --publish the commit must be HEAD and on origin/main, the repo is pinned,
#     HOLO_CI_DIR / HOLO_CI_RUN_PROOF_DIR are refused, and the gate checkout must be clean;
#   - only the wheel goes up, only if its sha256 still matches what pre-flight installed,
#     only to upload.pypi.org; then it is downloaded back from pypi.org/simple, its sha256
#     compared, and pre-flighted again.
# No bypass flag. The token is read at run time from the environment or .env and never
# printed.
#
#   ./scripts/publish-pypi.sh                  # dry run: build HEAD, pre-flight it, ask HoloCI
#   SHA=<sha> ./scripts/publish-pypi.sh        # dry run against another commit
#   ./scripts/publish-pypi.sh --publish        # upload HEAD's wheel, then verify pypi.org
#
# With HoloKey:  export PYPI_API_TOKEN="$(<your holokey command>)"
set -euo pipefail
set +x   # this script handles a PyPI token; never trace it

PINNED_REPO=brianonbased-dev/HoloScript
VERSION=6.0.8
PYPI_UPLOAD=https://upload.pypi.org/legacy/
PYPI_INDEX=https://pypi.org/simple

die() { echo "$*" >&2; exit 1; }

PUBLISH=0
case "${1:-}" in
  '') ;;
  --publish) PUBLISH=1 ;;
  *) die "usage: $0 [--publish]   (there is no --skip-build: the wheel is always built from git archive)" ;;
esac
[ $# -le 1 ] || die "usage: $0 [--publish]"

if [ -n "${REPO:-}" ] && [ "$REPO" != "$PINNED_REPO" ]; then
  die "REPO=$REPO is set. This script publishes $PINNED_REPO only. Unset REPO."
fi

pick_python() {
  local c
  for c in python3 python; do
    if "$c" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)' >/dev/null 2>&1; then
      echo "$c"
      return 0
    fi
  done
  return 1
}
venv_python() {   # POSIX venvs put python in bin/, Windows venvs in Scripts/
  if [ -x "$1/bin/python" ]; then echo "$1/bin/python"; else echo "$1/Scripts/python.exe"; fi
}
sha256_of() {
  "$PY" -c 'import hashlib, sys; print(hashlib.sha256(open(sys.argv[1], "rb").read()).hexdigest())' "$1"
}

PY="$(pick_python)" || die "no Python 3.10+ found as python3 or python"
PKG="$(cd "$(dirname "$0")/.." && pwd)"
ROOT="$(git -C "$PKG" rev-parse --show-toplevel)" || die "git rev-parse --show-toplevel failed"

# --- 1. which commit ---------------------------------------------------------------
HEAD_SHA="$(git -C "$ROOT" rev-parse HEAD)" || die "git rev-parse HEAD failed"
WANT="${SHA:-$HEAD_SHA}"
SHA="$(git -C "$ROOT" rev-parse --verify --quiet "${WANT}^{commit}")" || die "$WANT is not a commit in this checkout"

if [ "$PUBLISH" = 1 ]; then
  [ "$SHA" = "$HEAD_SHA" ] || die "--publish uploads HEAD only. $SHA is not HEAD ($HEAD_SHA). Check out the commit you mean to publish."
  [ -z "${HOLO_CI_DIR:-}" ] || die "HOLO_CI_DIR is set. With --publish the readiness gate must come from its default location. Unset it and re-run."
  [ -z "${HOLO_CI_RUN_PROOF_DIR:-}" ] || die "HOLO_CI_RUN_PROOF_DIR is set. With --publish the gate reads run proofs from its default location. Unset it and re-run."
  echo "== is this commit on origin/main? =="
  git -C "$ROOT" fetch -q origin main || die "git fetch origin main failed"
  set +e
  git -C "$ROOT" merge-base --is-ancestor "$SHA" origin/main
  RC=$?
  set -e
  case "$RC" in
    0) echo "$SHA is on origin/main" ;;
    1) die "$SHA is not on origin/main. Publish only what has merged." ;;
    *) die "git merge-base --is-ancestor failed (exit $RC)" ;;
  esac
fi

# Uncommitted changes never reach the wheel (it is built from the commit), so a dirty
# package is refused on --publish only because the operator may think they are shipping.
if ! DIRTY="$(git -C "$ROOT" status --porcelain -- packages/python-bindings)"; then
  die "git status failed - refusing rather than guessing the tree is clean"
fi
if [ -n "$DIRTY" ]; then
  MSG="packages/python-bindings has uncommitted changes. They are NOT in the wheel, which is built from $SHA:
$DIRTY"
  if [ "$PUBLISH" = 1 ]; then die "$MSG"; else echo "warning: $MSG" >&2; fi
fi

# --- 2. find the readiness gate before spending time on a build ----------------------
if [ -n "${HOLO_CI_DIR:-}" ]; then
  HCD="$HOLO_CI_DIR"
  echo "warning: using HOLO_CI_DIR=$HOLO_CI_DIR (dry run only; --publish refuses it)" >&2
else
  HCD="$PKG/../../../../ai-ecosystem/scripts/holo-ci"
fi
GATE="$HCD/publish-readiness-gate.mjs"
[ -f "$GATE" ] || die "publish-readiness-gate.mjs not found at $GATE"
CI_ROOT="$(git -C "$HCD" rev-parse --show-toplevel)" || die "could not find the git checkout that holds $HCD"
if ! CI_DIRTY="$(git -C "$CI_ROOT" status --porcelain -- scripts/holo-ci packages/holorepo/src/ci config/holo-ci)"; then
  die "git status failed in $CI_ROOT - refusing rather than guessing the gate is clean"
fi
if [ -n "$CI_DIRTY" ]; then
  MSG="the HoloCI checkout at $CI_ROOT has uncommitted changes in its gate paths, so the gate set judging this commit is not one anybody reviewed:
$CI_DIRTY"
  if [ "$PUBLISH" = 1 ]; then die "$MSG"; else echo "warning: $MSG" >&2; fi
fi

# --- 3. build the wheel from the commit, not the working tree -------------------------
echo "== build: wheel from git archive $SHA =="
WORK="$(mktemp -d "${TMPDIR:-/tmp}/holoscript-release-XXXXXX")"
mkdir -p "$WORK/src" "$WORK/dist"
git -c core.autocrlf=false -C "$ROOT" archive --format=tar "$SHA" packages/python-bindings | tar -x -C "$WORK/src"
SRC="$WORK/src/packages/python-bindings"
"$PY" -m build --wheel --outdir "$WORK/dist" "$SRC" || die "python -m build failed"

WHEEL_NAME="holoscript-$VERSION-py3-none-any.whl"
WHEEL="$WORK/dist/$WHEEL_NAME"
BUILT="$(ls -A "$WORK/dist")"
[ "$BUILT" = "$WHEEL_NAME" ] || die "expected exactly $WHEEL_NAME in the build output, found: $BUILT"
"$PY" -m twine check "$WHEEL" || die "twine check failed"

# --- 4. pre-flight: do the artifact's claims hold when installed? ---------------------
# twine check validates the METADATA. It cannot tell you that parse() returns success
# for SQL, which is how 6.0.7 shipped. This installs the wheel into a clean venv with no
# extras - what a user actually gets - and runs the judged commit's own pre-flight in
# isolated mode (-I: no PYTHONPATH, no user site), so only the installed copy is graded.
echo "== pre-flight: do the artifact's claims hold when installed? =="
WHEEL_SHA256="$(sha256_of "$WHEEL")"
echo "wheel sha256 $WHEEL_SHA256"
"$PY" -m venv "$WORK/preflight-venv" || die "python -m venv failed"
PFPY="$(venv_python "$WORK/preflight-venv")"
"$PFPY" -I -m pip --isolated install --quiet --no-index --no-deps --no-cache-dir "$WHEEL" \
  || die "could not install the built wheel into a clean venv"
PREFLIGHT="$SRC/scripts/preflight-release.py"
if ! (cd "$WORK" && "$PFPY" -I "$PREFLIGHT" --expect "$VERSION"); then
  die "pre-flight failed - the built artifact does not hold its own claims. Nothing uploaded."
fi

# --- 5. HoloCI readiness --------------------------------------------------------------
echo "== HoloCI readiness for $PINNED_REPO at $SHA =="
set +e
node "$GATE" --repo "$PINNED_REPO" --sha "$SHA"
VERDICT=$?
set -e
case "$VERDICT" in
  0) echo "ready - every declared gate passed" ;;
  4) die "HoloCI says FAILED for this commit. Fix the gate, not this script." ;;
  5) die "HoloCI has no verdict for this commit (untested). Push it and let the ci lane run." ;;
  6) die "HoloCI is still running for this commit. Ask again when it settles." ;;
  8) die "HoloCI coverage is PARTIAL - some declared gates never reported." ;;
  7) die "Could not read the CI verdict. Never assume pass." ;;
  *) die "publish-readiness-gate exited $VERDICT" ;;
esac

if [ "$PUBLISH" != 1 ]; then
  echo
  echo "Dry run complete: $WHEEL_NAME built from $SHA, pre-flight passed, HoloCI ready."
  echo "wheel: $WHEEL (sha256 $WHEEL_SHA256)"
  echo "Re-run with --publish to upload."
  exit 0
fi

# --- 6. re-check, then upload exactly the wheel pre-flight installed ------------------
HEAD_NOW="$(git -C "$ROOT" rev-parse HEAD)" || die "git rev-parse HEAD failed"
[ "$HEAD_NOW" = "$SHA" ] || die "HEAD moved to $HEAD_NOW during this run (it was $SHA). Nothing uploaded; re-run."
HASH_NOW="$(sha256_of "$WHEEL")"
[ "$HASH_NOW" = "$WHEEL_SHA256" ] \
  || die "the wheel changed after pre-flight installed it (sha256 was $WHEEL_SHA256, now $HASH_NOW). Nothing uploaded."

set +x   # token handling below: never trace it
TOKEN="${PYPI_API_TOKEN:-}"
if [ -z "$TOKEN" ] && [ -f "$PKG/.env" ]; then
  # `|| true`: no PYPI_API_TOKEN line is "no token", reported below, not a silent exit.
  TOKEN="$(grep -E '^[[:space:]]*PYPI_API_TOKEN[[:space:]]*=' "$PKG/.env" | head -n 1 | cut -d= -f2- || true)"
fi
# Strip quotes, spaces and a CRLF .env's trailing carriage return.
TOKEN="$(printf '%s' "$TOKEN" | tr -d "\"' \r\t")"
[ -n "$TOKEN" ] || die 'No PyPI token. export PYPI_API_TOKEN="$(<your holokey command>)" and re-run.'

echo "== upload: $WHEEL_NAME (sha256 $WHEEL_SHA256) to $PYPI_UPLOAD =="
if ! TWINE_USERNAME=__token__ TWINE_PASSWORD="$TOKEN" \
  "$PY" -m twine upload --repository-url "$PYPI_UPLOAD" --non-interactive "$WHEEL"; then
  TOKEN=
  die "twine upload failed - check pypi.org/project/holoscript before re-running"
fi
TOKEN=

# --- 7. grade what pypi.org actually serves -------------------------------------------
echo "== verifying what pypi.org serves =="
"$PY" -m venv "$WORK/verify-venv" || die "python -m venv failed"
VPY="$(venv_python "$WORK/verify-venv")"
DOWNLOAD="$WORK/download"
SERVED="$DOWNLOAD/$WHEEL_NAME"
for _ in 1 2 3 4 5; do
  [ -f "$SERVED" ] && break
  sleep 30   # the simple index can lag the upload
  "$VPY" -I -m pip --isolated download --quiet --no-cache-dir --no-deps --only-binary=:all: \
    --index-url "$PYPI_INDEX" -d "$DOWNLOAD" "holoscript==$VERSION" || true
done
[ -f "$SERVED" ] || die "pypi.org/simple did not serve $WHEEL_NAME after 5 tries. Check pypi.org/project/holoscript by hand."
SERVED_SHA256="$(sha256_of "$SERVED")"
[ "$SERVED_SHA256" = "$WHEEL_SHA256" ] \
  || die "pypi.org serves different bytes for $WHEEL_NAME (sha256 $SERVED_SHA256; uploaded $WHEEL_SHA256)."
echo "pypi.org serves the bytes that were uploaded (sha256 $SERVED_SHA256)"
"$VPY" -I -m pip --isolated install --quiet --no-index --no-deps --no-cache-dir "$SERVED" \
  || die "could not install the downloaded wheel"
(cd "$WORK" && "$VPY" -I "$PREFLIGHT" --expect "$VERSION") || die "the PUBLISHED artifact failed pre-flight"

echo
echo "Published and verified."
echo "Do not yank 6.0.7 on its own: 6.0.8 needs Python 3.10+, so 3.8/3.9 users would fall back to 6.0.6, which has the same fake parser."
echo "Tell Harbor to re-grade: pip install holoscript==$VERSION"
