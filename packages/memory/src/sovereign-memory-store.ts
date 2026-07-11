/**
 * SovereignMemoryStore — direct-to-SoT client for a shared sovereign memory
 * substrate.
 *
 * Any agent family (Claude / Cursor / Gemini / Copilot / edge agents) installs
 * `@holoscript/memory` and reads/writes the SAME identity-keyed `memory_entries`
 * table on YOUR sovereign Postgres source-of-truth — the de-silo as a consumable
 * package, with no bespoke endpoint service to run. You bring the Postgres; point
 * this client at it. See the README for the required `memory_entries` schema.
 *
 * Connects directly via node-postgres with a scoped credential you inject from
 * your own vault/env — this package never embeds a host, port, or secret. All
 * queries are parameterized (injection-safe).
 */
import { Pool, type PoolConfig } from 'pg';

export const SOVEREIGN_MEMORY_SCHEMA = 'holoscript.memory.postgres-schema.v1';
export const SOVEREIGN_MEMORY_SCHEMA_VERSION = 1;
export const SOVEREIGN_MEMORY_TABLE = 'public.memory_entries';
export const SOVEREIGN_MEMORY_REQUIRED_COLUMNS = [
  'id',
  'workspace_id',
  'author_agent',
  'section',
  'type',
  'content',
  'tags',
  'domain',
  'confidence',
  'provenance_hash',
  'created_at',
  'updated_at',
] as const;
export const SOVEREIGN_MEMORY_SCHEMA_SQL = [
  `CREATE TABLE IF NOT EXISTS ${SOVEREIGN_MEMORY_TABLE} (
    id              varchar PRIMARY KEY,
    workspace_id    varchar     NOT NULL DEFAULT 'default',
    author_agent    varchar     NOT NULL,
    section         varchar(2),
    type            varchar     NOT NULL,
    content         text        NOT NULL,
    tags            text[]      NOT NULL DEFAULT '{}',
    domain          varchar,
    confidence      real        NOT NULL DEFAULT 0.8,
    provenance_hash varchar,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS memory_entries_workspace_created_idx
    ON ${SOVEREIGN_MEMORY_TABLE} (workspace_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS memory_entries_workspace_author_idx
    ON ${SOVEREIGN_MEMORY_TABLE} (workspace_id, author_agent)`,
  `CREATE INDEX IF NOT EXISTS memory_entries_workspace_section_idx
    ON ${SOVEREIGN_MEMORY_TABLE} (workspace_id, section)`,
] as const;

const SOVEREIGN_MEMORY_SCHEMA_LOCK = '@holoscript/memory:postgres-schema:v1';

export type MemorySection = 'F' | 'D' | 'W' | 'I' | 'P' | 'S' | 'R' | 'G';
export type MemoryType = 'wisdom' | 'pattern' | 'gotcha';

export interface MemoryEntryInput {
  content: string;
  authorAgent: string;
  type?: MemoryType;
  section?: MemorySection;
  tags?: string[];
  domain?: string;
  confidence?: number;
  id?: string;
  provenanceHash?: string;
}

export interface MemoryEntry {
  id: string;
  authorAgent: string;
  section: string | null;
  type: string;
  content: string;
  tags: string[];
  domain: string | null;
  confidence: number;
  createdAt: string;
}

export interface RecallOptions {
  limit?: number;
  section?: MemorySection;
  authorAgent?: string;
}

export interface SovereignMemoryConfig extends PoolConfig {
  /** Workspace scope tag written to `workspace_id` for entries (default 'default'). */
  workspaceId?: string;
}

export interface SovereignMemoryHealth {
  schema: typeof SOVEREIGN_MEMORY_SCHEMA;
  ok: boolean;
  schemaReady: boolean;
  table: typeof SOVEREIGN_MEMORY_TABLE;
  workspaceId: string;
  requiredColumnCount: number;
  presentColumnCount: number;
  checkedAt: string;
}

export interface SovereignMemorySchemaReceipt extends SovereignMemoryHealth {
  initialized: boolean;
  statementsApplied: number;
  schemaVersion: typeof SOVEREIGN_MEMORY_SCHEMA_VERSION;
}

/** Shared sovereign agent-memory client backed directly by the SoT `memory_entries`. */
export class SovereignMemoryStore {
  private readonly pool: Pool;
  private readonly workspaceId: string;

  constructor(config: SovereignMemoryConfig) {
    const { workspaceId, ...poolConfig } = config;
    this.pool = new Pool(poolConfig);
    this.workspaceId = workspaceId ?? 'default';
  }

  /** Return a redacted readiness receipt without exposing connection details. */
  async health(): Promise<SovereignMemoryHealth> {
    const res = await this.pool.query(
      `SELECT
         to_regclass($1)::text AS table_name,
         (SELECT count(*)::int
            FROM information_schema.columns
           WHERE table_schema = 'public'
             AND table_name = 'memory_entries'
             AND column_name = ANY($2::text[])) AS present_column_count`,
      [SOVEREIGN_MEMORY_TABLE, [...SOVEREIGN_MEMORY_REQUIRED_COLUMNS]]
    );
    const presentColumnCount = Number(res.rows[0]?.present_column_count ?? 0);
    const schemaReady =
      Boolean(res.rows[0]?.table_name) &&
      presentColumnCount === SOVEREIGN_MEMORY_REQUIRED_COLUMNS.length;
    return {
      schema: SOVEREIGN_MEMORY_SCHEMA,
      ok: schemaReady,
      schemaReady,
      table: SOVEREIGN_MEMORY_TABLE,
      workspaceId: this.workspaceId,
      requiredColumnCount: SOVEREIGN_MEMORY_REQUIRED_COLUMNS.length,
      presentColumnCount,
      checkedAt: new Date().toISOString(),
    };
  }

  /** Explicitly create or upgrade the v1 schema under one transaction lock. */
  async ensureSchema(): Promise<SovereignMemorySchemaReceipt> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        SOVEREIGN_MEMORY_SCHEMA_LOCK,
      ]);
      for (const statement of SOVEREIGN_MEMORY_SCHEMA_SQL) {
        await client.query(statement);
      }
      await client.query('COMMIT');
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Preserve the schema failure as the actionable error.
      }
      throw error;
    } finally {
      client.release();
    }

    const health = await this.health();
    if (!health.ok) {
      throw new Error(
        `memory schema bootstrap completed but ${health.presentColumnCount}/${health.requiredColumnCount} required columns are present`
      );
    }
    return {
      ...health,
      initialized: true,
      statementsApplied: SOVEREIGN_MEMORY_SCHEMA_SQL.length,
      schemaVersion: SOVEREIGN_MEMORY_SCHEMA_VERSION,
    };
  }

  /** Write an identity-keyed memory entry to the shared sovereign SoT (upsert by id). */
  async store(input: MemoryEntryInput): Promise<string> {
    const type: MemoryType = input.type ?? 'wisdom';
    const domain = input.domain ?? 'agents';
    const section = input.section ?? null;
    const confidence = input.confidence ?? 0.8;
    const tags = input.tags ?? [];
    const id = input.id ?? this.generateId(section, domain);
    const res = await this.pool.query(
      `INSERT INTO ${SOVEREIGN_MEMORY_TABLE}
         (id, workspace_id, author_agent, section, type, content, tags, domain, confidence, provenance_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (id) DO UPDATE
         SET content = EXCLUDED.content, tags = EXCLUDED.tags, section = EXCLUDED.section,
             confidence = EXCLUDED.confidence, updated_at = now()
         WHERE memory_entries.workspace_id = EXCLUDED.workspace_id
       RETURNING id`,
      [
        id,
        this.workspaceId,
        input.authorAgent,
        section,
        type,
        input.content,
        tags,
        domain,
        confidence,
        input.provenanceHash ?? null,
      ]
    );
    if (!res.rows[0]?.id) {
      throw new Error(`memory entry ${id} belongs to a different workspace`);
    }
    return res.rows[0].id as string;
  }

  /** Recall memory across ALL families (identity-keyed); optional section/author filters. */
  async recall(query: string, options: RecallOptions = {}): Promise<MemoryEntry[]> {
    const limit = Math.min(Math.max(options.limit ?? 10, 1), 200);
    const params: unknown[] = [this.workspaceId, `%${query}%`];
    let where = 'workspace_id = $1 AND content ILIKE $2';
    if (options.section) {
      params.push(options.section);
      where += ` AND section = $${params.length}`;
    }
    if (options.authorAgent) {
      params.push(options.authorAgent);
      where += ` AND author_agent = $${params.length}`;
    }
    params.push(limit);
    const res = await this.pool.query(
      `SELECT id, author_agent, section, type, content, tags, domain, confidence, created_at
         FROM ${SOVEREIGN_MEMORY_TABLE} WHERE ${where}
         ORDER BY created_at DESC LIMIT $${params.length}`,
      params
    );
    return res.rows.map((r) => ({
      id: r.id,
      authorAgent: r.author_agent,
      section: r.section,
      type: r.type,
      content: r.content,
      tags: r.tags ?? [],
      domain: r.domain,
      confidence: Number(r.confidence),
      createdAt: new Date(r.created_at).toISOString(),
    }));
  }

  /** Delete an entry by id (requires the scoped role's DELETE grant). */
  async forget(id: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM ${SOVEREIGN_MEMORY_TABLE} WHERE workspace_id = $1 AND id = $2`,
      [this.workspaceId, id]
    );
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  private generateId(section: string | null, domain: string): string {
    const d =
      domain
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 8) || 'GENERAL';
    const rand = Math.floor(Math.random() * 1e12).toString(36);
    return `${section ?? 'W'}.${d}.${rand}`;
  }
}
