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
import type {
  PeerStoreEntry,
  GossipDeltaRequest,
  GossipDeltaResponse,
  GossipHealthMetadata,
} from './types.js';
import { resolveReputationTier, getTierWeight } from './types.js';
import { signGossipPayload, verifyGossipSignature } from './wallet-auth.js';
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
  /** V6: Track when this discovery instance was created (for uptime calculation) */
  private readonly startedAt: number = Date.now();
  /** V6: Track gossip failures this session */
  private sessionFailureCount = 0;
  /** V6: Track contributions this session */
  private sessionContributionCount = 0;
  /** V6: Received health from peers (keyed by DID) */
  private peerHealthCache: Map<string, GossipHealthMetadata> = new Map();

  constructor(
    public localAgentDid: string,
    public localMcpUrl: string,
    private worldState?: HoloMeshWorldState,
    options?: HoloMeshDiscoveryOptions
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
        console.warn(
          `[HoloMesh] Peer ${card.id} failed Proof-of-Play constraint. Dropping connection.`
        );
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
      const [ax, ay, az, bx, by, bz] = Array.from({ length: 6 }, () => Math.random() * 2 - 1);
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
        console.warn(
          `[HoloMesh] PoP Failed! Deviation: ${Math.abs(result.value - expected)}, RTT: ${duration}ms`
        );
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
        this.peerHealthCache.delete(did); // FW-0.6: Hardened unbounded cache growth
        removed.push(did);
      }
    }
    
    // Also prune health cache for any peers that were already removed from this.peers
    for (const did of this.peerHealthCache.keys()) {
      if (!this.peers.has(did)) {
        this.peerHealthCache.delete(did);
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
    this.sessionFailureCount++;
  }

  /** V6: Increment contribution count for health metadata */
  public recordContribution(): void {
    this.sessionContributionCount++;
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
    peers: Array<{ did: string; url: string; name: string; walletAddress?: string }>,
    _sourceDid: string
  ): number {
    let added = 0;
    for (const p of peers) {
      if (p.did === this.localAgentDid) continue;
      if (this.peers.has(p.did)) {
        // V4: Update wallet address if newly provided
        if (p.walletAddress) {
          const existing = this.peers.get(p.did)!;
          existing.walletAddress = p.walletAddress;
        }
        continue;
      }

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
        walletAddress: p.walletAddress,
      });
      added++;
    }
    if (added > 0) this.savePeerStore();
    return added;
  }

  // ── V2/V10: Weighted Peer Selection ──────────────────────────────────────

  /**
   * Pick peers for a gossip round using health-weighted selection.
   *
   * V10 Game Theory fix: Fisher-Yates ignored all 4 available signals
   * (peerHealthCache, lastSyncAt, reputation, failureCount). Now uses
   * weighted random selection based on peer quality scores.
   *
   * Weight formula:
   *   base=1 + reputationBonus(0-3) + uptimeBonus(0-2) + freshnessBonus(0-2)
   *   - failurePenalty(failureCount * 2)
   *   Minimum weight: 0.1 (everyone gets a small chance)
   */
  public selectGossipTargets(count: number = MAX_GOSSIP_TARGETS): PeerStoreEntry[] {
    const eligible = Array.from(this.peers.values()).filter(
      (p) => p.failureCount < MAX_FAILURE_COUNT
    );
    if (eligible.length === 0) return [];
    if (eligible.length <= count) return eligible;

    // Compute weights for each peer
    const weighted = eligible.map((peer) => ({
      peer,
      weight: this.computePeerWeight(peer),
    }));

    // Weighted random selection without replacement
    const selected: PeerStoreEntry[] = [];
    const pool = [...weighted];

    for (let i = 0; i < count && pool.length > 0; i++) {
      const totalWeight = pool.reduce((sum, w) => sum + w.weight, 0);
      let r = Math.random() * totalWeight;
      let idx = 0;
      for (idx = 0; idx < pool.length - 1; idx++) {
        r -= pool[idx].weight;
        if (r <= 0) break;
      }
      selected.push(pool[idx].peer);
      pool.splice(idx, 1);
    }

    return selected;
  }

  /**
   * Compute gossip priority weight for a peer.
   * Higher weight = more likely to be selected as gossip target.
   * Uses all 4 signals that were previously ignored.
   */
  public computePeerWeight(peer: PeerStoreEntry): number {
    let weight = 1.0; // Base weight

    // Signal 1: Reputation (from peer store) — V11: tier-weighted gossip priority
    if (peer.reputation > 0) {
      const tier = resolveReputationTier(peer.reputation);
      const tierW = getTierWeight(tier);
      weight += Math.min(peer.reputation / 30, 3) * tierW.gossipPriority;
    }

    // Signal 2: Peer health cache (uptime, contributions)
    const health = this.peerHealthCache.get(peer.did);
    if (health) {
      // Uptime bonus: longer-running peers are more reliable
      if (health.uptimeSeconds > 300) weight += 1; // >5 min
      if (health.uptimeSeconds > 3600) weight += 1; // >1 hour (total +2)

      // Contribution bonus: peers that contribute are better gossip partners
      if (health.contributionsThisSession > 0) weight += 1;

      // High failure rate penalty from health report
      weight -= Math.min(health.failureCount * 0.5, 2);
    }

    // Signal 3: Freshness (lastSyncAt)
    if (peer.lastSyncAt) {
      const sinceSyncMs = Date.now() - new Date(peer.lastSyncAt).getTime();
      // Stale peers get priority (they have more new data to share)
      if (sinceSyncMs > 2 * 60 * 1000) weight += 1; // >2 min since sync
      if (sinceSyncMs > 5 * 60 * 1000) weight += 1; // >5 min (total +2)
    } else {
      // Never synced = high priority
      weight += 2;
    }

    // Signal 4: Local failure count (direct observation)
    weight -= peer.failureCount * 2;

    // Floor: everyone gets at least a small chance
    return Math.max(weight, 0.1);
  }

  // ── V2: CRDT Delta Exchange ──────────────────────────────────────────────

  /** Perform a gossip sync round with a single peer */
  public async gossipSync(
    peer: PeerStoreEntry,
    walletClient?: { signMessage: (args: { message: string }) => Promise<string> },
    walletAddress?: string
  ): Promise<boolean> {
    if (!this.worldState) return false;

    // V6: Memory Backpressure Check (borrowed from CompilerStateMonitor)
    // Prevent OOM crashes during large CRDT state synchronizations
    const memUsage = process.memoryUsage();
    const ramUtilization = memUsage.heapUsed / memUsage.heapTotal;
    if (ramUtilization > 0.7) {
      console.warn(
        `[HoloMesh] Memory backpressure active (RAM at ${(ramUtilization * 100).toFixed(1)}%). Skipping gossip sync with ${peer.did}.`
      );
      return false;
    }

    try {
      // Export delta (full if no known frontiers for this peer)
      const delta = peer.lastKnownFrontiers
        ? this.worldState.exportDelta(peer.lastKnownFrontiers)
        : this.worldState.exportDelta();

      // V6: Payload Size Backpressure
      // Hard limit at 50MB to prevent Base64/JSON.stringify from blowing up V8 heap limits
      if (delta.length > 50 * 1024 * 1024) {
        console.warn(
          `[HoloMesh] Gossip payload exceeds 50MB safety limit (${(delta.length / 1024 / 1024).toFixed(2)}MB). Skipping sync with ${peer.did} to prevent memory spike.`
        );
        // Note: we return false and record no failure, as this is local backpressure
        return false;
      }

      const deltaBase64 = Buffer.from(delta).toString('base64');
      const timestamp = new Date().toISOString();

      const request: GossipDeltaRequest = {
        senderDid: this.localAgentDid,
        senderUrl: this.localMcpUrl,
        senderName: 'holomesh-agent',
        deltaBase64,
        frontiers: this.worldState.getFrontiers(),
        knownPeers: this.getPeersToShare(peer.did),
        timestamp,
        senderHealth: this.buildHealthMetadata(),
      };

      // V4: Sign gossip payload when wallet is available
      if (walletClient && walletAddress) {
        try {
          request.signature = await signGossipPayload(walletClient, deltaBase64, timestamp);
          request.senderWalletAddress = walletAddress;
        } catch {
          // Signing failed — send unsigned (V2 compat)
        }
      }

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

      // Import the peer's delta back — route through hot buffer for V9 consolidation
      if (result.deltaBase64) {
        const peerDelta = Buffer.from(result.deltaBase64, 'base64');
        this.worldState.importDeltaToHotBuffer(new Uint8Array(peerDelta), peer.did);
      }

      // Update peer's known frontiers
      if (result.frontiers) {
        peer.lastKnownFrontiers = result.frontiers;
      }

      // Absorb gossiped peers
      if (result.knownPeers) {
        this.absorbGossipedPeers(result.knownPeers, peer.did);
      }

      // V6: Cache responder's health metadata
      if (result.responderHealth) {
        this.absorbPeerHealth(peer.did, result.responderHealth);
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

  // ── V4: Gossip Signature Verification ───────────────────────────────────

  /** Verify the wallet signature on an inbound gossip request. */
  public async verifyGossipSender(
    request: GossipDeltaRequest
  ): Promise<'verified' | 'unsigned' | 'invalid'> {
    if (!request.signature || !request.senderWalletAddress) return 'unsigned';
    const valid = await verifyGossipSignature(
      request.senderWalletAddress,
      request.deltaBase64,
      request.timestamp,
      request.signature
    );
    return valid ? 'verified' : 'invalid';
  }

  // ── V6: Gossip Health Side-Channel ─────────────────────────────────────

  /** Build health metadata to piggyback on outbound gossip */
  public buildHealthMetadata(): GossipHealthMetadata {
    return {
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
      failureCount: this.sessionFailureCount,
      peerCount: this.peers.size,
      reputationScore: 0, // Caller can override via setLocalReputation
      contributionsThisSession: this.sessionContributionCount,
    };
  }

  /** Store health metadata received from a peer */
  public absorbPeerHealth(peerDid: string, health: GossipHealthMetadata): void {
    this.peerHealthCache.set(peerDid, health);
  }

  /** Get cached health metadata for a peer */
  public getPeerHealth(peerDid: string): GossipHealthMetadata | undefined {
    return this.peerHealthCache.get(peerDid);
  }

  /** Get health metadata for all peers that have reported */
  public getAllPeerHealth(): Map<string, GossipHealthMetadata> {
    return new Map(this.peerHealthCache);
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
