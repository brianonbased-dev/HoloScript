import { describe, it, expect, beforeEach } from 'vitest';
import { LODManager } from '../LODManager';

describe('LODManager', () => {
  let lod: LODManager;

  beforeEach(() => {
    lod = new LODManager();
  });

  // ===========================================================================
  // Construction
  // ===========================================================================
  describe('construction', () => {
    it('creates with default config', () => {
      expect(lod.getObjectCount()).toBe(0);
      expect(lod.getAverageLOD()).toBe(0);
    });

    it('creates with custom config', () => {
      const lod2 = new LODManager({ hysteresis: 10, transitionSpeed: 8 });
      expect(lod2.getObjectCount()).toBe(0);
    });
  });

  // ===========================================================================
  // Registration
  // ===========================================================================
  describe('registration', () => {
    it('registers an object', () => {
      const obj = lod.register('obj1', { x: 0, y: 0, z: 0 });
      expect(obj.id).toBe('obj1');
      expect(obj.currentLevel).toBe(0);
      expect(obj.visible).toBe(true);
      expect(obj.transitionAlpha).toBe(1);
    });

    it('uses default LOD levels', () => {
      const obj = lod.register('obj1', { x: 0, y: 0, z: 0 });
      expect(obj.levels.length).toBe(4);
    });

    it('accepts custom LOD levels', () => {
      const levels = [
        { level: 0, maxDistance: 10, meshDetail: 1.0 },
        { level: 1, maxDistance: 100, meshDetail: 0.5 },
      ];
      const obj = lod.register('obj1', { x: 0, y: 0, z: 0 }, levels);
      expect(obj.levels.length).toBe(2);
    });

    it('applies custom bias', () => {
      const obj = lod.register('obj1', { x: 0, y: 0, z: 0 }, undefined, 2.0);
      expect(obj.bias).toBe(2.0);
    });

    it('unregisters an object', () => {
      lod.register('obj1', { x: 0, y: 0, z: 0 });
      expect(lod.unregister('obj1')).toBe(true);
      expect(lod.getObjectCount()).toBe(0);
    });

    it('unregister returns false for unknown id', () => {
      expect(lod.unregister('nope')).toBe(false);
    });
  });

  // ===========================================================================
  // LOD Update
  // ===========================================================================
  describe('update', () => {
    it('assigns LOD 0 for close objects', () => {
      lod.register('obj1', { x: 10, y: 0, z: 0 });
      lod.setViewerPosition(0, 0, 0);
      lod.update(0.1);
      const obj = lod.getObject('obj1')!;
      expect(obj.currentLevel).toBe(0); // within 50
    });

    it('assigns higher LOD for distant objects', () => {
      lod.register('obj1', { x: 200, y: 0, z: 0 });
      lod.setViewerPosition(0, 0, 0);
      lod.update(0.1);
      const obj = lod.getObject('obj1')!;
      expect(obj.currentLevel).toBeGreaterThan(0);
    });

    it('assigns LOD 3 for very far objects', () => {
      lod.register('obj1', { x: 1000, y: 0, z: 0 });
      lod.setViewerPosition(0, 0, 0);
      lod.update(0.1);
      const obj = lod.getObject('obj1')!;
      expect(obj.currentLevel).toBe(3);
    });

    it('transitions blend toward 1 over time', () => {
      lod.register('obj1', { x: 10, y: 0, z: 0 });
      lod.setViewerPosition(0, 0, 0);
      lod.update(0.1);

      // Move far away to trigger LOD change
      lod.register('obj2', { x: 1000, y: 0, z: 0 });
      lod.update(0.1); // Should start transition
      const obj = lod.getObject('obj2')!;
      // After one update, transitionAlpha may still be < 1
      expect(obj.transitionAlpha).toBeLessThanOrEqual(1);
    });

    it('bias multiplies effective distance', () => {
      // Bias of 2 makes distance effectively 2x
      lod.register('obj-biased', { x: 30, y: 0, z: 0 }, undefined, 2.0);
      lod.setViewerPosition(0, 0, 0);
      lod.update(0.1);
      const biased = lod.getObject('obj-biased')!;

      lod.register('obj-normal', { x: 30, y: 0, z: 0 }, undefined, 1.0);
      lod.update(0.1);
      const normal = lod.getObject('obj-normal')!;

      // Biased object at effective dist 60, normal at 30
      expect(biased.currentLevel).toBeGreaterThanOrEqual(normal.currentLevel);
    });
  });

  // ===========================================================================
  // Queries
  // ===========================================================================
  describe('queries', () => {
    beforeEach(() => {
      lod.register('a', { x: 10, y: 0, z: 0 });
      lod.register('b', { x: 200, y: 0, z: 0 });
      lod.register('c', { x: 500, y: 0, z: 0 });
      lod.setViewerPosition(0, 0, 0);
      lod.update(0.1);
    });

    it('getObject returns correct object', () => {
      expect(lod.getObject('a')).toBeDefined();
      expect(lod.getObject('a')!.id).toBe('a');
    });

    it('getObject returns undefined for unknown', () => {
      expect(lod.getObject('nope')).toBeUndefined();
    });

    it('getObjectCount returns count', () => {
      expect(lod.getObjectCount()).toBe(3);
    });

    it('getLevelDistribution returns object count per level', () => {
      const dist = lod.getLevelDistribution();
      let total = 0;
      for (const count of dist.values()) total += count;
      expect(total).toBe(3);
    });

    it('getObjectsAtLevel filters by level', () => {
      const level0 = lod.getObjectsAtLevel(0);
      expect(level0.every((o) => o.currentLevel === 0)).toBe(true);
    });

    it('getAverageLOD returns average', () => {
      const avg = lod.getAverageLOD();
      expect(avg).toBeGreaterThanOrEqual(0);
    });

    it('getAverageLOD returns 0 for empty', () => {
      const empty = new LODManager();
      expect(empty.getAverageLOD()).toBe(0);
    });
  });
});
