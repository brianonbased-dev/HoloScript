/**
 * Tests for HoloMeshWorldState (V2 CRDT engine)
 *
 * Validates multi-domain knowledge, reputation, peer registry,
 * delta sync, persistence, and V1 backwards compatibility.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fs before importing the module
vi.mock('fs', () => ({
  existsSync: vi.fn(() => false),
  readFileSync: vi.fn(() => Buffer.from([])),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

// Mock loro-crdt with functional stubs
let mockListData: any[] = [];
const mockList = {
  push: vi.fn((item: any) => {
    mockListData.push(item);
  }),
  getDeepValue: vi.fn(() => mockListData),
  toJSON: vi.fn(() => [...mockListData]),
};
const mockMaps: Record<string, Record<string, string>> = {};
const mockMapInstances: Record<string, any> = {};

function createMockMap(name: string) {
  if (mockMapInstances[name]) return mockMapInstances[name];
  mockMaps[name] = {};
  const inst = {
    set: vi.fn((key: string, value: string) => {
      mockMaps[name][key] = value;
    }),
    get: vi.fn((key: string) => mockMaps[name][key] ?? undefined),
    toJSON: vi.fn(() => ({ ...mockMaps[name] })),
  };
  mockMapInstances[name] = inst;
  return inst;
}

let mockTextContent = '';
const mockText = {
  insert: vi.fn((pos: number, str: string) => {
    mockTextContent = mockTextContent.slice(0, pos) + str + mockTextContent.slice(pos);
  }),
  toString: vi.fn(() => mockTextContent),
  get length() {
    return mockTextContent.length;
  },
};

const mockDoc = {
  setPeerId: vi.fn(),
  getMap: vi.fn((name: string) => createMockMap(name)),
  getList: vi.fn(() => mockList),
  getText: vi.fn(() => mockText),
  commit: vi.fn(),
  export: vi.fn(() => new Uint8Array([1, 2, 3])),
  import: vi.fn(),
  frontiers: vi.fn(() => [{ peer: '123', counter: 5 }]),
  subscribe: vi.fn(() => ({ dispose: vi.fn() })),
};

vi.mock('loro-crdt', () => ({
  // W.011: use function(){} for constructors, not arrow functions
  LoroDoc: vi.fn(function () {
    return mockDoc;
  }),
}));

import { HoloMeshWorldState } from '../crdt-sync';
import * as fs from 'fs';

describe('HoloMeshWorldState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset map data
    for (const key of Object.keys(mockMaps)) delete mockMaps[key];
    for (const key of Object.keys(mockMapInstances)) delete mockMapInstances[key];
    // Reset list and text data
    mockListData = [];
    mockTextContent = '';
  });

  describe('constructor', () => {
    it('creates LoroDoc with deterministic peer ID from DID', () => {
      new HoloMeshWorldState('agent-did-12345');
      expect(mockDoc.setPeerId).toHaveBeenCalledWith(expect.any(BigInt));
    });

    it('initializes insights list and domain maps', () => {
      const ws = new HoloMeshWorldState('agent-did-12345');
      expect(ws).toBeDefined();
      // getMap is called for 'holomesh'
      expect(mockDoc.getMap).toHaveBeenCalledWith('holomesh');
    });

    it('attempts to load snapshot if path provided', () => {
      new HoloMeshWorldState('agent-did-12345', { snapshotPath: '/tmp/test.bin' });
      // loadSnapshot calls fs.existsSync
      expect(fs.existsSync).toHaveBeenCalledWith('/tmp/test.bin');
    });

    it('handles missing snapshot file gracefully', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const ws = new HoloMeshWorldState('agent-did-12345', { snapshotPath: '/tmp/missing.bin' });
      expect(ws).toBeDefined();
      // import should NOT have been called since file doesn't exist
    });
  });

  describe('publishInsight (V1 backwards compat)', () => {
    it('pushes to insights list and returns delta', () => {
      const ws = new HoloMeshWorldState('agent-did-12345');
      const delta = ws.publishInsight('Test insight', ['@research']);

      // V3 format: hs_source (HoloScript AST), author, timestamp
      expect(mockList.push).toHaveBeenCalledWith(
        expect.objectContaining({
          hs_source: expect.stringContaining('@thought("Test insight")'),
          author: 'agent-did-12345',
          timestamp: expect.any(Number),
        })
      );
      expect(mockDoc.commit).toHaveBeenCalled();
      expect(delta).toBeInstanceOf(Uint8Array);
    });

    it('uses custom code when provided', () => {
      const ws = new HoloMeshWorldState('agent-did-12345');
      const custom = 'CustomInsight("test") { @tag("hello") }';
      ws.publishInsight('ignored', [], custom);

      expect(mockList.push).toHaveBeenCalledWith(
        expect.objectContaining({
          hs_source: custom,
        })
      );
    });

    it('appends to V3 text feed', () => {
      const ws = new HoloMeshWorldState('agent-did-12345');
      ws.publishInsight('Feed test', ['@test']);
      expect(mockText.insert).toHaveBeenCalled();
    });
  });

  describe('mergeNeighborState (V1 backwards compat)', () => {
    it('imports state update into doc', () => {
      const ws = new HoloMeshWorldState('agent-did-12345');
      const update = new Uint8Array([10, 20, 30]);
      ws.mergeNeighborState(update);
      expect(mockDoc.import).toHaveBeenCalledWith(update);
    });

    it('handles import errors gracefully', () => {
      mockDoc.import.mockImplementationOnce(() => {
        throw new Error('corrupt');
      });
      const ws = new HoloMeshWorldState('agent-did-12345');
      expect(() => ws.mergeNeighborState(new Uint8Array([99]))).not.toThrow();
    });
  });

  describe('queryFeedView (V1 backwards compat)', () => {
    it('returns sorted insights newest first', () => {
      // V3: uses list.toJSON(), returns {source, timestamp}
      mockListData.push(
        { hs_source: 'Insight("old") {}', author: 'a', timestamp: 100 },
        { hs_source: 'Insight("new") {}', author: 'a', timestamp: 200 }
      );
      const ws = new HoloMeshWorldState('agent-did-12345');
      const feed = ws.queryFeedView();
      expect(feed[0].source).toBe('Insight("new") {}');
      expect(feed[1].source).toBe('Insight("old") {}');
      expect(feed[0].timestamp).toBe(200);
    });

    it('generates legacy source for old-format entries', () => {
      mockListData.push({ text: 'legacy content', author: 'agent-a', timestamp: 50 });
      const ws = new HoloMeshWorldState('agent-did-12345');
      const feed = ws.queryFeedView();
      expect(feed[0].source).toContain('Insight("legacy")');
      expect(feed[0].source).toContain('@author("agent-a")');
    });

    it('returns empty array when no insights', () => {
      const ws = new HoloMeshWorldState('agent-did-12345');
      expect(ws.queryFeedView()).toEqual([]);
    });
  });

  describe('knowledge domains', () => {
    it('addKnowledgeEntry stores in correct domain map', () => {
      const ws = new HoloMeshWorldState('agent-did-12345');
      ws.addKnowledgeEntry('security', 'W.SEC.01', {
        content: 'Defense in depth',
        type: 'wisdom',
        authorDid: 'agent-did-12345',
        tags: ['security'],
        timestamp: Date.now(),
      });
      expect(mockDoc.commit).toHaveBeenCalled();
    });

    it('queryDomain returns entries from specific domain', () => {
      const ws = new HoloMeshWorldState('agent-did-12345');
      // Manually set data in the mock map
      const entry = { content: 'Test', type: 'wisdom', authorDid: 'a', tags: [], timestamp: 1 };
      mockMaps['knowledge.rendering'] = { 'W.RENDER.01': JSON.stringify(entry) };

      const results = ws.queryDomain('rendering');
      expect(results.length).toBe(1);
      expect(results[0].id).toBe('W.RENDER.01');
      expect(results[0].entry.content).toBe('Test');
    });

    it('queryAllDomains aggregates across all domains', () => {
      const ws = new HoloMeshWorldState('agent-did-12345');
      const entry1 = { content: 'A', type: 'wisdom', authorDid: 'a', tags: [], timestamp: 1 };
      const entry2 = { content: 'B', type: 'pattern', authorDid: 'a', tags: [], timestamp: 2 };
      mockMaps['knowledge.security'] = { 'W.01': JSON.stringify(entry1) };
      mockMaps['knowledge.agents'] = { 'P.01': JSON.stringify(entry2) };

      const results = ws.queryAllDomains();
      expect(results.length).toBe(2);
      expect(results.some((r) => r.domain === 'security')).toBe(true);
      expect(results.some((r) => r.domain === 'agents')).toBe(true);
    });

    it('handles empty domains gracefully', () => {
      const ws = new HoloMeshWorldState('agent-did-12345');
      mockMaps['knowledge.compilation'] = {};
      const results = ws.queryDomain('compilation');
      expect(results).toEqual([]);
    });

    describe('V7 liveness tracking', () => {
      it('accessKnowledge increments accessCount and updates lastAccessed', () => {
        const ws = new HoloMeshWorldState('agent-did-12345');
        const entry = {
          content: 'Live',
          type: 'wisdom',
          authorDid: 'a',
          tags: [],
          timestamp: 1,
          accessCount: 0,
        };
        mockMaps['knowledge.general'] = { 'W.GEN.01': JSON.stringify(entry) };

        ws.accessKnowledge('general', 'W.GEN.01');

        expect(mockDoc.commit).toHaveBeenCalled();
        const updated = JSON.parse(mockMaps['knowledge.general']['W.GEN.01'] as string);
        expect(updated.accessCount).toBe(1);
        expect(updated.lastAccessed).toBeGreaterThan(0);
      });

      it('pruneDeadKnowledge deletes zero-access entries older than threshold', () => {
        const ws = new HoloMeshWorldState('agent-did-12345');
        const oldDeadEntry = {
          content: 'Dead',
          type: 'pattern',
          authorDid: 'a',
          tags: [],
          timestamp: Date.now() - 100000,
          accessCount: 0,
        };
        const youngDeadEntry = {
          content: 'Dead but young',
          type: 'pattern',
          authorDid: 'a',
          tags: [],
          timestamp: Date.now() - 1000,
          accessCount: 0,
        };
        const liveEntry = {
          content: 'Live',
          type: 'pattern',
          authorDid: 'a',
          tags: [],
          timestamp: Date.now() - 100000,
          accessCount: 5,
        };

        mockMaps['knowledge.security'] = {
          'P.01': JSON.stringify(oldDeadEntry),
          'P.02': JSON.stringify(youngDeadEntry),
          'P.03': JSON.stringify(liveEntry),
        };
        // Provide mock delete behavior for 'security'
        const mapInst = mockMapInstances['knowledge.security'];
        mapInst.delete = vi.fn((key: string) => {
          delete mockMaps['knowledge.security'][key];
        });

        const pruned = ws.pruneDeadKnowledge(50000); // 50 seconds threshold

        expect(pruned).toBe(1);
        expect(mapInst.delete).toHaveBeenCalledWith('P.01');
        expect(mockMaps['knowledge.security']['P.01']).toBeUndefined();
        expect(mockMaps['knowledge.security']['P.02']).toBeDefined();
        expect(mockMaps['knowledge.security']['P.03']).toBeDefined();
      });
    });
  });

  describe('reputation', () => {
    it('updateReputation stores JSON in reputation map', () => {
      const ws = new HoloMeshWorldState('agent-did-12345');
      ws.updateReputation('peer-1', { contributions: 10, queries: 5, score: 8.5, tier: 'expert' });
      expect(mockDoc.commit).toHaveBeenCalled();
    });

    it('getReputation returns parsed entry', () => {
      const ws = new HoloMeshWorldState('agent-did-12345');
      const data = { contributions: 10, queries: 5, score: 8.5, tier: 'expert', updatedAt: 123 };
      mockMaps['reputation'] = { 'peer-1': JSON.stringify(data) };

      const rep = ws.getReputation('peer-1');
      expect(rep).toBeDefined();
      expect(rep.score).toBe(8.5);
      expect(rep.tier).toBe('expert');
    });

    it('getReputation returns null for unknown agent', () => {
      const ws = new HoloMeshWorldState('agent-did-12345');
      mockMaps['reputation'] = {};
      expect(ws.getReputation('unknown')).toBeNull();
    });
  });

  describe('peer registry', () => {
    it('registerPeerInCRDT stores peer data', () => {
      const ws = new HoloMeshWorldState('agent-did-12345');
      ws.registerPeerInCRDT('peer-2', { url: 'https://peer2.example', name: 'Peer2' });
      expect(mockDoc.commit).toHaveBeenCalled();
    });

    it('getCRDTPeers returns all registered peers', () => {
      const ws = new HoloMeshWorldState('agent-did-12345');
      mockMaps['peers'] = {
        'peer-1': JSON.stringify({ url: 'https://p1', name: 'P1', lastSeen: 100 }),
        'peer-2': JSON.stringify({ url: 'https://p2', name: 'P2', lastSeen: 200 }),
      };

      const peers = ws.getCRDTPeers();
      expect(peers.length).toBe(2);
      expect(peers[0].did).toBe('peer-1');
      expect(peers[1].url).toBe('https://p2');
    });
  });

  describe('delta sync', () => {
    it('exportDelta returns Uint8Array', () => {
      const ws = new HoloMeshWorldState('agent-did-12345');
      const delta = ws.exportDelta();
      expect(delta).toBeInstanceOf(Uint8Array);
      expect(mockDoc.export).toHaveBeenCalledWith({ mode: 'update' });
    });

    it('exportDelta with frontiers passes them through', () => {
      const ws = new HoloMeshWorldState('agent-did-12345');
      const frontiers = [{ peer: '456', counter: 10 }];
      ws.exportDelta(frontiers);
      expect(mockDoc.export).toHaveBeenCalledWith({ mode: 'update', from: frontiers });
    });

    it('importDelta calls doc.import', () => {
      const ws = new HoloMeshWorldState('agent-did-12345');
      const data = new Uint8Array([5, 6, 7]);
      ws.importDelta(data);
      expect(mockDoc.import).toHaveBeenCalledWith(data);
    });

    it('exportSnapshot returns full document', () => {
      const ws = new HoloMeshWorldState('agent-did-12345');
      ws.exportSnapshot();
      expect(mockDoc.export).toHaveBeenCalledWith({ mode: 'snapshot' });
    });

    it('getFrontiers returns JSON-serializable value', () => {
      const ws = new HoloMeshWorldState('agent-did-12345');
      const f = ws.getFrontiers();
      expect(Array.isArray(f)).toBe(true);
      expect(JSON.stringify(f)).toBeDefined();
    });
  });

  describe('persistence', () => {
    it('saveSnapshot writes binary to disk', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      const ws = new HoloMeshWorldState('agent-did-12345', { snapshotPath: '/tmp/snap.bin' });
      const result = ws.saveSnapshot();
      expect(result).toBe(true);
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('saveSnapshot creates directory if needed', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const ws = new HoloMeshWorldState('agent-did-12345', { snapshotPath: '/tmp/new/snap.bin' });
      ws.saveSnapshot();
      expect(fs.mkdirSync).toHaveBeenCalledWith(expect.any(String), { recursive: true });
    });

    it('saveSnapshot returns false when no path', () => {
      const ws = new HoloMeshWorldState('agent-did-12345');
      expect(ws.saveSnapshot()).toBe(false);
    });

    it('loadSnapshot imports from disk when file exists', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from([1, 2, 3]) as any);
      const ws = new HoloMeshWorldState('agent-did-12345');
      const result = ws.loadSnapshot('/tmp/existing.bin');
      expect(result).toBe(true);
      expect(mockDoc.import).toHaveBeenCalled();
    });

    it('loadSnapshot returns false for missing file', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const ws = new HoloMeshWorldState('agent-did-12345');
      expect(ws.loadSnapshot('/tmp/missing.bin')).toBe(false);
    });
  });

  describe('V3 spatial text feed', () => {
    it('appendToFeed inserts annotated block into LoroText', () => {
      const ws = new HoloMeshWorldState('agent-did-12345');
      ws.appendToFeed('object Test {}', 'agent-did-12345');
      expect(mockText.insert).toHaveBeenCalledWith(
        0,
        expect.stringContaining('// @author agent-did-12345')
      );
    });

    it('getFeedSource returns text content', () => {
      const ws = new HoloMeshWorldState('agent-did-12345');
      mockTextContent = '// feed content here';
      expect(ws.getFeedSource()).toBe('// feed content here');
    });

    it('getKnowledgeDomainSource joins entry content', () => {
      const ws = new HoloMeshWorldState('agent-did-12345');
      const entry = {
        content: 'Domain knowledge',
        type: 'wisdom',
        authorDid: 'a',
        tags: [],
        timestamp: 1,
      };
      mockMaps['knowledge.security'] = { 'W.01': JSON.stringify(entry) };

      const source = ws.getKnowledgeDomainSource('security');
      expect(source).toBe('Domain knowledge');
    });

    it('subscribe registers callback on LoroDoc', () => {
      const ws = new HoloMeshWorldState('agent-did-12345');
      const cb = vi.fn();
      ws.subscribe(cb);
      expect(mockDoc.subscribe).toHaveBeenCalledWith(cb);
    });
  });

  // ── V9: Neuroscience Memory Consolidation ───────────────────────────────

  describe('V9 hot buffer (hippocampus)', () => {
    it('ingestToHotBuffer stages entry without touching cold store', () => {
      const ws = new HoloMeshWorldState('agent-did-12345');
      const entry = ws.ingestToHotBuffer('security', {
        content: 'New threat vector found',
        type: 'wisdom',
        authorDid: 'peer-1',
        tags: ['security'],
      }, 'peer-1');

      expect(entry.id).toContain('hot_security_');
      expect(entry.domain).toBe('security');
      expect(entry.corroborations).toEqual(['peer-1']);
      expect(entry.sourcePeerDid).toBe('peer-1');

      // Verify cold store was NOT modified
      expect(mockDoc.commit).not.toHaveBeenCalled();
    });

    it('getHotBuffer returns entries for specific domain', () => {
      const ws = new HoloMeshWorldState('agent-did-12345');
      ws.ingestToHotBuffer('rendering', {
        content: 'SDF trick',
        type: 'pattern',
        authorDid: 'peer-2',
        tags: ['rendering'],
      }, 'peer-2');
      ws.ingestToHotBuffer('rendering', {
        content: 'Shader hack',
        type: 'pattern',
        authorDid: 'peer-3',
        tags: ['rendering'],
      }, 'peer-3');

      const buffer = ws.getHotBuffer('rendering');
      expect(buffer).toHaveLength(2);
      expect(buffer[0].content).toBe('SDF trick');
    });

    it('corroborateHotEntry adds peer to corroboration list', () => {
      const ws = new HoloMeshWorldState('agent-did-12345');
      const entry = ws.ingestToHotBuffer('agents', {
        content: 'Agent coordination pattern',
        type: 'pattern',
        authorDid: 'peer-1',
        tags: ['agents'],
      }, 'peer-1');

      const result = ws.corroborateHotEntry('agents', entry.id, 'peer-2');
      expect(result).toBe(true);

      const buffer = ws.getHotBuffer('agents');
      expect(buffer[0].corroborations).toEqual(['peer-1', 'peer-2']);
    });

    it('corroborateHotEntry deduplicates same peer', () => {
      const ws = new HoloMeshWorldState('agent-did-12345');
      const entry = ws.ingestToHotBuffer('agents', {
        content: 'Test',
        type: 'wisdom',
        authorDid: 'peer-1',
        tags: [],
      }, 'peer-1');

      ws.corroborateHotEntry('agents', entry.id, 'peer-1');
      const buffer = ws.getHotBuffer('agents');
      expect(buffer[0].corroborations).toEqual(['peer-1']);
    });

    it('corroborateHotEntry returns false for unknown entry', () => {
      const ws = new HoloMeshWorldState('agent-did-12345');
      expect(ws.corroborateHotEntry('security', 'nonexistent', 'peer-1')).toBe(false);
    });

    it('getHotBufferStats returns counts for all domains', () => {
      const ws = new HoloMeshWorldState('agent-did-12345');
      ws.ingestToHotBuffer('security', {
        content: 'A', type: 'wisdom', authorDid: 'a', tags: [],
      }, 'peer-1');
      ws.ingestToHotBuffer('security', {
        content: 'B', type: 'wisdom', authorDid: 'a', tags: [],
      }, 'peer-1');

      const stats = ws.getHotBufferStats();
      expect(stats).toHaveLength(5); // 5 domains
      const secStats = stats.find(s => s.domain === 'security');
      expect(secStats?.count).toBe(2);
      const renderStats = stats.find(s => s.domain === 'rendering');
      expect(renderStats?.count).toBe(0);
    });
  });

  describe('V9 consolidation (sleep cycle)', () => {
    it('consolidateDomain promotes eligible entries to cold store', () => {
      const ws = new HoloMeshWorldState('agent-did-12345');

      // Ingest entry and backdate it so it's past TTL
      ws.ingestToHotBuffer('general', {
        content: 'Consolidated insight',
        type: 'wisdom',
        authorDid: 'peer-1',
        tags: ['test'],
      }, 'peer-1');

      // Backdate to exceed hotBufferTTL (general = 6h)
      (ws as any).hotBuffer.get('general')[0].ingestedAt = Date.now() - 7 * 60 * 60 * 1000;

      // Add mock delete to the domain map
      const mapInst = mockMapInstances['knowledge.general'];
      if (mapInst) mapInst.delete = vi.fn();

      const result = ws.consolidateDomain('general');
      expect(result.domain).toBe('general');
      expect(result.promoted).toBe(1);
      expect(result.dropped).toBe(0);
    });

    it('consolidateDomain drops entries with insufficient corroborations', () => {
      const ws = new HoloMeshWorldState('agent-did-12345');

      // Security domain requires minCorroborations = 2
      ws.ingestToHotBuffer('security', {
        content: 'Uncorroborated claim',
        type: 'wisdom',
        authorDid: 'peer-1',
        tags: [],
      }, 'peer-1');

      // Backdate past TTL (security = 1h)
      (ws as any).hotBuffer.get('security')[0].ingestedAt = Date.now() - 2 * 60 * 60 * 1000;

      const mapInst = mockMapInstances['knowledge.security'];
      if (mapInst) mapInst.delete = vi.fn();

      const result = ws.consolidateDomain('security');
      expect(result.dropped).toBe(1);
      expect(result.promoted).toBe(0);
    });

    it('consolidateDomain merges duplicate entries', () => {
      const ws = new HoloMeshWorldState('agent-did-12345');

      // Two identical entries from different peers
      ws.ingestToHotBuffer('general', {
        content: 'Same insight',
        type: 'wisdom',
        authorDid: 'peer-1',
        tags: ['test'],
      }, 'peer-1');
      ws.ingestToHotBuffer('general', {
        content: 'Same insight',
        type: 'wisdom',
        authorDid: 'peer-2',
        tags: ['test'],
      }, 'peer-2');

      // Backdate both
      const buf = (ws as any).hotBuffer.get('general');
      buf[0].ingestedAt = Date.now() - 7 * 60 * 60 * 1000;
      buf[1].ingestedAt = Date.now() - 7 * 60 * 60 * 1000;

      const mapInst = mockMapInstances['knowledge.general'];
      if (mapInst) mapInst.delete = vi.fn();

      const result = ws.consolidateDomain('general');
      expect(result.merged).toBe(1);
      expect(result.promoted).toBe(1); // Only 1 survives after merge
    });

    it('consolidateDomain keeps young entries in hot buffer', () => {
      const ws = new HoloMeshWorldState('agent-did-12345');

      ws.ingestToHotBuffer('general', {
        content: 'Fresh entry',
        type: 'pattern',
        authorDid: 'peer-1',
        tags: [],
      }, 'peer-1');
      // Do NOT backdate — entry is fresh

      const mapInst = mockMapInstances['knowledge.general'];
      if (mapInst) mapInst.delete = vi.fn();

      const result = ws.consolidateDomain('general');
      expect(result.promoted).toBe(0);
      expect(result.dropped).toBe(0);

      // Entry should still be in hot buffer
      expect(ws.getHotBuffer('general')).toHaveLength(1);
    });

    it('consolidateDomain applies downscaling to cold store entries', () => {
      const ws = new HoloMeshWorldState('agent-did-12345');

      // Pre-populate cold store with an entry that has excitability
      const existingEntry = {
        content: 'Old knowledge',
        type: 'wisdom',
        authorDid: 'self',
        tags: [],
        timestamp: Date.now() - 100000,
        accessCount: 5,
        lastAccessed: Date.now(),
        _excitability: {
          queryCount: 10,
          citationCount: 5,
          corroborationCount: 3,
          excitability: 50,
          lastRetrievedAt: Date.now(),
          lastReconsolidatedAt: 0,
          consolidationSurvivals: 2,
        },
      };
      mockMaps['knowledge.general'] = { 'W.OLD.01': JSON.stringify(existingEntry) };
      const mapInst = mockMapInstances['knowledge.general'];
      if (mapInst) mapInst.delete = vi.fn();

      ws.consolidateDomain('general');

      // Verify downscaling was applied
      const updated = JSON.parse(mockMaps['knowledge.general']['W.OLD.01']);
      expect(updated._excitability.consolidationSurvivals).toBe(3); // Was 2, now 3
      // Excitability should be downscaled by general's factor (0.92)
      expect(updated._excitability.excitability).toBeLessThan(50);
    });

    it('sleepCycle runs consolidation for overdue domains', () => {
      const ws = new HoloMeshWorldState('agent-did-12345');

      // Backdate all lastConsolidation timestamps
      for (const domain of ['security', 'rendering', 'agents', 'compilation', 'general'] as const) {
        (ws as any).lastConsolidation.set(domain, 0);
        const mapInst = mockMapInstances[`knowledge.${domain}`];
        if (mapInst) mapInst.delete = vi.fn();
      }

      const results = ws.sleepCycle();
      expect(results.length).toBe(5); // All domains should consolidate
      expect(results.every(r => r.consolidatedAt > 0)).toBe(true);
    });

    it('sleepCycle force=true runs all domains regardless of timing', () => {
      const ws = new HoloMeshWorldState('agent-did-12345');

      // All domains have recent timestamps (not overdue)
      for (const domain of ['security', 'rendering', 'agents', 'compilation', 'general'] as const) {
        const mapInst = mockMapInstances[`knowledge.${domain}`];
        if (mapInst) mapInst.delete = vi.fn();
      }

      const results = ws.sleepCycle(true);
      expect(results.length).toBe(5);
    });

    it('needsConsolidation reports overdue domains', () => {
      const ws = new HoloMeshWorldState('agent-did-12345');

      // Make security overdue
      (ws as any).lastConsolidation.set('security', 0);

      const status = ws.needsConsolidation();
      const sec = status.find(s => s.domain === 'security');
      expect(sec?.overdue).toBe(true);

      // Rendering was just initialized — should NOT be overdue
      const render = status.find(s => s.domain === 'rendering');
      expect(render?.overdue).toBe(false);
    });
  });

  describe('V9 reconsolidation (retrieval = write)', () => {
    it('retrieveWithReconsolidation strengthens entry on access', () => {
      const ws = new HoloMeshWorldState('agent-did-12345');

      const entry = {
        content: 'Useful pattern',
        type: 'wisdom',
        authorDid: 'peer-1',
        tags: ['test'],
        timestamp: Date.now(),
        accessCount: 0,
        lastAccessed: 0,
        _excitability: {
          queryCount: 3,
          citationCount: 1,
          corroborationCount: 2,
          excitability: 12,
          lastRetrievedAt: 0,
          lastReconsolidatedAt: 0,
          consolidationSurvivals: 1,
        },
      };
      mockMaps['knowledge.rendering'] = { 'W.TEST.01': JSON.stringify(entry) };

      const result = ws.retrieveWithReconsolidation('rendering', 'W.TEST.01');

      expect(result).not.toBeNull();
      expect(result!.reconsolidation.windowOpen).toBe(true);
      expect(result!.reconsolidation.excitabilityDelta).toBe(2);

      // Verify the entry was updated in the CRDT
      const updated = JSON.parse(mockMaps['knowledge.rendering']['W.TEST.01']);
      expect(updated._excitability.queryCount).toBe(4); // Was 3
      expect(updated.accessCount).toBe(1); // V7 compat
      expect(updated.lastAccessed).toBeGreaterThan(0);
    });

    it('retrieveWithReconsolidation initializes excitability if missing', () => {
      const ws = new HoloMeshWorldState('agent-did-12345');

      const entry = {
        content: 'Legacy entry without excitability',
        type: 'pattern',
        authorDid: 'old-agent',
        tags: [],
        timestamp: Date.now() - 1000000,
        accessCount: 0,
      };
      mockMaps['knowledge.compilation'] = { 'P.OLD.01': JSON.stringify(entry) };

      const result = ws.retrieveWithReconsolidation('compilation', 'P.OLD.01');
      expect(result).not.toBeNull();

      const updated = JSON.parse(mockMaps['knowledge.compilation']['P.OLD.01']);
      expect(updated._excitability).toBeDefined();
      expect(updated._excitability.queryCount).toBe(1);
    });

    it('retrieveWithReconsolidation returns null for missing entry', () => {
      const ws = new HoloMeshWorldState('agent-did-12345');
      mockMaps['knowledge.security'] = {};
      const result = ws.retrieveWithReconsolidation('security', 'nonexistent');
      expect(result).toBeNull();
    });

    it('reconsolidateEntry updates content within window', () => {
      const ws = new HoloMeshWorldState('agent-did-12345');

      const entry = {
        content: 'Original content',
        type: 'wisdom',
        authorDid: 'peer-1',
        tags: [],
        timestamp: Date.now(),
        _excitability: {
          queryCount: 1,
          citationCount: 0,
          corroborationCount: 0,
          excitability: 2,
          lastRetrievedAt: 0,
          lastReconsolidatedAt: 0,
          consolidationSurvivals: 0,
        },
      };
      mockMaps['knowledge.general'] = { 'W.RECON.01': JSON.stringify(entry) };

      // First retrieve to open the window
      ws.retrieveWithReconsolidation('general', 'W.RECON.01');

      // Then reconsolidate
      const success = ws.reconsolidateEntry('general', 'W.RECON.01', 'Updated content');
      expect(success).toBe(true);

      const updated = JSON.parse(mockMaps['knowledge.general']['W.RECON.01']);
      expect(updated.content).toBe('Updated content');
      expect(updated._excitability.lastReconsolidatedAt).toBeGreaterThan(0);
    });

    it('reconsolidateEntry fails without open window', () => {
      const ws = new HoloMeshWorldState('agent-did-12345');

      const entry = {
        content: 'Locked content',
        type: 'wisdom',
        authorDid: 'peer-1',
        tags: [],
        timestamp: Date.now(),
      };
      mockMaps['knowledge.general'] = { 'W.LOCK.01': JSON.stringify(entry) };

      // No prior retrieval — no window open
      const success = ws.reconsolidateEntry('general', 'W.LOCK.01', 'Attempted change');
      expect(success).toBe(false);
    });
  });

  describe('V9 active forgetting', () => {
    it('contradictEntry reduces excitability', () => {
      const ws = new HoloMeshWorldState('agent-did-12345');

      const entry = {
        content: 'Contested claim',
        type: 'wisdom',
        authorDid: 'peer-1',
        tags: [],
        timestamp: Date.now(),
        _excitability: {
          queryCount: 5,
          citationCount: 2,
          corroborationCount: 1,
          excitability: 20,
          lastRetrievedAt: 0,
          lastReconsolidatedAt: 0,
          consolidationSurvivals: 1,
        },
      };
      mockMaps['knowledge.agents'] = { 'W.CONTEST.01': JSON.stringify(entry) };

      const result = ws.contradictEntry('agents', 'W.CONTEST.01', 'peer-2');
      expect(result.contradicted).toBe(true);
      expect(result.pruned).toBe(false);

      const updated = JSON.parse(mockMaps['knowledge.agents']['W.CONTEST.01']);
      expect(updated._contradictions).toContain('peer-2');
      expect(updated._excitability.excitability).toBe(15); // 20 - 5
    });

    it('contradictEntry prunes after 3 contradictions', () => {
      const ws = new HoloMeshWorldState('agent-did-12345');

      const entry = {
        content: 'Bad info',
        type: 'gotcha',
        authorDid: 'peer-1',
        tags: [],
        timestamp: Date.now(),
        _contradictions: ['peer-2', 'peer-3'],
        _excitability: {
          queryCount: 0,
          citationCount: 0,
          corroborationCount: 0,
          excitability: 0,
          lastRetrievedAt: 0,
          lastReconsolidatedAt: 0,
          consolidationSurvivals: 0,
        },
      };
      mockMaps['knowledge.agents'] = { 'W.BAD.01': JSON.stringify(entry) };
      const mapInst = mockMapInstances['knowledge.agents'];
      if (mapInst) mapInst.delete = vi.fn((key: string) => {
        delete mockMaps['knowledge.agents'][key];
      });

      const result = ws.contradictEntry('agents', 'W.BAD.01', 'peer-4');
      expect(result.contradicted).toBe(true);
      expect(result.pruned).toBe(true);

      // Entry should be deleted from cold store
      expect(mockMaps['knowledge.agents']['W.BAD.01']).toBeUndefined();
    });

    it('contradictEntry returns false for missing entry', () => {
      const ws = new HoloMeshWorldState('agent-did-12345');
      mockMaps['knowledge.security'] = {};
      const result = ws.contradictEntry('security', 'nonexistent', 'peer-1');
      expect(result.contradicted).toBe(false);
      expect(result.pruned).toBe(false);
    });

    it('deprecateEntry marks entry for pruning', () => {
      const ws = new HoloMeshWorldState('agent-did-12345');

      const entry = {
        content: 'Outdated pattern',
        type: 'pattern',
        authorDid: 'agent-did-12345',
        tags: [],
        timestamp: Date.now(),
        _excitability: {
          queryCount: 3,
          citationCount: 1,
          corroborationCount: 0,
          excitability: 10,
          lastRetrievedAt: 0,
          lastReconsolidatedAt: 0,
          consolidationSurvivals: 2,
        },
      };
      mockMaps['knowledge.compilation'] = { 'P.OLD.01': JSON.stringify(entry) };

      const result = ws.deprecateEntry('compilation', 'P.OLD.01', 'Superseded by V2');
      expect(result).toBe(true);

      const updated = JSON.parse(mockMaps['knowledge.compilation']['P.OLD.01']);
      expect(updated._deprecated).toBe(true);
      expect(updated._deprecationReason).toBe('Superseded by V2');
      expect(updated._excitability.excitability).toBe(0);
    });

    it('deprecateEntry returns false for missing entry', () => {
      const ws = new HoloMeshWorldState('agent-did-12345');
      mockMaps['knowledge.general'] = {};
      expect(ws.deprecateEntry('general', 'nonexistent', 'test')).toBe(false);
    });
  });

  describe('V9 domain configuration', () => {
    it('getDomainConfig returns correct config for each domain', () => {
      const ws = new HoloMeshWorldState('agent-did-12345');

      const secConfig = ws.getDomainConfig('security');
      expect(secConfig.maxEntries).toBe(50);
      expect(secConfig.competitionMetric).toBe('peer_corroboration');
      expect(secConfig.downscaleFactor).toBe(0.85);
      expect(secConfig.minCorroborations).toBe(2);

      const renderConfig = ws.getDomainConfig('rendering');
      expect(renderConfig.maxEntries).toBe(200);
      expect(renderConfig.competitionMetric).toBe('query_frequency');
      expect(renderConfig.downscaleFactor).toBe(0.95);
    });

    it('getDomainConfig returns a copy (not reference)', () => {
      const ws = new HoloMeshWorldState('agent-did-12345');
      const config1 = ws.getDomainConfig('security');
      const config2 = ws.getDomainConfig('security');
      config1.maxEntries = 999;
      expect(config2.maxEntries).toBe(50);
    });
  });
});
