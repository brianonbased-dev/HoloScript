/**
 * Database client singleton for HoloScript Studio.
 *
 * Uses Drizzle ORM with PostgreSQL. Reads DATABASE_URL from environment.
 * Falls back gracefully when no database is configured (local dev without Postgres).
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.js';

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let _pool: Pool | null = null;

/**
 * Get the Drizzle database instance. Creates the connection pool on first call.
 * Returns null if DATABASE_URL is not configured.
 */
export function getDb() {
  if (_db) return _db;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    return null;
  }

  const isPrivate = connectionString.includes('.railway.internal');
  _pool = new Pool({
    connectionString,
    ssl: isPrivate ? false : { rejectUnauthorized: false },
    max: 10,
    /** First connection on cold deploy can exceed default; avoids flaky /health + API 5xx. */
    connectionTimeoutMillis: Math.max(5000, Number(process.env.PG_CONNECTION_TIMEOUT_MS || 15000)),
    idleTimeoutMillis: 60_000,
  });

  _db = drizzle(_pool, { schema });
  return _db;
}

/**
 * Close the database connection pool. Call on server shutdown.
 */
export async function closeDb() {
  if (_pool) {
    await _pool.end();
    _pool = null;
    _db = null;
  }
}

export type StudioDb = NonNullable<ReturnType<typeof getDb>>;
