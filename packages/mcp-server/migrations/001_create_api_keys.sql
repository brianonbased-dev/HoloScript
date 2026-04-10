-- Migration: 001_create_api_keys
-- Description: Creates the tenant API keys table for dynamic multi-tenant auth

CREATE TABLE IF NOT EXISTS api_keys (
    id SERIAL PRIMARY KEY,
    key VARCHAR(255) UNIQUE NOT NULL,
    tenant_id VARCHAR(100) NOT NULL,
    tier VARCHAR(50) NOT NULL DEFAULT 'free',
    limits JSONB NOT NULL DEFAULT '{"maxVideoDurationSec": 30, "maxMediaResolution": 1024, "allowProcessExec": false, "rateLimitRequestsPerMin": 10}'::jsonb,
    revoked BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    usage_count BIGINT NOT NULL DEFAULT 0,
    spent_usd NUMERIC(10, 4) NOT NULL DEFAULT 0.0000
);

CREATE INDEX IF NOT EXISTS idx_api_keys_key ON api_keys(key);
CREATE INDEX IF NOT EXISTS idx_api_keys_tenant_id ON api_keys(tenant_id);
