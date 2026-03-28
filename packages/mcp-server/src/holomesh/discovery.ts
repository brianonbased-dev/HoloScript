/**
 * HoloMesh Discovery Layer (V2)
 *
 * Replaces Moltbook central REST endpoints with decentralized Agent-to-Agent (A2A) Gossip.
 * V2 adds persistent peer store, health tracking, orchestrator bootstrap, peer gossip
 * propagation, and CRDT delta exchange via HTTP POST.
 */
import { AgentCard } from '../a2a.js';
import { HoloMeshWorldState } from './crdt-sync.js';
import type { HoloMeshOrchestratorClient } from './orchestrator-client.js';
import type { PeerStoreEntry, GossipDeltaRequest, GossipDeltaResponse } from './types.js';
import * as fs from 'fs';

const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
const MAX_FAILURE_COUNT = 3;
const MAX_PEERS_TO_SHARE = 5;
const MAX_GOSSIP_TARGETS = 3;

// V1 backwards compat export
export interface SpatialGossipNode {
  did: string;
  mcp_base_url: string;
  crdt_vector_clock: number;
  last_seen: string;
}

export interface HoloMeshDiscoveryOptions {
  storePath?: string;
}

export class HoloMeshDiscovery {
  private peers: Map<string, PeerStoreEntry> = new Map();
  private storePath: string | null;

  constructor(
    public localAgentDid: string,
    public localMcpUrl: string,
    private worldState?: HoloMeshWorldState,
    options?: HoloMeshDiscoveryOptions,
  ) {
    this.storePath = options?.storePath || null;
    if (this.storePath) this.loadPeerStore();
  }

  // ── V1 Preserved Methods ─────────────────────────────────────────────────

  /**
   * P.SGM.01: Discover peers by fetching their A2A agent-card.json and exchanging CRDT vector clocks.
   */
  public async discoverPeer(peerUrl: string): Promise<boolean> {
    try {
      const response = await fetch(`${peerUrl}/.well-known/agent-card.json`);
      if (!response.ok) return false;

      const card: AgentCard = await response.json();

      // Attempt handshake by asserting Proof-of-Play capability
      const isSpatial = await this.verifyProofOfPlayCapability(peerUrl);
      if (!isSpatial) {
        console.warn(`[HoloMesh] Peer ${card.id} failed Proof-of-Play constraint. Dropping connection.`);
        return false;
      }

      // Automatically sync CRDT state from the remote peer's gossip payload
      if (this.worldState) {
        try {
          const crdtResponse = await fetch(`${peerUrl}/.well-known/crdt-state`);
          if (crdtResponse.ok) {
            const arrayBuffer = await crdtResponse.arrayBuffer();
            const stateUpdate = new Uint8Array(arrayBuffer);
            this.worldState.mergeNeighborState(stateUpdate);
          }
        } catch {
          // Peer hasn't exposed CRDT state yet — non-fatal
        }
      }

      // Store as PeerStoreEntry (V2 format)
      const existing = this.peers.get(card.id);
      this.peers.set(card.id, {
        did: card.id,
        mcpBaseUrl: peerUrl,
        name: card.name || card.id,
        traits: [],
        reputation: 0,
        lastSeen: new Date().toISOString(),
        lastSyncAt: existing?.lastSyncAt || null,
        lastKnownFrontiers: existing?.lastKnownFrontiers || null,
        source: existing?.source || 'direct',
        failureCount: 0,
      });

      this.savePeerStore();
      return true;
    } catch (e) {
      console.error(`[HoloMesh] Failed to discover peer ${peerUrl}:`, e);
      return false;
    }
  }

  /**
   * P.POP.01: Proof-of-Play Verification
   * Replaces Moltbook Math Challenges with 90fps compute capability test.
   */
  private async verifyProofOfPlayCapability(peerUrl: string): Promise<boolean> {
    try {
      const [ax, ay, az, bx, by, bz] = Array.from({ length: 6 }, () => (Math.random() * 2 - 1));
      const expected = ax * bx + ay * by + az * bz;

      const start = performance.now();
      const response = await fetch(`${peerUrl}/.well-known/pop-challenge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'dot', inputs: [ax, ay, az, bx, by, bz] }),
      });

      if (!response.ok) {
        // Grace period: dev mode if endpoint not implemented
        return true;
      }

      const result = await response.json();
      const duration = performance.now() - start;

      const passed = Math.abs(result.value - expected) < 0.001 && duration < 100;
      if (!passed) {
        console.warn(`[HoloMesh] PoP Failed! Deviation: ${Math.abs(result.value - expected)}, RTT: ${duration}ms`);
      }
      return passed;
    } catch {
      // Fallback to true during bring-up
      return true;
    }
  }

  /** V1 compat: get known peers as SpatialGossipNode[] */
  public getKnownPeers(): SpatialGossipNode[] {
    return Array.from(this.peers.values()).map((p) => ({
      did: p.did,
      mcp_base_url: p.mcpBaseUrl,
      crdt_vector_clock: new Date(p.lastSeen).getTime(),
      last_seen: p.lastSeen,
    }));
  }

  // ── V2: Bootstrap from Orchestrator ──────────────────────────────────────

  /** Seed peer list from V1 hub (orchestrator as bootstrap) */
  public async bootstrapFromOrchestrator(client: HoloMeshOrchestratorClient): Promise<number> {
    try {
      const peers = await client.discoverPeers();
      if (!peers || !Array.isArray(peers)) return 0;

      let added = 0;
      for (const peer of peers) {
        const did = peer.did || peer.id;
        const url = peer.mcpEndpoint;
        if (!did || !url || did === this.localAgentDid) continue;
        if (this.peers.has(did)) continue;

        this.peers.set(did, {
          did,
          mcpBaseUrl: url,
          name: peer.name || did,
          traits: peer.traits || [],
          reputation: peer.reputation || 0,
          lastSeen: new Date().toISOString(),
          lastSyncAt: null,
          lastKnownFrontiers: null,
          source: 'orchestrator',
          failureCount: 0,
        });
        added++;
      }

      if (added > 0) this.savePeerStore();
      return added;
    } catch {
      return 0;
    }
  }

  // ── V2: Health Tracking ──────────────────────────────────────────────────

  /** Remove peers not seen in >5 minutes or with too many failures */
  public pruneStale(): string[] {
    const now = Date.now();
    const removed: string[] = [];
    for (const [did, peer] of this.peers) {
      const lastSeen = new Date(peer.lastSeen).getTime();
      if (now - lastSeen > STALE_THRESHOLD_MS || peer.failureCount >= MAX_FAILURE_COUNT) {
        this.peers.delete(did);
        removed.push(did);
      }
    }
    if (removed.length > 0) this.savePeerStore();
    return removed;
  }

  /** Mark a peer as recently seen */
  public touchPeer(did: string): void {
    const peer = this.peers.get(did);
    if (peer) {
      peer.lastSeen = new Date().toISOString();
      peer.failureCount = 0;
    }
  }

  /** Increment failure counter for a peer */
  public recordFailure(did: string): void {
    const peer = this.peers.get(did);
    if (peer) peer.failureCount++;
  }

  // ── V2: Peer Gossip ─────────────────────────────────────────────────────

  /** Get a list of healthy peers to share with other peers */
  public getPeersToShare(excludeDid?: string): Array<{ did: string; url: string; name: string }> {
    return Array.from(this.peers.values())
      .filter((p) => p.did !== excludeDid && p.failureCount < 2)
      .slice(0, MAX_PEERS_TO_SHARE)
      .map((p) => ({ did: p.did, url: p.mcpBaseUrl, name: p.name }));
  }

  /** Absorb peers shared by another peer via gossip */
  public absorbGossipedPeers(
    peers: Array<{ did: string; url: string; name: string }>,
    _sourceDid: string,
  ): number {
    let added = 0;
    for (const p of peers) {
      if (p.did === this.localAgentDid) continue;
      if (this.peers.has(p.did)) continue;

      this.peers.set(p.did, {
        did: p.did,
        mcpBaseUrl: p.url,
        name: p.name,
        traits: [],
        reputation: 0,
        lastSeen: new Date().toISOString(),
        lastSyncAt: null,
        lastKnownFrontiers: null,
        source: 'gossip',
        failureCount: 0,
      });
      added++;
    }
    if (added > 0) this.savePeerStore();
    return added;
  }

  // ── V2: Random Peer Selection ────────────────────────────────────────────

  /** Pick random peers for a gossip round (Fisher-Yates shuffle) */
  public selectGossipTargets(count: number = MAX_GOSSIP_TARGETS): PeerStoreEntry[] {
    const eligible = Array.from(this.peers.values()).filter(
      (p) => p.failureCount < MAX_FAILURE_COUNT,
    );
    // Fisher-Yates shuffle
    for (let i = eligible.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [eligible[i], eligible[j]] = [eligible[j], eligible[i]];
    }
    return eligible.slice(0, count);
  }

  // ── V2: CRDT Delta Exchange ──────────────────────────────────────────────

  /** Perform a gossip sync round with a single peer */
  public async gossipSync(peer: PeerStoreEntry): Promise<boolean> {
    if (!this.worldState) return false;

    try {
      // Export delta (full if no known frontiers for this peer)
      const delta = peer.lastKnownFrontiers
        ? this.worldState.exportDelta(peer.lastKnownFrontiers)
        : this.worldState.exportDelta();

      const request: GossipDeltaRequest = {
        senderDid: this.localAgentDid,
        senderUrl: this.localMcpUrl,
        senderName: 'holomesh-agent',
        deltaBase64: Buffer.from(delta).toString('base64'),
        frontiers: this.worldState.getFrontiers(),
        knownPeers: this.getPeersToShare(peer.did),
        timestamp: new Date().toISOString(),
      };

      const response = await fetch(`${peer.mcpBaseUrl}/.well-known/crdt-gossip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        this.recordFailure(peer.did);
        return false;
      }

      const result: GossipDeltaResponse = await response.json();

      // Import the peer's delta back
      if (result.deltaBase64) {
        const peerDelta = Buffer.from(result.deltaBase64, 'base64');
        this.worldState.importDelta(new Uint8Array(peerDelta));
      }

      // Update peer's known frontiers
      if (result.frontiers) {
        peer.lastKnownFrontiers = result.frontiers;
      }

      // Absorb gossiped peers
      if (result.knownPeers) {
        this.absorbGossipedPeers(result.knownPeers, peer.did);
      }

      peer.lastSyncAt = new Date().toISOString();
      this.touchPeer(peer.did);
      this.savePeerStore();
      return true;
    } catch {
      this.recordFailure(peer.did);
      return false;
    }
  }

  // ── V2: Accessors ────────────────────────────────────────────────────────

  public getPeerCount(): number {
    return this.peers.size;
  }

  public getPeer(did: string): PeerStoreEntry | undefined {
    return this.peers.get(did);
  }

  public getAllPeers(): PeerStoreEntry[] {
    return Array.from(this.peers.values());
  }

  // ── V2: Persistence ──────────────────────────────────────────────────────

  private savePeerStore(): void {
    if (!this.storePath) return;
    try {
      const data = Array.from(this.peers.values());
      fs.writeFileSync(this.storePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch {
      // Non-fatal: peer store is convenience, not critical
    }
  }

  private loadPeerStore(): void {
    if (!this.storePath) return;
    try {
      if (!fs.existsSync(this.storePath)) return;
      const raw = JSON.parse(fs.readFileSync(this.storePath, 'utf-8'));
      if (Array.isArray(raw)) {
        for (const entry of raw) {
          if (entry.did) this.peers.set(entry.did, entry);
        }
      }
    } catch {
      // Corrupted store: start fresh
    }
  }
}
