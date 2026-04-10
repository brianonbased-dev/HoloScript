-- =============================================================================
-- Migration 001: Audit Logs
-- =============================================================================
-- ADR-004: Append-only audit logs with integrity hashes.
-- Partitioned by month for query performance and retention management.
-- SOC 2 CC7.2: Security event monitoring.
--
-- Design decisions:
-- - PARTITION BY RANGE on timestamp for monthly partitions
-- - Integrity hash chain links each entry to the previous (tamper detection)
-- - No UPDATE or DELETE triggers (append-only enforcement)
-- - GIN index on identity_sub for per-user queries

CREATE TABLE IF NOT EXISTS audit_logs (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id      UUID            NOT NULL,
    timestamp       TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    method          VARCHAR(10)     NOT NULL,
    path            VARCHAR(2048)   NOT NULL,
    status_code     SMALLINT        NOT NULL,
    duration_ms     INTEGER         NOT NULL,
    identity_sub    VARCHAR(255),
    identity_role   VARCHAR(50),
    auth_method     VARCHAR(20),
    client_ip       INET,
    user_agent      TEXT,
    integrity_hash  CHAR(64)        NOT NULL,
    previous_hash   CHAR(64)        NOT NULL,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (timestamp);

-- Create initial monthly partitions (extend as needed)
CREATE TABLE IF NOT EXISTS audit_logs_2026_03 PARTITION OF audit_logs
    FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');

CREATE TABLE IF NOT EXISTS audit_logs_2026_04 PARTITION OF audit_logs
    FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');

CREATE TABLE IF NOT EXISTS audit_logs_2026_05 PARTITION OF audit_logs
    FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');

-- Indexes
CREATE INDEX IF NOT EXISTS idx_audit_logs_request_id ON audit_logs (request_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_identity ON audit_logs (identity_sub);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs (timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_logs_method_path ON audit_logs (method, path);
CREATE INDEX IF NOT EXISTS idx_audit_logs_status ON audit_logs (status_code);

-- Enforce append-only: prevent UPDATE and DELETE
CREATE OR REPLACE FUNCTION prevent_audit_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Audit logs are append-only. Modifications are not allowed.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_logs_no_update
    BEFORE UPDATE ON audit_logs
    FOR EACH ROW
    EXECUTE FUNCTION prevent_audit_modification();

CREATE TRIGGER audit_logs_no_delete
    BEFORE DELETE ON audit_logs
    FOR EACH ROW
    EXECUTE FUNCTION prevent_audit_modification();

COMMENT ON TABLE audit_logs IS 'Append-only audit log with integrity hash chain (ADR-004, SOC 2 CC7.2)';
