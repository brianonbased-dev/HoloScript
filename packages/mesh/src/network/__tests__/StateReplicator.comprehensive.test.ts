/**
 * StateReplicator — comprehensive edge-case test suite
 *
 * Covers: constructor authority modes, property versioning, snapshot
 * history limits, delta roundtrip fidelity, delta for new properties,
 * applyDelta with new keys, interpolation completion/removal,
 * shared authority mode, and edge conditions.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { StateReplicator } from '@holoscript/core';

describe('StateReplicator: comprehensive edge cases', () => {
  let rep: StateReplicator;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ===========================================================================
  // Constructor
  // ===========================================================================

  describe('constructor', () => {
    it('defaults to server authority mode', () => {
      rep = new StateReplicator('peer1');
      expect(rep.getAuthorityMode()).toBe('server');
    });

    it('accepts owner authority mode', () => {
      rep = new StateReplicator('peer1', 'owner');
      expect(rep.getAuthorityMode()).toBe('owner');
    });

    it('accepts shared authority mode', () => {
      rep = new StateReplicator('peer1', 'shared');
      expect(rep.getAuthorityMode()).toBe('shared');
    });

    it('starts with 0 entities', () => {
      rep = new StateReplicator('peer1');
      expect(rep.getEntityCount()).toBe(0);
    });

    it('starts at tick 0', () => {
      rep = new StateReplicator('peer1');
      expect(rep.getCurrentTick()).toBe(0);
    });

    it('starts with 0 interpolations', () => {
      rep = new StateReplicator('peer1');
      expect(rep.getInterpolationCount()).toBe(0);
    });
  });

  // ===========================================================================
  // Entity registration edge cases
  // ===========================================================================

  describe('entity registration edge cases', () => {
    beforeEach(() => {
      rep = new StateReplicator('server');
    });

    it('register with empty initial props', () => {
      rep.registerEntity('e1', {});
      expect(rep.getEntityCount()).toBe(1);
      expect(rep.getSnapshot('e1')).toBeDefined();
      expect(rep.getSnapshot('e1')!.properties.size).toBe(0);
    });

    it('register with multiple initial props', () => {
      rep.registerEntity('e1', { hp: 100, mp: 50, name: 'hero' });
      expect(rep.getProperty('e1', 'hp')).toBe(100);
      expect(rep.getProperty('e1', 'mp')).toBe(50);
      expect(rep.getProperty('e1', 'name')).toBe('hero');
    });

    it('re-registering same entity overwrites it', () => {
      rep.registerEntity('e1', { hp: 100 });
      rep.registerEntity('e1', { hp: 50 });
      expect(rep.getProperty('e1', 'hp')).toBe(50);
      expect(rep.getEntityCount()).toBe(1);
    });

    it('unregister clears snapshot history', () => {
      rep.registerEntity('e1');
      rep.takeSnapshot('e1');
      rep.takeSnapshot('e1');
      rep.unregisterEntity('e1');
      // After re-registering, history should be empty
      rep.registerEntity('e1');
      expect(rep.getSnapshotHistory('e1')).toEqual([]);
    });

    it('getSnapshot returns undefined for nonexistent entity', () => {
      expect(rep.getSnapshot('ghost')).toBeUndefined();
    });

    it('getSnapshotHistory returns empty for nonexistent entity', () => {
      expect(rep.getSnapshotHistory('ghost')).toEqual([]);
    });

    it('getProperty returns undefined for nonexistent entity', () => {
      expect(rep.getProperty('ghost', 'hp')).toBeUndefined();
    });
  });

  // ===========================================================================
  // Property versioning
  // ===========================================================================

  describe('property versioning', () => {
    beforeEach(() => {
      rep = new StateReplicator('server');
    });

    it('initial property version is 0', () => {
      rep.registerEntity('e1', { hp: 100 });
      const snap = rep.getSnapshot('e1')!;
      expect(snap.properties.get('hp')!.version).toBe(0);
    });

    it('setProperty increments version', () => {
      rep.registerEntity('e1', { hp: 100 });
      rep.setProperty('e1', 'hp', 90);
      const snap = rep.getSnapshot('e1')!;
      expect(snap.properties.get('hp')!.version).toBe(1);
    });

    it('multiple setProperty calls increment version each time', () => {
      rep.registerEntity('e1', { hp: 100 });
      rep.setProperty('e1', 'hp', 90);
      rep.setProperty('e1', 'hp', 80);
      rep.setProperty('e1', 'hp', 70);
      const snap = rep.getSnapshot('e1')!;
      expect(snap.properties.get('hp')!.version).toBe(3);
    });

    it('new property created via setProperty has version 0', () => {
      rep.registerEntity('e1');
      rep.setProperty('e1', 'newProp', 42);
      const snap = rep.getSnapshot('e1')!;
      expect(snap.properties.get('newProp')!.version).toBe(0);
    });

    it('property lastUpdated is updated on setProperty', () => {
      rep.registerEntity('e1', { hp: 100 });
      vi.advanceTimersByTime(1000);
      rep.setProperty('e1', 'hp', 90);
      const snap = rep.getSnapshot('e1')!;
      const prop = snap.properties.get('hp')!;
      expect(prop.lastUpdated).toBeGreaterThan(0);
    });
  });

  // ===========================================================================
  // Authority enforcement edge cases
  // ===========================================================================

  describe('authority enforcement edge cases', () => {
    it('server mode allows any peer to write', () => {
      rep = new StateReplicator('server', 'server');
      rep.registerEntity('e1', { hp: 100 });
      expect(rep.setProperty('e1', 'hp', 50, 'any-peer')).toBe(true);
    });

    it('shared mode allows any peer to write', () => {
      rep = new StateReplicator('server', 'shared');
      rep.registerEntity('e1', { hp: 100 });
      expect(rep.setProperty('e1', 'hp', 50, 'any-peer')).toBe(true);
    });

    it('owner mode blocks non-owner on existing property', () => {
      rep = new StateReplicator('owner1', 'owner');
      rep.registerEntity('e1', { hp: 100 });
      // owner1 is the authority because they registered it
      expect(rep.setProperty('e1', 'hp', 50, 'intruder')).toBe(false);
      expect(rep.getProperty('e1', 'hp')).toBe(100);
    });

    it('owner mode allows owner to write existing property', () => {
      rep = new StateReplicator('owner1', 'owner');
      rep.registerEntity('e1', { hp: 100 });
      expect(rep.setProperty('e1', 'hp', 50, 'owner1')).toBe(true);
      expect(rep.getProperty('e1', 'hp')).toBe(50);
    });

    it('owner mode allows creating new property by any peer', () => {
      rep = new StateReplicator('owner1', 'owner');
      rep.registerEntity('e1');
      // New property — no existing authority check
      expect(rep.setProperty('e1', 'newProp', 42, 'other-peer')).toBe(true);
    });

    it('setProperty without peerId uses localPeerId', () => {
      rep = new StateReplicator('local', 'owner');
      rep.registerEntity('e1', { hp: 100 });
      // No peerId — defaults to localPeerId ('local')
      expect(rep.setProperty('e1', 'hp', 50)).toBe(true);
    });
  });

  // ===========================================================================
  // Snapshot edge cases
  // ===========================================================================

  describe('snapshot edge cases', () => {
    beforeEach(() => {
      rep = new StateReplicator('server');
    });

    it('snapshot is a deep copy of properties (not a reference)', () => {
      rep.registerEntity('e1', { hp: 100 });
      const snap = rep.takeSnapshot('e1')!;
      rep.setProperty('e1', 'hp', 50);
      // Snapshot should still have old value
      expect(snap.properties.get('hp')!.value).toBe(100);
      expect(rep.getProperty('e1', 'hp')).toBe(50);
    });

    it('snapshot history is limited (does not grow unbounded)', () => {
      rep.registerEntity('e1');
      // Take more than maxHistory (30) snapshots
      for (let i = 0; i < 40; i++) {
        rep.takeSnapshot('e1');
      }
      const history = rep.getSnapshotHistory('e1');
      expect(history.length).toBeLessThanOrEqual(30);
    });

    it('snapshot tick is globally incrementing across entities', () => {
      rep.registerEntity('e1');
      rep.registerEntity('e2');
      const snap1 = rep.takeSnapshot('e1')!;
      const snap2 = rep.takeSnapshot('e2')!;
      expect(snap2.tick).toBeGreaterThan(snap1.tick);
    });

    it('snapshot updates the entity current tick', () => {
      rep.registerEntity('e1');
      rep.takeSnapshot('e1');
      const snap = rep.getSnapshot('e1')!;
      expect(snap.tick).toBe(rep.getCurrentTick());
    });

    it('getSnapshotHistory returns a copy', () => {
      rep.registerEntity('e1');
      rep.takeSnapshot('e1');
      const h1 = rep.getSnapshotHistory('e1');
      const h2 = rep.getSnapshotHistory('e1');
      expect(h1).toEqual(h2);
      expect(h1).not.toBe(h2);
    });
  });

  // ===========================================================================
  // Delta computation edge cases
  // ===========================================================================

  describe('delta computation edge cases', () => {
    beforeEach(() => {
      rep = new StateReplicator('server');
    });

    it('computeDelta includes all props when fromTick not found in history', () => {
      rep.registerEntity('e1', { a: 1, b: 2, c: 3 });
      const delta = rep.computeDelta('e1', 999)!;
      expect(delta.changes.length).toBe(3);
    });

    it('computeDelta detects no changes when nothing changed', () => {
      rep.registerEntity('e1', { hp: 100 });
      const snap = rep.takeSnapshot('e1')!;
      // No changes
      const delta = rep.computeDelta('e1', snap.tick)!;
      expect(delta.changes.length).toBe(0);
    });

    it('computeDelta detects new property added after snapshot', () => {
      rep.registerEntity('e1', { hp: 100 });
      const snap = rep.takeSnapshot('e1')!;
      rep.setProperty('e1', 'newProp', 42);
      const delta = rep.computeDelta('e1', snap.tick)!;
      const newPropChange = delta.changes.find((c) => c.key === 'newProp');
      expect(newPropChange).toBeDefined();
      expect(newPropChange!.value).toBe(42);
    });

    it('computeDelta fromTick and toTick are set correctly', () => {
      rep.registerEntity('e1', { hp: 100 });
      const snap = rep.takeSnapshot('e1')!;
      rep.setProperty('e1', 'hp', 50);
      const delta = rep.computeDelta('e1', snap.tick)!;
      expect(delta.fromTick).toBe(snap.tick);
      expect(delta.toTick).toBe(rep.getSnapshot('e1')!.tick);
    });
  });

  // ===========================================================================
  // Delta application edge cases
  // ===========================================================================

  describe('delta application edge cases', () => {
    beforeEach(() => {
      rep = new StateReplicator('server');
    });

    it('applyDelta creates new property if it does not exist', () => {
      rep.registerEntity('e1');
      const delta = {
        entityId: 'e1',
        fromTick: 0,
        toTick: 1,
        changes: [{ key: 'newKey', value: 'newVal', version: 1 }],
      };
      rep.applyDelta(delta);
      expect(rep.getProperty('e1', 'newKey')).toBe('newVal');
    });

    it('applyDelta ignores change with equal version (not greater)', () => {
      rep.registerEntity('e1', { hp: 100 });
      // Initial version is 0; change with version 0 should be ignored
      const delta = {
        entityId: 'e1',
        fromTick: 0,
        toTick: 1,
        changes: [{ key: 'hp', value: 999, version: 0 }],
      };
      rep.applyDelta(delta);
      // Version 0 is not > 0, so it is rejected
      expect(rep.getProperty('e1', 'hp')).toBe(100);
    });

    it('applyDelta with higher version updates successfully', () => {
      rep.registerEntity('e1', { hp: 100 });
      const delta = {
        entityId: 'e1',
        fromTick: 0,
        toTick: 5,
        changes: [{ key: 'hp', value: 42, version: 5 }],
      };
      expect(rep.applyDelta(delta)).toBe(true);
      expect(rep.getProperty('e1', 'hp')).toBe(42);
    });

    it('applyDelta updates entity tick to delta toTick', () => {
      rep.registerEntity('e1');
      const delta = {
        entityId: 'e1',
        fromTick: 0,
        toTick: 10,
        changes: [],
      };
      rep.applyDelta(delta);
      expect(rep.getSnapshot('e1')!.tick).toBe(10);
    });

    it('applyDelta with empty changes still updates tick', () => {
      rep.registerEntity('e1');
      const delta = {
        entityId: 'e1',
        fromTick: 0,
        toTick: 5,
        changes: [],
      };
      rep.applyDelta(delta);
      expect(rep.getSnapshot('e1')!.tick).toBe(5);
    });

    it('applyDelta with multiple changes applies all valid ones', () => {
      rep.registerEntity('e1', { a: 1, b: 2 });
      const delta = {
        entityId: 'e1',
        fromTick: 0,
        toTick: 3,
        changes: [
          { key: 'a', value: 10, version: 1 }, // valid (1 > 0)
          { key: 'b', value: 20, version: 0 }, // stale (0 not > 0)
          { key: 'c', value: 30, version: 0 }, // new key
        ],
      };
      rep.applyDelta(delta);
      expect(rep.getProperty('e1', 'a')).toBe(10);
      expect(rep.getProperty('e1', 'b')).toBe(2); // unchanged
      expect(rep.getProperty('e1', 'c')).toBe(30); // new
    });
  });

  // ===========================================================================
  // Delta roundtrip
  // ===========================================================================

  describe('delta roundtrip', () => {
    it('computeDelta then applyDelta replicates state to another replicator', () => {
      const source = new StateReplicator('source');
      const target = new StateReplicator('target');

      source.registerEntity('e1', { x: 0, y: 0 });
      target.registerEntity('e1', { x: 0, y: 0 });

      const snap = source.takeSnapshot('e1')!;
      source.setProperty('e1', 'x', 42);
      source.setProperty('e1', 'y', 99);

      const delta = source.computeDelta('e1', snap.tick)!;
      target.applyDelta(delta);

      expect(target.getProperty('e1', 'x')).toBe(42);
      expect(target.getProperty('e1', 'y')).toBe(99);
    });
  });

  // ===========================================================================
  // Interpolation edge cases
  // ===========================================================================

  describe('interpolation edge cases', () => {
    beforeEach(() => {
      rep = new StateReplicator('server');
    });

    it('addInterpolation uses default duration when not specified', () => {
      rep.registerEntity('e1', { x: 0 });
      rep.addInterpolation('e1', 'x', 0, 100);
      expect(rep.getInterpolationCount()).toBe(1);
    });

    it('multiple interpolations can be active simultaneously', () => {
      rep.registerEntity('e1', { x: 0, y: 0 });
      rep.addInterpolation('e1', 'x', 0, 100, 200);
      rep.addInterpolation('e1', 'y', 0, 50, 200);
      expect(rep.getInterpolationCount()).toBe(2);
    });

    it('completed interpolation is removed after updateInterpolations', () => {
      rep.registerEntity('e1', { x: 0 });
      rep.addInterpolation('e1', 'x', 0, 100, 100);
      vi.advanceTimersByTime(200); // past duration
      rep.updateInterpolations();
      expect(rep.getInterpolationCount()).toBe(0);
      expect(rep.getProperty('e1', 'x')).toBe(100); // final value
    });

    it('interpolation at t=0 sets from value', () => {
      rep.registerEntity('e1', { x: 999 });
      rep.addInterpolation('e1', 'x', 10, 100, 1000);
      rep.updateInterpolations(); // t = 0, value = from
      const x = rep.getProperty('e1', 'x') as number;
      expect(x).toBeCloseTo(10, 0);
    });

    it('interpolation at half duration sets midpoint value', () => {
      rep.registerEntity('e1', { x: 0 });
      rep.addInterpolation('e1', 'x', 0, 100, 1000);
      vi.advanceTimersByTime(500);
      rep.updateInterpolations();
      const x = rep.getProperty('e1', 'x') as number;
      expect(x).toBeCloseTo(50, 5);
    });

    it('interpolation does not affect property if entity is missing', () => {
      // Add interpolation for nonexistent entity
      rep.addInterpolation('ghost', 'x', 0, 100, 100);
      vi.advanceTimersByTime(200);
      // updateInterpolations calls setProperty which returns false — no crash
      expect(() => rep.updateInterpolations()).not.toThrow();
    });

    it('interpolation for different entities works independently', () => {
      rep.registerEntity('e1', { x: 0 });
      rep.registerEntity('e2', { x: 0 });
      rep.addInterpolation('e1', 'x', 0, 100, 1000);
      rep.addInterpolation('e2', 'x', 0, 200, 1000);
      vi.advanceTimersByTime(500);
      rep.updateInterpolations();
      const x1 = rep.getProperty('e1', 'x') as number;
      const x2 = rep.getProperty('e2', 'x') as number;
      expect(x1).toBeCloseTo(50, 5);
      expect(x2).toBeCloseTo(100, 5);
    });
  });

  // ===========================================================================
  // setAuthorityMode
  // ===========================================================================

  describe('setAuthorityMode runtime switching', () => {
    it('switching from server to owner mode enforces owner checks', () => {
      rep = new StateReplicator('owner1', 'server');
      rep.registerEntity('e1', { hp: 100 });
      // Server mode — anyone can write
      expect(rep.setProperty('e1', 'hp', 50, 'other')).toBe(true);
      // Switch to owner mode
      rep.setAuthorityMode('owner');
      // Now 'other' cannot write (owner is owner1)
      expect(rep.setProperty('e1', 'hp', 30, 'other')).toBe(false);
    });
  });

  // ===========================================================================
  // Multiple entity operations
  // ===========================================================================

  describe('multiple entity operations', () => {
    beforeEach(() => {
      rep = new StateReplicator('server');
    });

    it('operations on one entity do not affect another', () => {
      rep.registerEntity('e1', { hp: 100 });
      rep.registerEntity('e2', { hp: 200 });
      rep.setProperty('e1', 'hp', 50);
      expect(rep.getProperty('e1', 'hp')).toBe(50);
      expect(rep.getProperty('e2', 'hp')).toBe(200);
    });

    it('unregistering one entity preserves others', () => {
      rep.registerEntity('e1');
      rep.registerEntity('e2');
      rep.registerEntity('e3');
      rep.unregisterEntity('e2');
      expect(rep.getEntityCount()).toBe(2);
      expect(rep.getSnapshot('e1')).toBeDefined();
      expect(rep.getSnapshot('e2')).toBeUndefined();
      expect(rep.getSnapshot('e3')).toBeDefined();
    });

    it('snapshots are entity-scoped', () => {
      rep.registerEntity('e1', { x: 1 });
      rep.registerEntity('e2', { x: 2 });
      rep.takeSnapshot('e1');
      expect(rep.getSnapshotHistory('e1').length).toBe(1);
      expect(rep.getSnapshotHistory('e2').length).toBe(0);
    });
  });
});
