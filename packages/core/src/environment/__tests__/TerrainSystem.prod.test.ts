/**
 * TerrainSystem.prod.test.ts
 *
 * Production tests for TerrainSystem — terrain creation, heightmap access,
 * bilinear interpolation, normals, setHeightAt clamping, layers, collider, and removal.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TerrainSystem } from '../TerrainSystem';
import type { TerrainConfig } from '../TerrainSystem';

const BASE_CONFIG: TerrainConfig = {
  id: 'test-terrain',
  width: 100,
  depth: 100,
  resolution: 33, // Fast for tests — still power-of-2+1 class
  maxHeight: 50,
  position: { x: 0, y: 0, z: 0 },
};

describe('TerrainSystem', () => {
  let ts: TerrainSystem;

  beforeEach(() => {
    ts = new TerrainSystem();
  });

  // -------------------------------------------------------------------------
  // createTerrain
  // -------------------------------------------------------------------------
  describe('createTerrain()', () => {
    it('returns the terrain id', () => {
      expect(ts.createTerrain(BASE_CONFIG)).toBe('test-terrain');
    });

    it('terrain is accessible via getTerrain()', () => {
      ts.createTerrain(BASE_CONFIG);
      expect(ts.getTerrain('test-terrain')).toBeDefined();
    });

    it('heightmap has correct size (res × res)', () => {
      ts.createTerrain(BASE_CONFIG);
      const t = ts.getTerrain('test-terrain')!;
      expect(t.heightmap.length).toBe(BASE_CONFIG.resolution ** 2);
    });

    it('heightmap values in [0, 1]', () => {
      ts.createTerrain(BASE_CONFIG);
      const t = ts.getTerrain('test-terrain')!;
      for (const h of t.heightmap) {
        expect(h).toBeGreaterThanOrEqual(0);
        expect(h).toBeLessThanOrEqual(1);
      }
    });

    it('generates chunks', () => {
      ts.createTerrain(BASE_CONFIG);
      expect(ts.getChunks('test-terrain').length).toBeGreaterThan(0);
    });

    it('default layers are created', () => {
      ts.createTerrain(BASE_CONFIG);
      expect(ts.getLayers('test-terrain').length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // createFromHeightmap
  // -------------------------------------------------------------------------
  describe('createFromHeightmap()', () => {
    it('uses provided heightmap', () => {
      const res = BASE_CONFIG.resolution;
      const hm = new Float32Array(res * res).fill(0.5);
      ts.createFromHeightmap(BASE_CONFIG, hm);
      const t = ts.getTerrain('test-terrain')!;
      expect(t.heightmap[0]).toBeCloseTo(0.5);
    });

    it('flat heightmap: all heights at maxHeight/2 + position.y', () => {
      const res = BASE_CONFIG.resolution;
      const hm = new Float32Array(res * res).fill(0.5);
      ts.createFromHeightmap(BASE_CONFIG, hm);
      const h = ts.getHeightAt('test-terrain', 50, 50);
      expect(h).toBeCloseTo(0 + 0.5 * 50); // position.y + 0.5 * maxHeight
    });
  });

  // -------------------------------------------------------------------------
  // getHeightAt
  // -------------------------------------------------------------------------
  describe('getHeightAt()', () => {
    beforeEach(() => {
      ts.createTerrain(BASE_CONFIG);
    });

    it('returns 0 for unknown terrain', () => {
      expect(ts.getHeightAt('ghost', 0, 0)).toBe(0);
    });

    it('returns 0 for out-of-bounds world position', () => {
      expect(ts.getHeightAt('test-terrain', 999, 999)).toBe(0);
    });

    it('height at world centre is within [0, maxHeight]', () => {
      const h = ts.getHeightAt('test-terrain', 50, 50);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(BASE_CONFIG.maxHeight);
    });

    it('height at corner (0,0) is within [0, maxHeight]', () => {
      const h = ts.getHeightAt('test-terrain', 0, 0);
      expect(h).toBeGreaterThanOrEqual(0);
    });
  });

  // -------------------------------------------------------------------------
  // setHeightAt
  // -------------------------------------------------------------------------
  describe('setHeightAt()', () => {
    beforeEach(() => {
      const res = BASE_CONFIG.resolution;
      ts.createFromHeightmap(BASE_CONFIG, new Float32Array(res * res).fill(0));
    });

    it('sets a specific grid height', () => {
      ts.setHeightAt('test-terrain', 0, 0, 1.0);
      const t = ts.getTerrain('test-terrain')!;
      expect(t.heightmap[0]).toBe(1.0);
    });

    it('clamps height to [0, 1]', () => {
      ts.setHeightAt('test-terrain', 0, 0, 5);
      expect(ts.getTerrain('test-terrain')!.heightmap[0]).toBe(1);
      ts.setHeightAt('test-terrain', 0, 0, -1);
      expect(ts.getTerrain('test-terrain')!.heightmap[0]).toBe(0);
    });

    it('ignores out-of-bounds grid positions', () => {
      ts.setHeightAt('test-terrain', -1, 0, 1);
      ts.setHeightAt('test-terrain', 999, 0, 1);
      // No throw, no state corruption
      expect(ts.getTerrain('test-terrain')).toBeDefined();
    });

    it('no-op for unknown terrain', () => {
      expect(() => ts.setHeightAt('ghost', 0, 0, 0.5)).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // getNormalAt
  // -------------------------------------------------------------------------
  describe('getNormalAt()', () => {
    it('normal on flat terrain points mostly upward', () => {
      const res = BASE_CONFIG.resolution;
      const hm = new Float32Array(res * res).fill(0.5);
      ts.createFromHeightmap(BASE_CONFIG, hm);
      const n = ts.getNormalAt('test-terrain', 50, 50);
      expect(n.y).toBeGreaterThan(0.9); // mostly up
    });

    it('normal is unit length (approx)', () => {
      ts.createTerrain(BASE_CONFIG);
      const n = ts.getNormalAt('test-terrain', 50, 50);
      const len = Math.sqrt(n.x ** 2 + n.y ** 2 + n.z ** 2);
      expect(len).toBeCloseTo(1, 5);
    });
  });

  // -------------------------------------------------------------------------
  // Layers
  // -------------------------------------------------------------------------
  describe('setLayers / getLayers', () => {
    it('setLayers replaces defaults', () => {
      ts.createTerrain(BASE_CONFIG);
      ts.setLayers('test-terrain', [
        {
          id: 'lava',
          texture: 'lava_tex',
          tiling: 5,
          minHeight: 0,
          maxHeight: 1,
          minSlope: 0,
          maxSlope: 1,
        },
      ]);
      expect(ts.getLayers('test-terrain')).toHaveLength(1);
    });

    it('getLayers returns [] for unknown terrain', () => {
      expect(ts.getLayers('ghost')).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Collider
  // -------------------------------------------------------------------------
  describe('getCollider()', () => {
    it('returns null for unknown terrain', () => {
      expect(ts.getCollider('ghost')).toBeNull();
    });

    it('collider.getHeightAt proxies correctly', () => {
      const res = BASE_CONFIG.resolution;
      const hm = new Float32Array(res * res).fill(0.5);
      ts.createFromHeightmap(BASE_CONFIG, hm);
      const col = ts.getCollider('test-terrain')!;
      expect(col.getHeightAt(50, 50)).toBeCloseTo(25); // 0.5 * maxHeight
    });

    it('collider.getNormalAt returns unit vector', () => {
      ts.createTerrain(BASE_CONFIG);
      const col = ts.getCollider('test-terrain')!;
      const n = col.getNormalAt(50, 50);
      const len = Math.sqrt(n.x ** 2 + n.y ** 2 + n.z ** 2);
      expect(len).toBeCloseTo(1, 4);
    });
  });

  // -------------------------------------------------------------------------
  // CRUD
  // -------------------------------------------------------------------------
  describe('getTerrainIds / removeTerrain', () => {
    it('getTerrainIds lists created terrains', () => {
      ts.createTerrain(BASE_CONFIG);
      expect(ts.getTerrainIds()).toContain('test-terrain');
    });

    it('removeTerrain removes it', () => {
      ts.createTerrain(BASE_CONFIG);
      ts.removeTerrain('test-terrain');
      expect(ts.getTerrain('test-terrain')).toBeUndefined();
    });

    it('returns false for unknown terrain', () => {
      expect(ts.removeTerrain('ghost')).toBe(false);
    });
  });
});
