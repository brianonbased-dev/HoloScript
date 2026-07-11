#!/usr/bin/env bash
# Fake-sentinel test for fleet-source-credential.sh (board task_1783793122450_jnnp).
#
# Proves a GitHub PAT ("the sentinel") is NEVER exposed on process argv, in a git remote URL,
# in .git/config, or in a leftover file — across BOTH the git-clone and the curl archive-fallback
# paths — while still being supplied out-of-band so auth would actually work. Fake git/curl shims
# record their exact argv; a real leak (token on the command line) fails this test.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HELPER="$HERE/../fleet-source-credential.sh"

SENTINEL="s3ntinel_PAT_DEADBEEF1234567890"
REPO="owner/repo"
TOKENIZED_URL="https://x-access-token:${SENTINEL}@github.com/${REPO}.git"
CLEAN_URL="https://github.com/${REPO}.git"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
export FSC_TEST_ARGV="$WORK/argv.log"        # ONLY command-line args land here (the ps-visible surface)
export FSC_TEST_OUTOFBAND="$WORK/oob.log"    # env/config-file auth presence (the accepted secret channels)
: > "$FSC_TEST_ARGV"; : > "$FSC_TEST_OUTOFBAND"

# --- fake git/curl shims: record argv, simulate success, persist the clone url like real git ---
mkdir -p "$WORK/bin"
cat > "$WORK/bin/git" <<'SHIM'
#!/usr/bin/env bash
printf 'GIT_ARGV: %s\n' "$*" >> "$FSC_TEST_ARGV"
# Real git authenticates from GIT_CONFIG_* env (extraHeader) — record that the token is reachable
# out-of-band so we can prove auth is still supplied, just not on argv.
env | grep -q "GIT_CONFIG_VALUE" && env | grep -q "s3ntinel_PAT" && printf 'GIT_ENV_AUTH: yes\n' >> "$FSC_TEST_OUTOFBAND"
if [ "${1:-}" = "clone" ]; then
  dir=""; url=""
  for a in "$@"; do case "$a" in https://*|git@*) url="$a" ;; esac; dir="$a"; done
  [ -n "$dir" ] && { mkdir -p "$dir/.git"; printf '[remote "origin"]\n\turl = %s\n' "$url" > "$dir/.git/config"; }
fi
exit 0
SHIM
cat > "$WORK/bin/curl" <<'SHIM'
#!/usr/bin/env bash
printf 'CURL_ARGV: %s\n' "$*" >> "$FSC_TEST_ARGV"
args=("$@")
for ((i=0; i<${#args[@]}; i++)); do
  if [ "${args[$i]}" = "-K" ]; then
    cfg="${args[$((i+1))]}"
    [ -f "$cfg" ] && grep -q "s3ntinel_PAT" "$cfg" && printf 'CURL_CFG_AUTH: yes\n' >> "$FSC_TEST_OUTOFBAND"
  fi
  if [ "${args[$i]}" = "-o" ]; then printf 'FAKE-TARBALL' > "${args[$((i+1))]}"; fi
done
exit 0
SHIM
chmod +x "$WORK/bin/git" "$WORK/bin/curl"
export PATH="$WORK/bin:$PATH"
# Scope mktemp (the helper's -K config file) to a controlled dir so the leftover check is fast + precise.
export TMPDIR="$WORK/tmp"; mkdir -p "$TMPDIR"

# shellcheck source=/dev/null
. "$HELPER"

fail=0
check() { if eval "$2"; then printf '  ok   %s\n' "$1"; else printf '  FAIL %s\n' "$1"; fail=$((fail+1)); fi; }

# ============ exercise the GIT path ============
fsc_split_repo_url "$TOKENIZED_URL"
fsc_export_git_auth
git clone --depth 1 "$FSC_CLEAN_URL" "$WORK/repo" >/dev/null 2>&1

# ============ exercise the CURL archive-fallback path ============
fsc_curl_with_header "Authorization: Bearer $FSC_TOKEN" -fsSL "https://codeload.github.com/${REPO}/tar.gz/main" -o "$WORK/repo.tar.gz" >/dev/null 2>&1

echo "# fleet-source-credential sentinel test"
# 1. The token must NOT appear on ANY recorded command line (git clone / curl).
check "no sentinel token on any process argv (ps-safe)" "! grep -q '$SENTINEL' '$FSC_TEST_ARGV'"
# 2. git got the CLEAN url, not the tokenized one.
check "git clone used the token-stripped url" "grep -q 'GIT_ARGV:.*$CLEAN_URL' '$FSC_TEST_ARGV'"
check "split produced a clean url" "[ '$FSC_CLEAN_URL' = '$CLEAN_URL' ]"
check "split extracted the token" "[ '$FSC_TOKEN' = '$SENTINEL' ]"
# 3. Persisted .git/config carries no token.
check "no token persisted in .git/config" "! grep -q '$SENTINEL' '$WORK/repo/.git/config'"
# 4. curl received a -K config file (header off argv), not an inline -H with the token.
check "curl auth via -K config file, not -H argv" "grep -q 'CURL_ARGV:.*-K ' '$FSC_TEST_ARGV' && ! grep -q 'CURL_ARGV:.*Authorization' '$FSC_TEST_ARGV'"
# 5. No leftover temp file in the (scoped) temp dir still holds the token — the mode-600 -K
#    config file the helper created must have been deleted after the curl call.
LEFTOVER="$(grep -rl "$SENTINEL" "$TMPDIR" 2>/dev/null | head -1 || true)"
check "no leftover temp file holds the token" "[ -z '$LEFTOVER' ]"
# 6. POSITIVE: auth WAS supplied out-of-band (env for git, -K cfg for curl) so it would actually work.
check "git auth supplied via GIT_CONFIG_* env" "grep -q 'GIT_ENV_AUTH: yes' '$FSC_TEST_OUTOFBAND'"
check "curl auth supplied via -K config file" "grep -q 'CURL_CFG_AUTH: yes' '$FSC_TEST_OUTOFBAND'"
# 7. Cleanup unsets the git auth env.
fsc_unset_git_auth
check "fsc_unset_git_auth clears the token env" "[ -z \"\${GIT_CONFIG_VALUE_0:-}\" ] && [ -z \"\${FSC_TOKEN:-}\" ]"

if [ "$fail" -ne 0 ]; then echo "SENTINEL TEST FAILED: $fail check(s)"; exit 1; fi
echo "SENTINEL TEST PASSED: token never reaches argv / remote url / .git/config / leftover files."
