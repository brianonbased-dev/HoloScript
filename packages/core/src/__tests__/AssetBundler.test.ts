import { describe, it, expect, beforeEach } from 'vitest';
import { AssetBundler } from '../assets/AssetBundler';

describe('AssetBundler', () => {
  let bundler: AssetBundler;

  beforeEach(() => {
    bundler = new AssetBundler();
    bundler.registerAsset({ id: 'tex1', type: 'texture', path: '/tex1.png', sizeBytes: 1000, hash: 'aaa', dependencies: [] });
    bundler.registerAsset({ id: 'mod1', type: 'model', path: '/mod1.glb', sizeBytes: 5000, hash: 'bbb', dependencies: ['tex1'] });
    bundler.registerAsset({ id: 'aud1', type: 'audio', path: '/snd.ogg', sizeBytes: 2000, hash: 'ccc', dependencies: [] });
  });

  it('registers and retrieves assets', () => {
    expect(bundler.getAssetCount()).toBe(3);
    expect(bundler.getAsset('tex1')?.path).toBe('/tex1.png');
  });

  it('unregisters asset', () => {
    bundler.unregisterAsset('aud1');
    expect(bundler.getAssetCount()).toBe(2);
  });

  it('builds bundle resolving dependencies', () => {
    const bundle = bundler.buildBundle({ id: 'b1', name: 'Main', entries: ['mod1'], compress: false, priority: 0 });
    // mod1 depends on tex1 → both included
    expect(bundle.assets.length).toBe(2);
    expect(bundle.totalSizeBytes).toBe(6000);
  });

  it('applies compression ratio', () => {
    const bundle = bundler.buildBundle({ id: 'b1', name: 'Main', entries: ['tex1'], compress: true, priority: 0 });
    expect(bundle.compressedSizeBytes).toBe(Math.floor(1000 * 0.6));
  });

  it('splits bundle exceeding maxSizeBytes', () => {
    const parts = bundler.splitBundle({
      id: 'split', name: 'Split', entries: ['tex1', 'mod1', 'aud1'],
      compress: false, maxSizeBytes: 3000, priority: 0,
    });
    expect(parts.length).toBeGreaterThan(1);
  });

  it('generates manifest sorted by priority', () => {
    bundler.buildBundle({ id: 'b1', name: 'Late', entries: ['aud1'], compress: false, priority: 5 });
    bundler.buildBundle({ id: 'b2', name: 'Early', entries: ['tex1'], compress: false, priority: 1 });
    const manifest = bundler.generateManifest();
    expect(manifest.bundles[0].name).toBe('Early');
    expect(manifest.bundles[1].name).toBe('Late');
  });

  it('computes diff between manifests', () => {
    bundler.buildBundle({ id: 'b1', name: 'A', entries: ['tex1'], compress: false, priority: 0 });
    const prevManifest = bundler.generateManifest();
    bundler.buildBundle({ id: 'b2', name: 'B', entries: ['aud1'], compress: false, priority: 1 });
    const diff = bundler.computeDiff(prevManifest);
    expect(diff.added).toContain('b2');
  });

  it('getDependencyChain returns transitive deps in order', () => {
    const chain = bundler.getDependencyChain('mod1');
    expect(chain[0]).toBe('tex1');
    expect(chain[1]).toBe('mod1');
  });

  it('bundle hash is deterministic', () => {
    const b1 = bundler.buildBundle({ id: 'h1', name: 'H', entries: ['tex1'], compress: false, priority: 0 });
    const b2 = bundler.buildBundle({ id: 'h2', name: 'H', entries: ['tex1'], compress: false, priority: 0 });
    expect(b1.hash).toBe(b2.hash);
  });

  it('returns bundle count', () => {
    expect(bundler.getBundleCount()).toBe(0);
    bundler.buildBundle({ id: 'b1', name: 'B', entries: ['tex1'], compress: false, priority: 0 });
    expect(bundler.getBundleCount()).toBe(1);
  });

  it('single bundle when under maxSizeBytes', () => {
    const parts = bundler.splitBundle({
      id: 'one', name: 'One', entries: ['tex1'], compress: false, maxSizeBytes: 99999, priority: 0,
    });
    expect(parts.length).toBe(1);
  });
});
