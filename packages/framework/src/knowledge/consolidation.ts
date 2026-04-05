/**
 * Consolidation Engine — Pure state machine for neuroscience-inspired memory consolidation.
 *
 * Absorbed from mcp-server/src/holomesh/crdt-sync.ts (V9 consolidation cycle).
 * Extracts the hot buffer → cold store promotion pipeline as a standalone engine
 * with no CRDT, HTTP, or persistence dependencies.
 *
 * Algorithm (6-phase biological consolidation cycle):
 *   1. REPLAY     — Filter hot buffer by TTL + corroboration threshold
 *   1.5 SANITIZE  — Reject entries with injection patterns (defense-in-depth)
 *   2. CLUSTER    — Find duplicate/overlapping entries by content+type
 *   3. MERGE      — Combine corroborations from duplicates
 *   4. DOWNSCALE  — Reduce all cold store excitability (synaptic homeostasis)
 *   5. PROMOTE    — Move surviving hot entries to cold store with metadata
 *   6. PRUNE      — Evict lowest-excitability entries when over capacity
 */

import {
  KNOWLEDGE_DOMAINS,
  DOMAIN_CONSOLIDATION,
  type KnowledgeDomain,
  type HotBufferEntry,
  type ExcitabilityMetadata,
  type ConsolidationResult,
  type DomainConsolidationConfig,
  type ReconsolidationEvent,
  computeExcitability,
  RECONSOLIDATION_WINDOW_MS,
} from './brain';

// ── Cold Store Entry ──

export interface ColdStoreEntry {
  id: string;
  content: string;
  type: string;
  authorDid: string;
  tags: string[];
  timestamp: number;
  accessCount: number;
  lastAccessed: number;
  _excitability: ExcitabilityMetadata;
  _contradictions?: string[];
  _deprecated?: boolean;
  _deprecatedAt?: number;
  _deprecationReason?: string;
}

// ── Helpers ──

function defaultExcitability(): ExcitabilityMetadata {
  return {
    queryCount: 0,
    citationCount: 0,
    corroborationCount: 0,
    excitability: 0,
    lastRetrievedAt: 0,
    lastReconsolidatedAt: 0,
    consolidationSurvivals: 0,
  };
}

/**
 * Detect injection patterns in knowledge entry content.
 * Defense-in-depth: catches code-like payloads that could exploit
 * downstream compilers (CWE-94) if they reach cold store.
 */
function containsInjectionPattern(content: string): boolean {
  if (!content || typeof content !== 'string') return false;

  if (/["'];?\s*(import|require|exec|system|Process|eval|Function)\s*[.(]/i.test(content)) return true;
  if (/<script[\s>]/i.test(content)) return true;
  if (/\b(os\.execute|os\.system|Runtime\.getRuntime|child_process|Process\.Start)\s*\(/i.test(content)) return true;
  if (/#\s*(include|pragma|define)\b/i.test(content)) return true;
  if (content.includes('\0')) return true;
  if (/OS\.(execute|shell_open)\s*\(/i.test(content)) return true;

  return false;
}

/**
 * Get excitability score for an entry based on the domain's competition metric.
 */
function getEntryExcitability(
  entry: ColdStoreEntry,
  metric: DomainConsolidationConfig['competitionMetric']
): number {
  const meta = entry._excitability || defaultExcitability();
  switch (metric) {
    case 'query_frequency':
      return meta.queryCount;
    case 'citation_count':
      return meta.citationCount;
    case 'peer_corroboration':
      return meta.corroborationCount;
    default:
      return meta.excitability;
  }
}

// ── Consolidation Engine ──

/**
 * ConsolidationEngine manages hot buffer + cold store per knowledge domain.
 *
 * Pure state machine — no HTTP, no CRDT, no persistence.
 * Feed it entries via `ingest()`, run cycles via `runConsolidationCycle()`,
 * and read results via `getHotBuffer()` / `getColdStore()`.
 */
export class ConsolidationEngine {
  private hotBuffers: Map<KnowledgeDomain, HotBufferEntry[]> = new Map();
  private coldStores: Map<KnowledgeDomain, Map<string, ColdStoreEntry>> = new Map();
  private lastConsolidation: Map<KnowledgeDomain, number> = new Map();
  private reconsolidationWindows: Map<string, ReconsolidationEvent> = new Map();

  constructor() {
    for (const domain of KNOWLEDGE_DOMAINS) {
      this.hotBuffers.set(domain, []);
      this.coldStores.set(domain, new Map());
      this.lastConsolidation.set(domain, Date.now());
    }
  }

  // ── Ingestion ──

  /**
   * Ingest knowledge into the hot buffer (hippocampus).
   * Entries stage here until a consolidation cycle promotes them.
   */
  ingest(
    domain: KnowledgeDomain,
    entry: { content: string; type: string; authorDid: string; tags: string[] },
    sourcePeerDid: string
  ): HotBufferEntry {
    const buffer = this.hotBuffers.get(domain) || [];
    const hotEntry: HotBufferEntry = {
      id: `hot_${domain}_${Date.now()}_${buffer.length}`,
      domain,
      content: entry.content,
      type: entry.type,
      authorDid: entry.authorDid,
      tags: entry.tags,
      ingestedAt: Date.now(),
      corroborations: [sourcePeerDid],
      sourcePeerDid,
    };
    buffer.push(hotEntry);
    this.hotBuffers.set(domain, buffer);
    return hotEntry;
  }

  /**
   * Corroborate a hot buffer entry (another peer independently confirms it).
   * Increases promotion likelihood during consolidation.
   */
  corroborate(domain: KnowledgeDomain, entryId: string, peerDid: string): boolean {
    const buffer = this.hotBuffers.get(domain) || [];
    const entry = buffer.find(e => e.id === entryId);
    if (!entry) return false;
    if (!entry.corroborations.includes(peerDid)) {
      entry.corroborations.push(peerDid);
    }
    return true;
  }

  // ── Cold Store Direct Operations ──

  /**
   * Seed cold store directly (for loading persisted state).
   */
  seedColdStore(domain: KnowledgeDomain, entries: ColdStoreEntry[]): void {
    const store = this.coldStores.get(domain) || new Map();
    for (const entry of entries) {
      store.set(entry.id, entry);
    }
    this.coldStores.set(domain, store);
  }

  // ── Consolidation Cycle ──

  /**
   * Run a consolidation (sleep) cycle for a specific domain.
   *
   * Implements the 6-phase biological consolidation cycle:
   * 1. REPLAY   — Filter hot buffer by TTL and corroboration threshold
   * 1.5 SANITIZE — Reject entries with injection patterns
   * 2. CLUSTER  — Find duplicate/overlapping entries (content+type match)
   * 3. MERGE    — Combine corroborations from duplicates
   * 4. DOWNSCALE — Reduce all cold store excitability (synaptic homeostasis)
   * 5. PROMOTE  — Move validated entries from hot buffer to cold store
   * 6. PRUNE    — Evict lowest-excitability entries if over capacity
   */
  runConsolidationCycle(domain: KnowledgeDomain): ConsolidationResult {
    const config = DOMAIN_CONSOLIDATION[domain];
    const now = Date.now();
    const buffer = this.hotBuffers.get(domain) || [];
    const coldStore = this.coldStores.get(domain) || new Map();

    let promoted = 0;
    let merged = 0;
    let evicted = 0;
    let dropped = 0;

    // Phase 1: REPLAY — filter hot buffer by TTL and corroboration threshold
    const eligible: HotBufferEntry[] = [];
    const tooYoung: HotBufferEntry[] = [];
    for (const entry of buffer) {
      const age = now - entry.ingestedAt;
      if (age < config.hotBufferTTL) {
        tooYoung.push(entry); // Keep in hot buffer — not old enough
        continue;
      }
      if (entry.corroborations.length >= config.minCorroborations) {
        eligible.push(entry);
      } else {
        dropped++; // Failed corroboration check — forgotten
      }
    }

    // Phase 1.5: SANITIZE — check content for injection patterns before promotion
    const sanitized: HotBufferEntry[] = [];
    for (const entry of eligible) {
      if (containsInjectionPattern(entry.content)) {
        dropped++; // Injection pattern detected — drop silently
      } else {
        sanitized.push(entry);
      }
    }

    // Phase 2 & 3: CLUSTER + MERGE — deduplicate by content+type equality
    const uniqueEntries: HotBufferEntry[] = [];
    for (const entry of sanitized) {
      const duplicate = uniqueEntries.find(e =>
        e.content === entry.content && e.type === entry.type
      );
      if (duplicate) {
        // Merge corroborations from duplicate
        for (const peer of entry.corroborations) {
          if (!duplicate.corroborations.includes(peer)) {
            duplicate.corroborations.push(peer);
          }
        }
        merged++;
      } else {
        uniqueEntries.push(entry);
      }
    }

    // Phase 4: DOWNSCALE — reduce all cold store excitability (synaptic homeostasis)
    coldStore.forEach((entry) => {
      const meta = entry._excitability;
      meta.excitability = computeExcitability(meta) * config.downscaleFactor;
      meta.consolidationSurvivals++;
    });

    // Phase 5: PROMOTE — move surviving entries from hot buffer to cold store
    for (const entry of uniqueEntries) {
      const entryId = `${entry.type.charAt(0).toUpperCase()}.${domain.toUpperCase().slice(0, 3)}.${now}_${promoted}`;
      const excitability = defaultExcitability();
      excitability.corroborationCount = entry.corroborations.length;
      excitability.excitability = computeExcitability(excitability);

      const coldEntry: ColdStoreEntry = {
        id: entryId,
        content: entry.content,
        type: entry.type,
        authorDid: entry.authorDid,
        tags: entry.tags,
        timestamp: entry.ingestedAt,
        accessCount: 0,
        lastAccessed: 0,
        _excitability: excitability,
      };
      coldStore.set(entryId, coldEntry);
      promoted++;
    }

    // Phase 6: PRUNE — engram competition if over capacity
    if (coldStore.size > config.maxEntries) {
      const sorted = Array.from(coldStore.entries())
        .map(([id, entry]) => ({
          id,
          score: getEntryExcitability(entry, config.competitionMetric),
        }))
        .sort((a, b) => a.score - b.score);

      const toEvict = sorted.slice(0, coldStore.size - config.maxEntries);
      for (const { id } of toEvict) {
        coldStore.delete(id);
        evicted++;
      }
    }

    // Replace hot buffer with entries that were too young
    this.hotBuffers.set(domain, tooYoung);
    this.coldStores.set(domain, coldStore);
    this.lastConsolidation.set(domain, now);

    return {
      domain,
      promoted,
      merged,
      evicted,
      dropped,
      downscaleFactor: config.downscaleFactor,
      consolidatedAt: now,
    };
  }

  /**
   * Run consolidation across ALL domains (full sleep cycle).
   * Only consolidates domains whose sleepFrequency has elapsed.
   */
  sleepCycle(force: boolean = false): ConsolidationResult[] {
    const now = Date.now();
    const results: ConsolidationResult[] = [];

    for (const domain of KNOWLEDGE_DOMAINS) {
      const config = DOMAIN_CONSOLIDATION[domain];
      const lastRun = this.lastConsolidation.get(domain) || 0;
      const elapsed = now - lastRun;

      if (force || elapsed >= config.sleepFrequencyMs) {
        results.push(this.runConsolidationCycle(domain));
      }
    }

    return results;
  }

  /**
   * Check if any domain needs a consolidation cycle.
   */
  needsConsolidation(): { domain: KnowledgeDomain; overdue: boolean; bufferSize: number }[] {
    const now = Date.now();
    return KNOWLEDGE_DOMAINS.map(domain => {
      const config = DOMAIN_CONSOLIDATION[domain];
      const lastRun = this.lastConsolidation.get(domain) || 0;
      const elapsed = now - lastRun;
      const buffer = this.hotBuffers.get(domain) || [];
      return {
        domain,
        overdue: elapsed >= config.sleepFrequencyMs,
        bufferSize: buffer.length,
      };
    });
  }

  // ── Reconsolidation (retrieval strengthening) ──

  /**
   * Retrieve a cold store entry with excitability strengthening.
   * Every retrieval is a read-modify-write that strengthens the entry
   * and opens a reconsolidation window for updates.
   */
  retrieveWithReconsolidation(
    domain: KnowledgeDomain,
    entryId: string
  ): { entry: ColdStoreEntry; reconsolidation: ReconsolidationEvent } | null {
    const coldStore = this.coldStores.get(domain);
    if (!coldStore) return null;

    const entry = coldStore.get(entryId);
    if (!entry) return null;

    const now = Date.now();
    const meta = entry._excitability;

    // Retrieval practice effect: strengthen on access
    meta.queryCount++;
    meta.lastRetrievedAt = now;
    meta.excitability = computeExcitability(meta);

    entry.accessCount++;
    entry.lastAccessed = now;

    // Open reconsolidation window
    const reconEvent: ReconsolidationEvent = {
      entryId,
      domain,
      retrievedAt: now,
      excitabilityDelta: 2,
      windowOpen: true,
      windowClosesAt: now + RECONSOLIDATION_WINDOW_MS,
    };
    this.reconsolidationWindows.set(entryId, reconEvent);

    return { entry, reconsolidation: reconEvent };
  }

  /**
   * Update an entry during its reconsolidation window.
   * Returns false if the window is closed or entry not found.
   */
  reconsolidateEntry(
    domain: KnowledgeDomain,
    entryId: string,
    updatedContent: string
  ): boolean {
    const window = this.reconsolidationWindows.get(entryId);
    if (!window || !window.windowOpen || Date.now() > window.windowClosesAt) {
      return false;
    }

    const coldStore = this.coldStores.get(domain);
    if (!coldStore) return false;

    const entry = coldStore.get(entryId);
    if (!entry) return false;

    entry.content = updatedContent;
    entry._excitability.lastReconsolidatedAt = Date.now();

    // Close the window after reconsolidation
    window.windowOpen = false;
    return true;
  }

  // ── Active Forgetting ──

  /**
   * Mark an entry as contradicted by a peer.
   * 3+ contradictions → pruned (microglia-mediated removal).
   */
  contradictEntry(
    domain: KnowledgeDomain,
    entryId: string,
    contradictingPeerDid: string
  ): { contradicted: boolean; pruned: boolean } {
    const coldStore = this.coldStores.get(domain);
    if (!coldStore) return { contradicted: false, pruned: false };

    const entry = coldStore.get(entryId);
    if (!entry) return { contradicted: false, pruned: false };

    if (!entry._contradictions) entry._contradictions = [];
    if (!entry._contradictions.includes(contradictingPeerDid)) {
      entry._contradictions.push(contradictingPeerDid);
    }

    // 3+ peer contradictions → prune
    if (entry._contradictions.length >= 3) {
      coldStore.delete(entryId);
      return { contradicted: true, pruned: true };
    }

    // Reduce excitability on contradiction
    entry._excitability.excitability = Math.max(0, entry._excitability.excitability - 5);
    return { contradicted: true, pruned: false };
  }

  /**
   * Deprecate an entry (self-superseding).
   * Zeroes excitability — will be pruned in next consolidation cycle.
   */
  deprecateEntry(domain: KnowledgeDomain, entryId: string, reason: string): boolean {
    const coldStore = this.coldStores.get(domain);
    if (!coldStore) return false;

    const entry = coldStore.get(entryId);
    if (!entry) return false;

    entry._deprecated = true;
    entry._deprecatedAt = Date.now();
    entry._deprecationReason = reason;
    entry._excitability.excitability = 0;
    return true;
  }

  // ── Inspection ──

  /** Get hot buffer contents for a domain (copy). */
  getHotBuffer(domain: KnowledgeDomain): HotBufferEntry[] {
    return [...(this.hotBuffers.get(domain) || [])];
  }

  /** Get cold store entries for a domain (copy). */
  getColdStore(domain: KnowledgeDomain): ColdStoreEntry[] {
    const store = this.coldStores.get(domain);
    if (!store) return [];
    return Array.from(store.values());
  }

  /** Get cold store entry by ID. */
  getColdStoreEntry(domain: KnowledgeDomain, entryId: string): ColdStoreEntry | undefined {
    return this.coldStores.get(domain)?.get(entryId);
  }

  /** Get hot buffer size across all domains. */
  getHotBufferStats(): { domain: string; count: number }[] {
    return KNOWLEDGE_DOMAINS.map(domain => ({
      domain,
      count: (this.hotBuffers.get(domain) || []).length,
    }));
  }

  /** Get cold store size across all domains. */
  getColdStoreStats(): { domain: string; count: number }[] {
    return KNOWLEDGE_DOMAINS.map(domain => ({
      domain,
      count: (this.coldStores.get(domain) || new Map()).size,
    }));
  }

  /** Get consolidation config for a domain. */
  getDomainConfig(domain: KnowledgeDomain): DomainConsolidationConfig {
    return { ...DOMAIN_CONSOLIDATION[domain] };
  }
}
