-- WAITS FOR JOSEPH'S YES. DO NOT MERGE, PUSH, OR APPLY WITHOUT IT.
--
-- #617 follow-up: Treasurer's reservation design for paid absorb scans.
-- Adds no table and no column. It introduces two ledger row types in the
-- existing credit_transactions.type varchar(16) ('reserve', 'release') and one
-- partial unique index so an import key can hold at most one reserve row.
--
-- The service starts with `drizzle-kit push && node dist/server.js`: merging the
-- schema.ts change applies this index on the next boot. A duplicate reserve
-- row cannot exist today (nothing writes 'reserve'), so the index builds clean.

--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_credit_tx_reserve_import_key"
  ON "credit_transactions" USING btree ((metadata ->> 'importKey'))
  WHERE type = 'reserve';
