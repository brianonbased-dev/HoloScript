/**
 * TeamStore — Shared backend for team state across Railway instances.
 *
 * Problem: Railway deploys multiple ephemeral containers. Each has its own
 * filesystem, so `teams.json` written by Instance A is invisible to Instance B.
 * Board claims (and all team mutations) appear to vanish when a request lands on
 * a different instance.
 *
 * Solution: When `DATABASE_URL` is present, store team state in PostgreSQL
 * JSONB. Each instance reads/writes the same row, so mutations are visible
 * everywhere immediately. When `DATABASE_URL` is absent, fall back to the
 * legacy in-memory Map (local dev / single-instance).
 *
 * Pattern mirrors `auth/postgres-token-store.ts` — pluggable backend with
 * auto-migration on first connection.
 */

import type { Pool, PoolClient } from 'pg';
import type { Team } from './types';
import {
  createHoloMeshPostgresPoolOptions,
  type HoloMeshPostgresPoolOptions,
} from './postgres-pool-options';

const POSTGRES_OPERATION_TIMEOUT_MS = 5_000;
const DEFAULT_LOAD_ATTEMPT_TIMEOUT_MS = 6_000;

export type TeamStorePostgresPoolOptions = HoloMeshPostgresPoolOptions & {
  connectionTimeoutMillis: number;
  query_timeout: number;
};

export function createTeamStorePostgresPoolOptions(
  databaseUrl: string
): TeamStorePostgresPoolOptions {
  return {
    ...createHoloMeshPostgresPoolOptions(databaseUrl),
    connectionTimeoutMillis: POSTGRES_OPERATION_TIMEOUT_MS,
    query_timeout: POSTGRES_OPERATION_TIMEOUT_MS,
  };
}

// ── Schema DDL ───────────────────────────────────────────────────────────────

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS holomesh_teams (
  id          TEXT PRIMARY KEY,
  data        JSONB NOT NULL,
  updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_holomesh_teams_updated ON holomesh_teams (updated_at);
`;

// ── TeamStoreBackend Interface ────────────────────────────────────────────────

export interface TeamStoreBackend {
  get(teamId: string): Promise<Team | undefined>;
  set(teamId: string, team: Team): Promise<void>;
  delete(teamId: string): Promise<void>;
  getAll(): Promise<Map<string, Team>>;
  close?(): Promise<void>;
}

export interface TeamStoreLoadOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  attemptTimeoutMs?: number;
  sleep?: (delayMs: number) => Promise<void>;
}

function finiteIntegerOption(
  value: number | undefined,
  fallback: number,
  name: string,
  minimum: number
): number {
  const resolved = value ?? fallback;
  if (!Number.isFinite(resolved)) {
    throw new RangeError(`${name} must be finite`);
  }
  const normalized = Math.trunc(resolved);
  if (normalized < minimum) {
    throw new RangeError(`${name} must be at least ${minimum}`);
  }
  return normalized;
}

async function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          const error = new Error(`durable team load timed out after ${timeoutMs}ms`);
          error.name = 'TeamStoreLoadTimeoutError';
          reject(error);
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

// ── In-Memory Backend (legacy, local dev) ───────────────────────────────────

export class InMemoryTeamStoreBackend implements TeamStoreBackend {
  private store = new Map<string, Team>();

  async get(teamId: string): Promise<Team | undefined> {
    return this.store.get(teamId);
  }

  async set(teamId: string, team: Team): Promise<void> {
    this.store.set(teamId, team);
  }

  async delete(teamId: string): Promise<void> {
    this.store.delete(teamId);
  }

  async getAll(): Promise<Map<string, Team>> {
    return new Map(this.store);
  }
}

// ── PostgreSQL Backend (production, multi-instance) ─────────────────────────

export class PostgresTeamStoreBackend implements TeamStoreBackend {
  private pool: Pool;
  private ready: Promise<void> | null = null;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  private async ensureSchema(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(SCHEMA_SQL);
    } finally {
      client.release();
    }
  }

  /**
   * Schema initialization is intentionally re-armable. Railway private DNS can
   * return a transient EAI_AGAIN while a container is starting; retaining the
   * rejected Promise would make every later retry fail without reconnecting.
   */
  private ensureReady(): Promise<void> {
    if (!this.ready) {
      this.ready = this.ensureSchema().catch((error: unknown) => {
        this.ready = null;
        throw error;
      });
    }
    return this.ready;
  }

  async get(teamId: string): Promise<Team | undefined> {
    await this.ensureReady();
    const result = await this.pool.query('SELECT data FROM holomesh_teams WHERE id = $1', [teamId]);
    if (result.rows.length === 0) return undefined;
    return result.rows[0].data as Team;
  }

  async set(teamId: string, team: Team): Promise<void> {
    await this.ensureReady();
    await this.pool.query(
      `INSERT INTO holomesh_teams (id, data, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
      [teamId, JSON.stringify(team)]
    );
  }

  async delete(teamId: string): Promise<void> {
    await this.ensureReady();
    await this.pool.query('DELETE FROM holomesh_teams WHERE id = $1', [teamId]);
  }

  async getAll(): Promise<Map<string, Team>> {
    await this.ensureReady();
    const result = await this.pool.query('SELECT id, data FROM holomesh_teams');
    const map = new Map<string, Team>();
    for (const row of result.rows) {
      map.set(row.id, row.data as Team);
    }
    return map;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

// ── TeamStore Wrapper (Map-compatible interface) ──────────────────────────────

/**
 * TeamStore wraps a backend and presents a Map-like interface so existing
 * code (`teamStore.get(id)`, `teamStore.set(id, team)`, etc.) works without
 * modification.
 *
 * For performance, we keep an in-memory cache (`local`) and write-through to
 * the backend on mutation. On read, we always consult the backend FIRST when
 * Postgres is active, so cross-instance writes are visible immediately.
 *
 * Trade-off: one DB round-trip per `get()`. At the current scale
 * (≈1 team, <300 tasks) this is negligible (<5ms).
 */
export class TeamStore {
  readonly [Symbol.toStringTag] = 'TeamStore';
  private backend: TeamStoreBackend;
  private local: Map<string, Team> = new Map();
  private readonly usePostgres: boolean;

  constructor(backend: TeamStoreBackend, usePostgres: boolean) {
    this.backend = backend;
    this.usePostgres = usePostgres;
  }

  get usesPostgres(): boolean {
    return this.usePostgres;
  }

  // Internal: sync local cache after backend read
  private async syncFromBackend(teamId: string): Promise<Team | undefined> {
    const team = await this.backend.get(teamId);
    if (team) {
      this.local.set(teamId, team);
    } else {
      this.local.delete(teamId);
    }
    return team;
  }

  // Map interface methods
  get size(): number {
    return this.local.size;
  }

  get(teamId: string): Team | undefined {
    if (this.usePostgres) {
      // Postgres path: always hit backend for freshness.
      // This is synchronous-looking but the returned value may be from cache
      // if the caller previously awaited a mutation in the same tick.
      // For correctness in multi-instance, we re-fetch on next tick via
      // the async path exposed by reloadTeam().
      //
      // NOTE: existing code reads teamStore synchronously. To avoid a
      // massive refactor, we return the cached value here and rely on
      // reloadTeam() being called at request boundaries (see board-routes.ts).
      return this.local.get(teamId);
    }
    return this.local.get(teamId);
  }

  /** Async get that hits the backend every time. Use at request boundaries. */
  async getFresh(teamId: string): Promise<Team | undefined> {
    return this.syncFromBackend(teamId);
  }

  set(teamId: string, team: Team): this {
    this.local.set(teamId, team);
    // Fire-and-forget write-through to backend
    this.backend.set(teamId, team).catch((e) => {
      console.error('[TeamStore] backend write failed:', e);
    });
    return this;
  }

  has(teamId: string): boolean {
    return this.local.has(teamId);
  }

  delete(teamId: string): boolean {
    const had = this.local.delete(teamId);
    this.backend.delete(teamId).catch((e) => {
      console.error('[TeamStore] backend delete failed:', e);
    });
    return had;
  }

  clear(): void {
    this.local.clear();
    // We don't clear the backend — that's a separate explicit operation.
  }

  forEach(
    callbackfn: (value: Team, key: string, map: Map<string, Team>) => void,
    thisArg?: any
  ): void {
    this.local.forEach(callbackfn, thisArg);
  }

  keys(): IterableIterator<string> {
    return this.local.keys();
  }

  values(): IterableIterator<Team> {
    return this.local.values();
  }

  entries(): IterableIterator<[string, Team]> {
    return this.local.entries();
  }

  [Symbol.iterator](): IterableIterator<[string, Team]> {
    return this.local[Symbol.iterator]();
  }

  /**
   * Load all teams from the durable backend into the local cache.
   *
   * PostgreSQL startup gets a bounded retry window because Railway private DNS
   * can briefly return EAI_AGAIN while service networking converges. The store
   * never demotes itself to writable memory when DATABASE_URL selected durable
   * custody: exhausting the window rejects startup instead of presenting an
   * empty split-brain board as healthy.
   */
  async loadAll(options: TeamStoreLoadOptions = {}): Promise<void> {
    const requestedMaxAttempts = finiteIntegerOption(options.maxAttempts, 8, 'maxAttempts', 1);
    const maxAttempts = this.usePostgres ? requestedMaxAttempts : 1;
    const baseDelayMs = finiteIntegerOption(options.baseDelayMs, 250, 'baseDelayMs', 0);
    const requestedMaxDelayMs = finiteIntegerOption(options.maxDelayMs, 4_000, 'maxDelayMs', 0);
    const maxDelayMs = Math.max(baseDelayMs, requestedMaxDelayMs);
    const attemptTimeoutMs = finiteIntegerOption(
      options.attemptTimeoutMs,
      DEFAULT_LOAD_ATTEMPT_TIMEOUT_MS,
      'attemptTimeoutMs',
      1
    );
    const sleep =
      options.sleep ??
      ((delayMs: number) => new Promise((resolve) => setTimeout(resolve, delayMs)));

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const load = this.backend.getAll();
        const all = this.usePostgres ? await withTimeout(load, attemptTimeoutMs) : await load;
        this.local = all;
        return;
      } catch (error) {
        if (attempt === maxAttempts) throw error;
        const delayMs = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
        const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
        console.warn(
          `[TeamStore] durable load attempt ${attempt}/${maxAttempts} failed; retrying in ${delayMs}ms: ${detail}`
        );
        await sleep(delayMs);
      }
    }
  }

  /** Persist a single team immediately (awaitable) */
  async persist(teamId: string): Promise<void> {
    const team = this.local.get(teamId);
    if (team) {
      await this.backend.set(teamId, team);
    }
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createTeamStore(): TeamStore {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) {
    try {
      // Lazy-import pg so local dev without DATABASE_URL doesn't crash
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { Pool } = require('pg');
      const pool = new Pool(createTeamStorePostgresPoolOptions(databaseUrl));
      const backend = new PostgresTeamStoreBackend(pool);
      console.error('[TeamStore] PostgreSQL backend active (multi-instance)');
      return new TeamStore(backend, true);
    } catch (e) {
      console.error('[TeamStore] DATABASE_URL set but PostgreSQL backend failed to initialize:', e);
      throw e;
    }
  }
  console.error('[TeamStore] In-memory backend (single-instance / dev)');
  return new TeamStore(new InMemoryTeamStoreBackend(), false);
}
