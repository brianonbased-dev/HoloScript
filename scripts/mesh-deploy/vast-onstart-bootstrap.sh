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

github_token_from_url() {
  case "$1" in
    https://x-access-token:*@github.com/*)
      printf '%s' "$1" | sed -E 's#^https://x-access-token:([^@]+)@github\.com/.*#\1#'
      ;;
  esac
}

is_probable_commit_sha() {
  [[ "$1" =~ ^[0-9a-fA-F]{7,40}$ ]]
}

run_redacted() {
  "$@" 2>&1 | sed -E 's#x-access-token:[^@]+@#x-access-token:***@#g'
  return "${PIPESTATUS[0]}"
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
  if is_probable_commit_sha "$FLEET_REPO_REF"; then
    run_redacted git clone --depth 1 "$REPO_URL" "$REPO_DIR" || return "$?"
    fetch_and_checkout_ref "$FLEET_REPO_REF"
    return "$?"
  fi

  run_redacted git clone --depth 1 --branch "$FLEET_REPO_REF" "$REPO_URL" "$REPO_DIR" && return 0

  # The ref may be a non-branch object. Try a generic shallow clone plus fetch
  # before falling through to the archive fallback.
  rm -rf "$REPO_DIR"
  run_redacted git clone --depth 1 "$REPO_URL" "$REPO_DIR" || return "$?"
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
  local slug token tmpdir archive extracted attempt status
  slug="$(repo_slug_from_url "$REPO_URL")" || {
    echo "$LOG WARN: cannot derive GitHub repo slug from REPO_URL; archive fallback skipped"
    return 1
  }
  token="$(github_token_from_url "$REPO_URL")"

  for attempt in $(seq 1 "$ARCHIVE_DOWNLOAD_TRIES"); do
    rm -rf "$REPO_DIR"
    tmpdir="$(mktemp -d)"
    archive="$tmpdir/repo.tar.gz"
    echo "$LOG archive fallback attempt $attempt/$ARCHIVE_DOWNLOAD_TRIES: $slug ref=$FLEET_REPO_REF -> $REPO_DIR"
    if [ -n "$token" ]; then
      curl -fsSL --retry 5 --retry-delay 5 --connect-timeout 20 --speed-limit 1024 --speed-time 60 \
        -H "Authorization: Bearer $token" \
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
