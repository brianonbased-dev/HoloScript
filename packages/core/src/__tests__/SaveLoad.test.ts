import { describe, it, expect } from 'vitest';
import { SaveManager } from '../persistence/SaveManager';
import { CheckpointSystem } from '../persistence/CheckpointSystem';
import { DataBindingContext } from '../persistence/DataBinding';

describe('Cycle 122: Save/Load & Persistence', () => {
  // -------------------------------------------------------------------------
  // SaveManager
  // -------------------------------------------------------------------------

  it('should save and load with checksum verification', () => {
    const mgr = new SaveManager();
    const data = { playerX: 10, health: 100, inventory: ['sword'] };
    mgr.save('slot1', 'My Save', data);

    const loaded = mgr.load('slot1');
    expect(loaded).not.toBeNull();
    expect(loaded!.playerX).toBe(10);
    expect(mgr.isCorrupted('slot1')).toBe(false);
  });

  it('should detect corruption', () => {
    const mgr = new SaveManager();
    mgr.save('slot1', 'Test', { val: 42 });

    // Tamper with data
    const slot = mgr.getSlot('slot1')!;
    slot.data.val = 999;
    expect(mgr.isCorrupted('slot1')).toBe(true);
  });

  it('should export and import save data', () => {
    const mgr = new SaveManager();
    mgr.save('a', 'Save A', { level: 1 });
    mgr.save('b', 'Save B', { level: 5 });

    const exported = mgr.exportAll();
    const mgr2 = new SaveManager();
    const count = mgr2.importAll(exported);
    expect(count).toBe(2);
    expect(mgr2.getSlotCount()).toBe(2);
  });

  // -------------------------------------------------------------------------
  // CheckpointSystem
  // -------------------------------------------------------------------------

  it('should create checkpoints and rollback', () => {
    const sys = new CheckpointSystem();
    const cp1 = sys.createCheckpoint('Start', { score: 0 });
    sys.createCheckpoint('Mid', { score: 50 });
    sys.createCheckpoint('End', { score: 100 });

    expect(sys.getCheckpointCount()).toBe(3);

    const state = sys.rollback(cp1.id);
    expect(state).not.toBeNull();
    expect(state!.score).toBe(0);
    expect(sys.getCheckpointCount()).toBe(1); // Only cp1 remains
  });

  it('should compute diffs between checkpoints', () => {
    const sys = new CheckpointSystem();
    sys.createCheckpoint('v1', { a: 1, b: 2, c: 3 });
    const cp2 = sys.createCheckpoint('v2', { a: 1, b: 99, c: 3 });

    // Only 'b' changed
    expect(cp2.diff).not.toBeNull();
    expect(cp2.diff!.b).toBe(99);
    expect(cp2.diff!.a).toBeUndefined(); // No change
  });

  // -------------------------------------------------------------------------
  // DataBinding
  // -------------------------------------------------------------------------

  it('should notify on value change', () => {
    const ctx = new DataBindingContext();
    ctx.bind('hp', 100);

    const changes: number[] = [];
    ctx.watch<number>('hp', (newVal) => changes.push(newVal));

    ctx.set('hp', 80);
    ctx.set('hp', 60);
    expect(changes).toEqual([80, 60]);
  });

  it('should compute derived values', () => {
    const ctx = new DataBindingContext();
    ctx.bind('price', 100);
    ctx.bind('tax', 0.1);
    ctx.addComputed('total', () => ctx.get<number>('price')! * (1 + ctx.get<number>('tax')!), [
      'price',
      'tax',
    ]);

    expect(ctx.getComputed<number>('total')).toBeCloseTo(110);

    ctx.set('price', 200);
    expect(ctx.getComputed<number>('total')).toBeCloseTo(220);
  });

  it('should batch changes and defer notifications', () => {
    const ctx = new DataBindingContext();
    ctx.bind('a', 0);
    ctx.bind('b', 0);

    let notified = 0;
    ctx.watch('a', () => notified++);
    ctx.watch('b', () => notified++);

    ctx.beginBatch();
    ctx.set('a', 1);
    ctx.set('b', 2);
    expect(notified).toBe(0); // Deferred

    ctx.endBatch();
    expect(notified).toBe(2); // Both fired
  });

  it('should track change log', () => {
    const ctx = new DataBindingContext();
    ctx.bind('score', 0);
    ctx.set('score', 10);
    ctx.set('score', 20);

    const log = ctx.getChangeLog();
    expect(log).toHaveLength(2);
    expect(log[0].oldVal).toBe(0);
    expect(log[1].newVal).toBe(20);
  });
});
