/**
 * GeoAnchorStore - shared backend for HoloLand geo anchors.
 *
 * When DATABASE_URL is present, anchors are persisted in PostgreSQL JSONB so
 * Railway replicas and restarts see the same world-locking records. Local dev
 * and tests use an in-memory backend with the same Map-like wrapper.
 */

import type { Pool } from 'pg';

export interface GeoAnchorSafetyEnvelope {
  targetingUseProhibited: true;
  humanApprovalRequiredForActuation: true;
  permittedUses: string[];
  prohibitedUses: string[];
  doctrine: 'D.044';
}

export interface StoredGeoAnchor {
  id: string;
  placeId?: string;
  zoneId?: string;
  lat: number;
  lng: number;
  alt?: number;
  radius: number;
  persistent: boolean;
  safety: GeoAnchorSafetyEnvelope;
  createdAt: string;
  modifiedAt: string;
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS hololand_geo_anchors (
  id          TEXT PRIMARY KEY,
  data        JSONB NOT NULL,
  lat         DOUBLE PRECISION NOT NULL,
  lng         DOUBLE PRECISION NOT NULL,
  place_id    TEXT,
  zone_id     TEXT,
  updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hololand_geo_anchors_place ON hololand_geo_anchors (place_id);
CREATE INDEX IF NOT EXISTS idx_hololand_geo_anchors_zone ON hololand_geo_anchors (zone_id);
CREATE INDEX IF NOT EXISTS idx_hololand_geo_anchors_lat_lng ON hololand_geo_anchors (lat, lng);
CREATE INDEX IF NOT EXISTS idx_hololand_geo_anchors_updated ON hololand_geo_anchors (updated_at);
`;

export interface GeoAnchorStoreBackend {
  get(anchorId: string): Promise<StoredGeoAnchor | undefined>;
  set(anchorId: string, anchor: StoredGeoAnchor): Promise<void>;
  delete(anchorId: string): Promise<void>;
  getAll(): Promise<Map<string, StoredGeoAnchor>>;
  clear(): Promise<void>;
  close?(): Promise<void>;
}

export class InMemoryGeoAnchorStoreBackend implements GeoAnchorStoreBackend {
  private store = new Map<string, StoredGeoAnchor>();

  async get(anchorId: string): Promise<StoredGeoAnchor | undefined> {
    return this.store.get(anchorId);
  }

  async set(anchorId: string, anchor: StoredGeoAnchor): Promise<void> {
    this.store.set(anchorId, anchor);
  }

  async delete(anchorId: string): Promise<void> {
    this.store.delete(anchorId);
  }

  async getAll(): Promise<Map<string, StoredGeoAnchor>> {
    return new Map(this.store);
  }

  async clear(): Promise<void> {
    this.store.clear();
  }
}

export class PostgresGeoAnchorStoreBackend implements GeoAnchorStoreBackend {
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

  async get(anchorId: string): Promise<StoredGeoAnchor | undefined> {
    await this.ready;
    const result = await this.pool.query('SELECT data FROM hololand_geo_anchors WHERE id = $1', [
      anchorId,
    ]);
    if (result.rows.length === 0) return undefined;
    return result.rows[0].data as StoredGeoAnchor;
  }

  async set(anchorId: string, anchor: StoredGeoAnchor): Promise<void> {
    await this.ready;
    await this.pool.query(
      `INSERT INTO hololand_geo_anchors (id, data, lat, lng, place_id, zone_id, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (id) DO UPDATE SET
         data = EXCLUDED.data,
         lat = EXCLUDED.lat,
         lng = EXCLUDED.lng,
         place_id = EXCLUDED.place_id,
         zone_id = EXCLUDED.zone_id,
         updated_at = NOW()`,
      [
        anchorId,
        JSON.stringify(anchor),
        anchor.lat,
        anchor.lng,
        anchor.placeId ?? null,
        anchor.zoneId ?? null,
      ]
    );
  }

  async delete(anchorId: string): Promise<void> {
    await this.ready;
    await this.pool.query('DELETE FROM hololand_geo_anchors WHERE id = $1', [anchorId]);
  }

  async getAll(): Promise<Map<string, StoredGeoAnchor>> {
    await this.ready;
    const result = await this.pool.query('SELECT id, data FROM hololand_geo_anchors');
    const map = new Map<string, StoredGeoAnchor>();
    for (const row of result.rows) {
      map.set(row.id, row.data as StoredGeoAnchor);
    }
    return map;
  }

  async clear(): Promise<void> {
    await this.ready;
    await this.pool.query('DELETE FROM hololand_geo_anchors');
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

export class GeoAnchorStore {
  readonly [Symbol.toStringTag] = 'GeoAnchorStore';
  private backend: GeoAnchorStoreBackend;
  private local: Map<string, StoredGeoAnchor> = new Map();
  private usePostgres: boolean;

  constructor(backend: GeoAnchorStoreBackend, usePostgres: boolean) {
    this.backend = backend;
    this.usePostgres = usePostgres;
  }

  get usesPostgres(): boolean {
    return this.usePostgres;
  }

  get size(): number {
    return this.local.size;
  }

  get(anchorId: string): StoredGeoAnchor | undefined {
    return this.local.get(anchorId);
  }

  async getFresh(anchorId: string): Promise<StoredGeoAnchor | undefined> {
    const anchor = await this.backend.get(anchorId);
    if (anchor) {
      this.local.set(anchorId, anchor);
      return anchor;
    }
    const local = this.local.get(anchorId);
    if (local?.persistent === false) return local;
    this.local.delete(anchorId);
    return undefined;
  }

  setLocal(anchorId: string, anchor: StoredGeoAnchor): this {
    this.local.set(anchorId, anchor);
    return this;
  }

  async setDurable(anchorId: string, anchor: StoredGeoAnchor): Promise<this> {
    this.local.set(anchorId, anchor);
    await this.backend.set(anchorId, anchor);
    return this;
  }

  delete(anchorId: string): boolean {
    const had = this.local.delete(anchorId);
    this.backend.delete(anchorId).catch((e) => {
      console.error('[GeoAnchorStore] backend delete failed:', e);
    });
    return had;
  }

  clearLocal(): void {
    this.local.clear();
  }

  clear(): void {
    this.local.clear();
    this.backend.clear().catch((e) => {
      console.error('[GeoAnchorStore] backend clear failed:', e);
    });
  }

  values(): IterableIterator<StoredGeoAnchor> {
    return this.local.values();
  }

  keys(): IterableIterator<string> {
    return this.local.keys();
  }

  entries(): IterableIterator<[string, StoredGeoAnchor]> {
    return this.local.entries();
  }

  [Symbol.iterator](): IterableIterator<[string, StoredGeoAnchor]> {
    return this.local[Symbol.iterator]();
  }

  async loadAll(): Promise<void> {
    const ephemeral = Array.from(this.local.entries()).filter(
      ([, anchor]) => anchor.persistent === false
    );
    const all = await this.backend.getAll();
    for (const [id, anchor] of ephemeral) {
      all.set(id, anchor);
    }
    this.local = all;
  }
}

export function createGeoAnchorStore(): GeoAnchorStore {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { Pool } = require('pg');
      const pool = new Pool({ connectionString: databaseUrl });
      const backend = new PostgresGeoAnchorStoreBackend(pool);
      console.log('[GeoAnchorStore] PostgreSQL backend active (multi-instance)');
      return new GeoAnchorStore(backend, true);
    } catch (e) {
      console.warn('[GeoAnchorStore] DATABASE_URL set but pg failed to load:', e);
    }
  }
  console.log('[GeoAnchorStore] In-memory backend (single-instance / dev)');
  return new GeoAnchorStore(new InMemoryGeoAnchorStoreBackend(), false);
}
