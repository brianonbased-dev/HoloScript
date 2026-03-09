/**
 * @fileoverview PostgreSQL implementation of ITraitDatabase
 * @module marketplace-api/PostgresTraitDatabase
 *
 * Activated automatically when DATABASE_URL env var is set.
 * Falls back to InMemoryTraitDatabase in development.
 *
 * Schema is auto-migrated on first connect via initSchema().
 */

import { Pool, type PoolClient } from 'pg';
import type {
  TraitPackage,
  TraitSummary,
  VersionInfo,
  SearchQuery,
  SearchResult,
  TraitCategory,
  SearchFacets,
  FacetCount,
} from './types.js';
import type { ITraitDatabase } from './TraitRegistry.js';

// =============================================================================
// SCHEMA
// =============================================================================

const INIT_SQL = `
CREATE TABLE IF NOT EXISTS hs_traits (
  id          TEXT PRIMARY KEY,
  name        TEXT UNIQUE NOT NULL,
  category    TEXT NOT NULL,
  platforms   TEXT[] NOT NULL DEFAULT '{}',
  keywords    TEXT[] NOT NULL DEFAULT '{}',
  author_name TEXT NOT NULL,
  author_verified BOOLEAN NOT NULL DEFAULT FALSE,
  verified    BOOLEAN NOT NULL DEFAULT FALSE,
  deprecated  BOOLEAN NOT NULL DEFAULT FALSE,
  downloads   INTEGER NOT NULL DEFAULT 0,
  weekly_downloads INTEGER NOT NULL DEFAULT 0,
  rating      NUMERIC(4,2) NOT NULL DEFAULT 0,
  rating_count INTEGER NOT NULL DEFAULT 0,
  license     TEXT NOT NULL DEFAULT 'MIT',
  data        JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hs_versions (
  trait_id    TEXT NOT NULL REFERENCES hs_traits(id) ON DELETE CASCADE,
  version     TEXT NOT NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_by TEXT NOT NULL DEFAULT '',
  downloads   INTEGER NOT NULL DEFAULT 0,
  deprecated  BOOLEAN NOT NULL DEFAULT FALSE,
  tarball_url TEXT NOT NULL DEFAULT '',
  shasum      TEXT NOT NULL DEFAULT '',
  size        INTEGER NOT NULL DEFAULT 0,
  data        JSONB NOT NULL,
  PRIMARY KEY (trait_id, version)
);

CREATE INDEX IF NOT EXISTS idx_hs_traits_category ON hs_traits(category);
CREATE INDEX IF NOT EXISTS idx_hs_traits_downloads ON hs_traits(downloads DESC);
CREATE INDEX IF NOT EXISTS idx_hs_traits_created ON hs_traits(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hs_traits_verified ON hs_traits(verified);
CREATE INDEX IF NOT EXISTS idx_hs_traits_name_search ON hs_traits USING GIN(to_tsvector('english', name || ' ' || (data->>'description')));
`;

// =============================================================================
// ROW → DOMAIN MAPPING
// =============================================================================

function rowToTrait(row: Record<string, unknown>): TraitPackage {
  const data = row.data as Record<string, unknown>;
  return {
    ...data,
    id: row.id as string,
    name: row.name as string,
    category: row.category as TraitCategory,
    platforms: row.platforms as TraitPackage['platforms'],
    verified: row.verified as boolean,
    deprecated: row.deprecated as boolean,
    downloads: row.downloads as number,
    weeklyDownloads: row.weekly_downloads as number,
    rating: parseFloat(row.rating as string),
    ratingCount: row.rating_count as number,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
    publishedAt: new Date(row.published_at as string),
  } as TraitPackage;
}

function rowToSummary(row: Record<string, unknown>): TraitSummary {
  const data = row.data as Record<string, unknown>;
  return {
    id: row.id as string,
    name: row.name as string,
    version: (data.version ?? '') as string,
    description: (data.description ?? '') as string,
    author: {
      name: row.author_name as string,
      verified: row.author_verified as boolean,
    },
    category: row.category as TraitCategory,
    platforms: row.platforms as TraitPackage['platforms'],
    downloads: row.downloads as number,
    rating: parseFloat(row.rating as string),
    verified: row.verified as boolean,
    deprecated: row.deprecated as boolean,
    updatedAt: new Date(row.updated_at as string),
  };
}

function rowToVersionInfo(row: Record<string, unknown>): VersionInfo {
  return {
    version: row.version as string,
    publishedAt: new Date(row.published_at as string),
    publishedBy: (row.published_by ?? '') as string,
    downloads: (row.downloads ?? 0) as number,
    deprecated: (row.deprecated ?? false) as boolean,
    tarballUrl: (row.tarball_url ?? '') as string,
    shasum: (row.shasum ?? '') as string,
    size: (row.size ?? 0) as number,
  };
}

// =============================================================================
// POSTGRES IMPLEMENTATION
// =============================================================================

export class PostgresTraitDatabase implements ITraitDatabase {
  private pool: Pool;
  private initialized = false;

  constructor(connectionString: string) {
    // Railway private domain (.railway.internal) uses plain TCP — no SSL
    // External/public connections use SSL with self-signed cert tolerance
    const isPrivate = connectionString.includes('.railway.internal');
    this.pool = new Pool({
      connectionString,
      ssl: isPrivate ? false : { rejectUnauthorized: false },
    });
  }

  private async getClient(): Promise<PoolClient> {
    if (!this.initialized) {
      await this.initSchema();
    }
    return this.pool.connect();
  }

  async initSchema(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(INIT_SQL);
      this.initialized = true;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  // ---------------------------------------------------------------------------
  // CRUD
  // ---------------------------------------------------------------------------

  async insertTrait(trait: TraitPackage): Promise<void> {
    const client = await this.getClient();
    try {
      await client.query('BEGIN');

      await client.query(
        `INSERT INTO hs_traits
           (id, name, category, platforms, keywords, author_name, author_verified,
            verified, deprecated, downloads, weekly_downloads, rating, rating_count,
            license, data, created_at, updated_at, published_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
         ON CONFLICT (id) DO NOTHING`,
        [
          trait.id,
          trait.name,
          trait.category,
          trait.platforms,
          trait.keywords,
          trait.author.name,
          trait.author.verified,
          trait.verified,
          trait.deprecated,
          trait.downloads,
          trait.weeklyDownloads ?? 0,
          trait.rating,
          trait.ratingCount,
          trait.license,
          JSON.stringify(trait),
          trait.createdAt,
          trait.updatedAt,
          trait.publishedAt,
        ]
      );

      await client.query(
        `INSERT INTO hs_versions
           (trait_id, version, published_at, published_by, downloads, deprecated,
            tarball_url, shasum, size, data)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (trait_id, version) DO NOTHING`,
        [
          trait.id,
          trait.version,
          trait.publishedAt,
          trait.author.name,
          0,
          trait.deprecated,
          '',
          '',
          0,
          JSON.stringify(trait),
        ]
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async updateTrait(id: string, updates: Partial<TraitPackage>): Promise<void> {
    const client = await this.getClient();
    try {
      // Fetch current, merge, store back
      const res = await client.query('SELECT data FROM hs_traits WHERE id = $1', [id]);
      if (res.rows.length === 0) return;
      const current = res.rows[0].data as TraitPackage;
      const merged = { ...current, ...updates, updatedAt: new Date() };

      await client.query(
        `UPDATE hs_traits SET
           category    = $2,
           platforms   = $3,
           keywords    = $4,
           author_name = $5,
           author_verified = $6,
           verified    = $7,
           deprecated  = $8,
           downloads   = $9,
           weekly_downloads = $10,
           rating      = $11,
           rating_count = $12,
           license     = $13,
           data        = $14,
           updated_at  = NOW()
         WHERE id = $1`,
        [
          id,
          merged.category,
          merged.platforms,
          merged.keywords,
          merged.author.name,
          merged.author.verified,
          merged.verified,
          merged.deprecated,
          merged.downloads,
          merged.weeklyDownloads ?? 0,
          merged.rating,
          merged.ratingCount,
          merged.license,
          JSON.stringify(merged),
        ]
      );
    } finally {
      client.release();
    }
  }

  async deleteTrait(id: string): Promise<void> {
    const client = await this.getClient();
    try {
      await client.query('DELETE FROM hs_traits WHERE id = $1', [id]);
    } finally {
      client.release();
    }
  }

  async deleteVersion(id: string, version: string): Promise<void> {
    const client = await this.getClient();
    try {
      await client.query('DELETE FROM hs_versions WHERE trait_id = $1 AND version = $2', [
        id,
        version,
      ]);
    } finally {
      client.release();
    }
  }

  // ---------------------------------------------------------------------------
  // RETRIEVAL
  // ---------------------------------------------------------------------------

  async getTraitById(id: string): Promise<TraitPackage | null> {
    const client = await this.getClient();
    try {
      const res = await client.query('SELECT * FROM hs_traits WHERE id = $1', [id]);
      return res.rows.length > 0 ? rowToTrait(res.rows[0]) : null;
    } finally {
      client.release();
    }
  }

  async getTraitByName(name: string): Promise<TraitPackage | null> {
    const client = await this.getClient();
    try {
      const res = await client.query('SELECT * FROM hs_traits WHERE name = $1', [name]);
      return res.rows.length > 0 ? rowToTrait(res.rows[0]) : null;
    } finally {
      client.release();
    }
  }

  async getTraitVersion(name: string, version: string): Promise<TraitPackage | null> {
    const client = await this.getClient();
    try {
      const res = await client.query(
        `SELECT v.data FROM hs_versions v
         JOIN hs_traits t ON t.id = v.trait_id
         WHERE t.name = $1 AND v.version = $2`,
        [name, version]
      );
      if (res.rows.length === 0) return null;
      const data = res.rows[0].data as TraitPackage;
      return {
        ...data,
        createdAt: new Date(data.createdAt),
        updatedAt: new Date(data.updatedAt),
        publishedAt: new Date(data.publishedAt),
      };
    } finally {
      client.release();
    }
  }

  async getVersions(traitId: string): Promise<VersionInfo[]> {
    const client = await this.getClient();
    try {
      const res = await client.query(
        'SELECT * FROM hs_versions WHERE trait_id = $1 ORDER BY published_at DESC',
        [traitId]
      );
      return res.rows.map(rowToVersionInfo);
    } finally {
      client.release();
    }
  }

  // ---------------------------------------------------------------------------
  // SEARCH
  // ---------------------------------------------------------------------------

  async search(query: SearchQuery): Promise<SearchResult> {
    const client = await this.getClient();
    try {
      const conditions: string[] = ['1=1'];
      const params: unknown[] = [];
      let p = 1;

      if (query.q) {
        conditions.push(
          `(name ILIKE $${p} OR (data->>'description') ILIKE $${p} OR $${p + 1} = ANY(keywords))`
        );
        params.push(`%${query.q}%`, query.q.toLowerCase());
        p += 2;
      }
      if (query.category) {
        conditions.push(`category = $${p++}`);
        params.push(query.category);
      }
      if (query.platform) {
        conditions.push(`$${p++} = ANY(platforms)`);
        params.push(query.platform);
      }
      if (query.author) {
        conditions.push(`author_name ILIKE $${p++}`);
        params.push(`%${query.author}%`);
      }
      if (query.verified !== undefined) {
        conditions.push(`verified = $${p++}`);
        params.push(query.verified);
      }
      if (query.deprecated !== undefined) {
        conditions.push(`deprecated = $${p++}`);
        params.push(query.deprecated);
      }
      if (query.minRating !== undefined) {
        conditions.push(`rating >= $${p++}`);
        params.push(query.minRating);
      }
      if (query.minDownloads !== undefined) {
        conditions.push(`downloads >= $${p++}`);
        params.push(query.minDownloads);
      }

      const where = conditions.join(' AND ');
      const countRes = await client.query(`SELECT COUNT(*) FROM hs_traits WHERE ${where}`, params);
      const total = parseInt(countRes.rows[0].count, 10);

      const sortMap: Record<string, string> = {
        downloads: 'downloads',
        rating: 'rating',
        updated: 'updated_at',
        created: 'created_at',
        relevance: 'downloads',
      };
      const orderCol = sortMap[query.sortBy ?? 'relevance'] ?? 'downloads';
      const orderDir = query.sortOrder === 'asc' ? 'ASC' : 'DESC';
      const limit = Math.min(query.limit ?? 20, 100);
      const offset = ((query.page ?? 1) - 1) * limit;

      const res = await client.query(
        `SELECT * FROM hs_traits WHERE ${where}
         ORDER BY ${orderCol} ${orderDir}
         LIMIT $${p} OFFSET $${p + 1}`,
        [...params, limit, offset]
      );

      return {
        results: res.rows.map(rowToSummary),
        total,
        page: query.page ?? 1,
        limit,
        hasMore: offset + res.rows.length < total,
        query,
      };
    } finally {
      client.release();
    }
  }

  async getFacets(query: SearchQuery): Promise<SearchFacets> {
    const client = await this.getClient();
    try {
      const [catRes, platRes, licRes, authRes] = await Promise.all([
        client.query(
          `SELECT category AS value, COUNT(*) AS count FROM hs_traits GROUP BY category ORDER BY count DESC`
        ),
        client.query(
          `SELECT p AS value, COUNT(*) AS count FROM hs_traits, unnest(platforms) AS p GROUP BY p ORDER BY count DESC`
        ),
        client.query(
          `SELECT license AS value, COUNT(*) AS count FROM hs_traits GROUP BY license ORDER BY count DESC`
        ),
        client.query(
          `SELECT author_name AS value, COUNT(*) AS count FROM hs_traits GROUP BY author_name ORDER BY count DESC LIMIT 10`
        ),
      ]);

      const toFacet = (rows: Array<{ value: string; count: string }>): FacetCount[] =>
        rows.map((r) => ({ value: r.value, count: parseInt(r.count, 10) }));

      return {
        categories: toFacet(catRes.rows),
        platforms: toFacet(platRes.rows),
        licenses: toFacet(licRes.rows),
        authors: toFacet(authRes.rows),
      };
    } finally {
      client.release();
    }
  }

  // ---------------------------------------------------------------------------
  // STATS
  // ---------------------------------------------------------------------------

  async incrementDownloads(traitId: string, version: string): Promise<void> {
    const client = await this.getClient();
    try {
      await Promise.all([
        client.query('UPDATE hs_traits SET downloads = downloads + 1 WHERE id = $1', [traitId]),
        client.query(
          'UPDATE hs_versions SET downloads = downloads + 1 WHERE trait_id = $1 AND version = $2',
          [traitId, version]
        ),
      ]);
    } finally {
      client.release();
    }
  }

  async getPopular(category?: TraitCategory, limit = 20): Promise<TraitSummary[]> {
    const client = await this.getClient();
    try {
      const capped = Math.min(limit, 100);
      let res;
      if (category) {
        res = await client.query(
          'SELECT * FROM hs_traits WHERE category = $1 ORDER BY downloads DESC LIMIT $2',
          [category, capped]
        );
      } else {
        res = await client.query('SELECT * FROM hs_traits ORDER BY downloads DESC LIMIT $1', [
          capped,
        ]);
      }
      return res.rows.map(rowToSummary);
    } finally {
      client.release();
    }
  }

  async getRecent(limit = 20): Promise<TraitSummary[]> {
    const client = await this.getClient();
    try {
      const res = await client.query(
        'SELECT * FROM hs_traits ORDER BY published_at DESC LIMIT $1',
        [Math.min(limit, 100)]
      );
      return res.rows.map(rowToSummary);
    } finally {
      client.release();
    }
  }
}
