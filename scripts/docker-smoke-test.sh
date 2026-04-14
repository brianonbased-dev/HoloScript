#!/usr/bin/env bash
# Smoke test for the repo-root docker-compose stack (mcp-server + postgres + studio).
# Usage (from repo root):
#   ./scripts/docker-smoke-test.sh              # fast: validate compose file only
#   DOCKER_SMOKE_UP=1 ./scripts/docker-smoke-test.sh   # slow: build, up --wait, curl health, down
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
COMPOSE=(docker compose -f docker-compose.yml)

echo "== docker compose config (syntax) =="
"${COMPOSE[@]}" config --quiet
echo "OK"

if [[ "${DOCKER_SMOKE_UP:-}" != "1" ]]; then
  echo "Tip: run DOCKER_SMOKE_UP=1 $0 for a full build/up/health/down cycle."
  exit 0
fi

echo "== docker compose up --build --wait =="
"${COMPOSE[@]}" up -d --build --wait

cleanup() {
  "${COMPOSE[@]}" down
}
trap cleanup EXIT

echo "== GET mcp-server /health (host :3101) =="
curl -sfS "http://127.0.0.1:3101/health" | head -c 400 || true
echo

echo "== GET studio root (host :3100) =="
curl -sfS -o /dev/null "http://127.0.0.1:3100/" && echo "studio HTTP OK" || echo "studio not ready (optional)"

echo "== smoke complete =="
