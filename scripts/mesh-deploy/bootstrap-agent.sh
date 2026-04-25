#!/usr/bin/env bash
# bootstrap-agent.sh — runs ON each rented Vast.ai instance.
#
# Installs node, clones HoloScript, builds @holoscript/holoscript-agent,
# and starts the headless multi-LLM agent runtime as a daemon.
#
# Invoked via SSH or vastai exec from the local Deploy-MeshAgents.ps1.
# Reads its identity from env vars set BEFORE invocation.
#
# REQUIRED ENV (passed in by deployer):
#   HOLOSCRIPT_AGENT_HANDLE
#   HOLOSCRIPT_AGENT_PROVIDER         anthropic | openai | gemini | local-llm | mock | bitnet
#   HOLOSCRIPT_AGENT_MODEL
#   HOLOSCRIPT_AGENT_BRAIN            absolute path to .hsplus on instance
#   HOLOSCRIPT_AGENT_WALLET           0x…
#   HOLOSCRIPT_AGENT_X402_BEARER      per-surface mesh seat bearer
#   HOLOMESH_TEAM_ID
#   HOLOSCRIPT_AGENT_BUDGET_USD_DAY   optional, default 5
#   ANTHROPIC_API_KEY | OPENAI_API_KEY | GEMINI_API_KEY  per provider
#   HOLOSCRIPT_REPO_BRANCH            optional, default main
#
# OPTIONAL ENV:
#   HOLOSCRIPT_AGENT_LOCAL_LLM_BASE_URL  if PROVIDER=local-llm; default http://localhost:8080
#   START_LOCAL_LLM_SERVER               "1" to spawn vLLM server alongside agent (GPU instance only)
#   LOCAL_LLM_MODEL                      HF model id for vLLM (e.g. Qwen/Qwen2.5-0.5B-Instruct)

set -euo pipefail

REPO_URL="${HOLOSCRIPT_REPO_URL:-https://github.com/brianonbased-dev/HoloScript.git}"
REPO_BRANCH="${HOLOSCRIPT_REPO_BRANCH:-main}"
WORKSPACE="${HOLOSCRIPT_WORKSPACE:-/root/holoscript-mesh}"
LOG_DIR="${HOLOSCRIPT_AGENT_LOG_DIR:-/root/agent-logs}"

mkdir -p "$LOG_DIR"
exec > >(tee -a "$LOG_DIR/bootstrap.log") 2>&1

echo "[bootstrap] $(date -u +%FT%TZ) starting on $(hostname)"
echo "[bootstrap] handle=${HOLOSCRIPT_AGENT_HANDLE:-UNSET}"
echo "[bootstrap] provider=${HOLOSCRIPT_AGENT_PROVIDER:-UNSET} model=${HOLOSCRIPT_AGENT_MODEL:-UNSET}"

# ---------------------------------------------------------------------------
# Pre-flight: required env
# ---------------------------------------------------------------------------
need_var() {
  local v="$1"
  if [ -z "${!v:-}" ]; then
    echo "[bootstrap] FATAL: required env $v is empty" >&2
    exit 2
  fi
}
need_var HOLOSCRIPT_AGENT_HANDLE
need_var HOLOSCRIPT_AGENT_PROVIDER
need_var HOLOSCRIPT_AGENT_MODEL
need_var HOLOSCRIPT_AGENT_BRAIN
need_var HOLOSCRIPT_AGENT_WALLET
need_var HOLOSCRIPT_AGENT_X402_BEARER
need_var HOLOMESH_TEAM_ID

# Provider key check
case "$HOLOSCRIPT_AGENT_PROVIDER" in
  anthropic) need_var ANTHROPIC_API_KEY ;;
  openai)    need_var OPENAI_API_KEY ;;
  gemini)    need_var GEMINI_API_KEY ;;
  local-llm|bitnet|mock) ;;
  *) echo "[bootstrap] FATAL: unknown provider $HOLOSCRIPT_AGENT_PROVIDER" >&2; exit 2 ;;
esac

# ---------------------------------------------------------------------------
# Install Node + pnpm
# ---------------------------------------------------------------------------
if ! command -v node >/dev/null 2>&1; then
  echo "[bootstrap] installing node 20 + pnpm…"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs git
  npm install -g pnpm@9
else
  echo "[bootstrap] node $(node --version) already present"
fi

# ---------------------------------------------------------------------------
# Clone repo (idempotent)
# ---------------------------------------------------------------------------
if [ -d "$WORKSPACE/.git" ]; then
  echo "[bootstrap] repo exists, fetching…"
  cd "$WORKSPACE"
  git fetch origin "$REPO_BRANCH"
  git checkout "$REPO_BRANCH"
  git reset --hard "origin/$REPO_BRANCH"
else
  echo "[bootstrap] cloning $REPO_URL @ $REPO_BRANCH…"
  git clone --depth 1 --branch "$REPO_BRANCH" "$REPO_URL" "$WORKSPACE"
  cd "$WORKSPACE"
fi

# ---------------------------------------------------------------------------
# Verify brain composition file exists
# ---------------------------------------------------------------------------
BRAIN_PATH="$HOLOSCRIPT_AGENT_BRAIN"
if [ ! -f "$BRAIN_PATH" ]; then
  # If it's a relative path under the cloned repo, resolve it
  CANDIDATE="$WORKSPACE/$BRAIN_PATH"
  if [ -f "$CANDIDATE" ]; then
    export HOLOSCRIPT_AGENT_BRAIN="$CANDIDATE"
  else
    # Brain may live in ai-ecosystem repo (compositions/*.hsplus). Try clone.
    AI_ECO_DIR="${HOLOSCRIPT_AI_ECOSYSTEM_DIR:-/root/ai-ecosystem}"
    if [ ! -d "$AI_ECO_DIR/.git" ]; then
      echo "[bootstrap] brain not found in HoloScript repo, cloning ai-ecosystem…"
      git clone --depth 1 \
        "${HOLOSCRIPT_AI_ECOSYSTEM_URL:-https://github.com/brianonbased-dev/ai-ecosystem.git}" \
        "$AI_ECO_DIR" || true
    fi
    if [ -f "$AI_ECO_DIR/$BRAIN_PATH" ]; then
      export HOLOSCRIPT_AGENT_BRAIN="$AI_ECO_DIR/$BRAIN_PATH"
    else
      echo "[bootstrap] FATAL: brain composition not found at $BRAIN_PATH" >&2
      echo "[bootstrap]   tried: $BRAIN_PATH, $CANDIDATE, $AI_ECO_DIR/$BRAIN_PATH" >&2
      exit 2
    fi
  fi
fi
echo "[bootstrap] brain resolved to: $HOLOSCRIPT_AGENT_BRAIN"

# ---------------------------------------------------------------------------
# Install + build agent package (only what's needed)
# ---------------------------------------------------------------------------
echo "[bootstrap] installing @holoscript/holoscript-agent deps…"
cd "$WORKSPACE"
pnpm install --filter @holoscript/holoscript-agent... --frozen-lockfile=false

echo "[bootstrap] building @holoscript/holoscript-agent + all workspace deps (topo order)…"
# `pkg...` filter = build the package AND all transitive workspace deps; pnpm
# topologically sorts so deps build first, agent builds last. Required because
# tsup's DTS step in the agent needs each dep's dist/*.d.ts to resolve type
# imports like @holoscript/llm-provider in packages/holoscript-agent/src/identity.ts.
pnpm --filter "@holoscript/holoscript-agent..." build

# ---------------------------------------------------------------------------
# Optional: spin up a local LLM server (vLLM) for provider=local-llm
# ---------------------------------------------------------------------------
if [ "${START_LOCAL_LLM_SERVER:-0}" = "1" ] && [ "$HOLOSCRIPT_AGENT_PROVIDER" = "local-llm" ]; then
  LLM_MODEL="${LOCAL_LLM_MODEL:-Qwen/Qwen2.5-0.5B-Instruct}"
  # Default to 8081 — Vast.ai instances ship with Jupyter notebook bound to
  # 8080 (observed 2026-04-25: every mesh instance's port 8080 was held by
  # `jupyter-notebook ... --port=8080`, silently shadowing vLLM and leaving
  # 16 local-llm workers unable to reach their LLM despite claiming tasks).
  LLM_PORT="${LOCAL_LLM_PORT:-8081}"
  # Verify nothing else owns the port; fail loud rather than silently shadow.
  if ss -ltn 2>/dev/null | awk '{print $4}' | grep -qE ":${LLM_PORT}$"; then
    echo "[bootstrap] FATAL: port $LLM_PORT already in use — set LOCAL_LLM_PORT to a free port" >&2
    ss -ltn 2>&1 | head -10 >&2
    exit 5
  fi
  echo "[bootstrap] starting vLLM server: $LLM_MODEL on port $LLM_PORT"
  # Vast.ai images ship `python3` and `pip3` only — no bare `python` symlink.
  # Without this resolution every previous bootstrap silently aborted vLLM
  # ("nohup: failed to run command 'python': No such file or directory" in
  # vllm.log, observed 2026-04-25 across all local-llm workers).
  PY_BIN=$(command -v python3 || command -v python || true)
  PIP_BIN=$(command -v pip3 || command -v pip || true)
  if [ -z "$PY_BIN" ] || [ -z "$PIP_BIN" ]; then
    echo "[bootstrap] FATAL: no python/pip found on PATH" >&2
    exit 7
  fi
  echo "[bootstrap] python=$PY_BIN  pip=$PIP_BIN"
  $PIP_BIN install --quiet vllm || true
  nohup "$PY_BIN" -m vllm.entrypoints.openai.api_server \
    --model "$LLM_MODEL" \
    --port "$LLM_PORT" \
    --max-model-len 4096 \
    > "$LOG_DIR/vllm.log" 2>&1 &
  echo $! > "$LOG_DIR/vllm.pid"
  export HOLOSCRIPT_AGENT_LOCAL_LLM_BASE_URL="http://localhost:$LLM_PORT/v1"
  echo "[bootstrap] waiting 30s for vLLM to load model…"
  sleep 30
  # Sanity: check vLLM bound the port. If not, exit early so daemon doesn't
  # boot into a no-LLM hang state (the silent failure we just spent hours on).
  if ! curl -sf "http://localhost:$LLM_PORT/v1/models" > /dev/null 2>&1; then
    echo "[bootstrap] FATAL: vLLM did not bind $LLM_PORT within 30s — see $LOG_DIR/vllm.log" >&2
    tail -20 "$LOG_DIR/vllm.log" >&2 || true
    exit 6
  fi
  echo "[bootstrap] vLLM responding on $LLM_PORT"
fi

# ---------------------------------------------------------------------------
# whoami pre-flight (validates identity tuple end-to-end via /me)
# ---------------------------------------------------------------------------
echo "[bootstrap] running whoami pre-flight…"
cd "$WORKSPACE/packages/holoscript-agent"
if ! node dist/index.js whoami; then
  echo "[bootstrap] FATAL: whoami failed — identity tuple did not resolve" >&2
  exit 3
fi

# ---------------------------------------------------------------------------
# Start the agent daemon
# ---------------------------------------------------------------------------
AGENT_PID_FILE="$LOG_DIR/agent.pid"
if [ -f "$AGENT_PID_FILE" ]; then
  OLD_PID=$(cat "$AGENT_PID_FILE")
  if kill -0 "$OLD_PID" 2>/dev/null; then
    echo "[bootstrap] killing previous agent (pid $OLD_PID)…"
    kill "$OLD_PID" || true
    sleep 2
  fi
fi

echo "[bootstrap] starting headless agent daemon…"
nohup node dist/index.js run > "$LOG_DIR/agent.log" 2>&1 &
AGENT_PID=$!
echo "$AGENT_PID" > "$AGENT_PID_FILE"

sleep 3
if ! kill -0 "$AGENT_PID" 2>/dev/null; then
  echo "[bootstrap] FATAL: agent died within 3s — see $LOG_DIR/agent.log" >&2
  tail -20 "$LOG_DIR/agent.log" >&2 || true
  exit 4
fi

echo "[bootstrap] DONE — agent running as pid $AGENT_PID, logs at $LOG_DIR/agent.log"
echo "[bootstrap] $(date -u +%FT%TZ) bootstrap complete"
