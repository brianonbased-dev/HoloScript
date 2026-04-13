#!/bin/sh
set -eu

# --- Environment validation ---
if [ -z "${OAUTH_TOKEN_SECRET:-}" ]; then
  echo "[WARN] OAUTH_TOKEN_SECRET is not set. Tokens will not persist across restarts." >&2
fi

if [ -z "${HOLOSCRIPT_API_KEY:-}" ]; then
  echo "[WARN] HOLOSCRIPT_API_KEY is not set. Legacy API key auth is disabled (open dev mode)." >&2
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "[WARN] DATABASE_URL is not set. Using in-memory token store (tokens lost on restart)." >&2
fi

# --- Cache directory setup ---
CACHE_DIR="${HOLOSCRIPT_CACHE_DIR:-/app/.holoscript}"

mkdir -p "$CACHE_DIR" || true
chown -R nodejs:nodejs "$CACHE_DIR" || true
chmod 775 "$CACHE_DIR" || true

# --- Database Migrations ---
if [ -n "${DATABASE_URL:-}" ]; then
  echo "[INFO] Running database migrations..."
  (cd packages/mcp-server && node -e "
    const pg = require('pg');
    const fs = require('fs');
    if (!fs.existsSync('migrations/001_create_api_keys.sql')) {
      console.warn('[WARN] Migration script not found.');
      process.exit(0);
    }
    const sql = fs.readFileSync('migrations/001_create_api_keys.sql', 'utf8');
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL !== 'false' ? { rejectUnauthorized: false } : false });
    client.connect().then(() => client.query(sql)).then(() => {
      console.log('[INFO] Migration complete.');
      client.end();
      process.exit(0);
    }).catch(err => {
      console.error('[ERROR] Migration failed:', err);
      process.exit(1);
    });
  ")
fi

if su-exec nodejs sh -c "touch '$CACHE_DIR/.write_test' && rm -f '$CACHE_DIR/.write_test'" 2>/dev/null; then
  exec su-exec nodejs node packages/mcp-server/dist/http-server.js
fi

echo "[WARN] nodejs cannot write $CACHE_DIR, starting as root fallback" >&2
exec node packages/mcp-server/dist/http-server.js