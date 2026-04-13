/**
 * StateReplicator — production test suite
 *
 * Tests: entity registration, property get/set, authority enforcement,
 * snapshots, delta computation/application, interpolation, and queries.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { StateReplicator } from '@holoscript/core';

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('StateReplicator: production', () => {
  let rep: StateReplicator;

  beforeEach(() => {
    rep = new StateReplicator('server', 'server');
  });

  // ─── Registration ─────────────────────────────────────────────────────────
  describe('registerEntity / getEntityCount', () => {
    it('starts with 0 entities', () => {
      expect(rep.getEntityCount()).toBe(0);
    });

    it('registers an entity', () => {
      rep.registerEntity('player-1');
      expect(rep.getEntityCount()).toBe(1);
    });

    it('registers with initial properties', () => {
      rep.registerEntity('player-1', { hp: 100, x: 5 });
      expect(rep.getProperty('player-1', 'hp')).toBe(100);
      expect(rep.getProperty('player-1', 'x')).toBe(5);
    });

    it('unregisterEntity returns true and removes entity', () => {
      rep.registerEntity('e1');
      expect(rep.unregisterEntity('e1')).toBe(true);
      expect(rep.getEntityCount()).toBe(0);
    });

    it('unregisterEntity returns false for unknown entity', () => {
      expect(rep.unregisterEntity('ghost')).toBe(false);
    });
  });

  // ─── setProperty / getProperty ────────────────────────────────────────────
  describe('setProperty / getProperty', () => {
    it('sets a new property on a registered entity', () => {
      rep.registerEntity('e1');
      rep.setProperty('e1', 'color', 'red');
      expect(rep.getProperty('e1', 'color')).toBe('red');
    });

    it('overwrites an existing property', () => {
      rep.registerEntity('e1', { score: 0 });
      rep.setProperty('e1', 'score', 99);
      expect(rep.getProperty('e1', 'score')).toBe(99);
    });

    it('returns false for unknown entity', () => {
      expect(rep.setProperty('ghost', 'x', 1)).toBe(false);
    });

    it('returns undefined for unknown property', () => {
      rep.registerEntity('e1');
      expect(rep.getProperty('e1', 'missing')).toBeUndefined();
    });
  });

  // ─── Authority enforcement ────────────────────────────────────────────────
  describe('owner authority mode', () => {
    it('blocks property update from non-owner peer in owner mode', () => {
      const ownerRep = new StateReplicator('owner-client', 'owner');
      ownerRep.registerEntity('obj', { x: 0 });
      const result = ownerRep.setProperty('obj', 'x', 99, 'other-peer');
      expect(result).toBe(false);
      expect(ownerRep.getProperty('obj', 'x')).toBe(0);
    });

    it('allows property update from owner peer in owner mode', () => {
      const ownerRep = new StateReplicator('owner-client', 'owner');
      ownerRep.registerEntity('obj', { x: 0 });
      // Set by owner (localPeerId = 'owner-client')
      const result = ownerRep.setProperty('obj', 'x', 42, 'owner-client');
      expect(result).toBe(true);
      expect(ownerRep.getProperty('obj', 'x')).toBe(42);
    });
  });

  // ─── Authority mode ───────────────────────────────────────────────────────
  describe('getAuthorityMode / setAuthorityMode', () => {
    it('starts with provided authority mode', () => {
      expect(rep.getAuthorityMode()).toBe('server');
    });

    it('can switch authority mode', () => {
      rep.setAuthorityMode('shared');
      expect(rep.getAuthorityMode()).toBe('shared');
    });
  });

  // ─── Snapshots ────────────────────────────────────────────────────────────
  describe('takeSnapshot', () => {
    it('returns null for unregistered entity', () => {
      expect(rep.takeSnapshot('ghost')).toBeNull();
    });

    it('returns a snapshot with current tick', () => {
      rep.registerEntity('e1', { x: 10 });
      const snap = rep.takeSnapshot('e1');
      expect(snap).not.toBeNull();
      expect(snap!.entityId).toBe('e1');
      expect(snap!.tick).toBeGreaterThan(0);
    });

    it('snapshot captures property values at time of call', () => {
      rep.registerEntity('e1', { hp: 100 });
      rep.takeSnapshot('e1');
      rep.setProperty('e1', 'hp', 50); // change after snapshot
      const history = rep.getSnapshotHistory('e1');
      expect(history[0].properties.get('hp')?.value).toBe(100);
    });

    it('increments tick on each snapshot', () => {
      rep.registerEntity('e1');
      const snap1 = rep.takeSnapshot('e1');
      const snap2 = rep.takeSnapshot('e1');
      expect(snap2!.tick).toBeGreaterThan(snap1!.tick);
    });

    it('records snapshot in history', () => {
      rep.registerEntity('e1');
      rep.takeSnapshot('e1');
      rep.takeSnapshot('e1');
      expect(rep.getSnapshotHistory('e1').length).toBe(2);
    });
  });

  // ─── Delta computation ────────────────────────────────────────────────────
  describe('computeDelta / applyDelta', () => {
    it('computeDelta returns null for unknown entity', () => {
      expect(rep.computeDelta('ghost', 0)).toBeNull();
    });

    it('computeDelta with no fromSnapshot includes all properties', () => {
      rep.registerEntity('e1', { x: 5, y: 10 });
      const delta = rep.computeDelta('e1', 999); // no such tick
      expect(delta).not.toBeNull();
      expect(delta!.changes.length).toBe(2);
    });

    it('computeDelta detects only changed properties', () => {
      rep.registerEntity('e1', { x: 0, y: 0 });
      const snap = rep.takeSnapshot('e1');
      rep.setProperty('e1', 'x', 99); // only x changed
      const delta = rep.computeDelta('e1', snap!.tick);
      expect(delta!.changes.length).toBe(1);
      expect(delta!.changes[0].key).toBe('x');
    });

    it('applyDelta returns false for unknown entity', () => {
      const fakeDelta = { entityId: 'ghost', fromTick: 0, toTick: 1, changes: [] };
      expect(rep.applyDelta(fakeDelta)).toBe(false);
    });

    it('applyDelta applies changes with higher version', () => {
      rep.registerEntity('e1', { hp: 100 });
      const delta = {
        entityId: 'e1',
        fromTick: 0,
        toTick: 5,
        changes: [{ key: 'hp', value: 50, version: 10 }],
      };
      rep.applyDelta(delta);
      expect(rep.getProperty('e1', 'hp')).toBe(50);
    });

    it('applyDelta ignores stale deltas (older version)', () => {
      rep.registerEntity('e1', { hp: 100 });
      // Bump version by setting property
      rep.setProperty('e1', 'hp', 100); // version becomes 1
      const delta = {
        entityId: 'e1',
        fromTick: 0,
        toTick: 1,
        changes: [{ key: 'hp', value: 999, version: 0 }], // stale
      };
      rep.applyDelta(delta);
      expect(rep.getProperty('e1', 'hp')).toBe(100);
    });
  });

  // ─── Interpolation ────────────────────────────────────────────────────────
  describe('addInterpolation / updateInterpolations / getInterpolationCount', () => {
    it('adds an interpolation state', () => {
      rep.registerEntity('e1', { x: 0 });
      rep.addInterpolation('e1', 'x', 0, 100, 1000);
      expect(rep.getInterpolationCount()).toBe(1);
    });

    it('updateInterpolations applies partial progress', () => {
      rep.registerEntity('e1', { x: 0 });
      rep.addInterpolation('e1', 'x', 0, 100, 200);
      rep.updateInterpolations();
      const x = rep.getProperty('e1', 'x') as number;
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(100);
    });
  });

  // ─── getCurrentTick ───────────────────────────────────────────────────────
  describe('getCurrentTick', () => {
    it('starts at 0', () => {
      expect(rep.getCurrentTick()).toBe(0);
    });

    it('increments on each takeSnapshot', () => {
      rep.registerEntity('e1');
      rep.takeSnapshot('e1');
      rep.takeSnapshot('e1');
      expect(rep.getCurrentTick()).toBe(2);
    });
  });
});
