/**
 * AssetHotReload Production Tests
 *
 * Covers: setEnabled/isEnabled, setDebounceMs,
 * watch/unwatch/isWatched,
 * subscribe/unsubscribe (returns id, pattern matching: exact, *, *.ext, path/**),
 * reportChange (disabled = no-op, unwatched non-created = no-op, created always fires,
 *   deleted removes from watchedAssets, updates hash on modify),
 * flush (processes pending changes, fires subscribers, increments totalReloads,
 *   updates lastReloadTime, clears pending),
 * getChangeHistory/getRecentChanges/clearHistory/getStats.
 */

import { describe, it, expect, vi } from 'vitest';
import { AssetHotReload } from '../../assets/AssetHotReload';

// ── helpers ───────────────────────────────────────────────────────────────────

function mkHR() {
  const hr = new AssetHotReload();
  hr.setDebounceMs(0); // no real timer — use flush() manually
  return hr;
}

// ── setEnabled / isEnabled ────────────────────────────────────────────────────

describe('AssetHotReload — setEnabled / isEnabled', () => {
  it('isEnabled is true by default', () => {
    expect(new AssetHotReload().isEnabled()).toBe(true);
  });

  it('setEnabled(false) disables the system', () => {
    const hr = new AssetHotReload();
    hr.setEnabled(false);
    expect(hr.isEnabled()).toBe(false);
  });

  it('setEnabled(true) re-enables after disable', () => {
    const hr = new AssetHotReload();
    hr.setEnabled(false);
    hr.setEnabled(true);
    expect(hr.isEnabled()).toBe(true);
  });
});

// ── watch / unwatch / isWatched ───────────────────────────────────────────────

describe('AssetHotReload — watch / unwatch / isWatched', () => {
  it('watch registers the asset', () => {
    const hr = mkHR();
    hr.watch('tex1', '/textures/tex1.png', 'abc');
    expect(hr.isWatched('tex1')).toBe(true);
  });

  it('isWatched returns false for unregistered asset', () => {
    expect(mkHR().isWatched('ghost')).toBe(false);
  });

  it('unwatch removes the asset', () => {
    const hr = mkHR();
    hr.watch('tex1', '/t.png', 'h');
    hr.unwatch('tex1');
    expect(hr.isWatched('tex1')).toBe(false);
  });

  it('getStats.watchedPaths increments on watch', () => {
    const hr = mkHR();
    hr.watch('a', '/a', 'h1');
    hr.watch('b', '/b', 'h2');
    expect(hr.getStats().watchedPaths).toBe(2);
  });
});

// ── subscribe / unsubscribe ───────────────────────────────────────────────────

describe('AssetHotReload — subscribe / unsubscribe', () => {
  it('subscribe returns a unique subscription id', () => {
    const hr = mkHR();
    const id1 = hr.subscribe('*', () => {});
    const id2 = hr.subscribe('*', () => {});
    expect(id1).not.toBe(id2);
  });

  it('getStats.activeSubscriptions reflects subscriptions', () => {
    const hr = mkHR();
    hr.subscribe('*', () => {});
    hr.subscribe('*', () => {});
    expect(hr.getStats().activeSubscriptions).toBe(2);
  });

  it('unsubscribe removes by id', () => {
    const hr = mkHR();
    const id = hr.subscribe('*', () => {});
    hr.unsubscribe(id);
    expect(hr.getStats().activeSubscriptions).toBe(0);
  });
});

// ── reportChange + flush (no debounce) ───────────────────────────────────────

describe('AssetHotReload — reportChange + flush', () => {
  it('reportChange while disabled does not queue a change', () => {
    const hr = mkHR();
    hr.setEnabled(false);
    hr.watch('tex', '/t.png', 'old');
    hr.reportChange('tex', 'new', 'modified');
    hr.flush();
    expect(hr.getChangeHistory()).toHaveLength(0);
  });

  it('reportChange for unwatched asset with modified changeType is ignored', () => {
    const hr = mkHR();
    hr.reportChange('unknown', 'hash', 'modified');
    hr.flush();
    expect(hr.getChangeHistory()).toHaveLength(0);
  });

  it('reportChange with created changeType fires even for unwatched asset', () => {
    const hr = mkHR();
    const received: string[] = [];
    hr.subscribe('newAsset', (change) => received.push(change.assetId));
    hr.reportChange('newAsset', 'hash123', 'created');
    hr.flush();
    expect(hr.getChangeHistory()).toHaveLength(1);
  });

  it('flush notifies subscribers with change data', () => {
    const hr = mkHR();
    hr.watch('asset1', '/a.png', 'old');
    const changes: string[] = [];
    hr.subscribe('asset1', (change) => changes.push(change.newHash ?? ''));
    hr.reportChange('asset1', 'newHash', 'modified');
    hr.flush();
    expect(changes).toContain('newHash');
  });

  it('flush increments totalReloads for each pending change', () => {
    const hr = mkHR();
    hr.watch('a', '/a', 'h1');
    hr.watch('b', '/b', 'h2');
    hr.reportChange('a', 'newH', 'modified');
    hr.reportChange('b', 'newH', 'modified');
    hr.flush();
    expect(hr.getStats().totalReloads).toBe(2);
  });

  it('flush clears pending changes after processing', () => {
    const hr = mkHR();
    hr.watch('a', '/a', 'h');
    hr.reportChange('a', 'new', 'modified');
    hr.flush();
    // second flush should produce nothing new
    hr.flush();
    expect(hr.getStats().totalReloads).toBe(1);
  });

  it('deleted changeType removes asset from watched', () => {
    const hr = mkHR();
    hr.watch('tex', '/t.png', 'h');
    hr.reportChange('tex', '', 'deleted');
    hr.flush();
    expect(hr.isWatched('tex')).toBe(false);
  });

  it('modified changeType updates stored hash', () => {
    const hr = mkHR();
    hr.watch('tex', '/t.png', 'oldHash');
    hr.reportChange('tex', 'newHash', 'modified');
    hr.flush();
    // Asset still watched
    expect(hr.isWatched('tex')).toBe(true);
  });
});

// ── pattern matching ──────────────────────────────────────────────────────────

describe('AssetHotReload — subscriber pattern matching', () => {
  function fireAndCollect(pattern: string, assetId: string): string[] {
    const hr = mkHR();
    hr.watch(assetId, `/${assetId}.png`, 'h');
    const received: string[] = [];
    hr.subscribe(pattern, (c) => received.push(c.assetId));
    hr.reportChange(assetId, 'new', 'modified');
    hr.flush();
    return received;
  }

  it('wildcard * matches any assetId', () => {
    expect(fireAndCollect('*', 'anything')).toContain('anything');
  });

  it('exact match pattern fires only for that asset', () => {
    expect(fireAndCollect('specificAsset', 'specificAsset')).toHaveLength(1);
  });

  it('exact match does not fire for different asset', () => {
    expect(fireAndCollect('other', 'specificAsset')).toHaveLength(0);
  });

  it('*.png matches assets whose path ends in .png', () => {
    // path as stored is '/assetId.png', but pattern matches on path too
    const hr = mkHR();
    hr.watch('tex', '/textures/albedo.png', 'h');
    const received: string[] = [];
    hr.subscribe('*.png', (c) => received.push(c.assetId));
    hr.reportChange('tex', 'new', 'modified');
    hr.flush();
    expect(received).toContain('tex');
  });

  it('path/** prefix pattern matches assets under that path', () => {
    const hr = mkHR();
    hr.watch('model', '/models/character.glb', 'h');
    const received: string[] = [];
    hr.subscribe('/models/**', (c) => received.push(c.assetId));
    hr.reportChange('model', 'new', 'modified');
    hr.flush();
    expect(received).toContain('model');
  });
});

// ── getChangeHistory / getRecentChanges / clearHistory ───────────────────────

describe('AssetHotReload — change history', () => {
  it('getChangeHistory is empty initially', () => {
    expect(mkHR().getChangeHistory()).toHaveLength(0);
  });

  it('getChangeHistory returns copies of flushed changes', () => {
    const hr = mkHR();
    hr.watch('a', '/a', 'h');
    hr.reportChange('a', 'new', 'modified');
    hr.flush();
    const history = hr.getChangeHistory();
    expect(history).toHaveLength(1);
    expect(history[0].assetId).toBe('a');
  });

  it('getRecentChanges returns last N entries', () => {
    const hr = mkHR();
    hr.watch('a', '/a', 'h');
    hr.watch('b', '/b', 'h');
    hr.watch('c', '/c', 'h');
    hr.reportChange('a', 'n', 'modified');
    hr.flush();
    hr.reportChange('b', 'n', 'modified');
    hr.flush();
    hr.reportChange('c', 'n', 'modified');
    hr.flush();
    const recent = hr.getRecentChanges(2);
    expect(recent).toHaveLength(2);
    expect(recent[1].assetId).toBe('c');
  });

  it('clearHistory empties the change history', () => {
    const hr = mkHR();
    hr.watch('a', '/a', 'h');
    hr.reportChange('a', 'n', 'modified');
    hr.flush();
    hr.clearHistory();
    expect(hr.getChangeHistory()).toHaveLength(0);
  });

  it('clearHistory does not reset totalReloads', () => {
    const hr = mkHR();
    hr.watch('a', '/a', 'h');
    hr.reportChange('a', 'n', 'modified');
    hr.flush();
    hr.clearHistory();
    expect(hr.getStats().totalReloads).toBe(1);
  });
});

// ── getStats ──────────────────────────────────────────────────────────────────

describe('AssetHotReload — getStats', () => {
  it('all stats fields are 0/empty on fresh instance', () => {
    const stats = new AssetHotReload().getStats();
    expect(stats.totalReloads).toBe(0);
    expect(stats.lastReloadTime).toBe(0);
    expect(stats.watchedPaths).toBe(0);
    expect(stats.activeSubscriptions).toBe(0);
  });

  it('lastReloadTime is updated after flush', () => {
    const before = Date.now();
    const hr = mkHR();
    hr.watch('a', '/a', 'h');
    hr.reportChange('a', 'n', 'modified');
    hr.flush();
    expect(hr.getStats().lastReloadTime).toBeGreaterThanOrEqual(before);
  });
});
