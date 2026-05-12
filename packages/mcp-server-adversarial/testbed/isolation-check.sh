#!/usr/bin/env bash
# ATI-3 Isolation Gate — CI pre-flight check.
# Per evaluation-plan.md §1.2: curl to production MUST fail from inside testbed.
# DNS resolution OK, network ECONNREFUSED.

set -euo pipefail

TARGET_URL="https://mcp.holoscript.net/health"
TIMEOUT_SECONDS=10

# Run from inside the testbed network via a transient container.
# In CI, the testbed is already up; we exec into the seed-legit container.
# In local dev, we spin a minimal container on the ati-isolated network.

echo "[isolation-check] Probing ${TARGET_URL} from testbed network..."

if docker compose -f testbed/compose.yaml ps | grep -q seed-legit; then
  RESULT=$(docker compose -f testbed/compose.yaml exec -T seed-legit \
    sh -c "curl -sS --max-time ${TIMEOUT_SECONDS} ${TARGET_URL} || echo 'REFUSED'")
else
  RESULT=$(docker run --rm --network ati-isolated alpine/curl:latest \
    -sS --max-time ${TIMEOUT_SECONDS} ${TARGET_URL} || echo 'REFUSED')
fi

if echo "$RESULT" | grep -qi "REFUSED\|Could not resolve\|Failed to connect"; then
  echo "[isolation-check] PASS — production unreachable from testbed (expected)."
  exit 0
else
  echo "[isolation-check] FAIL — production responded from testbed: ${RESULT}"
  echo "[isolation-check] The testbed network has an upstream gateway. Abort."
  exit 1
fi
