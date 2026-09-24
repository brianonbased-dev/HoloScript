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
 * in `metadata`. The same statement as migration 0001, apart from the
 * `supersededBy` label — and that is now CHECKED rather than claimed:
 * `ensureCreditLedgerIndex.test.ts` compares the two and fails if they drift.
 * This comment said "identical so the two paths cannot drift" for a day with
 * nothing enforcing it.
 *
 * THE LAST LINE IS A RACE GUARD, and it is the only way this differs from what
 * shipped first. Two boots can run this at once (the entrypoint and the server
 * each call it, and back-to-back deploys overlap). Under Postgres's default
 * READ COMMITTED isolation the second UPDATE waits on rows the first has
 * locked, then RE-CHECKS its WHERE clause against the committed row — and
 * without this guard the re-check still passes (`ct.id = r.id` and `r.rn` come
 * from the CTE's snapshot), so it re-runs the SET on a row whose
 * `stripe_session_id` is now NULL and overwrites `supersededStripeSessionId`
 * with NULL. The duplicate stays marked, but its link to the payment it
 * duplicated is gone — the one field anybody deciding a clawback needs.
 *
 * On a SINGLE run the guard changes nothing: the CTE already selects only rows
 * whose `stripe_session_id` is not null, so every row it can reach passes it.
 * It can only make a concurrent run do less. That equivalence is by reading;
 * the concurrent behaviour is Postgres's documented re-check and was reasoned,
 * not run — this repo has no real-Postgres test harness. Found by pre-mortem,
 * 2026-09-23.
 */
export const DEDUPE_SQL = `
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
  AND r.rn > 1
  AND ct.stripe_session_id IS NOT NULL`;

/**
 * How much was credited twice and is still sitting on accounts. Read-only.
 *
 * This is the number the clawback decision needs, and until now no boot could
 * produce it reliably: the dedupe above only prints when it marks rows on THIS
 * boot, so on the migrate lane — where migration 0001 does the marking and the
 * server then finds the index already PRESENT — the count never appeared in any
 * log at all. A deployment with a thousand duplicates and one with none printed
 * the same thing. Reporting from the marked rows themselves, every boot, makes
 * the log answer the question whichever lane did the work.
 */
export const EXPOSURE_SQL = `
SELECT count(*)::int AS grants,
       count(DISTINCT user_id)::int AS accounts,
       coalesce(sum(amount_cents), 0)::bigint AS credits
FROM credit_transactions
WHERE metadata ? 'supersededStripeSessionId'
  AND amount_cents > 0`;

export interface LedgerExposure {
  grants: number;
  accounts: number;
  credits: number;
}

/**
 * The boot line for the exposure. Pure, so the words people will act on are
 * tested rather than assumed.
 *
 * Zero gets its OWN line on purpose. The failure this avoids has bitten this
 * codebase repeatedly: a report that prints only when it has something to say
 * makes "there was nothing" and "the report never ran" look identical. An
 * explicit zero is a measurement; a missing line is not.
 */
export function describeLedgerExposure(e: LedgerExposure): string {
  if (e.grants === 0) {
    return (
      '[absorb-service] credit ledger exposure: 0 duplicate grants — ' +
      'no account holds credits that a redelivered payment granted twice.'
    );
  }
  return (
    `[absorb-service] credit ledger exposure: ${e.grants} duplicate grant(s) on ` +
    `${e.accounts} account(s), ${e.credits} credits granted twice and NOT reclaimed. ` +
    'The founder has decided to take these back (2026-09-23); nothing does so yet, ' +
    'because a fair reclaim must not take credits a customer paid for again afterwards. ' +
    'This line is the count that work starts from.'
  );
}

async function reportExposure(client: Client): Promise<void> {
  try {
    const result = await client.query<{ grants: number; accounts: number; credits: string | number }>(
      EXPOSURE_SQL
    );
    const row = result.rows[0];
    console.log(
      describeLedgerExposure({
        grants: Number(row?.grants ?? 0),
        accounts: Number(row?.accounts ?? 0),
        credits: Number(row?.credits ?? 0),
      })
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // UNKNOWN, not zero. The whole reason this report exists is that silence
    // was being read as "nothing to reclaim".
    console.warn(
      `[absorb-service] credit ledger exposure: could not measure (${message}) — ` +
        'the count is UNKNOWN on this boot, not zero.'
    );
  }
}

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
      // Report here too. This is the path the migrate lane takes (0001 already
      // did the marking), and it is exactly where the count used to vanish.
      await reportExposure(client);
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
    await reportExposure(client);
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
