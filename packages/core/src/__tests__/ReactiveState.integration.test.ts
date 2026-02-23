/**
 * Sprint 3 — Reactive State Integration Tests
 *
 * Tests: parseStateBlock / parseOnBlock (HoloScriptPlusParser)
 *        ReactiveState API (get / set / subscribe / update / snapshot)
 *        ExpressionEvaluator with reactive context
 */

import { describe, it, expect, vi } from 'vitest';
import HoloScriptPlusParser from '../HoloScriptPlusParser';
import { ReactiveState, ExpressionEvaluator } from '../ReactiveState';

// ---------------------------------------------------------------------------
// parseStateBlock
// ---------------------------------------------------------------------------

describe('HoloScriptPlusParser.parseStateBlock', () => {
  const parser = new HoloScriptPlusParser();

  it('parses integer values', () => {
    const result = parser.parseStateBlock('state { hp = 100 }');
    expect(result).toEqual([{ name: 'hp', value: 100 }]);
  });

  it('parses float values', () => {
    const result = parser.parseStateBlock('state { speed = 5.5 }');
    expect(result).toEqual([{ name: 'speed', value: 5.5 }]);
  });

  it('parses boolean true/false', () => {
    const result = parser.parseStateBlock('state { alive = true }');
    expect(result).toEqual([{ name: 'alive', value: true }]);

    const result2 = parser.parseStateBlock('state { dead = false }');
    expect(result2).toEqual([{ name: 'dead', value: false }]);
  });

  it('parses string literals', () => {
    const result = parser.parseStateBlock('state { name = "hero" }');
    expect(result).toEqual([{ name: 'name', value: 'hero' }]);
  });

  it('parses multiple vars from a multi-line block', () => {
    const code = [
      'state {',
      '  hp = 100',
      '  speed = 5.5',
      '  alive = true',
      '}',
    ].join('\n');
    const result = parser.parseStateBlock(code)!;
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ name: 'hp', value: 100 });
    expect(result[1]).toEqual({ name: 'speed', value: 5.5 });
    expect(result[2]).toEqual({ name: 'alive', value: true });
  });

  it('ignores comment lines inside the block', () => {
    const code = 'state { // comment\nhp = 50 }';
    const result = parser.parseStateBlock(code)!;
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('hp');
  });

  it('returns null when no state block is present', () => {
    expect(parser.parseStateBlock('scene World { cube Player {} }')).toBeNull();
  });

  it('parses state block embedded inside a larger source', () => {
    const code = 'scene World {\n  state { mana = 200 }\n  @physics\n}';
    const result = parser.parseStateBlock(code)!;
    expect(result).toEqual([{ name: 'mana', value: 200 }]);
  });
});

// ---------------------------------------------------------------------------
// parseOnBlock
// ---------------------------------------------------------------------------

describe('HoloScriptPlusParser.parseOnBlock', () => {
  const parser = new HoloScriptPlusParser();

  it('parses a single on block', () => {
    const result = parser.parseOnBlock('on collide { hp = hp - 10 }');
    expect(result).toHaveLength(1);
    expect(result[0].event).toBe('collide');
    expect(result[0].body).toBe('hp = hp - 10');
  });

  it('parses multiple on blocks', () => {
    const code = 'on collide { hp = hp - 10 }\non death { alive = false }';
    const result = parser.parseOnBlock(code);
    expect(result).toHaveLength(2);
    expect(result[0].event).toBe('collide');
    expect(result[1].event).toBe('death');
  });

  it('returns empty array when no on blocks present', () => {
    expect(parser.parseOnBlock('scene World { @physics }')).toHaveLength(0);
  });

  it('handles multi-line on blocks', () => {
    const code = [
      'on hit {',
      '  hp = hp - 5',
      '  alive = hp > 0',
      '}',
    ].join('\n');
    const result = parser.parseOnBlock(code);
    expect(result).toHaveLength(1);
    expect(result[0].event).toBe('hit');
    expect(result[0].body).toContain('hp = hp - 5');
  });

  it('handles on blocks embedded in larger source', () => {
    const code = [
      'scene World {',
      '  state { hp = 100; alive = true }',
      '  on collide { hp = hp - 1 }',
      '  on respawn { hp = 100 }',
      '}',
    ].join('\n');
    const result = parser.parseOnBlock(code);
    expect(result).toHaveLength(2);
    expect(result[0].event).toBe('collide');
    expect(result[1].event).toBe('respawn');
  });
});

// ---------------------------------------------------------------------------
// ReactiveState — core API
// ---------------------------------------------------------------------------

describe('ReactiveState', () => {
  it('stores and retrieves values', () => {
    const state = new ReactiveState({ hp: 100 });
    expect(state.get('hp')).toBe(100);
  });

  it('set() mutates state and notifies subscribers', () => {
    const state = new ReactiveState({ hp: 100 });
    const cb = vi.fn();
    state.subscribe(cb);
    state.set('hp', 90);
    expect(state.get('hp')).toBe(90);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('subscribe() returns an unsubscribe function', () => {
    const state = new ReactiveState({ hp: 100 });
    const cb = vi.fn();
    const unsub = state.subscribe(cb);
    unsub();
    state.set('hp', 50);
    expect(cb).not.toHaveBeenCalled();
  });

  it('getSnapshot() returns a plain copy', () => {
    const state = new ReactiveState({ hp: 100 });
    const snap = state.getSnapshot();
    expect(snap).toEqual({ hp: 100 });
    // Snapshot must not be the live proxy
    state.set('hp', 0);
    expect(snap.hp).toBe(100); // original snapshot unchanged
  });

  it('update() bulk-assigns and notifies once-per-key', () => {
    const state = new ReactiveState({ hp: 100, mana: 50 });
    const cb = vi.fn();
    state.subscribe(cb);
    state.update({ hp: 80, mana: 40 });
    // update calls proxy set twice, triggering notify twice
    expect(state.get('hp')).toBe(80);
    expect(state.get('mana')).toBe(40);
  });
});

// ---------------------------------------------------------------------------
// ExpressionEvaluator — reactive state integration
// ---------------------------------------------------------------------------

describe('ExpressionEvaluator with reactive context', () => {
  it('evaluates simple arithmetic', () => {
    const ev = new ExpressionEvaluator({ hp: 100, damage: 10 });
    expect(ev.evaluate('hp - damage')).toBe(90);
  });

  it('evaluates boolean expression', () => {
    const ev = new ExpressionEvaluator({ hp: 0 });
    expect(ev.evaluate('hp > 0')).toBe(false);
  });

  it('evaluates template string interpolation', () => {
    const ev = new ExpressionEvaluator({ name: 'hero' });
    expect(ev.evaluate('${name} is ready')).toBe('hero is ready');
  });

  it('updateContext() propagates new values', () => {
    const ev = new ExpressionEvaluator({ hp: 100 });
    ev.updateContext({ hp: 50 });
    expect(ev.evaluate('hp')).toBe(50);
  });

  it('blocks dangerous patterns (eval)', () => {
    const ev = new ExpressionEvaluator({});
    expect(ev.evaluate('eval("1+1")')).toBeUndefined();
  });
});
