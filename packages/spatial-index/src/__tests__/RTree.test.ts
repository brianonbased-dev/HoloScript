import { describe, it, expect, beforeEach } from 'vitest';
import { RTree } from '../RTree';
import type { GeospatialAnchor } from '../types';

describe('RTree', () => {
  let rtree: RTree;

  beforeEach(() => {
    rtree = new RTree({ maxEntries: 9 });
  });

  describe('Insert and Search', () => {
    it('should insert and retrieve a single anchor', () => {
      const anchor: GeospatialAnchor = {
        id: 'anchor-1',
        lat: 37.7749,
        lon: -122.4194,
      };

      rtree.insert(anchor);
      const results = rtree.search({
        minLat: 37,
        minLon: -123,
        maxLat: 38,
        maxLon: -122,
      });

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('anchor-1');
    });

    it('should insert multiple anchors', () => {
      const anchors: GeospatialAnchor[] = [
        { id: 'a1', lat: 37.7749, lon: -122.4194 },
        { id: 'a2', lat: 37.7849, lon: -122.4094 },
        { id: 'a3', lat: 37.7649, lon: -122.4294 },
      ];

      for (const anchor of anchors) {
        rtree.insert(anchor);
      }

      const results = rtree.search({
        minLat: 37.76,
        minLon: -122.43,
        maxLat: 37.79,
        maxLon: -122.4,
      });

      expect(results.length).toBeGreaterThanOrEqual(2);
    });

    it('should not find anchors outside search bbox', () => {
      const anchor: GeospatialAnchor = {
        id: 'anchor-1',
        lat: 37.7749,
        lon: -122.4194,
      };

      rtree.insert(anchor);
      const results = rtree.search({
        minLat: 40,
        minLon: -120,
        maxLat: 41,
        maxLon: -119,
      });

      expect(results).toHaveLength(0);
    });
  });

  describe('Radius Search', () => {
    it('should find anchors within radius', () => {
      const center = { lat: 37.7749, lon: -122.4194 };
      const anchors: GeospatialAnchor[] = [
        { id: 'a1', lat: 37.7749, lon: -122.4194 }, // 0m
        { id: 'a2', lat: 37.7759, lon: -122.4194 }, // ~111m
        { id: 'a3', lat: 37.7849, lon: -122.4194 }, // ~1111m
      ];

      for (const anchor of anchors) {
        rtree.insert(anchor);
      }

      const results = rtree.searchRadius(center, 500);

      expect(results).toHaveLength(2);
      expect(results[0].anchor.id).toBe('a1');
      expect(results[0].distance).toBeLessThan(1);
      expect(results[1].distance).toBeLessThan(500);
    });

    it('should sort results by distance', () => {
      const center = { lat: 37.7749, lon: -122.4194 };
      const anchors: GeospatialAnchor[] = [
        { id: 'far', lat: 37.7849, lon: -122.4194 },
        { id: 'near', lat: 37.7759, lon: -122.4194 },
        { id: 'center', lat: 37.7749, lon: -122.4194 },
      ];

      for (const anchor of anchors) {
        rtree.insert(anchor);
      }

      const results = rtree.searchRadius(center, 2000);

      expect(results).toHaveLength(3);
      expect(results[0].anchor.id).toBe('center');
      expect(results[1].anchor.id).toBe('near');
      expect(results[2].anchor.id).toBe('far');
    });
  });

  describe('K-Nearest Neighbors', () => {
    it('should find k nearest neighbors', () => {
      const center = { lat: 37.7749, lon: -122.4194 };
      const anchors: GeospatialAnchor[] = [
        { id: 'a1', lat: 37.7749, lon: -122.4194 },
        { id: 'a2', lat: 37.7759, lon: -122.4194 },
        { id: 'a3', lat: 37.7849, lon: -122.4194 },
        { id: 'a4', lat: 37.7949, lon: -122.4194 },
        { id: 'a5', lat: 37.8049, lon: -122.4194 },
      ];

      for (const anchor of anchors) {
        rtree.insert(anchor);
      }

      const results = rtree.knn(center, 3);

      expect(results).toHaveLength(3);
      expect(results[0].anchor.id).toBe('a1');
      expect(results[1].anchor.id).toBe('a2');
      expect(results[2].anchor.id).toBe('a3');
    });

    it('should handle k larger than total anchors', () => {
      const center = { lat: 37.7749, lon: -122.4194 };
      const anchors: GeospatialAnchor[] = [
        { id: 'a1', lat: 37.7749, lon: -122.4194 },
        { id: 'a2', lat: 37.7759, lon: -122.4194 },
      ];

      for (const anchor of anchors) {
        rtree.insert(anchor);
      }

      const results = rtree.knn(center, 10);

      expect(results).toHaveLength(2);
    });
  });

  describe('Remove', () => {
    it('should remove an anchor', () => {
      const anchor: GeospatialAnchor = {
        id: 'anchor-1',
        lat: 37.7749,
        lon: -122.4194,
      };

      rtree.insert(anchor);
      expect(rtree.all()).toHaveLength(1);

      const removed = rtree.remove('anchor-1');
      expect(removed).toBe(true);
      expect(rtree.all()).toHaveLength(0);
    });

    it('should return false when removing non-existent anchor', () => {
      const removed = rtree.remove('non-existent');
      expect(removed).toBe(false);
    });

    it('should maintain tree integrity after removal', () => {
      const anchors: GeospatialAnchor[] = [
        { id: 'a1', lat: 37.7749, lon: -122.4194 },
        { id: 'a2', lat: 37.7849, lon: -122.4094 },
        { id: 'a3', lat: 37.7649, lon: -122.4294 },
      ];

      for (const anchor of anchors) {
        rtree.insert(anchor);
      }

      rtree.remove('a2');

      const results = rtree.search({
        minLat: 37.76,
        minLon: -122.43,
        maxLat: 37.79,
        maxLon: -122.4,
      });

      expect(results).toHaveLength(2);
      expect(results.find((r) => r.id === 'a2')).toBeUndefined();
    });
  });

  describe('Bulk Loading', () => {
    it('should bulk load anchors efficiently', () => {
      const anchors: GeospatialAnchor[] = [];
      for (let i = 0; i < 100; i++) {
        anchors.push({
          id: `anchor-${i}`,
          lat: 37.7 + Math.random() * 0.1,
          lon: -122.5 + Math.random() * 0.1,
        });
      }

      rtree.load(anchors);

      expect(rtree.all()).toHaveLength(100);

      const results = rtree.search({
        minLat: 37.7,
        minLon: -122.5,
        maxLat: 37.8,
        maxLon: -122.4,
      });

      expect(results.length).toBeGreaterThan(0);
    });

    it('should build balanced tree with bulk loading', () => {
      const anchors: GeospatialAnchor[] = [];
      for (let i = 0; i < 1000; i++) {
        anchors.push({
          id: `anchor-${i}`,
          lat: 37.7 + Math.random() * 0.2,
          lon: -122.5 + Math.random() * 0.2,
        });
      }

      rtree.load(anchors);

      const stats = rtree.getStats();
      expect(stats.totalAnchors).toBe(1000);
      expect(stats.height).toBeLessThan(10); // Should be logarithmic
      expect(stats.avgFillRatio).toBeGreaterThan(0.5); // Good fill ratio
    });
  });

  describe('Statistics', () => {
    it('should provide accurate statistics', () => {
      const anchors: GeospatialAnchor[] = [
        { id: 'a1', lat: 37.7749, lon: -122.4194 },
        { id: 'a2', lat: 37.7849, lon: -122.4094 },
        { id: 'a3', lat: 37.7649, lon: -122.4294 },
      ];

      for (const anchor of anchors) {
        rtree.insert(anchor);
      }

      const stats = rtree.getStats();

      expect(stats.totalAnchors).toBe(3);
      expect(stats.height).toBeGreaterThan(0);
      expect(stats.totalNodes).toBeGreaterThan(0);
    });
  });

  describe('Clear', () => {
    it('should clear all anchors', () => {
      const anchors: GeospatialAnchor[] = [
        { id: 'a1', lat: 37.7749, lon: -122.4194 },
        { id: 'a2', lat: 37.7849, lon: -122.4094 },
      ];

      for (const anchor of anchors) {
        rtree.insert(anchor);
      }

      rtree.clear();

      expect(rtree.all()).toHaveLength(0);
      const stats = rtree.getStats();
      expect(stats.totalAnchors).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle anchors at same location', () => {
      const anchors: GeospatialAnchor[] = [
        { id: 'a1', lat: 37.7749, lon: -122.4194 },
        { id: 'a2', lat: 37.7749, lon: -122.4194 },
        { id: 'a3', lat: 37.7749, lon: -122.4194 },
      ];

      for (const anchor of anchors) {
        rtree.insert(anchor);
      }

      const results = rtree.searchRadius({ lat: 37.7749, lon: -122.4194 }, 10);

      expect(results).toHaveLength(3);
      results.forEach((r) => {
        expect(r.distance).toBeLessThan(1);
      });
    });

    it('should handle negative coordinates', () => {
      const anchor: GeospatialAnchor = {
        id: 'south-pole',
        lat: -89.9,
        lon: 0,
      };

      rtree.insert(anchor);

      const results = rtree.search({
        minLat: -90,
        minLon: -10,
        maxLat: -89,
        maxLon: 10,
      });

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('south-pole');
    });

    it('should handle dateline crossing', () => {
      const anchors: GeospatialAnchor[] = [
        { id: 'fiji', lat: -18, lon: 179 },
        { id: 'samoa', lat: -14, lon: -171 },
      ];

      for (const anchor of anchors) {
        rtree.insert(anchor);
      }

      const results = rtree.all();
      expect(results).toHaveLength(2);
    });

    it('should handle empty tree queries', () => {
      const results = rtree.search({
        minLat: 0,
        minLon: 0,
        maxLat: 10,
        maxLon: 10,
      });

      expect(results).toHaveLength(0);
    });

    it('should handle altitude metadata', () => {
      const anchor: GeospatialAnchor = {
        id: 'mt-everest',
        lat: 27.9881,
        lon: 86.925,
        alt: 8848,
        metadata: { name: 'Mount Everest' },
      };

      rtree.insert(anchor);

      const results = rtree.search({
        minLat: 27,
        minLon: 86,
        maxLat: 28,
        maxLon: 87,
      });

      expect(results).toHaveLength(1);
      expect(results[0].alt).toBe(8848);
      expect(results[0].metadata?.name).toBe('Mount Everest');
    });
  });

  describe('Performance', () => {
    it('should handle large datasets efficiently', () => {
      const anchors: GeospatialAnchor[] = [];
      for (let i = 0; i < 10000; i++) {
        anchors.push({
          id: `anchor-${i}`,
          lat: -90 + Math.random() * 180,
          lon: -180 + Math.random() * 360,
        });
      }

      const start = performance.now();
      rtree.load(anchors);
      const loadTime = performance.now() - start;

      expect(loadTime).toBeLessThan(1000); // Should load 10K anchors in < 1s

      const queryStart = performance.now();
      rtree.search({
        minLat: 37,
        minLon: -123,
        maxLat: 38,
        maxLon: -122,
      });
      const queryTime = performance.now() - queryStart;

      expect(queryTime).toBeLessThan(50); // Query should be < 50ms
    });
  });
});
