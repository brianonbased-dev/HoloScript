-- Brittney's daily usage (founder sheet line "daily-limit", 2026-09-28): one row
-- per (scope, UTC day), scope = a user id or '*' for the day's total.
CREATE TABLE IF NOT EXISTS "brittney_daily_usage" (
	"scope" text NOT NULL,
	"day" varchar(10) NOT NULL,
	"messages" integer DEFAULT 0 NOT NULL,
	"paid_messages" integer DEFAULT 0 NOT NULL,
	"paid_cost_micro_usd" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "brittney_daily_usage_scope_day_pk" PRIMARY KEY("scope","day")
);
--> statement-breakpoint
-- The two statements below are existing schema drift that drizzle-kit folded
-- into this migration: schema.ts already declares both, and no Studio migration
-- carried them. deployments.target has defaulted to 'webgpu' in schema.ts since
-- the retired r3f bridge surfaces were closed (7f815c4b53), while the database
-- still defaults to 'r3f'. The unique index is created by absorb-service's own
-- migration 0001 on the shared database, so IF NOT EXISTS makes it a no-op
-- there. Both are safe to run more than once.
ALTER TABLE "deployments" ALTER COLUMN "target" SET DEFAULT 'webgpu';--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_credit_tx_stripe_session" ON "credit_transactions" USING btree ("stripe_session_id");
