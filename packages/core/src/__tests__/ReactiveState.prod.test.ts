/**
 * ReactiveState + ExpressionEvaluator — Production Test Suite
 *
 * Covers: get/set/has, subscribe/unsubscribe, batch update,
 * getSnapshot, proxy reactivity, createState factory.
 * ExpressionEvaluator: evaluate, interpolate, context, security blocks.
 */
import { describe, it, expect, vi } from 'vitest';
import { ReactiveState, ExpressionEvaluator, createState } from '../ReactiveState';

describe('ReactiveState — Production', () => {
  it('get/set stores and retrieves values', () => {
    const s = new ReactiveState();
    s.set('x', 10);
    expect(s.get('x')).toBe(10);
  });

  it('has returns true for set keys', () => {
    const s = new ReactiveState({ a: 1 });
    expect(s.has('a')).toBe(true);
    expect(s.has('b')).toBe(false);
  });

  it('subscribe fires on set', () => {
    const s = new ReactiveState();
    const cb = vi.fn();
    s.subscribe(cb);
    s.set('x', 5);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('unsubscribe stops notifications', () => {
    const s = new ReactiveState();
    const cb = vi.fn();
    const unsub = s.subscribe(cb);
    unsub();
    s.set('x', 5);
    expect(cb).not.toHaveBeenCalled();
  });

  it('update applies multiple changes', () => {
    const s = new ReactiveState();
    s.update({ a: 1, b: 2 });
    expect(s.get('a')).toBe(1);
    expect(s.get('b')).toBe(2);
  });

  it('getSnapshot returns a copy', () => {
    const s = new ReactiveState({ x: 42 });
    const snap = s.getSnapshot();
    expect(snap[0]).toBe(42);
    snap[0] = 99;
    expect(s.get('x')).toBe(42); // original unchanged
  });

  it('createState factory works', () => {
    const s = createState({ name: 'test' });
    expect(s.get('name')).toBe('test');
  });

  it('proxy triggers reactivity on nested write', () => {
    const s = new ReactiveState({ obj: { a: 1 } });
    const cb = vi.fn();
    s.subscribe(cb);
    const prx = s.getProxy();
    (prx as any).obj.a = 2;
    expect(cb).toHaveBeenCalled();
  });
});

describe('ExpressionEvaluator — Production', () => {
  it('evaluates simple math', () => {
    const ee = new ExpressionEvaluator({ a: 2, b: 3 });
    expect(ee.evaluate('a + b')).toBe(5);
  });

  it('interpolates template strings', () => {
    const ee = new ExpressionEvaluator({ name: 'World' });
    expect(ee.evaluate('Hello ${name}!')).toBe('Hello World!');
  });

  it('returns raw value for single interpolation', () => {
    const ee = new ExpressionEvaluator({ x: 42 });
    expect(ee.evaluate('${x}')).toBe(42);
  });

  it('blocks dangerous expressions', () => {
    const ee = new ExpressionEvaluator();
    expect(ee.evaluate('eval("bad")')).toBeUndefined();
    expect(ee.evaluate('require("fs")')).toBeUndefined();
  });

  it('updateContext adds new variables', () => {
    const ee = new ExpressionEvaluator({ a: 1 });
    ee.updateContext({ b: 2 });
    expect(ee.evaluate('a + b')).toBe(3);
  });

  it('setContext replaces all variables', () => {
    const ee = new ExpressionEvaluator({ a: 1 });
    ee.setContext({ b: 99 });
    expect(ee.evaluate('b')).toBe(99);
  });
});
