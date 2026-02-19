/**
 * Blackboard — Production Test Suite
 *
 * Covers: get/set, scopes, observers, versioning, history,
 * delete, clear, serialization (toJSON/fromJSON), queries.
 */
import { describe, it, expect, vi } from 'vitest';
import { Blackboard } from '../Blackboard';

describe('Blackboard — Production', () => {
  // ─── Get / Set ────────────────────────────────────────────────────
  it('set and get basic value', () => {
    const bb = new Blackboard();
    bb.set('health', 100);
    expect(bb.get('health')).toBe(100);
  });

  it('get returns undefined for missing key', () => {
    const bb = new Blackboard();
    expect(bb.get('missing')).toBeUndefined();
  });

  it('has returns true for existing key', () => {
    const bb = new Blackboard();
    bb.set('x', 1);
    expect(bb.has('x')).toBe(true);
    expect(bb.has('y')).toBe(false);
  });

  it('overwrite updates value', () => {
    const bb = new Blackboard();
    bb.set('hp', 100);
    bb.set('hp', 50);
    expect(bb.get('hp')).toBe(50);
  });

  // ─── Versioning ───────────────────────────────────────────────────
  it('version increments on update', () => {
    const bb = new Blackboard();
    bb.set('val', 1);
    expect(bb.getVersion('val')).toBe(0);
    bb.set('val', 2);
    expect(bb.getVersion('val')).toBe(1);
    bb.set('val', 3);
    expect(bb.getVersion('val')).toBe(2);
  });

  it('version returns -1 for missing key', () => {
    const bb = new Blackboard();
    expect(bb.getVersion('nope')).toBe(-1);
  });

  // ─── Delete ───────────────────────────────────────────────────────
  it('delete removes key', () => {
    const bb = new Blackboard();
    bb.set('x', 1);
    expect(bb.delete('x')).toBe(true);
    expect(bb.has('x')).toBe(false);
  });

  it('delete returns false for missing key', () => {
    const bb = new Blackboard();
    expect(bb.delete('nope')).toBe(false);
  });

  // ─── Scopes ───────────────────────────────────────────────────────
  it('assigns default scope global', () => {
    const bb = new Blackboard();
    bb.set('key', 'val');
    expect(bb.getScopes()).toContain('global');
  });

  it('custom scope isolates data', () => {
    const bb = new Blackboard();
    bb.set('a', 1, 'combat');
    bb.set('b', 2, 'navigation');
    const combat = bb.getByScope('combat');
    expect(combat.get('a')).toBe(1);
    expect(combat.has('b')).toBe(false);
  });

  it('clearScope removes scoped keys', () => {
    const bb = new Blackboard();
    bb.set('x', 1, 'temp');
    bb.set('y', 2, 'temp');
    bb.set('z', 3, 'keep');
    const cleared = bb.clearScope('temp');
    expect(cleared).toBe(2);
    expect(bb.has('x')).toBe(false);
    expect(bb.has('z')).toBe(true);
  });

  it('getByScope returns empty map for unknown scope', () => {
    const bb = new Blackboard();
    expect(bb.getByScope('unknown').size).toBe(0);
  });

  // ─── Observers ────────────────────────────────────────────────────
  it('observe fires on key change', () => {
    const bb = new Blackboard();
    const spy = vi.fn();
    bb.observe('hp', spy);
    bb.set('hp', 100);
    expect(spy).toHaveBeenCalledWith('hp', 100, undefined);
  });

  it('observeAll fires on any change', () => {
    const bb = new Blackboard();
    const spy = vi.fn();
    bb.observeAll(spy);
    bb.set('a', 1);
    bb.set('b', 2);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('observer receives old value', () => {
    const bb = new Blackboard();
    bb.set('hp', 100);
    const spy = vi.fn();
    bb.observe('hp', spy);
    bb.set('hp', 50);
    expect(spy).toHaveBeenCalledWith('hp', 50, 100);
  });

  // ─── History ──────────────────────────────────────────────────────
  it('tracks change history', () => {
    const bb = new Blackboard();
    bb.set('x', 1);
    bb.set('x', 2);
    const history = bb.getHistory();
    expect(history.length).toBe(2);
    expect(history[0].key).toBe('x');
  });

  // ─── Queries ──────────────────────────────────────────────────────
  it('getEntryCount returns size', () => {
    const bb = new Blackboard();
    bb.set('a', 1);
    bb.set('b', 2);
    expect(bb.getEntryCount()).toBe(2);
  });

  it('getKeys returns all keys', () => {
    const bb = new Blackboard();
    bb.set('x', 1);
    bb.set('y', 2);
    expect(bb.getKeys().sort()).toEqual(['x', 'y']);
  });

  // ─── Clear ────────────────────────────────────────────────────────
  it('clear removes all data', () => {
    const bb = new Blackboard();
    bb.set('a', 1);
    bb.set('b', 2);
    bb.clear();
    expect(bb.getEntryCount()).toBe(0);
    expect(bb.getHistory().length).toBe(0);
  });

  // ─── Serialization ────────────────────────────────────────────────
  it('toJSON exports all values', () => {
    const bb = new Blackboard();
    bb.set('x', 42);
    bb.set('name', 'test');
    const json = bb.toJSON();
    expect(json.x).toBe(42);
    expect(json.name).toBe('test');
  });

  it('fromJSON imports values', () => {
    const bb = new Blackboard();
    bb.fromJSON({ a: 1, b: 'hello' });
    expect(bb.get('a')).toBe(1);
    expect(bb.get('b')).toBe('hello');
  });
});
