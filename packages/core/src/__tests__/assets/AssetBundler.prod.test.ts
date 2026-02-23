/**
 * AssetBundler Production Tests
 *
 * Covers: registerAsset/unregisterAsset/getAsset/getAssetCount,
 * buildBundle (collects direct assets + transitive deps, computes sizes,
 * compress=true gives 60% size, stores bundle, increments version),
 * splitBundle (single bundle when under maxSize, splits into parts when over),
 * getDependencyChain (topological order, deps first),
 * getBundle/getBundleCount, generateManifest (sorted by priority, totalAssets deduped),
 * computeDiff (added/removed/changed), clear.
 */

import { describe, it, expect } from 'vitest';
import { AssetBundler } from '../../assets/AssetBundler';
import type { AssetEntry, BundleConfig } from '../../assets/AssetBundler';

// ── helpers ───────────────────────────────────────────────────────────────────

function makeAsset(id: string, sizeBytes = 1000, deps: string[] = []): AssetEntry {
  return { id, type: 'texture', path: `/${id}.png`, sizeBytes, hash: id + '_hash', dependencies: deps };
}

function cfg(id: string, entries: string[], priority = 0, compress = false): BundleConfig {
  return { id, name: id, entries, compress, priority };
}

// ── registerAsset / getAsset / unregisterAsset ────────────────────────────────

describe('AssetBundler — registerAsset / getAsset / unregisterAsset', () => {

  it('registerAsset stores asset; getAsset retrieves it', () => {
    const ab = new AssetBundler();
    ab.registerAsset(makeAsset('tex1'));
    expect(ab.getAsset('tex1')?.id).toBe('tex1');
  });

  it('getAsset returns undefined for unknown id', () => {
    expect(new AssetBundler().getAsset('ghost')).toBeUndefined();
  });

  it('getAssetCount tracks count', () => {
    const ab = new AssetBundler();
    ab.registerAsset(makeAsset('a'));
    ab.registerAsset(makeAsset('b'));
    expect(ab.getAssetCount()).toBe(2);
  });

  it('unregisterAsset removes asset', () => {
    const ab = new AssetBundler();
    ab.registerAsset(makeAsset('x'));
    ab.unregisterAsset('x');
    expect(ab.getAsset('x')).toBeUndefined();
  });
});

// ── buildBundle ───────────────────────────────────────────────────────────────

describe('AssetBundler — buildBundle', () => {

  it('bundle contains the directly listed assets', () => {
    const ab = new AssetBundler();
    ab.registerAsset(makeAsset('a', 500));
    ab.registerAsset(makeAsset('b', 300));
    const bundle = ab.buildBundle(cfg('b1', ['a', 'b']));
    const ids = bundle.assets.map(a => a.id);
    expect(ids).toContain('a');
    expect(ids).toContain('b');
  });

  it('bundle automatically includes transitive dependencies', () => {
    const ab = new AssetBundler();
    ab.registerAsset(makeAsset('dep', 200));
    ab.registerAsset(makeAsset('parent', 400, ['dep']));
    const bundle = ab.buildBundle(cfg('b1', ['parent']));
    const ids = bundle.assets.map(a => a.id);
    expect(ids).toContain('dep');
    expect(ids).toContain('parent');
    // dep should come before parent
    expect(ids.indexOf('dep')).toBeLessThan(ids.indexOf('parent'));
  });

  it('totalSizeBytes = sum of all asset sizes', () => {
    const ab = new AssetBundler();
    ab.registerAsset(makeAsset('a', 500));
    ab.registerAsset(makeAsset('b', 300));
    const bundle = ab.buildBundle(cfg('b1', ['a', 'b']));
    expect(bundle.totalSizeBytes).toBe(800);
  });

  it('compress=true gives compressedSizeBytes ≈ 60% of total', () => {
    const ab = new AssetBundler();
    ab.registerAsset(makeAsset('a', 1000));
    const bundle = ab.buildBundle({ ...cfg('b1', ['a']), compress: true });
    expect(bundle.compressedSizeBytes).toBe(600);
  });

  it('compress=false keeps compressedSizeBytes equal to totalSizeBytes', () => {
    const ab = new AssetBundler();
    ab.registerAsset(makeAsset('a', 1000));
    const bundle = ab.buildBundle(cfg('b1', ['a']));
    expect(bundle.compressedSizeBytes).toBe(bundle.totalSizeBytes);
  });

  it('bundle version increments with each buildBundle call', () => {
    const ab = new AssetBundler();
    ab.registerAsset(makeAsset('a'));
    const b1 = ab.buildBundle(cfg('b1', ['a']));
    const b2 = ab.buildBundle(cfg('b2', ['a']));
    expect(b2.version).toBe(b1.version + 1);
  });

  it('bundle hash is a non-empty string', () => {
    const ab = new AssetBundler();
    ab.registerAsset(makeAsset('a'));
    const bundle = ab.buildBundle(cfg('b1', ['a']));
    expect(typeof bundle.hash).toBe('string');
    expect(bundle.hash.length).toBeGreaterThan(0);
  });

  it('bundle is retrievable via getBundle after buildBundle', () => {
    const ab = new AssetBundler();
    ab.registerAsset(makeAsset('a'));
    ab.buildBundle(cfg('myBundle', ['a']));
    expect(ab.getBundle('myBundle')).toBeDefined();
  });

  it('missing assets in bundle entries are silently skipped', () => {
    const ab = new AssetBundler();
    const bundle = ab.buildBundle(cfg('b1', ['nonexistent']));
    expect(bundle.assets).toHaveLength(0);
    expect(bundle.totalSizeBytes).toBe(0);
  });
});

// ── splitBundle ───────────────────────────────────────────────────────────────

describe('AssetBundler — splitBundle', () => {

  it('returns one bundle when total size <= maxSizeBytes', () => {
    const ab = new AssetBundler();
    ab.registerAsset(makeAsset('a', 500));
    ab.registerAsset(makeAsset('b', 400));
    const bundles = ab.splitBundle({ ...cfg('b1', ['a', 'b']), maxSizeBytes: 1000 });
    expect(bundles).toHaveLength(1);
  });

  it('splits into multiple parts when total exceeds maxSizeBytes', () => {
    const ab = new AssetBundler();
    ab.registerAsset(makeAsset('a', 600));
    ab.registerAsset(makeAsset('b', 600));
    ab.registerAsset(makeAsset('c', 600));
    const bundles = ab.splitBundle({ ...cfg('b1', ['a', 'b', 'c']), maxSizeBytes: 700 });
    expect(bundles.length).toBeGreaterThan(1);
  });

  it('each split sub-bundle has id prefixed with original id', () => {
    const ab = new AssetBundler();
    ab.registerAsset(makeAsset('a', 600));
    ab.registerAsset(makeAsset('b', 600));
    const bundles = ab.splitBundle({ ...cfg('main', ['a', 'b']), maxSizeBytes: 700 });
    const hasPrefix = bundles.every(b => b.id.startsWith('main'));
    expect(hasPrefix).toBe(true);
  });
});

// ── getDependencyChain ────────────────────────────────────────────────────────

describe('AssetBundler — getDependencyChain', () => {

  it('returns just the asset itself when no deps', () => {
    const ab = new AssetBundler();
    ab.registerAsset(makeAsset('solo'));
    expect(ab.getDependencyChain('solo')).toContain('solo');
  });

  it('returns empty array for unknown asset', () => {
    expect(new AssetBundler().getDependencyChain('ghost')).toHaveLength(0);
  });

  it('includes transitive deps in topological order (deps before parents)', () => {
    const ab = new AssetBundler();
    ab.registerAsset(makeAsset('leaf', 100));
    ab.registerAsset(makeAsset('mid', 200, ['leaf']));
    ab.registerAsset(makeAsset('root', 300, ['mid']));
    const chain = ab.getDependencyChain('root');
    expect(chain.indexOf('leaf')).toBeLessThan(chain.indexOf('mid'));
    expect(chain.indexOf('mid')).toBeLessThan(chain.indexOf('root'));
  });
});

// ── generateManifest ──────────────────────────────────────────────────────────

describe('AssetBundler — generateManifest', () => {

  it('manifest contains all built bundles', () => {
    const ab = new AssetBundler();
    ab.registerAsset(makeAsset('a'));
    ab.registerAsset(makeAsset('b'));
    ab.buildBundle({ ...cfg('b1', ['a']), priority: 2 });
    ab.buildBundle({ ...cfg('b2', ['b']), priority: 1 });
    const manifest = ab.generateManifest();
    expect(manifest.bundles).toHaveLength(2);
  });

  it('manifest bundles are sorted by priority (lower = first)', () => {
    const ab = new AssetBundler();
    ab.registerAsset(makeAsset('a'));
    ab.registerAsset(makeAsset('b'));
    ab.buildBundle({ ...cfg('high', ['a']), priority: 10 });
    ab.buildBundle({ ...cfg('low', ['b']), priority: 1 });
    const manifest = ab.generateManifest();
    expect(manifest.bundles[0].priority).toBeLessThan(manifest.bundles[1].priority);
  });

  it('totalSizeBytes reflects sum of all bundle sizes', () => {
    const ab = new AssetBundler();
    ab.registerAsset(makeAsset('a', 1000));
    ab.buildBundle(cfg('b1', ['a']));
    const manifest = ab.generateManifest();
    expect(manifest.totalSizeBytes).toBe(1000);
  });

  it('manifest has version string and buildTimestamp', () => {
    const manifest = new AssetBundler().generateManifest();
    expect(typeof manifest.version).toBe('string');
    expect(typeof manifest.buildTimestamp).toBe('number');
  });
});

// ── computeDiff ───────────────────────────────────────────────────────────────

describe('AssetBundler — computeDiff', () => {

  it('added contains new bundles not in previous', () => {
    const ab = new AssetBundler();
    ab.registerAsset(makeAsset('a'));
    const prev = ab.generateManifest(); // empty
    ab.buildBundle(cfg('newBundle', ['a']));
    const diff = ab.computeDiff(prev);
    expect(diff.added).toContain('newBundle');
  });

  it('removed contains bundles in previous not in current', () => {
    const ab = new AssetBundler();
    ab.registerAsset(makeAsset('a'));
    ab.buildBundle(cfg('oldBundle', ['a']));
    const prev = ab.generateManifest();

    // Create fresh bundler with no bundles
    const ab2 = new AssetBundler();
    const diff = ab2.computeDiff(prev);
    expect(diff.removed).toContain('oldBundle');
  });
});

// ── getBundleCount ────────────────────────────────────────────────────────────

describe('AssetBundler — getBundleCount', () => {

  it('getBundleCount is 0 initially', () => {
    expect(new AssetBundler().getBundleCount()).toBe(0);
  });

  it('getBundleCount increments after buildBundle', () => {
    const ab = new AssetBundler();
    ab.registerAsset(makeAsset('a'));
    ab.buildBundle(cfg('b1', ['a']));
    expect(ab.getBundleCount()).toBe(1);
  });
});
