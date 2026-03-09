import { describe, it, expect } from 'vitest';
import { AssetBundler } from '../assets/AssetBundler';
import { AssetHotReload } from '../assets/AssetHotReload';
import { TextureAtlas } from '../assets/TextureAtlas';

describe('Cycle 113: Asset Pipeline', () => {
  // -------------------------------------------------------------------------
  // AssetBundler
  // -------------------------------------------------------------------------

  it('should bundle assets with dependency resolution', () => {
    const bundler = new AssetBundler();
    bundler.registerAsset({
      id: 'tex1',
      type: 'texture',
      path: '/t1.png',
      sizeBytes: 1024,
      hash: 'a1',
      dependencies: [],
    });
    bundler.registerAsset({
      id: 'mat1',
      type: 'shader',
      path: '/m1.glsl',
      sizeBytes: 512,
      hash: 'b1',
      dependencies: ['tex1'],
    });
    bundler.registerAsset({
      id: 'model1',
      type: 'model',
      path: '/m1.glb',
      sizeBytes: 4096,
      hash: 'c1',
      dependencies: ['mat1'],
    });

    const bundle = bundler.buildBundle({
      id: 'level1',
      name: 'Level 1',
      entries: ['model1'],
      compress: false,
      priority: 1,
    });

    expect(bundle.assets).toHaveLength(3); // model1 + mat1 + tex1
    expect(bundle.totalSizeBytes).toBe(1024 + 512 + 4096);
    // Dependencies should come before dependents
    expect(bundle.assets[0].id).toBe('tex1');
  });

  it('should split bundles by max size', () => {
    const bundler = new AssetBundler();
    for (let i = 0; i < 5; i++) {
      bundler.registerAsset({
        id: `a${i}`,
        type: 'texture',
        path: `/${i}.png`,
        sizeBytes: 1000,
        hash: `h${i}`,
        dependencies: [],
      });
    }

    const splits = bundler.splitBundle({
      id: 'big',
      name: 'Big',
      entries: ['a0', 'a1', 'a2', 'a3', 'a4'],
      compress: false,
      priority: 1,
      maxSizeBytes: 2500,
    });

    expect(splits.length).toBeGreaterThan(1);
    const totalAssets = splits.reduce((s, b) => s + b.assets.length, 0);
    expect(totalAssets).toBe(5);
  });

  it('should generate manifest and compute diffs', () => {
    const bundler = new AssetBundler();
    bundler.registerAsset({
      id: 'x',
      type: 'data',
      path: '/x.json',
      sizeBytes: 100,
      hash: 'h1',
      dependencies: [],
    });
    bundler.buildBundle({ id: 'b1', name: 'B1', entries: ['x'], compress: false, priority: 1 });

    const manifest1 = bundler.generateManifest();
    expect(manifest1.bundles).toHaveLength(1);

    // Add a new bundle
    bundler.registerAsset({
      id: 'y',
      type: 'data',
      path: '/y.json',
      sizeBytes: 200,
      hash: 'h2',
      dependencies: [],
    });
    bundler.buildBundle({ id: 'b2', name: 'B2', entries: ['y'], compress: false, priority: 2 });

    const diff = bundler.computeDiff(manifest1);
    expect(diff.added).toContain('b2');
  });

  // -------------------------------------------------------------------------
  // AssetHotReload
  // -------------------------------------------------------------------------

  it('should notify subscribers on file changes', () => {
    const hotReload = new AssetHotReload();
    hotReload.setDebounceMs(0);

    const changes: string[] = [];
    hotReload.subscribe('*', (change) => changes.push(change.assetId));
    hotReload.watch('tex1', '/textures/brick.png', 'hash_old');

    hotReload.reportChange('tex1', 'hash_new');
    hotReload.flush();

    expect(changes).toContain('tex1');
    expect(hotReload.getStats().totalReloads).toBe(1);
  });

  it('should match glob patterns', () => {
    const hotReload = new AssetHotReload();
    hotReload.setDebounceMs(0);

    const pngChanges: string[] = [];
    hotReload.subscribe('*.png', (change) => pngChanges.push(change.assetId));
    hotReload.watch('img1', '/img.png', 'h1');
    hotReload.watch('snd1', '/snd.wav', 'h2');

    hotReload.reportChange('img1', 'h1_new');
    hotReload.reportChange('snd1', 'h2_new');
    hotReload.flush();

    expect(pngChanges).toHaveLength(1);
    expect(pngChanges[0]).toBe('img1');
  });

  it('should track change history', () => {
    const hotReload = new AssetHotReload();
    hotReload.setDebounceMs(0);
    hotReload.watch('a', '/a.txt', 'h1');
    hotReload.watch('b', '/b.txt', 'h2');

    hotReload.reportChange('a', 'h1_new');
    hotReload.flush();
    hotReload.reportChange('b', 'h2_new');
    hotReload.flush();

    const history = hotReload.getChangeHistory();
    expect(history).toHaveLength(2);
    expect(hotReload.getRecentChanges(1)).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // TextureAtlas
  // -------------------------------------------------------------------------

  it('should pack textures and generate UVs', () => {
    const atlas = new TextureAtlas({
      id: 'sprites',
      maxWidth: 1024,
      maxHeight: 1024,
      padding: 1,
      allowRotation: false,
      powerOfTwo: true,
    });

    const e1 = atlas.pack('icon_sword', 32, 32);
    const e2 = atlas.pack('icon_shield', 64, 64);
    const e3 = atlas.pack('icon_potion', 16, 16);

    expect(e1).not.toBeNull();
    expect(e2).not.toBeNull();
    expect(e3).not.toBeNull();
    expect(atlas.getEntryCount()).toBe(3);

    // UVs should be in 0-1 range
    expect(e1!.uv.u0).toBeGreaterThanOrEqual(0);
    expect(e1!.uv.v1).toBeLessThanOrEqual(1);
  });

  it('should reject textures that exceed atlas size', () => {
    const atlas = new TextureAtlas({
      id: 'tiny',
      maxWidth: 64,
      maxHeight: 64,
      padding: 0,
      allowRotation: false,
      powerOfTwo: false,
    });

    const e1 = atlas.pack('big', 128, 128);
    expect(e1).toBeNull();
  });

  it('should compute occupancy', () => {
    const atlas = new TextureAtlas({
      id: 'occ',
      maxWidth: 256,
      maxHeight: 256,
      padding: 0,
      allowRotation: false,
      powerOfTwo: false,
    });

    atlas.pack('a', 100, 100);
    const occ = atlas.getOccupancy();
    expect(occ).toBeGreaterThan(0);
    expect(occ).toBeLessThanOrEqual(1);
  });
});
