import { describe, it, expect, beforeEach } from 'vitest';
import { CheckpointSystem } from '../CheckpointSystem';

describe('CheckpointSystem', () => {
  let sys: CheckpointSystem;

  beforeEach(() => {
    sys = new CheckpointSystem();
  });

  it('starts with zero checkpoints', () => {
    expect(sys.getCheckpointCount()).toBe(0);
    expect(sys.getLatest()).toBeNull();
  });

  it('creates a checkpoint and retrieves it', () => {
    const cp = sys.createCheckpoint('First', { score: 100 });
    expect(cp.label).toBe('First');
    expect(cp.data).toEqual({ score: 100 });
    expect(cp.parentId).toBeNull();
    expect(cp.diff).toBeNull();
    expect(sys.getCheckpointCount()).toBe(1);
  });

  it('computes diff on second checkpoint', () => {
    sys.createCheckpoint('A', { x: 1, y: 2 });
    const cp2 = sys.createCheckpoint('B', { x: 1, y: 3, z: 4 });
    expect(cp2.diff).toEqual({ y: 3, z: 4 });
    expect(cp2.parentId).toBeDefined();
  });

  it('detects deleted keys in diff', () => {
    sys.createCheckpoint('A', { a: 1, b: 2 });
    const cp2 = sys.createCheckpoint('B', { a: 1 });
    expect(cp2.diff).toEqual({ b: '__DELETED__' });
  });

  it('rolls back to a specific checkpoint', () => {
    const cp1 = sys.createCheckpoint('A', { v: 1 });
    sys.createCheckpoint('B', { v: 2 });
    sys.createCheckpoint('C', { v: 3 });
    expect(sys.getCheckpointCount()).toBe(3);

    const restored = sys.rollback(cp1.id);
    expect(restored).toEqual({ v: 1 });
    expect(sys.getCheckpointCount()).toBe(1); // removes post-rollback
  });

  it('returns null for invalid rollback id', () => {
    expect(sys.rollback('nonexistent')).toBeNull();
  });

  it('rollbackToLatest returns last checkpoint data', () => {
    sys.createCheckpoint('A', { a: 1 });
    sys.createCheckpoint('B', { b: 2 });
    expect(sys.rollbackToLatest()).toEqual({ b: 2 });
  });

  it('rollbackToLatest returns null when empty', () => {
    expect(sys.rollbackToLatest()).toBeNull();
  });

  it('getTotalSize sums checkpoint sizes', () => {
    sys.createCheckpoint('A', { hello: 'world' });
    sys.createCheckpoint('B', { foo: 'bar' });
    expect(sys.getTotalSize()).toBeGreaterThan(0);
  });

  it('auto-checkpoint triggers after interval', () => {
    sys.setAutoInterval(2); // 2 seconds
    sys.setCurrentState({ auto: true });
    expect(sys.update(1)).toBeNull(); // not yet
    const cp = sys.update(1.5); // should trigger at 2s
    expect(cp).not.toBeNull();
    expect(cp!.label).toBe('Auto');
  });

  it('does not auto-checkpoint when interval is 0', () => {
    sys.setAutoInterval(0);
    sys.setCurrentState({ x: 1 });
    expect(sys.update(100)).toBeNull();
  });

  it('enforces maxCheckpoints', () => {
    sys.setMaxCheckpoints(3);
    sys.createCheckpoint('A', { v: 1 });
    sys.createCheckpoint('B', { v: 2 });
    sys.createCheckpoint('C', { v: 3 });
    sys.createCheckpoint('D', { v: 4 });
    expect(sys.getCheckpointCount()).toBe(3);
  });

  it('clear removes all checkpoints', () => {
    sys.createCheckpoint('A', { a: 1 });
    sys.createCheckpoint('B', { b: 2 });
    sys.clear();
    expect(sys.getCheckpointCount()).toBe(0);
  });

  it('getAllCheckpoints returns a copy', () => {
    sys.createCheckpoint('A', { a: 1 });
    const all = sys.getAllCheckpoints();
    expect(all).toHaveLength(1);
    all.pop(); // mutate copy
    expect(sys.getCheckpointCount()).toBe(1);
  });

  it('getLatest returns the most recent checkpoint', () => {
    sys.createCheckpoint('A', { a: 1 });
    sys.createCheckpoint('B', { b: 2 });
    expect(sys.getLatest()!.label).toBe('B');
  });
});
