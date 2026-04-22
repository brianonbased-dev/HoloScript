#!/usr/bin/env bash
# Safe HoloMesh entry helpers for agents (vote / comment / seed).
# Binds entry id and body from argv only — no phantom placeholder IDs.
#
# Usage:
#   scripts/room-entry-actions.sh vote <entry-id> [up|down]
#   scripts/room-entry-actions.sh comment <entry-id> <message...>
#   scripts/room-entry-actions.sh seed-custom <message...>
#
# Env: HOLOMESH_API_KEY (and optional HOLOMESH_API_BASE, default holomesh API).

set -euo pipefail

ENV_FILE="${HOME}/.ai-ecosystem/.env"
if [ ! -f "$ENV_FILE" ] && [ -n "${USERPROFILE:-}" ]; then
  ENV_FILE="${USERPROFILE}/.ai-ecosystem/.env"
fi
if [ ! -f "$ENV_FILE" ] && [ -f "/c/Users/josep/.ai-ecosystem/.env" ]; then
  ENV_FILE="/c/Users/josep/.ai-ecosystem/.env"
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE" 2>/dev/null || true
set +a

API="${HOLOMESH_API_BASE:-https://mcp.holoscript.net/api/holomesh}"
KEY="${HOLOMESH_API_KEY:-}"
if [ -z "$KEY" ]; then
  echo "error: HOLOMESH_API_KEY not set (add to ~/.ai-ecosystem/.env)" >&2
  exit 1
fi

cmd="${1:-}"
shift || true

case "$cmd" in
vote)
  ENTRY_ID="${1:-}"
  VALUE="${2:-up}"
  if [ -z "$ENTRY_ID" ]; then
    echo "usage: scripts/room-entry-actions.sh vote <entry-id> [up|down]" >&2
    exit 1
  fi
  VAL=1
  [ "$VALUE" = "down" ] && VAL=-1
  PARENT_STATUS="$(curl -s -o /dev/null -w "%{http_code}" "$API/entry/$ENTRY_ID" -H "Authorization: Bearer $KEY")"
  if [ "$PARENT_STATUS" = "404" ]; then
    echo "error: entry '$ENTRY_ID' not found (aborting to prevent orphan-write)" >&2
    exit 1
  fi
  curl -s -X POST "$API/entry/$ENTRY_ID/vote" \
    -H "Authorization: Bearer $KEY" \
    -H "Content-Type: application/json" \
    -d "{\"value\": $VAL}"
  echo
  ;;
comment)
  ENTRY_ID="${1:-}"
  shift || true
  CONTENT="${*:-}"
  if [ -z "$ENTRY_ID" ] || [ -z "$CONTENT" ]; then
    echo "usage: scripts/room-entry-actions.sh comment <entry-id> <message...>" >&2
    exit 1
  fi
  PARENT_STATUS="$(curl -s -o /dev/null -w "%{http_code}" "$API/entry/$ENTRY_ID" -H "Authorization: Bearer $KEY")"
  if [ "$PARENT_STATUS" = "404" ]; then
    echo "error: entry '$ENTRY_ID' not found (aborting to prevent orphan-write)" >&2
    exit 1
  fi
  PAYLOAD="$(python3 -c "import json,sys; print(json.dumps({'content': sys.argv[1]}))" "$CONTENT")"
  curl -s -X POST "$API/entry/$ENTRY_ID/comment" \
    -H "Authorization: Bearer $KEY" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD"
  echo
  ;;
seed-custom)
  CONTENT="${*:-}"
  if [ -z "$CONTENT" ]; then
    echo "usage: scripts/room-entry-actions.sh seed-custom <message...>" >&2
    exit 1
  fi
  PAYLOAD="$(python3 -c "import json,sys; print(json.dumps({'type':'wisdom','content':sys.argv[1],'domain':'general','tags':['curated','seed'],'confidence':0.9}))" "$CONTENT")"
  curl -s -X POST "$API/contribute" \
    -H "Authorization: Bearer $KEY" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD"
  echo
  ;;
*)
  echo "usage: scripts/room-entry-actions.sh vote|comment|seed-custom ..." >&2
  exit 1
  ;;
esac
