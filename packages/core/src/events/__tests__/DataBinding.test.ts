/**
 * DataBinding Unit Tests
 *
 * Tests ReactiveProperty, ComputedProperty, and DataBindingManager.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReactiveProperty, ComputedProperty, DataBindingManager } from '../DataBinding';

describe('ReactiveProperty', () => {
  it('should store and retrieve value', () => {
    const prop = new ReactiveProperty(42);
    expect(prop.value).toBe(42);
  });

  it('should update value', () => {
    const prop = new ReactiveProperty(0);
    prop.value = 10;
    expect(prop.value).toBe(10);
  });

  it('should notify watchers on change', () => {
    const prop = new ReactiveProperty('hello');
    const watcher = vi.fn();
    prop.watch(watcher);
    prop.value = 'world';
    expect(watcher).toHaveBeenCalledWith('world', 'hello');
  });

  it('should not notify when value unchanged', () => {
    const prop = new ReactiveProperty(5);
    const watcher = vi.fn();
    prop.watch(watcher);
    prop.value = 5;
    expect(watcher).not.toHaveBeenCalled();
  });

  it('should unwatch', () => {
    const prop = new ReactiveProperty(0);
    const watcher = vi.fn();
    const id = prop.watch(watcher);
    prop.unwatch(id);
    prop.value = 1;
    expect(watcher).not.toHaveBeenCalled();
  });

  it('should track watcher count', () => {
    const prop = new ReactiveProperty(0);
    expect(prop.getWatcherCount()).toBe(0);
    const id = prop.watch(() => {});
    expect(prop.getWatcherCount()).toBe(1);
    prop.unwatch(id);
    expect(prop.getWatcherCount()).toBe(0);
  });
});

describe('ComputedProperty', () => {
  it('should compute initial value', () => {
    const a = new ReactiveProperty(2);
    const b = new ReactiveProperty(3);
    const sum = new ComputedProperty(() => a.value + b.value, [a as any, b as any]);
    expect(sum.value).toBe(5);
  });

  it('should recompute when dependency changes', () => {
    const a = new ReactiveProperty(10);
    const computed = new ComputedProperty(() => a.value * 2, [a as any]);
    a.value = 20;
    expect(computed.value).toBe(40);
  });

  it('should cache until dirty', () => {
    let callCount = 0;
    const a = new ReactiveProperty(1);
    const computed = new ComputedProperty(() => { callCount++; return a.value; }, [a as any]);

    const v1 = computed.value; // may or may not recompute (depends on dirty)
    const initialCalls = callCount;
    const v2 = computed.value; // should NOT recompute (cached)
    expect(callCount).toBe(initialCalls); // No additional calls
  });

  it('should dispose watchers', () => {
    const a = new ReactiveProperty(1);
    const computed = new ComputedProperty(() => a.value, [a as any]);
    expect(a.getWatcherCount()).toBe(1);
    computed.dispose();
    expect(a.getWatcherCount()).toBe(0);
  });
});

describe('DataBindingManager', () => {
  it('should bind source to target (one-way)', () => {
    const manager = new DataBindingManager();
    const source = new ReactiveProperty(0);
    const target = new ReactiveProperty(0);

    manager.bind('binding1', source, target);
    source.value = 42;
    expect(target.value).toBe(42);
  });

  it('should bind two-way', () => {
    const manager = new DataBindingManager();
    const a = new ReactiveProperty(0);
    const b = new ReactiveProperty(0);

    manager.bind('binding1', a, b, true);
    a.value = 10;
    expect(b.value).toBe(10);

    b.value = 20;
    expect(a.value).toBe(20);
  });

  it('should unbind', () => {
    const manager = new DataBindingManager();
    const source = new ReactiveProperty(0);
    const target = new ReactiveProperty(0);

    manager.bind('b1', source, target);
    manager.unbind('b1');
    source.value = 99;
    expect(target.value).toBe(0); // Not updated
  });

  it('should track binding count', () => {
    const manager = new DataBindingManager();
    const s = new ReactiveProperty(0);
    const t = new ReactiveProperty(0);

    manager.bind('b1', s, t);
    expect(manager.getBindingCount()).toBe(1);
    expect(manager.isbound('b1')).toBe(true);
    expect(manager.isbound('b2')).toBe(false);
  });
});
