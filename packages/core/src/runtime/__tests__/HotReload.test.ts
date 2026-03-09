/**
 * HotReloadManager Tests
 *
 * Tests the HotReloadManager:
 * - Constructor / initialization with and without options
 * - Registration (watch / unwatch / unwatchAll / isWatched)
 * - triggerReload with state migration (old state -> new state)
 * - Version tracking
 * - Multiple watchers on same module key
 * - onError callback
 * - migrateState helper
 * - Edge cases
 */

import { describe, it, expect, vi } from 'vitest';
import { HotReloadManager } from '../../runtime/HotReloadManager';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function noop() {}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

describe('HotReloadManager — construction', () => {
  it('creates instance with default options', () => {
    const hrm = new HotReloadManager();
    expect(hrm).toBeInstanceOf(HotReloadManager);
  });

  it('creates instance with onError callback', () => {
    const onError = vi.fn();
    const hrm = new HotReloadManager({ onError });
    expect(hrm).toBeInstanceOf(HotReloadManager);
  });

  it('starts with no watched keys', () => {
    const hrm = new HotReloadManager();
    expect(hrm.isWatched('anything')).toBe(false);
  });

  it('starts with version 0 for any key', () => {
    const hrm = new HotReloadManager();
    expect(hrm.version('anything')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

describe('HotReloadManager — registration', () => {
  it('registers a reload watcher', () => {
    const hrm = new HotReloadManager();
    hrm.watch('scene/World', noop);
    expect(hrm.isWatched('scene/World')).toBe(true);
  });

  it('returns false for unwatched modules', () => {
    const hrm = new HotReloadManager();
    expect(hrm.isWatched('scene/Unknown')).toBe(false);
  });

  it('supports multiple watchers on the same key', () => {
    const hrm = new HotReloadManager();
    const a = vi.fn();
    const b = vi.fn();
    hrm.watch('mod', a);
    hrm.watch('mod', b);
    hrm.triggerReload('mod', {});
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('watch returns an unsubscribe function', () => {
    const hrm = new HotReloadManager();
    const watcher = vi.fn();
    const unsub = hrm.watch('key', watcher);
    expect(typeof unsub).toBe('function');
    unsub();
    hrm.triggerReload('key', {});
    expect(watcher).not.toHaveBeenCalled();
  });

  it('calling unsubscribe multiple times does not throw', () => {
    const hrm = new HotReloadManager();
    const unsub = hrm.watch('key', noop);
    unsub();
    expect(() => unsub()).not.toThrow();
  });

  it('watchers on different keys are independent', () => {
    const hrm = new HotReloadManager();
    const w1 = vi.fn();
    const w2 = vi.fn();
    hrm.watch('a', w1);
    hrm.watch('b', w2);
    hrm.triggerReload('a', {});
    expect(w1).toHaveBeenCalledTimes(1);
    expect(w2).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Reload triggering
// ---------------------------------------------------------------------------

describe('HotReloadManager — triggerReload', () => {
  it('calls registered watcher with new module content', () => {
    const hrm = new HotReloadManager();
    const watcher = vi.fn();
    hrm.watch('scene/A', watcher);
    hrm.triggerReload('scene/A', { ast: [] });
    expect(watcher).toHaveBeenCalledWith({ ast: [] }, undefined, expect.any(Object));
  });

  it('passes old state to watcher for migration', () => {
    const hrm = new HotReloadManager();
    const oldState = { hp: 100, alive: true };
    const received: unknown[] = [];
    hrm.watch('entity', (content, prevState) => received.push(prevState));
    hrm.triggerReload('entity', { ast: [] }, oldState);
    expect(received[0]).toEqual({ hp: 100, alive: true });
  });

  it('does nothing for unwatched module (no throw)', () => {
    const hrm = new HotReloadManager();
    expect(() => hrm.triggerReload('ghost', {})).not.toThrow();
  });

  it('increments version on each reload', () => {
    const hrm = new HotReloadManager();
    hrm.watch('m', noop);
    hrm.triggerReload('m', {});
    hrm.triggerReload('m', {});
    expect(hrm.version('m')).toBe(2);
  });

  it('version increments even when no watchers exist', () => {
    const hrm = new HotReloadManager();
    hrm.triggerReload('noWatcher', {});
    hrm.triggerReload('noWatcher', {});
    expect(hrm.version('noWatcher')).toBe(2);
  });

  it('passes correct meta object with key and version', () => {
    const hrm = new HotReloadManager();
    const received: Array<{ key: string; version: number }> = [];
    hrm.watch('mod', (_content, _prev, meta) => received.push(meta));
    hrm.triggerReload('mod', 'v1');
    hrm.triggerReload('mod', 'v2');
    expect(received[0]).toEqual({ key: 'mod', version: 1 });
    expect(received[1]).toEqual({ key: 'mod', version: 2 });
  });

  it('watchers are called in registration order', () => {
    const hrm = new HotReloadManager();
    const order: number[] = [];
    hrm.watch('m', () => order.push(1));
    hrm.watch('m', () => order.push(2));
    hrm.watch('m', () => order.push(3));
    hrm.triggerReload('m', {});
    expect(order).toEqual([1, 2, 3]);
  });

  it('version tracks independently per key', () => {
    const hrm = new HotReloadManager();
    hrm.watch('a', noop);
    hrm.watch('b', noop);
    hrm.triggerReload('a', {});
    hrm.triggerReload('a', {});
    hrm.triggerReload('b', {});
    expect(hrm.version('a')).toBe(2);
    expect(hrm.version('b')).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// State migration helper
// ---------------------------------------------------------------------------

describe('HotReloadManager — state migration', () => {
  it('migrateState() preserves fields that exist in both old and new state', () => {
    const hrm = new HotReloadManager();
    const migrated = hrm.migrateState({ hp: 80, alive: true, gold: 5 }, { hp: 100, alive: false });
    // hp and alive from old; gold is NOT in new defaults so it's dropped
    expect(migrated).toEqual({ hp: 80, alive: true });
  });

  it('migrateState() uses newState defaults for fields missing from oldState', () => {
    const hrm = new HotReloadManager();
    const migrated = hrm.migrateState({ hp: 50 }, { hp: 100, mana: 200 });
    expect(migrated).toEqual({ hp: 50, mana: 200 });
  });

  it('migrateState() with null oldState returns copy of newState', () => {
    const hrm = new HotReloadManager();
    const newState = { hp: 100 };
    const migrated = hrm.migrateState(null, newState);
    expect(migrated).toEqual({ hp: 100 });
    // Should be a new object, not the same reference
    expect(migrated).not.toBe(newState);
  });

  it('migrateState() with undefined oldState returns copy of newState', () => {
    const hrm = new HotReloadManager();
    const newState = { hp: 100, mana: 50 };
    const migrated = hrm.migrateState(undefined, newState);
    expect(migrated).toEqual({ hp: 100, mana: 50 });
    expect(migrated).not.toBe(newState);
  });

  it('migrateState() discards fields in oldState not present in newState', () => {
    const hrm = new HotReloadManager();
    const migrated = hrm.migrateState(
      { hp: 80, obsoleteField: 'removed' },
      { hp: 100, newField: 'added' }
    );
    expect(migrated).toEqual({ hp: 80, newField: 'added' });
    expect('obsoleteField' in migrated).toBe(false);
  });

  it('migrateState() returns a new object (does not mutate inputs)', () => {
    const hrm = new HotReloadManager();
    const oldState = { hp: 50, pos: 10 };
    const newState = { hp: 100, pos: 0, mana: 200 };
    const migrated = hrm.migrateState(oldState, newState);
    expect(migrated).not.toBe(oldState);
    expect(migrated).not.toBe(newState);
    // Original objects should be unchanged
    expect(oldState).toEqual({ hp: 50, pos: 10 });
    expect(newState).toEqual({ hp: 100, pos: 0, mana: 200 });
  });

  it('migrateState() handles empty new state', () => {
    const hrm = new HotReloadManager();
    const migrated = hrm.migrateState({ hp: 100 }, {});
    expect(migrated).toEqual({});
  });

  it('migrateState() handles empty old state', () => {
    const hrm = new HotReloadManager();
    const migrated = hrm.migrateState({} as Record<string, unknown>, { hp: 100 });
    expect(migrated).toEqual({ hp: 100 });
  });

  it('migrateState() preserves value types (numbers, strings, booleans, arrays, objects)', () => {
    const hrm = new HotReloadManager();
    const oldState = {
      count: 42,
      name: 'player1',
      active: true,
      items: [1, 2, 3],
      nested: { x: 10 },
    };
    const newState = {
      count: 0,
      name: '',
      active: false,
      items: [] as number[],
      nested: { x: 0 },
    };
    const migrated = hrm.migrateState(oldState, newState);
    expect(migrated.count).toBe(42);
    expect(migrated.name).toBe('player1');
    expect(migrated.active).toBe(true);
    expect(migrated.items).toEqual([1, 2, 3]);
    expect(migrated.nested).toEqual({ x: 10 });
  });
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

describe('HotReloadManager — error handling', () => {
  it('calls onError when a watcher throws', () => {
    const onError = vi.fn();
    const hrm = new HotReloadManager({ onError });
    hrm.watch('bad', () => {
      throw new Error('boom');
    });
    hrm.triggerReload('bad', {});
    expect(onError).toHaveBeenCalledWith('bad', expect.any(Error));
  });

  it('continues calling remaining watchers after one throws', () => {
    const onError = vi.fn();
    const ok = vi.fn();
    const hrm = new HotReloadManager({ onError });
    hrm.watch('m', () => {
      throw new Error('first');
    });
    hrm.watch('m', ok);
    hrm.triggerReload('m', {});
    expect(ok).toHaveBeenCalledTimes(1);
  });

  it('wraps non-Error throws in Error', () => {
    const onError = vi.fn();
    const hrm = new HotReloadManager({ onError });
    hrm.watch('bad', () => {
      throw 'string-error'; // eslint-disable-line no-throw-literal
    });
    hrm.triggerReload('bad', {});
    expect(onError).toHaveBeenCalledWith('bad', expect.any(Error));
    const errorArg = onError.mock.calls[0][1] as Error;
    expect(errorArg.message).toBe('string-error');
  });

  it('silently swallows errors when no onError provided', () => {
    const hrm = new HotReloadManager(); // no onError
    const ok = vi.fn();
    hrm.watch('m', () => {
      throw new Error('no handler');
    });
    hrm.watch('m', ok);
    // Should not throw
    expect(() => hrm.triggerReload('m', {})).not.toThrow();
    expect(ok).toHaveBeenCalledTimes(1);
  });

  it('onError receives correct key for each failing module', () => {
    const onError = vi.fn();
    const hrm = new HotReloadManager({ onError });
    hrm.watch('module-a', () => {
      throw new Error('a-fail');
    });
    hrm.watch('module-b', () => {
      throw new Error('b-fail');
    });
    hrm.triggerReload('module-a', {});
    hrm.triggerReload('module-b', {});
    expect(onError).toHaveBeenCalledWith('module-a', expect.any(Error));
    expect(onError).toHaveBeenCalledWith('module-b', expect.any(Error));
  });
});

// ---------------------------------------------------------------------------
// Unwatch
// ---------------------------------------------------------------------------

describe('HotReloadManager — unwatch', () => {
  it('unwatch() removes a specific watcher', () => {
    const hrm = new HotReloadManager();
    const watcher = vi.fn();
    hrm.watch('k', watcher);
    hrm.unwatch('k', watcher);
    hrm.triggerReload('k', {});
    expect(watcher).not.toHaveBeenCalled();
  });

  it('unwatchAll() removes all watchers for a key', () => {
    const hrm = new HotReloadManager();
    const a = vi.fn();
    const b = vi.fn();
    hrm.watch('k', a);
    hrm.watch('k', b);
    hrm.unwatchAll('k');
    hrm.triggerReload('k', {});
    expect(a).not.toHaveBeenCalled();
    expect(b).not.toHaveBeenCalled();
  });

  it('isWatched returns false after unwatchAll', () => {
    const hrm = new HotReloadManager();
    hrm.watch('k', noop);
    hrm.unwatchAll('k');
    expect(hrm.isWatched('k')).toBe(false);
  });

  it('isWatched returns false after removing the only watcher', () => {
    const hrm = new HotReloadManager();
    const watcher = vi.fn();
    hrm.watch('k', watcher);
    hrm.unwatch('k', watcher);
    expect(hrm.isWatched('k')).toBe(false);
  });

  it('unwatch on non-existent key does not throw', () => {
    const hrm = new HotReloadManager();
    expect(() => hrm.unwatch('nonexistent', noop)).not.toThrow();
  });

  it('unwatchAll on non-existent key does not throw', () => {
    const hrm = new HotReloadManager();
    expect(() => hrm.unwatchAll('nonexistent')).not.toThrow();
  });

  it('unwatch only removes the specified watcher, others remain', () => {
    const hrm = new HotReloadManager();
    const a = vi.fn();
    const b = vi.fn();
    hrm.watch('k', a);
    hrm.watch('k', b);
    hrm.unwatch('k', a);
    hrm.triggerReload('k', {});
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Version tracking
// ---------------------------------------------------------------------------

describe('HotReloadManager — version tracking', () => {
  it('version starts at 0 for untracked key', () => {
    const hrm = new HotReloadManager();
    expect(hrm.version('new-key')).toBe(0);
  });

  it('version increments with each triggerReload', () => {
    const hrm = new HotReloadManager();
    hrm.watch('m', noop);
    expect(hrm.version('m')).toBe(0);
    hrm.triggerReload('m', {});
    expect(hrm.version('m')).toBe(1);
    hrm.triggerReload('m', {});
    expect(hrm.version('m')).toBe(2);
    hrm.triggerReload('m', {});
    expect(hrm.version('m')).toBe(3);
  });

  it('version persists after all watchers are removed', () => {
    const hrm = new HotReloadManager();
    const w = vi.fn();
    hrm.watch('m', w);
    hrm.triggerReload('m', {});
    hrm.unwatch('m', w);
    expect(hrm.version('m')).toBe(1);
  });
});
