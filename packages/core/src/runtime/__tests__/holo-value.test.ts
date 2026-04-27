import { describe, expect, it } from 'vitest';
import { resolveHoloValue } from '../holo-value';

describe('resolveHoloValue', () => {
  describe('primitives', () => {
    it('returns null unchanged', () => {
      expect(resolveHoloValue(null)).toBeNull();
    });

    it('returns string unchanged', () => {
      expect(resolveHoloValue('hello')).toBe('hello');
    });

    it('returns empty string unchanged', () => {
      expect(resolveHoloValue('')).toBe('');
    });

    it('returns number unchanged', () => {
      expect(resolveHoloValue(42)).toBe(42);
    });

    it('returns 0 unchanged', () => {
      expect(resolveHoloValue(0)).toBe(0);
    });

    it('returns boolean true unchanged', () => {
      expect(resolveHoloValue(true)).toBe(true);
    });

    it('returns boolean false unchanged', () => {
      expect(resolveHoloValue(false)).toBe(false);
    });
  });

  describe('arrays', () => {
    it('returns empty array as empty array', () => {
      expect(resolveHoloValue([])).toEqual([]);
    });

    it('maps over array of primitives', () => {
      expect(resolveHoloValue([1, 'two', true])).toEqual([1, 'two', true]);
    });

    it('recursively resolves nested arrays', () => {
      expect(resolveHoloValue([[1, 2], [3, 4]])).toEqual([[1, 2], [3, 4]]);
    });

    it('resolves array containing null', () => {
      expect(resolveHoloValue([null, 1])).toEqual([null, 1]);
    });

    it('resolves array of objects', () => {
      expect(resolveHoloValue([{ a: 1 }, { b: 2 }])).toEqual([{ a: 1 }, { b: 2 }]);
    });
  });

  describe('bind markers', () => {
    it('passes through object with __bind sentinel intact', () => {
      const bindMarker = { __bind: true, name: 'myVar' };
      const result = resolveHoloValue(bindMarker as any);
      expect(result).toBe(bindMarker);
    });

    it('does not recurse into bind marker keys', () => {
      const bindMarker = { __bind: true, nested: { x: 1 } };
      const result = resolveHoloValue(bindMarker as any) as Record<string, unknown>;
      // Should be the same reference, not a deep copy
      expect(result).toBe(bindMarker);
    });
  });

  describe('plain objects', () => {
    it('returns empty object for empty input object', () => {
      expect(resolveHoloValue({})).toEqual({});
    });

    it('resolves shallow object', () => {
      expect(resolveHoloValue({ x: 1, y: 'two' })).toEqual({ x: 1, y: 'two' });
    });

    it('recursively resolves nested objects', () => {
      const input = { outer: { inner: 42 } };
      expect(resolveHoloValue(input as any)).toEqual({ outer: { inner: 42 } });
    });

    it('resolves object with array value', () => {
      const input = { items: [1, 2, 3] };
      expect(resolveHoloValue(input as any)).toEqual({ items: [1, 2, 3] });
    });

    it('resolves object with null value', () => {
      const input = { x: null };
      expect(resolveHoloValue(input as any)).toEqual({ x: null });
    });

    it('resolves deeply nested mixed structure', () => {
      const input = {
        name: 'test',
        coords: [0, 1, 2],
        meta: { active: true, count: 0 },
      };
      expect(resolveHoloValue(input as any)).toEqual({
        name: 'test',
        coords: [0, 1, 2],
        meta: { active: true, count: 0 },
      });
    });
  });
});
