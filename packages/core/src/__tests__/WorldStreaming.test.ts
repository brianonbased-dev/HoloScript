import { describe, it, expect } from 'vitest';
import { WorldStreamer } from '@holoscript/engine/world/WorldStreamer';

// =============================================================================
// C212 — World Streaming
// =============================================================================

describe('WorldStreamer', () => {
  it('constructor uses default config', () => {
    const ws = new WorldStreamer();
    expect(ws.getChunkSize()).toBe(64);
    expect(ws.getLoadedCount()).toBe(0);
  });

  it('constructor accepts partial config overrides', () => {
    const ws = new WorldStreamer({ chunkSize: 32, loadRadius: 2 });
    expect(ws.getChunkSize()).toBe(32);
  });

  it('loadChunk manually loads a chunk', () => {
    const ws = new WorldStreamer();
    const chunk = ws.loadChunk(0, 0);
    expect(chunk).toBeDefined();
    expect(chunk.state).toBe('loaded');
      expect(chunk.x).toBe(0);
      expect(chunk.z).toBe(0);
  });

  it('loadChunk returns existing if already loaded', () => {
    const ws = new WorldStreamer();
    const first = ws.loadChunk(1, 2);
    const second = ws.loadChunk(1, 2);
    expect(first).toBe(second);
  });

  it('getChunk retrieves by coordinates', () => {
    const ws = new WorldStreamer();
    ws.loadChunk(3, 4);
    expect(ws.getChunk(3, 4)).toBeDefined();
    expect(ws.getChunk(99, 99)).toBeUndefined();
  });

  it('setChunkGenerator customizes chunk data', () => {
    const ws = new WorldStreamer();
    ws.setChunkGenerator((x, z) => ({ terrain: 'forest', x, z }));
    const chunk = ws.loadChunk(5, 5);
    expect(chunk.data).toEqual({ terrain: 'forest', x: 5, z: 5 });
  });

  it('update loads chunks within loadRadius', () => {
    const ws = new WorldStreamer({ chunkSize: 16, loadRadius: 1, unloadRadius: 3 });
    ws.setViewerPosition(8, 8); // center of chunk 0,0
    ws.update();
    // Should load chunks in -1..1 range around 0,0 (within radius 1)
    expect(ws.getChunk(0, 0)).toBeDefined();
    expect(ws.getLoadedCount()).toBeGreaterThanOrEqual(1);
  });

  it('update unloads chunks beyond unloadRadius', () => {
    const ws = new WorldStreamer({ chunkSize: 16, loadRadius: 1, unloadRadius: 2 });
    ws.loadChunk(0, 0);
    ws.loadChunk(10, 10); // far away
    ws.setViewerPosition(8, 8); // near chunk 0,0
    ws.update();
    expect(ws.getChunk(0, 0)).toBeDefined();
    expect(ws.getChunk(10, 10)).toBeUndefined(); // unloaded (dist > 2)
  });

  it('getTotalMemory increases as chunks load', () => {
    const ws = new WorldStreamer();
    expect(ws.getTotalMemory()).toBe(0);
    ws.loadChunk(0, 0);
    expect(ws.getTotalMemory()).toBeGreaterThan(0);
  });

  it('isOverBudget detects memory overflow', () => {
    const ws = new WorldStreamer({ memoryBudget: 10 });
    ws.setChunkGenerator(() => ({ bigData: 'x'.repeat(100) }));
    ws.loadChunk(0, 0);
    expect(ws.isOverBudget()).toBe(true);
  });

  it('getLoadedChunks returns only loaded state chunks', () => {
    const ws = new WorldStreamer();
    ws.loadChunk(1, 1);
    ws.loadChunk(2, 2);
    const loaded = ws.getLoadedChunks();
    expect(loaded).toHaveLength(2);
    expect(loaded.every((c) => c.state === 'loaded')).toBe(true);
  });

  it('default chunk data has x and z', () => {
    const ws = new WorldStreamer();
    const chunk = ws.loadChunk(7, 8);
      expect(chunk.data).toEqual({ x: 7, z: 8 });
  });
});
