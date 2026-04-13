/**
 * @fileoverview Tests for CRDT primitive types
 */

import { describe, it, expect } from 'vitest';
import { LWWRegister, GCounter, PNCounter, ORSet } from './CRDTPrimitives';

describe('CRDT Primitives', () => {
  describe('LWWRegister', () => {
    it('should initialize with a value', () => {
      const register = new LWWRegister('initial', 'node1');

      expect(register.get()).toBe('initial');
    });

    it('should update value with newer timestamp', () => {
      const register = new LWWRegister('initial', 'node1');

      register.set('updated');
      expect(register.get()).toBe('updated');
    });

    it('should merge with other register, keeping latest value', () => {
      const register1 = new LWWRegister('value1', 'node1');
      const register2 = new LWWRegister('value2', 'node2');

      register2.set('newer-value');
      const state2 = register2.getState();

      register1.merge(state2);
      expect(register1.get()).toBe('newer-value');
    });

    it('should preserve older value when merging with older timestamp', () => {
      const register = new LWWRegister('current', 'node1');
      register.set('current'); // Set with current timestamp

      const olderState = {
        value: 'older',
        timestamp: Date.now() - 1000, // 1 second ago
        nodeId: 'node2',
      };

      register.merge(olderState);
      expect(register.get()).toBe('current');
    });

    it('should return correct state', () => {
      const register = new LWWRegister('test-value', 'test-node');
      const state = register.getState();

      expect(state.value).toBe('test-value');
      expect(state.nodeId).toBe('test-node');
      expect(typeof state.timestamp).toBe('number');
    });
  });

  describe('GCounter', () => {
    it('should initialize with zero count for node', () => {
      const counter = new GCounter('node1');

      expect(counter.value()).toBe(0);
    });

    it('should increment by 1 by default', () => {
      const counter = new GCounter('node1');

      counter.increment();
      expect(counter.value()).toBe(1);

      counter.increment();
      expect(counter.value()).toBe(2);
    });

    it('should increment by specified amount', () => {
      const counter = new GCounter('node1');

      counter.increment(5);
      expect(counter.value()).toBe(5);

      counter.increment(3);
      expect(counter.value()).toBe(8);
    });

    it('should throw error for negative increments', () => {
      const counter = new GCounter('node1');

      expect(() => counter.increment(-1)).toThrow(
        'G-Counter only supports non-negative increments'
      );
    });

    it('should merge with other counter states', () => {
      const counter1 = new GCounter('node1');
      const counter2 = new GCounter('node2');

      counter1.increment(3);
      counter2.increment(2);

      const state2 = counter2.getState();
      counter1.merge(state2);

      expect(counter1.value()).toBe(5); // 3 + 2
    });

    it('should take maximum value during merge for same node', () => {
      const counter1 = new GCounter('node1');
      const counter2 = new GCounter('node1');

      counter1.increment(5);
      counter2.increment(3);

      const state2 = counter2.getState();
      counter1.merge(state2);

      expect(counter1.value()).toBe(5); // max(5, 3)
    });

    it('should handle multiple nodes in merge', () => {
      const counter = new GCounter('node1');
      const otherStates = new Map([
        ['node2', 10],
        ['node3', 5],
        ['node4', 8],
      ]);

      counter.increment(7);
      counter.merge(otherStates);

      expect(counter.value()).toBe(30); // 7 + 10 + 5 + 8
    });

    it('should return correct state map', () => {
      const counter = new GCounter('test-node');
      counter.increment(42);

      const state = counter.getState();

      expect(state.get('test-node')).toBe(42);
      expect(state.size).toBe(1);
    });

    it('should handle zero increments', () => {
      const counter = new GCounter('node1');

      counter.increment(0);
      expect(counter.value()).toBe(0);
    });
  });

  describe('PNCounter', () => {
    it('should initialize with zero value', () => {
      const counter = new PNCounter('node1');

      expect(counter.value()).toBe(0);
    });

    it('should increment positive values', () => {
      const counter = new PNCounter('node1');

      counter.increment(5);
      expect(counter.value()).toBe(5);
    });

    it('should decrement to negative values', () => {
      const counter = new PNCounter('node1');

      counter.decrement(3);
      expect(counter.value()).toBe(-3);
    });

    it('should handle mixed increment and decrement', () => {
      const counter = new PNCounter('node1');

      counter.increment(10);
      counter.decrement(3);
      counter.increment(2);
      counter.decrement(4);

      expect(counter.value()).toBe(5); // 10 - 3 + 2 - 4 = 5
    });

    it('should merge with other PN counter states', () => {
      const counter1 = new PNCounter('node1');
      const counter2 = new PNCounter('node2');

      counter1.increment(5);
      counter1.decrement(2);

      counter2.increment(3);
      counter2.decrement(7);

      const state2 = counter2.getState();
      counter1.merge(state2);

      expect(counter1.value()).toBe(-1); // (5-2) + (3-7) = 3 + (-4) = -1
    });

    it('should throw error for negative increments', () => {
      const counter = new PNCounter('node1');

      expect(() => counter.increment(-1)).toThrow();
    });

    it('should throw error for negative decrements', () => {
      const counter = new PNCounter('node1');

      expect(() => counter.decrement(-1)).toThrow();
    });

    it('should return correct state with positive and negative maps', () => {
      const counter = new PNCounter('test-node');
      counter.increment(10);
      counter.decrement(3);

      const state = counter.getState();

      expect(state.pos.get('test-node')).toBe(10);
      expect(state.neg.get('test-node')).toBe(3);
    });
  });

  describe('ORSet', () => {
    it('should initialize as empty set', () => {
      const set = new ORSet<string>('node1');

      expect(set.has('item')).toBe(false);
      expect(set.values()).toEqual([]);
      expect(set.size()).toBe(0);
    });

    it('should add items to set', () => {
      const set = new ORSet<string>('node1');

      set.add('item1');
      set.add('item2');

      expect(set.has('item1')).toBe(true);
      expect(set.has('item2')).toBe(true);
      expect(set.size()).toBe(2);
    });

    it('should remove items from set', () => {
      const set = new ORSet<string>('node1');

      set.add('item1');
      set.add('item2');
      set.remove('item1');

      expect(set.has('item1')).toBe(false);
      expect(set.has('item2')).toBe(true);
      expect(set.size()).toBe(1);
    });

    it('should handle add-remove-add sequence correctly', () => {
      const set = new ORSet<string>('node1');

      set.add('item');
      set.remove('item');
      set.add('item'); // Should be present again

      expect(set.has('item')).toBe(true);
    });

    it('should merge with other OR set states', () => {
      const set1 = new ORSet<string>('node1');
      const set2 = new ORSet<string>('node2');

      set1.add('a');
      set1.add('b');

      set2.add('b');
      set2.add('c');

      const state2 = set2.getState();
      set1.merge(state2);

      const values = set1.values();
      expect(values).toContain('a');
      expect(values).toContain('b');
      expect(values).toContain('c');
      expect(values.length).toBe(3);
    });

    it('should handle concurrent add/remove in merge', () => {
      const set1 = new ORSet<string>('node1');
      const set2 = new ORSet<string>('node2');

      // Both nodes add the same item
      set1.add('item');
      set2.add('item');

      // Node1 removes it
      set1.remove('item');

      // Merge - item should still exist because node2 added it
      const state2 = set2.getState();
      set1.merge(state2);

      expect(set1.has('item')).toBe(true);
    });

    it('should return correct state maps', () => {
      const set = new ORSet<string>('test-node');
      set.add('test-item');
      set.remove('test-item');
      set.add('test-item'); // Add again

      const state = set.getState();

      expect(state.elements.size).toBeGreaterThan(0);
      expect(state.tombstones.size).toBeGreaterThan(0);
    });

    it('should handle different value types', () => {
      const numberSet = new ORSet<number>('node1');
      numberSet.add(42);
      numberSet.add(100);

      expect(numberSet.has(42)).toBe(true);
      expect(numberSet.has(100)).toBe(true);
      expect(numberSet.has(999)).toBe(false);
    });
  });
});
