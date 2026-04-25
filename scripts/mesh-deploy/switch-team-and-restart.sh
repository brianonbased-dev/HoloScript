#!/bin/bash
# Update HOLOMESH_TEAM_ID on every reachable mesh instance + restart agent.
#
# Pulls live ssh host:port from `vastai show instances` so it works against
# whatever's currently running. Maps instance -> mesh-worker handle by index
# order (matches deploy.py's index-mod fill). For each instance:
#   1. ssh in
#   2. sed-update HOLOMESH_TEAM_ID in /root/agent.env
#   3. kill the old agent daemon (pid in /root/agent-logs/agent.pid)
#   4. relaunch via /root/runner.sh's nohup pattern
#
# Usage: bash switch-team-and-restart.sh <new_team_id> [<count>]
#   count = number of first-N instances to switch (default = all)

set -uo pipefail

NEW_TEAM_ID="${1:?usage: switch-team-and-restart.sh <new_team_id> [<count>]}"
COUNT="${2:-99}"
SSH_KEY="$HOME/.ssh/id_rsa"

# Pull host:port for each running instance, sorted by id (matches deploy plan order)
mapfile -t INSTANCES < <(vastai show instances --raw 2>/dev/null \
  | python3 -c "
import json, sys
data = json.load(sys.stdin)
running = sorted([i for i in data if i.get('actual_status')=='running'], key=lambda x: x['id'])
for i in running:
    p = (i.get('ports') or {}).get('22/tcp')
    port = p[0]['HostPort'] if isinstance(p, list) and p else None
    ip = i.get('public_ipaddr')
    if port and ip:
        print(f\"{i['id']} {ip} {port}\")
")

echo "Found ${#INSTANCES[@]} running instances; switching first $COUNT to $NEW_TEAM_ID"

ok=0
fail=0
idx=1
for entry in "${INSTANCES[@]}"; do
  [ "$idx" -gt "$COUNT" ] && break
  read -r inst_id host port <<< "$entry"
  worker=$(printf "mesh-worker-%02d" "$idx")
  echo -n "[$worker] inst=$inst_id $host:$port ... "
  if timeout 30 ssh -o StrictHostKeyChecking=no -o BatchMode=yes -o ConnectTimeout=10 \
      -i "$SSH_KEY" -p "$port" "root@$host" "
        set -e
        sed -i 's|^HOLOMESH_TEAM_ID=.*|HOLOMESH_TEAM_ID=$NEW_TEAM_ID|' /root/agent.env
        if [ -f /root/agent-logs/agent.pid ]; then
          OLD_PID=\$(cat /root/agent-logs/agent.pid)
          kill \"\$OLD_PID\" 2>/dev/null || true
          sleep 1
        fi
        cd /root/holoscript-mesh/packages/holoscript-agent
        set -a; source /root/agent.env; set +a
        nohup node dist/index.js run > /root/agent-logs/agent.log 2>&1 &
        echo \$! > /root/agent-logs/agent.pid
        sleep 2
        kill -0 \"\$(cat /root/agent-logs/agent.pid)\" && echo OK
      " 2>&1 | tail -1 | grep -q OK; then
    ok=$((ok+1)); echo "OK"
  else
    fail=$((fail+1)); echo "FAIL"
  fi
  idx=$((idx+1))
done

echo ""
echo "=== $ok switched, $fail failed ==="
