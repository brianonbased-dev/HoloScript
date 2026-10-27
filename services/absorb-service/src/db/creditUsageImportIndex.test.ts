/**
 * Migration 0004 (HELD): the unique partial index on credit_transactions
 * (user_id, metadata->>'importId') WHERE type = 'usage'. Runs the migration's
 * own SQL on a real Postgres (PGlite, in-process) when one is available:
 * set PGLITE_MODULE to the path of an installed @electric-sql/pglite. The
 * text checks always run.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATION = readFileSync(join(here, '..', '..', 'drizzle', '0004_credit_usage_import_unique.sql'), 'utf8');
const JOURNAL = JSON.parse(readFileSync(join(here, '..', '..', 'drizzle', 'meta', '_journal.json'), 'utf8'));

describe('migration 0004: unique usage row per (user, importId) (HELD)', () => {
  it('is its own migration, additive, only an index on credit_transactions, and says HELD', () => {
    expect(JOURNAL.entries.map((e: { tag: string }) => e.tag)).toContain('0004_credit_usage_import_unique');
    const statements = MIGRATION.split('\n').filter((l) => l.trim() && !l.trim().startsWith('--'));
    expect(statements).toHaveLength(1);
    expect(statements[0]).toMatch(/^CREATE UNIQUE INDEX IF NOT EXISTS "idx_credit_tx_usage_import" ON "credit_transactions"/);
    expect(statements[0]).toMatch(/WHERE "type" = 'usage' AND \("metadata"->>'importId'\) IS NOT NULL;$/);
    expect(MIGRATION).not.toMatch(/\b(DROP|DELETE|UPDATE|ALTER)\b/);
    expect(MIGRATION).toMatch(/HELD/);
  });

  const mod = process.env.PGLITE_MODULE;
  describe.skipIf(!mod)('on a real Postgres (PGlite)', () => {
    async function db() {
      const { PGlite } = (await import(pathToFileURL(mod!).href)) as { PGlite: new () => any };
      const pg = new PGlite();
      await pg.exec(`CREATE TABLE credit_transactions (
        id serial PRIMARY KEY, user_id uuid NOT NULL, type text NOT NULL, amount_cents integer NOT NULL,
        balance_after_cents integer NOT NULL DEFAULT 0, description text, metadata jsonb DEFAULT '{}'::jsonb,
        stripe_session_id text, created_at timestamp DEFAULT now())`);
      await pg.exec(MIGRATION);
      return pg;
    }
    const U = '11111111-2222-4333-8444-555555555555';
    const row = (type: string, meta: object, user = U) =>
      [user, type, -10, JSON.stringify(meta)];
    const INSERT = 'INSERT INTO credit_transactions (user_id, type, amount_cents, metadata) VALUES ($1, $2, $3, $4::jsonb)';

    it('rejects a second usage row for the same user and importId', async () => {
      const pg = await db();
      await pg.query(INSERT, row('usage', { graphId: 'g1', shallow: true, importId: 'imp-1' }));
      await expect(pg.query(INSERT, row('usage', { graphId: 'g2', shallow: true, importId: 'imp-1' }))).rejects.toThrow(
        /duplicate key value violates unique constraint "idx_credit_tx_usage_import"/
      );
    });

    it('allows other imports, other users, non-usage rows, and usage rows with no importId', async () => {
      const pg = await db();
      await pg.query(INSERT, row('usage', { importId: 'imp-1' }));
      await pg.query(INSERT, row('usage', { importId: 'imp-2' }));
      await pg.query(INSERT, row('usage', { importId: 'imp-1' }, '99999999-2222-4333-8444-555555555555'));
      await pg.query(INSERT, row('refund', { importId: 'imp-1' }));
      await pg.query(INSERT, row('usage', { graphId: 'path-scan', importId: null }));
      await pg.query(INSERT, row('usage', { graphId: 'path-scan' }));
      await pg.query(INSERT, row('usage', { graphId: 'path-scan' }));
      const { rows } = await pg.query('SELECT count(*)::int AS n FROM credit_transactions');
      expect(rows[0].n).toBe(7);
    });

    it('fails to build (changes nothing) when duplicates already exist', async () => {
      const { PGlite } = (await import(pathToFileURL(mod!).href)) as { PGlite: new () => any };
      const pg = new PGlite();
      await pg.exec(`CREATE TABLE credit_transactions (id serial PRIMARY KEY, user_id uuid NOT NULL, type text NOT NULL,
        amount_cents integer NOT NULL, metadata jsonb DEFAULT '{}'::jsonb)`);
      await pg.query(INSERT, row('usage', { importId: 'imp-1' }));
      await pg.query(INSERT, row('usage', { importId: 'imp-1' }));
      await expect(pg.exec(MIGRATION)).rejects.toThrow(/could not create unique index/);
      const { rows } = await pg.query('SELECT count(*)::int AS n FROM credit_transactions');
      expect(rows[0].n).toBe(2);
    });
  });
});