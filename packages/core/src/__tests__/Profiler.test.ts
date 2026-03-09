import { describe, it, expect } from 'vitest';
import { RuntimeProfiler } from '../debug/RuntimeProfiler';
import { MemoryTracker } from '../debug/MemoryTracker';
import { GarbageCollector } from '../debug/GarbageCollector';

describe('Cycle 150: Profiler & Memory', () => {
  // -------------------------------------------------------------------------
  // RuntimeProfiler
  // -------------------------------------------------------------------------

  it('should track frame timing and nested scopes', () => {
    const profiler = new RuntimeProfiler();

    profiler.beginFrame();
    profiler.beginScope('Physics');
    profiler.beginScope('Collision');
    profiler.endScope();
    profiler.endScope();
    profiler.beginScope('Render');
    profiler.endScope();
    profiler.endFrame();

    expect(profiler.getFrameCount()).toBe(1);

    const history = profiler.getFrameHistory();
    expect(history[0].scopes.length).toBe(2); // Physics + Render
    expect(history[0].scopes[0].children.length).toBe(1); // Collision nested in Physics
    expect(history[0].scopes[0].name).toBe('Physics');
  });

  it('should compute average frame time and scope stats', () => {
    const profiler = new RuntimeProfiler();

    // Simulate a few frames
    for (let i = 0; i < 5; i++) {
      profiler.beginFrame();
      profiler.beginScope('Update');
      profiler.endScope();
      profiler.endFrame();
    }

    expect(profiler.getAverageFrameTime()).toBeGreaterThanOrEqual(0);
    expect(profiler.getFrameCount()).toBe(5);

    const scopeStats = profiler.getScopeStats('Update');
    expect(scopeStats.count).toBe(5);
  });

  // -------------------------------------------------------------------------
  // MemoryTracker
  // -------------------------------------------------------------------------

  it('should track allocations and enforce budgets', () => {
    const tracker = new MemoryTracker();
    tracker.setBudget('textures', 1024);

    const id1 = tracker.allocate('textures', 500);
    const id2 = tracker.allocate('textures', 300);

    expect(tracker.getActiveBytes()).toBe(800);
    expect(tracker.getBudgetUsage('textures')).toBeCloseTo(800 / 1024, 2);

    tracker.free(id1);
    expect(tracker.getActiveBytes()).toBe(300);
    expect(tracker.getActiveCount()).toBe(1);
  });

  it('should take snapshots and track active allocations', () => {
    const tracker = new MemoryTracker();

    const id1 = tracker.allocate('meshes', 256);
    const id2 = tracker.allocate('meshes', 128);
    tracker.free(id2);

    const snapshot = tracker.takeSnapshot();
    expect(snapshot.activeAllocations).toBe(1);
    expect(snapshot.tagBreakdown.get('meshes')?.bytes).toBe(256);
    expect(tracker.getTotalAllocated()).toBe(384);
    expect(tracker.getTotalFreed()).toBe(128);
  });

  it('should warn when budget is exceeded', () => {
    const tracker = new MemoryTracker();
    tracker.setBudget('audio', 100);

    tracker.allocate('audio', 60);
    tracker.allocate('audio', 60); // Exceeds 100

    expect(tracker.getWarnings().some((w) => w.includes('Budget exceeded'))).toBe(true);
  });

  // -------------------------------------------------------------------------
  // GarbageCollector
  // -------------------------------------------------------------------------

  it('should collect unreachable objects and call finalizers', () => {
    const gc = new GarbageCollector();

    const root = gc.allocate(100);
    const child = gc.allocate(50);
    let finalized = false;
    const orphan = gc.allocate(30, 'young', () => {
      finalized = true;
    });

    gc.addRoot(root);
    gc.addReference(root, child);
    // orphan has no root and no references

    const stats = gc.collectFull();
    expect(stats.collected).toBe(1); // orphan collected
    expect(finalized).toBe(true);
    expect(gc.getObjectCount()).toBe(2); // root + child remain
  });

  it('should promote young objects to old after threshold', () => {
    const gc = new GarbageCollector();

    const id = gc.allocate(64, 'young');
    gc.addRoot(id);

    expect(gc.getGenerationCount('young')).toBe(1);

    // Collect several times to age the object
    for (let i = 0; i < 4; i++) gc.collectYoung();

    expect(gc.getObject(id)?.generation).toBe('old');
    expect(gc.getGenerationCount('old')).toBe(1);
  });
});
