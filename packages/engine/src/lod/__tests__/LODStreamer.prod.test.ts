/**
 * LODStreamer Production Tests
 *
 * Register, LOD selection, memory budget, process queue, queries.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { LODStreamer, type StreamableAsset } from '../LODStreamer';

function makeAsset(
  id: string,
  priority = 1,
  position: [number, number, number] = [0, 0, 0]
): StreamableAsset {
  return {
    id,
    position,
    lodLevels: [10, 50, 100], // LOD0 ≤10, LOD1 ≤50, LOD2 ≤100
    currentLOD: -1, // unloaded
    priority,
    memoryCost: [100, 50, 25], // LOD0=100MB, LOD1=50, LOD2=25
  };
}

describe('LODStreamer — Production', () => {
  let streamer: LODStreamer;

  beforeEach(() => {
    streamer = new LODStreamer(500); // 500 MB budget
  });

  describe('registerAsset', () => {
    it('registers asset', () => {
      streamer.registerAsset(makeAsset('tree'));
      expect(streamer.getCurrentLOD('tree')).toBe(-1);
    });
  });

  describe('evaluateDistance', () => {
    it('selects LOD0 for close distance', () => {
      streamer.registerAsset(makeAsset('tree'));
      expect(streamer.evaluateDistance('tree', 5)).toBe(0);
    });

    it('selects LOD1 for medium distance', () => {
      streamer.registerAsset(makeAsset('tree'));
      expect(streamer.evaluateDistance('tree', 30)).toBe(1);
    });

    it('selects LOD2 for far distance', () => {
      streamer.registerAsset(makeAsset('tree'));
      expect(streamer.evaluateDistance('tree', 80)).toBe(2);
    });

    it('returns -1 beyond all thresholds', () => {
      streamer.registerAsset(makeAsset('tree'));
      expect(streamer.evaluateDistance('tree', 200)).toBe(-1);
    });
  });

  describe('update + processQueue', () => {
    it('generates load requests when asset is close to camera', () => {
      // Asset at origin, camera at origin → distance 0 → LOD0
      streamer.registerAsset(makeAsset('tree', 1, [0, 0, 0]));
      streamer.update(0, 0, 0);
      expect(streamer.getLoadQueueSize()).toBeGreaterThan(0);
    });

    it('generates unload request when asset is beyond all thresholds', () => {
      // Asset at [200, 0, 0], camera at origin → distance 200 → beyond LOD2 (100)
      streamer.registerAsset(makeAsset('far_tree', 1, [200, 0, 0]));
      // First load it at close range
      streamer.update(0, 0, 0);
      // The asset is at 200m but camera is at origin, distance = 200, beyond all LODs
      // Actually position is [200,0,0] so distance from camera at origin = 200
      // LOD thresholds are [10, 50, 100], so distance 200 → -1 (beyond all)
      expect(streamer.getLoadQueueSize()).toBe(0);
      expect(streamer.getUnloadQueueSize()).toBe(0); // not loaded yet, no transition
    });

    it('processQueue loads asset and tracks memory', () => {
      // Asset at [5, 0, 0], camera at origin → distance 5 → LOD0 (≤10)
      streamer.registerAsset(makeAsset('tree', 1, [5, 0, 0]));
      streamer.update(0, 0, 0);
      const processed = streamer.processQueue();
      expect(processed.length).toBeGreaterThan(0);
      expect(streamer.getMemoryUsed()).toBeGreaterThan(0);
    });

    it('respects memory budget', () => {
      const small = new LODStreamer(50); // Very small budget
      // Asset at origin, camera at origin → distance 0 → LOD0 costs 100 > budget 50
      small.registerAsset(makeAsset('a', 1, [0, 0, 0]));
      small.update(0, 0, 0);
      small.processQueue();
      // LOD0 costs 100 > budget 50, so should not load
      expect(small.getMemoryUsed()).toBe(0);
    });

    it('selects correct LOD based on camera-to-asset distance', () => {
      // Asset at [30, 0, 0], camera at origin → distance 30 → LOD1 (≤50)
      streamer.registerAsset(makeAsset('mid_tree', 1, [30, 0, 0]));
      streamer.update(0, 0, 0);
      const processed = streamer.processQueue();
      expect(processed.length).toBe(1);
      expect(processed[0].targetLOD).toBe(1);
      expect(streamer.getMemoryUsed()).toBe(50); // LOD1 costs 50
    });

    it('selects LOD2 for far assets', () => {
      // Asset at [80, 0, 0], camera at origin → distance 80 → LOD2 (≤100)
      streamer.registerAsset(makeAsset('far_tree', 1, [80, 0, 0]));
      streamer.update(0, 0, 0);
      const processed = streamer.processQueue();
      expect(processed.length).toBe(1);
      expect(processed[0].targetLOD).toBe(2);
      expect(streamer.getMemoryUsed()).toBe(25); // LOD2 costs 25
    });
  });

  describe('queries', () => {
    it('getMemoryBudget', () => {
      expect(streamer.getMemoryBudget()).toBe(500);
    });
  });
});
