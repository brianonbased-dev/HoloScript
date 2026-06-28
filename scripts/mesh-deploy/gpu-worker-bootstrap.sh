#!/usr/bin/env bash
# gpu-worker-bootstrap.sh -- CANONICAL vast.ai GPU worker supervisor for the HoloScript fleet.
#
# This is the standard vast.ai fleet onboarding script. It turns a rented vast.ai
# GPU box into a fleet worker: install a compute lane (default: cuQuantum simulation),
# then poll the orchestrator GPU queue, run claimed job commands, and report results.
#
# Replaces the previously-referenced-but-missing bootstrap-agent.sh for the GPU worker
# role. bootstrap-agent.sh remains the full mesh-agent onboarding (node, repo, agent
# daemon, vLLM, sidecars, systemd); this script is the lightweight compute-worker
# counterpart that only needs Python + the orchestrator API.
#
# Worker contract (mcp-orchestrator src/routes/gpuRoutes.ts), all role=agent:
#   GET  /gpu/next?seat=<seat>&lane=gpu -> 200 {id, command, tier, ...}  or  204 (empty)
#   POST /gpu/seats/:id/heartbeat  -> prove the seat poller is alive while idle
#   POST /gpu/job/:id/heartbeat    -> keep-alive while running
#   POST /gpu/job/:id/done         -> {artifact_path?, artifact_sha256?, error?, paper_id?}
#                                      error=null => success; error set => failure
#
# CUQUANTUM GOTCHAS (encoded in fleet-cuquantum-setup.sh):
#   1. Pin qiskit==1.4.4 — qiskit 2.x removed convert_to_target, breaking qiskit-aer-gpu.
#   2. CUDA-13 pip wheels (nvidia-*-cu13) are unbuildable stubs — fetch runtime .so from
#      NVIDIA redist tarballs instead.
#   3. Persist LD_LIBRARY_PATH to /etc/profile.d — the worker runs jobs via bash -lc
#      (a login shell), so without this the job process can't find libcublas.so.13 even
#      when the install process could.
#
# Use as a vast.ai onstart command (after cloning the repo):
#   ORCHESTRATOR_URL=... HOLOSCRIPT_API_KEY=... REPO_URL=... bash scripts/mesh-deploy/gpu-worker-bootstrap.sh
#
# SECURITY (F.001 — keys leaked twice): pass HOLOSCRIPT_API_KEY via the environment only.
# Never bake it into the image, the onstart string in plaintext logs, or a committed file.
set -uo pipefail

ORCH="${ORCHESTRATOR_URL:-https://mcp-orchestrator-production-45f9.up.railway.app}"
: "${HOLOSCRIPT_API_KEY:?HOLOSCRIPT_API_KEY required (agent role) — pass via env, never hardcode}"
SEAT="${GPU_SEAT:-vast-$(hostname 2>/dev/null || echo node)-$$}"
LANE="${GPU_LANE:-gpu}"
REPO_DIR="${REPO_DIR:-$HOME/.ai-ecosystem}"
POLL_INTERVAL="${POLL_INTERVAL:-15}"
IDLE_EXIT_AFTER="${IDLE_EXIT_AFTER:-0}"   # seconds of empty queue before self-exit (0 = never)
SEAT_REJECT_MAX="${SEAT_REJECT_MAX:-6}"    # consecutive seat_rejected polls before self-exit
LOG="[gpu-worker:$SEAT]"

# Resolve script directory for relative paths to sibling scripts (e.g. fleet-cuquantum-setup.sh)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

api() { # method path [json-body]
  local method="$1" path="$2" body="${3:-}"
  if [ -n "$body" ]; then
    curl -fsS -X "$method" "$ORCH$path" -H "x-mcp-api-key: $HOLOSCRIPT_API_KEY" \
         -H "Content-Type: application/json" -d "$body"
  else
    curl -sS -X "$method" "$ORCH$path" -H "x-mcp-api-key: $HOLOSCRIPT_API_KEY" -w '\n%{http_code}'
  fi
}

# 1. ensure repo present + compute lane installed ----------------------------------------
if [ ! -d "$REPO_DIR/.git" ]; then
  [ -n "${REPO_URL:-}" ] || { echo "$LOG FATAL: REPO_URL required to clone (or pre-place $REPO_DIR)"; exit 2; }
  echo "$LOG cloning $REPO_DIR"; git clone --depth 1 "$REPO_URL" "$REPO_DIR" || exit 2
fi
cd "$REPO_DIR" || exit 2

ensure_runtime_tools() {
  if command -v curl >/dev/null 2>&1 && command -v python3 >/dev/null 2>&1 && command -v node >/dev/null 2>&1; then
    return 0
  fi

  echo "$LOG installing missing runtime tools (curl/python3/nodejs) ..."
  if command -v apt-get >/dev/null 2>&1; then
    apt-get update -qq >/dev/null 2>&1 || true
    command -v curl >/dev/null 2>&1 || apt-get install -y -qq curl >/dev/null 2>&1 || {
      echo "$LOG FATAL: cannot install curl"; exit 2;
    }
    command -v python3 >/dev/null 2>&1 || apt-get install -y -qq python3 >/dev/null 2>&1 || {
      echo "$LOG FATAL: cannot install python3"; exit 2;
    }
    if ! command -v node >/dev/null 2>&1; then
      curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null 2>&1 || true
      apt-get install -y -qq nodejs >/dev/null 2>&1 || {
        echo "$LOG FATAL: cannot install nodejs"; exit 2;
      }
    fi
  elif command -v yum >/dev/null 2>&1; then
    yum install -y -q curl python3 nodejs >/dev/null 2>&1 || {
      echo "$LOG FATAL: cannot install curl/python3/nodejs"; exit 2;
    }
  else
    echo "$LOG FATAL: no supported package manager for runtime tools"; exit 2
  fi

  if ! node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 18 ? 0 : 1)" >/dev/null 2>&1; then
    echo "$LOG FATAL: node >=18 required for fleet job commands"; exit 2
  fi
}

ensure_runtime_tools

# 1a. Self-register the seat (gpu lane) so /gpu/next claims aren't rejected. dbClaimNextJob
# REJECTS an unregistered seat ("register via POST /gpu/seats") — without this every worker
# spins idle on HTTP 403 seat_rejected. POST /gpu/seats/self is the agent-key path (lane
# forced ['gpu'], id must be self-namespaced — $SEAT is vast-*). The endpoint is deployed
# (probed 201). Idempotent upsert; non-fatal. (Sync of the ai-ecosystem mirror fix.)
echo "$LOG self-registering seat $SEAT (gpu lane) via /gpu/seats/self"
if api POST "/gpu/seats/self" "{\"id\":\"$SEAT\",\"has_gpu\":true,\"metadata\":\"vast fleet worker\"}" >/dev/null 2>&1; then
  echo "$LOG seat $SEAT registered"
else
  echo "$LOG WARN: self-register non-zero (continuing; seat may already exist or 5xx)"
fi

# Install the cuQuantum simulation lane IN THE BACKGROUND so it does NOT block the poll loop
# (the ~10-15min cuQuantum/cupy install otherwise delayed every worker's first claim). ML/
# solver/render jobs install their own deps; quantum jobs are rare and the lane finishes in
# parallel. Other compute lanes supply their own setup step.
CUQUANTUM_SETUP="${CUQUANTUM_SETUP:-$SCRIPT_DIR/fleet-cuquantum-setup.sh}"
if [ -f "$CUQUANTUM_SETUP" ]; then
  echo "$LOG installing cuQuantum sim lane in background (non-blocking) ..."
  ( bash "$CUQUANTUM_SETUP" >/tmp/cuquantum-setup.log 2>&1 \
      && echo "$LOG cuQuantum lane ready" \
      || echo "$LOG WARN: fleet-cuquantum-setup.sh returned non-zero (see /tmp/cuquantum-setup.log)" ) &
else
  echo "$LOG WARN: $CUQUANTUM_SETUP not found — cuQuantum install skipped (worker will only run non-GPU jobs)"
fi

# 2. poll loop ----------------------------------------------------------------------------
echo "$LOG polling $ORCH/gpu/next (seat=$SEAT lane=$LANE, every ${POLL_INTERVAL}s)"
idle=0
seat_rejects=0
while true; do
  api POST "/gpu/seats/$SEAT/heartbeat" '{}' >/dev/null 2>&1 || true
  resp="$(api GET "/gpu/next?seat=$SEAT&lane=$LANE")"
  code="$(printf '%s' "$resp" | tail -1)"
  body="$(printf '%s' "$resp" | sed '$d')"
  if [ "$code" = "204" ]; then
    seat_rejects=0
    idle=$((idle + POLL_INTERVAL))
    if [ "$IDLE_EXIT_AFTER" -gt 0 ] && [ "$idle" -ge "$IDLE_EXIT_AFTER" ]; then
      echo "$LOG idle ${idle}s >= IDLE_EXIT_AFTER; exiting (worker can be torn down)"; exit 0
    fi
    sleep "$POLL_INTERVAL"; continue
  fi
  if [ "$code" != "200" ]; then
    if printf '%s' "$body" | grep -q 'seat_rejected'; then
      seat_rejects=$((seat_rejects + 1))
      echo "$LOG poll HTTP $code seat_rejected ($seat_rejects/$SEAT_REJECT_MAX): $body"
      if [ "$seat_rejects" -ge "$SEAT_REJECT_MAX" ]; then
        echo "$LOG FATAL: seat rejected $seat_rejects consecutive times; exiting for autoscaler replacement"
        exit 3
      fi
    else
      seat_rejects=0
      echo "$LOG poll HTTP $code: $body"
    fi
    sleep "$POLL_INTERVAL"; continue
  fi
  seat_rejects=0
  idle=0
  jid="$(printf '%s' "$body" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("id",""))')"
  cmd="$(printf '%s' "$body" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("command",""))')"
  [ -n "$jid" ] || { echo "$LOG claimed job with no id; skipping"; continue; }
  echo "$LOG claimed $jid: $cmd"

  # heartbeat in background while the job runs
  ( while true; do
      api POST "/gpu/job/$jid/heartbeat" '{}' >/dev/null 2>&1 || true
      api POST "/gpu/seats/$SEAT/heartbeat" '{}' >/dev/null 2>&1 || true
      sleep 20
    done ) &
  hb=$!

  out_log="/tmp/job-$jid.log"
  if bash -lc "$cmd" >"$out_log" 2>&1; then
    err="null"
  else
    rc=$?
    err="$(python3 -c 'import json,sys;print(json.dumps(f"exit {sys.argv[1]}: "+open(sys.argv[2]).read()[-800:]))' "$rc" "$out_log")"
  fi
  kill "$hb" 2>/dev/null || true

  done_body="$(python3 -c 'import json,sys;e=sys.argv[1];print(json.dumps({"error":None if e=="null" else json.loads(e)}))' "$err")"
  api POST "/gpu/job/$jid/done" "$done_body" >/dev/null 2>&1 \
    && echo "$LOG reported done $jid (error=$([ "$err" = null ] && echo none || echo yes))" \
    || echo "$LOG WARN: failed to report done for $jid"
done
