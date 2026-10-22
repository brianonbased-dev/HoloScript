-- HELD (see PR): NOT to be applied in production without Joseph's explicit yes
-- AND a read-only duplicate count at deploy time (query in the PR body). It
-- touches the existing credit_transactions table; #617 does not depend on it.
--
-- At most one 'usage' ledger row per (user, importId): a second charge for the
-- same /scan import fails at the database, whatever the application does.
-- Also indexes the CHARGED_SQL lookup (user_id, metadata->>'importId').
-- Building it FAILS if duplicates already exist; nothing is deleted or changed.
CREATE UNIQUE INDEX IF NOT EXISTS "idx_credit_tx_usage_import" ON "credit_transactions" USING btree ("user_id", (("metadata"->>'importId'))) WHERE "type" = 'usage' AND ("metadata"->>'importId') IS NOT NULL;
