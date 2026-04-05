-- Credit system tables for HoloScript billing
-- Run against the MCP server / absorb service PostgreSQL database
-- These tables power the /api/credits/check and /api/credits/deduct endpoints

CREATE TABLE IF NOT EXISTS credit_accounts (
  user_id UUID PRIMARY KEY,
  balance_cents INTEGER NOT NULL DEFAULT 0,
  lifetime_spent_cents INTEGER NOT NULL DEFAULT 0,
  lifetime_purchased_cents INTEGER NOT NULL DEFAULT 0,
  tier VARCHAR(16) NOT NULL DEFAULT 'free',
  free_credits_used_cents INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  type VARCHAR(16) NOT NULL,
  amount_cents INTEGER NOT NULL,
  balance_after_cents INTEGER NOT NULL,
  description TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  stripe_session_id TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_tx_user ON credit_transactions (user_id);
CREATE INDEX IF NOT EXISTS idx_credit_tx_type ON credit_transactions (type);
CREATE INDEX IF NOT EXISTS idx_credit_tx_time ON credit_transactions (created_at);

-- Grant 100 free credits (100 cents = $1.00) to new free-tier accounts
-- This is handled by the application layer (getOrCreateAccount), not the migration.
