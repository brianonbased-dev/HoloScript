/**
 * AssetHotReload — Production Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { AssetHotReload } from '../AssetHotReload';

describe('AssetHotReload — enabled / debounce config', () => {
  it('starts enabled', () => {
    expect(new AssetHotReload().isEnabled()).toBe(true);
  });

  it('setEnabled(false) disables', () => {
    const hr = new AssetHotReload();
    hr.setEnabled(false);
    expect(hr.isEnabled()).toBe(false);
  });

  it('setEnabled(true) re-enables', () => {
    const hr = new AssetHotReload();
    hr.setEnabled(false);
    hr.setEnabled(true);
    expect(hr.isEnabled()).toBe(true);
  });
});

describe('AssetHotReload — watch / unwatch / isWatched', () => {
  let hr: AssetHotReload;
  beforeEach(() => { hr = new AssetHotReload(); });

  it('isWatched returns false before watch', () => {
    expect(hr.isWatched('asset1')).toBe(false);
  });

  it('isWatched returns true after watch', () => {
    hr.watch('asset1', '/path/a.glb', 'hash1');
    expect(hr.isWatched('asset1')).toBe(true);
  });

  it('unwatch removes asset', () => {
    hr.watch('asset1', '/path/a.glb', 'hash1');
    hr.unwatch('asset1');
    expect(hr.isWatched('asset1')).toBe(false);
  });

  it('unwatch non-existent is no-op', () => {
    expect(() => hr.unwatch('ghost')).not.toThrow();
  });
});

describe('AssetHotReload — subscribe / unsubscribe', () => {
  let hr: AssetHotReload;
  beforeEach(() => { hr = new AssetHotReload(); });

  it('subscribe returns a subscription id string', () => {
    const id = hr.subscribe('*', () => {});
    expect(typeof id).toBe('string');
    expect(id.startsWith('hotreload_sub_')).toBe(true);
  });

  it('each subscribe returns unique id', () => {
    const id1 = hr.subscribe('*', () => {});
    const id2 = hr.subscribe('*', () => {});
    expect(id1).not.toBe(id2);
  });

  it('getStats.activeSubscriptions counts subscriptions', () => {
    hr.subscribe('*', () => {});
    hr.subscribe('*', () => {});
    expect(hr.getStats().activeSubscriptions).toBe(2);
  });

  it('unsubscribe decrements active count', () => {
    const id = hr.subscribe('*', () => {});
    hr.unsubscribe(id);
    expect(hr.getStats().activeSubscriptions).toBe(0);
  });
});

describe('AssetHotReload — reportChange + flush', () => {
  let hr: AssetHotReload;
  beforeEach(() => {
    hr = new AssetHotReload();
    vi.useFakeTimers();
  });
  afterEach(() => { vi.useRealTimers(); });

  it('notifies wildcard subscriber on flush', () => {
    hr.watch('a1', '/path/a.glb', 'h1');
    const received: string[] = [];
    hr.subscribe('*', c => received.push(c.assetId));
    hr.reportChange('a1', 'h2');
    hr.flush();
    expect(received).toContain('a1');
  });

  it('change includes correct changeType', () => {
    hr.watch('a1', '/path/a.glb', 'h1');
    let type = '';
    hr.subscribe('*', c => { type = c.changeType; });
    hr.reportChange('a1', 'h2', 'modified');
    hr.flush();
    expect(type).toBe('modified');
  });

  it('change includes previousHash', () => {
    hr.watch('a1', '/path/a.glb', 'old-hash');
    let prev = '';
    hr.subscribe('*', c => { prev = c.previousHash ?? ''; });
    hr.reportChange('a1', 'new-hash');
    hr.flush();
    expect(prev).toBe('old-hash');
  });

  it('change includes newHash', () => {
    hr.watch('a1', '/path/a.glb', 'h1');
    let newH = '';
    hr.subscribe('*', c => { newH = c.newHash ?? ''; });
    hr.reportChange('a1', 'h2');
    hr.flush();
    expect(newH).toBe('h2');
  });

  it('totalReloads increments after flush', () => {
    hr.watch('a1', '/path/a.glb', 'h1');
    hr.reportChange('a1', 'h2');
    hr.flush();
    expect(hr.getStats().totalReloads).toBe(1);
  });

  it('does not notify when disabled', () => {
    hr.setEnabled(false);
    hr.watch('a1', '/path/a.glb', 'h1');
    const called: boolean[] = [];
    hr.subscribe('*', () => called.push(true));
    hr.reportChange('a1', 'h2');
    hr.flush();
    expect(called).toHaveLength(0);
  });

  it('skips unknown asset for modified type', () => {
    const called: boolean[] = [];
    hr.subscribe('*', () => called.push(true));
    hr.reportChange('unknown', 'h2', 'modified');
    hr.flush();
    expect(called).toHaveLength(0);
  });

  it('created change fires even for unwatched asset', () => {
    const called: string[] = [];
    hr.subscribe('*', c => called.push(c.assetId));
    hr.reportChange('brand-new', 'h1', 'created');
    hr.flush();
    expect(called).toContain('brand-new');
  });

  it('deleted change removes from watchedAssets', () => {
    hr.watch('a1', '/path/a.glb', 'h1');
    hr.reportChange('a1', 'h_del', 'deleted');
    hr.flush();
    expect(hr.isWatched('a1')).toBe(false);
  });

  it('multiple changes in one debounce window deduplicate per assetId', () => {
    hr.watch('a1', '/path/a.glb', 'h1');
    const received: string[] = [];
    hr.subscribe('*', c => received.push(c.newHash!));
    hr.reportChange('a1', 'h2');
    hr.reportChange('a1', 'h3'); // second debounced — overwrites first
    hr.flush();
    // Only last state emitted for same assetId
    expect(received).toHaveLength(1);
    expect(received[0]).toBe('h3');
  });
});

describe('AssetHotReload — pattern matching', () => {
  let hr: AssetHotReload;
  beforeEach(() => {
    hr = new AssetHotReload();
    vi.useFakeTimers();
  });
  afterEach(() => { vi.useRealTimers(); });

  it('* pattern matches all assets', () => {
    hr.watch('img.png', '/images/img.png', 'h1');
    const hits: string[] = [];
    hr.subscribe('*', c => hits.push(c.assetId));
    hr.reportChange('img.png', 'h2');
    hr.flush();
    expect(hits).toContain('img.png');
  });

  it('exact pattern matches exact id', () => {
    hr.watch('my-asset', '/path', 'h1');
    const hits: string[] = [];
    hr.subscribe('my-asset', c => hits.push(c.assetId));
    hr.reportChange('my-asset', 'h2');
    hr.flush();
    expect(hits).toContain('my-asset');
  });

  it('exact pattern does not match other ids', () => {
    hr.watch('other', '/path', 'h1');
    const hits: string[] = [];
    hr.subscribe('exact-one', c => hits.push(c.assetId));
    hr.reportChange('other', 'h2');
    hr.flush();
    expect(hits).toHaveLength(0);
  });

  it('*.png pattern matches .png paths', () => {
    hr.watch('logo', '/assets/logo.png', 'h1');
    const hits: string[] = [];
    hr.subscribe('*.png', c => hits.push(c.assetId));
    hr.reportChange('logo', 'h2');
    hr.flush();
    expect(hits).toContain('logo');
  });

  it('prefix/** pattern matches child paths', () => {
    hr.watch('models/hero', '/models/hero.glb', 'h1');
    const hits: string[] = [];
    hr.subscribe('/models/**', c => hits.push(c.assetId));
    hr.reportChange('models/hero', 'h2');
    hr.flush();
    expect(hits).toContain('models/hero');
  });
});

describe('AssetHotReload — history', () => {
  let hr: AssetHotReload;
  beforeEach(() => {
    hr = new AssetHotReload();
    vi.useFakeTimers();
  });
  afterEach(() => { vi.useRealTimers(); });

  it('getChangeHistory returns copy of history', () => {
    hr.watch('a', '/a', 'h1');
    hr.reportChange('a', 'h2');
    hr.flush();
    const h = hr.getChangeHistory();
    expect(h).toHaveLength(1);
    // Mutation safety
    h.push({ assetId: 'injected', path: '', changeType: 'modified', timestamp: 0 });
    expect(hr.getChangeHistory()).toHaveLength(1);
  });

  it('getRecentChanges returns last N', () => {
    hr.watch('a', '/a', 'h1');
    hr.reportChange('a', 'h2');
    hr.flush();
    hr.watch('b', '/b', 'h1');
    hr.reportChange('b', 'h2');
    hr.flush();
    expect(hr.getRecentChanges(1)).toHaveLength(1);
    expect(hr.getRecentChanges(2)).toHaveLength(2);
  });

  it('clearHistory empties history', () => {
    hr.watch('a', '/a', 'h1');
    hr.reportChange('a', 'h2');
    hr.flush();
    hr.clearHistory();
    expect(hr.getChangeHistory()).toHaveLength(0);
  });
});
