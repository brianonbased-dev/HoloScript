import { describe, it, expect, beforeEach } from 'vitest';
import { WorldStreamer } from '../WorldStreamer';

describe('WorldStreamer', () => {
  let streamer: WorldStreamer;

  beforeEach(() => {
    streamer = new WorldStreamer({
      chunkSize: 64,
      loadRadius: 2,
      unloadRadius: 4,
      maxConcurrentLoads: 4,
      memoryBudget: 1024 * 1024,
    });
  });

  // ===========================================================================
  // Construction
  // ===========================================================================
  describe('construction', () => {
    it('creates with default config', () => {
      const ws = new WorldStreamer();
      expect(ws.getChunkSize()).toBe(64);
      expect(ws.getLoadedCount()).toBe(0);
      expect(ws.getTotalMemory()).toBe(0);
    });

    it('creates with custom config', () => {
      expect(streamer.getChunkSize()).toBe(64);
    });
  });

  // ===========================================================================
  // Manual Loading
  // ===========================================================================
  describe('manual loading', () => {
    it('loadChunk loads a single chunk', () => {
      const chunk = streamer.loadChunk(0, 0);
      expect(chunk).toBeDefined();
      expect(chunk.state).toBe('loaded');
      expect(chunk.x).toBe(0);
      expect(chunk.z).toBe(0);
    });

    it('loadChunk returns existing chunk if already loaded', () => {
      const a = streamer.loadChunk(0, 0);
      const b = streamer.loadChunk(0, 0);
      expect(a.id).toBe(b.id);
    });

    it('loadChunk increases memory', () => {
      streamer.loadChunk(0, 0);
      expect(streamer.getTotalMemory()).toBeGreaterThan(0);
    });
  });

  // ===========================================================================
  // Chunk Generator
  // ===========================================================================
  describe('chunk generator', () => {
    it('uses custom generator when set', () => {
      streamer.setChunkGenerator((x, z) => ({ terrain: 'grass', x, z }));
      const chunk = streamer.loadChunk(3, 5);
      expect(chunk.data).toEqual({ terrain: 'grass', x: 3, z: 5 });
    });

    it('uses default data when no generator', () => {
      const chunk = streamer.loadChunk(1, 2);
      expect(chunk.data).toEqual({ x: 1, z: 2 });
    });
  });

  // ===========================================================================
  // Update (streaming by viewer position)
  // ===========================================================================
  describe('update', () => {
    it('loads chunks around viewer', () => {
      streamer.setViewerPosition(0, 0);
      streamer.update();
      expect(streamer.getLoadedCount()).toBeGreaterThan(0);
    });

    it('unloads distant chunks when viewer moves far', () => {
      streamer.setViewerPosition(0, 0);
      streamer.update();
      const countBefore = streamer.getLoadedCount();

      // Move viewer very far away
      streamer.setViewerPosition(10000, 10000);
      streamer.update();

      // Original chunks should have been unloaded
      const chunk = streamer.getChunk(0, 0);
      expect(chunk).toBeUndefined();
    });

    it('loads new chunks as viewer moves', () => {
      streamer.setViewerPosition(0, 0);
      streamer.update();

      streamer.setViewerPosition(320, 0); // 5 chunks away
      streamer.update();

      // Should have some chunks at the new position
      const chunk = streamer.getChunk(5, 0);
      expect(chunk).toBeDefined();
    });
  });

  // ===========================================================================
  // Queries
  // ===========================================================================
  describe('queries', () => {
    it('getChunk returns loaded chunk', () => {
      streamer.loadChunk(1, 1);
      const chunk = streamer.getChunk(1, 1);
      expect(chunk).toBeDefined();
      expect(chunk!.x).toBe(1);
    });

    it('getChunk returns undefined for unloaded', () => {
      expect(streamer.getChunk(99, 99)).toBeUndefined();
    });

    it('getLoadedChunks returns all loaded chunks', () => {
      streamer.loadChunk(0, 0);
      streamer.loadChunk(1, 0);
      const loaded = streamer.getLoadedChunks();
      expect(loaded.length).toBe(2);
    });

    it('isOverBudget returns false when under budget', () => {
      streamer.loadChunk(0, 0);
      expect(streamer.isOverBudget()).toBe(false);
    });
  });

  // ===========================================================================
  // Memory Tracking
  // ===========================================================================
  describe('memory', () => {
    it('tracks total memory as chunks load', () => {
      streamer.loadChunk(0, 0);
      const mem1 = streamer.getTotalMemory();
      streamer.loadChunk(1, 0);
      expect(streamer.getTotalMemory()).toBeGreaterThan(mem1);
    });
  });
});
