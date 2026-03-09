/**
 * AssetBundler — Production Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AssetBundler } from '../AssetBundler';
import type { AssetEntry, BundleConfig } from '../AssetBundler';

function makeAsset(
  id: string,
  sizeBytes = 1000,
  deps: string[] = [],
  hash = `h_${id}`
): AssetEntry {
  return { id, type: 'texture', path: `assets/${id}`, sizeBytes, hash, dependencies: deps };
}

function makeConfig(id: string, entries: string[], opts: Partial<BundleConfig> = {}): BundleConfig {
  return { id, name: `Bundle ${id}`, entries, compress: false, priority: 0, ...opts };
}

describe('AssetBundler — registerAsset / getAsset / unregisterAsset', () => {
  let ab: AssetBundler;
  beforeEach(() => {
    ab = new AssetBundler();
  });

  it('starts with 0 assets', () => {
    expect(ab.getAssetCount()).toBe(0);
  });

  it('registerAsset and getAsset round-trip', () => {
    ab.registerAsset(makeAsset('a'));
    expect(ab.getAsset('a')).toBeDefined();
    expect(ab.getAsset('a')!.id).toBe('a');
  });

  it('unregisterAsset removes asset', () => {
    ab.registerAsset(makeAsset('a'));
    ab.unregisterAsset('a');
    expect(ab.getAsset('a')).toBeUndefined();
    expect(ab.getAssetCount()).toBe(0);
  });

  it('getAsset returns undefined for unknown id', () => {
    expect(ab.getAsset('ghost')).toBeUndefined();
  });

  it('multiple assets tracked by count', () => {
    ab.registerAsset(makeAsset('a'));
    ab.registerAsset(makeAsset('b'));
    expect(ab.getAssetCount()).toBe(2);
  });
});

describe('AssetBundler — buildBundle', () => {
  let ab: AssetBundler;
  beforeEach(() => {
    ab = new AssetBundler();
  });

  it('returns a Bundle with correct id and name', () => {
    ab.registerAsset(makeAsset('a'));
    const b = ab.buildBundle(makeConfig('b1', ['a']));
    expect(b.id).toBe('b1');
    expect(b.name).toBe('Bundle b1');
  });

  it('bundle includes all specified assets', () => {
    ab.registerAsset(makeAsset('a', 100));
    ab.registerAsset(makeAsset('b', 200));
    const b = ab.buildBundle(makeConfig('b1', ['a', 'b']));
    expect(b.assets.map((a) => a.id)).toContain('a');
    expect(b.assets.map((a) => a.id)).toContain('b');
  });

  it('totalSizeBytes sums asset sizes', () => {
    ab.registerAsset(makeAsset('a', 100));
    ab.registerAsset(makeAsset('b', 200));
    const b = ab.buildBundle(makeConfig('b1', ['a', 'b']));
    expect(b.totalSizeBytes).toBe(300);
  });

  it('compressedSizeBytes equals totalSizeBytes when compress=false', () => {
    ab.registerAsset(makeAsset('a', 1000));
    const b = ab.buildBundle(makeConfig('b1', ['a'], { compress: false }));
    expect(b.compressedSizeBytes).toBe(b.totalSizeBytes);
  });

  it('compressedSizeBytes is 60% of totalSizeBytes when compress=true', () => {
    ab.registerAsset(makeAsset('a', 1000));
    const b = ab.buildBundle(makeConfig('b1', ['a'], { compress: true }));
    expect(b.compressedSizeBytes).toBe(600);
  });

  it('resolves transitive dependencies', () => {
    ab.registerAsset(makeAsset('dep', 100));
    ab.registerAsset(makeAsset('main', 200, ['dep']));
    const b = ab.buildBundle(makeConfig('b1', ['main']));
    const ids = b.assets.map((a) => a.id);
    expect(ids).toContain('dep');
    expect(ids).toContain('main');
    // dep comes before main (resolved first)
    expect(ids.indexOf('dep')).toBeLessThan(ids.indexOf('main'));
  });

  it('deduplicates shared dependencies', () => {
    ab.registerAsset(makeAsset('shared', 50));
    ab.registerAsset(makeAsset('x', 100, ['shared']));
    ab.registerAsset(makeAsset('y', 100, ['shared']));
    const b = ab.buildBundle(makeConfig('b1', ['x', 'y']));
    // 'shared' should appear only once
    const ids = b.assets.filter((a) => a.id === 'shared');
    expect(ids).toHaveLength(1);
  });

  it('ignores unregistered asset ids in entries', () => {
    const b = ab.buildBundle(makeConfig('b1', ['missing']));
    expect(b.assets).toHaveLength(0);
  });

  it('version increments with each buildBundle call', () => {
    ab.registerAsset(makeAsset('a'));
    const b1 = ab.buildBundle(makeConfig('b1', ['a']));
    const b2 = ab.buildBundle(makeConfig('b2', ['a']));
    expect(b2.version).toBeGreaterThan(b1.version);
  });

  it('hash is a non-empty string starting with bundle_', () => {
    ab.registerAsset(makeAsset('a'));
    const b = ab.buildBundle(makeConfig('b1', ['a']));
    expect(typeof b.hash).toBe('string');
    expect(b.hash.startsWith('bundle_')).toBe(true);
  });
});

describe('AssetBundler — splitBundle', () => {
  let ab: AssetBundler;
  beforeEach(() => {
    ab = new AssetBundler();
  });

  it('returns single bundle when under maxSizeBytes', () => {
    ab.registerAsset(makeAsset('a', 100));
    ab.registerAsset(makeAsset('b', 100));
    const parts = ab.splitBundle(makeConfig('b1', ['a', 'b'], { maxSizeBytes: 1000 }));
    expect(parts).toHaveLength(1);
  });

  it('splits into multiple parts when over maxSizeBytes', () => {
    ab.registerAsset(makeAsset('a', 600));
    ab.registerAsset(makeAsset('b', 600));
    ab.registerAsset(makeAsset('c', 600));
    const parts = ab.splitBundle(makeConfig('b1', ['a', 'b', 'c'], { maxSizeBytes: 700 }));
    expect(parts.length).toBeGreaterThan(1);
  });

  it('split part ids use _part suffix', () => {
    ab.registerAsset(makeAsset('a', 600));
    ab.registerAsset(makeAsset('b', 600));
    const parts = ab.splitBundle(makeConfig('b1', ['a', 'b'], { maxSizeBytes: 700 }));
    expect(parts.every((p) => p.id.startsWith('b1_part'))).toBe(true);
  });

  it('all assets appear across all parts', () => {
    ab.registerAsset(makeAsset('a', 600));
    ab.registerAsset(makeAsset('b', 600));
    ab.registerAsset(makeAsset('c', 600));
    const parts = ab.splitBundle(makeConfig('b1', ['a', 'b', 'c'], { maxSizeBytes: 700 }));
    const allIds = parts.flatMap((p) => p.assets.map((a) => a.id));
    expect(allIds).toContain('a');
    expect(allIds).toContain('b');
    expect(allIds).toContain('c');
  });
});

describe('AssetBundler — generateManifest', () => {
  let ab: AssetBundler;
  beforeEach(() => {
    ab = new AssetBundler();
  });

  it('returns manifest with buildTimestamp close to now', () => {
    const before = Date.now();
    const m = ab.generateManifest();
    expect(m.buildTimestamp).toBeGreaterThanOrEqual(before);
  });

  it('bundles sorted by priority (lower first)', () => {
    ab.registerAsset(makeAsset('a'));
    ab.buildBundle(makeConfig('high', ['a'], { priority: 10 }));
    ab.buildBundle(makeConfig('low', ['a'], { priority: 1 }));
    const m = ab.generateManifest();
    expect(m.bundles[0].id).toBe('low');
    expect(m.bundles[1].id).toBe('high');
  });

  it('totalAssets counts unique assets across bundles', () => {
    ab.registerAsset(makeAsset('a'));
    ab.registerAsset(makeAsset('b'));
    ab.buildBundle(makeConfig('b1', ['a', 'b']));
    const m = ab.generateManifest();
    expect(m.totalAssets).toBe(2);
  });
});

describe('AssetBundler — computeDiff', () => {
  let ab: AssetBundler;
  beforeEach(() => {
    ab = new AssetBundler();
  });

  it('added contains new bundle ids', () => {
    const prev = ab.generateManifest(); // empty
    ab.registerAsset(makeAsset('a'));
    ab.buildBundle(makeConfig('new', ['a']));
    const diff = ab.computeDiff(prev);
    expect(diff.added).toContain('new');
    expect(diff.removed).toHaveLength(0);
  });

  it('removed contains bundles present in previous but not current', () => {
    ab.registerAsset(makeAsset('a'));
    ab.buildBundle(makeConfig('gone', ['a']));
    const prev = ab.generateManifest();
    // Remove the bundle by creating a new AssetBundler (simulated)
    const fresh = new AssetBundler();
    const diff = fresh.computeDiff(prev);
    expect(diff.removed).toContain('gone');
  });

  it('empty diff when manifests identical', () => {
    ab.registerAsset(makeAsset('a'));
    ab.buildBundle(makeConfig('b1', ['a']));
    const prev = ab.generateManifest();
    const diff = ab.computeDiff(prev);
    expect(diff.added).toHaveLength(0);
    expect(diff.removed).toHaveLength(0);
    expect(diff.changed).toHaveLength(0);
  });
});

describe('AssetBundler — getDependencyChain', () => {
  let ab: AssetBundler;
  beforeEach(() => {
    ab = new AssetBundler();
  });

  it('returns [] for unknown asset', () => {
    expect(ab.getDependencyChain('ghost')).toEqual([]);
  });

  it('returns [self] for asset with no deps', () => {
    ab.registerAsset(makeAsset('a'));
    expect(ab.getDependencyChain('a')).toEqual(['a']);
  });

  it('includes transitive dependencies in order', () => {
    ab.registerAsset(makeAsset('base', 100));
    ab.registerAsset(makeAsset('mid', 100, ['base']));
    ab.registerAsset(makeAsset('top', 100, ['mid']));
    const chain = ab.getDependencyChain('top');
    expect(chain.indexOf('base')).toBeLessThan(chain.indexOf('mid'));
    expect(chain.indexOf('mid')).toBeLessThan(chain.indexOf('top'));
  });

  it('deduplicates shared dependencies in chain', () => {
    ab.registerAsset(makeAsset('shared', 100));
    ab.registerAsset(makeAsset('x', 100, ['shared']));
    ab.registerAsset(makeAsset('top', 100, ['x', 'shared']));
    const chain = ab.getDependencyChain('top');
    const sharedCount = chain.filter((id) => id === 'shared').length;
    expect(sharedCount).toBe(1);
  });
});
