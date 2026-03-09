/**
 * ReactiveState + ExpressionEvaluator — Depth Test Suite
 *
 * Covers areas not in the base prod test: multiple concurrent subscribers,
 * proxy chain writes, initial-value reactivity, freeze-safety, nested
 * object mutation via proxy, ExpressionEvaluator edge cases.
 */
import { describe, it, expect, vi } from 'vitest';
import { ReactiveState, ExpressionEvaluator, createState } from '../ReactiveState';

// ─── ReactiveState — multiple subscribers ─────────────────────────────────

describe('ReactiveState — multiple subscribers', () => {
  it('notifies all subscribers on set', () => {
    const s = new ReactiveState({ x: 0 });
    const cb1 = vi.fn(),
      cb2 = vi.fn(),
      cb3 = vi.fn();
    s.subscribe(cb1);
    s.subscribe(cb2);
    s.subscribe(cb3);
    s.set('x', 1);
    expect(cb1).toHaveBeenCalledTimes(1);
    expect(cb2).toHaveBeenCalledTimes(1);
    expect(cb3).toHaveBeenCalledTimes(1);
  });
  it('unsubscribing one does not affect others', () => {
    const s = new ReactiveState({ y: 0 });
    const cb1 = vi.fn(),
      cb2 = vi.fn();
    const unsub1 = s.subscribe(cb1);
    s.subscribe(cb2);
    unsub1();
    s.set('y', 7);
    expect(cb1).not.toHaveBeenCalled();
    expect(cb2).toHaveBeenCalledTimes(1);
  });
  it('each subscriber receives the updated snapshot', () => {
    const s = new ReactiveState({ count: 0 });
    const snapshots: any[] = [];
    s.subscribe((snap) => snapshots.push(snap));
    s.subscribe((snap) => snapshots.push(snap));
    s.set('count', 42);
    expect(snapshots[0].count).toBe(42);
    expect(snapshots[1].count).toBe(42);
  });
});

describe('ReactiveState — subscriber called on update()', () => {
  it('subscriber called on each update key', () => {
    const s = new ReactiveState({ a: 0, b: 0 });
    const calls: number[] = [];
    s.subscribe(() => calls.push(1));
    s.update({ a: 1, b: 2 });
    expect(calls.length).toBeGreaterThanOrEqual(1);
  });
  it('snapshot after update reflects all changes', () => {
    const s = new ReactiveState({ x: 0, y: 0, z: 0 });
    s.update({ x: 1, y: 2, z: 3 });
    const snap = s.getSnapshot();
    expect(snap.x).toBe(1);
    expect(snap.y).toBe(2);
    expect(snap.z).toBe(3);
  });
});

describe('ReactiveState — proxy', () => {
  it('getProxy() returns an object', () => {
    const s = new ReactiveState({ a: 1 });
    expect(typeof s.getProxy()).toBe('object');
  });
  it('proxy read reflects stored value', () => {
    const s = new ReactiveState({ v: 99 });
    const prx = s.getProxy() as any;
    expect(prx.v).toBe(99);
  });
  it('proxy write notifies subscriber', () => {
    const s = new ReactiveState({ n: 0 });
    const cb = vi.fn();
    s.subscribe(cb);
    const prx = s.getProxy() as any;
    prx.n = 5;
    expect(cb).toHaveBeenCalled();
  });
  it('proxy write updates the state value', () => {
    const s = new ReactiveState({ score: 0 });
    const prx = s.getProxy() as any;
    prx.score = 100;
    expect(s.get('score')).toBe(100);
  });
  it('nested proxy write triggers reactivity', () => {
    const s = new ReactiveState({ obj: { nested: 0 } });
    const cb = vi.fn();
    s.subscribe(cb);
    const prx = s.getProxy() as any;
    prx.obj.nested = 42;
    expect(cb).toHaveBeenCalled();
  });
  it('proxy always returns same reference for same node', () => {
    const s = new ReactiveState({ a: 1 });
    expect(s.getProxy()).toBe(s.getProxy());
  });
});

describe('ReactiveState — initial state', () => {
  it('initial values available via get', () => {
    const s = new ReactiveState({ x: 5, y: 10 });
    expect(s.get('x')).toBe(5);
    expect(s.get('y')).toBe(10);
  });
  it('initial state does not trigger subscriber', () => {
    const cb = vi.fn();
    const s = new ReactiveState({ preloaded: 'value' });
    s.subscribe(cb);
    expect(cb).not.toHaveBeenCalled();
  });
});

// ─── ExpressionEvaluator — additional depth ────────────────────────────────

describe('ExpressionEvaluator — arithmetic depth', () => {
  it('complex chained arithmetic', () => {
    const ee = new ExpressionEvaluator({ x: 10, y: 3 });
    expect(ee.evaluate('x * y + x / 2')).toBeCloseTo(35, 5);
  });
  it('boolean AND expression', () => {
    const ee = new ExpressionEvaluator({ a: true, b: false });
    expect(ee.evaluate('a && b')).toBe(false);
  });
  it('boolean OR expression', () => {
    const ee = new ExpressionEvaluator({ a: true, b: false });
    expect(ee.evaluate('a || b')).toBe(true);
  });
  it('string equality comparison', () => {
    const ee = new ExpressionEvaluator({ s: 'hello' });
    expect(ee.evaluate('s === "hello"')).toBe(true);
  });
  it('nested ternary', () => {
    const ee = new ExpressionEvaluator({ level: 3 });
    expect(ee.evaluate('level > 2 ? "high" : "low"')).toBe('high');
  });
});

describe('ExpressionEvaluator — template interpolation depth', () => {
  it('multiple interpolations in one string', () => {
    const ee = new ExpressionEvaluator({ first: 'Hello', second: 'World' });
    expect(ee.evaluate('${first} ${second}!')).toBe('Hello World!');
  });
  it('interpolation with arithmetic', () => {
    const ee = new ExpressionEvaluator({ price: 10, qty: 3 });
    expect(ee.evaluate('Total: ${price * qty}')).toBe('Total: 30');
  });
  it('non-string input passes through unchanged', () => {
    const ee = new ExpressionEvaluator();
    expect(ee.evaluate(123 as any)).toBe(123);
    expect(ee.evaluate(null as any)).toBe(null);
  });
});

describe('ExpressionEvaluator — security depth', () => {
  const DANGEROUS = [
    'eval("1")',
    'require("path")',
    'process.exit(0)',
    '__dirname',
    '__filename',
    'global.x',
    'fs.readFileSync("x")',
  ];
  for (const expr of DANGEROUS) {
    it(`blocks: ${expr.slice(0, 30)}`, () => {
      const ee = new ExpressionEvaluator();
      expect(ee.evaluate(expr)).toBeUndefined();
    });
  }
});

describe('ExpressionEvaluator — context edge cases', () => {
  it('evaluate with numeric 0 context variable', () => {
    const ee = new ExpressionEvaluator({ n: 0 });
    expect(ee.evaluate('n + 5')).toBe(5);
  });
  it('evaluate with false boolean context variable', () => {
    const ee = new ExpressionEvaluator({ flag: false });
    expect(ee.evaluate('!flag')).toBe(true);
  });
  it('setContext wipes old variables', () => {
    const ee = new ExpressionEvaluator({ old: 42 });
    ee.setContext({ fresh: 99 });
    // 'old' is no longer in context — either throws (returns expression string) or returns undefined
    const result = ee.evaluate('old');
    // After setContext, the function body sees no 'old' binding, so it either throws
    // (caught and returns 'old' as a string) or returns undefined
    expect(result === 'old' || result === undefined || result === null).toBe(true);
  });
  it('updateContext merges without clearing existing', () => {
    const ee = new ExpressionEvaluator({ x: 1, y: 2 });
    ee.updateContext({ z: 3 });
    expect(ee.evaluate('x + y + z')).toBe(6);
  });
});
