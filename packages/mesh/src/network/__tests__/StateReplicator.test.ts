import { describe, it, expect, beforeEach } from 'vitest';
import { StateReplicator } from '@holoscript/core';

describe('StateReplicator', () => {
  let rep: StateReplicator;

  beforeEach(() => {
    rep = new StateReplicator('server1');
  });

  // Entity registration
  it('registerEntity creates entity', () => {
    rep.registerEntity('e1', { x: 10, y: 20 });
    expect(rep.getEntityCount()).toBe(1);
  });

  it('unregisterEntity removes entity', () => {
    rep.registerEntity('e1');
    expect(rep.unregisterEntity('e1')).toBe(true);
    expect(rep.getEntityCount()).toBe(0);
  });

  it('unregisterEntity returns false for unknown', () => {
    expect(rep.unregisterEntity('nope')).toBe(false);
  });

  // Properties
  it('setProperty and getProperty', () => {
    rep.registerEntity('e1');
    expect(rep.setProperty('e1', 'hp', 100)).toBe(true);
    expect(rep.getProperty('e1', 'hp')).toBe(100);
  });

  it('setProperty returns false for unknown entity', () => {
    expect(rep.setProperty('nope', 'hp', 100)).toBe(false);
  });

  it('setProperty creates new property', () => {
    rep.registerEntity('e1');
    rep.setProperty('e1', 'speed', 5);
    expect(rep.getProperty('e1', 'speed')).toBe(5);
  });

  // Authority — owner mode
  it('owner mode blocks non-owner writes', () => {
    rep.setAuthorityMode('owner');
    rep.registerEntity('e1', { hp: 100 });
    // server1 is owner; 'other' should be blocked
    expect(rep.setProperty('e1', 'hp', 50, 'other')).toBe(false);
    expect(rep.getProperty('e1', 'hp')).toBe(100);
  });

  it('owner mode allows owner writes', () => {
    rep.setAuthorityMode('owner');
    rep.registerEntity('e1', { hp: 100 });
    expect(rep.setProperty('e1', 'hp', 50, 'server1')).toBe(true);
  });

  // Snapshots
  it('takeSnapshot returns snapshot', () => {
    rep.registerEntity('e1', { x: 1 });
    const snap = rep.takeSnapshot('e1');
    expect(snap).not.toBeNull();
    expect(snap!.entityId).toBe('e1');
    expect(snap!.tick).toBe(1);
  });

  it('takeSnapshot increments tick', () => {
    rep.registerEntity('e1');
    rep.takeSnapshot('e1');
    rep.takeSnapshot('e1');
    expect(rep.getCurrentTick()).toBe(2);
  });

  it('takeSnapshot returns null for unknown', () => {
    expect(rep.takeSnapshot('nope')).toBeNull();
  });

  it('getSnapshotHistory stores snapshots', () => {
    rep.registerEntity('e1');
    rep.takeSnapshot('e1');
    rep.takeSnapshot('e1');
    expect(rep.getSnapshotHistory('e1').length).toBe(2);
  });

  // Deltas
  it('computeDelta detects changes', () => {
    rep.registerEntity('e1', { hp: 100 });
    rep.takeSnapshot('e1');
    rep.setProperty('e1', 'hp', 80);
    const delta = rep.computeDelta('e1', 1);
    expect(delta).not.toBeNull();
    expect(delta!.changes.length).toBeGreaterThan(0);
  });

  it('computeDelta returns null for unknown entity', () => {
    expect(rep.computeDelta('nope', 0)).toBeNull();
  });

  // Apply delta
  it('applyDelta updates entity properties', () => {
    rep.registerEntity('e1', { hp: 100 });
    const delta = {
      entityId: 'e1',
      fromTick: 0,
      toTick: 1,
      changes: [{ key: 'hp', value: 50, version: 1 }],
    };
    expect(rep.applyDelta(delta)).toBe(true);
    expect(rep.getProperty('e1', 'hp')).toBe(50);
  });

  it('applyDelta ignores stale versions', () => {
    rep.registerEntity('e1', { hp: 100 });
    rep.setProperty('e1', 'hp', 90); // version 1
    const delta = {
      entityId: 'e1',
      fromTick: 0,
      toTick: 1,
      changes: [{ key: 'hp', value: 50, version: 0 }],
    };
    rep.applyDelta(delta);
    expect(rep.getProperty('e1', 'hp')).toBe(90); // not overwritten
  });

  it('applyDelta returns false for unknown entity', () => {
    expect(rep.applyDelta({ entityId: 'nope', fromTick: 0, toTick: 1, changes: [] })).toBe(false);
  });

  // Authority mode
  it('getAuthorityMode and setAuthorityMode', () => {
    expect(rep.getAuthorityMode()).toBe('server');
    rep.setAuthorityMode('shared');
    expect(rep.getAuthorityMode()).toBe('shared');
  });

  // Interpolation
  it('getInterpolationCount starts at 0', () => {
    expect(rep.getInterpolationCount()).toBe(0);
  });
});
