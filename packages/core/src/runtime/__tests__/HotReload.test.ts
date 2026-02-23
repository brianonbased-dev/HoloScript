/**
 * Sprint 8 — HotReload Tests (State Migration & Live Swap)
 *
 * Tests the HotReloadManager:
 * - register / onReload callback
 * - triggerReload with state migration (old state → new state)
 * - version tracking
 * - multiple watchers on same module key
 * - onError callback
 */

import { describe, it, expect, vi } from 'vitest';
import { HotReloadManager } from '../../runtime/HotReloadManager';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function noop() {}

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
    const received: any[] = [];
    hrm.watch('entity', (content, prevState) => received.push(prevState));
    hrm.triggerReload('entity', { ast: [] }, oldState);
    expect(received[0]).toEqual({ hp: 100, alive: true });
  });

  it('does nothing for unwatched module', () => {
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
});

// ---------------------------------------------------------------------------
// State migration helper
// ---------------------------------------------------------------------------

describe('HotReloadManager — state migration', () => {
  it('migrateState() preserves fields that exist in both old and new state', () => {
    const hrm = new HotReloadManager();
    const migrated = hrm.migrateState({ hp: 80, alive: true, gold: 5 }, { hp: 100, alive: false });
    // hp and alive from old; new state's gold is not in old so it is ignored
    expect(migrated).toEqual({ hp: 80, alive: true });
  });

  it('migrateState() uses newState defaults for fields missing from oldState', () => {
    const hrm = new HotReloadManager();
    const migrated = hrm.migrateState({ hp: 50 }, { hp: 100, mana: 200 });
    expect(migrated).toEqual({ hp: 50, mana: 200 });
  });

  it('migrateState() with null oldState returns newState', () => {
    const hrm = new HotReloadManager();
    const migrated = hrm.migrateState(null, { hp: 100 });
    expect(migrated).toEqual({ hp: 100 });
  });
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

describe('HotReloadManager — error handling', () => {
  it('calls onError when a watcher throws', () => {
    const onError = vi.fn();
    const hrm = new HotReloadManager({ onError });
    hrm.watch('bad', () => { throw new Error('boom'); });
    hrm.triggerReload('bad', {});
    expect(onError).toHaveBeenCalledWith('bad', expect.any(Error));
  });

  it('continues calling remaining watchers after one throws', () => {
    const onError = vi.fn();
    const ok = vi.fn();
    const hrm = new HotReloadManager({ onError });
    hrm.watch('m', () => { throw new Error('first'); });
    hrm.watch('m', ok);
    hrm.triggerReload('m', {});
    expect(ok).toHaveBeenCalledTimes(1);
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
});
