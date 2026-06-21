#!/usr/bin/env bash
# A-009 Phase 1: parse the example corpus with the canonical Node parser sweep.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [ -n "${NODE_BIN:-}" ]; then
  NODE_CMD="$NODE_BIN"
elif command -v node >/dev/null 2>&1; then
  NODE_CMD="$(command -v node)"
elif command -v node.exe >/dev/null 2>&1; then
  NODE_CMD="$(command -v node.exe)"
elif [ -x "/c/Program Files/nodejs/node.exe" ]; then
  NODE_CMD="/c/Program Files/nodejs/node.exe"
else
  echo "ERROR: node executable not found; set NODE_BIN to the Node.js binary" >&2
  exit 127
fi

to_node_path() {
  local p="$1"
  if [[ "$p" =~ ^/mnt/([a-zA-Z])/(.*)$ ]]; then
    printf '%s:/%s' "${BASH_REMATCH[1]^^}" "${BASH_REMATCH[2]}"
  elif [[ "$p" =~ ^/([a-zA-Z])/(.*)$ ]]; then
    printf '%s:/%s' "${BASH_REMATCH[1]^^}" "${BASH_REMATCH[2]}"
  else
    printf '%s' "$p"
  fi
}

SCRIPT_PATH="$ROOT/scripts/a009-parse-examples.mjs"
case "$(basename "$NODE_CMD")" in
  node.exe) SCRIPT_PATH="$(to_node_path "$SCRIPT_PATH")" ;;
esac

"$NODE_CMD" "$SCRIPT_PATH"
