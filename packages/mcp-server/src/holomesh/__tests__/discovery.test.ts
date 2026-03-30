/**
 * Tests for HoloMeshDiscovery (V2 P2P gossip)
 *
 * Validates bootstrap, health tracking, peer gossip,
 * target selection, gossip sync, and persistence.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fs
vi.mock('fs', () => ({
  existsSync: vi.fn(() => false),
  readFileSync: vi.fn(() => '[]'),
  writeFileSync: vi.fn(),
}));

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock process.memoryUsage to avoid backpressure check failing in tight heaps
const originalMemoryUsage = process.memoryUsage.bind(process);
vi.spyOn(process, 'memoryUsage').mockImplementation(() => ({
  ...originalMemoryUsage(),
  heapUsed: 100 * 1024 * 1024,
  heapTotal: 512 * 1024 * 1024,
}));

// Mock worldState
const mockWorldState = {
  mergeNeighborState: vi.fn(),
  exportDelta: vi.fn(() => new Uint8Array([1, 2, 3])),
  importDelta: vi.fn(),
  importDeltaToHotBuffer: vi.fn(),
  getFrontiers: vi.fn(() => [{ peer: '1', counter: 5 }]),
};

import { HoloMeshDiscovery } from '../discovery';
import * as fs from 'fs';
import type { PeerStoreEntry } from '../types';

function makePeer(overrides: Partial<PeerStoreEntry> = {}): PeerStoreEntry {
  return {
    did: 'peer-1',
    mcpBaseUrl: 'https://peer1.example',
    name: 'Peer1',
    traits: [],
    reputation: 0,
    lastSeen: new Date().toISOString(),
    lastSyncAt: null,
    lastKnownFrontiers: null,
    source: 'orchestrator',
    failureCount: 0,
    ...overrides,
  };
}

describe('HoloMeshDiscovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
    // Restore mock implementations cleared by clearAllMocks
    mockWorldState.exportDelta.mockImplementation(() => new Uint8Array([1, 2, 3]));
    mockWorldState.getFrontiers.mockImplementation(() => [{ peer: '1', counter: 5 }]);
  });

  describe('constructor', () => {
    it('loads peer store from disk if path provided', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify([makePeer()]) as any);
      const d = new HoloMeshDiscovery('local-did', 'https://local', undefined, {
        storePath: '/tmp/peers.json',
      });
      expect(d.getPeerCount()).toBe(1);
    });

    it('starts with empty peers if no store', () => {
      const d = new HoloMeshDiscovery('local-did', 'https://local');
      expect(d.getPeerCount()).toBe(0);
    });
  });

  describe('bootstrapFromOrchestrator', () => {
    it('adds peers from orchestrator with source=orchestrator', async () => {
      const mockClient = {
        discoverPeers: vi.fn().mockResolvedValue([
          {
            id: 'peer-1',
            did: 'peer-1',
            name: 'P1',
            mcpEndpoint: 'https://p1',
            traits: ['@research'],
            reputation: 10,
          },
          {
            id: 'peer-2',
            did: 'peer-2',
            name: 'P2',
            mcpEndpoint: 'https://p2',
            traits: [],
            reputation: 0,
          },
        ]),
      };
      const d = new HoloMeshDiscovery('local-did', 'https://local');
      const added = await d.bootstrapFromOrchestrator(mockClient as any);
      expect(added).toBe(2);
      expect(d.getPeerCount()).toBe(2);
      expect(d.getPeer('peer-1')?.source).toBe('orchestrator');
    });

    it('skips self DID', async () => {
      const mockClient = {
        discoverPeers: vi
          .fn()
          .mockResolvedValue([
            {
              id: 'local-did',
              did: 'local-did',
              name: 'Self',
              mcpEndpoint: 'https://self',
              traits: [],
              reputation: 0,
            },
          ]),
      };
      const d = new HoloMeshDiscovery('local-did', 'https://local');
      const added = await d.bootstrapFromOrchestrator(mockClient as any);
      expect(added).toBe(0);
    });

    it('skips peers without mcpEndpoint', async () => {
      const mockClient = {
        discoverPeers: vi
          .fn()
          .mockResolvedValue([
            { id: 'peer-1', did: 'peer-1', name: 'P1', traits: [], reputation: 0 },
          ]),
      };
      const d = new HoloMeshDiscovery('local-did', 'https://local');
      const added = await d.bootstrapFromOrchestrator(mockClient as any);
      expect(added).toBe(0);
    });

    it('does not duplicate existing peers', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify([makePeer({ did: 'peer-1' })]) as any
      );
      const d = new HoloMeshDiscovery('local-did', 'https://local', undefined, {
        storePath: '/tmp/peers.json',
      });

      const mockClient = {
        discoverPeers: vi
          .fn()
          .mockResolvedValue([
            {
              id: 'peer-1',
              did: 'peer-1',
              name: 'P1',
              mcpEndpoint: 'https://p1',
              traits: [],
              reputation: 0,
            },
          ]),
      };
      const added = await d.bootstrapFromOrchestrator(mockClient as any);
      expect(added).toBe(0);
      expect(d.getPeerCount()).toBe(1);
    });
  });

  describe('pruneStale', () => {
    it('removes peers not seen in >5 minutes', () => {
      const staleTime = new Date(Date.now() - 6 * 60 * 1000).toISOString();
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify([makePeer({ did: 'stale', lastSeen: staleTime })]) as any
      );
      const d = new HoloMeshDiscovery('local-did', 'https://local', undefined, {
        storePath: '/tmp/p.json',
      });

      const removed = d.pruneStale();
      expect(removed).toContain('stale');
      expect(d.getPeerCount()).toBe(0);
    });

    it('removes peers with >=3 failures', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify([makePeer({ did: 'failing', failureCount: 3 })]) as any
      );
      const d = new HoloMeshDiscovery('local-did', 'https://local', undefined, {
        storePath: '/tmp/p.json',
      });

      const removed = d.pruneStale();
      expect(removed).toContain('failing');
    });

    it('saves peer store after pruning', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify([makePeer({ did: 'stale', lastSeen: new Date(0).toISOString() })]) as any
      );
      const d = new HoloMeshDiscovery('local-did', 'https://local', undefined, {
        storePath: '/tmp/p.json',
      });
      vi.mocked(fs.writeFileSync).mockClear();

      d.pruneStale();
      expect(fs.writeFileSync).toHaveBeenCalled();
    });
  });

  describe('peer gossip', () => {
    it('getPeersToShare excludes specified DID', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify([makePeer({ did: 'p1' }), makePeer({ did: 'p2' })]) as any
      );
      const d = new HoloMeshDiscovery('local-did', 'https://local', undefined, {
        storePath: '/tmp/p.json',
      });

      const shared = d.getPeersToShare('p1');
      expect(shared.every((p) => p.did !== 'p1')).toBe(true);
    });

    it('getPeersToShare limits to MAX_PEERS_TO_SHARE', () => {
      const manyPeers = Array.from({ length: 10 }, (_, i) => makePeer({ did: `p${i}` }));
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(manyPeers) as any);
      const d = new HoloMeshDiscovery('local-did', 'https://local', undefined, {
        storePath: '/tmp/p.json',
      });

      const shared = d.getPeersToShare();
      expect(shared.length).toBeLessThanOrEqual(5);
    });

    it('absorbGossipedPeers adds new peers with source=gossip', () => {
      const d = new HoloMeshDiscovery('local-did', 'https://local');
      const added = d.absorbGossipedPeers(
        [{ did: 'new-peer', url: 'https://new', name: 'New' }],
        'some-source'
      );
      expect(added).toBe(1);
      expect(d.getPeer('new-peer')?.source).toBe('gossip');
    });

    it('absorbGossipedPeers skips self', () => {
      const d = new HoloMeshDiscovery('local-did', 'https://local');
      const added = d.absorbGossipedPeers(
        [{ did: 'local-did', url: 'https://local', name: 'Self' }],
        'source'
      );
      expect(added).toBe(0);
    });

    it('absorbGossipedPeers skips already-known peers', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify([makePeer({ did: 'existing' })]) as any
      );
      const d = new HoloMeshDiscovery('local-did', 'https://local', undefined, {
        storePath: '/tmp/p.json',
      });

      const added = d.absorbGossipedPeers(
        [{ did: 'existing', url: 'https://e', name: 'E' }],
        'source'
      );
      expect(added).toBe(0);
    });
  });

  describe('selectGossipTargets', () => {
    it('returns subset of eligible peers', () => {
      const peers = Array.from({ length: 5 }, (_, i) =>
        makePeer({ did: `p${i}`, mcpBaseUrl: `https://p${i}` })
      );
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(peers) as any);
      const d = new HoloMeshDiscovery('local-did', 'https://local', undefined, {
        storePath: '/tmp/p.json',
      });

      const targets = d.selectGossipTargets(2);
      expect(targets.length).toBe(2);
    });

    it('excludes peers with >=3 failures', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify([
          makePeer({ did: 'good', failureCount: 0 }),
          makePeer({ did: 'bad', failureCount: 3 }),
        ]) as any
      );
      const d = new HoloMeshDiscovery('local-did', 'https://local', undefined, {
        storePath: '/tmp/p.json',
      });

      const targets = d.selectGossipTargets(10);
      expect(targets.every((t) => t.did !== 'bad')).toBe(true);
    });

    it('returns empty array when no peers', () => {
      const d = new HoloMeshDiscovery('local-did', 'https://local');
      expect(d.selectGossipTargets()).toEqual([]);
    });

    it('returns all peers when count >= eligible', () => {
      const peers = [makePeer({ did: 'p1' }), makePeer({ did: 'p2' })];
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(peers) as any);
      const d = new HoloMeshDiscovery('local-did', 'https://local', undefined, {
        storePath: '/tmp/p.json',
      });

      const targets = d.selectGossipTargets(5);
      expect(targets.length).toBe(2);
    });
  });

  describe('computePeerWeight (V10 game theory)', () => {
    it('gives base weight of 1.0 for unknown peer', () => {
      const d = new HoloMeshDiscovery('local-did', 'https://local');
      const peer = makePeer({ did: 'p1', reputation: 0, failureCount: 0, lastSyncAt: null });
      // base=1 + neverSynced=2 = 3
      expect(d.computePeerWeight(peer)).toBe(3);
    });

    it('adds reputation bonus capped at 3', () => {
      const d = new HoloMeshDiscovery('local-did', 'https://local');
      // reputation=90 => min(90/30, 3) = 3
      const peer = makePeer({ did: 'p1', reputation: 90, lastSyncAt: new Date().toISOString() });
      const weight = d.computePeerWeight(peer);
      expect(weight).toBeGreaterThanOrEqual(4); // base + rep bonus
    });

    it('penalizes peers with failures', () => {
      const d = new HoloMeshDiscovery('local-did', 'https://local');
      const good = makePeer({ did: 'good', failureCount: 0, lastSyncAt: new Date().toISOString() });
      const bad = makePeer({ did: 'bad', failureCount: 2, lastSyncAt: new Date().toISOString() });
      expect(d.computePeerWeight(good)).toBeGreaterThan(d.computePeerWeight(bad));
    });

    it('boosts never-synced peers (they have new data)', () => {
      const d = new HoloMeshDiscovery('local-did', 'https://local');
      const neverSynced = makePeer({ did: 'new', lastSyncAt: null });
      const recentlySynced = makePeer({ did: 'recent', lastSyncAt: new Date().toISOString() });
      expect(d.computePeerWeight(neverSynced)).toBeGreaterThan(d.computePeerWeight(recentlySynced));
    });

    it('boosts stale-synced peers over recently-synced', () => {
      const d = new HoloMeshDiscovery('local-did', 'https://local');
      const stale = makePeer({
        did: 'stale',
        lastSyncAt: new Date(Date.now() - 6 * 60 * 1000).toISOString(),
      });
      const fresh = makePeer({ did: 'fresh', lastSyncAt: new Date().toISOString() });
      expect(d.computePeerWeight(stale)).toBeGreaterThan(d.computePeerWeight(fresh));
    });

    it('uses peer health cache when available', () => {
      const d = new HoloMeshDiscovery('local-did', 'https://local');
      const peer = makePeer({ did: 'healthy', lastSyncAt: new Date().toISOString() });

      // Without health data
      const weightBefore = d.computePeerWeight(peer);

      // Add health data: long uptime + contributions
      d.absorbPeerHealth('healthy', {
        uptimeSeconds: 7200,
        failureCount: 0,
        peerCount: 5,
        reputationScore: 50,
        contributionsThisSession: 10,
      });

      const weightAfter = d.computePeerWeight(peer);
      // Should be higher: +2 uptime + 1 contribution = +3
      expect(weightAfter).toBeGreaterThan(weightBefore);
    });

    it('floors weight at 0.1 (everyone gets a chance)', () => {
      const d = new HoloMeshDiscovery('local-did', 'https://local');
      // 2 failures = -4 penalty, recently synced = 0 freshness bonus
      const badPeer = makePeer({
        did: 'bad',
        failureCount: 2,
        reputation: 0,
        lastSyncAt: new Date().toISOString(),
      });
      expect(d.computePeerWeight(badPeer)).toBe(0.1);
    });
  });

  describe('gossipSync', () => {
    it('sends delta to peer and imports response', async () => {
      const d = new HoloMeshDiscovery('local-did', 'https://local', mockWorldState as any);
      const peer = makePeer({ did: 'peer-1', mcpBaseUrl: 'https://peer1' });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          deltaBase64: Buffer.from([4, 5, 6]).toString('base64'),
          frontiers: [{ peer: '2', counter: 10 }],
          knownPeers: [],
        }),
      });

      const result = await d.gossipSync(peer);
      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://peer1/.well-known/crdt-gossip',
        expect.objectContaining({ method: 'POST' })
      );
      expect(mockWorldState.importDeltaToHotBuffer).toHaveBeenCalled();
    });

    it('records failure on HTTP error', async () => {
      // Load the peer into the internal store so recordFailure can find it
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify([makePeer({ did: 'peer-1', mcpBaseUrl: 'https://peer1' })]) as any
      );
      const d = new HoloMeshDiscovery('local-did', 'https://local', mockWorldState as any, {
        storePath: '/tmp/p.json',
      });
      const peer = d.getPeer('peer-1')!;

      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

      const result = await d.gossipSync(peer);
      expect(result).toBe(false);
      // Peer should have failure recorded in the internal store
      expect(d.getPeer('peer-1')?.failureCount).toBe(1);
    });

    it('records failure on network error', async () => {
      const d = new HoloMeshDiscovery('local-did', 'https://local', mockWorldState as any);
      const peer = makePeer({ did: 'peer-1', mcpBaseUrl: 'https://peer1' });

      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await d.gossipSync(peer);
      expect(result).toBe(false);
    });

    it('absorbs gossiped peers from response', async () => {
      const d = new HoloMeshDiscovery('local-did', 'https://local', mockWorldState as any);
      const peer = makePeer({ did: 'peer-1', mcpBaseUrl: 'https://peer1' });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          deltaBase64: Buffer.from([1]).toString('base64'),
          frontiers: [],
          knownPeers: [{ did: 'new-peer', url: 'https://new', name: 'New' }],
        }),
      });

      await d.gossipSync(peer);
      expect(d.getPeer('new-peer')).toBeDefined();
    });

    it('returns false when no worldState', async () => {
      const d = new HoloMeshDiscovery('local-did', 'https://local');
      const peer = makePeer();
      expect(await d.gossipSync(peer)).toBe(false);
    });
  });

  describe('persistence', () => {
    it('handles corrupted store file gracefully', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('NOT VALID JSON' as any);
      const d = new HoloMeshDiscovery('local-did', 'https://local', undefined, {
        storePath: '/tmp/p.json',
      });
      expect(d.getPeerCount()).toBe(0);
    });
  });

  describe('getKnownPeers (V1 compat)', () => {
    it('returns SpatialGossipNode[] format', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify([makePeer()]) as any);
      const d = new HoloMeshDiscovery('local-did', 'https://local', undefined, {
        storePath: '/tmp/p.json',
      });

      const peers = d.getKnownPeers();
      expect(peers[0]).toHaveProperty('did');
      expect(peers[0]).toHaveProperty('mcp_base_url');
      expect(peers[0]).toHaveProperty('crdt_vector_clock');
      expect(peers[0]).toHaveProperty('last_seen');
    });
  });
});
