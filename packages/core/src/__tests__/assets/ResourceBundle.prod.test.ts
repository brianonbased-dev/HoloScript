/**
 * ResourceBundle Production Tests
 *
 * Covers: createBundle/removeBundle, addEntry (respects maxSizeBytes, returns bool),
 * loadBundle (marks entries loaded, fires streamCallbacks with chunk progress),
 * onStream, preloadAll (only preload=true bundles, sorted by priority desc),
 * getBundleSize, getLoadedCount, getEntryCount, getBundleCount,
 * isFullyLoaded, getLoadProgress.
 */

import { describe, it, expect, vi } from 'vitest';
import { ResourceBundle } from '../../assets/ResourceBundle';
import type { BundleConfig, BundleEntry } from '../../assets/ResourceBundle';

// ── helpers ───────────────────────────────────────────────────────────────────

function mkConfig(id: string, maxSizeBytes = 10_000, preload = false, priority = 0): BundleConfig {
  return { id, name: id, priority, maxSizeBytes, preload };
}

function mkEntry(id: string, sizeBytes = 100): BundleEntry {
  return { id, sizeBytes, type: 'texture', loaded: false };
}

// ── createBundle / removeBundle ────────────────────────────────────────────────

describe('ResourceBundle — createBundle / removeBundle', () => {

  it('createBundle makes bundle available', () => {
    const rb = new ResourceBundle();
    rb.createBundle(mkConfig('b1'));
    expect(rb.getBundleCount()).toBe(1);
  });

  it('removeBundle deletes the bundle', () => {
    const rb = new ResourceBundle();
    rb.createBundle(mkConfig('b1'));
    rb.removeBundle('b1');
    expect(rb.getBundleCount()).toBe(0);
  });

  it('getBundleCount reflects multiple bundles', () => {
    const rb = new ResourceBundle();
    rb.createBundle(mkConfig('a'));
    rb.createBundle(mkConfig('b'));
    expect(rb.getBundleCount()).toBe(2);
  });
});

// ── addEntry ──────────────────────────────────────────────────────────────────

describe('ResourceBundle — addEntry', () => {

  it('addEntry returns true and increments entryCount', () => {
    const rb = new ResourceBundle();
    rb.createBundle(mkConfig('b1', 500));
    expect(rb.addEntry('b1', mkEntry('e1', 100))).toBe(true);
    expect(rb.getEntryCount('b1')).toBe(1);
  });

  it('addEntry returns false when bundle does not exist', () => {
    const rb = new ResourceBundle();
    expect(rb.addEntry('ghost', mkEntry('e1', 100))).toBe(false);
  });

  it('addEntry returns false when entry exceeds maxSizeBytes', () => {
    const rb = new ResourceBundle();
    rb.createBundle(mkConfig('b1', 50));
    expect(rb.addEntry('b1', mkEntry('big', 100))).toBe(false);
    expect(rb.getEntryCount('b1')).toBe(0);
  });

  it('addEntry respects cumulative size limit', () => {
    const rb = new ResourceBundle();
    rb.createBundle(mkConfig('b1', 150));
    rb.addEntry('b1', mkEntry('e1', 100));
    // 100 + 60 = 160 > 150 → rejected
    expect(rb.addEntry('b1', mkEntry('e2', 60))).toBe(false);
    expect(rb.getEntryCount('b1')).toBe(1);
  });
});

// ── loadBundle ────────────────────────────────────────────────────────────────

describe('ResourceBundle — loadBundle', () => {

  it('loadBundle marks all entries as loaded', async () => {
    const rb = new ResourceBundle();
    rb.createBundle(mkConfig('b1'));
    rb.addEntry('b1', mkEntry('e1'));
    rb.addEntry('b1', mkEntry('e2'));
    await rb.loadBundle('b1');
    expect(rb.getLoadedCount('b1')).toBe(2);
    expect(rb.isFullyLoaded('b1')).toBe(true);
  });

  it('loadBundle fires streamCallbacks with chunk progress', async () => {
    const rb = new ResourceBundle();
    rb.createBundle(mkConfig('b1'));
    for (let i = 0; i < 6; i++) rb.addEntry('b1', mkEntry(`e${i}`));
    const calls: [number, number][] = [];
    rb.onStream((_id, chunk, total) => calls.push([chunk, total]));
    await rb.loadBundle('b1', 3); // 6 entries / 3 per chunk = 2 chunks
    expect(calls).toHaveLength(2);
    expect(calls[0][1]).toBe(2); // totalChunks = 2
  });

  it('loadBundle on unknown bundle does not throw', async () => {
    await expect(new ResourceBundle().loadBundle('ghost')).resolves.toBeUndefined();
  });

  it('already-loaded entries are not re-loaded', async () => {
    const rb = new ResourceBundle();
    rb.createBundle(mkConfig('b1'));
    const entry = mkEntry('e1');
    entry.loaded = true;
    rb.addEntry('b1', entry);
    const cbSpy = vi.fn();
    rb.onStream(cbSpy);
    await rb.loadBundle('b1');
    // 0 unloaded entries → 0 chunks → no cb calls
    expect(cbSpy).not.toHaveBeenCalled();
  });
});

// ── getLoadProgress ───────────────────────────────────────────────────────────

describe('ResourceBundle — getLoadProgress', () => {

  it('returns 0 for empty bundle', async () => {
    const rb = new ResourceBundle();
    rb.createBundle(mkConfig('b1'));
    expect(rb.getLoadProgress('b1')).toBe(0);
  });

  it('returns 0 for unknown bundle', () => {
    expect(new ResourceBundle().getLoadProgress('ghost')).toBe(0);
  });

  it('returns 0.5 when half entries loaded', async () => {
    const rb = new ResourceBundle();
    rb.createBundle(mkConfig('b1'));
    rb.addEntry('b1', { ...mkEntry('a'), loaded: true });
    rb.addEntry('b1', mkEntry('b'));
    expect(rb.getLoadProgress('b1')).toBeCloseTo(0.5, 5);
  });

  it('returns 1 when all loaded', async () => {
    const rb = new ResourceBundle();
    rb.createBundle(mkConfig('b1'));
    rb.addEntry('b1', { ...mkEntry('a'), loaded: true });
    await rb.loadBundle('b1'); // already loaded, progress stays at 1
    expect(rb.getLoadProgress('b1')).toBe(1);
  });
});

// ── getBundleSize ──────────────────────────────────────────────────────────────

describe('ResourceBundle — getBundleSize', () => {

  it('returns 0 for empty bundle', () => {
    const rb = new ResourceBundle();
    rb.createBundle(mkConfig('b1'));
    expect(rb.getBundleSize('b1')).toBe(0);
  });

  it('returns 0 for unknown bundle', () => {
    expect(new ResourceBundle().getBundleSize('ghost')).toBe(0);
  });

  it('returns sum of entry sizes', () => {
    const rb = new ResourceBundle();
    rb.createBundle(mkConfig('b1', 1_000_000));
    rb.addEntry('b1', mkEntry('a', 300));
    rb.addEntry('b1', mkEntry('b', 500));
    expect(rb.getBundleSize('b1')).toBe(800);
  });
});

// ── preloadAll ────────────────────────────────────────────────────────────────

describe('ResourceBundle — preloadAll', () => {

  it('preloadAll returns ids of preloaded bundles', async () => {
    const rb = new ResourceBundle();
    rb.createBundle(mkConfig('p1', 10_000, true, 5));
    rb.createBundle(mkConfig('p2', 10_000, true, 3));
    rb.createBundle(mkConfig('skip', 10_000, false));
    const loaded = await rb.preloadAll();
    expect(loaded).toContain('p1');
    expect(loaded).toContain('p2');
    expect(loaded).not.toContain('skip');
  });

  it('preloadAll does not load non-preload bundles', async () => {
    const rb = new ResourceBundle();
    rb.createBundle(mkConfig('nope', 10_000, false));
    rb.addEntry('nope', mkEntry('e1'));
    await rb.preloadAll();
    expect(rb.getLoadedCount('nope')).toBe(0);
  });
});
