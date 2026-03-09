-- =============================================================================
-- Migration 004: Usage Records
-- =============================================================================
-- Tracks per-identity API usage for billing, analytics, and rate enforcement.
-- Partitioned by month for efficient querying and retention.
-- Includes a materialized view for daily summary aggregation.

CREATE TABLE IF NOT EXISTS usage_records (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    identity_sub    VARCHAR(255)    NOT NULL,
    api_key_id      UUID            REFERENCES api_keys(id),
    endpoint        VARCHAR(255)    NOT NULL,
    method          VARCHAR(10)     NOT NULL,
    target          VARCHAR(64),                       -- Export target (if applicable)
    status_code     SMALLINT        NOT NULL,
    duration_ms     INTEGER         NOT NULL,
    request_size    INTEGER,                           -- Request body size in bytes
    response_size   INTEGER,                           -- Response body size in bytes
    compile_job_id  UUID            REFERENCES compile_jobs(id),
    timestamp       TIMESTAMPTZ     NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (timestamp);

-- Create initial monthly partitions
CREATE TABLE IF NOT EXISTS usage_records_2026_03 PARTITION OF usage_records
    FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');

CREATE TABLE IF NOT EXISTS usage_records_2026_04 PARTITION OF usage_records
    FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');

CREATE TABLE IF NOT EXISTS usage_records_2026_05 PARTITION OF usage_records
    FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');

-- Indexes
CREATE INDEX IF NOT EXISTS idx_usage_identity ON usage_records (identity_sub, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_usage_api_key ON usage_records (api_key_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_usage_endpoint ON usage_records (endpoint, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_usage_target ON usage_records (target) WHERE target IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_usage_timestamp ON usage_records (timestamp);

-- Materialized view: daily usage summary
CREATE MATERIALIZED VIEW IF NOT EXISTS usage_daily_summary AS
SELECT
    DATE_TRUNC('day', timestamp)    AS day,
    identity_sub,
    endpoint,
    method,
    target,
    COUNT(*)                        AS request_count,
    COUNT(*) FILTER (WHERE status_code >= 200 AND status_code < 300) AS success_count,
    COUNT(*) FILTER (WHERE status_code >= 400 AND status_code < 500) AS client_error_count,
    COUNT(*) FILTER (WHERE status_code >= 500)                       AS server_error_count,
    AVG(duration_ms)                AS avg_duration_ms,
    MAX(duration_ms)                AS max_duration_ms,
    SUM(request_size)               AS total_request_bytes,
    SUM(response_size)              AS total_response_bytes
FROM usage_records
GROUP BY
    DATE_TRUNC('day', timestamp),
    identity_sub,
    endpoint,
    method,
    target
WITH DATA;

CREATE UNIQUE INDEX IF NOT EXISTS idx_usage_daily_unique
    ON usage_daily_summary (day, identity_sub, endpoint, method, COALESCE(target, ''));

-- Refresh the materialized view (run daily via cron/pg_cron):
-- REFRESH MATERIALIZED VIEW CONCURRENTLY usage_daily_summary;

COMMENT ON TABLE usage_records IS 'Per-request API usage tracking for billing and analytics.';
COMMENT ON MATERIALIZED VIEW usage_daily_summary IS 'Daily aggregated usage metrics. Refresh with REFRESH MATERIALIZED VIEW CONCURRENTLY.';
