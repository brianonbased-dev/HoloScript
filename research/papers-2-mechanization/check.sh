#!/usr/bin/env bash
# check.sh -- kernel-check gate for the Paper 2 SNN/ReLU bridge.
set -euo pipefail

cd "$(dirname "$0")"

LAKE_BIN="${LAKE_BIN:-lake}"
if ! command -v "$LAKE_BIN" >/dev/null 2>&1; then
  if [ -x "$HOME/.elan/bin/lake" ]; then
    LAKE_BIN="$HOME/.elan/bin/lake"
  elif [ -x "$HOME/.elan/bin/lake.exe" ]; then
    LAKE_BIN="$HOME/.elan/bin/lake.exe"
  elif [ -x "/mnt/c/Users/josep/.elan/bin/lake.exe" ]; then
    LAKE_BIN="/mnt/c/Users/josep/.elan/bin/lake.exe"
  elif [ -x "/c/Users/josep/.elan/bin/lake.exe" ]; then
    LAKE_BIN="/c/Users/josep/.elan/bin/lake.exe"
  fi
fi

echo "== lake build (TropicalBridge + gate) =="
"$LAKE_BIN" build

echo
echo "== lake exe kernelcheck (axiom-hole gate) =="
"$LAKE_BIN" exe kernelcheck

echo
echo "OK: build clean and no sorryAx in any checked theorem."
