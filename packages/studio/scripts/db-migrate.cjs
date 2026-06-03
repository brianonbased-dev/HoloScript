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
 * Two-stage, converge-or-boot strategy:
 *
 *   1. FAST PATH — `migrate()` (drizzle, ledger-aware). Brings a fresh DB
 *      fully up to schema and records applied files in __drizzle_migrations
 *      so reruns are no-ops. Also handles any future 0001+, 0002+ migrations.
 *
 *   2. SELF-HEAL — if `migrate()` throws, it is almost always because the
 *      migration runs inside ONE transaction and a single "relation already
 *      exists" aborts and ROLLS BACK the whole file (and never records it as
 *      applied). The previous version swallowed that error and booted anyway,
 *      leaving a PARTIAL schema that never converged — e.g. `holomesh_*` tables
 *      present (created by an earlier partial push) but the NextAuth tables
 *      (`users`/`accounts`/`sessions`/`verification_tokens`) missing, which
 *      makes every OAuth sign-in fail with NextAuth `error=Callback`
 *      (`relation "users" does not exist`).
 *
 *      So instead of swallowing, we reconcile: replay every migration .sql
 *      statement INDIVIDUALLY (autocommit, no wrapping transaction) with
 *      `CREATE TABLE/INDEX` rewritten to `IF NOT EXISTS`, ignoring per-statement
 *      "already exists"/duplicate errors. This creates only the MISSING objects
 *      and is safe to run on every boot. Additive only — never drops anything.
 *
 * Boot policy: a DB we can't CONNECT to is a real infra fault → exit 1 so the
 * healthcheck keeps the previous deploy. A schema reconcile that can't fully
 * apply is logged but NEVER blocks boot (best-effort schema beats no service).
 */
const fs = require('node:fs');
const path = require('node:path');

// Postgres SQLSTATE codes that mean "the object already exists" — safe to skip
// when reconciling idempotently.
const DUPLICATE_CODES = new Set([
  '42P07', // duplicate_table
  '42710', // duplicate_object (constraint, etc.)
  '42701', // duplicate_column
  '42P06', // duplicate_schema
  '42P16', // invalid_table_definition (e.g. multiple primary keys already set)
  '23505', // unique_violation (ledger / seed races)
]);

function isDuplicateError(err) {
  if (err && DUPLICATE_CODES.has(err.code)) return true;
  return /already exists|duplicate/i.test(String((err && err.message) || err));
}

/** Make a single DDL statement idempotent where Postgres supports IF NOT EXISTS. */
function idempotent(stmt) {
  return stmt
    .replace(/^\s*CREATE\s+TABLE\s+(?!IF\s+NOT\s+EXISTS)/i, 'CREATE TABLE IF NOT EXISTS ')
    .replace(
      /^\s*CREATE\s+(UNIQUE\s+)?INDEX\s+(?!IF\s+NOT\s+EXISTS)/i,
      (_m, uniq) => `CREATE ${uniq ? 'UNIQUE ' : ''}INDEX IF NOT EXISTS `
    );
}

/**
 * Replay every migration file statement-by-statement, additively.
 * Returns { applied, skipped, failed } counts.
 */
async function reconcileSchema(client, migrationsFolder) {
  const files = fs
    .readdirSync(migrationsFolder)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  let applied = 0;
  let skipped = 0;
  let failed = 0;

  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsFolder, file), 'utf8');
    const statements = sql
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter(Boolean);

    for (const raw of statements) {
      const stmt = idempotent(raw);
      try {
        await client.query(stmt);
        applied++;
      } catch (err) {
        if (isDuplicateError(err)) {
          skipped++;
        } else {
          failed++;
          process.stderr.write(
            `[db-migrate] reconcile: statement failed (continuing): ${String(
              (err && err.message) || err
            ).slice(0, 200)}\n`
          );
        }
      }
    }
  }

  return { applied, skipped, failed };
}

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
    process.env.DRIZZLE_SSL === '1' || /\.proxy\.rlwy\.net|\.railway\.app/.test(url);

  const client = new Client({
    connectionString: url,
    ...(useSsl ? { ssl: { rejectUnauthorized: false } } : {}),
  });

  // Connection failure is a real infra fault — let it propagate to exit 1 so
  // the healthcheck preserves the previous deploy.
  await client.connect();

  // Migrations folder is alongside this script: ../drizzle relative to scripts/.
  const migrationsFolder = path.join(__dirname, '..', 'drizzle');

  const start = Date.now();
  try {
    const db = drizzle(client);
    await migrate(db, { migrationsFolder });
    process.stderr.write(`[db-migrate] ok (${Date.now() - start}ms; folder=${migrationsFolder})\n`);
  } catch (err) {
    // migrate() rolled back the whole file (transactional). Converge the schema
    // additively instead of swallowing and booting with a partial schema.
    process.stderr.write(
      `[db-migrate] migrate() failed (${String((err && err.message) || err).slice(
        0,
        200
      )}) — reconciling schema idempotently.\n`
    );
    try {
      const r = await reconcileSchema(client, migrationsFolder);
      process.stderr.write(
        `[db-migrate] reconcile done in ${Date.now() - start}ms: applied=${r.applied} skipped(existing)=${r.skipped} failed=${r.failed}\n`
      );
    } catch (reErr) {
      // Best-effort: never block boot on a reconcile error.
      process.stderr.write(
        `[db-migrate] reconcile error (continuing to boot): ${String(
          (reErr && reErr.stack) || reErr
        ).slice(0, 400)}\n`
      );
    }
  }

  await client.end();
}

main().catch((err) => {
  // Reached only on connection failure (real infra fault) — block boot so the
  // healthcheck keeps the prior deploy rather than serving a DB-less Studio.
  process.stderr.write(`[db-migrate] failed: ${(err && err.stack) || String(err)}\n`);
  process.exit(1);
});
