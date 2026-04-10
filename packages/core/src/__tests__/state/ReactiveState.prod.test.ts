/**
 * ReactiveState & State Utilities Production Tests
 *
 * Covers: ReactiveState (get/set/has/subscribe/update/computed/watch/
 * undo/redo/getSnapshot/reset/destroy), reactive() proxy (mutations visible,
 * onMutation callback), ref() helper, computed() helper.
 *
 * NOTE: ReactiveState uses CRDTStateManager internally so requires network-
 * free operation — no syncId is passed so setupSync() is not called.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ReactiveState,
  createState,
  reactive,
  ref,
  computed,
  bind,
  ExpressionEvaluator,
} from '../../state/ReactiveState';
import type { StateDeclaration } from '../../types/HoloScriptPlus';

// ── fixture ───────────────────────────────────────────────────────────────────

interface PlayerState extends StateDeclaration {
  x: number;
  y: number;
  name: string;
  health: number;
}

function makeState(init: Partial<PlayerState> = {}): ReactiveState<PlayerState> {
  return new ReactiveState<PlayerState>({
    x: 0,
    y: 0,
    name: 'player',
    health: 100,
    ...init,
  } as PlayerState);
}

// ── get / set / has ───────────────────────────────────────────────────────────

describe('ReactiveState — get / set / has', () => {
  it('get returns initial value', () => {
    const s = makeState({ x: 5 });
    expect(s.get('x')).toBe(5);
  });

  it('set updates value; get returns new value', () => {
    const s = makeState({ x: 0 });
    s.set('x', 99);
    expect(s.get('x')).toBe(99);
  });

  it('set with same value is a no-op (no subscriber notify)', () => {
    const s = makeState({ x: 7 });
    const cb = vi.fn();
    s.subscribe(cb);
    s.set('x', 7);
    expect(cb).not.toHaveBeenCalled();
  });

  it('has returns true for defined key', () => {
    const s = makeState({ name: 'Alice' });
    expect(s.has('name')).toBe(true);
  });

  it('has returns false for undefined key value', () => {
    const s = makeState({} as any);
    expect(s.has('missingKey')).toBe(false);
  });
});

// ── subscribe ─────────────────────────────────────────────────────────────────

describe('ReactiveState — subscribe', () => {
  it('subscribe callback is called on set', () => {
    const s = makeState({ x: 0 });
    const cb = vi.fn();
    s.subscribe(cb);
    s.set('x', 10);
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ x: 10 }), 'x');
  });

  it('unsubscribe function stops future notifications', () => {
    const s = makeState({ x: 0 });
    const cb = vi.fn();
    const unsub = s.subscribe(cb);
    unsub();
    s.set('x', 55);
    expect(cb).not.toHaveBeenCalled();
  });

  it('multiple subscribers all receive notifications', () => {
    const s = makeState({ x: 0 });
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    s.subscribe(cb1);
    s.subscribe(cb2);
    s.set('x', 1);
    expect(cb1).toHaveBeenCalled();
    expect(cb2).toHaveBeenCalled();
  });

  it('changedKey matches the key that was set', () => {
    const s = makeState({});
    const keys: (keyof PlayerState)[] = [];
    s.subscribe((_state, k) => {
      if (k) keys.push(k);
    });
    s.set('name', 'Bob' as any);
    expect(keys).toContain('name');
  });
});

// ── update ────────────────────────────────────────────────────────────────────

describe('ReactiveState — update', () => {
  it('update applies multiple keys', () => {
    const s = makeState({ x: 0, y: 0 });
    s.update({ x: 3, y: 7 } as Partial<PlayerState>);
    expect(s.get('x')).toBe(3);
    expect(s.get('y')).toBe(7);
  });

  it('update notifies for each changed key', () => {
    const s = makeState({ x: 0, y: 0 });
    const keys: (keyof PlayerState)[] = [];
    s.subscribe((_state, k) => {
      if (k) keys.push(k);
    });
    s.update({ x: 1, y: 2 } as Partial<PlayerState>);
    expect(keys).toContain('x');
    expect(keys).toContain('y');
  });
});

// ── computed ──────────────────────────────────────────────────────────────────

describe('ReactiveState — computed', () => {
  it('computed returns getter result', () => {
    const s = makeState({ x: 3, y: 4 });
    const dist = s.computed('dist', () => Math.sqrt(9 + 16));
    expect(dist).toBeCloseTo(5, 5);
  });

  it('computed caches result for same key', () => {
    const s = makeState({ x: 0 });
    const getter = vi.fn(() => 42);
    s.computed('val', getter);
    s.computed('val', getter);
    // Should be called once (cached)
    expect(getter).toHaveBeenCalledTimes(1);
  });
});

// ── watch ─────────────────────────────────────────────────────────────────────

describe('ReactiveState — watch', () => {
  it('watch calls handler when key changes', () => {
    const s = makeState({ health: 100 });
    const handler = vi.fn();
    s.watch('health', handler);
    s.set('health', 80 as any);
    expect(handler).toHaveBeenCalledWith(80, 100);
  });

  it('watch returns unsubscribe that stops notifications', () => {
    const s = makeState({ health: 100 });
    const handler = vi.fn();
    const unsub = s.watch('health', handler);
    unsub();
    s.set('health', 50 as any);
    expect(handler).not.toHaveBeenCalled();
  });

  it('watch with immediate=true calls handler right away', () => {
    const s = makeState({ x: 42 });
    const handler = vi.fn();
    s.watch('x', handler, { immediate: true });
    expect(handler).toHaveBeenCalledWith(42, undefined);
  });
});

// ── undo / redo ───────────────────────────────────────────────────────────────

describe('ReactiveState — undo / redo', () => {
  it('undo reverts the last set', () => {
    const s = makeState({ x: 0 });
    s.set('x', 10);
    s.undo();
    expect(s.get('x')).toBe(0);
  });

  it('redo re-applies the undone set', () => {
    const s = makeState({ x: 0 });
    s.set('x', 10);
    s.undo();
    s.redo();
    expect(s.get('x')).toBe(10);
  });

  it('undo on empty history does not throw', () => {
    expect(() => makeState().undo()).not.toThrow();
  });

  it('redo on empty redo stack does not throw', () => {
    const s = makeState();
    expect(() => s.redo()).not.toThrow();
  });
});

// ── getSnapshot / reset ───────────────────────────────────────────────────────

describe('ReactiveState — getSnapshot / reset', () => {
  it('getSnapshot returns a shallow copy of current state', () => {
    const s = makeState({ x: 5, y: 10 });
    const snap = s.getSnapshot();
    expect(snap.x).toBe(5);
    expect(snap.y).toBe(10);
  });

  it('mutating snapshot does not affect state', () => {
    const s = makeState({ x: 5 });
    const snap = s.getSnapshot();
    (snap as any).x = 999;
    expect(s.get('x')).toBe(5);
  });

  it('reset replaces state with new values', () => {
    const s = makeState({ x: 5, y: 10, name: 'old', health: 100 });
    s.reset({ x: 0, y: 0, name: 'new', health: 50 } as PlayerState);
    expect(s.get('x')).toBe(0);
    expect(s.get('name')).toBe('new');
  });

  it('reset notifies subscribers', () => {
    const s = makeState({ x: 5 });
    const cb = vi.fn();
    s.subscribe(cb);
    s.reset({ x: 0, y: 0, name: 'r', health: 0 } as PlayerState);
    expect(cb).toHaveBeenCalled();
  });
});

// ── destroy ───────────────────────────────────────────────────────────────────

describe('ReactiveState — destroy', () => {
  it('destroy clears subscribers — no further notifications', () => {
    const s = makeState({ x: 0 });
    const cb = vi.fn();
    s.subscribe(cb);
    s.destroy();
    s.set('x', 1);
    expect(cb).not.toHaveBeenCalled();
  });
});

// ── reactive() factory ────────────────────────────────────────────────────────

describe('reactive()', () => {
  it('mutations on proxy are reflected', () => {
    const obj = reactive({ a: 1 });
    obj.a = 99;
    expect(obj.a).toBe(99);
  });

  it('onMutation callback is fired on mutation', () => {
    const cb = vi.fn();
    const obj = reactive({ a: 1 }, cb);
    obj.a = 42;
    expect(cb).toHaveBeenCalled();
  });

  it('onMutation receives old and new values', () => {
    const mutations: any[] = [];
    const obj = reactive({ n: 5 }, (_t, _k, val, old) => {
      mutations.push({ val, old });
    });
    obj.n = 10;
    expect(mutations[0].old).toBe(5);
    expect(mutations[0].val).toBe(10);
  });
});

// ── ref() ──────────────────────────────────────────────────────────────────────

describe('ref()', () => {
  it('ref wraps primitive in .value', () => {
    const r = ref(42);
    expect(r.value).toBe(42);
  });

  it('ref value is mutable', () => {
    const r = ref(0);
    r.value = 99;
    expect(r.value).toBe(99);
  });
});

// ── computed() factory ────────────────────────────────────────────────────────

describe('computed()', () => {
  it('computed value is derived from getter', () => {
    const c = computed(() => 2 + 2);
    expect(c.value).toBe(4);
  });

  it('computed caches result on subsequent access', () => {
    const getter = vi.fn(() => 42);
    const c = computed(getter);
    c.value;
    c.value;
    c.value;
    // Should only compute once (dirty is false after first evaluation)
    expect(getter).toHaveBeenCalledTimes(1);
  });
});

// ── createState() / bind() ────────────────────────────────────────────────────

describe('createState / bind', () => {
  it('createState creates a ReactiveState instance', () => {
    const s = createState<PlayerState>({ x: 1, y: 2, name: 'p', health: 100 });
    expect(s).toBeInstanceOf(ReactiveState);
    expect(s.get('x')).toBe(1);
  });

  it('bind().get reads current value', () => {
    const s = makeState({ x: 7 });
    const b = bind(s, 'x');
    expect(b.get()).toBe(7);
  });

  it('bind().set updates the state', () => {
    const s = makeState({ x: 0 });
    bind(s, 'x').set(55);
    expect(s.get('x')).toBe(55);
  });

  it('bind().subscribe fires on change', () => {
    const s = makeState({ x: 0 });
    const b = bind(s, 'x');
    const cb = vi.fn();
    b.subscribe(cb);
    s.set('x', 3);
    expect(cb).toHaveBeenCalledWith(3);
  });
});

// ── ExpressionEvaluator ───────────────────────────────────────────────────────

describe('ExpressionEvaluator', () => {
  it('evaluates simple arithmetic', () => {
    const ev = new ExpressionEvaluator();
    expect(ev.evaluate('2 + 2')).toBe(4);
  });

  it('evaluates expression using context variables', () => {
    const ev = new ExpressionEvaluator({ x: 10, y: 5 });
    expect(ev.evaluate('x + y')).toBe(15);
  });

  it('returns undefined for dangerous patterns (eval)', () => {
    const ev = new ExpressionEvaluator();
    expect(ev.evaluate('eval("1")')).toBeUndefined();
  });

  it('returns undefined for require() pattern', () => {
    const ev = new ExpressionEvaluator();
    expect(ev.evaluate('require("fs")')).toBeUndefined();
  });

  it('updateContext adds new variables', () => {
    const ev = new ExpressionEvaluator({ a: 1 });
    ev.updateContext({ b: 9 });
    expect(ev.evaluate('a + b')).toBe(10);
  });

  it('setContext replaces context entirely', () => {
    const ev = new ExpressionEvaluator({ a: 1 });
    ev.setContext({ z: 42 });
    // 'a' should no longer exist in context
    expect(ev.evaluate('z')).toBe(42);
  });

  it('handles syntax error gracefully', () => {
    const ev = new ExpressionEvaluator();
    expect(() => ev.evaluate('!!@@##')).not.toThrow();
  });
});
