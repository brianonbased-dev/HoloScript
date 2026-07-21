/**
 * MeshToolStore — persistent backend for mesh-published tool manifests.
 *
 * Problem (task_1784589178204_gnzq, capability-matrix "in-memory-only state"
 * pattern): the mesh-tool registry lived in a process-local Map, so every
 * Railway deploy wiped ALL mesh-published tools, and re-publishes with a
 * changed endpoint accumulated stale duplicates (manifest ids are
 * content-hash-derived, so a new endpoint = a new id beside the old one —
 * observed live 2026-07-20: mesh_tool_holoclaw_route_73f7fea6380b stale +
 * _7894d3b8dad9 current coexisting).
 *
 * Solution: when `DATABASE_URL` is present, persist manifests in PostgreSQL
 * JSONB and hydrate the in-memory cache at startup; upserts REPLACE any prior
 * manifest from the same (name, publisher_agent_id) so duplicates cannot
 * accumulate. When `DATABASE_URL` is absent, fall back to an in-memory
 * backend (local dev / single-instance) — behavior is unchanged from before
 * except that dedupe-on-publish also applies.
 *
 * Pattern mirrors `holomesh/team-store.ts` (pluggable backend, auto-migration
 * on first connection, lazy pg import).
 */

import type { Pool } from 'pg';
import type { MeshToolManifest } from './mesh-tool-registry';
import { createHoloMeshPostgresPoolOptions } from './postgres-pool-options';

// ── Schema DDL ───────────────────────────────────────────────────────────────

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS holomesh_mesh_tools (
  id                 TEXT PRIMARY KEY,
  name               TEXT NOT NULL,
  publisher_agent_id TEXT NOT NULL,
  data               JSONB NOT NULL,
  last_healthy_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at         TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_holomesh_mesh_tools_name_publisher
  ON holomesh_mesh_tools (name, publisher_agent_id);
`;

// ── Backend interface ────────────────────────────────────────────────────────

export interface MeshToolStoreRow {
  manifest: MeshToolManifest;
  lastHealthyAt: string;
}

export interface MeshToolStoreBackend {
  /**
   * Insert the manifest, REPLACING any existing manifest with the same
   * (name, publisher) — this is the dedupe seam: a re-publish with a changed
   * endpoint gets a new content-hash id, and the old id must not linger.
   */
  upsertReplacing(manifest: MeshToolManifest): Promise<void>;
  delete(id: string): Promise<void>;
  getAll(): Promise<MeshToolStoreRow[]>;
  markHealthy(id: string, at: string): Promise<void>;
  close?(): Promise<void>;
}

// ── In-memory backend (local dev / single-instance) ──────────────────────────

export class InMemoryMeshToolStoreBackend implements MeshToolStoreBackend {
  private rows = new Map<string, MeshToolStoreRow>();

  async upsertReplacing(manifest: MeshToolManifest): Promise<void> {
    for (const [id, row] of this.rows) {
      if (
        row.manifest.name === manifest.name &&
        row.manifest.attestation.publisherAgentId === manifest.attestation.publisherAgentId &&
        id !== manifest.id
      ) {
        this.rows.delete(id);
      }
    }
    this.rows.set(manifest.id, { manifest, lastHealthyAt: new Date().toISOString() });
  }

  async delete(id: string): Promise<void> {
    this.rows.delete(id);
  }

  async getAll(): Promise<MeshToolStoreRow[]> {
    return Array.from(this.rows.values());
  }

  async markHealthy(id: string, at: string): Promise<void> {
    const row = this.rows.get(id);
    if (row) row.lastHealthyAt = at;
  }
}

// ── PostgreSQL backend (production) ──────────────────────────────────────────

export class PostgresMeshToolStoreBackend implements MeshToolStoreBackend {
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

  async upsertReplacing(manifest: MeshToolManifest): Promise<void> {
    await this.ready;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // Dedupe: a changed endpoint mints a new content-hash id, so delete any
      // prior row from the same (name, publisher) before inserting.
      await client.query(
        'DELETE FROM holomesh_mesh_tools WHERE name = $1 AND publisher_agent_id = $2 AND id <> $3',
        [manifest.name, manifest.attestation.publisherAgentId, manifest.id]
      );
      await client.query(
        `INSERT INTO holomesh_mesh_tools (id, name, publisher_agent_id, data, last_healthy_at, updated_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW())
         ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
        [manifest.id, manifest.name, manifest.attestation.publisherAgentId, JSON.stringify(manifest)]
      );
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async delete(id: string): Promise<void> {
    await this.ready;
    await this.pool.query('DELETE FROM holomesh_mesh_tools WHERE id = $1', [id]);
  }

  async getAll(): Promise<MeshToolStoreRow[]> {
    await this.ready;
    const result = await this.pool.query(
      'SELECT data, last_healthy_at FROM holomesh_mesh_tools'
    );
    return result.rows.map((row) => ({
      manifest: row.data as MeshToolManifest,
      lastHealthyAt: new Date(row.last_healthy_at ?? Date.now()).toISOString(),
    }));
  }

  async markHealthy(id: string, at: string): Promise<void> {
    await this.ready;
    await this.pool.query('UPDATE holomesh_mesh_tools SET last_healthy_at = $2 WHERE id = $1', [
      id,
      at,
    ]);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

// ── Factory (mirrors createTeamStore) ────────────────────────────────────────

export function createMeshToolStoreBackend(): MeshToolStoreBackend {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) {
    try {
      // Lazy-import pg so local dev without DATABASE_URL doesn't crash
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { Pool } = require('pg');
      const pool = new Pool(createHoloMeshPostgresPoolOptions(databaseUrl));
      console.error('[MeshToolStore] PostgreSQL backend active (deploy-survivable)');
      return new PostgresMeshToolStoreBackend(pool);
    } catch (e) {
      console.warn('[MeshToolStore] DATABASE_URL set but pg failed to load:', e);
    }
  }
  console.error('[MeshToolStore] In-memory backend (single-instance / dev)');
  return new InMemoryMeshToolStoreBackend();
}
