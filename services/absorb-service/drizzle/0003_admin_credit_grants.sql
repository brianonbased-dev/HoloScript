-- Audit + idempotency for POST /api/admin/credits/grant.
-- Written in the same transaction as the balance update and ledger row; the
-- unique idempotency_key makes a racing duplicate roll back instead of
-- crediting twice. Additive only: creates, never alters or drops.
CREATE TABLE IF NOT EXISTS "admin_credit_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idempotency_key" text NOT NULL,
	"admin_github_username" text NOT NULL,
	"user_id" uuid NOT NULL,
	"amount_cents" integer NOT NULL,
	"note" text NOT NULL,
	"balance_after_cents" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_admin_credit_grants_key" ON "admin_credit_grants" USING btree ("idempotency_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_admin_credit_grants_user" ON "admin_credit_grants" USING btree ("user_id");
