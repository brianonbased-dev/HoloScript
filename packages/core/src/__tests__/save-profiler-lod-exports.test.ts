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
    slot.data[0] = 999;
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
  it('tracks spans in a session', () => {
    const prof = new Profiler();
    prof.start('test-session');
    prof.beginSpan('Physics');
    prof.endSpan();
    const result = prof.stop();
    expect(result.samples.length).toBeGreaterThan(0);
    expect(result.samples[0].name).toBe('Physics');
  });

  it('profiles multiple spans', () => {
    const prof = new Profiler();
    prof.start();
    prof.beginSpan('Physics');
    prof.endSpan();
    prof.beginSpan('Rendering');
    prof.endSpan();
    const result = prof.stop();
    expect(result.samples.length).toBe(2);
    expect(result.samples.find((s) => s.name === 'Physics')).toBeDefined();
  });

  it('returns name and duration in stop result', () => {
    const prof = new Profiler();
    prof.start('measure');
    prof.beginSpan('Work');
    prof.endSpan();
    const result = prof.stop();
    expect(result.name).toBe('measure');
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });

  it('captures memory snapshots during session', () => {
    const prof = new Profiler();
    prof.start();
    prof.captureMemory();
    const result = prof.stop();
    expect(result).toBeDefined();
    expect(result.memorySnapshots).toBeDefined();
  });

  it('can be restarted after stop', () => {
    const prof = new Profiler();
    prof.start('first');
    prof.stop();
    prof.start('second');
    prof.beginSpan('Task');
    prof.endSpan();
    const result = prof.stop();
    expect(result.name).toBe('second');
    expect(result.samples.length).toBe(1);
  });
});

describe('LODManager exports', () => {
  it('registers and queries objects', () => {
    const mgr = new LODManager();
    mgr.register('tree', [0, 0, 0]);
    expect(mgr.getObjectCount()).toBe(1);
    expect(mgr.getObject('tree')).toBeDefined();
  });

  it('updates LOD state after camera move', () => {
    const mgr = new LODManager();
    mgr.register('obj', [100, 0, 0]);
    mgr.setViewerPosition(0, 0, 0);
    mgr.update(0.016);
    const obj = mgr.getObject('obj');
    expect(obj).toBeDefined();
    expect(obj!.currentLevel).toBeGreaterThanOrEqual(0);
  });

  it('unregisters objects', () => {
    const mgr = new LODManager();
    mgr.register('a', [0, 0, 0]);
    mgr.unregister('a');
    expect(mgr.getObject('a')).toBeUndefined();
    expect(mgr.getObjectCount()).toBe(0);
  });

  it('selects higher LOD at greater distance', () => {
    const mgr = new LODManager();
    mgr.register('obj', [1000, 0, 0]);
    mgr.setViewerPosition(0, 0, 0);
    mgr.update(0.016);
    const obj = mgr.getObject('obj');
    expect(obj).toBeDefined();
    // At distance 1000, should be at a higher LOD level (lower detail)
    expect(obj!.currentLevel).toBeGreaterThan(0);
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
