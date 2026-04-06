/**
 * LODBridge.test.ts — Tests for Core→Renderer LOD Pipeline Bridge
 *
 * Verifies:
 * 1. LODChain computation from source MeshData
 * 2. Distance-based LOD level selection
 * 3. LRU cache behavior with eviction
 * 4. Draft-aware bypass (draft maturity skips LOD computation)
 * 5. getLODConfig() output format for LODMeshNode
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { LODBridge } from '../LODBridge';
import { createTestCube, createTestSphere, type MeshData } from '../LODGenerator';

describe('LODBridge', () => {
  let bridge: LODBridge;
  let testMesh: MeshData;

  beforeEach(() => {
    bridge = new LODBridge({
      defaultDistances: [0, 10, 25, 50],
      maxCacheSize: 4,
    });
    testMesh = createTestCube();
  });

  describe('chain computation', () => {
    it('computes LOD chain from source mesh', () => {
      const chain = bridge.computeChain('entity-1', testMesh);
      expect(chain.entityId).toBe('entity-1');
      expect(chain.source).toBe(testMesh);
      expect(chain.levels.length).toBeGreaterThanOrEqual(1);
      expect(chain.maturity).toBe('mesh'); // default
      expect(chain.computedAt).toBeGreaterThan(0);
    });

    it('stores chain in cache', () => {
      bridge.computeChain('entity-1', testMesh);
      expect(bridge.hasChain('entity-1')).toBe(true);
      expect(bridge.getChain('entity-1')).not.toBeNull();
    });

    it('returns null for uncached entity', () => {
      expect(bridge.getChain('unknown')).toBeNull();
      expect(bridge.hasChain('unknown')).toBe(false);
    });
  });

  describe('draft-aware bypass', () => {
    it('skips LOD computation for draft maturity', () => {
      const chain = bridge.computeChain('entity-1', testMesh, 'draft');
      expect(chain.maturity).toBe('draft');
      expect(chain.levels).toHaveLength(1); // Single level — no simplification
      expect(chain.levels[0].ratio).toBe(1.0);
      expect(chain.distances).toEqual([0]);
    });

    it('computes full LOD for mesh maturity', () => {
      const sphere = createTestSphere(16); // Higher poly for LOD generation
      const chain = bridge.computeChain('entity-1', sphere, 'mesh');
      expect(chain.maturity).toBe('mesh');
      expect(chain.levels.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('LOD selection', () => {
    it('selects appropriate LOD by distance', () => {
      const sphere = createTestSphere(16);
      bridge.computeChain('entity-1', sphere);

      // Close distance → highest detail (LOD 0)
      const close = bridge.selectLOD('entity-1', 0);
      expect(close).not.toBeNull();

      // Far distance → lowest detail
      const far = bridge.selectLOD('entity-1', 100);
      expect(far).not.toBeNull();
    });

    it('returns null for unknown entity', () => {
      expect(bridge.selectLOD('unknown', 10)).toBeNull();
    });
  });

  describe('getLODConfig', () => {
    it('returns LOD config in renderer format', () => {
      const sphere = createTestSphere(16);
      bridge.computeChain('entity-1', sphere);

      const config = bridge.getLODConfig('entity-1');
      expect(config).not.toBeNull();
      if (config) {
        expect(config.levels).toBeDefined();
        expect(config.transition).toBeDefined();
        expect(config.hysteresis).toBe(0.1); // 10% anti-thrashing
      }
    });

    it('returns null for unknown entity', () => {
      expect(bridge.getLODConfig('unknown')).toBeNull();
    });
  });

  describe('LRU cache', () => {
    it('evicts oldest when at capacity', () => {
      // maxCacheSize = 4
      bridge.computeChain('a', testMesh);
      bridge.computeChain('b', testMesh);
      bridge.computeChain('c', testMesh);
      bridge.computeChain('d', testMesh);

      expect(bridge.stats.size).toBe(4);

      // Adding 5th should evict 'a'
      bridge.computeChain('e', testMesh);
      expect(bridge.stats.size).toBe(4);
      expect(bridge.hasChain('a')).toBe(false);
      expect(bridge.hasChain('e')).toBe(true);
    });

    it('invalidate removes single chain', () => {
      bridge.computeChain('entity-1', testMesh);
      expect(bridge.hasChain('entity-1')).toBe(true);

      bridge.invalidate('entity-1');
      expect(bridge.hasChain('entity-1')).toBe(false);
    });

    it('clear removes all chains', () => {
      bridge.computeChain('a', testMesh);
      bridge.computeChain('b', testMesh);
      expect(bridge.stats.size).toBe(2);

      bridge.clear();
      expect(bridge.stats.size).toBe(0);
    });
  });

  describe('stats', () => {
    it('reports cache size and max size', () => {
      expect(bridge.stats.size).toBe(0);
      expect(bridge.stats.maxSize).toBe(4);

      bridge.computeChain('a', testMesh);
      expect(bridge.stats.size).toBe(1);
    });
  });
});
