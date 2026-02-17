/**
 * InfluenceMap Unit Tests
 *
 * Tests grid-based influence: layers, set/add/stamp,
 * propagation, decay, and spatial queries.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InfluenceMap } from '../InfluenceMap';

describe('InfluenceMap', () => {
  let map: InfluenceMap;

  beforeEach(() => {
    map = new InfluenceMap({
      width: 10, height: 10, cellSize: 1,
      decayRate: 0.1, propagationRate: 0.2, maxValue: 100,
    });
  });

  describe('layer management', () => {
    it('should add and list layers', () => {
      map.addLayer('threat');
      map.addLayer('resources');
      expect(map.getLayerNames()).toEqual(['threat', 'resources']);
    });

    it('should remove layers', () => {
      map.addLayer('threat');
      map.removeLayer('threat');
      expect(map.getLayerNames()).toEqual([]);
    });
  });

  describe('influence modification', () => {
    it('should set and get influence', () => {
      map.addLayer('threat');
      map.setInfluence('threat', 5, 5, 50);
      expect(map.getInfluence('threat', 5, 5)).toBe(50);
    });

    it('should add influence cumulatively', () => {
      map.addLayer('threat');
      map.setInfluence('threat', 3, 3, 10);
      map.addInfluence('threat', 3, 3, 20);
      expect(map.getInfluence('threat', 3, 3)).toBe(30);
    });

    it('should clamp to maxValue', () => {
      map.addLayer('threat');
      map.setInfluence('threat', 0, 0, 999);
      expect(map.getInfluence('threat', 0, 0)).toBe(100);
    });

    it('should return 0 for out-of-bounds', () => {
      map.addLayer('threat');
      expect(map.getInfluence('threat', -1, -1)).toBe(0);
      expect(map.getInfluence('threat', 100, 100)).toBe(0);
    });

    it('should return 0 for non-existent layer', () => {
      expect(map.getInfluence('nope', 0, 0)).toBe(0);
    });
  });

  describe('stampRadius', () => {
    it('should stamp influence in a radius', () => {
      map.addLayer('threat');
      map.stampRadius('threat', 5, 5, 2, 50);
      expect(map.getInfluence('threat', 5, 5)).toBeGreaterThan(0);
      expect(map.getInfluence('threat', 6, 5)).toBeGreaterThan(0);
      // Far away should remain 0
      expect(map.getInfluence('threat', 0, 0)).toBe(0);
    });
  });

  describe('world coordinates', () => {
    it('should convert world to grid coordinates', () => {
      map.addLayer('r');
      map.setInfluence('r', 3, 7, 42);
      expect(map.getInfluenceAtWorld('r', 3.5, 7.2)).toBe(42);
    });
  });

  describe('propagation and decay', () => {
    it('should spread influence to neighbors on update', () => {
      map.addLayer('threat');
      map.setInfluence('threat', 5, 5, 100);
      map.update();
      // Center should have decayed
      expect(map.getInfluence('threat', 5, 5)).toBeLessThan(100);
      // Neighbors should have gained some
      expect(map.getInfluence('threat', 4, 5)).toBeGreaterThan(0);
    });

    it('should decay influence over updates', () => {
      map.addLayer('threat');
      map.setInfluence('threat', 5, 5, 100);
      const v0 = map.getInfluence('threat', 5, 5);
      map.update();
      const v1 = map.getInfluence('threat', 5, 5);
      map.update();
      const v2 = map.getInfluence('threat', 5, 5);
      expect(v1).toBeLessThan(v0);
      expect(v2).toBeLessThan(v1);
    });
  });

  describe('getMaxCell', () => {
    it('should find the cell with max influence', () => {
      map.addLayer('r');
      map.setInfluence('r', 3, 7, 10);
      map.setInfluence('r', 2, 2, 90);
      const max = map.getMaxCell('r');
      expect(max.x).toBe(2);
      expect(max.y).toBe(2);
      expect(max.value).toBe(90);
    });

    it('should return zero for non-existent layer', () => {
      const max = map.getMaxCell('nope');
      expect(max.value).toBe(0);
    });
  });

  describe('clear', () => {
    it('should clear a specific layer', () => {
      map.addLayer('a');
      map.addLayer('b');
      map.setInfluence('a', 0, 0, 50);
      map.setInfluence('b', 0, 0, 50);
      map.clear('a');
      expect(map.getInfluence('a', 0, 0)).toBe(0);
      expect(map.getInfluence('b', 0, 0)).toBe(50);
    });

    it('should clear all layers', () => {
      map.addLayer('a');
      map.addLayer('b');
      map.setInfluence('a', 0, 0, 50);
      map.setInfluence('b', 0, 0, 50);
      map.clearAll();
      expect(map.getInfluence('a', 0, 0)).toBe(0);
      expect(map.getInfluence('b', 0, 0)).toBe(0);
    });
  });
});
