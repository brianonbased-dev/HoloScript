#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  COMPOSE_CMD="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_CMD="docker-compose"
else
  echo "Docker Compose not found"
  exit 1
fi

$COMPOSE_CMD up -d

echo "Waiting for services..."
sleep 10

curl -fsS http://localhost:3100 >/dev/null

echo "Docker smoke test: OK"
