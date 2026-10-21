-- One /scan repoUrl import = one charge, across absorb instances and restarts.
-- The claim row is inserted BEFORE the clone, scan and charge; the unique index
-- makes a second instance's insert lose, so it replays the first result (cost 0)
-- or answers 409 while the first is still running. A failed import deletes its
-- pending claim so it can be retried. See src/lib/absorb/importClaims.ts.
CREATE TABLE IF NOT EXISTS "absorb_import_claims" (
	"user_id" text NOT NULL,
	"import_id" text NOT NULL,
	"status" text NOT NULL,
	"outcome" jsonb,
	"claimed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_absorb_import_claims_user_import" ON "absorb_import_claims" USING btree ("user_id","import_id");