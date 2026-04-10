import { describe, it, expect, beforeEach } from 'vitest';
import { AssetBundler, AssetEntry, BundleConfig } from '../AssetBundler';

function makeAsset(id: string, sizeBytes = 1024, deps: string[] = []): AssetEntry {
  return {
    id,
    type: 'model',
    path: `/assets/${id}.glb`,
    sizeBytes,
    hash: `hash_${id}`,
    dependencies: deps,
  };
}

describe('AssetBundler', () => {
  let bundler: AssetBundler;

  beforeEach(() => {
    bundler = new AssetBundler();
  });

  // ---- Registration ----

  it('registerAsset adds an asset', () => {
    bundler.registerAsset(makeAsset('a'));
    expect(bundler.getAssetCount()).toBe(1);
    expect(bundler.getAsset('a')).toBeDefined();
  });

  it('unregisterAsset removes an asset', () => {
    bundler.registerAsset(makeAsset('a'));
    bundler.unregisterAsset('a');
    expect(bundler.getAssetCount()).toBe(0);
  });

  // ---- Build Bundle ----

  it('buildBundle creates a bundle with listed assets', () => {
    bundler.registerAsset(makeAsset('a'));
    bundler.registerAsset(makeAsset('b'));
    const config: BundleConfig = {
      id: 'bundle1',
      name: 'Test',
      entries: ['a', 'b'],
      compress: false,
      priority: 1,
    };
    const bundle = bundler.buildBundle(config);
    expect(bundle.assets.length).toBe(2);
    expect(bundle.totalSizeBytes).toBe(2048);
  });

  it('buildBundle resolves dependencies', () => {
    bundler.registerAsset(makeAsset('dep1'));
    bundler.registerAsset(makeAsset('main', 1024, ['dep1']));
    const config: BundleConfig = {
      id: 'bd',
      name: 'Dep',
      entries: ['main'],
      compress: false,
      priority: 0,
    };
    const bundle = bundler.buildBundle(config);
    expect(bundle.assets.length).toBe(2); // dep1 + main
  });

  it('buildBundle with compression reduces size', () => {
    bundler.registerAsset(makeAsset('a', 1000));
    const bundle = bundler.buildBundle({
      id: 'c',
      name: 'C',
      entries: ['a'],
      compress: true,
      priority: 0,
    });
    expect(bundle.compressedSizeBytes).toBeLessThan(bundle.totalSizeBytes);
  });

  it('buildBundle ignores missing entries', () => {
    bundler.registerAsset(makeAsset('a'));
    const bundle = bundler.buildBundle({
      id: 'b',
      name: 'B',
      entries: ['a', 'missing'],
      compress: false,
      priority: 0,
    });
    expect(bundle.assets.length).toBe(1);
  });

  // ---- Split Bundle ----

  it('splitBundle returns single bundle when under max', () => {
    bundler.registerAsset(makeAsset('a', 500));
    const bundles = bundler.splitBundle({
      id: 'sp',
      name: 'SP',
      entries: ['a'],
      compress: false,
      priority: 0,
      maxSizeBytes: 1000,
    });
    expect(bundles.length).toBe(1);
  });

  it('splitBundle splits when over max', () => {
    bundler.registerAsset(makeAsset('a', 600));
    bundler.registerAsset(makeAsset('b', 600));
    const bundles = bundler.splitBundle({
      id: 'sp',
      name: 'SP',
      entries: ['a', 'b'],
      compress: false,
      priority: 0,
      maxSizeBytes: 700,
    });
    expect(bundles.length).toBe(2);
  });

  // ---- Manifest ----

  it('generateManifest includes all bundles', () => {
    bundler.registerAsset(makeAsset('a'));
    bundler.buildBundle({ id: 'b1', name: 'B1', entries: ['a'], compress: false, priority: 1 });
    bundler.buildBundle({ id: 'b2', name: 'B2', entries: ['a'], compress: false, priority: 0 });
    const manifest = bundler.generateManifest();
    expect(manifest.bundles.length).toBe(2);
    // Sorted by priority
    expect(manifest.bundles[0].priority).toBeLessThanOrEqual(manifest.bundles[1].priority);
  });

  // ---- Diff ----

  it('computeDiff detects added bundles', () => {
    bundler.registerAsset(makeAsset('a'));
    const emptyManifest = {
      bundles: [],
      totalAssets: 0,
      totalSizeBytes: 0,
      buildTimestamp: 0,
      version: '0',
    };
    bundler.buildBundle({ id: 'new', name: 'N', entries: ['a'], compress: false, priority: 0 });
    const diff = bundler.computeDiff(emptyManifest);
    expect(diff.added).toContain('new');
  });

  it('computeDiff detects removed bundles', () => {
    const prev = {
      bundles: [
        {
          id: 'old',
          name: 'O',
          assets: [],
          totalSizeBytes: 0,
          compressedSizeBytes: 0,
          hash: 'x',
          priority: 0,
          version: 1,
        },
      ],
      totalAssets: 0,
      totalSizeBytes: 0,
      buildTimestamp: 0,
      version: '1',
    };
    const diff = bundler.computeDiff(prev);
    expect(diff.removed).toContain('old');
  });

  // ---- Dependency Chain ----

  it('getDependencyChain returns transitive deps', () => {
    bundler.registerAsset(makeAsset('c'));
    bundler.registerAsset(makeAsset('b', 1024, ['c']));
    bundler.registerAsset(makeAsset('a', 1024, ['b']));
    const chain = bundler.getDependencyChain('a');
    expect(chain).toContain('c');
    expect(chain).toContain('b');
    expect(chain).toContain('a');
    expect(chain.indexOf('c')).toBeLessThan(chain.indexOf('b'));
  });

  it('getDependencyChain handles no deps', () => {
    bundler.registerAsset(makeAsset('solo'));
    const chain = bundler.getDependencyChain('solo');
    expect(chain).toEqual(['solo']);
  });

  // ---- Bundle Count / Get ----

  it('getBundleCount returns count', () => {
    expect(bundler.getBundleCount()).toBe(0);
    bundler.registerAsset(makeAsset('a'));
    bundler.buildBundle({ id: 'b', name: 'B', entries: ['a'], compress: false, priority: 0 });
    expect(bundler.getBundleCount()).toBe(1);
  });
});
