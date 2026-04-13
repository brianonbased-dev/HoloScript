/**
 * SyncProtocol.prod.test.ts
 *
 * Production tests for DeltaEncoder and InterestManager —
 * the pure logic classes exported from SyncProtocol.ts.
 * Network transport tests are excluded (require browser APIs).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DeltaEncoder, InterestManager } from '../SyncProtocol';

// ============================================================================
// DeltaEncoder
// ============================================================================

describe('DeltaEncoder', () => {
  let enc: DeltaEncoder;

  beforeEach(() => {
    enc = new DeltaEncoder(0.001);
  });

  // -------------------------------------------------------------------------
  // encode — first call (baseline)
  // -------------------------------------------------------------------------
  describe('encode() — first call (baseline)', () => {
    it('first encode returns null (no delta, just caches baseline)', () => {
      expect(enc.encode('e1', { x: 1, y: 2 })).toBeNull();
    });

    it('after first encode, state is cached', () => {
      enc.encode('e1', { x: 1 });
      expect(enc.getCachedState('e1')).toBeDefined();
    });

    it('cached state has correct version=1', () => {
      enc.encode('e1', { x: 1 });
      expect(enc.getCachedState('e1')!.version).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // encode — delta generation
  // -------------------------------------------------------------------------
  describe('encode() — delta generation', () => {
    it('unchanged values produce null delta', () => {
      enc.encode('e1', { x: 1 });
      expect(enc.encode('e1', { x: 1 })).toBeNull();
    });

    it('changed value produces delta with set op', () => {
      enc.encode('e1', { x: 1 });
      const d = enc.encode('e1', { x: 2 });
      expect(d).not.toBeNull();
      expect(d!.changes[0].op).toBe('set');
      expect(d!.changes[0].path).toBe('x');
      expect(d!.changes[0].value).toBe(2);
    });

    it('removed key produces delete op', () => {
      enc.encode('e1', { x: 1, y: 2 });
      const d = enc.encode('e1', { x: 1 });
      expect(d!.changes.some((c) => c.op === 'delete' && c.path === 'y')).toBe(true);
    });

    it('added key produces set op', () => {
      enc.encode('e1', { x: 1 });
      const d = enc.encode('e1', { x: 1, z: 99 });
      expect(d!.changes.some((c) => c.op === 'set' && c.path === 'z')).toBe(true);
    });

    it('delta has correct version range', () => {
      enc.encode('e1', { x: 1 });
      const d = enc.encode('e1', { x: 2 });
      expect(d!.baseVersion).toBe(1);
      expect(d!.targetVersion).toBe(2);
    });

    it('version increments on each delta', () => {
      enc.encode('e1', { x: 1 });
      enc.encode('e1', { x: 2 });
      const d = enc.encode('e1', { x: 3 });
      expect(d!.baseVersion).toBe(2);
      expect(d!.targetVersion).toBe(3);
    });

    it('change within threshold is treated as equal (no delta)', () => {
      enc.encode('e1', { x: 1.0 });
      // 1.0 + 0.0001 < threshold 0.001: should produce null
      expect(enc.encode('e1', { x: 1.0001 })).toBeNull();
    });

    it('change exceeding threshold produces delta', () => {
      enc.encode('e1', { x: 1.0 });
      expect(enc.encode('e1', { x: 1.01 })).not.toBeNull();
    });

    it('different entities tracked independently', () => {
      enc.encode('e1', { x: 1 });
      enc.encode('e2', { y: 5 });
      const d1 = enc.encode('e1', { x: 2 });
      expect(d1).not.toBeNull();
      const d2 = enc.encode('e2', { y: 5 }); // unchanged
      expect(d2).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // decode
  // -------------------------------------------------------------------------
  describe('decode()', () => {
    it('decodes a set change', () => {
      enc.encode('e1', { x: 1, y: 2 });
      const delta = enc.encode('e1', { x: 5, y: 2 })!;
      const state = enc.decode(delta);
      expect(state.properties.x).toBe(5);
      expect(state.properties.y).toBe(2);
    });

    it('decodes a delete change', () => {
      enc.encode('e1', { x: 1, y: 2 });
      const delta = enc.encode('e1', { x: 1 })!; // delete y
      const state = enc.decode(delta);
      expect('y' in state.properties).toBe(false);
    });

    it('decoded state has correct version', () => {
      enc.encode('e1', { a: 1 });
      const delta = enc.encode('e1', { a: 2 })!;
      const state = enc.decode(delta);
      expect(state.version).toBe(delta.targetVersion);
    });

    it('decodes increment op', () => {
      enc.setFullState('e1', {
        entityId: 'e1',
        version: 1,
        timestamp: 0,
        properties: { count: 10 },
      });
      const state = enc.decode({
        entityId: 'e1',
        baseVersion: 1,
        targetVersion: 2,
        changes: [{ path: 'count', op: 'increment', value: 5 }],
        timestamp: Date.now(),
      });
      expect(state.properties.count).toBe(15);
    });

    it('decodes append op', () => {
      enc.setFullState('e1', {
        entityId: 'e1',
        version: 1,
        timestamp: 0,
        properties: { list: [1, 2] },
      });
      const state = enc.decode({
        entityId: 'e1',
        baseVersion: 1,
        targetVersion: 2,
        changes: [{ path: 'list', op: 'append', value: [3] }],
        timestamp: Date.now(),
      });
      expect(state.properties.list).toEqual([1, 2, 3]);
    });
  });

  // -------------------------------------------------------------------------
  // setFullState / getCachedState / clear
  // -------------------------------------------------------------------------
  describe('setFullState / getCachedState / clear', () => {
    it('setFullState makes state available via getCachedState', () => {
      enc.setFullState('e1', {
        entityId: 'e1',
        version: 10,
        timestamp: 0,
        properties: { hp: 100 },
      });
      expect(enc.getCachedState('e1')!.version).toBe(10);
    });

    it('getCachedState returns undefined for unknown entity', () => {
      expect(enc.getCachedState('ghost')).toBeUndefined();
    });

    it('clear removes all cached states', () => {
      enc.encode('e1', { x: 1 });
      enc.clear();
      expect(enc.getCachedState('e1')).toBeUndefined();
    });
  });
});

// ============================================================================
// InterestManager
// ============================================================================

describe('InterestManager', () => {
  let im: InterestManager;

  beforeEach(() => {
    im = new InterestManager();
  });

  // -------------------------------------------------------------------------
  // setInterest / isInInterest
  // -------------------------------------------------------------------------
  describe('setInterest / isInInterest', () => {
    it('no interest set → always in interest', () => {
      im.updateEntityPosition('e1', [100, 0, 0]);
      expect(im.isInInterest('client-1', 'e1')).toBe(true);
    });

    it('entity in interest radius → true', () => {
      im.setInterest('c1', { center: [0, 0, 0], radius: 10 });
      im.updateEntityPosition('e1', [5, 0, 0]);
      expect(im.isInInterest('c1', 'e1')).toBe(true);
    });

    it('entity outside interest radius → false', () => {
      im.setInterest('c1', { center: [0, 0, 0], radius: 10 });
      im.updateEntityPosition('e1', [50, 0, 0]);
      expect(im.isInInterest('c1', 'e1')).toBe(false);
    });

    it('entity with no position → always in interest', () => {
      im.setInterest('c1', { center: [0, 0, 0], radius: 1 });
      // e_no_pos never had updateEntityPosition called
      expect(im.isInInterest('c1', 'e_no_pos')).toBe(true);
    });

    it('entity exactly at radius boundary → in interest', () => {
      im.setInterest('c1', { center: [0, 0, 0], radius: 10 });
      im.updateEntityPosition('e1', [10, 0, 0]);
      expect(im.isInInterest('c1', 'e1')).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // removeInterest
  // -------------------------------------------------------------------------
  describe('removeInterest()', () => {
    it('after removeInterest, all entities are in interest', () => {
      im.setInterest('c1', { center: [0, 0, 0], radius: 1 });
      im.updateEntityPosition('e1', [999, 0, 0]);
      im.removeInterest('c1');
      expect(im.isInInterest('c1', 'e1')).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // getEntitiesInInterest
  // -------------------------------------------------------------------------
  describe('getEntitiesInInterest()', () => {
    it('returns all entities when no interest set', () => {
      im.updateEntityPosition('a', [0, 0, 0]);
      im.updateEntityPosition('b', [100, 0, 0]);
      const entities = im.getEntitiesInInterest('c1');
      expect(entities).toContain('a');
      expect(entities).toContain('b');
    });

    it('filters entities by radius', () => {
      im.setInterest('c1', { center: [0, 0, 0], radius: 5 });
      im.updateEntityPosition('near', [3, 0, 0]);
      im.updateEntityPosition('far', [100, 0, 0]);
      const entities = im.getEntitiesInInterest('c1');
      expect(entities).toContain('near');
      expect(entities).not.toContain('far');
    });
  });

  // -------------------------------------------------------------------------
  // getPriority
  // -------------------------------------------------------------------------
  describe('getPriority()', () => {
    it('returns 1 when no interest set', () => {
      im.updateEntityPosition('e1', [0, 0, 0]);
      expect(im.getPriority('c1', 'e1')).toBe(1);
    });

    it('entity at center has priority close to 1', () => {
      im.setInterest('c1', { center: [0, 0, 0], radius: 100 });
      im.updateEntityPosition('e1', [0, 0, 0]);
      expect(im.getPriority('c1', 'e1')).toBeCloseTo(1, 5);
    });

    it('entity at edge of radius has priority ≈ 0.5', () => {
      im.setInterest('c1', { center: [0, 0, 0], radius: 100 });
      im.updateEntityPosition('e1', [100, 0, 0]);
      expect(im.getPriority('c1', 'e1')).toBeCloseTo(0.5, 5);
    });

    it('custom priority map overrides distance-based priority', () => {
      const priorities = new Map([['e1', 0.99]]);
      im.setInterest('c1', { center: [0, 0, 0], radius: 100, priorities });
      im.updateEntityPosition('e1', [50, 0, 0]);
      expect(im.getPriority('c1', 'e1')).toBe(0.99);
    });
  });
});
