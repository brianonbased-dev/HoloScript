-- Studio Pro: one row per subscribing user, written only by the Stripe webhook.
--
-- Production does not run these migrations (its Railway start command boots
-- dist/server.js directly and skips scripts/docker-entrypoint.sh), so the server
-- runs these same statements at boot: src/db/ensureSubscriptionTable.ts,
-- SUBSCRIPTION_TABLE_SQL. A test keeps the two identical. Everything is IF NOT
-- EXISTS so either path can run first. Like 0001, this file was written by hand
-- and has no meta snapshot: `drizzle-kit generate` would also re-emit the 0001
-- index without IF NOT EXISTS, so read any generated SQL before committing it.
CREATE TABLE IF NOT EXISTS "credit_subscriptions" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"plan" varchar(32) NOT NULL,
	"stripe_customer_id" text NOT NULL,
	"stripe_subscription_id" text,
	"status" varchar(32) NOT NULL,
	"livemode" boolean,
	"current_period_end" timestamp,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_credit_sub_customer" ON "credit_subscriptions" USING btree ("stripe_customer_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_credit_sub_subscription" ON "credit_subscriptions" USING btree ("stripe_subscription_id");
