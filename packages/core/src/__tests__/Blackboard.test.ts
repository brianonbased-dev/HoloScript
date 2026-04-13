import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Blackboard } from '@holoscript/framework/ai';

// =============================================================================
// C279 — Blackboard
// =============================================================================

describe('Blackboard', () => {
  let bb: Blackboard;
  beforeEach(() => {
    bb = new Blackboard();
  });

  it('set and get', () => {
    bb.set('hp', 100);
    expect(bb.get('hp')).toBe(100);
  });

  it('has returns true for existing key', () => {
    bb.set('hp', 100);
    expect(bb.has('hp')).toBe(true);
    expect(bb.has('mana')).toBe(false);
  });

  it('delete removes key', () => {
    bb.set('hp', 100);
    expect(bb.delete('hp')).toBe(true);
    expect(bb.has('hp')).toBe(false);
  });

  it('set increments version', () => {
    bb.set('hp', 100);
    expect(bb.getVersion('hp')).toBe(0);
    bb.set('hp', 80);
    expect(bb.getVersion('hp')).toBe(1);
  });

  it('scoped set and getByScope', () => {
    bb.set('target', 'enemy', 'combat');
    bb.set('waypoint', 'A', 'navigation');
    const combat = bb.getByScope('combat');
    expect(combat.get('target')).toBe('enemy');
    expect(combat.size).toBe(1);
  });

  it('clearScope removes all keys in scope', () => {
    bb.set('a', 1, 'temp');
    bb.set('b', 2, 'temp');
    bb.set('c', 3, 'perm');
    expect(bb.clearScope('temp')).toBe(2);
    expect(bb.has('a')).toBe(false);
    expect(bb.has('c')).toBe(true);
  });

  it('observe fires callback on set', () => {
    const cb = vi.fn();
    bb.observe('hp', cb);
    bb.set('hp', 100);
    expect(cb).toHaveBeenCalledWith('hp', 100, undefined);
  });

  it('observeAll fires for any key', () => {
    const cb = vi.fn();
    bb.observeAll(cb);
    bb.set('hp', 100);
    bb.set('mana', 50);
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it('getHistory tracks changes', () => {
    bb.set('hp', 100);
    bb.set('hp', 80);
    const history = bb.getHistory();
    expect(history).toHaveLength(2);
    expect(history[1].old).toBe(100);
    expect(history[1].value).toBe(80);
  });

  it('clear resets everything', () => {
    bb.set('hp', 100);
    bb.set('mana', 50);
    bb.clear();
    expect(bb.getEntryCount()).toBe(0);
    expect(bb.getHistory()).toHaveLength(0);
  });

  it('toJSON serializes all data', () => {
    bb.set('hp', 100);
    bb.set('name', 'hero');
    const json = bb.toJSON();
    expect(json.hp).toBe(100);
    expect(json.name).toBe('hero');
  });

  it('fromJSON imports data', () => {
    bb.fromJSON({ hp: 100, mana: 50 });
    expect(bb.get('hp')).toBe(100);
    expect(bb.get('mana')).toBe(50);
  });
});
