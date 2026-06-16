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

trap 'kill $VLLM_PID 2>/dev/null; exit 0' SIGTERM SIGINT

echo "$LOG Starting vLLM: $MODEL on :$PORT"
python3 -m vllm.entrypoints.openai.api_server \
  --model "$MODEL" \
  --port "$PORT" \
  --api-key "$INFERENCE_KEY" \
  --host 0.0.0.0 \
  --max-model-len "$MAX_MODEL_LEN" \
  --dtype auto \
  --trust-remote-code \
  2>&1 | tee /tmp/vllm.log &
VLLM_PID=$!

echo "$LOG Waiting for /v1/models (PID=$VLLM_PID)..."
for i in $(seq 1 60); do
  sleep 10
  if curl -sf -H "Authorization: Bearer $INFERENCE_KEY" \
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
  curl -fsS -X POST "${ORCH}/serve/register" \
    -H "x-mcp-api-key: ${API_KEY}" \
    -H "Content-Type: application/json" \
    -d "{\"id\":\"${ENDPOINT_ID}\",\"model\":\"${MODEL}\",\"url\":\"${SERVE_URL}\",\"gpu\":\"${GPU_NAME}\"}" \
    && echo "$LOG Registered successfully" \
    || echo "$LOG WARN: registration failed (autoscaler will poll instead)"

  # Heartbeat loop until vLLM exits
  while kill -0 $VLLM_PID 2>/dev/null; do
    curl -sf -X POST "${ORCH}/serve/heartbeat" \
      -H "x-mcp-api-key: ${API_KEY}" \
      -H "Content-Type: application/json" \
      -d "{\"id\":\"${ENDPOINT_ID}\"}" >/dev/null 2>&1 || true
    sleep "$HEARTBEAT_S"
  done

  echo "$LOG vLLM exited — deregistering $ENDPOINT_ID"
  curl -sf -X POST "${ORCH}/serve/deregister" \
    -H "x-mcp-api-key: ${API_KEY}" \
    -H "Content-Type: application/json" \
    -d "{\"id\":\"${ENDPOINT_ID}\"}" >/dev/null 2>&1 || true
else
  # No self-register: just wait for vLLM to exit (autoscaler manages lifecycle)
  wait $VLLM_PID
fi
