/**
 * LODStreamer Production Tests
 *
 * Register, LOD selection, memory budget, process queue, queries.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { LODStreamer, type StreamableAsset } from '../LODStreamer';

function makeAsset(id: string, priority = 1): StreamableAsset {
  return {
    id,
    lodLevels: [10, 50, 100],    // LOD0 ≤10, LOD1 ≤50, LOD2 ≤100
    currentLOD: -1,               // unloaded
    priority,
    memoryCost: [100, 50, 25],   // LOD0=100MB, LOD1=50, LOD2=25
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
    it('generates load requests', () => {
      streamer.registerAsset(makeAsset('tree'));
      streamer.update(0, 0, 0); // distance 0 → LOD0
      expect(streamer.getLoadQueueSize()).toBeGreaterThan(0);
    });

    it('processQueue loads asset and tracks memory', () => {
      streamer.registerAsset(makeAsset('tree'));
      streamer.update(0, 0, 0);
      const processed = streamer.processQueue();
      expect(processed.length).toBeGreaterThan(0);
      expect(streamer.getMemoryUsed()).toBeGreaterThan(0);
    });

    it('respects memory budget', () => {
      const small = new LODStreamer(50); // Very small budget
      small.registerAsset(makeAsset('a', 1)); // LOD0 costs 100
      small.update(0, 0, 0);
      small.processQueue();
      // LOD0 costs 100 > budget 50, so should not load
      expect(small.getMemoryUsed()).toBe(0);
    });
  });

  describe('queries', () => {
    it('getMemoryBudget', () => {
      expect(streamer.getMemoryBudget()).toBe(500);
    });
  });
});
