import { Client } from 'pg';

/**
 * Guarantee the unique index that stops one Stripe payment being credited twice,
 * independently of whichever migration lane this database is on.
 *
 * WHY THIS EXISTS AND WHY IT CANNOT LIVE ONLY IN A MIGRATION.
 *
 * `addCredits` reads `stripeSessionId` back before crediting, but that check is
 * advisory on its own: two deliveries racing each other both read "no prior row"
 * before either writes. The unique index is the only thing that makes the loser
 * lose — its insert violates the index and its whole transaction rolls back,
 * balance included. The read-then-write and the index are one mechanism, and
 * `creditService.ts` says so where it refuses to run without a transaction.
 *
 * The index ships in `drizzle/0001_dedupe_stripe_sessions.sql`. Review of that
 * change traced the actual boot path — `scripts/docker-entrypoint.sh`, which
 * `railway.toml` names as the start command — and found the migration is not
 * guaranteed to run:
 *
 *   - the entrypoint tries `drizzle-kit migrate`, falls back to `push --force`,
 *     and on failure CONTINUES unless `ABSORB_REQUIRE_DB_SCHEMA=1`;
 *   - `drizzle/0000_fantastic_masque.sql` uses bare `CREATE TABLE`, so on a
 *     database that was first built by `push` (before the migrate lane existed)
 *     `migrate` fails at 0000 on every boot and never reaches 0001;
 *   - `push` then fails to create a UNIQUE index over the duplicate rows that
 *     the defect itself produced;
 *   - and `verify_required_schema` checks TABLES only, so the server starts,
 *     looks healthy, and has no backstop.
 *
 * On that lane the double-credit fix is simply absent, in exactly the
 * deployment where double-crediting already happened. This function closes that
 * by doing the work at boot, in the server process, on whatever database it is
 * actually pointed at — no migration lane involved.
 *
 * IT IS THE SAME SQL as the migration, deliberately: dedupe first, then the
 * index. Postgres cannot build a unique index over existing duplicates, so the
 * ordering is not optional, and it deletes nothing — later duplicate rows keep
 * every field except `stripe_session_id`, which moves into `metadata`. Running
 * it twice is a no-op.
 *
 * @module absorb-service-host/db/ensure-credit-ledger-index
 */

const INDEX_NAME = 'idx_credit_tx_stripe_session';
const TABLE_NAME = 'credit_transactions';

/**
 * Move `stripe_session_id` off every duplicate but the earliest, preserving it
 * in `metadata`. Identical to migration 0001 so the two paths cannot drift.
 */
const DEDUPE_SQL = `
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY stripe_session_id
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM credit_transactions
  WHERE stripe_session_id IS NOT NULL
)
UPDATE credit_transactions AS ct
SET
  stripe_session_id = NULL,
  metadata = COALESCE(ct.metadata, '{}'::jsonb) || jsonb_build_object(
    'supersededStripeSessionId', ct.stripe_session_id,
    'supersededBy', 'boot ensureCreditLedgerIndex',
    'supersededReason', 'duplicate webhook delivery credited more than once'
  )
FROM ranked AS r
WHERE ct.id = r.id
  AND r.rn > 1`;

const CREATE_INDEX_SQL = `CREATE UNIQUE INDEX IF NOT EXISTS "${INDEX_NAME}" ON "${TABLE_NAME}" USING btree ("stripe_session_id")`;

function createClient(databaseUrl: string): Client {
  const isPrivate = !databaseUrl.includes('.railway.app');
  return new Client({
    connectionString: databaseUrl,
    ssl: isPrivate ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: Math.max(5000, Number(process.env.PG_CONNECTION_TIMEOUT_MS || 15000)),
  });
}

async function indexExists(client: Client): Promise<boolean> {
  const result = await client.query<{ indexname: string | null }>(
    'select indexname from pg_indexes where schemaname = $1 and indexname = $2',
    ['public', INDEX_NAME]
  );
  return Boolean(result.rows[0]?.indexname);
}

/**
 * Ensure the index exists, and SAY SO ON EVERY BOOT either way.
 *
 * The visibility is half the point. The failure this guards against is silent by
 * construction — a server that starts, passes its health check and has no
 * backstop — so the boot log names the index and states whether it is present,
 * letting anyone answer "is double-crediting actually prevented on this
 * deployment?" from the log rather than by opening the database.
 */
export async function ensureCreditLedgerIndex(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.warn(
      `[absorb-service] credit ledger: DATABASE_URL unset — cannot verify ${INDEX_NAME}. ` +
        'Double-credit protection is UNVERIFIED on this boot.'
    );
    return;
  }

  const client = createClient(databaseUrl);
  try {
    await client.connect();

    if (await indexExists(client)) {
      console.log(
        `[absorb-service] credit ledger: ${INDEX_NAME} PRESENT on ${TABLE_NAME} — ` +
          'one Stripe session can be credited at most once.'
      );
      return;
    }

    console.warn(
      `[absorb-service] credit ledger: ${INDEX_NAME} MISSING — building it now. ` +
        'Until it exists, a redelivered webhook can credit an account twice.'
    );

    const deduped = await client.query(DEDUPE_SQL);
    if (deduped.rowCount && deduped.rowCount > 0) {
      // Not a warning about this run — a finding about what already happened.
      console.warn(
        `[absorb-service] credit ledger: ${deduped.rowCount} duplicate grant(s) found and set aside ` +
          '(stripe_session_id moved to metadata.supersededStripeSessionId; no balance was changed). ' +
          'Credits granted twice are still on those accounts; reclaiming them is a business decision, ' +
          'not a schema one. See drizzle/0001_dedupe_stripe_sessions.sql for the exposure query.'
      );
    }

    await client.query(CREATE_INDEX_SQL);

    const present = await indexExists(client);
    console.log(
      present
        ? `[absorb-service] credit ledger: ${INDEX_NAME} CREATED on ${TABLE_NAME}.`
        : `[absorb-service] credit ledger: ${INDEX_NAME} still MISSING after CREATE — investigate.`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Deliberately not fatal: refusing to boot would take down scan, query,
    // balance, purchase AND the webhook — including for deployments that never
    // had a duplicate. But it must be LOUD, because the alternative is a server
    // that looks healthy while the backstop is absent.
    console.warn(
      `[absorb-service] credit ledger: could not ensure ${INDEX_NAME}: ${message}. ` +
        'Double-credit protection is NOT guaranteed on this boot.'
    );
  } finally {
    await client.end().catch(() => undefined);
  }
}
