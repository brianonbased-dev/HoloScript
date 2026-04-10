-- =============================================================================
-- Migration 003: API Keys
-- =============================================================================
-- ADR-003: API keys stored as SHA-256 hash only (shown once at creation).
--
-- Features:
-- - Key rotation with grace period (old key works for 24h after rotation)
-- - Tier-based rate limits
-- - Expiration dates
-- - Revocation with reason tracking

CREATE TABLE IF NOT EXISTS api_keys (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    key_hash        CHAR(64)        NOT NULL UNIQUE,  -- SHA-256 of raw key (ADR-003)
    key_prefix      CHAR(12)        NOT NULL,         -- First 12 chars for identification
    name            VARCHAR(255)    NOT NULL,          -- Human-readable name
    role            VARCHAR(50)     NOT NULL DEFAULT 'developer',
    tier            VARCHAR(50)     NOT NULL DEFAULT 'standard',  -- standard, premium, enterprise
    created_by      VARCHAR(255)    NOT NULL,          -- Admin who created the key
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ,                       -- NULL = no expiry
    last_used_at    TIMESTAMPTZ,
    use_count       BIGINT          DEFAULT 0,
    is_active       BOOLEAN         NOT NULL DEFAULT TRUE,
    revoked_at      TIMESTAMPTZ,
    revoked_by      VARCHAR(255),
    revoke_reason   TEXT,
    -- Key rotation support
    rotated_from    UUID            REFERENCES api_keys(id),
    rotation_grace  TIMESTAMPTZ,    -- Old key valid until this time
    -- Rate limit overrides (NULL = use tier defaults)
    rate_limit_rpm  INTEGER,        -- Requests per minute override
    rate_limit_rpd  INTEGER,        -- Requests per day override
    -- Metadata
    description     TEXT,
    allowed_ips     INET[],         -- IP allowlist (NULL = any IP)
    allowed_targets VARCHAR(64)[]   -- Target allowlist (NULL = all targets)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys (key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys (key_prefix);
CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys (is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_api_keys_created_by ON api_keys (created_by);
CREATE INDEX IF NOT EXISTS idx_api_keys_expires ON api_keys (expires_at) WHERE expires_at IS NOT NULL;

-- Deactivate expired keys automatically (run via cron/pg_cron)
-- SELECT * FROM api_keys WHERE is_active = TRUE AND expires_at < NOW();

COMMENT ON TABLE api_keys IS 'API key management with hashed storage (ADR-003). Raw keys never stored.';
COMMENT ON COLUMN api_keys.key_hash IS 'SHA-256 hash of the raw API key. Raw key shown once at creation.';
COMMENT ON COLUMN api_keys.rotation_grace IS 'During key rotation, the old key remains valid until this timestamp.';
