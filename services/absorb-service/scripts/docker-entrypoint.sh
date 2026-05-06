#!/bin/sh
set -e

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
#   2. Fall back to `drizzle-kit push --force` if migrate fails (covers the
#      case where the deploy DB has schema drift not captured in migrations).
#   3. If BOTH fail and ABSORB_REQUIRE_DB_SCHEMA=1, exit non-zero so Railway
#      restarts and the failure is visible in deploy logs (not just buried in
#      a runtime probe error). Default off so a transient pg outage doesn't
#      brick the service.
if [ -n "$DATABASE_URL" ]; then
  cd /app/services/absorb-service

  echo "[absorb-service] Applying database migrations (drizzle-kit migrate)..."
  if npx --yes drizzle-kit migrate; then
    echo "[absorb-service] Migrations applied OK."
  else
    echo "[absorb-service] WARN: drizzle-kit migrate failed, trying push as fallback..."
    if npx --yes drizzle-kit push --force; then
      echo "[absorb-service] Schema push OK (fallback path)."
    else
      echo "[absorb-service] ERROR: both drizzle-kit migrate AND push failed."
      echo "[absorb-service] DATABASE_URL host: $(echo "$DATABASE_URL" | sed -E 's|.*@([^/]+)/.*|\1|')"
      if [ "${ABSORB_REQUIRE_DB_SCHEMA:-0}" = "1" ]; then
        echo "[absorb-service] ABSORB_REQUIRE_DB_SCHEMA=1 -> exiting so Railway can surface the failure."
        exit 1
      fi
      echo "[absorb-service] ABSORB_REQUIRE_DB_SCHEMA not set -> continuing without schema. /health probes will report errors."
    fi
  fi
  cd /app
else
  echo "[absorb-service] No DATABASE_URL found, skipping DB setup."
fi

echo "[absorb-service] Starting service..."
exec node /app/services/absorb-service/dist/server.js
