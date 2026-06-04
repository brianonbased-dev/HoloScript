#!/bin/sh
set -e

# NOTE (2026-06-04): absorb-service's Railway GitHub deploy trigger was missing
# (repoTriggers: []), so pushes to main never auto-deployed and the service ran
# 5 days stale. Trigger recreated via API (branch main). This change also serves
# to fire the restored webhook and pull the true main HEAD.

# Run schema migrations or push.
#
# Failure mode this guards against (task_1777950370973_u5h0, 2026-05-05):
# the previous version swallowed `drizzle-kit push` failures with `|| {echo ...}`,
# so the service started fine but `moltbook_agents` (and any other table the
# schema added since the last successful push) silently never existed. The
# /health probe surfaces this as "relation \"moltbook_agents\" does not exist"
# and stays in that state forever because subsequent boots also swallow the
# failure.
#
# Strategy:
#   1. Try `drizzle-kit migrate` first (uses the committed drizzle/0000_*.sql,
#      idempotent, won't drop columns the schema removed).
#   2. Verify that the moltbook_agents table exists after migrate. If migration
#      metadata is stale but the physical table is missing, fall back to push.
#   3. Fall back to `drizzle-kit push --force` if migrate fails (covers the
#      case where the deploy DB has schema drift not captured in migrations).
#   4. If schema repair fails and ABSORB_REQUIRE_DB_SCHEMA=1, exit non-zero so Railway
#      restarts and the failure is visible in deploy logs (not just buried in
#      a runtime probe error). Default off so a transient pg outage doesn't
#      brick the service.
handle_schema_failure() {
  echo "[absorb-service] ERROR: required database schema is still missing after migrate/push."
  echo "[absorb-service] DATABASE_URL host: $(echo "$DATABASE_URL" | sed -E 's|.*@([^/]+)/.*|\1|')"
  if [ "${ABSORB_REQUIRE_DB_SCHEMA:-0}" = "1" ]; then
    echo "[absorb-service] ABSORB_REQUIRE_DB_SCHEMA=1 -> exiting so Railway can surface the failure."
    exit 1
  fi
  echo "[absorb-service] ABSORB_REQUIRE_DB_SCHEMA not set -> continuing without schema. /health probes will report errors."
}

verify_required_schema() {
  # Verify ALL core REST-API tables exist, not just moltbook_agents. The prior
  # version checked only moltbook_agents — but `ensureMoltbookSchema()` (server
  # boot) creates that table independently, so a missing `absorb_projects`
  # (drizzle migrate rolled back / stale ledger / drift) went undetected and the
  # `push --force` repair never fired. Result: GET /api/absorb/projects 500'd
  # forever with `relation "absorb_projects" does not exist`. Any missing table
  # here now triggers the push fallback.
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

repair_schema_with_push() {
  if npx --yes drizzle-kit push --force && verify_required_schema; then
    echo "[absorb-service] Schema push OK (fallback path)."
  else
    handle_schema_failure
  fi
}

if [ -n "$DATABASE_URL" ]; then
  cd /app/services/absorb-service

  echo "[absorb-service] Applying database migrations (drizzle-kit migrate)..."
  if npx --yes drizzle-kit migrate; then
    echo "[absorb-service] Migrations applied OK."
    if ! verify_required_schema; then
      echo "[absorb-service] WARN: required schema missing after migrate, trying push as fallback..."
      repair_schema_with_push
    fi
  else
    echo "[absorb-service] WARN: drizzle-kit migrate failed, trying push as fallback..."
    repair_schema_with_push
  fi
  cd /app
else
  echo "[absorb-service] No DATABASE_URL found, skipping DB setup."
fi

echo "[absorb-service] Starting service..."
exec node /app/services/absorb-service/dist/server.js
