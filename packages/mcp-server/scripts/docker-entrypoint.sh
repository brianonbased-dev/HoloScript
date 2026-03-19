#!/bin/sh
set -eu

CACHE_DIR="${HOLOSCRIPT_CACHE_DIR:-/app/.holoscript}"

mkdir -p "$CACHE_DIR" || true
chown -R nodejs:nodejs "$CACHE_DIR" || true
chmod 775 "$CACHE_DIR" || true

if su-exec nodejs sh -c "touch '$CACHE_DIR/.write_test' && rm -f '$CACHE_DIR/.write_test'" 2>/dev/null; then
  exec su-exec nodejs node packages/mcp-server/dist/http-server.js
fi

echo "[CacheDebug][entrypoint] nodejs cannot write $CACHE_DIR, starting as root fallback" >&2
exec node packages/mcp-server/dist/http-server.js