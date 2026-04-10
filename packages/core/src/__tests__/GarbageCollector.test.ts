import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GarbageCollector } from '../debug/GarbageCollector';

// =============================================================================
// C230 — Garbage Collector (Mark-Sweep)
// =============================================================================

describe('GarbageCollector', () => {
  let gc: GarbageCollector;
  beforeEach(() => {
    gc = new GarbageCollector();
  });

  it('allocate assigns unique IDs', () => {
    const a = gc.allocate(64);
    const b = gc.allocate(128);
    expect(a).not.toBe(b);
    expect(gc.getObjectCount()).toBe(2);
  });

  it('getObject returns allocated object', () => {
    const id = gc.allocate(32);
    const obj = gc.getObject(id);
    expect(obj).toBeDefined();
    expect(obj!.size).toBe(32);
    expect(obj!.generation).toBe('young');
  });

  it('getTotalSize sums all allocations', () => {
    gc.allocate(100);
    gc.allocate(200);
    expect(gc.getTotalSize()).toBe(300);
  });

  it('collectYoung sweeps unreachable young objects', () => {
    gc.allocate(64); // no root → unreachable
    gc.allocate(64);
    const stats = gc.collectYoung();
    expect(stats.collected).toBe(2);
    expect(gc.getObjectCount()).toBe(0);
  });

  it('rooted objects survive collection', () => {
    const id = gc.allocate(64);
    gc.addRoot(id);
    gc.collectYoung();
    expect(gc.getObjectCount()).toBe(1);
    expect(gc.getObject(id)).toBeDefined();
  });

  it('transitively reachable objects survive', () => {
    const root = gc.allocate(32);
    const child = gc.allocate(32);
    gc.addRoot(root);
    gc.addReference(root, child);
    gc.collectYoung();
    expect(gc.getObjectCount()).toBe(2);
  });

  it('removing root makes object collectible', () => {
    const id = gc.allocate(64);
    gc.addRoot(id);
    gc.removeRoot(id);
    gc.collectYoung();
    expect(gc.getObjectCount()).toBe(0);
  });

  it('removing reference breaks reachability', () => {
    const root = gc.allocate(32);
    const child = gc.allocate(32);
    gc.addRoot(root);
    gc.addReference(root, child);
    gc.removeReference(root, child);
    gc.collectYoung();
    expect(gc.getObjectCount()).toBe(1); // only root survives
  });

  it('finalization callback fires on collection', () => {
    const fn = vi.fn();
    gc.allocate(64, 'young', fn);
    gc.collectYoung();
    expect(fn).toHaveBeenCalledOnce();
  });

  it('objects promote from young to old after threshold', () => {
    const id = gc.allocate(64);
    gc.addRoot(id);
    // Default threshold is 3 survives
    gc.collectYoung(); // age 1
    gc.collectYoung(); // age 2
    gc.collectYoung(); // age 3 → promote
    expect(gc.getObject(id)!.generation).toBe('old');
  });

  it('collectFull sweeps all generations', () => {
    const young = gc.allocate(32, 'young');
    const old = gc.allocate(32, 'old');
    const stats = gc.collectFull();
    expect(stats.collected).toBe(2);
  });

  it('permanent objects are never collected', () => {
    gc.allocate(64, 'permanent');
    gc.collectFull();
    expect(gc.getObjectCount()).toBe(1);
  });

  it('getGenerationCount returns correct counts', () => {
    gc.allocate(32, 'young');
    gc.allocate(32, 'young');
    gc.allocate(32, 'old');
    expect(gc.getGenerationCount('young')).toBe(2);
    expect(gc.getGenerationCount('old')).toBe(1);
  });

  it('defragment compacts objects', () => {
    gc.allocate(32);
    gc.allocate(64);
    const result = gc.defragment();
    expect(result.movedCount).toBe(2);
    expect(result.bytesMoved).toBe(96);
  });

  it('getStats accumulates across collections', () => {
    gc.allocate(32);
    gc.collectYoung();
    gc.allocate(64);
    gc.collectYoung();
    expect(gc.getStats()).toHaveLength(2);
  });

  it('getRootCount tracks roots', () => {
    const a = gc.allocate(32);
    const b = gc.allocate(32);
    gc.addRoot(a);
    gc.addRoot(b);
    expect(gc.getRootCount()).toBe(2);
    gc.removeRoot(a);
    expect(gc.getRootCount()).toBe(1);
  });
});
