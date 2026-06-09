/**
 * Database client singleton for HoloScript Studio.
 *
 * Uses Drizzle ORM with PostgreSQL. Reads DATABASE_URL from environment.
 * Falls back gracefully when no database is configured (local dev without Postgres).
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

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
  });

  _db = drizzle(_pool, { schema });
  return _db;
}

/**
 * Get the raw `pg` connection pool, creating it on first call (shared with
 * {@link getDb}). Returns null when DATABASE_URL is not configured. Used by
 * modules that need a raw query runner rather than the Drizzle instance — e.g.
 * the HoloKey user-secret store's Postgres backend (`createPostgresSecretBackend`).
 */
export function getPool(): Pool | null {
  // getDb() creates _pool as a side effect when DATABASE_URL is present.
  getDb();
  return _pool;
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
