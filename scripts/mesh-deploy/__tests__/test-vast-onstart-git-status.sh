#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
BOOTSTRAP=$(cd -- "$SCRIPT_DIR/.." && pwd)/vast-onstart-bootstrap.sh
WORK=$(mktemp -d)
trap 'rm -rf -- "$WORK"' EXIT

mkdir -p "$WORK/bin" "$WORK/existing/.git"
cat >"$WORK/bin/git" <<'SH'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$GIT_CALL_LOG"
if [[ "$*" == *"status --porcelain"* ]]; then
  exit 73
fi
exit 0
SH
chmod +x "$WORK/bin/git"

HARNESS="$WORK/harness.sh"
awk '
  /^select_source_checkout\(\) \{/ { capture = 1 }
  capture { print }
  capture && /^}$/ { exit }
' "$BOOTSTRAP" >"$HARNESS"
cat >>"$HARNESS" <<'SH'
LOG='[test]'
FLEET_REPO_REF=main
REPO_DIR="$TEST_ROOT/existing"
ORIGINAL_REPO="$REPO_DIR"
fetch_and_checkout_ref() { printf 'fetch\n' >> "$STATE_FILE"; return 0; }
clone_repo_with_retry() { mkdir -p "$REPO_DIR"; printf 'clone:%s\n' "$REPO_DIR" >> "$STATE_FILE"; return 0; }
download_repo_archive_fallback() { printf 'archive\n' >> "$STATE_FILE"; return 0; }
select_source_checkout || exit $?
test -d "$ORIGINAL_REPO/.git"
printf 'selected:%s\n' "$REPO_DIR" >> "$STATE_FILE"
SH

export TEST_ROOT="$WORK"
export GIT_CALL_LOG="$WORK/git-calls.log"
export STATE_FILE="$WORK/state.log"
PATH="$WORK/bin:$PATH" bash "$HARNESS" >"$WORK/stdout.log" 2>"$WORK/stderr.log"

grep -F 'git status failed (exit=73); checkout state is unknown' "$WORK/stdout.log" >/dev/null
grep -F 'preserving' "$WORK/stdout.log" >/dev/null
grep -F 'clone:' "$STATE_FILE" >/dev/null
grep -F '.fleet-checkout-' "$STATE_FILE" >/dev/null
if grep -F 'fetch' "$STATE_FILE" >/dev/null; then
  echo 'unknown checkout was fetched in place' >&2
  exit 1
fi
test "$(wc -l < "$GIT_CALL_LOG" | tr -d ' ')" = 1
grep -E '^-C .+ status --porcelain$' "$GIT_CALL_LOG" >/dev/null

if grep -Eq '\[ -z "\$\(git[^)]*status --porcelain' "$BOOTSTRAP"; then
  echo 'weak command-substitution cleanliness guard remains' >&2
  exit 1
fi

echo 'vast onstart git-status guard: PASS'
