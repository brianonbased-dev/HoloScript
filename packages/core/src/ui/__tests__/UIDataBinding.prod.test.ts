/**
 * UIDataBinding Production Tests
 *
 * Reactive model → view bindings: set/get, bind/unbind, resolve (with formatter),
 * getBindingsForWidget/Path, onChange listener, propagate.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UIDataBinding } from '../UIDataBinding';

describe('UIDataBinding — Production', () => {
  let db: UIDataBinding;

  beforeEach(() => {
    db = new UIDataBinding();
  });

  describe('set / get', () => {
    it('stores and retrieves a value', () => {
      db.set('health', 100);
      expect(db.get('health')).toBe(100);
    });

    it('returns undefined for missing path', () => {
      expect(db.get('missing')).toBeUndefined();
    });

    it('overwrites previous value', () => {
      db.set('health', 100);
      db.set('health', 50);
      expect(db.get('health')).toBe(50);
    });
  });

  describe('bind / unbind', () => {
    it('creates binding with id', () => {
      const binding = db.bind('health', 'hpBar', 'text');
      expect(binding.id).toContain('binding_');
      expect(binding.modelPath).toBe('health');
      expect(binding.widgetId).toBe('hpBar');
    });

    it('unbind removes binding', () => {
      const binding = db.bind('health', 'hpBar', 'text');
      expect(db.getBindingCount()).toBe(1);
      db.unbind(binding.id);
      expect(db.getBindingCount()).toBe(0);
    });

    it('unbind returns false for missing', () => {
      expect(db.unbind('nope')).toBe(false);
    });
  });

  describe('resolve', () => {
    it('resolves binding to string', () => {
      db.set('score', 42);
      const binding = db.bind('score', 'display', 'text');
      expect(db.resolve(binding.id)).toBe('42');
    });

    it('returns empty string for undefined model value', () => {
      const binding = db.bind('missing', 'display', 'text');
      expect(db.resolve(binding.id)).toBe('');
    });

    it('uses formatter when provided', () => {
      db.set('health', 75);
      const binding = db.bind('health', 'hpBar', 'text', 'one-way', (v) => `HP: ${v}`);
      expect(db.resolve(binding.id)).toBe('HP: 75');
    });

    it('returns null for missing binding', () => {
      expect(db.resolve('nope')).toBeNull();
    });
  });

  describe('getBindingsForWidget / getBindingsForPath', () => {
    it('filters by widget id', () => {
      db.bind('health', 'hpBar', 'text');
      db.bind('mana', 'mpBar', 'text');
      expect(db.getBindingsForWidget('hpBar')).toHaveLength(1);
    });

    it('filters by model path', () => {
      db.bind('health', 'hpBar', 'text');
      db.bind('health', 'hpLabel', 'value');
      expect(db.getBindingsForPath('health')).toHaveLength(2);
    });
  });

  describe('onChange', () => {
    it('fires callback on set', () => {
      const cb = vi.fn();
      db.onChange('health', cb);
      db.set('health', 100);
      expect(cb).toHaveBeenCalledWith(100, undefined);
    });

    it('passes old value', () => {
      const cb = vi.fn();
      db.set('health', 100);
      db.onChange('health', cb);
      db.set('health', 50);
      expect(cb).toHaveBeenCalledWith(50, 100);
    });
  });

  describe('propagate', () => {
    it('resolves all bindings', () => {
      db.set('a', 1);
      db.set('b', 2);
      const b1 = db.bind('a', 'w1', 'text');
      const b2 = db.bind('b', 'w2', 'text');
      const result = db.propagate();
      expect(result.get(b1.id)).toBe('1');
      expect(result.get(b2.id)).toBe('2');
    });
  });

  describe('getModel', () => {
    it('returns copy of model', () => {
      db.set('x', 10);
      const model = db.getModel();
      expect(model.x).toBe(10);
      model.x = 99; // mutating copy shouldn't affect original
      expect(db.get('x')).toBe(10);
    });
  });
});
