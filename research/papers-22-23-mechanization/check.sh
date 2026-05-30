#!/usr/bin/env bash
# check.sh — kernel-check gate for Papers 22/23 Lean mechanization.
#
# Compiles the MSC + HSCore libraries and runs the `#print axioms` axiom-hole
# gate (KernelCheck.lean). Exits non-zero on ANY build error or if any checked
# theorem depends on `sorryAx` (a sorry / renamed axiom-hole). This is the
# "fails green" gate the paper-22 ratchet task requires.
#
# Usage:  ./check.sh
set -euo pipefail

cd "$(dirname "$0")"

echo "== lake build (MSC + HSCore + gate) =="
lake build

echo
echo "== lake exe kernelcheck (axiom-hole gate) =="
lake exe kernelcheck

echo
echo "OK: build clean and no sorryAx in any checked theorem."
