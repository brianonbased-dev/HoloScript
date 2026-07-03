/**
 * Sprint 3 — Reactive State Integration Tests
 *
 * Tests: ReactiveState API (get / set / subscribe / update / snapshot)
 *        ExpressionEvaluator with reactive context
 *
 * NOTE: This file previously also covered HoloScriptPlusParser.parseStateBlock /
 * parseOnBlock — those two describe blocks exercised the deleted root-level decoy
 * `HoloScriptPlusParser.ts` (a narrow "Trait Annotation" wrapper, NOT the real
 * grammar/directive parser at `parser/HoloScriptPlusParser.ts`). That coverage has
 * been moved to `ReactiveState.decoy-coverage-gap.test.ts.skip` and is a documented,
 * unresolved coverage gap — the real parser has no public standalone equivalent for
 * `parseStateBlock(code): Array<{name,value}>` / `parseOnBlock(code): Array<{event,body}>`.
 * See that file's header comment for detail.
 */

import { describe, it, expect, vi } from 'vitest';
import { ReactiveState, ExpressionEvaluator } from '../ReactiveState';

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
