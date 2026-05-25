#!/usr/bin/env bash
# ci-runner-bootstrap.sh — turn a rented vast.ai CPU instance into a holo-ci
# runner that drains ONLY the 'ci' lane (never GPU paper jobs).
#
# Runs ON the instance (vast.ai --onstart, or via SSH). Idempotent.
#
# Required env (passed via vastai create --env or written to /workspace/.env):
#   HOLOSCRIPT_API_KEY   — orchestrator auth (x-mcp-api-key)
#   ORCHESTRATOR_URL     — default https://mcp-orchestrator-production-45f9.up.railway.app
# Optional:
#   CI_SEAT              — default ci-<hostname>
#
# What it does:
#   1. Install git, node 20, pnpm.
#   2. Clone HoloScript → /workspace/HoloScript (WORKSPACE_ROOT for gate checkouts).
#   3. Fetch gpu-runner.mjs from ai-ecosystem.
#   4. Run gpu-runner.mjs with GPU_LANE=ci under systemd (auto-restart) or nohup.
set -euo pipefail

WORKSPACE=/workspace
HS_DIR="$WORKSPACE/HoloScript"
AE_DIR="$WORKSPACE/ai-ecosystem"
ORCHESTRATOR_URL="${ORCHESTRATOR_URL:-https://mcp-orchestrator-production-45f9.up.railway.app}"
CI_SEAT="${CI_SEAT:-ci-$(hostname)}"

echo "[ci-bootstrap] installing toolchain…"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq && apt-get install -y -qq git curl ca-certificates >/dev/null
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null 2>&1
  apt-get install -y -qq nodejs >/dev/null
fi
corepack enable >/dev/null 2>&1 || npm i -g pnpm >/dev/null 2>&1

mkdir -p "$WORKSPACE"
echo "[ci-bootstrap] cloning repos…"
[ -d "$HS_DIR/.git" ] || git clone --depth 50 https://github.com/brianonbased-dev/HoloScript.git "$HS_DIR"
[ -d "$AE_DIR/.git" ] || git clone --depth 5  https://github.com/brianonbased-dev/ai-ecosystem.git "$AE_DIR"

# Env for the runner (lane=ci is the whole point — never claims GPU paper jobs).
cat > "$WORKSPACE/.env" <<EOF
ORCHESTRATOR_URL=$ORCHESTRATOR_URL
HOLOSCRIPT_API_KEY=${HOLOSCRIPT_API_KEY:?HOLOSCRIPT_API_KEY required}
GPU_LANE=ci
GPU_SEAT=$CI_SEAT
WORKSPACE_ROOT=$HS_DIR
EOF

# Phase 3: Register the CI seat with the orchestrator before starting the runner.
# The seat must exist in gpu_seats before the runner can claim jobs. Self-registration
# via agent key returns 403 (admin-only), so we use the admin key if available.
SEAT_ADMIN_KEY="${HOLOSCRIPT_ADMIN_KEY:-$HOLOSCRIPT_API_KEY}"
echo "[ci-bootstrap] Registering CI seat: $CI_SEAT (lane=ci, has_gpu=false)"
curl -sf -X POST "$ORCHESTRATOR_URL/gpu/seats" \
  -H "Content-Type: application/json" \
  -H "x-mcp-api-key: $SEAT_ADMIN_KEY" \
  -d "{\"id\":\"$CI_SEAT\",\"authorized_lanes\":[\"ci\"],\"has_gpu\":false,\"status\":\"active\",\"metadata\":\"ci-runner-bootstrap\"}" \
  && echo "[ci-bootstrap] Seat registered successfully" \
  || echo "[ci-bootstrap] WARNING: Seat registration failed (may need admin key or pre-registration)"

RUNNER="$AE_DIR/scripts/gpu-runner.mjs"
echo "[ci-bootstrap] runner: $RUNNER  seat: $CI_SEAT  lane: ci"

if command -v systemctl >/dev/null 2>&1; then
  cat > /etc/systemd/system/holo-ci-runner.service <<EOF
[Unit]
Description=holo-ci runner (ci lane)
After=network-online.target
[Service]
WorkingDirectory=$WORKSPACE
EnvironmentFile=$WORKSPACE/.env
ExecStart=$(command -v node) $RUNNER
Restart=on-failure
RestartSec=10
StartLimitBurst=5
KillMode=mixed
[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable --now holo-ci-runner.service
  echo "[ci-bootstrap] systemd unit holo-ci-runner.service started"
else
  set -a; . "$WORKSPACE/.env"; set +a
  nohup node "$RUNNER" > "$WORKSPACE/holo-ci-runner.log" 2>&1 &
  echo "[ci-bootstrap] nohup runner started (no systemd); log: $WORKSPACE/holo-ci-runner.log"
fi
echo "[ci-bootstrap] done — draining 'ci' lane from $ORCHESTRATOR_URL"
