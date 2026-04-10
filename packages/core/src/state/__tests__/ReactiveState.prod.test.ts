/**
 * ReactiveState Production Tests
 *
 * Proxy-based reactivity: get/set, has, update, subscribe, computed,
 * watch, undo/redo, snapshot, reset, destroy.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReactiveState } from '../ReactiveState';

interface TestState {
  count: number;
  name: string;
  items: string[];
}

function makeState(init?: Partial<TestState>): ReactiveState<TestState> {
  return new ReactiveState<TestState>({
    count: 0,
    name: 'test',
    items: [],
    ...init,
  });
}

describe('ReactiveState — Production', () => {
  let state: ReactiveState<TestState>;

  beforeEach(() => {
    state = makeState();
  });

  describe('get / set', () => {
    it('gets initial value', () => {
      expect(state.get('count')).toBe(0);
      expect(state.get('name')).toBe('test');
    });

    it('sets value', () => {
      state.set('count', 42);
      expect(state.get('count')).toBe(42);
    });
  });

  describe('has', () => {
    it('returns true for existing key', () => {
      expect(state.has('count')).toBe(true);
    });

    it('returns false for missing key', () => {
      expect(state.has('missing')).toBe(false);
    });
  });

  describe('update', () => {
    it('batch updates multiple keys', () => {
      state.update({ count: 10, name: 'updated' });
      expect(state.get('count')).toBe(10);
      expect(state.get('name')).toBe('updated');
    });
  });

  describe('subscribe', () => {
    it('notifies on change', () => {
      const cb = vi.fn();
      state.subscribe(cb);
      state.set('count', 5);
      expect(cb).toHaveBeenCalled();
    });

    it('unsubscribe stops notifications', () => {
      const cb = vi.fn();
      const unsub = state.subscribe(cb);
      unsub();
      state.set('count', 5);
      expect(cb).not.toHaveBeenCalled();
    });
  });

  describe('computed', () => {
    it('derives computed value', () => {
      state.set('count', 3);
      const doubled = state.computed('doubled', () => state.get('count') * 2);
      expect(doubled).toBe(6);
    });
  });

  describe('undo / redo', () => {
    it('undoes a set', () => {
      state.set('count', 0);
      state.set('count', 10);
      state.undo();
      expect(state.get('count')).toBe(0);
    });

    it('redo restores undone', () => {
      state.set('count', 0);
      state.set('count', 10);
      state.undo();
      state.redo();
      expect(state.get('count')).toBe(10);
    });
  });

  describe('getSnapshot', () => {
    it('returns copy of state', () => {
      state.set('count', 7);
      const snap = state.getSnapshot();
      expect(snap.count).toBe(7);
    });
  });

  describe('reset', () => {
    it('resets to provided state', () => {
      state.set('count', 99);
      state.reset({ count: 0, name: 'reset', items: [] });
      expect(state.get('count')).toBe(0);
      expect(state.get('name')).toBe('reset');
    });
  });

  describe('destroy', () => {
    it('does not throw', () => {
      expect(() => state.destroy()).not.toThrow();
    });
  });
});
