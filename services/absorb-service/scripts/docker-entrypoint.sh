#!/bin/sh
set -e

# Apply committed Drizzle migrations, then refuse to boot if they did not land.
#
# The only schema change this script performs is `drizzle-kit migrate`. There is
# no push fallback. ABSORB_REQUIRE_DB_SCHEMA is not read here: a failed migrate
# or a missing required table always exits non-zero. (That variable still gates
# ensureMoltbookSchema() when the server is started directly, which is what the
# Railway dashboard start command does. It cannot bypass this script.)
#
# drizzle-kit is started as `node <virtual-store>/drizzle-kit/bin.cjs`.
# pnpm's .bin cmd-shim is not used. The shim stores a relative path written
# from services/absorb-service/node_modules/.bin (four ".." segments, then
# node_modules/.pnpm/.../bin.cjs). The same file is also reachable through the
# workspace symlink node_modules/@holoscript/absorb-service-host, which is one
# directory deeper because of the @holoscript scope folder. dirname("$0") does
# not resolve symlinks, so those four ".." segments stop at /app/node_modules
# and node is asked to load
# /app/node_modules/node_modules/.pnpm/drizzle-kit@.../bin.cjs, which is not
# a file. `npx --yes` is not used either: it executes that shim and can
# download an unpinned drizzle-kit from the network at boot.
#
# ABSORB_APP_ROOT defaults to /app. It only relocates the image root (tests).
# It does not skip migrate or schema verification.

APP_ROOT="${ABSORB_APP_ROOT:-/app}"

handle_schema_failure() {
  echo "[absorb-service] ERROR: $1"
  echo "[absorb-service] DATABASE_URL host: $(echo "$DATABASE_URL" | sed -E 's|.*@([^/]+)/.*|\1|')"
  exit 1
}

resolve_drizzle_kit_bin() {
  # The virtual-store file is the real entry. The hoisted name is only a
  # fallback, and [ -f ] follows it, so a broken extra node_modules segment
  # does not match.
  for candidate in "$APP_ROOT"/node_modules/.pnpm/drizzle-kit@*/node_modules/drizzle-kit/bin.cjs; do
    if [ -f "$candidate" ]; then
      echo "$candidate"
      return 0
    fi
  done
  hoisted="$APP_ROOT/node_modules/drizzle-kit/bin.cjs"
  if [ -f "$hoisted" ]; then
    echo "$hoisted"
    return 0
  fi
  return 1
}

verify_required_schema() {
  # Read-only check. A missing table is a failed boot, not a signal to push.
  node --input-type=module <<'NODE'
import pg from 'pg';

const REQUIRED = ['moltbook_agents', 'absorb_projects', 'credit_accounts'];
const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL });

try {
  await client.connect();
  const missing = [];
  for (const table of REQUIRED) {
    const result = await client.query('select to_regclass($1) as table_name', [`public.${table}`]);
    if (!result.rows?.[0]?.table_name) missing.push(table);
  }
  if (missing.length === 0) {
    console.log(`[absorb-service] Schema verification OK: ${REQUIRED.join(', ')} all exist.`);
    process.exit(0);
  }
  console.error(`[absorb-service] Schema verification failed: missing table(s): ${missing.join(', ')}.`);
  process.exit(1);
} catch (error) {
  console.error('[absorb-service] Schema verification query failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
NODE
}

if [ -n "$DATABASE_URL" ]; then
  cd "$APP_ROOT/services/absorb-service"

  echo "[absorb-service] Applying database migrations (drizzle-kit migrate)..."
  if ! drizzle_kit_bin="$(resolve_drizzle_kit_bin)"; then
    handle_schema_failure "drizzle-kit migrate failed (drizzle-kit/bin.cjs not found in the image)"
  fi
  if ! node "$drizzle_kit_bin" migrate; then
    handle_schema_failure "drizzle-kit migrate failed"
  fi
  echo "[absorb-service] Migrations applied OK."
  if ! verify_required_schema; then
    handle_schema_failure "verify_required_schema failed (required tables missing after migrate)"
  fi
  cd "$APP_ROOT"
else
  echo "[absorb-service] No DATABASE_URL found, skipping DB setup."
fi

echo "[absorb-service] Starting service..."
exec node "$APP_ROOT/services/absorb-service/dist/server.js"
