-- =============================================================================
-- Migration 002: Compile Jobs
-- =============================================================================
-- ADR-002: All compilations are async (202 Accepted).
-- ADR-005: Source code stored in encrypted S3, NOT in database.
--
-- The compile_jobs table tracks job metadata and status.
-- Source code is referenced by content hash (SHA-256) pointing to S3.
-- Idempotency keys prevent duplicate job submission.

CREATE TYPE compile_status AS ENUM (
    'pending',
    'processing',
    'completed',
    'failed',
    'cancelled'
);

CREATE TABLE IF NOT EXISTS compile_jobs (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    status          compile_status  NOT NULL DEFAULT 'pending',
    target          VARCHAR(64)     NOT NULL,
    source_hash     CHAR(64)        NOT NULL,  -- SHA-256 of source (ADR-005: hash only, not source)
    options         JSONB           DEFAULT '{}',
    idempotency_key VARCHAR(128)    UNIQUE,    -- Prevents duplicate submissions
    created_by      VARCHAR(255)    NOT NULL,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    output_url      TEXT,                      -- Signed S3 URL (temporary)
    output_size     BIGINT,                    -- Output size in bytes
    output_type     VARCHAR(128),              -- MIME type
    error_message   TEXT,                      -- Error details (if failed)
    duration_ms     INTEGER,                   -- Processing time
    worker_id       VARCHAR(255),              -- Which worker processed this
    retry_count     SMALLINT        DEFAULT 0,
    max_retries     SMALLINT        DEFAULT 3
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_compile_jobs_status ON compile_jobs (status);
CREATE INDEX IF NOT EXISTS idx_compile_jobs_created_by ON compile_jobs (created_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_compile_jobs_target ON compile_jobs (target);
CREATE INDEX IF NOT EXISTS idx_compile_jobs_source_hash ON compile_jobs (source_hash);
CREATE INDEX IF NOT EXISTS idx_compile_jobs_idempotency ON compile_jobs (idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_compile_jobs_created_at ON compile_jobs (created_at DESC);

-- Auto-update updated_at on modification
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER compile_jobs_updated_at
    BEFORE UPDATE ON compile_jobs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE compile_jobs IS 'Async compilation job tracking (ADR-002). Source stored in S3 (ADR-005).';
COMMENT ON COLUMN compile_jobs.source_hash IS 'SHA-256 hash of source code. Raw source stored in encrypted S3.';
COMMENT ON COLUMN compile_jobs.idempotency_key IS 'Client-provided key to prevent duplicate job submission.';
