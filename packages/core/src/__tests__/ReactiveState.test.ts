import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReactiveState, ExpressionEvaluator, createState } from '../ReactiveState';

// =============================================================================
// REACTIVE STATE
// =============================================================================

describe('ReactiveState', () => {
  it('initializes with provided state', () => {
    const rs = new ReactiveState({ count: 0, name: 'test' });
    expect(rs.get('count')).toBe(0);
    expect(rs.get('name')).toBe('test');
  });

  it('sets and gets values', () => {
    const rs = new ReactiveState();
    rs.set('x', 42);
    expect(rs.get('x')).toBe(42);
  });

  it('has() checks existence', () => {
    const rs = new ReactiveState({ a: 1 });
    expect(rs.has('a')).toBe(true);
    expect(rs.has('b')).toBe(false);
  });

  it('notifies subscribers on change', () => {
    const rs = new ReactiveState({ val: 0 });
    const callback = vi.fn();
    rs.subscribe(callback);
    rs.set('val', 10);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ val: 10 }));
  });

  it('does not notify when same value is set', () => {
    const rs = new ReactiveState({ val: 5 });
    const callback = vi.fn();
    rs.subscribe(callback);
    rs.set('val', 5);
    expect(callback).not.toHaveBeenCalled();
  });

  it('unsubscribes correctly', () => {
    const rs = new ReactiveState({ val: 0 });
    const callback = vi.fn();
    const unsub = rs.subscribe(callback);
    unsub();
    rs.set('val', 99);
    expect(callback).not.toHaveBeenCalled();
  });

  it('batch updates via update()', () => {
    const rs = new ReactiveState({ a: 1, b: 2 });
    const callback = vi.fn();
    rs.subscribe(callback);
    rs.update({ a: 10, b: 20 });
    expect(rs.get('a')).toBe(10);
    expect(rs.get('b')).toBe(20);
    expect(callback).toHaveBeenCalled();
  });

  it('getSnapshot returns a copy', () => {
    const rs = new ReactiveState({ x: 1 });
    const snap = rs.getSnapshot();
    snap['x'] = 999;
    expect(rs.get('x')).toBe(1); // Original unchanged
  });

  it('proxy triggers notifications on deep set', () => {
    const rs = new ReactiveState({ nested: { a: 1 } as any });
    const callback = vi.fn();
    rs.subscribe(callback);
    const proxy = rs.getProxy();
    (proxy as any).nested.a = 42;
    expect(callback).toHaveBeenCalled();
  });

  it('createState factory works', () => {
    const rs = createState({ test: 'hello' });
    expect(rs.get('test')).toBe('hello');
  });
});

// =============================================================================
// EXPRESSION EVALUATOR
// =============================================================================

describe('ExpressionEvaluator', () => {
  it('evaluates simple arithmetic', () => {
    const ev = new ExpressionEvaluator({ x: 10, y: 20 });
    expect(ev.evaluate('x + y')).toBe(30);
  });

  it('evaluates comparisons', () => {
    const ev = new ExpressionEvaluator({ count: 5 });
    expect(ev.evaluate('count > 3')).toBe(true);
    expect(ev.evaluate('count < 2')).toBe(false);
  });

  it('interpolates template strings', () => {
    const ev = new ExpressionEvaluator({ name: 'World' });
    expect(ev.evaluate('Hello ${name}!')).toBe('Hello World!');
  });

  it('returns raw value for single interpolation', () => {
    const ev = new ExpressionEvaluator({ count: 42 });
    expect(ev.evaluate('${count}')).toBe(42);
  });

  it('blocks dangerous patterns', () => {
    const ev = new ExpressionEvaluator();
    expect(ev.evaluate('eval("alert(1)")')).toBeUndefined();
    expect(ev.evaluate('require("fs")')).toBeUndefined();
    expect(ev.evaluate('process.exit()')).toBeUndefined();
    expect(ev.evaluate('import("os")')).toBeUndefined();
  });

  it('returns non-expression strings as-is', () => {
    const ev = new ExpressionEvaluator();
    expect(ev.evaluate('just a string')).toBe('just a string');
  });

  it('updateContext adds new variables', () => {
    const ev = new ExpressionEvaluator({ a: 1 });
    ev.updateContext({ b: 2 });
    expect(ev.evaluate('a + b')).toBe(3);
  });

  it('setContext replaces entire context', () => {
    const ev = new ExpressionEvaluator({ a: 1 });
    ev.setContext({ b: 99 });
    // 'a' should no longer be defined
    expect(ev.evaluate('b')).toBe(99);
  });
});
