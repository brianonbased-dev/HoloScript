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
#                                        (bare host:port — adapter appends /v1/chat/completions;
#                                        trailing /v1 is stripped defensively, so either form works)
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
# Clock sync (chrony)
# ---------------------------------------------------------------------------
# Vast.ai images do NOT auto-sync clocks. Observed 2026-04-25: H200 mw01
# emitted a CAEL record with tick_iso=2026-04-25T09:01:16 while the wall
# clock was ~09:11 — a 10+ minute drift. tick_iso is then unreliable for
# chronological ordering AND gate-clock counting (Paper 25 requires 7
# fleet-days of CONTINUOUS records; clock skew can cause day-rollover
# ambiguity that erases an entire fleet-day).
#
# Fix: install chrony (apt is idempotent — the install no-ops if the package
# is already present) and force one immediate step-correction so we don't
# have to wait for the daemon's slow-slew convergence on a fresh boot.
# `chronyc -a makestep` requires the daemon to be reachable, so we ensure
# it's running first. All steps are idempotent.
if ! command -v chronyd >/dev/null 2>&1; then
  echo "[bootstrap] installing chrony for NTP clock sync…"
  apt-get install -y chrony
else
  echo "[bootstrap] chrony already installed"
fi

# Start the daemon. systemd path on most Vast.ai images; fall back to the
# init script / direct binary on minimal images without systemd.
if command -v systemctl >/dev/null 2>&1 && [ -d /run/systemd/system ]; then
  systemctl enable chrony >/dev/null 2>&1 || systemctl enable chronyd >/dev/null 2>&1 || true
  systemctl start chrony  >/dev/null 2>&1 || systemctl start chronyd  >/dev/null 2>&1 || true
elif command -v service >/dev/null 2>&1; then
  service chrony start >/dev/null 2>&1 || service chronyd start >/dev/null 2>&1 || true
else
  # No init system — spawn chronyd directly so chronyc has a daemon to talk to.
  pgrep -x chronyd >/dev/null 2>&1 || (chronyd >/dev/null 2>&1 &) || true
fi

# Force one immediate step-correction. -a authorises via the local socket
# (chrony.conf default `allow` for cmdmon on the loopback). If it fails we
# log + continue: a 10-min drift is bad but it shouldn't BLOCK the bootstrap,
# and the daemon will slew-correct over the following minutes.
# Brief retry loop because the daemon socket isn't immediately available
# after `systemctl start` on a freshly-installed package.
PRE_DATE=$(date -u +%FT%TZ)
makestep_ok=0
for attempt in 1 2 3 4 5; do
  if chronyc -a makestep >/dev/null 2>&1; then
    makestep_ok=1
    break
  fi
  sleep 1
done
if [ "$makestep_ok" = "1" ]; then
  POST_DATE=$(date -u +%FT%TZ)
  echo "[bootstrap] chronyc makestep ok: $PRE_DATE -> $POST_DATE (UTC)"
else
  echo "[bootstrap] WARN: chronyc -a makestep failed after 5 retries — daemon may not be ready; relying on slew correction" >&2
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

# ---------------------------------------------------------------------------
# Lean toolchain — installs when the AGENT BRAIN declares Lean capability
# (filename pattern lean*brain*), regardless of LLM provider.
#
# Why brain-based, not provider-based: 2026-04-25 the gate was
# `provider=anthropic` because at the time only mw01 (anthropic claude-opus-4-7)
# ran the lean-theorist-brain. Founder ruling 2026-04-25 then flipped mw01 to
# local-llm Qwen 72B-AWQ for cost reasons (commit 97efb061c on template +
# f592086ae on agents.json). With provider-based gating, mw01 stops getting
# elan installed even though it's still running lean-theorist-brain — exactly
# the kind of cross-axis drift W.111 warned about (provider and capability are
# orthogonal axes; binding tooling to one means flips on the other silently
# break tooling).
#
# New contract: tooling binds to brain capability (the .hsplus the agent runs),
# not to the LLM provider serving it. Pattern `lean*brain*` matches
# `lean-theorist-brain.hsplus` today + any future `lean-prover-brain.hsplus`,
# `lean-tactic-brain.hsplus`, etc.
#
# Without this install, lean-theorist agents write Invariants.lean files but
# cannot verify them (observed 2026-04-25: W01 H200 produced Paper 22 invariant
# 4 closed but flagged "I cannot run lake build in this sandbox" per
# anti-pattern rule_2/rule_6 honest disclosure).
#
# Idempotent: skip if elan already present.
# ---------------------------------------------------------------------------
if echo "${HOLOSCRIPT_AGENT_BRAIN:-}" | grep -qE 'lean[^/]*brain'; then
  if ! command -v lake >/dev/null 2>&1; then
    echo "[bootstrap] installing Lean toolchain (elan + lake) for brain=$HOLOSCRIPT_AGENT_BRAIN…"
    curl --proto '=https' --tlsv1.2 -sSf https://raw.githubusercontent.com/leanprover/elan/master/elan-init.sh \
      | sh -s -- -y --default-toolchain leanprover/lean4:v4.15.0 2>&1 | tail -3 || true
    if ! grep -q "elan" /root/.bashrc 2>/dev/null; then
      echo 'export PATH="$HOME/.elan/bin:$PATH"' >> /root/.bashrc
    fi
    export PATH="$HOME/.elan/bin:$PATH"
    if command -v lake >/dev/null 2>&1; then
      echo "[bootstrap] lean toolchain ready: $(lean --version 2>&1 | head -1)"
    else
      echo "[bootstrap] WARN: elan install completed but lake not on PATH"
    fi
  else
    echo "[bootstrap] lean toolchain already installed, skipping"
  fi
else
  echo "[bootstrap] brain ($HOLOSCRIPT_AGENT_BRAIN) does not need Lean toolchain — skipping elan install"
fi

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
  # GPU-tier model selection. nvidia-smi reports VRAM in MiB; convert to GB
  # then pick the highest-tier model from gpu-tier-models.json whose min_gb
  # threshold is <= reported VRAM. Override via HOLOSCRIPT_AGENT_LOCAL_LLM_MODEL_OVERRIDE
  # in agent.env (or LOCAL_LLM_MODEL) wins. Fallback: Qwen 0.5B for any GPU.
  TIER_TABLE="$WORKSPACE/scripts/mesh-deploy/gpu-tier-models.json"
  # Allow LOCAL_LLM_MODEL to be unset (`set -u` mode); default to empty.
  if [ -z "${LOCAL_LLM_MODEL:-}" ] && [ -f "$TIER_TABLE" ] && command -v nvidia-smi >/dev/null 2>&1; then
    VRAM_MIB=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits 2>/dev/null | head -1 | tr -d ' ')
    if [ -n "$VRAM_MIB" ] && [ "$VRAM_MIB" -gt 0 ] 2>/dev/null; then
      VRAM_GB=$(( VRAM_MIB / 1024 ))
      echo "[bootstrap] GPU VRAM detected: ${VRAM_GB} GB (${VRAM_MIB} MiB)"
      # Pick highest tier whose min_gb <= VRAM_GB
      PICKED=$(VRAM_GB="$VRAM_GB" TIER_TABLE="$TIER_TABLE" python3 -c "
import json, os
v = int(os.environ['VRAM_GB'])
table = json.load(open(os.environ['TIER_TABLE']))
for tier in table['tiers']:
    if v >= tier['min_gb']:
        print(tier['model'])
        break
" 2>/dev/null)
      if [ -n "$PICKED" ]; then
        LLM_MODEL="$PICKED"
        # Also extract vllm_args + expected_first_token_ms for log + bind-poll tuning
        EXTRA_ARGS=$(VRAM_GB="$VRAM_GB" TIER_TABLE="$TIER_TABLE" python3 -c "
import json, os
v = int(os.environ['VRAM_GB'])
table = json.load(open(os.environ['TIER_TABLE']))
for tier in table['tiers']:
    if v >= tier['min_gb']:
        print(' '.join(tier.get('vllm_args', [])))
        break
" 2>/dev/null)
        echo "[bootstrap] tier-selected model: $LLM_MODEL"
        echo "[bootstrap] extra vllm args: $EXTRA_ARGS"
      fi
    fi
  fi
  LLM_MODEL="${LLM_MODEL:-Qwen/Qwen2.5-0.5B-Instruct}"
  EXTRA_ARGS="${EXTRA_ARGS:-}"
  # Default to 8081 — Vast.ai instances ship with Jupyter notebook bound to
  # 8080 (observed 2026-04-25: every mesh instance's port 8080 was held by
  # `jupyter-notebook ... --port=8080`, silently shadowing vLLM and leaving
  # 16 local-llm workers unable to reach their LLM despite claiming tasks).
  LLM_PORT="${LOCAL_LLM_PORT:-8081}"

  # ── Idempotency: skip if vLLM already running and healthy ──────────────────
  # Re-bootstrap of the same instance (retry, update, idempotent deploy) must
  # not fatal-exit on port collision. Matches sidecar guard pattern (line 417)
  # but with smarter /proc/$PID/cmdline inspection: only reclaim the port if
  # the owning process is actually vLLM. Non-vLLM owners (Jupyter, SSH, etc.)
  # are never killed — the start is skipped and a warning is logged instead.
  # This prevents the previous exit-5-on-any-collision behavior that broke retry
  # and re-bootstrap on Vast.ai instances where port 8081 can be held by
  # unrelated system processes.
  VLLM_ALREADY_UP=0
  if ss -ltn 2>/dev/null | awk '{print $4}' | grep -qE ":${LLM_PORT}$"; then
    # Find the PID owning the port (prefer lsof; fall back to ss -ltnp parse)
    _PORT_PID=$(lsof -ti :${LLM_PORT} 2>/dev/null || ss -ltnp 2>/dev/null | awk -v p=":${LLM_PORT}" '$0~p{for(i=1;i<=NF;i++)if(match($i,/^pid=[0-9]+/))print substr($i,5)}' || true)
    # Probe the owning process via /proc/$PID/cmdline to decide whether it's vLLM
    _IS_VLLM=0
    if [ -n "$_PORT_PID" ]; then
      _CMDLINE=$(tr '\0' ' ' < "/proc/${_PORT_PID}/cmdline" 2>/dev/null || true)
      if echo "$_CMDLINE" | grep -qiE 'vllm[./]|vllm\.entrypoints'; then
        _IS_VLLM=1
      fi
    fi

    if curl -sf "http://localhost:${LLM_PORT}/v1/models" > /dev/null 2>&1; then
      echo "[bootstrap] vLLM already running on port $LLM_PORT and healthy — skipping start"
      export HOLOSCRIPT_AGENT_LOCAL_LLM_BASE_URL="http://localhost:$LLM_PORT"
      VLLM_ALREADY_UP=1
    elif [ "$_IS_VLLM" = "1" ]; then
      # Port held by vLLM but NOT healthy — stale/zombie vLLM. Safe to reclaim.
      echo "[bootstrap] port $LLM_PORT held by stale vLLM (pid $_PORT_PID) — reclaiming..."
      kill "$_PORT_PID" 2>/dev/null || true
      sleep 2
    else
      # Port held by a NON-vLLM process (Jupyter, SSH, etc.). Never kill it.
      # Match sidecar behavior: skip start and warn. Agent will fall back to
      # HOLOSCRIPT_AGENT_LOCAL_LLM_BASE_URL or fail gracefully at runtime.
      echo "[bootstrap] WARN: port $LLM_PORT held by non-vLLM process (pid ${_PORT_PID:-unknown}, cmd: ${_CMDLINE:-unknown}) — skipping vLLM start. Set LOCAL_LLM_PORT to a free port." >&2
      VLLM_ALREADY_UP=1  # prevent vLLM start block; agent runtime decides what to do
    fi
  fi

  if [ "$VLLM_ALREADY_UP" = "1" ]; then
    : # nothing more to do for main vLLM
  else
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
  # Vast.ai conda base images often ship PyTorch compiled for CUDA 13.0 (cu130)
  # but most instances run NVIDIA drivers that only support up to CUDA 12.8.
  # PyTorch cu130 refuses to init when the driver is <575.x, causing vLLM to
  # crash with "Engine core initialization failed".  Detect this mismatch and
  # downgrade torch to cu124 (compatible with CUDA 12.4-12.8 drivers) before
  # installing vLLM, so vLLM inherits the compatible torch instead of upgrading.
  if "$PY_BIN" -c "import torch; v=torch.__version__; exit(0 if '+cu130' not in v and '+cu13' not in v else 1)" 2>/dev/null; then
    echo "[bootstrap] torch CUDA version OK (no cu130 mismatch)"
  else
    echo "[bootstrap] torch cu130/cu13x detected but driver may be <CUDA13 — reinstalling with cu124"
    $PIP_BIN install --quiet "torch" --index-url https://download.pytorch.org/whl/cu124 || true
  fi
  $PIP_BIN install --quiet vllm || true
  # AWQ models need autoawq for vLLM to recognize the quantization format.
  # Cheap to install if model is non-AWQ; required if it is.
  if echo "$LLM_MODEL" | grep -qi "awq"; then
    $PIP_BIN install --quiet autoawq || true
  fi
  # Blackwell (sm_120 / compute 12.x) workaround:
  # (1) FlashInfer checks compute capability as a string — "12.0" < "7.5"
  #     lexicographically (lex: "1" < "7"), so sm_120 incorrectly fails the
  #     "sm75+" check in both attention AND sampling (topk_topp_sampler.py).
  # (2) --enforce-eager disables CUDA Graph compilation (attention path).
  # (3) Uninstalling flashinfer makes vLLM fall back to Triton for sampling,
  #     removing the broken FlashInfer sampler path entirely.
  # Both fixes are needed; either alone is insufficient.
  BLACKWELL_EAGER=""
  GPU_SM=$("$PY_BIN" -c "
import torch
if torch.cuda.is_available():
    p = torch.cuda.get_device_properties(0)
    print(f'{p.major}')
" 2>/dev/null || echo "0")
  if [ -n "$GPU_SM" ] && [ "$GPU_SM" -ge 10 ] 2>/dev/null; then
    echo "[bootstrap] Blackwell/future GPU (sm_${GPU_SM}x) detected — adding --enforce-eager + uninstalling flashinfer for Triton fallback"
    BLACKWELL_EAGER="--enforce-eager"
    $PIP_BIN uninstall -y flashinfer flashinfer-python 2>/dev/null || true
  fi
  # EXTRA_ARGS comes from gpu-tier-models.json (e.g. --max-model-len 16384
  # --gpu-memory-utilization 0.92 for 72B-class models). Word-split intentional;
  # entries are pre-quoted in the JSON.
  nohup "$PY_BIN" -m vllm.entrypoints.openai.api_server \
    --model "$LLM_MODEL" \
    --port "$LLM_PORT" \
    $EXTRA_ARGS \
    $BLACKWELL_EAGER \
    > "$LOG_DIR/vllm.log" 2>&1 &
  echo $! > "$LOG_DIR/vllm.pid"
  # Adapter (@holoscript/llm-provider local-llm) appends `/v1/chat/completions`
  # to base_url. Export the bare host:port — adding `/v1` here causes URL
  # doubling (`/v1/v1/chat/completions` -> 404). Observed 2026-04-25 across
  # mw02 H100 NVL + mw03 A100 (vllm.log: `POST /v1/v1/chat/completions 404`).
  # Defense-in-depth: adapter constructor also strips trailing `/v1` (see
  # packages/llm-provider/src/adapters/local-llm.ts) so either form works.
  export HOLOSCRIPT_AGENT_LOCAL_LLM_BASE_URL="http://localhost:$LLM_PORT"
  # Big-model grace: 0.5B = ~1GB download, 7B = ~5GB, 72B-AWQ = ~36GB.
  # Vast HF download speed is typically 100-500 MB/s, so 72B can take 5-15 min
  # cold. 60 polls × 15s = 900s = 15min ceiling.
  GRACE_POLLS=60
  POLL_S=15
  echo "[bootstrap] waiting up to $((GRACE_POLLS * POLL_S))s for vLLM to load $LLM_MODEL (poll every ${POLL_S}s)…"
  vllm_up=0
  for attempt in $(seq 1 $GRACE_POLLS); do
    sleep $POLL_S
    if curl -sf "http://localhost:$LLM_PORT/v1/models" > /dev/null 2>&1; then
      vllm_up=1
      echo "[bootstrap] vLLM responding on $LLM_PORT (attempt $attempt = ~$((attempt * POLL_S))s)"
      break
    fi
  done
  if [ "$vllm_up" = "0" ]; then
    echo "[bootstrap] FATAL: vLLM did not bind $LLM_PORT within $((GRACE_POLLS * POLL_S))s — see $LOG_DIR/vllm.log" >&2
    tail -30 "$LOG_DIR/vllm.log" >&2 || true
    exit 6
  fi
  fi # closes VLLM_ALREADY_UP else
fi

# ---------------------------------------------------------------------------
# Sidecars: co-located vLLM processes for specialist models (AMBER §7)
# ---------------------------------------------------------------------------
# HOLOSCRIPT_AGENT_SIDECARS is a JSON array passed by the deployer.
# Each entry: {"name":"lean-prover","model":"Goedel-LM/Goedel-Prover-V2-7B",
#              "port":8082,"vllm_args":["--enforce-eager","--gpu-memory-utilization=0.10"]}
# GPU sharing: each sidecar gets a VRAM slice via --gpu-memory-utilization.
# The main vLLM already claimed its slice above; sidecars must fit in remainder.
if [ -n "${HOLOSCRIPT_AGENT_SIDECARS:-}" ]; then
  echo "[bootstrap] parsing sidecars from env..."
  _SC_COUNT=$(echo "$HOLOSCRIPT_AGENT_SIDECARS" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo 0)
  if [ "$_SC_COUNT" -gt 0 ] 2>/dev/null; then
    for _SC_IDX in $(seq 0 $((_SC_COUNT - 1))); do
      _SC_NAME=$(echo "$HOLOSCRIPT_AGENT_SIDECARS" | python3 -c "import sys,json,os; d=json.load(sys.stdin)[int(os.environ['IDX'])]; print(d['name'])" IDX="$_SC_IDX" 2>/dev/null)
      _SC_MODEL=$(echo "$HOLOSCRIPT_AGENT_SIDECARS" | python3 -c "import sys,json,os; d=json.load(sys.stdin)[int(os.environ['IDX'])]; print(d['model'])" IDX="$_SC_IDX" 2>/dev/null)
      _SC_PORT=$(echo "$HOLOSCRIPT_AGENT_SIDECARS" | python3 -c "import sys,json,os; d=json.load(sys.stdin)[int(os.environ['IDX'])]; print(d['port'])" IDX="$_SC_IDX" 2>/dev/null)
      _SC_ARGS=$(echo "$HOLOSCRIPT_AGENT_SIDECARS" | python3 -c "import sys,json,os; d=json.load(sys.stdin)[int(os.environ['IDX'])]; print(' '.join(d.get('vllm_args',[])))" IDX="$_SC_IDX" 2>/dev/null)
      _SC_ENVVAR=$(echo "$HOLOSCRIPT_AGENT_SIDECARS" | python3 -c "import sys,json,os; d=json.load(sys.stdin)[int(os.environ['IDX'])]; print(d.get('consumed_by_env_var',''))" IDX="$_SC_IDX" 2>/dev/null)

      if [ -z "$_SC_NAME" ] || [ -z "$_SC_MODEL" ] || [ -z "$_SC_PORT" ]; then
        echo "[bootstrap] WARN: sidecar[$_SC_IDX] missing required fields — skipping" >&2
        continue
      fi

      # Port collision guard
      if ss -ltn 2>/dev/null | awk '{print $4}' | grep -qE ":${_SC_PORT}$"; then
        echo "[bootstrap] WARN: sidecar $_SC_NAME port $_SC_PORT already in use — skipping" >&2
        continue
      fi

      echo "[bootstrap] starting sidecar $_SC_NAME: $_SC_MODEL on port $_SC_PORT"
      nohup "$PY_BIN" -m vllm.entrypoints.openai.api_server \
        --model "$_SC_MODEL" \
        --port "$_SC_PORT" \
        $_SC_ARGS \
        > "$LOG_DIR/sidecar-${_SC_NAME}.log" 2>&1 &
      _SC_PID=$!
      echo $_SC_PID > "$LOG_DIR/sidecar-${_SC_NAME}.pid"

      # Wait for sidecar to be ready (shorter grace than main vLLM)
      _SC_UP=0
      for _SC_ATTEMPT in $(seq 1 30); do
        sleep 5
        if curl -sf "http://localhost:${_SC_PORT}/v1/models" >/dev/null 2>&1; then
          _SC_UP=1
          echo "[bootstrap] sidecar $_SC_NAME responding on $_SC_PORT (attempt $_SC_ATTEMPT)"
          break
        fi
      done
      if [ "$_SC_UP" = "0" ]; then
        echo "[bootstrap] WARN: sidecar $_SC_NAME did not bind $_SC_PORT within 150s — see $LOG_DIR/sidecar-${_SC_NAME}.log" >&2
      fi

      # Export URL for agent runtime dispatch
      if [ -n "$_SC_ENVVAR" ]; then
        export "${_SC_ENVVAR}=http://localhost:${_SC_PORT}/v1"
        echo "[bootstrap] exported ${_SC_ENVVAR}=http://localhost:${_SC_PORT}/v1"
      fi
    done
  fi
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
SYSTEMD_UNIT="/etc/systemd/system/holoscript-agent.service"

# 2026-04-25 lock-in: install as a systemd service so the agent survives
# - the SSH session ending (the original `nohup` problem),
# - the box rebooting,
# - the agent process crashing (Restart=on-failure).
# Falls back to legacy nohup path if systemd isn't available (e.g.
# minimal-image instances without an init system).
USE_SYSTEMD=0
if command -v systemctl >/dev/null 2>&1 && [ -d /run/systemd/system ]; then
  USE_SYSTEMD=1
fi

if [ "$USE_SYSTEMD" = "1" ]; then
  echo "[bootstrap] installing systemd unit at $SYSTEMD_UNIT…"
  WORKDIR="$WORKSPACE/packages/holoscript-agent"
  NODE_BIN=$(command -v node || echo /usr/bin/node)
  # Snapshot the env vars the agent runtime needs into the unit's
  # Environment= directives. Sensitive values (API keys + bearers) are
  # written to /root/.holoscript-agent.env (mode 600) and loaded via
  # EnvironmentFile so they don't leak into systemctl status output.
  ENV_FILE="/root/.holoscript-agent.env"
  : > "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  for var in HOLOSCRIPT_AGENT_HANDLE HOLOSCRIPT_AGENT_PROVIDER HOLOSCRIPT_AGENT_MODEL \
             HOLOSCRIPT_AGENT_BRAIN HOLOSCRIPT_AGENT_WALLET HOLOSCRIPT_AGENT_X402_BEARER \
             HOLOSCRIPT_AGENT_BUDGET_USD_DAY HOLOSCRIPT_AGENT_LOCAL_LLM_BASE_URL \
             HOLOMESH_TEAM_ID ANTHROPIC_API_KEY OPENAI_API_KEY GEMINI_API_KEY; do
    if [ -n "${!var:-}" ]; then
      printf '%s=%s\n' "$var" "${!var}" >> "$ENV_FILE"
    fi
  done

  cat > "$SYSTEMD_UNIT" <<UNIT
[Unit]
Description=HoloScript Headless Agent (handle=$HOLOSCRIPT_AGENT_HANDLE)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$WORKDIR
EnvironmentFile=$ENV_FILE
ExecStart=$NODE_BIN dist/index.js run
# Preemption checkpoint: send SIGTERM early so gpu-runner.mjs can write
# checkpoint to R2 before the SIGKILL deadline. The runner's SIGTERM handler
# writes checkpoint and exits with code 143. KillMode=mixed ensures children
# are also signaled. TimeoutStopSec gives 15s for checkpoint before SIGKILL.
ExecStopPost=/bin/sh -c 'echo "[systemd] agent stopped at $(date -u +%FT%TZ)" >> $LOG_DIR/agent.log 2>/dev/null || true'
StandardOutput=append:$LOG_DIR/agent.log
StandardError=append:$LOG_DIR/agent.log
# Self-heal on crash. RestartSec=10s gives time for a vLLM bounce.
Restart=on-failure
RestartSec=10s
# Cap restart loop. After 5 failures within 60s, stop trying — operator
# must intervene (rather than burn budget on a deterministically-broken
# config).
StartLimitBurst=5
StartLimitIntervalSec=60
# Process management. Kill children too on stop.
# TimeoutStopSec=15s gives the runner time to checkpoint before SIGKILL.
KillMode=mixed
TimeoutStopSec=15

[Install]
WantedBy=multi-user.target
UNIT

  systemctl daemon-reload
  # Stop any prior nohup-launched agent before swapping to systemd
  if [ -f "$AGENT_PID_FILE" ]; then
    OLD_PID=$(cat "$AGENT_PID_FILE" 2>/dev/null || echo "")
    if [ -n "$OLD_PID" ] && kill -0 "$OLD_PID" 2>/dev/null; then
      echo "[bootstrap] killing previous nohup-style agent (pid $OLD_PID) before systemd takeover…"
      kill "$OLD_PID" || true
      sleep 2
    fi
    rm -f "$AGENT_PID_FILE"
  fi

  systemctl enable holoscript-agent.service >/dev/null 2>&1 || true
  systemctl restart holoscript-agent.service

  sleep 3
  if systemctl is-active --quiet holoscript-agent.service; then
    AGENT_PID=$(systemctl show -p MainPID --value holoscript-agent.service)
    echo "$AGENT_PID" > "$AGENT_PID_FILE"
    echo "[bootstrap] DONE — agent running under systemd as pid $AGENT_PID"
    echo "[bootstrap] tail logs: journalctl -u holoscript-agent -f  OR  tail -f $LOG_DIR/agent.log"
    echo "[bootstrap] restart:   systemctl restart holoscript-agent"
    echo "[bootstrap] stop:      systemctl stop holoscript-agent"
  else
    echo "[bootstrap] FATAL: systemd unit failed to start — see $LOG_DIR/agent.log + journalctl -u holoscript-agent" >&2
    journalctl -u holoscript-agent --no-pager -n 30 >&2 || true
    tail -20 "$LOG_DIR/agent.log" >&2 || true
    exit 4
  fi
else
  # Fallback: legacy nohup path for environments without systemd.
  if [ -f "$AGENT_PID_FILE" ]; then
    OLD_PID=$(cat "$AGENT_PID_FILE")
    if kill -0 "$OLD_PID" 2>/dev/null; then
      echo "[bootstrap] killing previous agent (pid $OLD_PID)…"
      kill "$OLD_PID" || true
      sleep 2
    fi
  fi

  echo "[bootstrap] systemd unavailable — falling back to nohup with supervisor wrapper (auto-restart on crash)"

  # 2026-04-26 supervisor wrapper (closes task_1777163982082_ixjz):
  # mw02 + mw03 both crashed silently after iter ~12 on a real task and
  # produced $0 work for hours because the bare nohup launch had no
  # auto-restart on crash. The systemd path (above) handles this with
  # Restart=on-failure + StartLimitBurst=5/60s; the nohup fallback now
  # mirrors that contract via an outer bash loop so Vast.ai instances
  # (no systemd) get the same self-heal behaviour.
  SUPERVISOR_SCRIPT="$LOG_DIR/agent-supervisor.sh"
  cat > "$SUPERVISOR_SCRIPT" <<'SUPER'
#!/usr/bin/env bash
# Auto-generated by bootstrap-agent.sh — supervisor for the holoscript-agent
# nohup fallback path. Mimics the systemd unit's Restart=on-failure +
# StartLimitBurst=5/StartLimitIntervalSec=60s defaults.
set -u
WORKDIR="$1"
LOG="$2"
MAX_RESTARTS_PER_WINDOW=5
WINDOW_SEC=60
RESTART_DELAY_SEC=10

cd "$WORKDIR"
declare -a RESTART_TS=()

while true; do
  echo "[supervisor $(date -u +%FT%TZ)] starting agent" >> "$LOG"
  node dist/index.js run >> "$LOG" 2>&1
  EXIT=$?
  NOW=$(date +%s)
  echo "[supervisor $(date -u +%FT%TZ)] agent exited code=$EXIT" >> "$LOG"

  # Prune restart timestamps outside the rolling window
  PRUNED=()
  for ts in "${RESTART_TS[@]}"; do
    if [ $((NOW - ts)) -lt "$WINDOW_SEC" ]; then PRUNED+=("$ts"); fi
  done
  RESTART_TS=("${PRUNED[@]}" "$NOW")

  if [ "${#RESTART_TS[@]}" -ge "$MAX_RESTARTS_PER_WINDOW" ]; then
    echo "[supervisor $(date -u +%FT%TZ)] HALT — ${#RESTART_TS[@]} restarts in ${WINDOW_SEC}s; giving up (deterministic crash). Operator must intervene." >> "$LOG"
    exit 5
  fi

  sleep "$RESTART_DELAY_SEC"
done
SUPER
  chmod +x "$SUPERVISOR_SCRIPT"

  nohup "$SUPERVISOR_SCRIPT" "$WORKSPACE/packages/holoscript-agent" "$LOG_DIR/agent.log" > "$LOG_DIR/supervisor.log" 2>&1 &
  AGENT_PID=$!
  echo "$AGENT_PID" > "$AGENT_PID_FILE"

  sleep 3
  if ! kill -0 "$AGENT_PID" 2>/dev/null; then
    echo "[bootstrap] FATAL: supervisor died within 3s — see $LOG_DIR/supervisor.log + $LOG_DIR/agent.log" >&2
    tail -20 "$LOG_DIR/supervisor.log" >&2 || true
    tail -20 "$LOG_DIR/agent.log" >&2 || true
    exit 4
  fi

  echo "[bootstrap] DONE — supervisor running as pid $AGENT_PID, restart cap ${MAX_RESTARTS_PER_WINDOW:-5}/${WINDOW_SEC:-60}s"
  echo "[bootstrap] tail logs: tail -f $LOG_DIR/agent.log  (supervisor: tail -f $LOG_DIR/supervisor.log)"
fi
echo "[bootstrap] $(date -u +%FT%TZ) bootstrap complete"
