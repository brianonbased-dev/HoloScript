/**
 * @fileoverview PostgreSQL implementation of ISkillDatabase
 * @module marketplace-api/PostgresSkillDatabase
 *
 * Activated automatically when DATABASE_URL env var is set.
 * Falls back to InMemorySkillDatabase in development.
 *
 * Mirrors PostgresTraitDatabase: the full SkillPackage is stored as JSONB in
 * `data`, with hot columns extracted for filtering/sorting. Schema is
 * auto-migrated on first connect via initSchema().
 */

import { Pool, type PoolClient } from 'pg';
import type {
  SkillPackage,
  SkillSearchQuery,
  SkillCategory,
  SkillTargetPlatform,
} from './types.js';
import type { ISkillDatabase } from './SkillMarketplaceService.js';

// =============================================================================
// SCHEMA
// =============================================================================

const INIT_SQL = `
CREATE TABLE IF NOT EXISTS hs_skills (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  version         TEXT NOT NULL DEFAULT '0.0.0',
  category        TEXT NOT NULL,
  target_platform TEXT NOT NULL,
  keywords        TEXT[] NOT NULL DEFAULT '{}',
  author_name     TEXT NOT NULL,
  author_verified BOOLEAN NOT NULL DEFAULT FALSE,
  verified        BOOLEAN NOT NULL DEFAULT FALSE,
  published       BOOLEAN NOT NULL DEFAULT TRUE,
  deprecated      BOOLEAN NOT NULL DEFAULT FALSE,
  pricing_model   TEXT NOT NULL DEFAULT 'free',
  price           INTEGER NOT NULL DEFAULT 0,
  downloads       INTEGER NOT NULL DEFAULT 0,
  installs        INTEGER NOT NULL DEFAULT 0,
  rating          NUMERIC(4,2) NOT NULL DEFAULT 0,
  rating_count    INTEGER NOT NULL DEFAULT 0,
  license         TEXT NOT NULL DEFAULT 'MIT',
  data            JSONB NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_hs_skills_category ON hs_skills(category);
CREATE INDEX IF NOT EXISTS idx_hs_skills_platform ON hs_skills(target_platform);
CREATE INDEX IF NOT EXISTS idx_hs_skills_downloads ON hs_skills(downloads DESC);
CREATE INDEX IF NOT EXISTS idx_hs_skills_created ON hs_skills(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hs_skills_published ON hs_skills(published);
CREATE INDEX IF NOT EXISTS idx_hs_skills_name_search ON hs_skills USING GIN(to_tsvector('english', name || ' ' || (data->>'description')));
`;

// =============================================================================
// ROW → DOMAIN MAPPING
// =============================================================================

function rowToSkill(row: Record<string, unknown>): SkillPackage {
  const data = row.data as Record<string, unknown>;
  return {
    ...data,
    id: row.id as string,
    name: row.name as string,
    version: row.version as string,
    category: row.category as SkillCategory,
    targetPlatform: row.target_platform as SkillTargetPlatform,
    verified: row.verified as boolean,
    published: row.published as boolean,
    deprecated: row.deprecated as boolean,
    downloads: row.downloads as number,
    installs: row.installs as number,
    rating: parseFloat(row.rating as string),
    ratingCount: row.rating_count as number,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
    publishedAt: row.published_at ? new Date(row.published_at as string) : undefined,
  } as SkillPackage;
}

// =============================================================================
// POSTGRES IMPLEMENTATION
// =============================================================================

export class PostgresSkillDatabase implements ISkillDatabase {
  private pool: Pool;
  private initialized = false;

  constructor(connectionString: string) {
    // Railway private domain (.railway.internal) uses plain TCP — no SSL.
    // External/public connections use SSL with self-signed cert tolerance.
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

  async getSkill(skillId: string, version?: string): Promise<SkillPackage | null> {
    const client = await this.getClient();
    try {
      const res = await client.query('SELECT * FROM hs_skills WHERE id = $1', [skillId]);
      if (res.rows.length === 0) return null;
      const skill = rowToSkill(res.rows[0]);
      if (version && skill.version !== version) return null;
      return skill;
    } finally {
      client.release();
    }
  }

  /**
   * Upsert: publishSkill, rating/download/install mutations all flow through
   * saveSkill, so this must INSERT new rows and UPDATE existing ones.
   */
  async saveSkill(skill: SkillPackage): Promise<void> {
    const client = await this.getClient();
    try {
      await client.query(
        `INSERT INTO hs_skills
           (id, name, version, category, target_platform, keywords, author_name,
            author_verified, verified, published, deprecated, pricing_model, price,
            downloads, installs, rating, rating_count, license, data,
            created_at, updated_at, published_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
         ON CONFLICT (id) DO UPDATE SET
           name            = EXCLUDED.name,
           version         = EXCLUDED.version,
           category        = EXCLUDED.category,
           target_platform = EXCLUDED.target_platform,
           keywords        = EXCLUDED.keywords,
           author_name     = EXCLUDED.author_name,
           author_verified = EXCLUDED.author_verified,
           verified        = EXCLUDED.verified,
           published       = EXCLUDED.published,
           deprecated      = EXCLUDED.deprecated,
           pricing_model   = EXCLUDED.pricing_model,
           price           = EXCLUDED.price,
           downloads       = EXCLUDED.downloads,
           installs        = EXCLUDED.installs,
           rating          = EXCLUDED.rating,
           rating_count    = EXCLUDED.rating_count,
           license         = EXCLUDED.license,
           data            = EXCLUDED.data,
           updated_at      = EXCLUDED.updated_at,
           published_at    = EXCLUDED.published_at`,
        [
          skill.id,
          skill.name,
          skill.version,
          skill.category,
          skill.targetPlatform,
          skill.keywords,
          skill.author.name,
          skill.author.verified,
          skill.verified,
          skill.published,
          skill.deprecated,
          skill.pricingModel,
          skill.price,
          skill.downloads,
          skill.installs,
          skill.rating,
          skill.ratingCount,
          skill.license,
          JSON.stringify(skill),
          skill.createdAt,
          skill.updatedAt,
          skill.publishedAt ?? null,
        ]
      );
    } finally {
      client.release();
    }
  }

  async deleteSkill(skillId: string): Promise<void> {
    const client = await this.getClient();
    try {
      await client.query('DELETE FROM hs_skills WHERE id = $1', [skillId]);
    } finally {
      client.release();
    }
  }

  // ---------------------------------------------------------------------------
  // SEARCH
  // ---------------------------------------------------------------------------

  async searchSkills(
    query: SkillSearchQuery
  ): Promise<{ skills: SkillPackage[]; total: number }> {
    const client = await this.getClient();
    try {
      // Only published skills are discoverable (mirrors InMemorySkillDatabase).
      const conditions: string[] = ['published = TRUE'];
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
      if (query.targetPlatform) {
        conditions.push(`target_platform = $${p++}`);
        params.push(query.targetPlatform);
      }
      if (query.author) {
        conditions.push(`author_name = $${p++}`);
        params.push(query.author);
      }
      if (query.pricingModel) {
        conditions.push(`pricing_model = $${p++}`);
        params.push(query.pricingModel);
      }
      if (query.maxPrice !== undefined) {
        conditions.push(`price <= $${p++}`);
        params.push(query.maxPrice);
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
      const countRes = await client.query(
        `SELECT COUNT(*) FROM hs_skills WHERE ${where}`,
        params
      );
      const total = parseInt(countRes.rows[0].count, 10);

      const sortMap: Record<string, string> = {
        downloads: 'downloads',
        rating: 'rating',
        price: 'price',
        updated: 'updated_at',
        created: 'created_at',
        relevance: 'downloads',
      };
      const orderCol = sortMap[query.sortBy ?? 'relevance'] ?? 'downloads';
      const orderDir = query.sortOrder === 'asc' ? 'ASC' : 'DESC';
      const limit = Math.min(query.limit ?? 20, 100);
      const offset = ((query.page ?? 1) - 1) * limit;

      const res = await client.query(
        `SELECT * FROM hs_skills WHERE ${where}
         ORDER BY ${orderCol} ${orderDir}
         LIMIT $${p} OFFSET $${p + 1}`,
        [...params, limit, offset]
      );

      return { skills: res.rows.map(rowToSkill), total };
    } finally {
      client.release();
    }
  }

  async getSkillsByAuthor(authorName: string): Promise<SkillPackage[]> {
    const client = await this.getClient();
    try {
      const res = await client.query(
        'SELECT * FROM hs_skills WHERE author_name = $1 ORDER BY created_at DESC',
        [authorName]
      );
      return res.rows.map(rowToSkill);
    } finally {
      client.release();
    }
  }
}
