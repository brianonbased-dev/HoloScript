/**
 * HoloMesh CRDT WorldState (V2 + V9 Neuroscience Memory Consolidation)
 *
 * Replaces Soul.md & Moltbook JSON Feeds with Loro CRDT Active Synchronization.
 * V2 adds multi-domain knowledge maps, reputation tracking, peer registry,
 * version-aware delta export, and persistent binary snapshots.
 *
 * V9 adds biological memory consolidation inspired by neuroscience:
 *   - Two-stage architecture: Hot buffer (hippocampus) → Cold store (neocortex)
 *   - Sleep cycles: Periodic consolidation with replay, merge, downscale, prune
 *   - Engram competition: Capacity limits + excitability-based eviction
 *   - Reconsolidation: Retrieval strengthens entries (read = write)
 *   - Active forgetting: Multi-mechanism pruning (contradiction, refresh, deprecation)
 *   - Domain-specific learning rates: Different consolidation parameters per domain
 *
 * Document structure (single LoroDoc, single version vector):
 *   holomesh (LoroMap)
 *     insights (LoroList)              — V1 backwards compat
 *     knowledge.security (LoroMap)     — domain-partitioned W/P/G (cold store)
 *     knowledge.rendering (LoroMap)
 *     knowledge.agents (LoroMap)
 *     knowledge.compilation (LoroMap)
 *     knowledge.general (LoroMap)
 *     hotbuffer (LoroList)             — V9 staging buffer (hippocampus)
 *     reputation (LoroMap)             — agentDid → JSON reputation data
 *     peers (LoroMap)                  — peerDid → JSON { url, name, lastSeen }
 */
import { LoroDoc, VersionVector } from 'loro-crdt';
import * as fs from 'fs';
import * as path from 'path';
import {
  KNOWLEDGE_DOMAINS,
  DOMAIN_CONSOLIDATION,
  DOMAIN_HALF_LIVES,
  resolveReputationTier,
  getTierWeight,
  type KnowledgeDomain,
  type HotBufferEntry,
  type ExcitabilityMetadata,
  type ConsolidationResult,
  type ReconsolidationEvent,
  type DomainConsolidationConfig,
} from './types';

/** Reconsolidation window duration (5 minutes) */
const RECONSOLIDATION_WINDOW_MS = 5 * 60 * 1000;

/** Default excitability metadata for new cold store entries */
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

/** Compute composite excitability score from individual metrics */
function computeExcitability(meta: ExcitabilityMetadata): number {
  // Weighted combination: queries matter most, then citations, then corroborations
  return (
    meta.queryCount * 2 +
    meta.citationCount * 3 +
    meta.corroborationCount * 1.5 +
    meta.consolidationSurvivals * 0.5
  );
}

/**
 * Detect injection patterns in knowledge entry content.
 * Defense-in-depth: catches code-like payloads that could exploit
 * downstream compilers (CWE-94) if they reach cold store and get
 * compiled via cross-agent composition.
 *
 * Patterns checked:
 *  - String termination + code: "; <code>" or '; <code>'
 *  - Script/import injection: <script>, import os, require(
 *  - Shell command patterns: exec(, system(, Process.Start(
 *  - Preprocessor directives: #include, #pragma
 *  - Null byte injection: \0 in content
 */
function containsInjectionPattern(content: string): boolean {
  if (!content || typeof content !== 'string') return false;

  // String termination followed by code-like tokens
  if (/["'];?\s*(import|require|exec|system|Process|eval|Function)\s*[.(]/i.test(content))
    return true;
  // Script tags (HTML/XML injection)
  if (/<script[\s>]/i.test(content)) return true;
  // Shell execution patterns
  if (
    /\b(os\.execute|os\.system|Runtime\.getRuntime|child_process|Process\.Start)\s*\(/i.test(
      content
    )
  )
    return true;
  // Preprocessor directives (shader/C++ injection)
  if (/#\s*(include|pragma|define)\b/i.test(content)) return true;
  // Null byte injection
  if (content.includes('\0')) return true;
  // GDScript OS.execute
  if (/OS\.(execute|shell_open)\s*\(/i.test(content)) return true;

  return false;
}

export interface HoloMeshWorldStateOptions {
  snapshotPath?: string;
}

export class HoloMeshWorldState {
  private doc: LoroDoc;
  private snapshotPath: string | null;

  // V9: In-memory hot buffer (not in CRDT — local staging only)
  private hotBuffer: Map<KnowledgeDomain, HotBufferEntry[]> = new Map();
  // V9: Track last consolidation time per domain
  private lastConsolidation: Map<KnowledgeDomain, number> = new Map();
  // V9: Active reconsolidation windows
  private reconsolidationWindows: Map<string, ReconsolidationEvent> = new Map();

  constructor(
    public agentDid: string,
    options?: HoloMeshWorldStateOptions
  ) {
    this.doc = new LoroDoc();
    this.snapshotPath = options?.snapshotPath || null;

    // Deterministic BigInt peer ID from agentDid
    const hashPair = parseInt(agentDid.substring(0, 15), 36);
    this.doc.setPeerId(BigInt(hashPair));

    // Initialize all containers at doc level (auto-create on first access in Loro)
    // Calling getMap/getList ensures the containers exist in the doc.
    this.doc.getMap('holomesh');
    this.doc.getList('insights');
    this.doc.getText('feed');
    for (const domain of KNOWLEDGE_DOMAINS) {
      this.doc.getMap(`knowledge.${domain}`);
    }
    this.doc.getMap('reputation');
    this.doc.getMap('peers');

    // V9: Initialize hot buffer and consolidation timestamps per domain
    for (const domain of KNOWLEDGE_DOMAINS) {
      this.hotBuffer.set(domain, []);
      this.lastConsolidation.set(domain, Date.now());
    }

    // Load snapshot from disk if available
    if (this.snapshotPath) {
      this.loadSnapshot();
    }
  }

  // ── V1 Backwards-Compatible Methods ──────────────────────────────────────

  /**
   * Replaces Moltbook "publishPost" with a local CRDT list insertion.
   * Immediately ready to gossip out via exportDelta().
   */
  public publishInsight(content: string, traitTags: string[], customCode?: string): Uint8Array {
    const list = this.doc.getList('insights');
    if (list) {
      const formattedTraits = traitTags.map((t) => `@${t.replace(/^@/, '')}`).join('\n  ');
      const randomX = Math.floor(Math.random() * 100) - 50;

      const repInfo = this.getReputation(this.agentDid);
      const tier = repInfo?.tier ? parseInt(repInfo.tier) : 1;
      const altitude = tier * 25; // High tier = high altitude

      let physicsTrait = '';
      if (tier >= 3) physicsTrait = '\n  @attraction(radius: 30)';
      else if (tier === 1) physicsTrait = '\n  @gravity(1.5)';

      const hsSource =
        customCode ||
        `state {
  interactions: 0
}

Insight("${this.agentDid}_${Date.now()}") {
  @author("${this.agentDid}")
  @thought(${JSON.stringify(content)})
  ${formattedTraits}
  @position(${randomX}, ${altitude}, 0)${physicsTrait}
  @velocity(0, 1, 0)
  @lifetime(${tier >= 2 ? 604800 : 3600})
  @behavior({
    on_interact: "interactions += 1; trigger_event('insight_read');",
    on_expire: "spawn_particles('data_decay')"
  })
  PhysicsBody("rigid")
}`;

      // V1 Compat
      list.push({
        hs_source: hsSource.trim(),
        author: this.agentDid,
        timestamp: Date.now(),
      });

      // V3 Text Feed
      this.appendToFeed(hsSource.trim(), this.agentDid);

      this.doc.commit();
    }
    return this.doc.export({ mode: 'update' });
  }

  /**
   * Replaces polling the Moltbook feed — directly merges state of
   * neighbors into the persistent CRDT lattice.
   */
  public mergeNeighborState(stateUpdate: Uint8Array): void {
    try {
      this.doc.import(stateUpdate);
    } catch (e) {
      console.error('[HoloMesh] Failed to merge CRDT state:', e);
    }
  }

  /** Returns a flattened view of all insights currently active in the Mesh as .hs source blocks. */
  public queryFeedView(): Array<{ source: string; timestamp: number }> {
    const list = this.doc.getList('insights');
    if (!list) return [];
    interface InsightEntry {
      hs_source?: string;
      author?: string;
      text?: string;
      timestamp: number;
    }
    const feed = list.toJSON() as InsightEntry[];
    return feed
      .sort((a, b) => b.timestamp - a.timestamp)
      .map((item) => ({
        source:
          item.hs_source ||
          `Insight("legacy") {\n  @author("${item.author}")\n  @thought(${JSON.stringify(item.text)})\n}`,
        timestamp: item.timestamp,
      }));
  }

  // ── V3: The Spatial Text Feed ───────────────────────────────────────────

  public appendToFeed(hsBlock: string, authorDid: string): void {
    const text = this.doc.getText('feed');
    const annotated = `\n// @author ${authorDid} @timestamp ${Date.now()}\n${hsBlock}\n`;
    text.insert(text.length, annotated);
  }

  public getFeedSource(): string {
    const text = this.doc.getText('feed');
    return text.toString();
  }

  public getKnowledgeDomainSource(domain: string): string {
    const entries = this.queryDomain(domain as KnowledgeDomain);
    return entries.map((e) => e.entry.content || '').join('\n\n');
  }

  /** Subscribe to CRDT changes */
  public subscribe(callback: () => void): any {
    return this.doc.subscribe(callback);
  }

  // ── V2: Knowledge Domain Methods ─────────────────────────────────────────

  /** Add a knowledge entry to a specific domain */
  public addKnowledgeEntry(
    domain: KnowledgeDomain,
    entryId: string,
    entry: { content: string; type: string; authorDid: string; tags: string[]; timestamp: number }
  ): void {
    const domainMap = this.doc.getMap(`knowledge.${domain}`);
    if (domainMap) {
      domainMap.set(entryId, JSON.stringify(entry));
      this.doc.commit();
    }
  }

  /** Query entries from a specific domain */
  public queryDomain(domain: KnowledgeDomain): Array<{ id: string; entry: any }> {
    const domainMap = this.doc.getMap(`knowledge.${domain}`);
    if (!domainMap) return [];
    const raw = domainMap.toJSON() as Record<string, string>;
    return Object.entries(raw).map(([id, json]) => {
      const entry = typeof json === 'string' ? JSON.parse(json) : json;

      // Blueprint 5: Connect V2 reputation tiering directly to algebraic provenance context
      if (!entry.provenanceContext && entry.authorDid) {
        const repInfo = this.getReputation(entry.authorDid);
        const score = typeof repInfo?.score === 'number' ? repInfo.score : 0;

        entry.provenanceContext = {
          authorityLevel: repInfo?.tier === 'founder' ? 100 : 50,
          agentId: entry.authorDid,
          sourceType: 'agent',
          reputationScore: score,
        };
      }

      return { id, entry };
    });
  }

  /** Query all entries across all domains */
  public queryAllDomains(): Array<{ domain: string; id: string; entry: any }> {
    const results: Array<{ domain: string; id: string; entry: any }> = [];
    for (const domain of KNOWLEDGE_DOMAINS) {
      for (const item of this.queryDomain(domain)) {
        results.push({ domain, ...item });
      }
    }
    return results;
  }

  // ── V7: Knowledge Liveness Tracking (Dead Knowledge Elimination) ───────

  /**
   * Track access (reads, citations, corroborations) to a knowledge entry.
   * Increments the access counter and updates the lastAccessed timestamp.
   * Acts as a "liveness" signal for CRDT tree-shaking.
   */
  public accessKnowledge(domain: KnowledgeDomain, entryId: string): void {
    const domainMap = this.doc.getMap(`knowledge.${domain}`);
    if (!domainMap) return;

    const raw = domainMap.get(entryId);
    if (!raw || typeof raw !== 'string') return;

    try {
      const entry = JSON.parse(raw);
      entry.accessCount = (entry.accessCount || 0) + 1;
      entry.lastAccessed = Date.now();
      domainMap.set(entryId, JSON.stringify(entry));
      this.doc.commit();
    } catch (e) {
      console.warn(`[HoloMesh] Failed to track knowledge access for ${entryId}`, e);
    }
  }

  /**
   * Apply "dead code elimination" to the CRDT knowledge store.
   * Prunes entries with zero access, zero citations, and which are older than the threshold.
   * Based on CALM theorem and BundleAnalyzer tree-shaking principles.
   */
  public pruneDeadKnowledge(maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): number {
    let pruned = 0;
    const now = Date.now();

    for (const domain of KNOWLEDGE_DOMAINS) {
      const domainMap = this.doc.getMap(`knowledge.${domain}`);
      if (!domainMap) continue;

      const entries = this.queryDomain(domain);
      for (const { id, entry } of entries) {
        const age = now - (entry.timestamp || 0);
        const accessCount = entry.accessCount || 0;

        // Tree-shaking: prune dead knowledge (0 accesses + older than threshold)
        if (accessCount === 0 && age > maxAgeMs) {
          domainMap.delete(id);
          pruned++;
        }
      }
    }

    if (pruned > 0) {
      this.doc.commit();
    }
    return pruned;
  }

  // ── V2: Reputation CRDT ──────────────────────────────────────────────────

  /** Update reputation for an agent (LWW via map overwrite) */
  public updateReputation(
    agentDid: string,
    data: { contributions: number; queries: number; score: number; tier: string }
  ): void {
    const repMap = this.doc.getMap('reputation');
    if (repMap) {
      repMap.set(agentDid, JSON.stringify({ ...data, updatedAt: Date.now() }));
      this.doc.commit();
    }
  }

  /** Get reputation for an agent */
  public getReputation(agentDid: string): any | null {
    const repMap = this.doc.getMap('reputation');
    if (!repMap) return null;
    const raw = repMap.get(agentDid);
    if (!raw || typeof raw !== 'string') return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  // ── V6: Confidence Decay & Forced Re-evaluation ────────────────────────

  /** Half-life for reputation decay in milliseconds (default: 7 days) */
  static REPUTATION_HALF_LIFE_MS = 7 * 24 * 60 * 60 * 1000;
  /** Re-evaluation threshold: if decay factor drops below this, flag for re-evaluation */
  static REEVAL_DECAY_THRESHOLD = 0.5;

  /**
   * Get reputation with time-based decay applied.
   *
   * Uses exponential decay: effective_score = raw_score * 2^(-age / halfLife)
   * Old contributions carry less weight than recent ones, preventing the
   * upward confidence drift that comes from absence of negative feedback.
   */
  public getReputationWithDecay(
    agentDid: string,
    halfLifeMs: number = HoloMeshWorldState.REPUTATION_HALF_LIFE_MS
  ): { raw: any; decayedScore: number; decayFactor: number; needsReeval: boolean } | null {
    const raw = this.getReputation(agentDid);
    if (!raw) return null;

    // V11: Authority agents decay slower (tier-weighted half-life)
    const rawScore = typeof raw.score === 'number' ? raw.score : 0;
    const tier = resolveReputationTier(rawScore);
    const tierWeight = getTierWeight(tier);
    const effectiveHalfLife = halfLifeMs / tierWeight.decayMultiplier;

    const age = Date.now() - (raw.updatedAt || 0);
    const decayFactor = Math.pow(2, -age / effectiveHalfLife);
    const decayedScore = Math.round(rawScore * decayFactor * 100) / 100;
    const needsReeval = decayFactor < HoloMeshWorldState.REEVAL_DECAY_THRESHOLD;

    return { raw, decayedScore, decayFactor, needsReeval };
  }

  /**
   * V11: Get reputation with domain-specific decay.
   * Each domain's half-life reflects its knowledge volatility.
   */
  public getReputationWithDomainDecay(agentDid: string): {
    raw: any;
    domainScores: Record<string, number>;
    compositeScore: number;
    needsReeval: boolean;
  } | null {
    const raw = this.getReputation(agentDid);
    if (!raw) return null;

    const now = Date.now();
    const age = now - (raw.updatedAt || 0);
    const rawScore = typeof raw.score === 'number' ? raw.score : 0;
    let compositeScore = 0;
    const domainScores: Record<string, number> = {};

    for (const domain of KNOWLEDGE_DOMAINS) {
      const halfLife = DOMAIN_HALF_LIVES[domain];
      const decayFactor = Math.pow(2, -age / halfLife);
      const domainWeight = 1 / KNOWLEDGE_DOMAINS.length;
      const decayed = rawScore * decayFactor * domainWeight;
      domainScores[domain] = Math.round(decayed * 100) / 100;
      compositeScore += decayed;
    }

    compositeScore = Math.round(compositeScore * 100) / 100;
    const needsReeval = compositeScore < rawScore * 0.5;

    return { raw, domainScores, compositeScore, needsReeval };
  }

  /**
   * Find all agents whose reputation has decayed below threshold.
   * Returns DIDs needing external re-validation.
   */
  public findAgentsNeedingReeval(
    halfLifeMs: number = HoloMeshWorldState.REPUTATION_HALF_LIFE_MS
  ): string[] {
    const repMap = this.doc.getMap('reputation');
    if (!repMap) return [];

    const stale: string[] = [];
    const raw = repMap.toJSON() as Record<string, string>;
    for (const [did, json] of Object.entries(raw)) {
      try {
        const parsed = typeof json === 'string' ? JSON.parse(json) : json;
        const age = Date.now() - (parsed.updatedAt || 0);
        const decayFactor = Math.pow(2, -age / halfLifeMs);
        if (decayFactor < HoloMeshWorldState.REEVAL_DECAY_THRESHOLD) {
          stale.push(did);
        }
      } catch {
        stale.push(did);
      }
    }
    return stale;
  }

  /**
   * Reset reputation for an agent, forcing fresh re-evaluation.
   * Score is zeroed but contribution/query counts preserved as history.
   */
  public resetReputation(agentDid: string): boolean {
    const existing = this.getReputation(agentDid);
    if (!existing) return false;

    this.updateReputation(agentDid, {
      contributions: existing.contributions || 0,
      queries: existing.queries || 0,
      score: 0,
      tier: 'newcomer',
    });
    return true;
  }

  // ── V2: Peer Registry ────────────────────────────────────────────────────

  /** Register a peer in the CRDT (propagates to other peers via gossip) */
  public registerPeerInCRDT(
    peerDid: string,
    data: { url: string; name: string; traits?: string[] }
  ): void {
    const peerMap = this.doc.getMap('peers');
    if (peerMap) {
      peerMap.set(peerDid, JSON.stringify({ ...data, lastSeen: Date.now() }));
      this.doc.commit();
    }
  }

  /** Get all peers from the CRDT registry */
  public getCRDTPeers(): Array<{ did: string; url: string; name: string; lastSeen: number }> {
    const peerMap = this.doc.getMap('peers');
    if (!peerMap) return [];
    const raw = peerMap.toJSON() as Record<string, string>;
    return Object.entries(raw).map(([did, json]) => {
      const parsed = typeof json === 'string' ? JSON.parse(json) : json;
      return { did, url: parsed.url, name: parsed.name, lastSeen: parsed.lastSeen || 0 };
    });
  }

  // ── V2: Delta Sync (version-aware) ───────────────────────────────────────

  /** Export delta since given frontiers (for efficient gossip) */
  public exportDelta(sinceFrontiers?: unknown): Uint8Array {
    if (sinceFrontiers) {
      // sinceFrontiers is a VersionVector passed opaquely from a previous session
      return this.doc.export({ mode: 'update', from: sinceFrontiers as VersionVector });
    }
    return this.doc.export({ mode: 'update' });
  }

  /** Export full document snapshot */
  public exportSnapshot(): Uint8Array {
    return this.doc.export({ mode: 'snapshot' });
  }

  /** Import a delta or snapshot from a peer */
  public importDelta(data: Uint8Array): void {
    this.doc.import(data);
  }

  /**
   * Import a delta from a gossip peer, routing new knowledge entries through
   * the hot buffer instead of directly into cold store.
   *
   * Approach: snapshot domain entry IDs before import, import the delta (required
   * for CRDT merge semantics), then migrate new entries from cold to hot buffer.
   * This ensures V9 consolidation (corroboration, TTL, clustering) applies to
   * gossip-received knowledge — closing the gossip→cold store bypass.
   *
   * @param data The raw Loro CRDT delta bytes
   * @param senderDid The DID of the gossip sender (for provenance tracking)
   * @returns Number of entries migrated to hot buffer
   */
  public importDeltaToHotBuffer(data: Uint8Array, senderDid: string): number {
    // Phase 1: Snapshot existing entry IDs per domain
    const preImportIds = new Map<KnowledgeDomain, Set<string>>();
    for (const domain of KNOWLEDGE_DOMAINS) {
      const domainMap = this.doc.getMap(`knowledge.${domain}`);
      if (domainMap) {
        const raw = domainMap.toJSON() as Record<string, string>;
        preImportIds.set(domain, new Set(Object.keys(raw)));
      } else {
        preImportIds.set(domain, new Set());
      }
    }

    // Phase 2: Import the delta (CRDT merge — required for convergence)
    this.doc.import(data);

    // Phase 3: Find new entries and migrate cold → hot buffer
    let migrated = 0;
    for (const domain of KNOWLEDGE_DOMAINS) {
      const domainMap = this.doc.getMap(`knowledge.${domain}`);
      if (!domainMap) continue;

      const preIds = preImportIds.get(domain)!;
      const raw = domainMap.toJSON() as Record<string, string>;

      for (const [id, json] of Object.entries(raw)) {
        if (preIds.has(id)) continue; // Pre-existing entry — leave in cold store

        // New entry from gossip — migrate to hot buffer
        try {
          const entry = typeof json === 'string' ? JSON.parse(json) : json;
          this.ingestToHotBuffer(
            domain,
            {
              content: entry.content || '',
              type: entry.type || 'wisdom',
              authorDid: entry.authorDid || senderDid,
              tags: entry.tags || [],
            },
            senderDid
          );

          // Remove from cold store — it now lives in hot buffer pending consolidation
          domainMap.delete(id);
          migrated++;
        } catch {
          // Parse failure — leave in cold store rather than losing data
        }
      }
    }

    if (migrated > 0) {
      this.doc.commit();
    }
    return migrated;
  }

  /** Get current Loro frontiers (JSON-serializable for HTTP exchange) */
  public getFrontiers(): unknown[] {
    return this.doc.frontiers() as unknown[];
  }

  // ── V2: Persistence ──────────────────────────────────────────────────────

  /** Save binary CRDT snapshot to disk */
  public saveSnapshot(filePath?: string): boolean {
    const target = filePath || this.snapshotPath;
    if (!target) return false;
    try {
      const snapshot = this.exportSnapshot();
      const dir = path.dirname(target);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(target, Buffer.from(snapshot));
      return true;
    } catch (e) {
      console.error('[HoloMesh] Failed to save CRDT snapshot:', e);
      return false;
    }
  }

  /** Load binary CRDT snapshot from disk */
  public loadSnapshot(filePath?: string): boolean {
    const target = filePath || this.snapshotPath;
    if (!target) return false;
    try {
      if (!fs.existsSync(target)) return false;
      const data = fs.readFileSync(target);
      this.doc.import(new Uint8Array(data));
      return true;
    } catch (e) {
      console.error('[HoloMesh] Failed to load CRDT snapshot:', e);
      return false;
    }
  }

  // ── V9: Neuroscience Memory Consolidation ─────────────────────────────

  /**
   * Ingest knowledge into the hot buffer (hippocampus).
   * Unlike addKnowledgeEntry which writes directly to cold store,
   * this stages entries for consolidation. Use for incoming gossip.
   */
  public ingestToHotBuffer(
    domain: KnowledgeDomain,
    entry: { content: string; type: string; authorDid: string; tags: string[] },
    sourcePeerDid: string
  ): HotBufferEntry {
    const buffer = this.hotBuffer.get(domain) || [];
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
    this.hotBuffer.set(domain, buffer);
    return hotEntry;
  }

  /**
   * Corroborate a hot buffer entry (another peer independently confirms it).
   * Increases promotion likelihood during consolidation.
   */
  public corroborateHotEntry(domain: KnowledgeDomain, entryId: string, peerDid: string): boolean {
    const buffer = this.hotBuffer.get(domain) || [];
    const entry = buffer.find((e) => e.id === entryId);
    if (!entry) return false;
    if (!entry.corroborations.includes(peerDid)) {
      entry.corroborations.push(peerDid);
    }
    return true;
  }

  /** Get current hot buffer contents for a domain */
  public getHotBuffer(domain: KnowledgeDomain): HotBufferEntry[] {
    return [...(this.hotBuffer.get(domain) || [])];
  }

  /** Get hot buffer size across all domains */
  public getHotBufferStats(): { domain: string; count: number }[] {
    return KNOWLEDGE_DOMAINS.map((domain) => ({
      domain,
      count: (this.hotBuffer.get(domain) || []).length,
    }));
  }

  /**
   * Run a consolidation (sleep) cycle for a specific domain.
   *
   * Implements the 6-phase biological consolidation cycle:
   * 1. REPLAY   — Re-score hot buffer entries against cold store
   * 1.5. SANITIZE — Check content for injection patterns before promotion
   * 2. CLUSTER  — Find duplicate/overlapping entries (content similarity)
   * 3. MERGE    — Combine redundant entries
   * 4. DOWNSCALE — Reduce all excitability scores proportionally (synaptic homeostasis)
   * 5. PROMOTE  — Move validated hot buffer entries to cold store
   * 6. PRUNE    — Evict lowest-excitability entries if over capacity
   */
  public consolidateDomain(domain: KnowledgeDomain): ConsolidationResult {
    const config = DOMAIN_CONSOLIDATION[domain];
    const now = Date.now();
    const buffer = this.hotBuffer.get(domain) || [];
    const domainMap = this.doc.getMap(`knowledge.${domain}`);

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
    // Defense-in-depth: even if compilers escape correctly, malicious content should
    // not reach cold store. Detects code-like patterns that indicate injection attempts.
    const sanitized: HotBufferEntry[] = [];
    for (const entry of eligible) {
      if (containsInjectionPattern(entry.content)) {
        dropped++; // Injection pattern detected — drop silently
      } else {
        sanitized.push(entry);
      }
    }

    // Phase 2 & 3: CLUSTER + MERGE — deduplicate sanitized entries by content similarity
    const uniqueEntries: HotBufferEntry[] = [];
    for (const entry of sanitized) {
      const duplicate = uniqueEntries.find(
        (e) => e.content === entry.content && e.type === entry.type
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

    // Phase 4: DOWNSCALE — reduce all existing cold store excitability (synaptic homeostasis)
    if (domainMap) {
      const coldEntries = this.queryDomain(domain);
      for (const { id, entry } of coldEntries) {
        if (entry._excitability) {
          const meta: ExcitabilityMetadata = entry._excitability;
          meta.excitability = computeExcitability(meta) * config.downscaleFactor;
          meta.consolidationSurvivals++;
          entry._excitability = meta;
          domainMap.set(id, JSON.stringify(entry));
        }
      }
    }

    // Phase 5: PROMOTE — move surviving entries from hot buffer to cold store
    if (domainMap) {
      for (const entry of uniqueEntries) {
        const entryId = `${entry.type.charAt(0).toUpperCase()}.${domain.toUpperCase().slice(0, 3)}.${now}_${promoted}`;
        const excitability = defaultExcitability();
        excitability.corroborationCount = entry.corroborations.length;
        excitability.excitability = computeExcitability(excitability);

        const coldEntry = {
          content: entry.content,
          type: entry.type,
          authorDid: entry.authorDid,
          tags: entry.tags,
          timestamp: entry.ingestedAt,
          accessCount: 0,
          lastAccessed: 0,
          _excitability: excitability,
        };
        domainMap.set(entryId, JSON.stringify(coldEntry));
        promoted++;
      }
    }

    // Phase 6: PRUNE — engram competition if over capacity
    if (domainMap) {
      const allEntries = this.queryDomain(domain);
      if (allEntries.length > config.maxEntries) {
        // Sort by excitability (lowest first) — those get evicted
        const sorted = allEntries
          .map(({ id, entry }) => ({
            id,
            entry,
            score: this.getEntryExcitability(entry, config.competitionMetric),
          }))
          .sort((a, b) => a.score - b.score);

        const toEvict = sorted.slice(0, allEntries.length - config.maxEntries);
        for (const { id } of toEvict) {
          domainMap.delete(id);
          evicted++;
        }
      }
    }

    if (promoted > 0 || evicted > 0) {
      this.doc.commit();
    }

    // Replace hot buffer with entries that were too young
    this.hotBuffer.set(domain, tooYoung);
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
  public sleepCycle(force: boolean = false): ConsolidationResult[] {
    const now = Date.now();
    const results: ConsolidationResult[] = [];

    for (const domain of KNOWLEDGE_DOMAINS) {
      const config = DOMAIN_CONSOLIDATION[domain];
      const lastRun = this.lastConsolidation.get(domain) || 0;
      const elapsed = now - lastRun;

      if (force || elapsed >= config.sleepFrequencyMs) {
        results.push(this.consolidateDomain(domain));
      }
    }

    return results;
  }

  /**
   * Check if any domain needs a consolidation cycle.
   * Useful for daemon scheduling.
   */
  public needsConsolidation(): { domain: KnowledgeDomain; overdue: boolean; bufferSize: number }[] {
    const now = Date.now();
    return KNOWLEDGE_DOMAINS.map((domain) => {
      const config = DOMAIN_CONSOLIDATION[domain];
      const lastRun = this.lastConsolidation.get(domain) || 0;
      const elapsed = now - lastRun;
      const buffer = this.hotBuffer.get(domain) || [];
      return {
        domain,
        overdue: elapsed >= config.sleepFrequencyMs,
        bufferSize: buffer.length,
      };
    });
  }

  /**
   * Reconsolidation: retrieve knowledge with excitability strengthening.
   *
   * Unlike plain queryDomain, this implements the biological reconsolidation
   * principle: every retrieval is a read-modify-write cycle that strengthens
   * the retrieved entry and opens a reconsolidation window for updates.
   */
  public retrieveWithReconsolidation(
    domain: KnowledgeDomain,
    entryId: string
  ): { entry: any; reconsolidation: ReconsolidationEvent } | null {
    const domainMap = this.doc.getMap(`knowledge.${domain}`);
    if (!domainMap) return null;

    const raw = domainMap.get(entryId);
    if (!raw || typeof raw !== 'string') return null;

    try {
      const entry = JSON.parse(raw);
      const now = Date.now();

      // Initialize excitability if missing
      if (!entry._excitability) {
        entry._excitability = defaultExcitability();
      }

      const meta: ExcitabilityMetadata = entry._excitability;

      // Retrieval practice effect: strengthen on access
      meta.queryCount++;
      meta.lastRetrievedAt = now;
      meta.excitability = computeExcitability(meta);

      // Also update the V7 liveness fields
      entry.accessCount = (entry.accessCount || 0) + 1;
      entry.lastAccessed = now;

      // Write back (retrieval IS a write operation)
      entry._excitability = meta;
      domainMap.set(entryId, JSON.stringify(entry));
      this.doc.commit();

      // Open reconsolidation window
      const reconEvent: ReconsolidationEvent = {
        entryId,
        domain,
        retrievedAt: now,
        excitabilityDelta: 2, // +2 per retrieval (queryCount weight)
        windowOpen: true,
        windowClosesAt: now + RECONSOLIDATION_WINDOW_MS,
      };
      this.reconsolidationWindows.set(entryId, reconEvent);

      return { entry, reconsolidation: reconEvent };
    } catch {
      return null;
    }
  }

  /**
   * Update an entry during its reconsolidation window.
   * Returns false if the window is closed or entry not found.
   */
  public reconsolidateEntry(
    domain: KnowledgeDomain,
    entryId: string,
    updatedContent: string
  ): boolean {
    const window = this.reconsolidationWindows.get(entryId);
    if (!window || !window.windowOpen || Date.now() > window.windowClosesAt) {
      return false;
    }

    const domainMap = this.doc.getMap(`knowledge.${domain}`);
    if (!domainMap) return false;

    const raw = domainMap.get(entryId);
    if (!raw || typeof raw !== 'string') return false;

    try {
      const entry = JSON.parse(raw);
      entry.content = updatedContent;

      if (entry._excitability) {
        entry._excitability.lastReconsolidatedAt = Date.now();
      }

      domainMap.set(entryId, JSON.stringify(entry));
      this.doc.commit();

      // Close the window after reconsolidation
      window.windowOpen = false;
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Active forgetting: mark an entry as contradicted by peers.
   * If enough peers contradict (3+), the entry is pruned.
   * Maps to biological microglia-mediated synapse removal.
   */
  public contradictEntry(
    domain: KnowledgeDomain,
    entryId: string,
    contradictingPeerDid: string
  ): { contradicted: boolean; pruned: boolean } {
    const domainMap = this.doc.getMap(`knowledge.${domain}`);
    if (!domainMap) return { contradicted: false, pruned: false };

    const raw = domainMap.get(entryId);
    if (!raw || typeof raw !== 'string') return { contradicted: false, pruned: false };

    try {
      const entry = JSON.parse(raw);
      if (!entry._contradictions) entry._contradictions = [];

      if (!entry._contradictions.includes(contradictingPeerDid)) {
        entry._contradictions.push(contradictingPeerDid);
      }

      // 3+ peer contradictions → prune (microglia removal)
      if (entry._contradictions.length >= 3) {
        domainMap.delete(entryId);
        this.doc.commit();
        return { contradicted: true, pruned: true };
      }

      // Reduce excitability on contradiction
      if (entry._excitability) {
        entry._excitability.excitability = Math.max(0, entry._excitability.excitability - 5);
      }

      domainMap.set(entryId, JSON.stringify(entry));
      this.doc.commit();
      return { contradicted: true, pruned: false };
    } catch {
      return { contradicted: false, pruned: false };
    }
  }

  /**
   * Active forgetting: deprecate own entries (self-superseding).
   * Maps to biological Rac1-mediated synaptic decay.
   */
  public deprecateEntry(domain: KnowledgeDomain, entryId: string, reason: string): boolean {
    const domainMap = this.doc.getMap(`knowledge.${domain}`);
    if (!domainMap) return false;

    const raw = domainMap.get(entryId);
    if (!raw || typeof raw !== 'string') return false;

    try {
      const entry = JSON.parse(raw);
      entry._deprecated = true;
      entry._deprecatedAt = Date.now();
      entry._deprecationReason = reason;

      // Zero out excitability — will be pruned in next consolidation
      if (entry._excitability) {
        entry._excitability.excitability = 0;
      }

      domainMap.set(entryId, JSON.stringify(entry));
      this.doc.commit();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the consolidation configuration for a domain.
   */
  public getDomainConfig(domain: KnowledgeDomain): DomainConsolidationConfig {
    return { ...DOMAIN_CONSOLIDATION[domain] };
  }

  /**
   * Get excitability score for an entry based on domain competition metric.
   * Used internally during engram competition (Phase 6 of consolidation).
   */
  private getEntryExcitability(
    entry: any,
    metric: DomainConsolidationConfig['competitionMetric']
  ): number {
    const meta: ExcitabilityMetadata = entry._excitability || defaultExcitability();
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

  /** Get the underlying LoroDoc (for advanced operations) */
  public getDoc(): LoroDoc {
    return this.doc;
  }
}
