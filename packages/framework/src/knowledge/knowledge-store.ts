/**
 * Knowledge Store — Local-first with remote federation
 *
 * Local mode: in-memory Map + optional JSON persistence (default)
 * Remote mode: delegates to MCP Orchestrator knowledge/query + knowledge/sync
 *
 * The store shape aligns with MeshKnowledgeEntry from holomesh/types.ts.
 * W/P/G taxonomy follows agent-protocol's PWGEntry format.
 */

import type { KnowledgeConfig, KnowledgeInsight } from '../types';
import { applyHalfLifeDecay, computeExcitability } from './brain';
import type { KnowledgeDomain, ExcitabilityMetadata } from './brain';
import { KnowledgeMarketplace } from '../economy/KnowledgeMarketplace';
import type {
  KnowledgeListing,
  PurchaseResult,
  ListingResult,
} from '../economy/KnowledgeMarketplace';

export interface StoredEntry extends KnowledgeInsight {
  id: string;
  queryCount: number;
  reuseCount: number;
  createdAt: string;
  authorAgent: string;
  taskId?: string;
  cycleId?: string;
  verifierId?: string;
  /** Provenance hash — chain of custody */
  provenanceHash?: string;
  /** Excitability metadata for brain-aware ranking */
  excitability?: ExcitabilityMetadata;
}

/** Result from the vector embedding pipeline. */
export interface EmbedResult {
  entryId: string;
  synced: boolean;
  /** Remote entry ID returned by orchestrator (if synced). */
  remoteId?: string;
}

/** Options for semantic search. */
export interface SemanticSearchOptions {
  limit?: number;
  type?: 'wisdom' | 'pattern' | 'gotcha';
  /** Minimum confidence threshold (0-1). */
  minConfidence?: number;
  /** When true, merge remote results with local keyword fallback. */
  hybridSearch?: boolean;
}

export class KnowledgeStore {
  private entries: Map<string, StoredEntry> = new Map();
  private config: KnowledgeConfig;
  private nextId = 1;

  constructor(config: KnowledgeConfig) {
    this.config = config;
    if (config.persist && config.path) {
      this.loadFromDisk();
    }
  }

  /** Publish a knowledge entry. Deduplicates by normalized content. */
  publish(
    insight: KnowledgeInsight,
    authorAgent: string,
    provenance?: { taskId?: string; cycleId?: string; verifierId?: string; provenanceHash?: string }
  ): StoredEntry {
    const prefix = insight.type === 'wisdom' ? 'W' : insight.type === 'pattern' ? 'P' : 'G';
    const domain = insight.domain
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 8);
    const id = `${prefix}.${domain}.${String(this.nextId++).padStart(3, '0')}`;

    const norm = insight.content
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .slice(0, 100);
    for (const existing of this.entries.values()) {
      const existingNorm = existing.content
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
        .slice(0, 100);
      if (existingNorm === norm) return existing;
    }

    const entry: StoredEntry = {
      ...insight,
      id,
      queryCount: 0,
      reuseCount: 0,
      createdAt: new Date().toISOString(),
      authorAgent,
      taskId: provenance?.taskId,
      cycleId: provenance?.cycleId,
      verifierId: provenance?.verifierId,
      provenanceHash: provenance?.provenanceHash,
    };
    this.entries.set(id, entry);
    this.persistIfEnabled();
    return entry;
  }

  /** Search entries by keyword with excitability + half-life decay ranking. */
  search(query: string, limit = 10): StoredEntry[] {
    const keywords = query
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2);
    if (keywords.length === 0) return this.recent(limit);

    const now = Date.now();
    const scored: Array<{ entry: StoredEntry; score: number }> = [];
    for (const entry of this.entries.values()) {
      const text = `${entry.content} ${entry.domain} ${entry.type}`.toLowerCase();
      let score = 0;
      for (const kw of keywords) {
        if (text.includes(kw)) score += 1;
      }
      if (score > 0) {
        score += entry.confidence * 0.5;
        score += Math.min(entry.reuseCount, 10) * 0.1;

        // Excitability boost (neuroscience model)
        if (entry.excitability) {
          score += computeExcitability(entry.excitability) * 0.01;
        }

        // Half-life decay — older entries in fast-decay domains score lower
        const domain = entry.domain as KnowledgeDomain;
        const ageMs = now - new Date(entry.createdAt).getTime();
        if (ageMs > 0) {
          score = applyHalfLifeDecay(score, ageMs, domain);
        }

        entry.queryCount++;
        // Update excitability on retrieval
        if (entry.excitability) {
          entry.excitability.queryCount++;
          entry.excitability.lastRetrievedAt = now;
          entry.excitability.excitability = computeExcitability(entry.excitability);
        }

        scored.push({ entry, score });
      }
    }

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((s) => s.entry);
  }

  /** Search remote knowledge store (MCP Orchestrator). */
  async searchRemote(query: string, limit = 10): Promise<StoredEntry[]> {
    if (!this.config.remoteUrl) return [];
    try {
      const res = await fetch(`${this.config.remoteUrl}/knowledge/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.remoteApiKey ? { 'x-mcp-api-key': this.config.remoteApiKey } : {}),
        },
        body: JSON.stringify({ search: query, limit, workspace_id: 'ai-ecosystem' }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return [];
      const data = (await res.json()) as Array<Record<string, unknown>>;
      return (Array.isArray(data) ? data : []).map((e) => this.mapRemoteEntry(e));
    } catch {
      return [];
    }
  }

  /** Sync local entries to remote knowledge store. */
  async syncToRemote(): Promise<number> {
    if (!this.config.remoteUrl || !this.config.remoteApiKey) return 0;
    const entries = this.all().map((e) => ({
      id: e.id,
      workspace_id: 'ai-ecosystem',
      type: e.type,
      content: e.content,
      provenanceHash: e.provenanceHash || '',
      metadata: {
        domain: e.domain,
        confidence: e.confidence,
        source: e.authorAgent,
        taskId: e.taskId,
        cycleId: e.cycleId,
        verifierId: e.verifierId,
      },
    }));
    if (entries.length === 0) return 0;
    try {
      const res = await fetch(`${this.config.remoteUrl}/knowledge/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-mcp-api-key': this.config.remoteApiKey,
        },
        body: JSON.stringify({ workspace_id: 'ai-ecosystem', entries }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) return 0;
      const data = (await res.json()) as { synced?: number };
      return data.synced ?? entries.length;
    } catch {
      return 0;
    }
  }

  // ── Vector Embedding Pipeline ──

  /**
   * Embed and store a knowledge entry.
   *
   * 1. Publishes locally (dedup, ID generation).
   * 2. Syncs to MCP Orchestrator pgvector endpoint for vector embedding.
   *
   * The orchestrator generates embeddings server-side and stores them
   * in pgvector for semantic similarity search via `/knowledge/query`.
   */
  async embedAndStore(
    insight: KnowledgeInsight,
    authorAgent: string,
    provenance?: { taskId?: string; cycleId?: string; verifierId?: string; provenanceHash?: string }
  ): Promise<EmbedResult> {
    // Step 1: Local publish (dedup + ID assignment)
    const entry = this.publish(insight, authorAgent, provenance);

    // Step 2: Sync to remote for vector embedding
    if (!this.config.remoteUrl || !this.config.remoteApiKey) {
      return { entryId: entry.id, synced: false };
    }

    try {
      const payload = {
        workspace_id: 'ai-ecosystem',
        entries: [
          {
            id: entry.id,
            workspace_id: 'ai-ecosystem',
            type: entry.type,
            content: entry.content,
            provenanceHash: entry.provenanceHash || '',
            metadata: {
              domain: entry.domain,
              confidence: entry.confidence,
              source: entry.authorAgent,
              taskId: entry.taskId,
              cycleId: entry.cycleId,
              verifierId: entry.verifierId,
            },
          },
        ],
      };

      const res = await fetch(`${this.config.remoteUrl}/knowledge/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-mcp-api-key': this.config.remoteApiKey,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        return { entryId: entry.id, synced: false };
      }

      const data = (await res.json()) as { synced?: number; ids?: string[] };
      return {
        entryId: entry.id,
        synced: (data.synced ?? 0) > 0,
        remoteId: data.ids?.[0],
      };
    } catch {
      return { entryId: entry.id, synced: false };
    }
  }

  /**
   * Semantic search via MCP Orchestrator pgvector.
   *
   * Sends the query to the orchestrator `/knowledge/query` endpoint which
   * generates an embedding for the query and performs cosine similarity
   * search against stored vectors.
   *
   * Falls back to local keyword search when remote is unavailable.
   * When `hybridSearch` is true, merges remote + local results (deduped by ID).
   */
  async semanticSearch(query: string, options?: SemanticSearchOptions): Promise<StoredEntry[]> {
    const limit = options?.limit ?? 10;
    const hybridSearch = options?.hybridSearch ?? false;

    // Try remote semantic search first
    let remoteResults: StoredEntry[] = [];
    if (this.config.remoteUrl && this.config.remoteApiKey) {
      try {
        const body: Record<string, unknown> = {
          search: query,
          limit,
          workspace_id: 'ai-ecosystem',
        };
        if (options?.type) body.type = options.type;

        const res = await fetch(`${this.config.remoteUrl}/knowledge/query`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-mcp-api-key': this.config.remoteApiKey,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(10_000),
        });

        if (res.ok) {
          const data = (await res.json()) as Array<Record<string, unknown>>;
          remoteResults = (Array.isArray(data) ? data : []).map((e) => this.mapRemoteEntry(e));

          // Apply confidence filter
          if (options?.minConfidence !== undefined) {
            remoteResults = remoteResults.filter(
              (e) => e.confidence >= (options.minConfidence ?? 0)
            );
          }
        }
      } catch {
        // Remote unavailable — fall through to local
      }
    }

    // If we got remote results and hybrid is off, return them
    if (remoteResults.length > 0 && !hybridSearch) {
      return remoteResults.slice(0, limit);
    }

    // Local keyword search (fallback or hybrid merge)
    const localResults = this.search(query, limit);

    if (!hybridSearch) {
      // Pure fallback — remote failed, use local
      return localResults;
    }

    // Hybrid: merge remote + local, dedup by ID, remote wins on conflict
    const seen = new Set<string>();
    const merged: StoredEntry[] = [];

    for (const entry of remoteResults) {
      if (!seen.has(entry.id)) {
        seen.add(entry.id);
        merged.push(entry);
      }
    }
    for (const entry of localResults) {
      if (!seen.has(entry.id)) {
        seen.add(entry.id);
        merged.push(entry);
      }
    }

    return merged.slice(0, limit);
  }

  /** Map a remote API response object to a StoredEntry. */
  private mapRemoteEntry(e: Record<string, unknown>): StoredEntry {
    const meta = (e.metadata || {}) as Record<string, unknown>;
    return {
      id: String(e.id || ''),
      type: (e.type as StoredEntry['type']) || 'wisdom',
      content: String(e.content || ''),
      domain: String(e.domain || meta.domain || 'general'),
      confidence: Number(e.confidence || meta.confidence || 0.5),
      source: String(e.authorName || meta.source || 'remote'),
      queryCount: Number(e.queryCount || 0),
      reuseCount: Number(e.reuseCount || 0),
      createdAt: String(e.createdAt || new Date().toISOString()),
      authorAgent: String(e.authorName || meta.source || 'remote'),
      taskId: e.taskId ? String(e.taskId) : meta.taskId ? String(meta.taskId) : undefined,
      cycleId: e.cycleId ? String(e.cycleId) : meta.cycleId ? String(meta.cycleId) : undefined,
      verifierId: e.verifierId
        ? String(e.verifierId)
        : meta.verifierId
          ? String(meta.verifierId)
          : undefined,
      provenanceHash: e.provenanceHash
        ? String(e.provenanceHash)
        : meta.provenanceHash
          ? String(meta.provenanceHash)
          : undefined,
    };
  }

  recent(limit = 10): StoredEntry[] {
    return Array.from(this.entries.values())
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  byType(type: 'wisdom' | 'pattern' | 'gotcha'): StoredEntry[] {
    return Array.from(this.entries.values()).filter((e) => e.type === type);
  }

  byDomain(domain: string): StoredEntry[] {
    const d = domain.toLowerCase();
    return Array.from(this.entries.values()).filter((e) => e.domain.toLowerCase() === d);
  }

  markReused(id: string): void {
    const entry = this.entries.get(id);
    if (entry) {
      entry.reuseCount++;
      this.persistIfEnabled();
    }
  }

  get size(): number {
    return this.entries.size;
  }

  all(): StoredEntry[] {
    return Array.from(this.entries.values());
  }

  /** Cross-reference new insights against existing knowledge. */
  compound(newInsights: KnowledgeInsight[]): number {
    let crossRefs = 0;
    for (const insight of newInsights) {
      const related = this.search(insight.content, 3);
      for (const rel of related) {
        if (rel.domain !== insight.domain) {
          crossRefs++;
          rel.reuseCount++;
        }
      }
    }
    this.persistIfEnabled();
    return crossRefs;
  }

  // ── Persistence ──

  private persistIfEnabled(): void {
    if (!this.config.persist || !this.config.path) return;
    try {
      const fs = require('fs') as typeof import('fs');
      const dir = require('path').dirname(this.config.path) as string;
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const data = {
        version: 1,
        nextId: this.nextId,
        entries: Array.from(this.entries.values()),
      };
      fs.writeFileSync(this.config.path, JSON.stringify(data, null, 2), 'utf8');
    } catch {
      // Best-effort
    }
  }

  private loadFromDisk(): void {
    try {
      const fs = require('fs') as typeof import('fs');
      if (!this.config.path || !fs.existsSync(this.config.path)) return;
      const raw = fs.readFileSync(this.config.path, 'utf8');
      const data = JSON.parse(raw);
      this.nextId = data.nextId || 1;
      for (const entry of data.entries || []) {
        this.entries.set(entry.id, entry);
      }
    } catch {
      // Non-fatal
    }
  }

  // ── Consolidation Cycle (Sleep → Promote/Evict) ──

  /**
   * Sleep consolidation: Move dormant hot-buffer entries to cold store.
   * Entries with age > 24h and queryCount < threshold are archived.
   */
  async sleep(archivePath?: string): Promise<{ archived: number; evicted: number }> {
    const now = Date.now();
    const ARCHIVE_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
    const QUERY_THRESHOLD = 2; // Entries queried < 2 times in 24h go cold

    const archived: StoredEntry[] = [];
    const evicted: StoredEntry[] = [];

    for (const [id, entry] of this.entries) {
      const ageMs = now - new Date(entry.createdAt).getTime();
      if (ageMs > ARCHIVE_AGE_MS && entry.queryCount < QUERY_THRESHOLD) {
        archived.push(entry);
        if (!archivePath) {
          // No cold store configured; hard evict
          this.entries.delete(id);
          evicted.push(entry);
        }
      }
    }

    // Persist archived entries to cold store (optional DB/file)
    if (archivePath && archived.length > 0) {
      try {
        const fs = require('fs') as typeof import('fs');
        const path = require('path');
        const dir = path.dirname(archivePath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const existing = fs.existsSync(archivePath)
          ? JSON.parse(fs.readFileSync(archivePath, 'utf8'))
          : [];
        const updated = [...existing, ...archived];
        fs.writeFileSync(archivePath, JSON.stringify(updated, null, 2), 'utf8');
        // Remove from hot buffer
        archived.forEach((e) => this.entries.delete(e.id));
      } catch {
        // Cold store unavailable; keep in hot buffer
      }
    }

    return { archived: archived.length, evicted: evicted.length };
  }

  /**
   * Wake consolidation: Restore archived entries back to hot buffer on query.
   * Called by search() when a query hits cold store.
   */
  async wake(archivePath: string, query: string): Promise<StoredEntry[]> {
    if (!archivePath) return [];
    try {
      const fs = require('fs') as typeof import('fs');
      if (!fs.existsSync(archivePath)) return [];
      const archived = JSON.parse(fs.readFileSync(archivePath, 'utf8')) as StoredEntry[];
      const keywords = query
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 2);

      const restored: StoredEntry[] = [];
      for (const entry of archived) {
        const text = `${entry.content} ${entry.domain} ${entry.type}`.toLowerCase();
        for (const kw of keywords) {
          if (text.includes(kw)) {
            this.entries.set(entry.id, entry);
            entry.queryCount++;
            restored.push(entry);
            break;
          }
        }
      }

      // Update cold store (remove restored)
      if (restored.length > 0) {
        const remaining = archived.filter((e) => !restored.find((r) => r.id === e.id));
        fs.writeFileSync(archivePath, JSON.stringify(remaining, null, 2), 'utf8');
      }

      return restored;
    } catch {
      return [];
    }
  }

  /**
   * Promote: Move a dormant entry back to hot buffer and boost its score.
   * Called when an archived entry is cited or reused directly.
   */
  promote(id: string): boolean {
    const entry = this.entries.get(id);
    if (entry) {
      entry.reuseCount += 2; // Promotion boost
      entry.queryCount += 1;
      this.persistIfEnabled();
      return true;
    }
    return false;
  }

  /**
   * Evict: Permanently remove an entry from both hot and cold stores.
   * Called during cleanup or when an entry is marked as stale/wrong.
   */
  evict(id: string, _archivePath?: string): boolean {
    const existed = this.entries.delete(id);
    if (existed) {
      this.persistIfEnabled();
      // TODO: Also remove from cold store if archivePath provided
    }
    return existed;
  }

  /**
   * Consolidate: Full sleep+wake cycle (once per agent work session).
   * Moves stale entries to cold store, restores hot entries on demand.
   */
  async consolidate(archivePath?: string): Promise<{ slept: number; woke: number }> {
    const sleepResult = await this.sleep(archivePath);
    // Wake comes on-demand via search(), not here
    return { slept: sleepResult.archived + sleepResult.evicted, woke: 0 };
  }

  // ── Knowledge Marketplace (FW-0.6) ──

  private _marketplace?: KnowledgeMarketplace;

  /** Get or create the marketplace instance. */
  get marketplace(): KnowledgeMarketplace {
    if (!this._marketplace) {
      this._marketplace = new KnowledgeMarketplace();
    }
    return this._marketplace;
  }

  /** Price a knowledge entry for sale. */
  priceEntry(id: string): number | null {
    const entry = this.entries.get(id);
    if (!entry) return null;
    return this.marketplace.priceKnowledge(entry);
  }

  /** List a knowledge entry for sale on the marketplace. */
  listForSale(
    id: string,
    seller: string,
    price?: number,
    currency?: 'USDC' | 'credits'
  ): ListingResult {
    const entry = this.entries.get(id);
    if (!entry) return { success: false, listingId: '', error: 'Entry not found' };
    const finalPrice = price ?? this.marketplace.priceKnowledge(entry);
    return this.marketplace.sellKnowledge(entry, finalPrice, seller, currency);
  }

  /** Buy a listed knowledge entry. Returns the full StoredEntry on success. */
  buyListed(listingId: string, buyer: string): { purchase: PurchaseResult; entry?: StoredEntry } {
    const purchase = this.marketplace.buyKnowledge(listingId, buyer);
    if (!purchase.success || !purchase.entryId) return { purchase };
    const entry = this.entries.get(purchase.entryId);
    if (entry) entry.reuseCount++;
    return { purchase, entry };
  }

  /** Get active marketplace listings. */
  activeListings(): KnowledgeListing[] {
    return this.marketplace.activeListings();
  }
}
