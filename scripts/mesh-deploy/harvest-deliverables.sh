#!/bin/bash
# Harvest /root/agent-output/ from every reachable mesh instance back to
# a local staging dir for founder review. Runs in parallel via xargs.
#
# Workflow:
#   1. vastai show instances → sorted host:port list
#   2. For each instance: scp -r /root/agent-output/* into
#      research/mesh-deliverables/<instance-id>-<handle>/
#   3. Resolve handle from the instance's /root/agent.env via ssh
#   4. Founder reviews + git-adds the relevant deliverables manually
#
# This is the agent→repo round-trip: agents write to /root/agent-output/,
# this script pulls the writes home, founder cherry-picks the keepers.
# Per founder ruling 2026-04-25: agent CANNOT git-push (wallets-as-identity
# rule, no GitHub PAT in agent env), so harvest is the only legitimate path.
#
# Usage: bash harvest-deliverables.sh [<dest-dir>]
#   dest-dir defaults to research/mesh-deliverables/ in HoloScript repo

set -uo pipefail
DEST="${1:-$HOME/Documents/GitHub/HoloScript/research/mesh-deliverables}"
mkdir -p "$DEST"
SSH_KEY="$HOME/.ssh/id_rsa"
ok=0; empty=0; fail=0

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
  inst_id=$(echo "$entry" | cut -d'|' -f1)
  host=$(echo "$entry" | cut -d'|' -f2)
  port=$(echo "$entry" | cut -d'|' -f3)

  # Resolve handle via /root/agent.env
  handle=$(timeout 8 ssh -o StrictHostKeyChecking=no -o BatchMode=yes -o ConnectTimeout=4 \
    -i "$SSH_KEY" -p "$port" "root@$host" \
    'grep ^HOLOSCRIPT_AGENT_HANDLE /root/agent.env | cut -d= -f2' 2>/dev/null | tr -d '\r\n')
  handle="${handle:-unknown}"
  target="$DEST/${inst_id}-${handle}"

  # Check if /root/agent-output exists + is non-empty
  count=$(timeout 8 ssh -o StrictHostKeyChecking=no -o BatchMode=yes -o ConnectTimeout=4 \
    -i "$SSH_KEY" -p "$port" "root@$host" \
    'find /root/agent-output -type f 2>/dev/null | wc -l' 2>/dev/null | tr -d '\r\n')
  count="${count:-0}"
  if [ "$count" = "0" ]; then
    empty=$((empty+1))
    continue
  fi

  mkdir -p "$target"
  if timeout 60 scp -o StrictHostKeyChecking=no -o BatchMode=yes -i "$SSH_KEY" -P "$port" \
    -r "root@$host:/root/agent-output/." "$target/" 2>/dev/null; then
    ok=$((ok+1))
    echo "[OK]    $handle ($inst_id) → $target ($count files)"
  else
    fail=$((fail+1))
    echo "[FAIL]  $handle ($inst_id) scp from $host:$port"
  fi
done

echo ""
echo "=== harvest: $ok with-deliverables, $empty empty, $fail failed ==="
echo "review under: $DEST"
echo ""
echo "Suggested next: git status $DEST  →  cherry-pick + git add the files you want to ship"
