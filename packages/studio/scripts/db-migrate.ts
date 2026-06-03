/**
 * Apply Drizzle migrations to the configured database.
 *
 * Idempotent runner used by:
 *   - the `db:migrate` package script (manual / CI runs)
 *   - kept in lockstep with `db-migrate.cjs`, which the Dockerfile entrypoint
 *     runs in the standalone runner image (no tsx available there).
 *
 * Two-stage, converge-or-boot strategy (see db-migrate.cjs for the full
 * rationale): try drizzle's ledger-aware `migrate()` first; if it throws
 * (a single "already exists" rolls back the whole transactional migration and
 * leaves a PARTIAL schema), reconcile the schema additively by replaying each
 * statement with `CREATE TABLE/INDEX … IF NOT EXISTS` and skipping duplicates.
 * Additive only — never drops anything.
 *
 * Reads `DATABASE_URL` from the environment; skips if missing (local dev falls
 * back to in-memory mode rather than failing boot).
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Client } from 'pg';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Postgres SQLSTATE codes that mean "the object already exists".
const DUPLICATE_CODES = new Set(['42P07', '42710', '42701', '42P06', '42P16', '23505']);

function isDuplicateError(err: unknown): boolean {
  const code = (err as { code?: string })?.code;
  if (code && DUPLICATE_CODES.has(code)) return true;
  return /already exists|duplicate/i.test(String((err as Error)?.message ?? err));
}

function idempotent(stmt: string): string {
  return stmt
    .replace(/^\s*CREATE\s+TABLE\s+(?!IF\s+NOT\s+EXISTS)/i, 'CREATE TABLE IF NOT EXISTS ')
    .replace(
      /^\s*CREATE\s+(UNIQUE\s+)?INDEX\s+(?!IF\s+NOT\s+EXISTS)/i,
      (_m, uniq) => `CREATE ${uniq ? 'UNIQUE ' : ''}INDEX IF NOT EXISTS `
    );
}

async function reconcileSchema(
  client: Client,
  migrationsFolder: string
): Promise<{ applied: number; skipped: number; failed: number }> {
  const files = readdirSync(migrationsFolder)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  let applied = 0;
  let skipped = 0;
  let failed = 0;
  for (const file of files) {
    const statements = readFileSync(join(migrationsFolder, file), 'utf8')
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter(Boolean);
    for (const raw of statements) {
      try {
        await client.query(idempotent(raw));
        applied++;
      } catch (err) {
        if (isDuplicateError(err)) skipped++;
        else {
          failed++;
          process.stderr.write(
            `[db-migrate] reconcile: statement failed (continuing): ${String(
              (err as Error)?.message ?? err
            ).slice(0, 200)}\n`
          );
        }
      }
    }
  }
  return { applied, skipped, failed };
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    process.stderr.write('[db-migrate] DATABASE_URL not set — skipping migrations.\n');
    return;
  }

  const here = dirname(fileURLToPath(import.meta.url));
  const migrationsFolder = join(here, '..', 'drizzle');

  const useSsl =
    process.env.DRIZZLE_SSL === '1' || /\.proxy\.rlwy\.net|\.railway\.app/.test(url);

  const client = new Client({
    connectionString: url,
    ...(useSsl ? { ssl: { rejectUnauthorized: false } } : {}),
  });
  await client.connect();

  const start = Date.now();
  try {
    await migrate(drizzle(client), { migrationsFolder });
    process.stderr.write(`[db-migrate] ok (${Date.now() - start}ms; folder=${migrationsFolder})\n`);
  } catch (err) {
    process.stderr.write(
      `[db-migrate] migrate() failed (${String((err as Error)?.message ?? err).slice(
        0,
        200
      )}) — reconciling schema idempotently.\n`
    );
    const r = await reconcileSchema(client, migrationsFolder);
    process.stderr.write(
      `[db-migrate] reconcile done in ${Date.now() - start}ms: applied=${r.applied} skipped(existing)=${r.skipped} failed=${r.failed}\n`
    );
  }

  await client.end();
}

main().catch((err: Error) => {
  process.stderr.write(`[db-migrate] failed: ${err.stack ?? err.message}\n`);
  process.exit(1);
});
