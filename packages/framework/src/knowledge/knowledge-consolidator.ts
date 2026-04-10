/**
 * Knowledge Consolidator — FW-0.5
 *
 * Higher-level orchestrator that adds:
 * - Tiered sleep/wake consolidation (hot → warm → cold)
 * - Cross-domain pattern surfacing
 * - Contradiction detection (content-based, not just peer-flagged)
 * - Provenance chain tracking
 *
 * Builds on KnowledgeStore (local persistence) and ConsolidationEngine (pure state machine).
 */

import type { StoredEntry } from './knowledge-store';
import { KnowledgeStore } from './knowledge-store';
import type { KnowledgeDomain, ExcitabilityMetadata } from './brain';
import { DOMAIN_HALF_LIVES, computeExcitability, applyHalfLifeDecay } from './brain';

// ── Tier Definitions ──

export type KnowledgeTier = 'hot' | 'warm' | 'cold';

export interface TieredEntry extends StoredEntry {
  tier: KnowledgeTier;
  /** Last tier transition timestamp */
  tierChangedAt: number;
  /** Full provenance chain (newest first) */
  provenanceChain: ProvenanceNode[];
}

// ── Provenance ──

export interface ProvenanceNode {
  /** Entry ID at this point */
  entryId: string;
  /** Agent that created or modified */
  agentId: string;
  /** Timestamp of action */
  timestamp: number;
  /** What happened */
  action: 'created' | 'promoted' | 'demoted' | 'merged' | 'corrected' | 'cited';
  /** Optional parent entry (what was this derived from) */
  parentEntryId?: string;
  /** Optional hash for integrity verification */
  hash?: string;
}

// ── Cross-Domain Patterns ──

export interface CrossDomainPattern {
  /** Shared keywords or concepts across domains */
  pattern: string;
  /** Domains where the pattern appears */
  domains: string[];
  /** Entries contributing to this pattern */
  entries: Array<{ id: string; domain: string; snippet: string }>;
  /** Strength: how many entries corroborate */
  strength: number;
}

// ── Contradiction Detection ──

export interface Contradiction {
  /** First entry */
  entryA: { id: string; content: string; domain: string };
  /** Conflicting entry */
  entryB: { id: string; content: string; domain: string };
  /** Why they conflict */
  reason: string;
  /** Confidence that this is a real contradiction (0-1) */
  confidence: number;
}

// ── Consolidation Stats ──

export interface ConsolidationStats {
  demoted: number;
  promoted: number;
  evicted: number;
  timestamp: number;
}

// ── Consolidator ──

/** Thresholds for tier transitions */
export interface ConsolidatorConfig {
  /** Entries with no queries in this many ms get demoted hot→warm (default: 6h) */
  warmDemoteAfterMs: number;
  /** Entries with no queries in this many ms get demoted warm→cold (default: 48h) */
  coldDemoteAfterMs: number;
  /** Max entries in hot tier before forced demotion (default: 100) */
  hotCapacity: number;
  /** Max entries in warm tier before forced demotion (default: 500) */
  warmCapacity: number;
}

const DEFAULT_CONFIG: ConsolidatorConfig = {
  warmDemoteAfterMs: 6 * 60 * 60 * 1000, // 6 hours
  coldDemoteAfterMs: 48 * 60 * 60 * 1000, // 48 hours
  hotCapacity: 100,
  warmCapacity: 500,
};

/**
 * Orchestrates tiered consolidation, cross-domain surfacing,
 * contradiction detection, and provenance chain tracking.
 */
export class KnowledgeConsolidator {
  private tiers: Map<string, TieredEntry> = new Map();
  private config: ConsolidatorConfig;

  constructor(config: Partial<ConsolidatorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ── Import from KnowledgeStore ──

  /**
   * Import entries from a KnowledgeStore into the tiered system.
   * All imported entries start in the hot tier.
   */
  importFromStore(store: KnowledgeStore): number {
    const entries = store.all();
    let imported = 0;
    for (const entry of entries) {
      if (this.tiers.has(entry.id)) continue;
      const tiered: TieredEntry = {
        ...entry,
        tier: 'hot',
        tierChangedAt: Date.now(),
        provenanceChain: [
          {
            entryId: entry.id,
            agentId: entry.authorAgent,
            timestamp: new Date(entry.createdAt).getTime(),
            action: 'created',
            parentEntryId: undefined,
            hash: entry.provenanceHash,
          },
        ],
      };
      this.tiers.set(entry.id, tiered);
      imported++;
    }
    return imported;
  }

  /**
   * Add a single entry directly.
   */
  addEntry(entry: StoredEntry, parentEntryId?: string): TieredEntry {
    const existing = this.tiers.get(entry.id);
    if (existing) return existing;

    const tiered: TieredEntry = {
      ...entry,
      tier: 'hot',
      tierChangedAt: Date.now(),
      provenanceChain: [
        {
          entryId: entry.id,
          agentId: entry.authorAgent,
          timestamp: new Date(entry.createdAt).getTime(),
          action: 'created',
          parentEntryId,
          hash: entry.provenanceHash,
        },
      ],
    };
    this.tiers.set(entry.id, tiered);
    return tiered;
  }

  // ── Sleep/Wake Consolidation ──

  /**
   * Sleep cycle: demote stale entries down tiers.
   * hot → warm if no access within warmDemoteAfterMs
   * warm → cold if no access within coldDemoteAfterMs
   */
  sleepCycle(): ConsolidationStats {
    const now = Date.now();
    let demoted = 0;
    const evicted = 0;

    for (const entry of this.tiers.values()) {
      const lastActivity = Math.max(
        entry.queryCount > 0 ? new Date(entry.createdAt).getTime() : 0,
        entry.excitability?.lastRetrievedAt ?? 0,
        entry.tierChangedAt
      );
      const idle = now - lastActivity;

      if (entry.tier === 'hot' && idle > this.config.warmDemoteAfterMs) {
        entry.tier = 'warm';
        entry.tierChangedAt = now;
        this.appendProvenance(entry.id, entry.authorAgent, 'demoted');
        demoted++;
      } else if (entry.tier === 'warm' && idle > this.config.coldDemoteAfterMs) {
        entry.tier = 'cold';
        entry.tierChangedAt = now;
        this.appendProvenance(entry.id, entry.authorAgent, 'demoted');
        demoted++;
      }
    }

    // Capacity enforcement: force-demote oldest hot entries if over capacity
    const hotEntries = this.getByTier('hot');
    if (hotEntries.length > this.config.hotCapacity) {
      const sorted = hotEntries.sort((a, b) => a.tierChangedAt - b.tierChangedAt);
      const excess = sorted.slice(0, hotEntries.length - this.config.hotCapacity);
      for (const entry of excess) {
        entry.tier = 'warm';
        entry.tierChangedAt = now;
        this.appendProvenance(entry.id, entry.authorAgent, 'demoted');
        demoted++;
      }
    }

    const warmEntries = this.getByTier('warm');
    if (warmEntries.length > this.config.warmCapacity) {
      const sorted = warmEntries.sort((a, b) => a.tierChangedAt - b.tierChangedAt);
      const excess = sorted.slice(0, warmEntries.length - this.config.warmCapacity);
      for (const entry of excess) {
        entry.tier = 'cold';
        entry.tierChangedAt = now;
        this.appendProvenance(entry.id, entry.authorAgent, 'demoted');
        demoted++;
      }
    }

    return { demoted, promoted: 0, evicted, timestamp: now };
  }

  /**
   * Wake cycle: promote entries that were recently accessed back up tiers.
   * cold → warm if accessed since last sleep
   * warm → hot if access count > 3 since demotion
   */
  wakeCycle(): ConsolidationStats {
    const now = Date.now();
    let promoted = 0;

    for (const entry of this.tiers.values()) {
      const lastAccess = entry.excitability?.lastRetrievedAt ?? 0;
      if (lastAccess <= entry.tierChangedAt) continue; // No access since tier change

      if (entry.tier === 'cold') {
        entry.tier = 'warm';
        entry.tierChangedAt = now;
        this.appendProvenance(entry.id, entry.authorAgent, 'promoted');
        promoted++;
      } else if (entry.tier === 'warm') {
        // Promote to hot only if enough recent activity
        const recentQueries = entry.excitability?.queryCount ?? 0;
        if (recentQueries >= 3) {
          entry.tier = 'hot';
          entry.tierChangedAt = now;
          this.appendProvenance(entry.id, entry.authorAgent, 'promoted');
          promoted++;
        }
      }
    }

    return { demoted: 0, promoted, evicted: 0, timestamp: now };
  }

  /**
   * Promote a specific entry to a higher tier.
   */
  promote(entryId: string): boolean {
    const entry = this.tiers.get(entryId);
    if (!entry) return false;

    if (entry.tier === 'cold') {
      entry.tier = 'warm';
    } else if (entry.tier === 'warm') {
      entry.tier = 'hot';
    } else {
      return false; // Already hot
    }
    entry.tierChangedAt = Date.now();
    this.appendProvenance(entryId, entry.authorAgent, 'promoted');
    return true;
  }

  /**
   * Evict an entry from all tiers.
   */
  evict(entryId: string): boolean {
    return this.tiers.delete(entryId);
  }

  // ── Cross-Domain Pattern Surfacing ──

  /**
   * Find entries that share concepts across multiple domains.
   * Extracts significant keywords from each entry and groups
   * entries that share keywords across different domains.
   */
  surfaceCrossDomainPatterns(domains?: string[]): CrossDomainPattern[] {
    const entries = domains
      ? Array.from(this.tiers.values()).filter((e) => domains.includes(e.domain))
      : Array.from(this.tiers.values());

    // Extract keyword → domain+entry mapping
    const keywordMap = new Map<string, Array<{ id: string; domain: string; snippet: string }>>();
    const STOP_WORDS = new Set([
      'the',
      'and',
      'for',
      'that',
      'this',
      'with',
      'from',
      'are',
      'was',
      'were',
      'not',
      'but',
      'have',
      'has',
      'had',
      'will',
      'would',
      'could',
      'should',
      'can',
      'may',
      'its',
      'all',
      'each',
      'any',
      'use',
      'used',
      'using',
    ]);

    for (const entry of entries) {
      const words = entry.content
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .split(/\s+/)
        .filter((w) => w.length > 3 && !STOP_WORDS.has(w));

      // Use unique words per entry
      const unique = [...new Set(words)];
      for (const word of unique) {
        if (!keywordMap.has(word)) keywordMap.set(word, []);
        keywordMap.get(word)!.push({
          id: entry.id,
          domain: entry.domain,
          snippet: entry.content.slice(0, 80),
        });
      }
    }

    // Find keywords that span multiple domains
    const patterns: CrossDomainPattern[] = [];
    for (const [keyword, refs] of keywordMap) {
      const uniqueDomains = [...new Set(refs.map((r) => r.domain))];
      if (uniqueDomains.length >= 2) {
        patterns.push({
          pattern: keyword,
          domains: uniqueDomains,
          entries: refs,
          strength: refs.length,
        });
      }
    }

    // Sort by strength (most entries), then by domain count
    return patterns.sort((a, b) => b.domains.length - a.domains.length || b.strength - a.strength);
  }

  // ── Contradiction Detection ──

  /**
   * Detect contradictions between entries.
   *
   * Strategy: find entry pairs in the same or related domains where:
   * 1. They share significant keywords (about the same topic)
   * 2. One contains negation patterns relative to the other
   *
   * This is a heuristic — not an LLM call. False positives are expected
   * and should be reviewed by agents.
   */
  detectContradictions(entries?: StoredEntry[]): Contradiction[] {
    const pool = entries ?? Array.from(this.tiers.values());
    if (pool.length < 2) return [];

    const contradictions: Contradiction[] = [];
    const NEGATION_PAIRS = [
      ['never', 'always'],
      ['should not', 'should'],
      ['must not', 'must'],
      ['do not', 'do'],
      ['avoid', 'prefer'],
      ['disable', 'enable'],
      ['deprecated', 'recommended'],
      ['broken', 'working'],
      ['false', 'true'],
      ['removed', 'added'],
    ];

    // Index entries by significant keywords for O(n*k) instead of O(n^2)
    const keywordIndex = new Map<string, StoredEntry[]>();
    for (const entry of pool) {
      const words = entry.content
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .split(/\s+/)
        .filter((w) => w.length > 4);
      const unique = [...new Set(words)];
      for (const w of unique) {
        if (!keywordIndex.has(w)) keywordIndex.set(w, []);
        keywordIndex.get(w)!.push(entry);
      }
    }

    // Check pairs that share keywords
    const checked = new Set<string>();
    for (const [, group] of keywordIndex) {
      if (group.length < 2 || group.length > 20) continue; // Skip too-common keywords
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          const a = group[i];
          const b = group[j];
          const pairKey = [a.id, b.id].sort().join('|');
          if (checked.has(pairKey)) continue;
          checked.add(pairKey);

          const contentA = a.content.toLowerCase();
          const contentB = b.content.toLowerCase();

          for (const [neg, pos] of NEGATION_PAIRS) {
            const aHasNeg = contentA.includes(neg);
            const bHasPos = contentB.includes(pos) && !contentB.includes(neg);
            const aHasPos = contentA.includes(pos) && !contentA.includes(neg);
            const bHasNeg = contentB.includes(neg);

            if ((aHasNeg && bHasPos) || (aHasPos && bHasNeg)) {
              // Calculate confidence based on domain similarity and keyword overlap
              const sameDomain = a.domain === b.domain;
              const confidence = sameDomain ? 0.7 : 0.4;

              contradictions.push({
                entryA: { id: a.id, content: a.content, domain: a.domain },
                entryB: { id: b.id, content: b.content, domain: b.domain },
                reason: `Opposing claims: "${neg}" vs "${pos}"`,
                confidence,
              });
              break; // One contradiction per pair is enough
            }
          }
        }
      }
    }

    return contradictions.sort((a, b) => b.confidence - a.confidence);
  }

  // ── Provenance Chain ──

  /**
   * Get the full provenance chain for an entry.
   * Returns nodes from most recent to oldest.
   */
  getProvenanceChain(entryId: string): ProvenanceNode[] {
    const entry = this.tiers.get(entryId);
    if (!entry) return [];
    return [...entry.provenanceChain];
  }

  /**
   * Record a citation: entry B cites entry A.
   */
  recordCitation(citedEntryId: string, citingAgentId: string): boolean {
    const entry = this.tiers.get(citedEntryId);
    if (!entry) return false;

    this.appendProvenance(citedEntryId, citingAgentId, 'cited');

    // Boost excitability on citation
    if (entry.excitability) {
      entry.excitability.citationCount++;
      entry.excitability.excitability = computeExcitability(entry.excitability);
    }
    entry.reuseCount++;
    return true;
  }

  // ── Inspection ──

  getByTier(tier: KnowledgeTier): TieredEntry[] {
    return Array.from(this.tiers.values()).filter((e) => e.tier === tier);
  }

  getEntry(id: string): TieredEntry | undefined {
    return this.tiers.get(id);
  }

  get size(): number {
    return this.tiers.size;
  }

  stats(): { hot: number; warm: number; cold: number; total: number } {
    let hot = 0,
      warm = 0,
      cold = 0;
    for (const entry of this.tiers.values()) {
      if (entry.tier === 'hot') hot++;
      else if (entry.tier === 'warm') warm++;
      else cold++;
    }
    return { hot, warm, cold, total: this.tiers.size };
  }

  all(): TieredEntry[] {
    return Array.from(this.tiers.values());
  }

  // ── Internal ──

  private appendProvenance(
    entryId: string,
    agentId: string,
    action: ProvenanceNode['action'],
    parentEntryId?: string
  ): void {
    const entry = this.tiers.get(entryId);
    if (!entry) return;
    entry.provenanceChain.unshift({
      entryId,
      agentId,
      timestamp: Date.now(),
      action,
      parentEntryId,
    });
  }
}
