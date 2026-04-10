import { describe, it, expect } from 'vitest';
import { List } from '../collections.js';

describe('List', () => {
  describe('construction', () => {
    it('should create empty list', () => {
      const list = new List<number>();
      expect(list.length).toBe(0);
      expect(list.isEmpty).toBe(true);
    });

    it('should create from array', () => {
      const list = new List([1, 2, 3]);
      expect(list.length).toBe(3);
    });

    it('should create with List.of()', () => {
      const list = List.of(1, 2, 3);
      expect(list.length).toBe(3);
    });

    it('should create with List.from()', () => {
      const list = List.from([1, 2, 3]);
      expect(list.length).toBe(3);
    });
  });

  describe('List.range()', () => {
    it('should create range with positive step', () => {
      const list = List.range(0, 5, 1);
      expect(list.toArray()).toEqual([0, 1, 2, 3, 4]);
    });

    it('should create range with default step', () => {
      const list = List.range(0, 3);
      expect(list.toArray()).toEqual([0, 1, 2]);
    });

    it('should create range with custom step', () => {
      const list = List.range(0, 10, 2);
      expect(list.toArray()).toEqual([0, 2, 4, 6, 8]);
    });

    it('should create range with negative step', () => {
      const list = List.range(5, 0, -1);
      expect(list.toArray()).toEqual([5, 4, 3, 2, 1]);
    });
  });

  describe('List.repeat()', () => {
    it('should create list with repeated values', () => {
      const list = List.repeat('a', 3);
      expect(list.toArray()).toEqual(['a', 'a', 'a']);
    });

    it('should create empty list with count 0', () => {
      const list = List.repeat('a', 0);
      expect(list.isEmpty).toBe(true);
    });
  });

  describe('accessors', () => {
    const list = List.of(10, 20, 30, 40, 50);

    it('should get element by positive index', () => {
      expect(list.get(0)).toBe(10);
      expect(list.get(2)).toBe(30);
    });

    it('should get element by negative index', () => {
      expect(list.get(-1)).toBe(50);
      expect(list.get(-2)).toBe(40);
    });

    it('should return undefined for out of bounds', () => {
      expect(list.get(10)).toBeUndefined();
    });

    it('should get first element', () => {
      expect(list.first()).toBe(10);
    });

    it('should get last element', () => {
      expect(list.last()).toBe(50);
    });

    it('should return undefined for first/last on empty list', () => {
      const empty = new List<number>();
      expect(empty.first()).toBeUndefined();
      expect(empty.last()).toBeUndefined();
    });
  });

  describe('map', () => {
    it('should map over elements', () => {
      const list = List.of(1, 2, 3);
      const doubled = list.map((x) => x * 2);
      expect(doubled.toArray()).toEqual([2, 4, 6]);
    });

    it('should receive index in map callback', () => {
      const list = List.of('a', 'b', 'c');
      const indexed = list.map((_, i) => i);
      expect(indexed.toArray()).toEqual([0, 1, 2]);
    });

    it('should return new List instance', () => {
      const list = List.of(1, 2, 3);
      const mapped = list.map((x) => x);
      expect(mapped).not.toBe(list);
    });
  });

  describe('filter', () => {
    it('should filter elements', () => {
      const list = List.of(1, 2, 3, 4, 5);
      const evens = list.filter((x) => x % 2 === 0);
      expect(evens.toArray()).toEqual([2, 4]);
    });

    it('should return empty list when nothing matches', () => {
      const list = List.of(1, 3, 5);
      const evens = list.filter((x) => x % 2 === 0);
      expect(evens.isEmpty).toBe(true);
    });
  });

  describe('flatMap', () => {
    it('should flatMap with arrays', () => {
      const list = List.of(1, 2, 3);
      const result = list.flatMap((x) => [x, x * 10]);
      expect(result.toArray()).toEqual([1, 10, 2, 20, 3, 30]);
    });

    it('should flatMap with Lists', () => {
      const list = List.of(1, 2);
      const result = list.flatMap((x) => List.of(x, x + 1));
      expect(result.toArray()).toEqual([1, 2, 2, 3]);
    });
  });

  describe('reduce', () => {
    it('should reduce with initial value', () => {
      const list = List.of(1, 2, 3, 4);
      const sum = list.reduce((acc, x) => acc + x, 0);
      expect(sum).toBe(10);
    });
  });

  describe('immutability', () => {
    it('operations should return new List instances', () => {
      const original = List.of(1, 2, 3);
      const mapped = original.map((x) => x * 2);
      const filtered = original.filter((x) => x > 1);

      expect(original.toArray()).toEqual([1, 2, 3]);
      expect(mapped.toArray()).toEqual([2, 4, 6]);
      expect(filtered.toArray()).toEqual([2, 3]);
    });
  });

  describe('toArray', () => {
    it('should return array copy', () => {
      const list = List.of(1, 2, 3);
      const arr = list.toArray();
      expect(arr).toEqual([1, 2, 3]);
      arr.push(4);
      expect(list.length).toBe(3); // Original unchanged
    });
  });

  describe('iteration', () => {
    it('should be iterable', () => {
      const list = List.of(1, 2, 3);
      const result: number[] = [];
      for (const item of list) {
        result.push(item);
      }
      expect(result).toEqual([1, 2, 3]);
    });
  });
});
