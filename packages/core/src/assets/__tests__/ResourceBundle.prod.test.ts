/**
 * ResourceBundle — Production Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ResourceBundle } from '../ResourceBundle';
import type { BundleConfig, BundleEntry } from '../ResourceBundle';

function makeConfig(id: string, maxSizeBytes = 10000, priority = 0, preload = false): BundleConfig {
  return { id, name: `Bundle ${id}`, priority, maxSizeBytes, preload };
}

function makeEntry(id: string, sizeBytes: number, loaded = false): BundleEntry {
  return { id, sizeBytes, type: 'texture', loaded };
}

describe('ResourceBundle — createBundle / removeBundle', () => {
  let rb: ResourceBundle;
  beforeEach(() => {
    rb = new ResourceBundle();
  });

  it('starts with 0 bundles', () => {
    expect(rb.getBundleCount()).toBe(0);
  });

  it('createBundle increments count', () => {
    rb.createBundle(makeConfig('a'));
    expect(rb.getBundleCount()).toBe(1);
  });

  it('multiple bundles tracked', () => {
    rb.createBundle(makeConfig('a'));
    rb.createBundle(makeConfig('b'));
    expect(rb.getBundleCount()).toBe(2);
  });

  it('removeBundle decrements count', () => {
    rb.createBundle(makeConfig('a'));
    rb.removeBundle('a');
    expect(rb.getBundleCount()).toBe(0);
  });

  it('removeBundle non-existent is a no-op', () => {
    rb.createBundle(makeConfig('a'));
    rb.removeBundle('ghost');
    expect(rb.getBundleCount()).toBe(1);
  });
});

describe('ResourceBundle — addEntry', () => {
  let rb: ResourceBundle;
  beforeEach(() => {
    rb = new ResourceBundle();
  });

  it('returns false for unknown bundle', () => {
    expect(rb.addEntry('ghost', makeEntry('e1', 100))).toBe(false);
  });

  it('returns true when entry fits', () => {
    rb.createBundle(makeConfig('a', 1000));
    expect(rb.addEntry('a', makeEntry('e1', 500))).toBe(true);
    expect(rb.getEntryCount('a')).toBe(1);
  });

  it('returns false when entry exceeds maxSizeBytes', () => {
    rb.createBundle(makeConfig('a', 100));
    expect(rb.addEntry('a', makeEntry('e1', 200))).toBe(false);
    expect(rb.getEntryCount('a')).toBe(0);
  });

  it('cumulatively tracks size — rejects when cumulative limit reached', () => {
    rb.createBundle(makeConfig('a', 300));
    rb.addEntry('a', makeEntry('e1', 200));
    expect(rb.addEntry('a', makeEntry('e2', 200))).toBe(false);
  });

  it('multiple entries fit within limit', () => {
    rb.createBundle(makeConfig('a', 1000));
    rb.addEntry('a', makeEntry('e1', 200));
    rb.addEntry('a', makeEntry('e2', 300));
    expect(rb.getEntryCount('a')).toBe(2);
  });
});

describe('ResourceBundle — getBundleSize / getLoadedCount / isFullyLoaded / getLoadProgress', () => {
  let rb: ResourceBundle;
  beforeEach(() => {
    rb = new ResourceBundle();
  });

  it('getBundleSize returns 0 for unknown bundle', () => {
    expect(rb.getBundleSize('ghost')).toBe(0);
  });

  it('getBundleSize sums sizeBytes', () => {
    rb.createBundle(makeConfig('a', 10000));
    rb.addEntry('a', makeEntry('e1', 100));
    rb.addEntry('a', makeEntry('e2', 200));
    expect(rb.getBundleSize('a')).toBe(300);
  });

  it('isFullyLoaded returns false before load', () => {
    rb.createBundle(makeConfig('a'));
    rb.addEntry('a', makeEntry('e1', 50));
    expect(rb.isFullyLoaded('a')).toBe(false);
  });

  it('getLoadProgress returns 0 for unknown bundle', () => {
    expect(rb.getLoadProgress('ghost')).toBe(0);
  });

  it('getLoadProgress returns 0 for empty bundle', () => {
    rb.createBundle(makeConfig('a'));
    expect(rb.getLoadProgress('a')).toBe(0);
  });
});

describe('ResourceBundle — loadBundle', () => {
  let rb: ResourceBundle;
  beforeEach(() => {
    rb = new ResourceBundle();
  });

  it('marks all unloaded entries as loaded', async () => {
    rb.createBundle(makeConfig('a', 100000));
    for (let i = 0; i < 5; i++) rb.addEntry('a', makeEntry(`e${i}`, 100));
    await rb.loadBundle('a');
    expect(rb.isFullyLoaded('a')).toBe(true);
    expect(rb.getLoadedCount('a')).toBe(5);
  });

  it('does not double-load already loaded entries', async () => {
    rb.createBundle(makeConfig('a', 100000));
    const entry = makeEntry('e1', 100, true);
    rb.addEntry('a', entry);
    await rb.loadBundle('a');
    // Still loaded — no error
    expect(rb.getLoadedCount('a')).toBe(1);
  });

  it('fires onStream callbacks per chunk', async () => {
    rb.createBundle(makeConfig('a', 100000));
    for (let i = 0; i < 9; i++) rb.addEntry('a', makeEntry(`e${i}`, 100));
    const calls: [number, number][] = [];
    rb.onStream((_id, chunkIndex, totalChunks) => calls.push([chunkIndex, totalChunks]));
    await rb.loadBundle('a', 3); // 9 entries / 3 = 3 chunks
    expect(calls.length).toBe(3);
    expect(calls[0]).toEqual([0, 3]);
    expect(calls[2]).toEqual([2, 3]);
  });

  it('is a no-op for unknown bundle', async () => {
    await expect(rb.loadBundle('ghost')).resolves.toBeUndefined();
  });

  it('progress is 1 after full load', async () => {
    rb.createBundle(makeConfig('a', 100000));
    rb.addEntry('a', makeEntry('e1', 100));
    rb.addEntry('a', makeEntry('e2', 100));
    await rb.loadBundle('a');
    expect(rb.getLoadProgress('a')).toBe(1);
  });
});

describe('ResourceBundle — preloadAll', () => {
  let rb: ResourceBundle;
  beforeEach(() => {
    rb = new ResourceBundle();
  });

  it('returns [] when no preloadable bundles', async () => {
    rb.createBundle(makeConfig('a', 1000, 0, false));
    const ids = await rb.preloadAll();
    expect(ids).toEqual([]);
  });

  it('returns IDs of preloaded bundles only', async () => {
    rb.createBundle(makeConfig('a', 1000, 0, true));
    rb.createBundle(makeConfig('b', 1000, 0, false));
    const ids = await rb.preloadAll();
    expect(ids).toContain('a');
    expect(ids).not.toContain('b');
  });

  it('preloads in priority order (higher priority first)', async () => {
    rb.createBundle(makeConfig('low', 1000, 1, true));
    rb.createBundle(makeConfig('high', 1000, 10, true));
    // Add at least one entry so loadBundle actually fires stream callbacks
    rb.addEntry('low', makeEntry('e_low', 100));
    rb.addEntry('high', makeEntry('e_high', 100));
    const loaded: string[] = [];
    rb.onStream((id) => loaded.push(id));
    await rb.preloadAll();
    // 'high' priority (10) loads before 'low' (1)
    const highIdx = loaded.indexOf('high');
    const lowIdx = loaded.indexOf('low');
    expect(highIdx).toBeGreaterThanOrEqual(0);
    expect(lowIdx).toBeGreaterThanOrEqual(0);
    expect(highIdx).toBeLessThan(lowIdx);
  });
});
