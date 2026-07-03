#!/usr/bin/env bash
# Idempotent installer for the WebGPU capture driver on a Linux GPU host
# (vast.ai, runpod, lambda labs, self-hosted). Verifies via capture-bench.mjs.
#
# Usage:
#   bash scripts/webgpu-capture/setup-host.sh
#
# Detects whether each component is already installed and skips it. Designed
# to be safe to re-run if a step fails midway.
set -euo pipefail

log() { printf '\n[setup-host] %s\n' "$*"; }

# --- 0. Sanity ---
if [[ "$(uname -s)" != "Linux" ]]; then
  log "This script targets Linux GPU hosts. Skipping; run probe-webgpu.mjs directly on Win/Mac."
  exit 0
fi

# --- 1. NVIDIA + Vulkan stack ---
if ! command -v nvidia-smi >/dev/null 2>&1; then
  log "ERROR: nvidia-smi not found. Cannot capture WebGPU on this host."
  exit 1
fi
log "GPU detected:"
nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader

if ! command -v vulkaninfo >/dev/null 2>&1; then
  log "Installing Vulkan + GL stack…"
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
    libvulkan1 vulkan-tools libgl1 libglx0 libgles2 \
    libgbm1 libdrm2 libxkbcommon0 libnss3 libatk1.0-0 libatk-bridge2.0-0 \
    libxcomposite1 libxdamage1 libxrandr2 libcairo-gobject2 libpango-1.0-0 \
    libcairo2 libasound2 libpangocairo-1.0-0 libxshmfence1 \
    fonts-liberation libappindicator3-1 xdg-utils 2>&1 | tail -3 || true
fi
if command -v vulkaninfo >/dev/null 2>&1; then
  log "Vulkan smoke:"
  vulkaninfo --summary 2>&1 | sed -n '/GPU0/,/devicePropertyFlags/p' | head -10 || true
fi

# --- 2. Node + Playwright ---
if ! command -v node >/dev/null 2>&1; then
  log "Installing Node 22…"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get install -y nodejs >/dev/null
fi
log "node: $(node --version)"

if ! command -v npx >/dev/null 2>&1; then
  apt-get install -y npm >/dev/null
fi

# --- 3. Install Playwright + its bundled Chromium ---
# Playwright's bundled Chromium IS new enough to support --enable-unsafe-webgpu.
# We install Playwright locally to avoid global state.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [[ ! -d node_modules/playwright ]]; then
  log "Installing playwright + chromium runtime (this downloads ~150MB)…"
  cat > package.json <<'PJ'
{
  "name": "holoscript-webgpu-capture",
  "private": true,
  "type": "module",
  "dependencies": {
    "playwright": "^1.49.0"
  }
}
PJ
  npm install --no-audit --no-fund 2>&1 | tail -5
  npx --yes playwright install chromium 2>&1 | tail -5
fi

# --- 4. OpenTimestamps dependencies for sign-receipt.mjs ---
if ! command -v python3 >/dev/null 2>&1; then
  log "Installing Python 3 for OpenTimestamps receipt signing..."
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq python3 python3-pip 2>&1 | tail -3 || true
fi

if command -v python3 >/dev/null 2>&1; then
  if ! python3 - <<'PY' >/dev/null 2>&1
import opentimestamps
import requests
PY
  then
    log "Installing OpenTimestamps Python dependencies..."
    if ! python3 -m pip --version >/dev/null 2>&1; then
      apt-get update -qq
      DEBIAN_FRONTEND=noninteractive apt-get install -y -qq python3-pip 2>&1 | tail -3 || true
    fi
    python3 -m pip install --quiet --break-system-packages opentimestamps requests 2>&1 | tail -5 \
      || python3 -m pip install --quiet --user opentimestamps requests 2>&1 | tail -5
  fi
fi

# --- 5. Smoke probe ---
log "Running WebGPU smoke probe…"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"
SMOKE_RECEIPT="${WEBGPU_SETUP_SMOKE_RECEIPT:-/tmp/webgpu-capture-smoke.json}"
WEBGPU_PROBE_HEADLESS=1 \
  node scripts/webgpu-capture/capture-bench.mjs \
    scripts/webgpu-capture/configs/smoke.json \
    --out "$SMOKE_RECEIPT" 2>&1 | tee /tmp/webgpu-probe.log | tail -25

if node -e '
const fs = require("fs");
const receipt = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
process.exit(receipt.adapter_info && Array.isArray(receipt.results) && receipt.results.length > 0 ? 0 : 1);
' "$SMOKE_RECEIPT"; then
  log "WebGPU smoke PASSED. Host is ready for capture-bench.mjs runs."
else
  log "WebGPU smoke FAILED. See /tmp/webgpu-probe.log and $SMOKE_RECEIPT for details."
  log "Common causes: missing nvidia-vulkan ICD, kernel mismatch, container without --device=/dev/dri."
  exit 2
fi
