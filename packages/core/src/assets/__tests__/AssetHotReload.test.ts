import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AssetHotReload } from '../AssetHotReload';

describe('AssetHotReload', () => {
  let hr: AssetHotReload;

  beforeEach(() => {
    vi.useFakeTimers();
    hr = new AssetHotReload();
    hr.setDebounceMs(0); // No debounce for tests
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ---- Watch ----

  it('watch registers an asset', () => {
    hr.watch('a', '/path/a.png', 'h1');
    expect(hr.isWatched('a')).toBe(true);
  });

  it('unwatch removes asset', () => {
    hr.watch('a', '/path/a.png', 'h1');
    hr.unwatch('a');
    expect(hr.isWatched('a')).toBe(false);
  });

  // ---- Subscribe / Notify ----

  it('subscribe receives change notifications', () => {
    const cb = vi.fn();
    hr.subscribe('*', cb);
    hr.watch('a', '/path/a.png', 'h1');
    hr.reportChange('a', 'h2');
    hr.flush();
    expect(cb).toHaveBeenCalled();
    expect(cb.mock.calls[0][0].assetId).toBe('a');
  });

  it('unsubscribe stops notifications', () => {
    const cb = vi.fn();
    const id = hr.subscribe('*', cb);
    hr.unsubscribe(id);
    hr.watch('a', '/path/a.png', 'h1');
    hr.reportChange('a', 'h2');
    hr.flush();
    expect(cb).not.toHaveBeenCalled();
  });

  it('pattern matching filters by glob', () => {
    const cb = vi.fn();
    hr.subscribe('*.png', cb);
    hr.watch('a', '/path/a.png', 'h1');
    hr.watch('b', '/path/b.glb', 'h2');
    hr.reportChange('a', 'h3');
    hr.reportChange('b', 'h4');
    hr.flush();
    expect(cb).toHaveBeenCalledTimes(1); // Only .png
  });

  // ---- Enable / Disable ----

  it('disabled hot reload ignores changes', () => {
    const cb = vi.fn();
    hr.subscribe('*', cb);
    hr.watch('a', '/path/a.png', 'h1');
    hr.setEnabled(false);
    hr.reportChange('a', 'h2');
    hr.flush();
    expect(cb).not.toHaveBeenCalled();
  });

  // ---- History ----

  it('getChangeHistory tracks changes', () => {
    hr.watch('a', '/path/a.png', 'h1');
    hr.reportChange('a', 'h2');
    hr.flush();
    const history = hr.getChangeHistory();
    expect(history.length).toBe(1);
    expect(history[0].changeType).toBe('modified');
  });

  it('getRecentChanges returns last N', () => {
    hr.watch('a', '/a', 'h1');
    hr.watch('b', '/b', 'h2');
    hr.reportChange('a', 'h3');
    hr.flush();
    hr.reportChange('b', 'h4');
    hr.flush();
    expect(hr.getRecentChanges(1).length).toBe(1);
  });

  it('clearHistory empties history', () => {
    hr.watch('a', '/a', 'h1');
    hr.reportChange('a', 'h2');
    hr.flush();
    hr.clearHistory();
    expect(hr.getChangeHistory().length).toBe(0);
  });

  // ---- Stats ----

  it('getStats returns correct counts', () => {
    hr.watch('a', '/a', 'h1');
    hr.subscribe('*', () => {});
    hr.reportChange('a', 'h2');
    hr.flush();
    const stats = hr.getStats();
    expect(stats.totalReloads).toBe(1);
    expect(stats.watchedPaths).toBe(1);
    expect(stats.activeSubscriptions).toBe(1);
  });

  // ---- Created change on unwatched ----

  it('reportChange with created works for unwatched asset', () => {
    const cb = vi.fn();
    hr.subscribe('*', cb);
    hr.reportChange('newAsset', 'h1', 'created');
    hr.flush();
    expect(cb).toHaveBeenCalled();
    expect(cb.mock.calls[0][0].changeType).toBe('created');
  });

  // ---- Delete removes from watched ----

  it('delete change type unwatches asset', () => {
    hr.watch('a', '/a', 'h1');
    hr.reportChange('a', '', 'deleted');
    hr.flush();
    expect(hr.isWatched('a')).toBe(false);
  });
});
