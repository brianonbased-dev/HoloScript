import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Blackboard } from '@holoscript/framework/ai';

describe('Blackboard', () => {
  let bb: Blackboard;

  beforeEach(() => {
    bb = new Blackboard();
  });

  // ---------------------------------------------------------------------------
  // Get / Set / Has / Delete
  // ---------------------------------------------------------------------------

  it('set and get round-trip', () => {
    bb.set('hp', 100);
    expect(bb.get('hp')).toBe(100);
  });

  it('get returns undefined for missing key', () => {
    expect(bb.get('nope')).toBeUndefined();
  });

  it('has checks key existence', () => {
    bb.set('hp', 100);
    expect(bb.has('hp')).toBe(true);
    expect(bb.has('mp')).toBe(false);
  });

  it('delete removes key', () => {
    bb.set('hp', 100);
    expect(bb.delete('hp')).toBe(true);
    expect(bb.has('hp')).toBe(false);
  });

  it('delete returns false for missing key', () => {
    expect(bb.delete('nope')).toBe(false);
  });

  it('overwrite existing key', () => {
    bb.set('hp', 100);
    bb.set('hp', 50);
    expect(bb.get('hp')).toBe(50);
  });

  // ---------------------------------------------------------------------------
  // Scopes
  // ---------------------------------------------------------------------------

  it('set with scope groups keys', () => {
    bb.set('agentHp', 100, 'agent');
    bb.set('agentMp', 50, 'agent');
    bb.set('envTemp', 25, 'env');
    const agentData = bb.getByScope('agent');
    expect(agentData.size).toBe(2);
    expect(agentData.get('agentHp')).toBe(100);
  });

  it('getByScope returns empty for unknown scope', () => {
    expect(bb.getByScope('nope').size).toBe(0);
  });

  it('clearScope removes all keys in scope', () => {
    bb.set('a', 1, 'temp');
    bb.set('b', 2, 'temp');
    bb.set('c', 3, 'keep');
    const removed = bb.clearScope('temp');
    expect(removed).toBe(2);
    expect(bb.has('a')).toBe(false);
    expect(bb.has('c')).toBe(true);
  });

  it('getScopes lists all scopes', () => {
    bb.set('a', 1, 'x');
    bb.set('b', 2, 'y');
    const scopes = bb.getScopes();
    expect(scopes).toContain('x');
    expect(scopes).toContain('y');
  });

  // ---------------------------------------------------------------------------
  // Observers
  // ---------------------------------------------------------------------------

  it('observe fires callback on set', () => {
    const cb = vi.fn();
    bb.observe('hp', cb);
    bb.set('hp', 100);
    expect(cb).toHaveBeenCalledWith('hp', 100, undefined);
  });

  it('observe callback receives old value on update', () => {
    const cb = vi.fn();
    bb.set('hp', 100);
    bb.observe('hp', cb);
    bb.set('hp', 50);
    expect(cb).toHaveBeenCalledWith('hp', 50, 100);
  });

  it('observeAll fires for any key change', () => {
    const cb = vi.fn();
    bb.observeAll(cb);
    bb.set('a', 1);
    bb.set('b', 2);
    expect(cb).toHaveBeenCalledTimes(2);
  });

  // ---------------------------------------------------------------------------
  // Version Tracking
  // ---------------------------------------------------------------------------

  it('getVersion increments on update', () => {
    bb.set('hp', 100);
    expect(bb.getVersion('hp')).toBe(0);
    bb.set('hp', 50);
    expect(bb.getVersion('hp')).toBe(1);
  });

  it('getVersion returns -1 for missing key', () => {
    expect(bb.getVersion('nope')).toBe(-1);
  });

  // ---------------------------------------------------------------------------
  // History
  // ---------------------------------------------------------------------------

  it('getHistory records changes', () => {
    bb.set('hp', 100);
    bb.set('hp', 50);
    const history = bb.getHistory();
    expect(history.length).toBe(2);
    expect(history[0].key).toBe('hp');
    expect(history[0].value).toBe(100);
    expect(history[1].value).toBe(50);
  });

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  it('getEntryCount counts total entries', () => {
    expect(bb.getEntryCount()).toBe(0);
    bb.set('a', 1);
    bb.set('b', 2);
    expect(bb.getEntryCount()).toBe(2);
  });

  it('getKeys lists all keys', () => {
    bb.set('x', 1);
    bb.set('y', 2);
    expect(bb.getKeys().sort()).toEqual(['x', 'y']);
  });

  // ---------------------------------------------------------------------------
  // Clear
  // ---------------------------------------------------------------------------

  it('clear removes all data', () => {
    bb.set('a', 1);
    bb.set('b', 2);
    bb.clear();
    expect(bb.getEntryCount()).toBe(0);
    expect(bb.getHistory()).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // Serialization
  // ---------------------------------------------------------------------------

  it('toJSON exports key-value pairs', () => {
    bb.set('hp', 100);
    bb.set('name', 'hero');
    const json = bb.toJSON();
    expect(json.hp).toBe(100);
    expect(json.name).toBe('hero');
  });

  it('fromJSON imports key-value pairs', () => {
    bb.fromJSON({ x: 10, y: 20 });
    expect(bb.get('x')).toBe(10);
    expect(bb.get('y')).toBe(20);
  });
});
