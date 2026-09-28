-- Make stripe_session_id uniquely indexable WITHOUT destroying ledger history
-- and WITHOUT moving anybody's balance.
--
-- WHY THIS EXISTS, AND WHY IT MUST RUN BEFORE THE INDEX SHIPS.
--
-- addCredits recorded stripe_session_id and never read it back, and the ledger
-- had no constraint on that column, so a redelivered Stripe webhook credited
-- the account again. Stripe redelivers whenever it is not certain we received
-- the event, and the handler returned 500 on any internal error, which asks for
-- exactly that. Production therefore very likely holds duplicate
-- stripe_session_id rows.
--
-- The service's start command is `drizzle-kit push && node dist/server.js`, so
-- the schema is synced on every boot. Postgres cannot build a UNIQUE index over
-- existing duplicates: the push exits non-zero, the && short-circuits, and the
-- server never starts -- scan, query, balance, purchase AND the Stripe webhook,
-- all down, for live payments. A fix for double-charging that refuses to boot
-- precisely where double-charging already happened.
--
-- So: dedupe first, then the index. That ordering is not optional.
--
-- WHAT THIS DOES NOT DO, ON PURPOSE.
--
-- It deletes nothing. Duplicate rows are real events -- credits that really were
-- granted -- and deleting them would leave balances that no ledger explains,
-- which is worse than a duplicate that does. Instead the LATER rows keep every
-- field except stripe_session_id, which moves into metadata as
-- supersededStripeSessionId. Postgres permits unlimited NULLs in a unique
-- index, so the index then builds, and nothing is lost.
--
-- It also moves no balances. Whether to reclaim credits granted twice by our
-- own defect is a decision about customers and goodwill, not a schema change,
-- and it is not one to take inside a migration. The query at the bottom of this
-- file reports the exposure so somebody can make that call with numbers.

--> statement-breakpoint
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
    'supersededBy', 'migration 0001_dedupe_stripe_sessions',
    'supersededReason', 'duplicate webhook delivery credited more than once'
  )
FROM ranked AS r
WHERE ct.id = r.id
  AND r.rn > 1
  -- Race guard: a concurrent run re-checks this WHERE against the committed
  -- row and, without this line, would overwrite supersededStripeSessionId with
  -- NULL. A no-op on a single run. See ensureCreditLedgerIndex.ts DEDUPE_SQL.
  AND ct.stripe_session_id IS NOT NULL;

--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_credit_tx_stripe_session"
  ON "credit_transactions" USING btree ("stripe_session_id");

-- REPORT THE EXPOSURE, for the balance decision this migration deliberately
-- leaves open. Run by hand; it changes nothing:
--
--   SELECT user_id,
--          COUNT(*)              AS duplicate_grants,
--          SUM(amount_cents)     AS credits_granted_twice
--   FROM credit_transactions
--   WHERE metadata ? 'supersededStripeSessionId'
--   GROUP BY user_id
--   ORDER BY credits_granted_twice DESC;
--
-- An empty result means no duplicate ever reached production and the index
-- would have built cleanly -- which is the outcome to hope for and not the one
-- to assume.
