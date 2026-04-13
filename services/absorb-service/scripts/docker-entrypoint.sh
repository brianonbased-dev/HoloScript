#!/bin/sh
set -e

# Run schema migrations or push
if [ -n "$DATABASE_URL" ]; then
  echo "[absorb-service] Pushing database schema..."
  cd /app/services/absorb-service
  npx --yes drizzle-kit push || {
    echo "[absorb-service] Schema push failed, continuing without db..."
  }
  cd /app
else
  echo "[absorb-service] No DATABASE_URL found, skipping DB setup."
fi

echo "[absorb-service] Starting service..."
exec node /app/services/absorb-service/dist/server.js
