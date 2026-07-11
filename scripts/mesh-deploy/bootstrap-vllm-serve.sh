#!/usr/bin/env bash
# bootstrap-vllm-serve.sh — runs ON a Vast.ai instance to start vLLM + self-register.
#
# Counterpart to vllm-autoscaler.mjs. In the DEFAULT autoscaler flow, the autoscaler
# polls the Vast.ai instance status until running, health-checks vLLM itself, then
# calls POST /serve/register. This script is the ALTERNATIVE path for instances that
# self-register: set this as the onstart command and the instance handles its own
# registration + heartbeat without the autoscaler polling.
#
# Either path (autoscaler-polls or self-register) is valid. The autoscaler only spawns
# a new endpoint for a model if no warm endpoint AND no provisioning endpoint exists,
# so both paths coexist safely (the registered endpoint wins the race).
#
# Required env vars (set via Vast.ai -e flags or Docker env):
#   VLLM_MODEL             model to load (default: Qwen/Qwen2.5-Coder-7B-Instruct-AWQ)
#   VLLM_INFERENCE_KEY     Bearer key for vLLM server (required)
#   ORCH_URL               orchestrator base URL (required for self-register)
#   HOLOSCRIPT_API_KEY     orchestrator agent key (required for self-register)
#   SERVE_ENDPOINT_ID      endpoint id for /serve/register (must start with 'vast-')
#
# Usage: set as vast.ai onstart, combined with env vars via -e flags.
set -uo pipefail

MODEL="${VLLM_MODEL:-Qwen/Qwen2.5-Coder-7B-Instruct-AWQ}"
PORT=8000
INFERENCE_KEY="${VLLM_INFERENCE_KEY:?VLLM_INFERENCE_KEY required}"
ORCH="${ORCH_URL:-}"
API_KEY="${HOLOSCRIPT_API_KEY:-}"
ENDPOINT_ID="${SERVE_ENDPOINT_ID:-}"
HEARTBEAT_S="${HEARTBEAT_INTERVAL_S:-45}"
MAX_MODEL_LEN="${VLLM_MAX_MODEL_LEN:-4096}"
LOG="[bootstrap-vllm]"

# canonical-tool-adoption: exempt — security credential-hygiene fix to an EXISTING operator
# script; adds no new fleet-resource operation (clone/register/heartbeat are unchanged), only
# moves secret headers off argv. Reuses the canonical scripts/mesh-deploy/fleet-source-credential.sh
# (authoring-oracle 2026-07-11 verdict: extend-existing-first). Board task_1783804023183.
#
# Secret headers ride in a mode-600 curl -K config file, never on argv (ps-visible on the shared
# vast.ai host). INLINED from fleet-source-credential.sh (this is a standalone --onstart script and
# cannot source the repo copy); keep in sync.
fsc_curl_with_header() {
  local header="$1"; shift
  local cfg rc
  cfg="$(mktemp 2>/dev/null)" || return 1
  chmod 600 "$cfg" 2>/dev/null || true
  printf 'header = "%s"\n' "$header" > "$cfg"
  curl -K "$cfg" "$@"
  rc=$?
  rm -f "$cfg"
  return "$rc"
}

trap 'kill $VLLM_PID 2>/dev/null; exit 0' SIGTERM SIGINT

echo "$LOG Starting vLLM: $MODEL on :$PORT"
# vLLM reads its server key from VLLM_API_KEY — pass via env, not --api-key, so the key is not
# on the vllm process argv (ps/proc-visible on the shared host).
export VLLM_API_KEY="$INFERENCE_KEY"
python3 -m vllm.entrypoints.openai.api_server \
  --model "$MODEL" \
  --port "$PORT" \
  --host 0.0.0.0 \
  --max-model-len "$MAX_MODEL_LEN" \
  --dtype auto \
  --trust-remote-code \
  2>&1 | tee /tmp/vllm.log &
VLLM_PID=$!

echo "$LOG Waiting for /v1/models (PID=$VLLM_PID)..."
for i in $(seq 1 60); do
  sleep 10
  if fsc_curl_with_header "Authorization: Bearer $INFERENCE_KEY" -sf \
       "http://localhost:$PORT/v1/models" >/dev/null 2>&1; then
    echo "$LOG vLLM healthy after $((i * 10))s"
    break
  fi
  if ! kill -0 $VLLM_PID 2>/dev/null; then
    echo "$LOG FATAL: vLLM process died — last logs:"
    tail -30 /tmp/vllm.log
    exit 1
  fi
  [ "$i" -eq 60 ] && { echo "$LOG FATAL: vLLM not healthy after 600s"; exit 1; }
done

# Self-register if orchestrator env vars present
if [ -n "$ORCH" ] && [ -n "$API_KEY" ] && [ -n "$ENDPOINT_ID" ]; then
  PUBLIC_IP=$(curl -sf https://api.ipify.org 2>/dev/null \
              || hostname -I 2>/dev/null | awk '{print $1}')
  SERVE_URL="http://${PUBLIC_IP}:${PORT}"
  GPU_NAME=$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null \
             | head -1 | tr -d '\n' | tr ' ' '_' || echo unknown)

  echo "$LOG Registering endpoint $ENDPOINT_ID at $SERVE_URL (gpu=$GPU_NAME)"
  fsc_curl_with_header "x-mcp-api-key: ${API_KEY}" -fsS -X POST "${ORCH}/serve/register" \
    -H "Content-Type: application/json" \
    -d "{\"id\":\"${ENDPOINT_ID}\",\"model\":\"${MODEL}\",\"url\":\"${SERVE_URL}\",\"gpu\":\"${GPU_NAME}\"}" \
    && echo "$LOG Registered successfully" \
    || echo "$LOG WARN: registration failed (autoscaler will poll instead)"

  # Heartbeat loop until vLLM exits
  while kill -0 $VLLM_PID 2>/dev/null; do
    fsc_curl_with_header "x-mcp-api-key: ${API_KEY}" -sf -X POST "${ORCH}/serve/heartbeat" \
      -H "Content-Type: application/json" \
      -d "{\"id\":\"${ENDPOINT_ID}\"}" >/dev/null 2>&1 || true
    sleep "$HEARTBEAT_S"
  done

  echo "$LOG vLLM exited — deregistering $ENDPOINT_ID"
  fsc_curl_with_header "x-mcp-api-key: ${API_KEY}" -sf -X POST "${ORCH}/serve/deregister" \
    -H "Content-Type: application/json" \
    -d "{\"id\":\"${ENDPOINT_ID}\"}" >/dev/null 2>&1 || true
else
  # No self-register: just wait for vLLM to exit (autoscaler manages lifecycle)
  wait $VLLM_PID
fi
