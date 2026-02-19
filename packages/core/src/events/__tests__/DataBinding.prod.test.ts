/**
 * DataBinding — Production Test Suite
 *
 * Covers: ReactiveProperty (get/set/watch/unwatch),
 * ComputedProperty (lazy recompute, dispose),
 * DataBindingManager (bind one-way, two-way, unbind, isbound).
 */
import { describe, it, expect, vi } from 'vitest';
import { ReactiveProperty, ComputedProperty, DataBindingManager } from '../DataBinding';

describe('ReactiveProperty — Production', () => {
  it('get/set value', () => {
    const p = new ReactiveProperty(10);
    expect(p.value).toBe(10);
    p.value = 20;
    expect(p.value).toBe(20);
  });

  it('watch fires on change', () => {
    const p = new ReactiveProperty(0);
    const cb = vi.fn();
    p.watch(cb);
    p.value = 5;
    expect(cb).toHaveBeenCalledWith(5, 0);
  });

  it('watch does not fire on same value', () => {
    const p = new ReactiveProperty(1);
    const cb = vi.fn();
    p.watch(cb);
    p.value = 1;
    expect(cb).not.toHaveBeenCalled();
  });

  it('unwatch stops notifications', () => {
    const p = new ReactiveProperty(0);
    const cb = vi.fn();
    const id = p.watch(cb);
    p.unwatch(id);
    p.value = 99;
    expect(cb).not.toHaveBeenCalled();
  });

  it('getWatcherCount reflects active watchers', () => {
    const p = new ReactiveProperty(0);
    const id = p.watch(vi.fn());
    expect(p.getWatcherCount()).toBe(1);
    p.unwatch(id);
    expect(p.getWatcherCount()).toBe(0);
  });
});

describe('ComputedProperty — Production', () => {
  it('computes initial value', () => {
    const a = new ReactiveProperty(2);
    const b = new ReactiveProperty(3);
    const sum = new ComputedProperty(() => a.value + b.value, [a as any, b as any]);
    expect(sum.value).toBe(5);
  });

  it('recomputes when dependency changes', () => {
    const a = new ReactiveProperty(1);
    const c = new ComputedProperty(() => a.value * 10, [a as any]);
    a.value = 5;
    expect(c.value).toBe(50);
  });

  it('dispose stops watching deps', () => {
    const a = new ReactiveProperty(1);
    const c = new ComputedProperty(() => a.value, [a as any]);
    c.dispose();
    expect(a.getWatcherCount()).toBe(0);
  });
});

describe('DataBindingManager — Production', () => {
  it('one-way bind syncs source to target', () => {
    const mgr = new DataBindingManager();
    const src = new ReactiveProperty(0);
    const tgt = new ReactiveProperty(0);
    mgr.bind('b1', src, tgt);
    src.value = 42;
    expect(tgt.value).toBe(42);
    expect(mgr.isbound('b1')).toBe(true);
  });

  it('two-way bind syncs both directions', () => {
    const mgr = new DataBindingManager();
    const a = new ReactiveProperty(0);
    const b = new ReactiveProperty(0);
    mgr.bind('b2', a, b, true);
    a.value = 10;
    expect(b.value).toBe(10);
    b.value = 20;
    expect(a.value).toBe(20);
  });

  it('unbind stops sync', () => {
    const mgr = new DataBindingManager();
    const src = new ReactiveProperty(0);
    const tgt = new ReactiveProperty(0);
    mgr.bind('b3', src, tgt);
    mgr.unbind('b3');
    src.value = 99;
    expect(tgt.value).toBe(0);
    expect(mgr.isbound('b3')).toBe(false);
  });

  it('getBindingCount tracks bindings', () => {
    const mgr = new DataBindingManager();
    const a = new ReactiveProperty(0);
    const b = new ReactiveProperty(0);
    mgr.bind('x', a, b);
    expect(mgr.getBindingCount()).toBe(1);
    mgr.unbind('x');
    expect(mgr.getBindingCount()).toBe(0);
  });
});
