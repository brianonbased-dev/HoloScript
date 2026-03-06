/**
 * @fileoverview Tests for SaveManager, Profiler, LODManager barrel exports
 */
import { describe, it, expect } from 'vitest';
import {
  SaveManager,
  Profiler,
  LODManager,
  createDefaultPolicy,
  createStrictPolicy,
} from '../index';

describe('SaveManager exports', () => {
  it('creates manager and saves a slot', () => {
    const mgr = new SaveManager({ maxSlots: 5 });
    const slot = mgr.save('s1', 'Test Save', { level: 1, hp: 100 });
    expect(slot.id).toBe('s1');
    expect(slot.name).toBe('Test Save');
    expect(slot.checksum).toBeDefined();
  });

  it('loads data with integrity check', () => {
    const mgr = new SaveManager();
    mgr.save('s1', 'Test', { score: 42 });
    const data = mgr.load('s1');
    expect(data).not.toBeNull();
    expect(data!.score).toBe(42);
  });

  it('detects corrupted saves', () => {
    const mgr = new SaveManager();
    mgr.save('s1', 'Test', { x: 1 });
    expect(mgr.isCorrupted('s1')).toBe(false);
    // Tamper with data
    const slot = mgr.getSlot('s1')!;
    slot.data.x = 999;
    expect(mgr.isCorrupted('s1')).toBe(true);
  });

  it('export/import round-trips', () => {
    const mgr = new SaveManager();
    mgr.save('s1', 'A', { a: 1 });
    mgr.save('s2', 'B', { b: 2 });
    const json = mgr.exportAll();
    const mgr2 = new SaveManager();
    const count = mgr2.importAll(json);
    expect(count).toBe(2);
    expect(mgr2.getSlotCount()).toBe(2);
  });

  it('enforces max slots', () => {
    const mgr = new SaveManager({ maxSlots: 2 });
    mgr.save('s1', 'A', {});
    mgr.save('s2', 'B', {});
    mgr.save('s3', 'C', {}); // Should evict oldest
    expect(mgr.getSlotCount()).toBe(2);
    expect(mgr.getSlot('s3')).toBeDefined();
  });
});

describe('Profiler exports', () => {
  it('tracks frame timing', () => {
    const prof = new Profiler();
    prof.beginFrame();
    prof.endFrame();
    expect(prof.getFrameHistory().length).toBe(1);
    expect(prof.getLastFrame()).not.toBeNull();
  });

  it('profiles scopes and builds summaries', () => {
    const prof = new Profiler();
    prof.beginFrame();
    prof.beginScope('Physics');
    prof.endScope();
    prof.beginScope('Rendering');
    prof.endScope();
    prof.endFrame();
    const summaries = prof.getAllSummaries();
    expect(summaries.length).toBe(2);
    expect(summaries.find(s => s.name === 'Physics')).toBeDefined();
  });

  it('profile() wraps sync functions', () => {
    const prof = new Profiler();
    prof.beginFrame();
    const result = prof.profile('Math', () => 2 + 2);
    prof.endFrame();
    expect(result).toBe(4);
    expect(prof.getSummary('Math')?.callCount).toBe(1);
  });

  it('takes memory snapshots', () => {
    const prof = new Profiler();
    prof.takeMemorySnapshot('before');
    prof.takeMemorySnapshot('after');
    expect(prof.getMemorySnapshots().length).toBe(2);
  });

  it('enable/disable controls profiling', () => {
    const prof = new Profiler();
    prof.setEnabled(false);
    expect(prof.isEnabled()).toBe(false);
    prof.beginFrame();
    prof.endFrame();
    expect(prof.getFrameHistory().length).toBe(0);
  });
});

describe('LODManager exports', () => {
  it('registers and queries objects', () => {
    const mgr = new LODManager({ autoUpdate: false });
    mgr.register('tree', { levels: [{ distance: 0, triangleCount: 1000 }, { distance: 50, triangleCount: 100 }] });
    expect(mgr.getRegisteredObjects()).toContain('tree');
    expect(mgr.getCurrentLevel('tree')).toBe(0);
  });

  it('updates LOD state after camera move', () => {
    const mgr = new LODManager({ autoUpdate: false });
    mgr.register('obj', { levels: [{ distance: 0, triangleCount: 5000 }, { distance: 20, triangleCount: 500 }] }, [100, 0, 0]);
    mgr.setCameraPosition([0, 0, 0]);
    mgr.update(0.016);
    // After update, state should exist for the object
    const state = mgr.getState('obj');
    expect(state).toBeDefined();
  });

  it('unregisters objects', () => {
    const mgr = new LODManager({ autoUpdate: false });
    mgr.register('a', { levels: [{ distance: 0, triangleCount: 100 }] });
    mgr.unregister('a');
    expect(mgr.getRegisteredObjects()).not.toContain('a');
  });

  it('forced LOD level overrides distance', () => {
    const mgr = new LODManager({ autoUpdate: false });
    mgr.register('obj', { levels: [{ distance: 0, triangleCount: 5000 }, { distance: 20, triangleCount: 500 }, { distance: 50, triangleCount: 50 }] });
    mgr.setForcedLevel('obj', 2);
    mgr.update(0.016);
    expect(mgr.getCurrentLevel('obj')).toBe(2);
  });
});

describe('SecurityPolicy factory exports', () => {
  it('createDefaultPolicy returns valid policy', () => {
    const policy = createDefaultPolicy();
    expect(policy.sandbox.enabled).toBe(true);
    expect(policy.sandbox.memoryLimit).toBeGreaterThan(0);
    expect(policy.network.maxConnections).toBeGreaterThan(0);
  });

  it('createStrictPolicy locks down access', () => {
    const policy = createStrictPolicy();
    expect(policy.sandbox.fileSystemAccess).toBe('none');
    expect(policy.network.allowedHosts.length).toBe(0);
    expect(policy.code.requireSignedPackages).toBe(true);
  });
});
