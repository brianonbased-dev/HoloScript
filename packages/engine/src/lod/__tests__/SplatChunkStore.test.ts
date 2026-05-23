/**
 * SplatChunkStore Tests
 *
 * Validates fleet-rail chunk addressing for splat streaming (WIRE-3):
 *  1. Register SpatialPartitionResult anchors as chunk entries
 *  2. Query by LOD level, bounding box, distance, importance
 *  3. Fleet-rail URL generation and parsing
 *  4. Budget-aware chunk selection (Gaussian count + byte budget)
 *  5. Provenance hash verification
 *  6. Incremental registration and deregistration
 *  7. Clear and re-registration
 *  8. Empty composition handling
 *
 * @version 1.0.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  SplatChunkStore,
  createSplatChunkStore,
  createVRSplatChunkStore,
  createDesktopSplatChunkStore,
  type ChunkEntry,
  type SpatialAnchorLike,
  type SpatialPartitionResultLike,
} from '../SplatChunkStore';

// =============================================================================
// HELPERS
// =============================================================================

function makeAnchor(
  name: string,
  lodLevel: number,
  gaussianCount: number,
  position: [number, number, number] = [0, 0, 0],
  importance: number = 0.5,
  sourceFile?: string
): SpatialAnchorLike {
  return {
    id: `spa_${name}_l${lodLevel}`,
    position,
    scale: gaussianCount * 1e-6,
    lodLevel,
    gaussianCount,
    importance,
    provenanceHash: sourceFile
      ? `hash_file_${sourceFile}_${gaussianCount}`
      : `hash_${name}_${lodLevel}_${gaussianCount}`.padEnd(64, '0').slice(0, 64),
    sourceFile,
  };
}

function makeResult(anchors: SpatialAnchorLike[]): SpatialPartitionResultLike {
  return {
    schema: 'spatial-partition/v1',
    compositionName: 'TestScene',
    generatedAt: new Date().toISOString(),
    anchors,
    bounds: {
      min: { x: -100, y: -100, z: -100 },
      max: { x: 100, y: 100, z: 100 },
      center: { x: 0, y: 0, z: 0 },
      halfSize: 100,
    },
    merkleRoot: 'a'.repeat(64),
    totalGaussians: anchors.reduce((s, a) => s + a.gaussianCount, 0),
    stats: {},
  };
}

// =============================================================================
// TESTS
// =============================================================================

describe('SplatChunkStore', () => {
  let store: SplatChunkStore;

  beforeEach(() => {
    store = new SplatChunkStore({
      baseUrl: 'https://cdn.holoscript.net',
      compositionId: 'test-scene',
    });
  });

  // ---------------------------------------------------------------------------
  // 1. Registration from SpatialPartitionResult
  // ---------------------------------------------------------------------------

  describe('register from SpatialPartitionResult', () => {
    it('registers all anchors as chunk entries', () => {
      const result = makeResult([
        makeAnchor('Cloud', 0, 2_000_000, [10, 20, 30]),
        makeAnchor('Dust', 4, 1_000, [5, 0, -10]),
      ]);

      store.register(result);

      expect(store.size).toBe(2);
      expect(store.has('spa_Cloud_l0')).toBe(true);
      expect(store.has('spa_Dust_l4')).toBe(true);
    });

    it('sets composition metadata from the result', () => {
      const result = makeResult([makeAnchor('A', 0, 100)]);
      store.register(result);

      const metrics = store.getMetrics();
      expect(metrics.compositionName).toBe('TestScene');
      expect(metrics.totalGaussians).toBe(100);
    });

    it('sets bounds from the result', () => {
      const result = makeResult([makeAnchor('A', 0, 100)]);
      store.register(result);

      const bounds = store.getBounds();
      expect(bounds).not.toBeNull();
      expect(bounds!.halfSize).toBe(100);
    });

    it('stores merkle root', () => {
      const result = makeResult([makeAnchor('A', 0, 100)]);
      store.register(result);
      expect(store.getMerkleRoot()).toBe('a'.repeat(64));
    });

    it('replaces existing entries on re-register', () => {
      store.register(makeResult([makeAnchor('A', 0, 100)]));
      expect(store.size).toBe(1);

      store.register(makeResult([
        makeAnchor('B', 1, 200),
        makeAnchor('C', 2, 300),
      ]));
      expect(store.size).toBe(2);
      expect(store.has('spa_A_l0')).toBe(false);
      expect(store.has('spa_B_l1')).toBe(true);
    });

    it('handles empty composition', () => {
      const result = makeResult([]);
      store.register(result);

      expect(store.size).toBe(0);
      expect(store.getMetrics().totalGaussians).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Query by LOD level
  // ---------------------------------------------------------------------------

  describe('queryByLOD', () => {
    it('returns chunks at the specified LOD levels', () => {
      store.register(makeResult([
        makeAnchor('Coarse', 0, 2_000_000),
        makeAnchor('Medium', 2, 50_000),
        makeAnchor('Fine', 4, 1_000),
      ]));

      const result = store.queryByLOD([0, 2]);
      expect(result.entries).toHaveLength(2);
      expect(result.entries[0]!.lodLevel).toBe(0);
      expect(result.entries[1]!.lodLevel).toBe(2);
    });

    it('returns empty for non-existent levels', () => {
      store.register(makeResult([makeAnchor('A', 0, 100)]));
      const result = store.queryByLOD([7]);
      expect(result.entries).toHaveLength(0);
    });

    it('sorts results coarsest-first', () => {
      store.register(makeResult([
        makeAnchor('Fine', 4, 100),
        makeAnchor('Coarse', 0, 2_000_000),
        makeAnchor('Medium', 2, 50_000),
      ]));

      const result = store.queryByLOD([0, 2, 4]);
      expect(result.entries[0]!.lodLevel).toBe(0);
      expect(result.entries[1]!.lodLevel).toBe(2);
      expect(result.entries[2]!.lodLevel).toBe(4);
    });

    it('computes total Gaussians and bytes', () => {
      store.register(makeResult([
        makeAnchor('A', 0, 1000),
        makeAnchor('B', 2, 2000),
      ]));

      const result = store.queryByLOD([0, 2]);
      expect(result.totalGaussians).toBe(3000);
      expect(result.totalBytes).toBe(3000 * 56);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Fleet-rail URL generation
  // ---------------------------------------------------------------------------

  describe('fleet-rail URLs', () => {
    it('generates URLs with provenance hash by default', () => {
      store.register(makeResult([makeAnchor('Cloud', 0, 100)]));
      const entry = store.get('spa_Cloud_l0')!;

      expect(entry.url).toContain('/chunk/spa_Cloud_l0');
      expect(entry.url).toContain('hash=');
      expect(entry.url).toContain('https://cdn.holoscript.net');
    });

    it('generates URLs without hash when verifyProvenance is false', () => {
      const storeNoVerify = new SplatChunkStore({
        baseUrl: 'https://cdn.holoscript.net',
        compositionId: 'test',
        verifyProvenance: false,
      });

      storeNoVerify.register(makeResult([makeAnchor('Cloud', 0, 100)]));
      const entry = storeNoVerify.get('spa_Cloud_l0')!;

      expect(entry.url).toContain('/chunk/spa_Cloud_l0');
      expect(entry.url).not.toContain('hash=');
    });

    it('buildFleetRailURL produces correct structure', () => {
      const url = store.buildFleetRailURL('spa_Terrain_l0', 'abc123');
      expect(url.full).toContain('/chunk/spa_Terrain_l0');
      expect(url.full).toContain('hash=abc123');
      expect(url.path).toBe('/chunk/spa_Terrain_l0');
      expect(url.cacheKey).toBe('test-scene/spa_Terrain_l0');
    });

    it('parseFleetRailURL extracts nodeId and hash', () => {
      const url = 'https://cdn.holoscript.net/chunk/spa_Terrain_l0?hash=abc123';
      const parsed = store.parseFleetRailURL(url);

      expect(parsed).not.toBeNull();
      expect(parsed!.nodeId).toBe('spa_Terrain_l0');
      expect(parsed!.provenanceHash).toBe('abc123');
    });

    it('parseFleetRailURL handles URLs without hash', () => {
      const url = 'https://cdn.holoscript.net/chunk/spa_Terrain_l0';
      const parsed = store.parseFleetRailURL(url);

      expect(parsed).not.toBeNull();
      expect(parsed!.nodeId).toBe('spa_Terrain_l0');
      expect(parsed!.provenanceHash).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Query by bounding box
  // ---------------------------------------------------------------------------

  describe('queryByBounds', () => {
    it('returns chunks within the AABB', () => {
      store.register(makeResult([
        makeAnchor('Near', 0, 100, [5, 5, 5]),
        makeAnchor('Far', 0, 100, [500, 500, 500]),
      ]));

      const result = store.queryByBounds(-10, -10, -10, 10, 10, 10);
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0]!.nodeId).toContain('Near');
    });

    it('returns empty for non-overlapping bounds', () => {
      store.register(makeResult([
        makeAnchor('A', 0, 100, [100, 100, 100]),
      ]));

      const result = store.queryByBounds(-10, -10, -10, 10, 10, 10);
      expect(result.entries).toHaveLength(0);
    });

    it('includes origin-anchored chunks in bounds around origin', () => {
      store.register(makeResult([
        makeAnchor('Origin', 0, 100, [0, 0, 0]),
      ]));

      const result = store.queryByBounds(-1, -1, -1, 1, 1, 1);
      expect(result.entries).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Query by distance
  // ---------------------------------------------------------------------------

  describe('queryByDistance', () => {
    it('returns chunks within maxDistance of the camera', () => {
      store.register(makeResult([
        makeAnchor('Close', 0, 100, [3, 0, 0]),   // distance 3
        makeAnchor('Mid', 0, 100, [10, 0, 0]),     // distance 10
        makeAnchor('Far', 0, 100, [100, 0, 0]),     // distance 100
      ]));

      const result = store.queryByDistance(0, 0, 0, 15);
      expect(result.entries).toHaveLength(2); // Close (3) + Mid (10), not Far (100)
    });

    it('sorts by distance nearest-first', () => {
      store.register(makeResult([
        makeAnchor('Far', 0, 100, [50, 0, 0]),
        makeAnchor('Close', 0, 100, [1, 0, 0]),
      ]));

      const result = store.queryByDistance(0, 0, 0, 100);
      expect(result.entries[0]!.nodeId).toContain('Close');
      expect(result.entries[1]!.nodeId).toContain('Far');
    });

    it('returns empty for very small maxDistance', () => {
      store.register(makeResult([
        makeAnchor('A', 0, 100, [10, 0, 0]),
      ]));

      const result = store.queryByDistance(0, 0, 0, 1);
      expect(result.entries).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Query by importance
  // ---------------------------------------------------------------------------

  describe('queryByImportance', () => {
    it('returns chunks with importance >= threshold', () => {
      store.register(makeResult([
        makeAnchor('Critical', 0, 100, [0, 0, 0], 0.9),
        makeAnchor('Normal', 0, 100, [0, 0, 0], 0.5),
        makeAnchor('Low', 0, 100, [0, 0, 0], 0.1),
      ]));

      const result = store.queryByImportance(0.5);
      expect(result.entries).toHaveLength(2); // Critical + Normal
    });

    it('sorts by importance descending', () => {
      store.register(makeResult([
        makeAnchor('Normal', 0, 100, [0, 0, 0], 0.5),
        makeAnchor('Critical', 0, 100, [0, 0, 0], 0.9),
      ]));

      const result = store.queryByImportance(0.0);
      expect(result.entries[0]!.importance).toBeGreaterThanOrEqual(
        result.entries[1]!.importance
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 7. Budget-aware selection
  // ---------------------------------------------------------------------------

  describe('selectForBudget', () => {
    it('selects chunks within a Gaussian budget prioritised by importance', () => {
      store.register(makeResult([
        makeAnchor('Critical', 0, 100, [0, 0, 0], 0.9),
        makeAnchor('Normal', 2, 200, [0, 0, 0], 0.5),
        makeAnchor('Low', 4, 300, [0, 0, 0], 0.1),
      ]));

      // Budget: 300 Gaussians
      const result = store.selectForBudget(300);
      // Critical (100) + Normal (200) = 300, Low (300) exceeds budget
      expect(result.entries).toHaveLength(2);
      expect(result.totalGaussians).toBe(300);
    });

    it('returns empty when budget is zero', () => {
      store.register(makeResult([makeAnchor('A', 0, 100)]));
      const result = store.selectForBudget(0);
      expect(result.entries).toHaveLength(0);
    });
  });

  describe('selectForByteBudget', () => {
    it('selects chunks within a byte budget prioritised by importance', () => {
      store.register(makeResult([
        makeAnchor('Critical', 0, 100, [0, 0, 0], 0.9),   // 100 * 56 = 5,600 bytes
        makeAnchor('Normal', 2, 200, [0, 0, 0], 0.5),       // 200 * 56 = 11,200 bytes
      ]));

      // Budget: 10,000 bytes — Critical fits (5,600), Normal doesn't (11,200)
      const result = store.selectForByteBudget(10_000);
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0]!.nodeId).toContain('Critical');
    });
  });

  // ---------------------------------------------------------------------------
  // 8. Provenance verification
  // ---------------------------------------------------------------------------

  describe('verifyChunk', () => {
    it('verifies matching provenance hash', () => {
      store.register(makeResult([makeAnchor('A', 0, 100)]));
      const entry = store.get('spa_A_l0')!;

      expect(store.verifyChunk('spa_A_l0', entry.provenanceHash)).toBe(true);
    });

    it('rejects mismatched provenance hash', () => {
      store.register(makeResult([makeAnchor('A', 0, 100)]));
      expect(store.verifyChunk('spa_A_l0', 'wrong_hash')).toBe(false);
    });

    it('rejects unknown node ID', () => {
      expect(store.verifyChunk('nonexistent', 'any')).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // 9. Incremental registration and deregistration
  // ---------------------------------------------------------------------------

  describe('incremental registration', () => {
    it('registerAnchor adds a single anchor', () => {
      store.registerAnchor(makeAnchor('New', 3, 500));
      expect(store.size).toBe(1);
      expect(store.has('spa_New_l3')).toBe(true);
    });

    it('deregister removes a single anchor', () => {
      store.register(makeResult([
        makeAnchor('A', 0, 100),
        makeAnchor('B', 1, 200),
      ]));
      expect(store.size).toBe(2);

      store.deregister('spa_A_l0');
      expect(store.size).toBe(1);
      expect(store.has('spa_A_l0')).toBe(false);
      expect(store.has('spa_B_l1')).toBe(true);
    });

    it('deregister removes from LOD index', () => {
      store.register(makeResult([
        makeAnchor('A', 0, 100),
        makeAnchor('B', 0, 200),
      ]));

      store.deregister('spa_A_l0');
      const level0 = store.queryByLOD([0]);
      expect(level0.entries).toHaveLength(1);
    });

    it('deregister returns false for unknown nodeId', () => {
      expect(store.deregister('nonexistent')).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // 10. Clear and re-registration
  // ---------------------------------------------------------------------------

  describe('clear and re-register', () => {
    it('clear removes all entries and metadata', () => {
      store.register(makeResult([makeAnchor('A', 0, 100)]));
      expect(store.size).toBe(1);

      store.clear();
      expect(store.size).toBe(0);
      expect(store.getMerkleRoot()).toBe('0'.repeat(64));
      expect(store.getBounds()).toBeNull();
    });

    it('re-register replaces previous composition', () => {
      store.register(makeResult([makeAnchor('Old', 0, 100)]));
      expect(store.size).toBe(1);

      store.register(makeResult([
        makeAnchor('New1', 1, 200),
        makeAnchor('New2', 2, 300),
      ]));
      expect(store.size).toBe(2);
      expect(store.has('spa_Old_l0')).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // 11. Store metrics
  // ---------------------------------------------------------------------------

  describe('getMetrics', () => {
    it('returns correct metrics', () => {
      store.register(makeResult([
        makeAnchor('Coarse', 0, 2_000_000),
        makeAnchor('Medium', 2, 50_000),
        makeAnchor('Fine', 4, 1_000),
      ]));

      const metrics = store.getMetrics();
      expect(metrics.totalChunks).toBe(3);
      expect(metrics.totalGaussians).toBe(2_051_000);
      expect(metrics.levels).toEqual([0, 2, 4]);
      expect(metrics.levelDistribution[0]).toBe(1);
      expect(metrics.levelDistribution[2]).toBe(1);
      expect(metrics.levelDistribution[4]).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // 12. getAll and getAvailableLevels
  // ---------------------------------------------------------------------------

  describe('getAll', () => {
    it('returns all entries sorted coarsest-first', () => {
      store.register(makeResult([
        makeAnchor('Fine', 4, 100),
        makeAnchor('Coarse', 0, 2_000_000),
        makeAnchor('Medium', 2, 50_000),
      ]));

      const result = store.getAll();
      expect(result.entries).toHaveLength(3);
      expect(result.entries[0]!.lodLevel).toBe(0);
      expect(result.entries[1]!.lodLevel).toBe(2);
      expect(result.entries[2]!.lodLevel).toBe(4);
    });
  });

  describe('getAvailableLevels', () => {
    it('returns sorted distinct levels', () => {
      store.register(makeResult([
        makeAnchor('A', 0, 100),
        makeAnchor('B', 2, 200),
        makeAnchor('C', 0, 300), // same level as A
      ]));

      expect(store.getAvailableLevels()).toEqual([0, 2]);
    });
  });

  // ---------------------------------------------------------------------------
  // 13. Factory functions
  // ---------------------------------------------------------------------------

  describe('factory functions', () => {
    it('createSplatChunkStore creates a store with defaults', () => {
      const s = createSplatChunkStore();
      expect(s).toBeInstanceOf(SplatChunkStore);
      expect(s.size).toBe(0);
    });

    it('createVRSplatChunkStore creates a store', () => {
      const s = createVRSplatChunkStore('vr-scene');
      expect(s).toBeInstanceOf(SplatChunkStore);
    });

    it('createDesktopSplatChunkStore creates a store', () => {
      const s = createDesktopSplatChunkStore('desktop-scene');
      expect(s).toBeInstanceOf(SplatChunkStore);
    });
  });

  // ---------------------------------------------------------------------------
  // 14. Estimated size calculation
  // ---------------------------------------------------------------------------

  describe('estimated size', () => {
    it('uses bytesPerGaussian for size estimation', () => {
      const store56 = new SplatChunkStore({ bytesPerGaussian: 56, compositionId: 'test' });
      store56.register(makeResult([makeAnchor('A', 0, 1000)]));

      const entry = store56.get('spa_A_l0')!;
      expect(entry.estimatedSizeBytes).toBe(1000 * 56);
    });

    it('respects custom bytesPerGaussian', () => {
      const store128 = new SplatChunkStore({ bytesPerGaussian: 128, compositionId: 'test' });
      store128.register(makeResult([makeAnchor('A', 0, 1000)]));

      const entry = store128.get('spa_A_l0')!;
      expect(entry.estimatedSizeBytes).toBe(1000 * 128);
    });
  });

  // ---------------------------------------------------------------------------
  // 15. Integration with SpatialPartitionPass anchor IDs
  // ---------------------------------------------------------------------------

  describe('SpatialPartitionPass anchor ID format', () => {
    it('stores anchors with spa_<name>_l<level> ID format', () => {
      store.register(makeResult([
        makeAnchor('Terrain_Mesh', 0, 2_000_000, [0, 0, 0]),
        makeAnchor('Detail_Obj', 3, 500, [10, 5, -3]),
      ]));

      expect(store.has('spa_Terrain_Mesh_l0')).toBe(true);
      expect(store.has('spa_Detail_Obj_l3')).toBe(true);
    });

    it('generates fleet-rail URLs compatible with GET /chunk/{nodeId}', () => {
      store.register(makeResult([
        makeAnchor('Building', 0, 2_000_000),
      ]));

      const entry = store.get('spa_Building_l0')!;
      expect(entry.url).toContain('/chunk/spa_Building_l0');
      // URL should be a valid endpoint path
      expect(entry.url).toMatch(/^https:\/\/cdn\.holoscript\.net\/chunk\//);
    });
  });

  // ---------------------------------------------------------------------------
  // 16. sourceFile propagation
  // ---------------------------------------------------------------------------

  describe('sourceFile propagation', () => {
    it('stores sourceFile when provided', () => {
      store.register(makeResult([
        makeAnchor('WithSrc', 0, 100, [0, 0, 0], 0.5, 'scene.ply'),
      ]));

      const entry = store.get('spa_WithSrc_l0')!;
      expect(entry.sourceFile).toBe('scene.ply');
    });

    it('sourceFile is undefined when not provided', () => {
      store.register(makeResult([
        makeAnchor('NoSrc', 0, 100),
      ]));

      const entry = store.get('spa_NoSrc_l0')!;
      expect(entry.sourceFile).toBeUndefined();
    });
  });
});