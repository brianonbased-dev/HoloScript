/**
 * HoloMesh CRDT WorldState (V2)
 *
 * Replaces Soul.md & Moltbook JSON Feeds with Loro CRDT Active Synchronization.
 * V2 adds multi-domain knowledge maps, reputation tracking, peer registry,
 * version-aware delta export, and persistent binary snapshots.
 *
 * Document structure (single LoroDoc, single version vector):
 *   holomesh (LoroMap)
 *     insights (LoroList)              — V1 backwards compat
 *     knowledge.security (LoroMap)     — domain-partitioned W/P/G
 *     knowledge.rendering (LoroMap)
 *     knowledge.agents (LoroMap)
 *     knowledge.compilation (LoroMap)
 *     knowledge.general (LoroMap)
 *     reputation (LoroMap)             — agentDid → JSON reputation data
 *     peers (LoroMap)                  — peerDid → JSON { url, name, lastSeen }
 */
import { LoroDoc } from 'loro-crdt';
import * as fs from 'fs';
import * as path from 'path';
import { KNOWLEDGE_DOMAINS, type KnowledgeDomain } from './types';

export interface HoloMeshWorldStateOptions {
  snapshotPath?: string;
}

export class HoloMeshWorldState {
  private doc: LoroDoc;
  private snapshotPath: string | null;

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
    const list = this.doc.getList('insights') as any;
    if (!list) return [];
    const feed = list.toJSON();
    return (feed as any[])
      .sort((a: any, b: any) => b.timestamp - a.timestamp)
      .map((item: any) => ({
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
    const entries = this.queryDomain(domain as any);
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
    return Object.entries(raw).map(([id, json]) => ({
      id,
      entry: typeof json === 'string' ? JSON.parse(json) : json,
    }));
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
      console.log(`[HoloMesh] Pruned ${pruned} dead knowledge entries across domains.`);
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

    const age = Date.now() - (raw.updatedAt || 0);
    const decayFactor = Math.pow(2, -age / halfLifeMs);
    const rawScore = typeof raw.score === 'number' ? raw.score : 0;
    const decayedScore = Math.round(rawScore * decayFactor * 100) / 100;
    const needsReeval = decayFactor < HoloMeshWorldState.REEVAL_DECAY_THRESHOLD;

    return { raw, decayedScore, decayFactor, needsReeval };
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
      return this.doc.export({ mode: 'update', from: sinceFrontiers as any });
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

  /** Get the underlying LoroDoc (for advanced operations) */
  public getDoc(): LoroDoc {
    return this.doc;
  }
}
