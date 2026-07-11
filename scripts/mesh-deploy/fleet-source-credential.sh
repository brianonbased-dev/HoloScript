# fleet-source-credential.sh -- secure source-acquisition credentials for fleet workers.
#
# Third-party fleet hosts (vast.ai) are SHARED: any user can read another process's argv
# (`ps`, /proc/<pid>/cmdline) and any file left in a checkout. A GitHub PAT / API key must
# therefore NEVER appear in:
#   - a git remote URL (git persists it verbatim in .git/config),
#   - a command-line argument (git clone <tokenized-url>, curl -H "Authorization: Bearer <t>"),
#   - a log line (handled separately by the callers' redact_* helpers).
#
# Instead auth rides in EPHEMERAL channels the shell already trusts for secrets (F.001):
#   - git: an http.extraHeader injected via GIT_CONFIG_* env vars (Git >= 2.31), so every git
#     op authenticates without the token on argv and without writing it to .git/config;
#   - curl: a mode-600 `-K` config file created + deleted per call, so the header never hits argv.
# The clone always uses the TOKEN-STRIPPED url, so remote.origin.url stays clean.
#
# CANONICAL COPY. vast-onstart-bootstrap.sh INLINES these functions verbatim (it must be a
# self-contained --onstart-cmd string and cannot source this file from the not-yet-cloned repo);
# keep the two in sync. gpu-worker-bootstrap.sh sources this file (it runs post-clone).
# Tested by scripts/mesh-deploy/__tests__/test-fleet-source-credential.sh (fake-sentinel).

# Split a possibly-tokenized GitHub URL into a clean url + token.
# Sets: FSC_CLEAN_URL (never contains the token), FSC_TOKEN ('' when the url carries no token).
fsc_split_repo_url() {
  local url="$1"
  FSC_TOKEN=""
  FSC_CLEAN_URL="$url"
  case "$url" in
    https://x-access-token:*@github.com/*)
      FSC_TOKEN="$(printf '%s' "$url" | sed -E 's#^https://x-access-token:([^@]+)@github\.com/.*#\1#')"
      FSC_CLEAN_URL="$(printf '%s' "$url" | sed -E 's#^https://x-access-token:[^@]+@github\.com/#https://github.com/#')"
      ;;
    https://*:*@github.com/*)
      FSC_TOKEN="$(printf '%s' "$url" | sed -E 's#^https://[^:@/]+:([^@]+)@github\.com/.*#\1#')"
      FSC_CLEAN_URL="$(printf '%s' "$url" | sed -E 's#^https://[^@]+@github\.com/#https://github.com/#')"
      ;;
    https://*@github.com/*)
      # username-only (e.g. x-access-token@github.com) — no secret to strip, but normalise.
      FSC_CLEAN_URL="$(printf '%s' "$url" | sed -E 's#^https://[^@]+@github\.com/#https://github.com/#')"
      ;;
  esac
}

# Inject FSC_TOKEN as a github.com http.extraHeader via GIT_CONFIG_* env (NOT argv, NOT .git/config).
# Every subsequent `git` op (clone, fetch) authenticates from this ephemeral env. No-op without a token.
fsc_export_git_auth() {
  [ -n "${FSC_TOKEN:-}" ] || return 0
  local idx="${GIT_CONFIG_COUNT:-0}"
  export "GIT_CONFIG_KEY_${idx}=http.https://github.com/.extraHeader"
  export "GIT_CONFIG_VALUE_${idx}=Authorization: Bearer ${FSC_TOKEN}"
  export "GIT_CONFIG_COUNT=$((idx + 1))"
}

# Drop the git auth from the environment and forget the token (call after acquisition / on cleanup).
fsc_unset_git_auth() {
  local idx
  if [ -n "${GIT_CONFIG_COUNT:-}" ] && [ "${GIT_CONFIG_COUNT}" -gt 0 ] 2>/dev/null; then
    idx="$((GIT_CONFIG_COUNT - 1))"
    unset "GIT_CONFIG_KEY_${idx}" "GIT_CONFIG_VALUE_${idx}" 2>/dev/null || true
    if [ "$idx" -eq 0 ]; then unset GIT_CONFIG_COUNT; else export "GIT_CONFIG_COUNT=$idx"; fi
  fi
  unset FSC_TOKEN 2>/dev/null || true
}

# Run curl with a secret header supplied through a mode-600 -K config file so the header value
# never appears in argv. Usage: fsc_curl_with_header "Header-Name: value" <curl args...>
fsc_curl_with_header() {
  local header="$1"; shift
  local cfg rc
  cfg="$(mktemp 2>/dev/null)" || return 1
  chmod 600 "$cfg" 2>/dev/null || true
  # curl -K config: `header = "<full header line>"`. Value is not shell-word-split.
  printf 'header = "%s"\n' "$header" > "$cfg"
  curl -K "$cfg" "$@"
  rc=$?
  rm -f "$cfg"
  return "$rc"
}
