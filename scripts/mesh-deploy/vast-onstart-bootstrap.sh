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

echo "$LOG $(date) — starting hands-off fleet onboarding (seat=$SEAT)"
exec > >(tee -a /tmp/vast-onstart.log) 2>&1

# --- 1. Ensure git is present ---
if ! command -v git >/dev/null 2>&1; then
  echo "$LOG installing git..."
  apt-get update -qq 2>/dev/null && apt-get install -y -qq git 2>/dev/null \
    || yum install -y -q git 2>/dev/null \
    || { echo "$LOG FATAL: cannot install git"; exit 2; }
fi

# --- 2. Clone or update repo ---
if [ -d "$REPO_DIR/.git" ]; then
  echo "$LOG repo exists at $REPO_DIR — pulling latest..."
  cd "$REPO_DIR" || exit 2
  git fetch --depth 1 origin 2>/dev/null && git reset --hard origin/main 2>/dev/null \
    || echo "$LOG WARN: git pull failed, using existing checkout"
else
  echo "$LOG cloning $REPO_URL -> $REPO_DIR ..."
  git clone --depth 1 "$REPO_URL" "$REPO_DIR" || { echo "$LOG FATAL: clone failed"; exit 2; }
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
chmod +x "$BOOTSTRAP"
exec bash "$BOOTSTRAP"
