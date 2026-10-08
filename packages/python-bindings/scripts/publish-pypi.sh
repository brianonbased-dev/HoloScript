#!/usr/bin/env bash
# Publish holoscript to PyPI — HoloCI decides whether this commit may go out.
# Same contract as the .ps1: readiness gate first, dry run by default, token read
# from the environment or .env at run time and never printed.
#
#   ./scripts/publish-pypi.sh                    # dry run
#   ./scripts/publish-pypi.sh --skip-build       # dry run against dist/ as it stands
#   ./scripts/publish-pypi.sh --publish          # uploads, then verifies PyPI
#   HOLO_CI_DIR=... SHA=... ./scripts/publish-pypi.sh
#
# With HoloKey:  export PYPI_API_TOKEN="$(<your holokey command>)"
set -euo pipefail
cd "$(dirname "$0")/.."
REPO="${REPO:-brianonbased-dev/HoloScript}"
SHA="${SHA:-$(git rev-parse HEAD)}"

if [ -n "$(git status --porcelain)" ]; then
  echo "working tree is dirty - CI never saw these changes. Commit, push, let HoloCI run, then publish." >&2
  exit 1
fi

HOLO_CI_DIR="${HOLO_CI_DIR:-../../../../ai-ecosystem/scripts/holo-ci}"
GATE="$HOLO_CI_DIR/publish-readiness-gate.mjs"
[ -f "$GATE" ] || { echo "publish-readiness-gate.mjs not found at $GATE - set HOLO_CI_DIR" >&2; exit 1; }

echo "== HoloCI readiness for $SHA =="
set +e
node "$GATE" --repo "$REPO" --sha "$SHA"
VERDICT=$?
set -e
case "$VERDICT" in
  0) echo "ready - every declared gate passed" ;;
  4) echo "HoloCI says FAILED for this commit. Fix the gate, not this script." >&2; exit 1 ;;
  5) echo "HoloCI has no verdict for this commit (untested). Push it and let the ci lane run." >&2; exit 1 ;;
  6) echo "HoloCI is still running for this commit. Ask again when it settles." >&2; exit 1 ;;
  8) echo "HoloCI coverage is PARTIAL - some declared gates never reported." >&2; exit 1 ;;
  7) echo "Could not read the CI verdict. Never assume pass." >&2; exit 1 ;;
  *) echo "publish-readiness-gate exited $VERDICT" >&2; exit 1 ;;
esac

if [ "${1:-}" = "--skip-build" ]; then
  echo "== build == (skipped, checking dist/ as it stands)"
else
  echo "== build =="
  rm -f dist/holoscript-6.0.8*   # a failed build must not leave a stale wheel behind
  python3 -m build
fi
python3 -m twine check dist/holoscript-6.0.8*

# --- pre-flight: do the artifact's claims hold when installed? ----------------
# twine check validates the METADATA. It cannot tell you that parse() returns success
# for SQL, which is how 6.0.7 shipped. This installs the wheel into a clean venv with no
# extras - what a user actually gets - and checks every claim the release makes. It runs
# on the dry run too, so you see the verdict before deciding to upload.
echo "== pre-flight: do the artifact's claims hold when installed? =="
PF="$(mktemp -d)"
python3 -m venv "$PF/venv"
"$PF/venv/bin/pip" install --quiet --no-cache-dir dist/holoscript-6.0.8-py3-none-any.whl
if ! "$PF/venv/bin/python" scripts/preflight-release.py --expect 6.0.8; then
  echo "pre-flight failed - the built artifact does not hold its own claims. Nothing uploaded." >&2
  exit 1
fi

if [ "${1:-}" != "--publish" ]; then
  echo
  echo "Dry run complete. Re-run with --publish to upload."
  exit 0
fi

TOKEN="${PYPI_API_TOKEN:-}"
if [ -z "$TOKEN" ] && [ -f .env ]; then
  TOKEN="$(grep -E '^[[:space:]]*PYPI_API_TOKEN[[:space:]]*=' .env | head -1 | cut -d= -f2- | tr -d "\"' ")"
fi
[ -n "$TOKEN" ] || { echo 'No PyPI token. export PYPI_API_TOKEN="$(<your holokey command>)" and re-run.' >&2; exit 1; }

echo "== upload =="
TWINE_USERNAME=__token__ TWINE_PASSWORD="$TOKEN" python3 -m twine upload dist/holoscript-6.0.8*

echo "== verifying the published artifact =="
TMP="$(mktemp -d)"
python3 -m venv "$TMP/venv"
sleep 30
"$TMP/venv/bin/pip" install --quiet --no-cache-dir holoscript==6.0.8
"$TMP/venv/bin/python" - <<'PY'
import holoscript, sys
print("published version:", holoscript.__version__)
try:
    holoscript.parse("{{{@@@")
except NotImplementedError:
    print("published package refuses garbage: ok")
else:
    sys.exit("the PUBLISHED package accepts garbage")
PY

echo
echo "Published and verified."
echo "Do not yank 6.0.7 on its own: 6.0.8 needs Python 3.10+, so 3.8/3.9 users would fall back to 6.0.6, which has the same fake parser."
