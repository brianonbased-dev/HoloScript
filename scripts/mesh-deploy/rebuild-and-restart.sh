#!/bin/bash
# Hot-update each mesh instance: git pull origin main, rebuild
# @holoscript/holoscript-agent + workspace deps, restart daemon.
#
# Use this when you've shipped a fix to the agent package and want to
# propagate it to running instances WITHOUT re-running the full bootstrap
# (which reinstalls node + reclones + reruns vLLM, ~5-15 min each).
# This script is ~30-90s per instance after first-run pnpm cache.
#
# Usage: bash rebuild-and-restart.sh [<count>]
#   count = number of first-N instances to update (default = all)

set -uo pipefail

COUNT="${1:-99}"
SSH_KEY="$HOME/.ssh/id_rsa"
LOG_DIR="/tmp/rebuild-logs"
mkdir -p "$LOG_DIR"
ok=0
fail=0
idx=1

for entry in $(vastai show instances --raw 2>/dev/null | python3 -c "
import json, sys
data = json.load(sys.stdin)
running = sorted([i for i in data if i.get('actual_status')=='running'], key=lambda x: x['id'])
for i in running:
    p = (i.get('ports') or {}).get('22/tcp')
    port = p[0]['HostPort'] if isinstance(p, list) and p else None
    if port and i.get('public_ipaddr'):
        print(f\"{i['id']}|{i['public_ipaddr']}|{port}\")
"); do
  [ "$idx" -gt "$COUNT" ] && break
  inst_id=$(echo "$entry" | cut -d'|' -f1)
  host=$(echo "$entry" | cut -d'|' -f2)
  port=$(echo "$entry" | cut -d'|' -f3)
  log="$LOG_DIR/inst-$inst_id.log"

  timeout 180 ssh -o StrictHostKeyChecking=no -o BatchMode=yes -o ConnectTimeout=10 \
    -i "$SSH_KEY" -p "$port" "root@$host" "
      set -e
      cd /root/holoscript-mesh
      git fetch origin main 2>&1 | tail -1
      git reset --hard origin/main 2>&1 | tail -1
      pnpm --filter '@holoscript/holoscript-agent...' build 2>&1 | tail -3
      OLD=\$(cat /root/agent-logs/agent.pid 2>/dev/null)
      [ -n \"\$OLD\" ] && kill \"\$OLD\" 2>/dev/null
      sleep 1
      cd /root/holoscript-mesh/packages/holoscript-agent
      set -a && . /root/agent.env && set +a
      nohup node dist/index.js run > /root/agent-logs/agent.log 2>&1 < /dev/null &
      NP=\$!
      echo \$NP > /root/agent-logs/agent.pid
      sleep 2
      kill -0 \"\$NP\" && echo READY=\$NP
    " > "$log" 2>&1

  if grep -q "READY=" "$log"; then
    ok=$((ok+1)); echo "[OK]   inst=$inst_id $host:$port"
  else
    fail=$((fail+1)); echo "[FAIL] inst=$inst_id tail=$(tail -2 "$log" | tr '\n' ' ' | head -c 120)"
  fi
  idx=$((idx+1))
done
echo "=== $ok rebuilt, $fail failed ==="
