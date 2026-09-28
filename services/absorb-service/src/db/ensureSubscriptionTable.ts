import { createClient } from './ensureCreditLedgerIndex.js';

/**
 * Make sure the Studio Pro subscription table exists before the server takes
 * traffic, and say on every boot whether it does.
 *
 * Production runs no drizzle migrations. Its Railway start command is
 * `node services/absorb-service/dist/server.js` (read 2026-09-28), which skips
 * scripts/docker-entrypoint.sh and the `migrate` inside it, and
 * drizzle.__drizzle_migrations there holds zero rows. A table that only a
 * migration creates would therefore never reach production; that is also why
 * ensureCreditLedgerIndex exists. These are the statements of
 * drizzle/0002_credit_subscriptions.sql, all IF NOT EXISTS, so every boot after
 * the first changes nothing.
 *
 * A failure here does not stop the server: one-time credit purchases do not need
 * this table. Subscription writes do, and without it they fail with a database
 * error, so the webhook answers 500 and Stripe redelivers once it is fixed.
 */
export const SUBSCRIPTION_TABLE_SQL: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS "credit_subscriptions" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"plan" varchar(32) NOT NULL,
	"stripe_customer_id" text NOT NULL,
	"stripe_subscription_id" text NOT NULL,
	"status" varchar(32) NOT NULL,
	"current_period_end" timestamp,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "idx_credit_sub_customer" ON "credit_subscriptions" USING btree ("stripe_customer_id")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "idx_credit_sub_subscription" ON "credit_subscriptions" USING btree ("stripe_subscription_id")`,
];

export type SubscriptionTableState = 'present' | 'created' | 'unknown';

export async function ensureSubscriptionTable(): Promise<SubscriptionTableState> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.warn(
      '[absorb-service] Studio Pro: DATABASE_URL unset — subscription table UNKNOWN. ' +
        'Subscriptions cannot be recorded on this boot.'
    );
    return 'unknown';
  }
  const client = createClient(databaseUrl);
  try {
    await client.connect();
    const before = await client.query<{ present: boolean }>(
      `SELECT to_regclass('public.credit_subscriptions') IS NOT NULL AS present`
    );
    for (const statement of SUBSCRIPTION_TABLE_SQL) await client.query(statement);
    const state: SubscriptionTableState = before.rows[0]?.present ? 'present' : 'created';
    console.log(`[absorb-service] Studio Pro: subscription table ${state.toUpperCase()}.`);
    return state;
  } catch (err) {
    console.error(
      `[absorb-service] Studio Pro: subscription table UNKNOWN (${(err as Error).message}). ` +
        'Subscriptions cannot be recorded until it exists; the webhook answers 500 so Stripe retries.'
    );
    return 'unknown';
  } finally {
    await client.end().catch(() => undefined);
  }
}
