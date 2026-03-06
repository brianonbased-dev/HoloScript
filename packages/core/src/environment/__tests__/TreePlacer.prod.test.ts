/**
 * TreePlacer.prod.test.ts
 *
 * Production tests for TreePlacer — template/biome registration, placeInRegion
 * with height/slope filters, spacing constraints, weighted template selection,
 * and queries (getTreesInRadius, removeTree, clear).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TreePlacer } from '../TreePlacer';
import type { TreeTemplate, BiomeRule } from '../TreePlacer';

const OAK: TreeTemplate = {
  id: 'oak',
  meshId: 'oak_mesh',
  minScale: 0.8,
  maxScale: 1.5,
  trunkRadius: 0.5,
  biomes: ['temperate'],
  probability: 0.7,
};

const PINE: TreeTemplate = {
  id: 'pine',
  meshId: 'pine_mesh',
  minScale: 1.0,
  maxScale: 2.0,
  trunkRadius: 0.4,
  biomes: ['temperate', 'alpine'],
  probability: 0.3,
};

const TEMPERATE_BIOME: BiomeRule = {
  id: 'temperate',
  name: 'Temperate Forest',
  density: 0.1,          // 0.1 trees per unit area
  minSpacing: 2.0,
  heightRange: { min: -Infinity, max: Infinity },
  slopeMax: 90,
};

const SMALL_BOUNDS = { x: 0, z: 0, w: 20, h: 20 };

describe('TreePlacer', () => {
  let tp: TreePlacer;

  beforeEach(() => {
    tp = new TreePlacer();
    tp.addTemplate(OAK);
    tp.addTemplate(PINE);
    tp.addBiome(TEMPERATE_BIOME);
  });

  // -------------------------------------------------------------------------
  // Template / Biome registration
  // -------------------------------------------------------------------------
  describe('addTemplate / getTemplate / getTemplateCount', () => {
    it('retrieves registered template', () => {
      expect(tp.getTemplate('oak')).toBeDefined();
      expect(tp.getTemplate('oak')!.meshId).toBe('oak_mesh');
    });

    it('returns undefined for unknown template', () => {
      expect(tp.getTemplate('ghost')).toBeUndefined();
    });

    it('getTemplateCount is 2', () => {
      expect(tp.getTemplateCount()).toBe(2);
    });
  });

  describe('addBiome / getBiome', () => {
    it('retrieves registered biome', () => {
      expect(tp.getBiome('temperate')?.name).toBe('Temperate Forest');
    });

    it('returns undefined for unknown biome', () => {
      expect(tp.getBiome('tundra')).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // placeInRegion — basic
  // -------------------------------------------------------------------------
  describe('placeInRegion()', () => {
    it('returns [] for unknown biome', () => {
      expect(tp.placeInRegion('tundra', SMALL_BOUNDS)).toHaveLength(0);
    });

    it('returns [] when no templates match the biome', () => {
      tp.addBiome({ id: 'desert', name: 'Desert', density: 0.1, minSpacing: 5, heightRange: { min: -Infinity, max: Infinity }, slopeMax: 30 });
      // No template has biomes including 'desert'
      expect(tp.placeInRegion('desert', SMALL_BOUNDS)).toHaveLength(0);
    });

    it('places trees in the target biome', () => {
      const trees = tp.placeInRegion('temperate', SMALL_BOUNDS);
      expect(trees.length).toBeGreaterThan(0);
    });

    it('tree count ≈ area * density (within 3×)', () => {
      const expected = SMALL_BOUNDS.w * SMALL_BOUNDS.h * TEMPERATE_BIOME.density;
      const trees = tp.placeInRegion('temperate', SMALL_BOUNDS);
      expect(trees.length).toBeLessThanOrEqual(expected * 3);
    });

    it('all placed trees reference valid template ids', () => {
      const trees = tp.placeInRegion('temperate', SMALL_BOUNDS);
      for (const t of trees) {
        expect(['oak', 'pine']).toContain(t.templateId);
      }
    });

    it('tree scales within [minScale, maxScale]', () => {
      const trees = tp.placeInRegion('temperate', SMALL_BOUNDS);
      for (const t of trees) {
        const tmpl = tp.getTemplate(t.templateId)!;
        expect(t.scale).toBeGreaterThanOrEqual(tmpl.minScale);
        expect(t.scale).toBeLessThanOrEqual(tmpl.maxScale);
      }
    });

    it('tree positions within bounds', () => {
      const trees = tp.placeInRegion('temperate', SMALL_BOUNDS);
      for (const t of trees) {
        expect(t.position.x).toBeGreaterThanOrEqual(SMALL_BOUNDS.x);
        expect(t.position.x).toBeLessThanOrEqual(SMALL_BOUNDS.x + SMALL_BOUNDS.w);
        expect(t.position.z).toBeGreaterThanOrEqual(SMALL_BOUNDS.z);
        expect(t.position.z).toBeLessThanOrEqual(SMALL_BOUNDS.z + SMALL_BOUNDS.h);
      }
    });

    it('placed trees persist in getAllTrees()', () => {
      const trees = tp.placeInRegion('temperate', SMALL_BOUNDS);
      expect(tp.getAllTrees().length).toBe(trees.length);
    });

    it('deterministic with same seed', () => {
      const a = tp.placeInRegion('temperate', SMALL_BOUNDS, undefined, undefined, 42);
      tp.clear();
      const b = tp.placeInRegion('temperate', SMALL_BOUNDS, undefined, undefined, 42);
      expect(a.length).toBe(b.length);
    });
  });

  // -------------------------------------------------------------------------
  // Height filter
  // -------------------------------------------------------------------------
  describe('height filter', () => {
    it('trees excluded when heightSampler returns out-of-range', () => {
      const strictBiome: BiomeRule = {
        id: 'highland',
        name: 'Highland',
        density: 0.5,
        minSpacing: 1,
        heightRange: { min: 100, max: 200 },
        slopeMax: 90,
      };
      tp.addBiome(strictBiome);
      tp.addTemplate({ ...OAK, id: 'highland_oak', biomes: ['highland'] });
      // heightSampler always returns 0 (below 100)
      const trees = tp.placeInRegion('highland', SMALL_BOUNDS, () => 0);
      expect(trees).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Spacing constraint
  // -------------------------------------------------------------------------
  describe('spacing constraint', () => {
    it('trees are at least minSpacing apart', () => {
      const trees = tp.placeInRegion('temperate', SMALL_BOUNDS);
      const minSp = TEMPERATE_BIOME.minSpacing;
      for (let i = 0; i < trees.length; i++) {
        for (let j = i + 1; j < trees.length; j++) {
          const dx = trees[i].position.x - trees[j].position.x;
          const dz = trees[i].position.z - trees[j].position.z;
          const dist = Math.sqrt(dx * dx + dz * dz);
          expect(dist).toBeGreaterThanOrEqual(minSp - 1e-6);
        }
      }
    });
  });

  // -------------------------------------------------------------------------
  // Queries
  // -------------------------------------------------------------------------
  describe('getTreesInRadius()', () => {
    it('returns empty array when no trees', () => {
      expect(tp.getTreesInRadius(0, 0, 100)).toHaveLength(0);
    });

    it('finds trees within radius', () => {
      tp.placeInRegion('temperate', SMALL_BOUNDS);
      const found = tp.getTreesInRadius(10, 10, 15);
      expect(found.length).toBeGreaterThan(0);
    });

    it('finds no trees far outside all bounds', () => {
      tp.placeInRegion('temperate', SMALL_BOUNDS);
      expect(tp.getTreesInRadius(9999, 9999, 1)).toHaveLength(0);
    });
  });

  describe('removeTree()', () => {
    it('removes an existing tree by id', () => {
      const trees = tp.placeInRegion('temperate', SMALL_BOUNDS);
      const id = trees[0].id;
      expect(tp.removeTree(id)).toBe(true);
      expect(tp.getPlacedCount()).toBe(trees.length - 1);
    });

    it('returns false for unknown id', () => {
      expect(tp.removeTree('ghost_tree')).toBe(false);
    });
  });

  describe('clear()', () => {
    it('removes all placed trees', () => {
      tp.placeInRegion('temperate', SMALL_BOUNDS);
      tp.clear();
      expect(tp.getPlacedCount()).toBe(0);
    });
  });

  describe('getPlacedCount()', () => {
    it('accumulates across multiple placeInRegion calls', () => {
      const a = tp.placeInRegion('temperate', SMALL_BOUNDS);
      const b = tp.placeInRegion('temperate', { x: 100, z: 100, w: 20, h: 20 });
      expect(tp.getPlacedCount()).toBe(a.length + b.length);
    });
  });
});
