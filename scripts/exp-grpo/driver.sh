#!/usr/bin/env bash
# =============================================================================
# driver.sh — Non-interactive GRPO fleet job for vast.ai GPU boxes.
#
# Runs the full pipeline:
#   1. Bootstrap Node.js + Python deps
#   2. Extract training data via extract.ts (GRPOPromptExtractor + FocusedDPOSplitter)
#   3. Train via grpo_fleet_job.py (TRL GRPOTrainer + OPLoRA)
#   4. Evaluate on held-out set via grpo_eval.py
#   5. Emit verdict via grpo_analyze.py (PROVE / KILL / INCONCLUSIVE)
#   6. Post verdict + adapter path to knowledge store
#
# All secrets via environment variables (never in this file — F.001).
#
# Required env vars:
#   HOLOSCRIPT_API_KEY   — MCP orchestrator key (for knowledge store)
#   REPO_URL             — HoloScript git clone URL (may embed PAT)
#
# Optional env vars:
#   BASE_MODEL           — HuggingFace model ID (default: Qwen/Qwen2.5-7B-Instruct)
#   GRPO_MAX_STEPS       — Training steps (default: 500; set 2000 for full run)
#   RUN_SFT              — "1" to enable SFT warmup (default: 0)
#   BASELINE_QUALITY     — FALLBACK-ONLY guessed baseline (default: 0.30). The
#                          verdict now measures the base arm via a paired eval;
#                          this is used only if that base pass is unavailable.
#   WANDB_API_KEY        — Optional W&B run logging
#   HF_TOKEN             — Optional HuggingFace Hub push
#   HF_ORG               — HuggingFace org for hub push (default: "")
#   GRPO_SEED            — Reproducibility seed (default: 42)
#
# Usage:
#   # Local smoke test (no GPU required; uses --dry-run):
#   REPO_URL=. bash scripts/exp-grpo/driver.sh --dry-run
#
#   # Vast.ai --onstart-cmd (encode as base64 or reference via URL):
#   vastai create instance $OFFER_ID \
#     --image pytorch/pytorch:2.4.0-cuda12.1-cudnn9-devel --disk 80 \
#     --env '-e HOLOSCRIPT_API_KEY=... -e REPO_URL=https://TOKEN@github.com/org/HoloScript.git' \
#     --onstart-cmd "bash <(curl -fsSL $RAW_DRIVER_URL)"
# =============================================================================
set -euo pipefail
IFS=$'\n\t'

LOG="[grpo-driver]"
JOB_ID="${JOB_ID:-grpo-$(hostname 2>/dev/null || echo unknown)-$$}"
DRIVER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE="${WORKSPACE:-/workspace}"
REPO_DIR="${REPO_DIR:-$WORKSPACE/HoloScript}"
OUT_DIR="${OUT_DIR:-$WORKSPACE/exp-grpo-out}"
DATA_DIR="$OUT_DIR/training-data"
ORCH="${MCP_ORCHESTRATOR_URL:-https://mcp-orchestrator-production-45f9.up.railway.app}"
DRY_RUN=false

# Parse flags
for arg in "$@"; do
  case $arg in
    --dry-run) DRY_RUN=true ;;
  esac
done

exec > >(tee -a "$WORKSPACE/grpo-driver.log") 2>&1
echo "$LOG $(date -u +%Y-%m-%dT%H:%M:%SZ) — job_id=$JOB_ID dry_run=$DRY_RUN"

# ---------------------------------------------------------------------------
# 0. Validate required vars
# ---------------------------------------------------------------------------
if [ "$DRY_RUN" = false ]; then
  : "${HOLOSCRIPT_API_KEY:?HOLOSCRIPT_API_KEY required (pass via --env, never hardcoded — F.001)}"
  : "${REPO_URL:?REPO_URL required}"
fi

BASE_MODEL="${BASE_MODEL:-Qwen/Qwen2.5-7B-Instruct}"
GRPO_MAX_STEPS="${GRPO_MAX_STEPS:-500}"
RUN_SFT="${RUN_SFT:-0}"
BASELINE_QUALITY="${BASELINE_QUALITY:-0.30}"

echo "$LOG config: model=$BASE_MODEL steps=$GRPO_MAX_STEPS sft=$RUN_SFT baseline=$BASELINE_QUALITY"

# ---------------------------------------------------------------------------
# 1. Bootstrap system deps
# ---------------------------------------------------------------------------
echo "$LOG [step 1] Installing system deps..."
if command -v apt-get >/dev/null 2>&1; then
  apt-get update -qq && apt-get install -y -qq git curl tmux htop >/dev/null 2>&1 || true
fi

# Node.js 20 (for extract.ts via npx tsx)
if ! command -v node >/dev/null 2>&1 || [[ "$(node -e 'process.stdout.write(process.version.split(".")[0].slice(1))')" -lt "18" ]]; then
  echo "$LOG installing Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null 2>&1
  apt-get install -y nodejs >/dev/null 2>&1
fi
echo "$LOG Node $(node --version)"

# pnpm
if ! command -v pnpm >/dev/null 2>&1; then
  npm install -g pnpm@9 >/dev/null 2>&1 || true
fi

# Python deps
echo "$LOG installing Python deps..."
pip install -q \
  "torch>=2.4.0" "transformers>=4.46.0" "trl>=0.18.0" \
  "peft>=0.14.0" "datasets>=3.0.0" "accelerate>=0.34.0" \
  "bitsandbytes>=0.43.0" "scipy>=1.13.0" 2>/dev/null || \
  pip install -q -r "$DRIVER_DIR/requirements.txt" 2>/dev/null || true

# vLLM (GRPO colocate mode) — best-effort; training falls back if unavailable
pip install -q "vllm>=0.8.5" 2>/dev/null || echo "$LOG WARN: vllm install failed — vLLM disabled"

# Flash Attention (best-effort)
pip install -q flash-attn --no-build-isolation 2>/dev/null || true

# ---------------------------------------------------------------------------
# 2. Clone / refresh repo
# ---------------------------------------------------------------------------
echo "$LOG [step 2] Setting up repo at $REPO_DIR ..."
if [ "$DRY_RUN" = true ]; then
  REPO_DIR="$(cd "$DRIVER_DIR/../.." && pwd)"
  echo "$LOG [dry-run] using local repo at $REPO_DIR"
elif [ -d "$REPO_DIR/.git" ]; then
  cd "$REPO_DIR"
  git fetch --depth 1 origin 2>/dev/null && git reset --hard origin/main 2>/dev/null || \
    echo "$LOG WARN: git pull failed, using existing checkout"
else
  git clone --depth 1 "$REPO_URL" "$REPO_DIR"
fi

cd "$REPO_DIR"

# Install Node deps (absorb-service needs @holoscript/core for imports)
echo "$LOG installing pnpm workspace deps..."
pnpm install --frozen-lockfile --ignore-scripts 2>/dev/null || \
  pnpm install --ignore-scripts 2>/dev/null || true

mkdir -p "$DATA_DIR" "$OUT_DIR"

# ---------------------------------------------------------------------------
# 3. Extract training data
# ---------------------------------------------------------------------------
echo "$LOG [step 3] Extracting training data..."

EXTRACT_SCRIPT="$REPO_DIR/scripts/exp-grpo/extract.ts"
MANIFEST_JSON=""

if [ "$DRY_RUN" = true ]; then
  echo "$LOG [dry-run] skipping extraction — using synthetic data"
  # Create minimal synthetic JSONL for smoke test
  echo '{"prompt":"Implement the missing vitest test for parseComposition. Context: export function parseComposition(src: string){}","metadata":{"source":"grpo-prompt-extractor","extractionSource":"stub-implementation","packageName":"core","filePath":"packages/core/src/parser/HoloCompositionParser.ts","difficulty":"medium","domainTags":["parser"],"symbolName":"parseComposition","line":1,"timestamp":0}}' > "$DATA_DIR/grpo-prompts.jsonl"
  MANIFEST_JSON="{\"grpoPrompts\":1,\"dpoPairs\":0,\"grpoPath\":\"$DATA_DIR/grpo-prompts.jsonl\",\"dpoPath\":\"\"}"
else
  MANIFEST_JSON=$(HOLOSCRIPT_ROOT="$REPO_DIR" \
    EXTRACT_OUT="$DATA_DIR" \
    EXTRACT_MAX_PROMPTS="${EXTRACT_MAX_PROMPTS:-1500}" \
    npx tsx "$EXTRACT_SCRIPT" 2>&1 | tail -1)
  echo "$LOG extraction manifest: $MANIFEST_JSON"
fi

GRPO_PROMPTS_PATH=$(echo "$MANIFEST_JSON" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('grpoPath',''))" 2>/dev/null || echo "$DATA_DIR/grpo-prompts.jsonl")
DPO_PAIRS_PATH=$(echo "$MANIFEST_JSON" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('dpoPath',''))" 2>/dev/null || echo "")

echo "$LOG grpo_prompts=$GRPO_PROMPTS_PATH dpo_pairs=$DPO_PAIRS_PATH"

# ---------------------------------------------------------------------------
# 4. Train
# ---------------------------------------------------------------------------
echo "$LOG [step 4] GRPO training (steps=$GRPO_MAX_STEPS model=$BASE_MODEL)..."

if [ "$DRY_RUN" = true ]; then
  echo "$LOG [dry-run] skipping training"
  TRAINING_RECEIPT="$OUT_DIR/training-receipt.json"
  echo "{\"jobType\":\"grpo-fleet-job\",\"completedAt\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"adapterDir\":\"$OUT_DIR/adapter\",\"trainedOn\":1,\"evalSetSize\":0,\"maxSteps\":1,\"rewardMode\":\"dry-run\"}" > "$TRAINING_RECEIPT"
else
  TRAINING_RECEIPT_JSON=$(
    HOLOSCRIPT_ROOT="$REPO_DIR" \
    BASE_MODEL="$BASE_MODEL" \
    GRPO_PROMPTS="$GRPO_PROMPTS_PATH" \
    DPO_PAIRS="$DPO_PAIRS_PATH" \
    OUTPUT_DIR="$OUT_DIR" \
    TRAINING_ROOT="$REPO_DIR/scripts/training" \
    GRPO_MAX_STEPS="$GRPO_MAX_STEPS" \
    RUN_SFT="$RUN_SFT" \
    GRPO_SEED="${GRPO_SEED:-42}" \
    python3 "$DRIVER_DIR/grpo_fleet_job.py" | tail -1
  )
  TRAINING_RECEIPT="$OUT_DIR/training-receipt.json"
  echo "$LOG training receipt: $(echo "$TRAINING_RECEIPT_JSON" | head -c 200)"
fi

ADAPTER_DIR=$(python3 -c "import json; d=json.load(open('$TRAINING_RECEIPT')); print(d.get('adapterDir','$OUT_DIR/adapter'))" 2>/dev/null || echo "$OUT_DIR/adapter")
EVAL_PROMPTS="$OUT_DIR/eval-prompts.jsonl"

# ---------------------------------------------------------------------------
# 5. Evaluate
# ---------------------------------------------------------------------------
echo "$LOG [step 5] Evaluating adapter..."

if [ "$DRY_RUN" = true ] || [ ! -d "$ADAPTER_DIR" ]; then
  echo "$LOG [dry-run/skip] writing mock eval receipt"
  echo "{\"qualityScore\":0.42,\"perDimScores\":{},\"evalPrompts\":0,\"rewardMode\":\"dry-run\"}" > "$OUT_DIR/eval-receipt.json"
else
  ADAPTER_DIR="$ADAPTER_DIR" \
    EVAL_PROMPTS="$EVAL_PROMPTS" \
    OUTPUT_DIR="$OUT_DIR" \
    BASE_MODEL="$BASE_MODEL" \
    TRAINING_ROOT="$REPO_DIR/scripts/training" \
    python3 "$DRIVER_DIR/grpo_eval.py" | tail -1 > "$OUT_DIR/eval-receipt.json" || true
fi

# ---------------------------------------------------------------------------
# 6. Verdict
# ---------------------------------------------------------------------------
echo "$LOG [step 6] Computing verdict..."

VERDICT_JSON=$(
  TRAINING_RECEIPT="$OUT_DIR/training-receipt.json" \
  EVAL_RECEIPT="$OUT_DIR/eval-receipt.json" \
  OUTPUT_DIR="$OUT_DIR" \
  BASELINE_QUALITY="$BASELINE_QUALITY" \
  python3 "$DRIVER_DIR/grpo_analyze.py" | tail -1
)

VERDICT=$(echo "$VERDICT_JSON" | python3 -c "import json,sys; print(json.load(sys.stdin)['verdict'])" 2>/dev/null || echo "INCONCLUSIVE")
echo "$LOG VERDICT: $VERDICT"
echo "$LOG details: $VERDICT_JSON"

# ---------------------------------------------------------------------------
# 7. Post to knowledge store
# ---------------------------------------------------------------------------
echo "$LOG [step 7] Posting verdict to knowledge store..."

if [ "$DRY_RUN" = false ] && [ -n "${HOLOSCRIPT_API_KEY:-}" ]; then
  KS_PAYLOAD=$(python3 -c "
import json, sys
verdict = json.loads('''$VERDICT_JSON''')
payload = {
  'key': 'grpo-fleet-verdict',
  'data': verdict,
  'tags': ['grpo', 'fleet', 'training', verdict['verdict'].lower()],
}
print(json.dumps(payload))
" 2>/dev/null || echo "{}")

  curl -sfS -X POST "$ORCH/knowledge/sync" \
    -H "Content-Type: application/json" \
    -H "x-mcp-api-key: $HOLOSCRIPT_API_KEY" \
    -d "$KS_PAYLOAD" >/dev/null 2>&1 && echo "$LOG knowledge store updated" \
    || echo "$LOG WARN: knowledge store post failed (continuing)"
else
  echo "$LOG [dry-run/no-key] skipping knowledge store post"
fi

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------
echo ""
echo "==============================================="
echo "  GRPO FLEET JOB COMPLETE"
echo "  Verdict:    $VERDICT"
echo "  Artifacts:  $OUT_DIR"
echo "  Adapter:    $ADAPTER_DIR"
echo "==============================================="

# Exit non-zero if KILL to signal the fleet dispatcher
if [ "$VERDICT" = "KILL" ]; then
  echo "$LOG KILL verdict — exiting 1 to alert fleet"
  exit 1
fi
exit 0
