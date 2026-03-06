/**
 * UIDataBinding.prod.test.ts — Sprint CLXX
 *
 * Production tests for the reactive model→view UIDataBinding system.
 * API: new UIDataBinding()
 *   .set(path, value)                                               → void
 *   .get<T>(path)                                                   → T | undefined
 *   .bind(modelPath, widgetId, widgetProperty, direction?, formatter?) → DataBinding
 *   .unbind(id)                                                     → boolean
 *   .resolve(bindingId)                                             → string | null
 *   .getBindingsForWidget(widgetId)                                 → DataBinding[]
 *   .getBindingsForPath(path)                                       → DataBinding[]
 *   .onChange(path, cb)                                             → void
 *   .propagate()                                                    → Map<string, string | null>
 *   .getBindingCount()                                              → number
 *   .getModel()                                                     → Record<string, unknown>
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UIDataBinding } from '../UIDataBinding';

let db: UIDataBinding;

beforeEach(() => {
  db = new UIDataBinding();
});

describe('UIDataBinding', () => {
  // -------------------------------------------------------------------------
  // set / get
  // -------------------------------------------------------------------------

  describe('set() / get()', () => {
    it('stores and retrieves a value', () => {
      db.set('player.name', 'Alice');
      expect(db.get('player.name')).toBe('Alice');
    });

    it('returns undefined for missing path', () => {
      expect(db.get('no.such.path')).toBeUndefined();
    });

    it('overwrites existing value', () => {
      db.set('score', 100);
      db.set('score', 200);
      expect(db.get('score')).toBe(200);
    });

    it('stores numbers', () => {
      db.set('hp', 42);
      expect(db.get<number>('hp')).toBe(42);
    });

    it('stores booleans', () => {
      db.set('visible', true);
      expect(db.get<boolean>('visible')).toBe(true);
    });

    it('stores objects', () => {
      db.set('pos', { x: 1, y: 2 });
      expect(db.get<{ x: number }>('pos')?.x).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // onChange
  // -------------------------------------------------------------------------

  describe('onChange()', () => {
    it('fires callback when value changes', () => {
      const cb = vi.fn();
      db.onChange('score', cb);
      db.set('score', 5);
      expect(cb).toHaveBeenCalledTimes(1);
      expect(cb).toHaveBeenCalledWith(5, undefined);
    });

    it('passes old value to callback', () => {
      const values: [unknown, unknown][] = [];
      db.onChange('score', (val, old) => values.push([val, old]));
      db.set('score', 10);
      db.set('score', 20);
      expect(values[0]).toEqual([10, undefined]);
      expect(values[1]).toEqual([20, 10]);
    });

    it('does not fire for different path', () => {
      const cb = vi.fn();
      db.onChange('score', cb);
      db.set('level', 3);
      expect(cb).not.toHaveBeenCalled();
    });

    it('multiple listeners on same path all fire', () => {
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      db.onChange('x', cb1);
      db.onChange('x', cb2);
      db.set('x', 1);
      expect(cb1).toHaveBeenCalledTimes(1);
      expect(cb2).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // bind / unbind / getBindingCount
  // -------------------------------------------------------------------------

  describe('bind() / unbind() / getBindingCount()', () => {
    it('bind() returns a DataBinding with an id', () => {
      const b = db.bind('score', 'scoreLabel', 'text');
      expect(b.id).toBeDefined();
      expect(b.modelPath).toBe('score');
      expect(b.widgetId).toBe('scoreLabel');
      expect(b.widgetProperty).toBe('text');
    });

    it('default direction is one-way', () => {
      const b = db.bind('score', 'w', 'text');
      expect(b.direction).toBe('one-way');
    });

    it('accepts two-way direction', () => {
      const b = db.bind('score', 'w', 'text', 'two-way');
      expect(b.direction).toBe('two-way');
    });

    it('getBindingCount increments per bind()', () => {
      db.bind('a', 'w1', 'text');
      db.bind('b', 'w2', 'value');
      expect(db.getBindingCount()).toBe(2);
    });

    it('unbind() removes a binding', () => {
      const b = db.bind('score', 'w', 'text');
      expect(db.unbind(b.id)).toBe(true);
      expect(db.getBindingCount()).toBe(0);
    });

    it('unbind() returns false for unknown id', () => {
      expect(db.unbind('no-such-id')).toBe(false);
    });

    it('each bind() produces unique id', () => {
      const b1 = db.bind('a', 'w1', 'text');
      const b2 = db.bind('b', 'w2', 'text');
      expect(b1.id).not.toBe(b2.id);
    });
  });

  // -------------------------------------------------------------------------
  // resolve
  // -------------------------------------------------------------------------

  describe('resolve()', () => {
    it('returns null for unknown binding id', () => {
      expect(db.resolve('nope')).toBeNull();
    });

    it('returns empty string when model value is undefined', () => {
      const b = db.bind('missing', 'w', 'text');
      expect(db.resolve(b.id)).toBe('');
    });

    it('converts number to string', () => {
      db.set('score', 42);
      const b = db.bind('score', 'w', 'text');
      expect(db.resolve(b.id)).toBe('42');
    });

    it('converts boolean to string', () => {
      db.set('active', true);
      const b = db.bind('active', 'w', 'text');
      expect(db.resolve(b.id)).toBe('true');
    });

    it('applies formatter when provided', () => {
      db.set('price', 9.99);
      const b = db.bind('price', 'w', 'text', 'one-way', (v) => `$${(v as number).toFixed(2)}`);
      expect(db.resolve(b.id)).toBe('$9.99');
    });

    it('formatter receives raw model value', () => {
      let received: unknown;
      db.set('raw', 'hello');
      const b = db.bind('raw', 'w', 'text', 'one-way', (v) => { received = v; return String(v); });
      db.resolve(b.id);
      expect(received).toBe('hello');
    });

    it('updates reflected in resolve() after set()', () => {
      const b = db.bind('n', 'w', 'text');
      db.set('n', 1);
      expect(db.resolve(b.id)).toBe('1');
      db.set('n', 99);
      expect(db.resolve(b.id)).toBe('99');
    });
  });

  // -------------------------------------------------------------------------
  // getBindingsForWidget / getBindingsForPath
  // -------------------------------------------------------------------------

  describe('getBindingsForWidget() / getBindingsForPath()', () => {
    it('getBindingsForWidget returns bindings for that widget id', () => {
      db.bind('a', 'w1', 'text');
      db.bind('b', 'w1', 'value');
      db.bind('c', 'w2', 'text');
      const result = db.getBindingsForWidget('w1');
      expect(result.length).toBe(2);
      expect(result.every(b => b.widgetId === 'w1')).toBe(true);
    });

    it('getBindingsForWidget returns empty array for unknown widget', () => {
      expect(db.getBindingsForWidget('unknown')).toEqual([]);
    });

    it('getBindingsForPath returns bindings for that model path', () => {
      db.bind('score', 'w1', 'text');
      db.bind('score', 'w2', 'value');
      db.bind('level', 'w3', 'text');
      const result = db.getBindingsForPath('score');
      expect(result.length).toBe(2);
      expect(result.every(b => b.modelPath === 'score')).toBe(true);
    });

    it('getBindingsForPath returns empty array for unknown path', () => {
      expect(db.getBindingsForPath('nope')).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // propagate
  // -------------------------------------------------------------------------

  describe('propagate()', () => {
    it('returns a map with key per binding id', () => {
      const b = db.bind('score', 'w', 'text');
      db.set('score', 5);
      const result = db.propagate();
      expect(result.has(b.id)).toBe(true);
    });

    it('resolved values in map match resolve() directly', () => {
      db.set('hp', 100);
      const b = db.bind('hp', 'w', 'text');
      const result = db.propagate();
      expect(result.get(b.id)).toBe(db.resolve(b.id));
    });

    it('multiple bindings all appear in result', () => {
      const b1 = db.bind('a', 'w1', 'text');
      const b2 = db.bind('b', 'w2', 'text');
      db.set('a', 1); db.set('b', 2);
      const result = db.propagate();
      expect(result.size).toBe(2);
      expect(result.has(b1.id)).toBe(true);
      expect(result.has(b2.id)).toBe(true);
    });

    it('returns empty map when no bindings', () => {
      expect(db.propagate().size).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // getModel
  // -------------------------------------------------------------------------

  describe('getModel()', () => {
    it('returns a snapshot of the current model', () => {
      db.set('x', 10);
      const model = db.getModel();
      expect(model['x']).toBe(10);
    });

    it('returns a copy (mutating does not affect internal state)', () => {
      db.set('x', 1);
      const model = db.getModel();
      model['x'] = 999;
      expect(db.get('x')).toBe(1);
    });
  });
});
