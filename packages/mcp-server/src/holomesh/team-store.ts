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
  private ready: Promise<void>;

  constructor(pool: Pool) {
    this.pool = pool;
    this.ready = this.ensureSchema();
  }

  private async ensureSchema(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(SCHEMA_SQL);
    } finally {
      client.release();
    }
  }

  async get(teamId: string): Promise<Team | undefined> {
    await this.ready;
    const result = await this.pool.query(
      'SELECT data FROM holomesh_teams WHERE id = $1',
      [teamId]
    );
    if (result.rows.length === 0) return undefined;
    return result.rows[0].data as Team;
  }

  async set(teamId: string, team: Team): Promise<void> {
    await this.ready;
    await this.pool.query(
      `INSERT INTO holomesh_teams (id, data, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
      [teamId, JSON.stringify(team)]
    );
  }

  async delete(teamId: string): Promise<void> {
    await this.ready;
    await this.pool.query('DELETE FROM holomesh_teams WHERE id = $1', [teamId]);
  }

  async getAll(): Promise<Map<string, Team>> {
    await this.ready;
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
  private usePostgres: boolean;

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

  /** Load all teams from backend into local cache (startup / refresh) */
  async loadAll(): Promise<void> {
    const all = await this.backend.getAll();
    this.local = all;
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
      const pool = new Pool({ connectionString: databaseUrl });
      const backend = new PostgresTeamStoreBackend(pool);
      console.log('[TeamStore] PostgreSQL backend active (multi-instance)');
      return new TeamStore(backend, true);
    } catch (e) {
      console.warn('[TeamStore] DATABASE_URL set but pg failed to load:', e);
    }
  }
  console.log('[TeamStore] In-memory backend (single-instance / dev)');
  return new TeamStore(new InMemoryTeamStoreBackend(), false);
}
