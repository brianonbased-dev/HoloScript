/**
 * ReactiveState Unit Tests
 *
 * Tests proxy-based reactivity, computed properties,
 * subscriptions, undo/redo, batched updates, reset, destroy.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReactiveState } from '../ReactiveState';

interface TestState {
  count: number;
  name: string;
  items: string[];
}

describe('ReactiveState', () => {
  let state: ReactiveState<TestState>;

  beforeEach(() => {
    state = new ReactiveState<TestState>({
      count: 0,
      name: 'test',
      items: [],
    });
  });

  describe('get / set', () => {
    it('should get initial values', () => {
      expect(state.get('count')).toBe(0);
      expect(state.get('name')).toBe('test');
    });

    it('should set and retrieve values', () => {
      state.set('count', 42);
      expect(state.get('count')).toBe(42);
    });

    it('should set string values', () => {
      state.set('name', 'updated');
      expect(state.get('name')).toBe('updated');
    });
  });

  describe('has', () => {
    it('should return true for existing keys', () => {
      expect(state.has('count')).toBe(true);
      expect(state.has('name')).toBe(true);
    });

    it('should return false for missing keys', () => {
      expect(state.has('nonexistent')).toBe(false);
    });
  });

  describe('subscribe', () => {
    it('should notify subscribers on change', () => {
      const cb = vi.fn();
      state.subscribe(cb);
      state.set('count', 5);
      expect(cb).toHaveBeenCalled();
    });

    it('should stop notifying after unsubscribe', () => {
      const cb = vi.fn();
      const unsub = state.subscribe(cb);
      unsub();
      state.set('count', 5);
      expect(cb).not.toHaveBeenCalled();
    });
  });

  describe('update (batch)', () => {
    it('should apply partial updates', () => {
      state.update({ count: 10, name: 'batch' });
      expect(state.get('count')).toBe(10);
      expect(state.get('name')).toBe('batch');
    });
  });

  describe('undo / redo', () => {
    it('should undo a single change', () => {
      state.set('count', 1);
      state.set('count', 2);
      state.undo();
      expect(state.get('count')).toBe(1);
    });

    it('should redo an undone change', () => {
      state.set('count', 1);
      state.set('count', 2);
      state.undo();
      state.redo();
      expect(state.get('count')).toBe(2);
    });
  });

  describe('getSnapshot', () => {
    it('should return a copy of current state', () => {
      state.set('count', 99);
      const snap = state.getSnapshot();
      expect(snap.count).toBe(99);
      // Modifying snapshot should not affect state
      snap.count = 0;
      expect(state.get('count')).toBe(99);
    });
  });

  describe('reset', () => {
    it('should reset to provided state', () => {
      state.set('count', 100);
      state.reset({ count: 0, name: 'reset', items: [] });
      expect(state.get('count')).toBe(0);
      expect(state.get('name')).toBe('reset');
    });
  });

  describe('destroy', () => {
    it('should clear all subscriptions', () => {
      const cb = vi.fn();
      state.subscribe(cb);
      state.destroy();
      state.set('count', 1);
      expect(cb).not.toHaveBeenCalled();
    });
  });

  describe('computed', () => {
    it('should compute derived values', () => {
      state.set('count', 5);
      const doubled = state.computed('doubled', () => state.get('count') * 2);
      expect(doubled).toBe(10);
    });
  });

  describe('watch', () => {
    it('should watch a specific key for changes', () => {
      const handler = vi.fn();
      state.watch('count', handler);
      state.set('count', 10);
      expect(handler).toHaveBeenCalledWith(10, 0);
    });

    it('should unsubscribe watch', () => {
      const handler = vi.fn();
      const unsub = state.watch('count', handler);
      unsub();
      state.set('count', 10);
      expect(handler).not.toHaveBeenCalled();
    });
  });
});
