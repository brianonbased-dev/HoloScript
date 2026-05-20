/**
 * PlayerStore — Shared backend for player/user state across Railway instances.
 *
 * Problem: Railway deploys multiple ephemeral containers. playerRegistry was an
 * in-memory Map, so agents querying any instance other than the one that received
 * the provisioning call saw zero players — even though real users (the founder,
 * agent seats) exist and had been provisioned.
 *
 * Solution: When DATABASE_URL is present, store player state in PostgreSQL JSONB.
 * Mirrors the team-store.ts pattern (W.128/W.136 fix).
 *
 * On startup, initStores() seeds the founder player so agents never see an empty
 * player list on a fresh deploy.
 */

import type { Pool } from 'pg';

// ── StoredPlayer Type ─────────────────────────────────────────────────────────

export interface StoredPlayer {
  id: string;
  name: string;
  walletAddress?: string;
  worldId?: string;
  shardId?: string;
  zoneId?: string;
  status: 'active' | 'suspended' | 'revoked';
  createdAt: string;
  modifiedAt: string;
}

// ── Schema DDL ────────────────────────────────────────────────────────────────

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS hololand_players (
  id          TEXT PRIMARY KEY,
  data        JSONB NOT NULL,
  updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hololand_players_updated ON hololand_players (updated_at);
`;

// ── PlayerStoreBackend Interface ──────────────────────────────────────────────

export interface PlayerStoreBackend {
  get(playerId: string): Promise<StoredPlayer | undefined>;
  set(playerId: string, player: StoredPlayer): Promise<void>;
  delete(playerId: string): Promise<void>;
  getAll(): Promise<Map<string, StoredPlayer>>;
  close?(): Promise<void>;
}

// ── In-Memory Backend (local dev / tests) ────────────────────────────────────

export class InMemoryPlayerStoreBackend implements PlayerStoreBackend {
  private store = new Map<string, StoredPlayer>();

  async get(playerId: string): Promise<StoredPlayer | undefined> {
    return this.store.get(playerId);
  }

  async set(playerId: string, player: StoredPlayer): Promise<void> {
    this.store.set(playerId, player);
  }

  async delete(playerId: string): Promise<void> {
    this.store.delete(playerId);
  }

  async getAll(): Promise<Map<string, StoredPlayer>> {
    return new Map(this.store);
  }
}

// ── PostgreSQL Backend (production, multi-instance) ──────────────────────────

export class PostgresPlayerStoreBackend implements PlayerStoreBackend {
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

  async get(playerId: string): Promise<StoredPlayer | undefined> {
    await this.ready;
    const result = await this.pool.query(
      'SELECT data FROM hololand_players WHERE id = $1',
      [playerId]
    );
    if (result.rows.length === 0) return undefined;
    return result.rows[0].data as StoredPlayer;
  }

  async set(playerId: string, player: StoredPlayer): Promise<void> {
    await this.ready;
    await this.pool.query(
      `INSERT INTO hololand_players (id, data, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
      [playerId, JSON.stringify(player)]
    );
  }

  async delete(playerId: string): Promise<void> {
    await this.ready;
    await this.pool.query('DELETE FROM hololand_players WHERE id = $1', [playerId]);
  }

  async getAll(): Promise<Map<string, StoredPlayer>> {
    await this.ready;
    const result = await this.pool.query('SELECT id, data FROM hololand_players');
    const map = new Map<string, StoredPlayer>();
    for (const row of result.rows) {
      map.set(row.id, row.data as StoredPlayer);
    }
    return map;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

// ── PlayerStore Wrapper (Map-compatible interface) ────────────────────────────

export class PlayerStore {
  readonly [Symbol.toStringTag] = 'PlayerStore';
  private backend: PlayerStoreBackend;
  private local: Map<string, StoredPlayer> = new Map();
  private _usePostgres: boolean;

  constructor(backend: PlayerStoreBackend, usePostgres: boolean) {
    this.backend = backend;
    this._usePostgres = usePostgres;
  }

  get usesPostgres(): boolean {
    return this._usePostgres;
  }

  get size(): number {
    return this.local.size;
  }

  get(playerId: string): StoredPlayer | undefined {
    return this.local.get(playerId);
  }

  async getFresh(playerId: string): Promise<StoredPlayer | undefined> {
    const player = await this.backend.get(playerId);
    if (player) {
      this.local.set(playerId, player);
    } else {
      this.local.delete(playerId);
    }
    return player;
  }

  set(playerId: string, player: StoredPlayer): this {
    this.local.set(playerId, player);
    this.backend.set(playerId, player).catch((e) => {
      console.error('[PlayerStore] backend write failed:', e);
    });
    return this;
  }

  has(playerId: string): boolean {
    return this.local.has(playerId);
  }

  delete(playerId: string): boolean {
    const had = this.local.delete(playerId);
    this.backend.delete(playerId).catch((e) => {
      console.error('[PlayerStore] backend delete failed:', e);
    });
    return had;
  }

  clear(): void {
    this.local.clear();
  }

  values(): IterableIterator<StoredPlayer> {
    return this.local.values();
  }

  keys(): IterableIterator<string> {
    return this.local.keys();
  }

  entries(): IterableIterator<[string, StoredPlayer]> {
    return this.local.entries();
  }

  [Symbol.iterator](): IterableIterator<[string, StoredPlayer]> {
    return this.local[Symbol.iterator]();
  }

  async loadAll(): Promise<void> {
    const all = await this.backend.getAll();
    this.local = all;
  }

  async persist(playerId: string): Promise<void> {
    const player = this.local.get(playerId);
    if (player) {
      await this.backend.set(playerId, player);
    }
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createPlayerStore(): PlayerStore {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { Pool } = require('pg');
      const pool = new Pool({ connectionString: databaseUrl });
      const backend = new PostgresPlayerStoreBackend(pool);
      console.log('[PlayerStore] PostgreSQL backend active (multi-instance)');
      return new PlayerStore(backend, true);
    } catch (e) {
      console.warn('[PlayerStore] DATABASE_URL set but pg failed to load:', e);
    }
  }
  console.log('[PlayerStore] In-memory backend (single-instance / dev)');
  return new PlayerStore(new InMemoryPlayerStoreBackend(), false);
}
