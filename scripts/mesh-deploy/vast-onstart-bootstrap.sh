#!/usr/bin/env bash
# vast-onstart-bootstrap.sh -- Self-contained vast.ai --onstart-cmd script.
#
# Eliminates the SCP+SSH provisioning step for fleet workers. When passed as
# `--onstart-cmd` to `vastai create instance`, this script:
#   1. Installs git (if not present)
#   2. Clones the HoloScript repo (from REPO_URL, which may embed a GitHub PAT)
#   3. Runs gpu-worker-bootstrap.sh with the env vars passed via `--env`
#
# ALL secrets are passed via `--env '-e KEY=VALUE ...'`, never baked into
# this script or the onstart string (F.001 — keys leaked twice).
#
# Usage (vastai create instance):
#   vastai create instance $OFFER_ID \
#     --image pytorch/pytorch:2.4.0-cuda12.4-cudnn9-devel \
#     --disk 80 --ssh --raw \
#     --env '-e HOLOSCRIPT_API_KEY=... -e ORCHESTRATOR_URL=... -e REPO_URL=... -e GPU_SEAT=...' \
#     --env '-e HOLOSCRIPT_NPM_REGISTRY_URL=http://jetson:4873/ -e HOLOSCRIPT_PACKAGE_PUBLIC_FALLBACK=0' \
#     --onstart-cmd "bash -c '$(cat scripts/vast-onstart-bootstrap.sh | base64 -w 0 | base64 -d)'
#      # OR: --onstart-cmd "echo BASE64_ENCODED | base64 -d | bash"
#
# Simpler wrapper (Python / PowerShell):
#   See paper-gate-execute.py rent_instance() or vast-rent-worker.ps1.
#
# CANONICAL COPY: HoloScript/scripts/mesh-deploy/vast-onstart-bootstrap.sh
# Mirror: ai-ecosystem/scripts/vast-onstart-bootstrap.sh — edit canonical, then sync.
set -uo pipefail

LOG="[vast-onstart]"

# --- Required env vars (passed via --env) ---
: "${HOLOSCRIPT_API_KEY:?HOLOSCRIPT_API_KEY required — pass via --env, never hardcode (F.001)}"
: "${REPO_URL:?REPO_URL required — must point to the HoloScript monorepo}"

ORCH="${ORCHESTRATOR_URL:-https://mcp-orchestrator-production-45f9.up.railway.app}"
SEAT="${GPU_SEAT:-vast-$(hostname 2>/dev/null || echo node)-$$}"
REPO_DIR="${REPO_DIR:-$HOME/.ai-ecosystem}"
POLL_INTERVAL="${POLL_INTERVAL:-15}"
IDLE_EXIT_AFTER="${IDLE_EXIT_AFTER:-0}"
CUQUANTUM_SETUP="${CUQUANTUM_SETUP:-scripts/fleet-cuquantum-setup.sh}"
FLEET_REPO_REF="${FLEET_REPO_REF:-main}"
GIT_CLONE_TRIES="${GIT_CLONE_TRIES:-8}"
GIT_CLONE_SLEEP_S="${GIT_CLONE_SLEEP_S:-15}"
ARCHIVE_DOWNLOAD_TRIES="${ARCHIVE_DOWNLOAD_TRIES:-3}"
ARCHIVE_DOWNLOAD_SLEEP_S="${ARCHIVE_DOWNLOAD_SLEEP_S:-10}"

echo "$LOG $(date) — starting hands-off fleet onboarding (seat=$SEAT)"
exec > >(tee -a /tmp/vast-onstart.log) 2>&1

redact_repo_url() {
  printf '%s' "$1" | sed -E 's#x-access-token:[^@]+@#x-access-token:***@#g'
}

repo_slug_from_url() {
  local slug
  slug="$(printf '%s' "$1" | sed -E 's#^https?://([^@]+@)?github\.com/##; s#^git@github\.com:##; s#\.git$##')"
  case "$slug" in
    */*) printf '%s' "$slug"; return 0 ;;
  esac
  return 1
}


is_probable_commit_sha() {
  [[ "$1" =~ ^[0-9a-fA-F]{7,40}$ ]]
}

run_redacted() {
  "$@" 2>&1 | sed -E 's#x-access-token:[^@]+@#x-access-token:***@#g'
  return "${PIPESTATUS[0]}"
}

# --- Secure source-acquisition credentials (board task_1783793122450_jnnp) ---
# INLINED copy of scripts/mesh-deploy/fleet-source-credential.sh — this --onstart-cmd script must
# be self-contained (it runs BEFORE the repo is cloned, so it cannot source the helper). KEEP IN
# SYNC with the canonical file. Keeps the GitHub PAT off git remote URLs, .git/config, and argv
# on the shared vast.ai host: git auth rides in GIT_CONFIG_* env, curl auth in a mode-600 -K file.
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
fsc_export_git_auth() {
  [ -n "${FSC_TOKEN:-}" ] || return 0
  local idx="${GIT_CONFIG_COUNT:-0}"
  export "GIT_CONFIG_KEY_${idx}=http.https://github.com/.extraHeader"
  export "GIT_CONFIG_VALUE_${idx}=Authorization: Bearer ${FSC_TOKEN}"
  export "GIT_CONFIG_COUNT=$((idx + 1))"
}
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

fetch_and_checkout_ref() {
  local ref="$1" status
  run_redacted git -C "$REPO_DIR" fetch --depth 1 origin "$ref"
  status=$?
  if [ "$status" -ne 0 ]; then
    return "$status"
  fi
  run_redacted git -C "$REPO_DIR" checkout --detach FETCH_HEAD
}

clone_repo_once() {
  # Clone the TOKEN-STRIPPED url ($FSC_CLEAN_URL); the PAT (if any) is supplied to every git op
  # via the GIT_CONFIG_* http.extraHeader env exported by fsc_export_git_auth — never in the url
  # (which git would persist to .git/config) or on argv (ps-visible on the shared host).
  if is_probable_commit_sha "$FLEET_REPO_REF"; then
    run_redacted git clone --depth 1 "$FSC_CLEAN_URL" "$REPO_DIR" || return "$?"
    fetch_and_checkout_ref "$FLEET_REPO_REF"
    return "$?"
  fi

  run_redacted git clone --depth 1 --branch "$FLEET_REPO_REF" "$FSC_CLEAN_URL" "$REPO_DIR" && return 0

  # The ref may be a non-branch object. Try a generic shallow clone plus fetch
  # before falling through to the archive fallback.
  rm -rf "$REPO_DIR"
  run_redacted git clone --depth 1 "$FSC_CLEAN_URL" "$REPO_DIR" || return "$?"
  fetch_and_checkout_ref "$FLEET_REPO_REF"
}

clone_repo_with_retry() {
  local attempt status
  for attempt in $(seq 1 "$GIT_CLONE_TRIES"); do
    rm -rf "$REPO_DIR"
    echo "$LOG clone attempt $attempt/$GIT_CLONE_TRIES: $(redact_repo_url "$REPO_URL") -> $REPO_DIR"
    clone_repo_once
    status=$?
    if [ "$status" -eq 0 ]; then
      return 0
    fi
    if [ "$attempt" -lt "$GIT_CLONE_TRIES" ]; then
      echo "$LOG WARN: clone failed with status $status; retrying in ${GIT_CLONE_SLEEP_S}s"
      sleep "$GIT_CLONE_SLEEP_S"
    fi
  done
  return 1
}

download_repo_archive_fallback() {
  local slug tmpdir archive extracted attempt status
  # Use the token-stripped url for slug derivation and the pre-extracted $FSC_TOKEN for auth
  # (both set by fsc_split_repo_url in main). The slug is not secret; the token must not hit argv.
  slug="$(repo_slug_from_url "$FSC_CLEAN_URL")" || {
    echo "$LOG WARN: cannot derive GitHub repo slug from REPO_URL; archive fallback skipped"
    return 1
  }

  for attempt in $(seq 1 "$ARCHIVE_DOWNLOAD_TRIES"); do
    rm -rf "$REPO_DIR"
    tmpdir="$(mktemp -d)"
    archive="$tmpdir/repo.tar.gz"
    echo "$LOG archive fallback attempt $attempt/$ARCHIVE_DOWNLOAD_TRIES: $slug ref=$FLEET_REPO_REF -> $REPO_DIR"
    if [ -n "${FSC_TOKEN:-}" ]; then
      # Authorization header rides in a mode-600 curl -K config (fsc_curl_with_header), never on argv.
      fsc_curl_with_header "Authorization: Bearer $FSC_TOKEN" \
        -fsSL --retry 5 --retry-delay 5 --connect-timeout 20 --speed-limit 1024 --speed-time 60 \
        -H "X-GitHub-Api-Version: 2022-11-28" \
        "https://codeload.github.com/$slug/tar.gz/$FLEET_REPO_REF" -o "$archive"
      status=$?
    else
      curl -fsSL --retry 5 --retry-delay 5 --connect-timeout 20 --speed-limit 1024 --speed-time 60 \
        "https://codeload.github.com/$slug/tar.gz/$FLEET_REPO_REF" -o "$archive"
      status=$?
    fi
    if [ "$status" -eq 0 ] && tar -xzf "$archive" -C "$tmpdir"; then
      extracted="$(find "$tmpdir" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
      if [ -n "$extracted" ] && [ -d "$extracted" ]; then
        mkdir -p "$(dirname "$REPO_DIR")"
        mv "$extracted" "$REPO_DIR"
        rm -rf "$tmpdir"
        return 0
      fi
    fi
    rm -rf "$tmpdir"
    if [ "$attempt" -lt "$ARCHIVE_DOWNLOAD_TRIES" ]; then
      echo "$LOG WARN: archive fallback failed with status $status; retrying in ${ARCHIVE_DOWNLOAD_SLEEP_S}s"
      sleep "$ARCHIVE_DOWNLOAD_SLEEP_S"
    fi
  done
  return 1
}

# --- 1. Ensure source-fetch tools are present ---
if ! command -v git >/dev/null 2>&1 || ! command -v curl >/dev/null 2>&1; then
  echo "$LOG installing source-fetch tools..."
  apt-get update -qq 2>/dev/null && apt-get install -y -qq git curl ca-certificates 2>/dev/null \
    || yum install -y -q git curl ca-certificates 2>/dev/null \
    || { echo "$LOG FATAL: cannot install git/curl"; exit 2; }
fi

# --- 2. Clone or update repo ---
# Split the PAT out of REPO_URL once and export it as ephemeral git auth (GIT_CONFIG_* extraHeader),
# so every clone/fetch below authenticates without the token on argv or in .git/config.
fsc_split_repo_url "$REPO_URL"
fsc_export_git_auth
if [ -d "$REPO_DIR/.git" ]; then
  echo "$LOG repo exists at $REPO_DIR — pulling latest..."
  cd "$REPO_DIR" || exit 2
  git fetch --depth 1 origin "$FLEET_REPO_REF" 2>/dev/null && git reset --hard FETCH_HEAD 2>/dev/null \
    || echo "$LOG WARN: git pull failed, using existing checkout"
else
  clone_repo_with_retry \
    || download_repo_archive_fallback \
    || { echo "$LOG FATAL: clone/archive fetch failed after retries"; exit 2; }
  cd "$REPO_DIR" || exit 2
fi

# --- 3. Locate and run the fleet onboarding script ---
BOOTSTRAP="scripts/gpu-worker-bootstrap.sh"
if [ ! -f "$BOOTSTRAP" ]; then
  # Mirror path in ai-ecosystem (standalone checkout)
  BOOTSTRAP_ALT="scripts/mesh-deploy/gpu-worker-bootstrap.sh"
  if [ -f "$BOOTSTRAP_ALT" ]; then
    BOOTSTRAP="$BOOTSTRAP_ALT"
  else
    echo "$LOG FATAL: $BOOTSTRAP not found in repo — is REPO_URL correct?"
    exit 2
  fi
fi

echo "$LOG running $BOOTSTRAP (ORCH=$ORCH, SEAT=$SEAT, POLL=${POLL_INTERVAL}s)"
if [ -d .git ]; then
  git config core.fileMode false || true
fi
exec bash "$BOOTSTRAP"
