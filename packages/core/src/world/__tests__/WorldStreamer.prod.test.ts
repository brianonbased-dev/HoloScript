/**
 * WorldStreamer Production Tests
 *
 * Tests chunk-based world streaming: loading/unloading by distance,
 * custom chunk generators, memory tracking, and queries.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { WorldStreamer } from '../../world/WorldStreamer';

describe('WorldStreamer — Production', () => {
  let ws: WorldStreamer;

  beforeEach(() => {
    ws = new WorldStreamer({ chunkSize: 10, loadRadius: 2, unloadRadius: 4 });
  });

  // ─── Config ───────────────────────────────────────────────────────

  it('getChunkSize returns configured value', () => {
    expect(ws.getChunkSize()).toBe(10);
  });

  it('starts with 0 loaded chunks', () => {
    expect(ws.getLoadedCount()).toBe(0);
    expect(ws.getTotalMemory()).toBe(0);
  });

  // ─── Manual loadChunk ─────────────────────────────────────────────

  it('loadChunk creates a loaded chunk', () => {
    const chunk = ws.loadChunk(0, 0);
    expect(chunk).toBeDefined();
    expect(chunk.state).toBe('loaded');
    expect(chunk.x).toBe(0);
    expect(chunk.z).toBe(0);
  });

  it('loadChunk returns existing chunk if already loaded', () => {
    const c1 = ws.loadChunk(1, 2);
    const c2 = ws.loadChunk(1, 2);
    expect(c1).toBe(c2);
  });

  it('getChunk retrieves loaded chunk by coordinates', () => {
    ws.loadChunk(3, 4);
    expect(ws.getChunk(3, 4)).toBeDefined();
    expect(ws.getChunk(99, 99)).toBeUndefined();
  });

  // ─── Custom Generator ─────────────────────────────────────────────

  it('uses chunk generator when set', () => {
    ws.setChunkGenerator((x, z) => ({ terrain: 'grass', coord: `${x},${z}` }));
    const chunk = ws.loadChunk(5, 6);
    expect((chunk.data as any).terrain).toBe('grass');
    expect((chunk.data as any).coord).toBe('5,6');
  });

  it('tracks memory from generated chunks', () => {
    ws.setChunkGenerator((x, z) => ({ x, z }));
    ws.loadChunk(0, 0);
    expect(ws.getTotalMemory()).toBeGreaterThan(0);
  });

  // ─── Distance-based Update ────────────────────────────────────────

  it('update loads chunks within loadRadius', () => {
    ws.setViewerPosition(0, 0);
    ws.update();
    expect(ws.getLoadedCount()).toBeGreaterThan(0);
  });

  it('update unloads chunks beyond unloadRadius', () => {
    // Load chunks at origin
    ws.setViewerPosition(0, 0);
    ws.update();
    const countAtOrigin = ws.getLoadedCount();

    // Move far away
    ws.setViewerPosition(1000, 1000);
    ws.update();

    // Old chunks should be unloaded
    expect(ws.getChunk(0, 0)).toBeUndefined();
  });

  it('moving viewer loads new region', () => {
    ws.setViewerPosition(0, 0);
    ws.update();

    ws.setViewerPosition(100, 100);
    ws.update();

    // Should have chunks near new position
    const cx = Math.floor(100 / 10); // chunk coord = 10
    expect(ws.getChunk(cx, cx)).toBeDefined();
  });

  // ─── Memory Budget ────────────────────────────────────────────────

  it('isOverBudget returns false when under budget', () => {
    ws.loadChunk(0, 0);
    expect(ws.isOverBudget()).toBe(false);
  });

  it('isOverBudget returns true when exceeding budget', () => {
    const tiny = new WorldStreamer({
      chunkSize: 10,
      loadRadius: 2,
      unloadRadius: 4,
      memoryBudget: 1, // 1 byte budget
    });
    tiny.loadChunk(0, 0);
    expect(tiny.isOverBudget()).toBe(true);
  });

  // ─── Queries ──────────────────────────────────────────────────────

  it('getLoadedChunks returns only loaded chunks', () => {
    ws.loadChunk(1, 1);
    ws.loadChunk(2, 2);
    const loaded = ws.getLoadedChunks();
    expect(loaded.length).toBe(2);
    expect(loaded.every((c) => c.state === 'loaded')).toBe(true);
  });

  it('getLoadedCount matches manual loads', () => {
    ws.loadChunk(0, 0);
    ws.loadChunk(1, 0);
    ws.loadChunk(0, 1);
    expect(ws.getLoadedCount()).toBe(3);
  });
});
