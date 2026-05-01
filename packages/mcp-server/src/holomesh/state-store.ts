/**
 * StateStore — Shared backend for agent state across Railway instances.
 *
 * Problem: Railway deploys multiple ephemeral containers. Local filesystem
 * writes (~/.holoscript/holomesh/audit|defense|dispatch) are invisible across
 * instances, so CAEL audit, defense config, and dispatch queues restart at 0
 * on every redeploy (W.101).
 *
 * Solution: When DATABASE_URL is present, store state in PostgreSQL JSONB.
 * A single table serves all three namespaces (audit, defense, dispatch)
 * with namespace/handle/seq discrimination.
 *
 * Pattern mirrors team-store.ts — pluggable backend with auto-migration.
 */

import type { Pool, PoolClient } from 'pg';

// ── Schema DDL ───────────────────────────────────────────────────────────────

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS holomesh_state (
  namespace  TEXT NOT NULL,
  handle     TEXT NOT NULL,
  seq        INTEGER NOT NULL DEFAULT 0,
  data       JSONB NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (namespace, handle, seq)
);
CREATE INDEX IF NOT EXISTS idx_holomesh_state_ns_handle ON holomesh_state (namespace, handle);
CREATE INDEX IF NOT EXISTS idx_holomesh_state_updated ON holomesh_state (updated_at);
`;

// ── Backend Interface ──────────────────────────────────────────────────────────

export interface StateStoreBackend {
  get(namespace: string, handle: string): Promise<unknown | undefined>;
  set(namespace: string, handle: string, data: unknown): Promise<void>;
  append(namespace: string, handle: string, data: unknown): Promise<void>;
  getAll(namespace: string, handle: string): Promise<unknown[]>;
  listHandles(namespace: string): Promise<string[]>;
  delete(namespace: string, handle: string): Promise<void>;
  close?(): Promise<void>;
}

// ── In-Memory Backend (legacy, local dev) ───────────────────────────────────

export class InMemoryStateStoreBackend implements StateStoreBackend {
  private store = new Map<string, unknown[]>();

  private key(namespace: string, handle: string): string {
    return `${namespace}:${handle}`;
  }

  async get(namespace: string, handle: string): Promise<unknown | undefined> {
    const list = this.store.get(this.key(namespace, handle));
    return list && list.length > 0 ? list[list.length - 1] : undefined;
  }

  async set(namespace: string, handle: string, data: unknown): Promise<void> {
    this.store.set(this.key(namespace, handle), [data]);
  }

  async append(namespace: string, handle: string, data: unknown): Promise<void> {
    const key = this.key(namespace, handle);
    const list = this.store.get(key) || [];
    list.push(data);
    this.store.set(key, list);
  }

  async getAll(namespace: string, handle: string): Promise<unknown[]> {
    return [...(this.store.get(this.key(namespace, handle)) || [])];
  }

  async delete(namespace: string, handle: string): Promise<void> {
    this.store.delete(this.key(namespace, handle));
  }

  async listHandles(namespace: string): Promise<string[]> {
    const handles: string[] = [];
    const prefix = `${namespace}:`;
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        handles.push(key.slice(prefix.length));
      }
    }
    return handles;
  }
}

// ── PostgreSQL Backend (production, multi-instance) ─────────────────────────

export class PostgresStateStoreBackend implements StateStoreBackend {
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

  async get(namespace: string, handle: string): Promise<unknown | undefined> {
    await this.ready;
    const result = await this.pool.query(
      'SELECT data FROM holomesh_state WHERE namespace = $1 AND handle = $2 AND seq = 0',
      [namespace, handle]
    );
    if (result.rows.length === 0) return undefined;
    return result.rows[0].data;
  }

  async set(namespace: string, handle: string, data: unknown): Promise<void> {
    await this.ready;
    await this.pool.query(
      `INSERT INTO holomesh_state (namespace, handle, seq, data, updated_at)
       VALUES ($1, $2, 0, $3, NOW())
       ON CONFLICT (namespace, handle, seq) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
      [namespace, handle, JSON.stringify(data)]
    );
  }

  async append(namespace: string, handle: string, data: unknown): Promise<void> {
    await this.ready;
    await this.pool.query(
      `INSERT INTO holomesh_state (namespace, handle, seq, data, updated_at)
       SELECT $1, $2, COALESCE(MAX(seq), 0) + 1, $3, NOW()
       FROM holomesh_state
       WHERE namespace = $1 AND handle = $2`,
      [namespace, handle, JSON.stringify(data)]
    );
  }

  async getAll(namespace: string, handle: string): Promise<unknown[]> {
    await this.ready;
    const result = await this.pool.query(
      'SELECT data FROM holomesh_state WHERE namespace = $1 AND handle = $2 ORDER BY seq',
      [namespace, handle]
    );
    return result.rows.map((r) => r.data);
  }

  async delete(namespace: string, handle: string): Promise<void> {
    await this.ready;
    await this.pool.query(
      'DELETE FROM holomesh_state WHERE namespace = $1 AND handle = $2',
      [namespace, handle]
    );
  }

  async listHandles(namespace: string): Promise<string[]> {
    await this.ready;
    const result = await this.pool.query(
      'SELECT DISTINCT handle FROM holomesh_state WHERE namespace = $1',
      [namespace]
    );
    return result.rows.map((r) => r.handle as string);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createStateStore(): StateStoreBackend {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { Pool } = require('pg');
      const pool = new Pool({ connectionString: databaseUrl });
      console.log('[StateStore] PostgreSQL backend active (multi-instance)');
      return new PostgresStateStoreBackend(pool);
    } catch (e) {
      console.warn('[StateStore] DATABASE_URL set but pg failed to load:', e);
    }
  }
  console.log('[StateStore] In-memory backend (single-instance / dev)');
  return new InMemoryStateStoreBackend();
}
