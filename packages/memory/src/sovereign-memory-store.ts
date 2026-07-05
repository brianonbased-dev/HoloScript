/**
 * SovereignMemoryStore — direct-to-SoT client for the shared sovereign memory
 * substrate (see ai-ecosystem research/2026-07-04_shared-sovereign-memory-substrate.md, P0).
 *
 * Any family (Claude / Cursor / Gemini / Copilot / edge agents) installs
 * `@holoscript/memory` and reads/writes the SAME identity-keyed `memory_entries`
 * table on the sovereign Jetson SoT — the de-silo as a consumable package, with no
 * bespoke endpoint service to run.
 *
 * Connects directly via node-postgres with a scoped, vault-managed credential
 * (LAN-direct, $0). Cloud / non-LAN seats use the orchestrator fallback (separate).
 * All queries are parameterized (injection-safe).
 */
import { Pool, type PoolConfig } from 'pg';

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
  /** Default workspace scope for entries (default 'ai-ecosystem'). */
  workspaceId?: string;
}

/** Shared sovereign agent-memory client backed directly by the SoT `memory_entries`. */
export class SovereignMemoryStore {
  private readonly pool: Pool;
  private readonly workspaceId: string;

  constructor(config: SovereignMemoryConfig) {
    const { workspaceId, ...poolConfig } = config;
    this.pool = new Pool(poolConfig);
    this.workspaceId = workspaceId ?? 'ai-ecosystem';
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
      `INSERT INTO memory_entries
         (id, workspace_id, author_agent, section, type, content, tags, domain, confidence, provenance_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (id) DO UPDATE
         SET content = EXCLUDED.content, tags = EXCLUDED.tags, section = EXCLUDED.section,
             confidence = EXCLUDED.confidence, updated_at = now()
       RETURNING id`,
      [id, this.workspaceId, input.authorAgent, section, type, input.content, tags, domain, confidence, input.provenanceHash ?? null],
    );
    return res.rows[0].id as string;
  }

  /** Recall memory across ALL families (identity-keyed); optional section/author filters. */
  async recall(query: string, options: RecallOptions = {}): Promise<MemoryEntry[]> {
    const limit = Math.min(Math.max(options.limit ?? 10, 1), 200);
    const params: unknown[] = [`%${query}%`];
    let where = 'content ILIKE $1';
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
         FROM memory_entries WHERE ${where}
         ORDER BY created_at DESC LIMIT $${params.length}`,
      params,
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
    await this.pool.query('DELETE FROM memory_entries WHERE id = $1', [id]);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  private generateId(section: string | null, domain: string): string {
    const d = domain.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'GENERAL';
    const rand = Math.floor(Math.random() * 1e12).toString(36);
    return `${section ?? 'W'}.${d}.${rand}`;
  }
}
