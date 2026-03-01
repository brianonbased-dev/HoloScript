import { describe, it, expect, beforeEach } from 'vitest';
import { StateReplicator } from '../network/StateReplicator';

// =============================================================================
// C276 — State Replicator
// =============================================================================

describe('StateReplicator', () => {
  let rep: StateReplicator;
  beforeEach(() => { rep = new StateReplicator('host1'); });

  it('registerEntity creates entity', () => {
    rep.registerEntity('e1', { hp: 100 });
    expect(rep.getEntityCount()).toBe(1);
    expect(rep.getProperty('e1', 'hp')).toBe(100);
  });

  it('unregisterEntity removes entity', () => {
    rep.registerEntity('e1');
    expect(rep.unregisterEntity('e1')).toBe(true);
    expect(rep.getEntityCount()).toBe(0);
  });

  it('setProperty updates value and increments version', () => {
    rep.registerEntity('e1', { hp: 100 });
    rep.setProperty('e1', 'hp', 80);
    expect(rep.getProperty('e1', 'hp')).toBe(80);
    expect(rep.getSnapshot('e1')!.properties.get('hp')!.version).toBe(1);
  });

  it('setProperty creates new property if absent', () => {
    rep.registerEntity('e1');
    rep.setProperty('e1', 'mana', 50);
    expect(rep.getProperty('e1', 'mana')).toBe(50);
  });

  it('setProperty returns false for unknown entity', () => {
    expect(rep.setProperty('nope', 'hp', 0)).toBe(false);
  });

  it('owner authority blocks non-owner writes', () => {
    const r = new StateReplicator('host1', 'owner');
    r.registerEntity('e1', { hp: 100 });
    // host1 is authority; peer2 should be rejected
    expect(r.setProperty('e1', 'hp', 50, 'peer2')).toBe(false);
    expect(r.getProperty('e1', 'hp')).toBe(100);
  });

  it('takeSnapshot saves and returns snapshot', () => {
    rep.registerEntity('e1', { hp: 100 });
    const snap = rep.takeSnapshot('e1');
    expect(snap).not.toBeNull();
    expect(snap!.tick).toBe(1);
    expect(rep.getSnapshotHistory('e1')).toHaveLength(1);
  });

  it('computeDelta finds changed properties', () => {
    rep.registerEntity('e1', { hp: 100 });
    rep.takeSnapshot('e1'); // tick 1
    rep.setProperty('e1', 'hp', 80);
    const delta = rep.computeDelta('e1', 1);
    expect(delta).not.toBeNull();
    expect(delta!.changes).toHaveLength(1);
    expect(delta!.changes[0].key).toBe('hp');
  });

  it('applyDelta updates properties with higher version', () => {
    rep.registerEntity('e1', { hp: 100 });
    rep.applyDelta({ entityId: 'e1', fromTick: 0, toTick: 5, changes: [{ key: 'hp', value: 50, version: 5 }] });
    expect(rep.getProperty('e1', 'hp')).toBe(50);
  });

  it('applyDelta rejects lower version', () => {
    rep.registerEntity('e1', { hp: 100 });
    rep.setProperty('e1', 'hp', 80); // version 1
    rep.applyDelta({ entityId: 'e1', fromTick: 0, toTick: 1, changes: [{ key: 'hp', value: 999, version: 0 }] });
    expect(rep.getProperty('e1', 'hp')).toBe(80);
  });

  it('addInterpolation and updateInterpolations blend value', () => {
    rep.registerEntity('e1', { x: 0 });
    rep.addInterpolation('e1', 'x', 0, 100, 1); // 1ms — will complete instantly
    // Simulate enough time
    const start = Date.now();
    while (Date.now() - start < 5) { /* busy wait */ }
    rep.updateInterpolations();
    const val = rep.getProperty('e1', 'x') as number;
    expect(val).toBeGreaterThan(0);
  });

  it('getAuthorityMode and setAuthorityMode', () => {
    expect(rep.getAuthorityMode()).toBe('server');
    rep.setAuthorityMode('shared');
    expect(rep.getAuthorityMode()).toBe('shared');
  });
});
