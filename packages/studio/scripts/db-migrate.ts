/**
 * Apply Drizzle migrations to the configured database.
 *
 * Idempotent runner used by:
 *   - the Dockerfile entrypoint (to bring fresh containers up to schema)
 *   - the `db:migrate` package script (manual / CI runs)
 *
 * Reads `DATABASE_URL` from the environment. Skips if the variable is
 * missing — local dev should fall back to in-memory mode rather than
 * fail boot. In prod the orchestrator sets DATABASE_URL on the Studio
 * service (verified 2026-04-29 via Railway GraphQL).
 *
 * Migration files live under `./drizzle/` and are produced by
 * `pnpm drizzle-kit generate` from `src/db/schema.ts`. Each migration
 * is recorded by drizzle in the `__drizzle_migrations` table so reruns
 * are no-ops.
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Client } from 'pg';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    process.stderr.write('[db-migrate] DATABASE_URL not set — skipping migrations.\n');
    return;
  }

  const here = dirname(fileURLToPath(import.meta.url));
  const migrationsFolder = join(here, '..', 'drizzle');

  // Railway's TCP proxy uses TLS; the internal hostname doesn't.
  // Heuristic: if the URL points at *.proxy.rlwy.net or *.railway.app, force
  // SSL. Otherwise rely on DRIZZLE_SSL=1 to opt in explicitly.
  const useSsl =
    process.env.DRIZZLE_SSL === '1' ||
    /\.proxy\.rlwy\.net|\.railway\.app/.test(url);

  const client = new Client({
    connectionString: url,
    ...(useSsl ? { ssl: { rejectUnauthorized: false } } : {}),
  });
  await client.connect();
  const db = drizzle(client);

  const start = Date.now();
  await migrate(db, { migrationsFolder });
  const elapsed = Date.now() - start;
  process.stderr.write(`[db-migrate] ok (${elapsed}ms; folder=${migrationsFolder})\n`);

  await client.end();
}

main().catch((err: Error) => {
  process.stderr.write(`[db-migrate] failed: ${err.stack ?? err.message}\n`);
  process.exit(1);
});
