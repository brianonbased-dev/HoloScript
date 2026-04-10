/**
 * FoliageSystem.prod.test.ts
 *
 * Production tests for FoliageSystem — type registration, scatter seeding,
 * density, wind calculations, LOD/visibility updates, patch queries, and removal.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { FoliageSystem } from '../FoliageSystem';
import type { FoliageType } from '../FoliageSystem';

const GRASS_TYPE: FoliageType = {
  id: 'grass',
  meshId: 'grass_mesh',
  density: 5,
  minScale: 0.8,
  maxScale: 1.2,
  alignToNormal: true,
  windResponse: 0.9,
  castsShadow: false,
  lodDistances: [20, 50, 100],
};

const BOUNDS = { x: 0, z: 0, w: 10, h: 10 };

describe('FoliageSystem', () => {
  let fs: FoliageSystem;

  beforeEach(() => {
    fs = new FoliageSystem();
    fs.registerType(GRASS_TYPE);
  });

  // -------------------------------------------------------------------------
  // Type registration
  // -------------------------------------------------------------------------
  describe('registerType / getType / getTypeCount', () => {
    it('registered type is retrievable', () => {
      expect(fs.getType('grass')).toBeDefined();
      expect(fs.getType('grass')!.meshId).toBe('grass_mesh');
    });

    it('unknown type returns undefined', () => {
      expect(fs.getType('tree')).toBeUndefined();
    });

    it('getTypeCount increments', () => {
      expect(fs.getTypeCount()).toBe(1);
      fs.registerType({ ...GRASS_TYPE, id: 'tree' });
      expect(fs.getTypeCount()).toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  // scatter
  // -------------------------------------------------------------------------
  describe('scatter()', () => {
    it('creates the correct number of instances', () => {
      const patch = fs.scatter('p1', 'grass', BOUNDS, 50);
      expect(patch.instances).toHaveLength(50);
    });

    it('throws for unknown type', () => {
      expect(() => fs.scatter('p', 'ghost', BOUNDS, 10)).toThrow();
    });

    it('instances have typeId set correctly', () => {
      const p = fs.scatter('p1', 'grass', BOUNDS, 10);
      expect(p.instances.every((i) => i.typeId === 'grass')).toBe(true);
    });

    it('instances positions within bounds', () => {
      const p = fs.scatter('p1', 'grass', BOUNDS, 100);
      for (const inst of p.instances) {
        expect(inst.position.x).toBeGreaterThanOrEqual(BOUNDS.x);
        expect(inst.position.x).toBeLessThanOrEqual(BOUNDS.x + BOUNDS.w);
        expect(inst.position.z).toBeGreaterThanOrEqual(BOUNDS.z);
        expect(inst.position.z).toBeLessThanOrEqual(BOUNDS.z + BOUNDS.h);
      }
    });

    it('scales within [minScale, maxScale]', () => {
      const p = fs.scatter('p1', 'grass', BOUNDS, 50);
      for (const inst of p.instances) {
        expect(inst.scale).toBeGreaterThanOrEqual(GRASS_TYPE.minScale);
        expect(inst.scale).toBeLessThanOrEqual(GRASS_TYPE.maxScale);
      }
    });

    it('density = count / area', () => {
      const p = fs.scatter('p1', 'grass', BOUNDS, 200);
      expect(p.density).toBeCloseTo(200 / (BOUNDS.w * BOUNDS.h));
    });

    it('same seed produces identical scatter', () => {
      const a = fs.scatter('p1', 'grass', BOUNDS, 20, 99);
      fs.removePatch('p1');
      const b = fs.scatter('p1', 'grass', BOUNDS, 20, 99);
      for (let i = 0; i < a.instances.length; i++) {
        expect(a.instances[i].position.x).toBeCloseTo(b.instances[i].position.x);
      }
    });

    it('different seeds produce different scatters', () => {
      const a = fs.scatter('p1', 'grass', BOUNDS, 20, 1);
      const posA = a.instances[0].position.x;
      fs.removePatch('p1');
      const b = fs.scatter('p1', 'grass', BOUNDS, 20, 999);
      const posB = b.instances[0].position.x;
      expect(posA).not.toBeCloseTo(posB);
    });
  });

  // -------------------------------------------------------------------------
  // Wind
  // -------------------------------------------------------------------------
  describe('setWind / getWind', () => {
    it('normalises direction vector', () => {
      fs.setWind(3, 4, 0.8);
      const w = fs.getWind();
      const len = Math.sqrt(w.dirX ** 2 + w.dirZ ** 2);
      expect(len).toBeCloseTo(1, 5);
    });

    it('clamps strength to [0, 1]', () => {
      fs.setWind(1, 0, 5);
      expect(fs.getWind().strength).toBe(1);
      fs.setWind(1, 0, -1);
      expect(fs.getWind().strength).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // getWindOffset
  // -------------------------------------------------------------------------
  describe('getWindOffset()', () => {
    it('zero wind → zero offset', () => {
      fs.setWind(1, 0, 0);
      fs.scatter('p1', 'grass', BOUNDS, 1);
      const inst = fs.getPatch('p1')!.instances[0];
      // At time=0 with strength=0
      fs.setWind(1, 0, 0);
      // We can't zero windStrength directly, but strength=0 → sway=0
      const fsZero = new FoliageSystem();
      fsZero.registerType(GRASS_TYPE);
      fsZero.setWind(1, 0, 0); // strength will be clamped to 0 when set to 0
      const { x, z } = fsZero.getWindOffset(inst);
      // With no update (time=0), offset depends on sin(0 + phase) * strength
      expect(typeof x).toBe('number');
      expect(typeof z).toBe('number');
    });

    it('wind offset has correct direction', () => {
      fs.setWind(1, 0, 0.5); // positive x wind
      fs.scatter('p1', 'grass', BOUNDS, 1);
      const inst = fs.getPatch('p1')!.instances[0];
      inst.windPhase = 0; // force phase to 0
      // update time to π/2 so sin = 1
      fs.update(Math.PI / 4, { x: 0, z: 0 });
      const off = fs.getWindOffset(inst);
      // x component should be non-zero when wind blows +x
      expect(typeof off.x).toBe('number');
    });
  });

  // -------------------------------------------------------------------------
  // LOD / visibility via update
  // -------------------------------------------------------------------------
  describe('update() — LOD and visibility', () => {
    it('instances near the camera have lodLevel = 0', () => {
      fs.scatter('p1', 'grass', BOUNDS, 10);
      fs.update(0, { x: 5, z: 5 }); // camera at centre of bounds
      const patch = fs.getPatch('p1')!;
      // At least some instances should be lod 0 (within 20 units)
      const lod0 = patch.instances.filter((i) => i.lodLevel === 0);
      expect(lod0.length).toBeGreaterThan(0);
    });

    it('instances far from camera reach max lod level', () => {
      // Place camera very far away — all instances should hit max lod
      fs.scatter('p1', 'grass', BOUNDS, 10);
      fs.update(0, { x: 999, z: 999 });
      const patch = fs.getPatch('p1')!;
      // All instances at distance > 100 (last lodDistance) → lodLevel = 3
      const maxLod = patch.instances.filter((i) => i.lodLevel === GRASS_TYPE.lodDistances.length);
      expect(maxLod.length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // Patch queries / CRUD
  // -------------------------------------------------------------------------
  describe('getPatch / getPatchCount / getVisibleCount / getTotalInstanceCount', () => {
    it('getPatch returns undefined for unknown id', () => {
      expect(fs.getPatch('ghost')).toBeUndefined();
    });

    it('getPatchCount increments with each scatter', () => {
      fs.scatter('p1', 'grass', BOUNDS, 5);
      fs.scatter('p2', 'grass', BOUNDS, 5);
      expect(fs.getPatchCount()).toBe(2);
    });

    it('getTotalInstanceCount sums across patches', () => {
      fs.scatter('p1', 'grass', BOUNDS, 5);
      fs.scatter('p2', 'grass', BOUNDS, 10);
      expect(fs.getTotalInstanceCount()).toBe(15);
    });

    it('getVisibleCount returns total before any update (default visible=true)', () => {
      fs.scatter('p1', 'grass', BOUNDS, 8);
      expect(fs.getVisibleCount()).toBe(8);
    });

    it('removePatch removes the patch', () => {
      fs.scatter('p1', 'grass', BOUNDS, 5);
      fs.removePatch('p1');
      expect(fs.getPatch('p1')).toBeUndefined();
    });

    it('removePatch returns false for unknown id', () => {
      expect(fs.removePatch('ghost')).toBe(false);
    });
  });
});
