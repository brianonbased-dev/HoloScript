/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * CommonJS Drizzle migrate runner — used as the Dockerfile pre-CMD step.
 *
 * Why CJS not ESM: the Next.js standalone runner image doesn't ship tsx,
 * doesn't include esbuild, and using `--experimental-strip-types` is brittle
 * across Node versions. A plain `.cjs` script with `require('pg')` + the
 * drizzle migrator runs anywhere Node + the `pg` dependency exist, which is
 * exactly the runner-image surface.
 *
 * Idempotent — Drizzle's __drizzle_migrations table records applied files,
 * so reruns are no-ops.
 */
const path = require('node:path');

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    process.stderr.write('[db-migrate] DATABASE_URL not set — skipping.\n');
    return;
  }

  const { Client } = require('pg');
  const { drizzle } = require('drizzle-orm/node-postgres');
  const { migrate } = require('drizzle-orm/node-postgres/migrator');

  const useSsl =
    process.env.DRIZZLE_SSL === '1' ||
    /\.proxy\.rlwy\.net|\.railway\.app/.test(url);

  const client = new Client({
    connectionString: url,
    ...(useSsl ? { ssl: { rejectUnauthorized: false } } : {}),
  });
  await client.connect();
  const db = drizzle(client);

  // Migrations folder is alongside this script: ../drizzle relative to scripts/.
  const migrationsFolder = path.join(__dirname, '..', 'drizzle');

  const start = Date.now();
  await migrate(db, { migrationsFolder });
  process.stderr.write(`[db-migrate] ok (${Date.now() - start}ms; folder=${migrationsFolder})\n`);

  await client.end();
}

main().catch((err) => {
  process.stderr.write(`[db-migrate] failed: ${(err && err.stack) || String(err)}\n`);
  process.exit(1);
});
