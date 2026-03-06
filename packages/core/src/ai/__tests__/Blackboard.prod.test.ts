/**
 * Blackboard.prod.test.ts — Sprint CLXX
 *
 * Production tests for the AI behavior-tree Blackboard.
 * API: new Blackboard()
 *   .set(key, value, scope?)   → void (notifies observers, tracks history)
 *   .get<T>(key)               → T | undefined
 *   .has(key)                  → boolean
 *   .delete(key)               → boolean
 *   .getByScope(scope)         → Map<string, unknown>
 *   .clearScope(scope)         → number (count removed)
 *   .getScopes()               → string[]
 *   .observe(key, cb)          → void
 *   .observeAll(cb)            → void
 *   .getEntryCount()           → number
 *   .getKeys()                 → string[]
 *   .getVersion(key)           → number (-1 if absent)
 *   .getHistory()              → History[]
 *   .clear()                   → void
 *   .toJSON()                  → Record<string, unknown>
 *   .fromJSON(data, scope?)    → void
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Blackboard } from '../Blackboard';

let bb: Blackboard;

beforeEach(() => {
  bb = new Blackboard();
});

describe('Blackboard', () => {
  // -------------------------------------------------------------------------
  // set / get / has / delete
  // -------------------------------------------------------------------------

  describe('set() / get() / has() / delete()', () => {
    it('stores and retrieves a value', () => {
      bb.set('hp', 100);
      expect(bb.get('hp')).toBe(100);
    });

    it('has() returns true for stored key', () => {
      bb.set('x', 42);
      expect(bb.has('x')).toBe(true);
    });

    it('has() returns false for missing key', () => {
      expect(bb.has('missing')).toBe(false);
    });

    it('get() returns undefined for missing key', () => {
      expect(bb.get('nope')).toBeUndefined();
    });

    it('overwriting a value updates it', () => {
      bb.set('speed', 10);
      bb.set('speed', 20);
      expect(bb.get('speed')).toBe(20);
    });

    it('stores objects', () => {
      bb.set('target', { x: 1, y: 2 });
      expect(bb.get<{ x: number }>('target')?.x).toBe(1);
    });

    it('delete() removes a key', () => {
      bb.set('k', 1);
      expect(bb.delete('k')).toBe(true);
      expect(bb.has('k')).toBe(false);
    });

    it('delete() returns false for missing key', () => {
      expect(bb.delete('nope')).toBe(false);
    });

    it('get() returns typed value via generic', () => {
      bb.set('name', 'agent-1');
      const name = bb.get<string>('name');
      expect(name).toBe('agent-1');
    });
  });

  // -------------------------------------------------------------------------
  // Scopes
  // -------------------------------------------------------------------------

  describe('scopes', () => {
    it('set() uses "global" scope by default', () => {
      bb.set('hp', 100);
      expect(bb.getByScope('global').get('hp')).toBe(100);
    });

    it('set() with custom scope places key there', () => {
      bb.set('ammo', 5, 'combat');
      expect(bb.getByScope('combat').get('ammo')).toBe(5);
    });

    it('getByScope returns empty map for unknown scope', () => {
      expect(bb.getByScope('unknown').size).toBe(0);
    });

    it('getScopes() lists all created scopes', () => {
      bb.set('a', 1, 'scope1');
      bb.set('b', 2, 'scope2');
      const scopes = bb.getScopes();
      expect(scopes).toContain('scope1');
      expect(scopes).toContain('scope2');
    });

    it('clearScope() removes all keys in that scope', () => {
      bb.set('a', 1, 'local');
      bb.set('b', 2, 'local');
      const count = bb.clearScope('local');
      expect(count).toBe(2);
      expect(bb.getByScope('local').size).toBe(0);
    });

    it('clearScope() returns 0 for unknown scope', () => {
      expect(bb.clearScope('no-such-scope')).toBe(0);
    });

    it('clearScope() does not remove keys from other scopes', () => {
      bb.set('x', 1, 'scope-a');
      bb.set('y', 2, 'scope-b');
      bb.clearScope('scope-a');
      expect(bb.has('y')).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Observers
  // -------------------------------------------------------------------------

  describe('observe()', () => {
    it('fires observer when key is set', () => {
      const cb = vi.fn();
      bb.observe('hp', cb);
      bb.set('hp', 50);
      expect(cb).toHaveBeenCalledTimes(1);
      expect(cb).toHaveBeenCalledWith('hp', 50, undefined);
    });

    it('passes old value to observer', () => {
      const values: unknown[] = [];
      bb.observe('hp', (_, newVal, oldVal) => values.push([newVal, oldVal]));
      bb.set('hp', 10);
      bb.set('hp', 20);
      expect(values[0]).toEqual([10, undefined]);
      expect(values[1]).toEqual([20, 10]);
    });

    it('does not fire for different key', () => {
      const cb = vi.fn();
      bb.observe('hp', cb);
      bb.set('stamina', 99);
      expect(cb).not.toHaveBeenCalled();
    });

    it('multiple observers on same key all fire', () => {
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      bb.observe('x', cb1);
      bb.observe('x', cb2);
      bb.set('x', 1);
      expect(cb1).toHaveBeenCalledTimes(1);
      expect(cb2).toHaveBeenCalledTimes(1);
    });
  });

  describe('observeAll()', () => {
    it('fires wildcard observer for any key', () => {
      const cb = vi.fn();
      bb.observeAll(cb);
      bb.set('a', 1);
      bb.set('b', 2);
      expect(cb).toHaveBeenCalledTimes(2);
    });

    it('wildcard fires in addition to specific observers', () => {
      const specific = vi.fn();
      const wildcard = vi.fn();
      bb.observe('k', specific);
      bb.observeAll(wildcard);
      bb.set('k', 1);
      expect(specific).toHaveBeenCalledTimes(1);
      expect(wildcard).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // Versioning
  // -------------------------------------------------------------------------

  describe('getVersion()', () => {
    it('returns -1 for missing key', () => {
      expect(bb.getVersion('nope')).toBe(-1);
    });

    it('first set gets version 0', () => {
      bb.set('hp', 100);
      expect(bb.getVersion('hp')).toBe(0);
    });

    it('second set increments version to 1', () => {
      bb.set('hp', 100);
      bb.set('hp', 90);
      expect(bb.getVersion('hp')).toBe(1);
    });

    it('version increments with each overwrite', () => {
      for (let i = 0; i < 5; i++) bb.set('counter', i);
      expect(bb.getVersion('counter')).toBe(4);
    });
  });

  // -------------------------------------------------------------------------
  // History
  // -------------------------------------------------------------------------

  describe('getHistory()', () => {
    it('returns an array', () => {
      expect(Array.isArray(bb.getHistory())).toBe(true);
    });

    it('records each set() call', () => {
      bb.set('a', 1);
      bb.set('b', 2);
      expect(bb.getHistory().length).toBe(2);
    });

    it('history entry has key, old, value, timestamp', () => {
      bb.set('x', 42);
      const entry = bb.getHistory()[0];
      expect(entry.key).toBe('x');
      expect(entry.value).toBe(42);
      expect(entry.old).toBeUndefined();
      expect(typeof entry.timestamp).toBe('number');
    });

    it('returns a copy (mutating does not affect internal state)', () => {
      bb.set('x', 1);
      const h = bb.getHistory();
      h.pop();
      expect(bb.getHistory().length).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // Queries
  // -------------------------------------------------------------------------

  describe('getEntryCount() / getKeys()', () => {
    it('entryCount is 0 initially', () => {
      expect(bb.getEntryCount()).toBe(0);
    });

    it('entryCount equals number of distinct keys set', () => {
      bb.set('a', 1);
      bb.set('b', 2);
      bb.set('a', 3); // overwrite — no new key
      expect(bb.getEntryCount()).toBe(2);
    });

    it('getKeys() returns all stored keys', () => {
      bb.set('x', 1);
      bb.set('y', 2);
      expect(bb.getKeys()).toContain('x');
      expect(bb.getKeys()).toContain('y');
    });

    it('delete reduces entryCount', () => {
      bb.set('k', 1);
      bb.delete('k');
      expect(bb.getEntryCount()).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // clear()
  // -------------------------------------------------------------------------

  describe('clear()', () => {
    it('resets entryCount to 0', () => {
      bb.set('a', 1);
      bb.set('b', 2);
      bb.clear();
      expect(bb.getEntryCount()).toBe(0);
    });

    it('clears history', () => {
      bb.set('a', 1);
      bb.clear();
      expect(bb.getHistory().length).toBe(0);
    });

    it('clears scopes', () => {
      bb.set('x', 1, 'myScope');
      bb.clear();
      expect(bb.getScopes().length).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Serialization
  // -------------------------------------------------------------------------

  describe('toJSON() / fromJSON()', () => {
    it('toJSON() returns all keys as a record', () => {
      bb.set('a', 1);
      bb.set('b', 'hello');
      const json = bb.toJSON();
      expect(json['a']).toBe(1);
      expect(json['b']).toBe('hello');
    });

    it('fromJSON() populates blackboard with values', () => {
      bb.fromJSON({ x: 10, y: 20 });
      expect(bb.get('x')).toBe(10);
      expect(bb.get('y')).toBe(20);
    });

    it('fromJSON() with custom scope places keys there', () => {
      bb.fromJSON({ hp: 100 }, 'combat');
      expect(bb.getByScope('combat').get('hp')).toBe(100);
    });

    it('round-trip: fromJSON(toJSON()) preserves values', () => {
      bb.set('level', 5);
      bb.set('name', 'wolf');
      const json = bb.toJSON();
      const bb2 = new Blackboard();
      bb2.fromJSON(json);
      expect(bb2.get('level')).toBe(5);
      expect(bb2.get('name')).toBe('wolf');
    });
  });
});
