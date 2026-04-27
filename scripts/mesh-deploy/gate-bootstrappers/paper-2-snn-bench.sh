#!/usr/bin/env bash
# paper-2-snn-bench.sh — gate bootstrapper for Paper 2 SNN throughput.
#
# Closes the Paper 2 portion of task_1777261350664_gzd5 (per-gate
# bootstrap engineering). Called by paper-gate-execute.py --mode rent
# after the instance is up.
#
# Required env vars (passed via SSH):
#   HOLOSCRIPT_REPO_URL    https://x-access-token:<PAT>@github.com/.../HoloScript.git
#   BENCH_VULKAN_BACKEND   "native" for real GPU, "swiftshader" for CPU fallback
#   BENCH_TIMEOUT_MS       300000 (5 min) for native; 120000 (2 min) for swiftshader
#
# Outputs to:
#   /root/.bench-logs/paper-2-lif-throughput-automated.json
#
# Verified end-to-end 2026-04-26 on RTX 5060 Ti 16GB ($0.10/hr, ~5 min total
# bootstrap+bench): TODO update with native pass result hash from this run.

set -euo pipefail

VULKAN_BACKEND="${BENCH_VULKAN_BACKEND:-swiftshader}"
TIMEOUT_MS="${BENCH_TIMEOUT_MS:-300000}"
REPO_URL="${HOLOSCRIPT_REPO_URL:-https://github.com/brianonbased-dev/HoloScript.git}"

echo "[paper-2-bootstrap] vulkan_backend=$VULKAN_BACKEND timeout_ms=$TIMEOUT_MS"

# ---------------------------------------------------------------------------
# Step 1: Vulkan stack (only when native — skip for swiftshader to save time)
# ---------------------------------------------------------------------------
if [ "$VULKAN_BACKEND" = "native" ]; then
  echo "[paper-2-bootstrap] installing vulkan-tools + mesa-vulkan-drivers"
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
    vulkan-tools mesa-vulkan-drivers libvulkan1 2>&1 | tail -2
  echo "[paper-2-bootstrap] vulkaninfo --summary:"
  vulkaninfo --summary 2>&1 | head -15 || echo "WARN: vulkaninfo failed; container may lack GPU passthrough"
fi

# ---------------------------------------------------------------------------
# Step 2: Node 20 + pnpm 9 (idempotent)
# ---------------------------------------------------------------------------
if ! command -v node >/dev/null 2>&1; then
  echo "[paper-2-bootstrap] installing node 20 + pnpm"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - 2>&1 | tail -1
  apt-get install -y -qq nodejs
  npm install -g pnpm@9 >/dev/null
fi

# ---------------------------------------------------------------------------
# Step 3: Clone HoloScript + install snn-webgpu workspace
# ---------------------------------------------------------------------------
WORKSPACE="${PAPER2_WORKSPACE:-/root/holoscript-paper2}"
if [ ! -d "$WORKSPACE/.git" ]; then
  git clone --depth 1 "$REPO_URL" "$WORKSPACE" 2>&1 | tail -2
fi
cd "$WORKSPACE"
pnpm install --filter @holoscript/snn-webgpu... --no-frozen-lockfile 2>&1 | tail -2

# ---------------------------------------------------------------------------
# Step 4: Playwright chromium (with system deps)
# ---------------------------------------------------------------------------
cd "$WORKSPACE/packages/snn-webgpu"
npx -y playwright install chromium --with-deps 2>&1 | tail -2

# ---------------------------------------------------------------------------
# Step 5: Run the benchmark
# ---------------------------------------------------------------------------
echo "[paper-2-bootstrap] running bench BENCH_VULKAN_BACKEND=$VULKAN_BACKEND"
cd "$WORKSPACE/packages/snn-webgpu"
BENCH_VULKAN_BACKEND="$VULKAN_BACKEND" \
BENCH_TIMEOUT_MS="$TIMEOUT_MS" \
BENCH_TARGET=auto \
  timeout $((TIMEOUT_MS / 1000 + 60)) node scripts/run-benchmark.mjs

ARTIFACT="$WORKSPACE/.bench-logs/paper-2-lif-throughput-automated.json"
if [ -f "$ARTIFACT" ]; then
  echo "[paper-2-bootstrap] DONE — artifact at $ARTIFACT"
  echo "[paper-2-bootstrap] peak throughput:"
  python3 -c "import json; d=json.load(open('$ARTIFACT')); peak=max(d['lif']['results'], key=lambda r: r['throughput_M_per_s']); print(f'  {peak[\"throughput_M_per_s\"]:.3f} M neurons/s at N={peak[\"neurons\"]}')"
else
  echo "[paper-2-bootstrap] FAIL — no artifact at $ARTIFACT"
  exit 1
fi
