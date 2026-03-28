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
  // Loro's TS types don't expose getOrInsertList/getMap/getList on LoroMap —
  // these methods exist at runtime (loro-crdt@1.x). Cast to any for access.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private meshMap: any;
  private snapshotPath: string | null;

  constructor(
    public agentDid: string,
    options?: HoloMeshWorldStateOptions,
  ) {
    this.doc = new LoroDoc();
    this.snapshotPath = options?.snapshotPath || null;

    // Deterministic BigInt peer ID from agentDid
    const hashPair = parseInt(agentDid.substring(0, 15), 36);
    this.doc.setPeerId(BigInt(hashPair));

    this.meshMap = this.doc.getMap('holomesh') as any;

    if (!this.meshMap.get('insights')) {
        this.meshMap.getOrCreateList('insights');
    } // V2: domain knowledge maps
    for (const domain of KNOWLEDGE_DOMAINS) {
      this.meshMap.getOrCreateMap(`knowledge.${domain}`);
    }
    this.meshMap.getOrCreateMap('reputation');
    this.meshMap.getOrCreateMap('peers');

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
  public publishInsight(content: string, traitTags: string[]): Uint8Array {
    const list = this.meshMap.getList('insights');
    if (list) {
      list.push({
        author: this.agentDid,
        text: content,
        tags: traitTags,
        timestamp: Date.now(),
      });
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

  /** Returns a flattened view of all insights currently active in the Mesh. */
  public queryFeedView(): any[] {
    const list = this.meshMap.getList('insights');
    if (!list) return [];
    const feed = list.getDeepValue();
    return (feed as any[]).sort((a, b) => b.timestamp - a.timestamp);
  }

  // ── V2: Knowledge Domain Methods ─────────────────────────────────────────

  /** Add a knowledge entry to a specific domain */
  public addKnowledgeEntry(
    domain: KnowledgeDomain,
    entryId: string,
    entry: { content: string; type: string; authorDid: string; tags: string[]; timestamp: number },
  ): void {
    const domainMap = this.meshMap.getMap(`knowledge.${domain}`);
    if (domainMap) {
      domainMap.set(entryId, JSON.stringify(entry));
      this.doc.commit();
    }
  }

  /** Query entries from a specific domain */
  public queryDomain(domain: KnowledgeDomain): Array<{ id: string; entry: any }> {
    const domainMap = this.meshMap.getMap(`knowledge.${domain}`);
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

  // ── V2: Reputation CRDT ──────────────────────────────────────────────────

  /** Update reputation for an agent (LWW via map overwrite) */
  public updateReputation(
    agentDid: string,
    data: { contributions: number; queries: number; score: number; tier: string },
  ): void {
    const repMap = this.meshMap.getMap('reputation');
    if (repMap) {
      repMap.set(agentDid, JSON.stringify({ ...data, updatedAt: Date.now() }));
      this.doc.commit();
    }
  }

  /** Get reputation for an agent */
  public getReputation(agentDid: string): any | null {
    const repMap = this.meshMap.getMap('reputation');
    if (!repMap) return null;
    const raw = repMap.get(agentDid);
    if (!raw || typeof raw !== 'string') return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  // ── V2: Peer Registry ────────────────────────────────────────────────────

  /** Register a peer in the CRDT (propagates to other peers via gossip) */
  public registerPeerInCRDT(
    peerDid: string,
    data: { url: string; name: string; traits?: string[] },
  ): void {
    const peerMap = this.meshMap.getMap('peers');
    if (peerMap) {
      peerMap.set(peerDid, JSON.stringify({ ...data, lastSeen: Date.now() }));
      this.doc.commit();
    }
  }

  /** Get all peers from the CRDT registry */
  public getCRDTPeers(): Array<{ did: string; url: string; name: string; lastSeen: number }> {
    const peerMap = this.meshMap.getMap('peers');
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
