import { describe, it, expect, vi } from 'vitest';
import { DeltaCompressor, StateDelta } from '@holoscript/core';
import { LWWRegister, PNCounter } from '../CRDT';

describe('DeltaCompressor', () => {
  // ===========================================================================
  // computeDeltas
  // ===========================================================================

  describe('computeDeltas', () => {
    // -------------------------------------------------------------------------
    // Basic diffing
    // -------------------------------------------------------------------------

    it('returns empty array when states are identical', () => {
      const state = { x: 1, y: 2, z: 3 };
      const deltas = DeltaCompressor.computeDeltas('e1', state, state);
      expect(deltas).toEqual([]);
    });

    it('detects a single changed field', () => {
      const oldState = { x: 1, y: 2, z: 3 };
      const newState = { x: 1, y: 99, z: 3 };
      const deltas = DeltaCompressor.computeDeltas('e1', oldState, newState);
      expect(deltas.length).toBe(1);
      expect(deltas[0].field).toBe('y');
      expect(deltas[0].oldValue).toBe(2);
      expect(deltas[0].newValue).toBe(99);
      expect(deltas[0].entityId).toBe('e1');
    });

    it('detects multiple changed fields', () => {
      const oldState = { a: 1, b: 2, c: 3 };
      const newState = { a: 10, b: 2, c: 30 };
      const deltas = DeltaCompressor.computeDeltas('e1', oldState, newState);
      expect(deltas.length).toBe(2);
      const fields = deltas.map((d) => d.field).sort();
      expect(fields).toEqual(['a', 'c']);
    });

    it('detects new fields added in newState', () => {
      const oldState = { x: 1 };
      const newState = { x: 1, y: 2 };
      const deltas = DeltaCompressor.computeDeltas('e1', oldState, newState);
      expect(deltas.length).toBe(1);
      expect(deltas[0].field).toBe('y');
      expect(deltas[0].oldValue).toBeNull(); // oldState[key] ?? null
      expect(deltas[0].newValue).toBe(2);
    });

    it('treats undefined old value as null in delta', () => {
      const oldState: Record<string, any> = {};
      const newState = { foo: 'bar' };
      const deltas = DeltaCompressor.computeDeltas('e1', oldState, newState);
      expect(deltas.length).toBe(1);
      expect(deltas[0].oldValue).toBeNull();
    });

    // -------------------------------------------------------------------------
    // Edge cases
    // -------------------------------------------------------------------------

    it('returns empty for two empty objects', () => {
      const deltas = DeltaCompressor.computeDeltas('e1', {}, {});
      expect(deltas).toEqual([]);
    });

    it('detects string to number type change', () => {
      const oldState = { val: 'hello' };
      const newState = { val: 42 };
      const deltas = DeltaCompressor.computeDeltas('e1', oldState, newState);
      expect(deltas.length).toBe(1);
      expect(deltas[0].oldValue).toBe('hello');
      expect(deltas[0].newValue).toBe(42);
    });

    it('detects change from value to null', () => {
      const oldState = { val: 42 };
      const newState = { val: null };
      const deltas = DeltaCompressor.computeDeltas('e1', oldState, newState);
      expect(deltas.length).toBe(1);
      expect(deltas[0].newValue).toBeNull();
    });

    it('detects object reference changes (shallow comparison)', () => {
      const obj1 = { nested: 1 };
      const obj2 = { nested: 1 }; // same content, different reference
      const oldState = { data: obj1 };
      const newState = { data: obj2 };
      const deltas = DeltaCompressor.computeDeltas('e1', oldState, newState);
      // Shallow check — different references → detected as change
      expect(deltas.length).toBe(1);
    });

    it('no delta when same object reference is shared', () => {
      const shared = { nested: 1 };
      const oldState = { data: shared };
      const newState = { data: shared };
      const deltas = DeltaCompressor.computeDeltas('e1', oldState, newState);
      expect(deltas.length).toBe(0);
    });

    it('each delta has a timestamp', () => {
      const before = Date.now();
      const deltas = DeltaCompressor.computeDeltas('e1', { x: 1 }, { x: 2 });
      const after = Date.now();
      expect(deltas[0].timestamp).toBeGreaterThanOrEqual(before);
      expect(deltas[0].timestamp).toBeLessThanOrEqual(after);
    });

    it('all deltas share the same entityId', () => {
      const deltas = DeltaCompressor.computeDeltas('entity-99', { a: 1, b: 2 }, { a: 10, b: 20 });
      for (const d of deltas) {
        expect(d.entityId).toBe('entity-99');
      }
    });

    // -------------------------------------------------------------------------
    // Boolean and falsy value handling
    // -------------------------------------------------------------------------

    it('detects false to true change', () => {
      const deltas = DeltaCompressor.computeDeltas('e1', { flag: false }, { flag: true });
      expect(deltas.length).toBe(1);
    });

    it('detects 0 to non-zero change', () => {
      const deltas = DeltaCompressor.computeDeltas('e1', { count: 0 }, { count: 1 });
      expect(deltas.length).toBe(1);
    });

    it('no delta when both are 0', () => {
      const deltas = DeltaCompressor.computeDeltas('e1', { count: 0 }, { count: 0 });
      expect(deltas.length).toBe(0);
    });
  });

  // ===========================================================================
  // applyDeltas
  // ===========================================================================

  describe('applyDeltas', () => {
    // -------------------------------------------------------------------------
    // Basic application
    // -------------------------------------------------------------------------

    it('applies single delta to target state', () => {
      const target = { x: 1, y: 2, z: 3 };
      const deltas: StateDelta[] = [
        { entityId: 'e1', field: 'y', oldValue: 2, newValue: 99, timestamp: Date.now() },
      ];
      const result = DeltaCompressor.applyDeltas(target, deltas);
      expect(result.y).toBe(99);
      expect(result.x).toBe(1);
      expect(result.z).toBe(3);
    });

    it('applies multiple deltas sequentially', () => {
      const target = { a: 1, b: 2 };
      const deltas: StateDelta[] = [
        { entityId: 'e1', field: 'a', oldValue: 1, newValue: 10, timestamp: Date.now() },
        { entityId: 'e1', field: 'b', oldValue: 2, newValue: 20, timestamp: Date.now() },
      ];
      const result = DeltaCompressor.applyDeltas(target, deltas);
      expect(result.a).toBe(10);
      expect(result.b).toBe(20);
    });

    it('adds new fields from deltas', () => {
      const target = { x: 1 };
      const deltas: StateDelta[] = [
        { entityId: 'e1', field: 'y', oldValue: null, newValue: 42, timestamp: Date.now() },
      ];
      const result = DeltaCompressor.applyDeltas(target, deltas);
      expect(result.y).toBe(42);
    });

    it('returns shallow copy — does not mutate original', () => {
      const target = { x: 1 };
      const deltas: StateDelta[] = [
        { entityId: 'e1', field: 'x', oldValue: 1, newValue: 99, timestamp: Date.now() },
      ];
      const result = DeltaCompressor.applyDeltas(target, deltas);
      expect(result.x).toBe(99);
      expect(target.x).toBe(1); // original unchanged
    });

    it('applies empty delta array — returns copy of target', () => {
      const target = { a: 1, b: 2 };
      const result = DeltaCompressor.applyDeltas(target, []);
      expect(result).toEqual(target);
      expect(result).not.toBe(target); // should be a new object
    });

    // -------------------------------------------------------------------------
    // CRDT-aware merge
    // -------------------------------------------------------------------------

    it('merges CRDT values via their merge method instead of overwriting', () => {
      const currentRegister = new LWWRegister('old', 100);
      const incomingRegister = new LWWRegister('new', 200);

      const target: Record<string, any> = { data: currentRegister };
      const deltas: StateDelta[] = [
        {
          entityId: 'e1',
          field: 'data',
          oldValue: null,
          newValue: incomingRegister,
          timestamp: Date.now(),
        },
      ];

      const result = DeltaCompressor.applyDeltas(target, deltas);
      // The LWWRegister.merge should have been called — newer timestamp wins
      expect(result.data.value).toBe('new');
      expect(result.data.timestamp).toBe(200);
    });

    it('overwrites when target field is not CRDT', () => {
      const target: Record<string, any> = { data: 'plain' };
      const deltas: StateDelta[] = [
        {
          entityId: 'e1',
          field: 'data',
          oldValue: 'plain',
          newValue: 'updated',
          timestamp: Date.now(),
        },
      ];
      const result = DeltaCompressor.applyDeltas(target, deltas);
      expect(result.data).toBe('updated');
    });

    it('overwrites when delta newValue is not CRDT even if target is CRDT', () => {
      const currentRegister = new LWWRegister('old', 100);
      const target: Record<string, any> = { data: currentRegister };
      const deltas: StateDelta[] = [
        {
          entityId: 'e1',
          field: 'data',
          oldValue: null,
          newValue: 'not-a-crdt',
          timestamp: Date.now(),
        },
      ];
      const result = DeltaCompressor.applyDeltas(target, deltas);
      // Since newValue is not CRDT, it should overwrite
      expect(result.data).toBe('not-a-crdt');
    });

    // -------------------------------------------------------------------------
    // Sequential delta ordering
    // -------------------------------------------------------------------------

    it('later deltas overwrite earlier deltas for same field', () => {
      const target = { val: 0 };
      const deltas: StateDelta[] = [
        { entityId: 'e1', field: 'val', oldValue: 0, newValue: 1, timestamp: 100 },
        { entityId: 'e1', field: 'val', oldValue: 1, newValue: 2, timestamp: 200 },
        { entityId: 'e1', field: 'val', oldValue: 2, newValue: 3, timestamp: 300 },
      ];
      const result = DeltaCompressor.applyDeltas(target, deltas);
      expect(result.val).toBe(3);
    });

    // -------------------------------------------------------------------------
    // Roundtrip
    // -------------------------------------------------------------------------

    it('computeDeltas then applyDeltas reproduces new state', () => {
      const oldState = { hp: 100, mana: 50, name: 'player1' };
      const newState = { hp: 80, mana: 50, name: 'player1' };
      const deltas = DeltaCompressor.computeDeltas('e1', oldState, newState);
      const result = DeltaCompressor.applyDeltas(oldState, deltas);
      expect(result.hp).toBe(80);
      expect(result.mana).toBe(50);
      expect(result.name).toBe('player1');
    });
  });
});
