-- Migration: create secret_leases table for the Postgres-backed LeaseAdapter.
-- Idempotent (IF NOT EXISTS) so it is safe to re-run.
-- Source of truth for this DDL is exported as SECRET_LEASES_DDL from
-- packages/secrets-broker/src/postgres-lease-adapter.ts — keep them in sync.

CREATE TABLE IF NOT EXISTS secret_leases (
  lease_id       TEXT PRIMARY KEY,
  task_id        TEXT NOT NULL,
  agent_id       TEXT NOT NULL,
  scope          JSONB NOT NULL,
  expires_at     TIMESTAMPTZ NOT NULL,
  revoked        BOOLEAN NOT NULL DEFAULT FALSE,
  revoked_reason TEXT,
  revoked_by     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_secret_leases_agent ON secret_leases (agent_id);
CREATE INDEX IF NOT EXISTS idx_secret_leases_task ON secret_leases (task_id);
CREATE INDEX IF NOT EXISTS idx_secret_leases_expires ON secret_leases (expires_at);
