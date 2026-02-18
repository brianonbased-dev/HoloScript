/**
 * AssetManifest Production Tests
 *
 * Central asset catalog: add/remove/update assets, path index, search,
 * find by tag/type/format, groups, stats, and JSON round-trip.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AssetManifest, type ManifestConfig } from '../AssetManifest';
import { createAssetMetadata, type AssetMetadata } from '../AssetMetadata';

const CONFIG: ManifestConfig = {
  version: '1.0.0',
  projectName: 'TestProject',
  baseUrl: '/assets/',
  defaults: {
    compression: 'none',
    textureFormat: 'RGBA8',
    maxTextureSize: '2K',
    lodLevels: 3,
  },
};

function makeAsset(id: string, opts: Partial<AssetMetadata> = {}): AssetMetadata {
  return createAssetMetadata({
    id,
    name: opts.name ?? id,
    format: opts.format ?? 'glb',
    assetType: opts.assetType ?? 'model',
    sourcePath: opts.sourcePath ?? `/models/${id}.glb`,
    tags: opts.tags ?? [],
    fileSize: opts.fileSize ?? 100,
    ...opts,
  });
}

describe('AssetManifest — Production', () => {
  let manifest: AssetManifest;

  beforeEach(() => {
    manifest = new AssetManifest(CONFIG);
  });

  describe('add/remove', () => {
    it('adds and retrieves asset by ID', () => {
      const a = makeAsset('hero');
      manifest.addAsset(a);
      expect(manifest.getAsset('hero')).toBe(a);
      expect(manifest.hasAsset('hero')).toBe(true);
    });

    it('retrieves asset by path', () => {
      const a = makeAsset('tree', { sourcePath: '/env/tree.glb' });
      manifest.addAsset(a);
      expect(manifest.getAssetByPath('/env/tree.glb')?.id).toBe('tree');
    });

    it('removes asset', () => {
      manifest.addAsset(makeAsset('del'));
      expect(manifest.removeAsset('del')).toBe(true);
      expect(manifest.hasAsset('del')).toBe(false);
    });

    it('addAssets batch', () => {
      manifest.addAssets([makeAsset('a'), makeAsset('b'), makeAsset('c')]);
      expect(manifest.getAllAssets().length).toBe(3);
    });
  });

  describe('update', () => {
    it('updates asset metadata', () => {
      manifest.addAsset(makeAsset('upd', { fileSize: 100 }));
      manifest.updateAsset('upd', { fileSize: 999 });
      expect(manifest.getAsset('upd')?.fileSize).toBe(999);
    });

    it('returns false for unknown asset', () => {
      expect(manifest.updateAsset('nope', { fileSize: 1 })).toBe(false);
    });
  });

  describe('search & find', () => {
    beforeEach(() => {
      manifest.addAssets([
        makeAsset('hero_model', { tags: ['character', 'main'], assetType: 'model', format: 'glb' }),
        makeAsset('floor_tex', { tags: ['environment'], assetType: 'texture', format: 'ktx2', name: 'Floor' }),
        makeAsset('bad_asset', { tags: ['broken'], validationErrors: ['missing file'] } as any),
      ]);
    });

    it('findByTag', () => {
      expect(manifest.findByTag('character').length).toBe(1);
    });

    it('findByTags (AND)', () => {
      expect(manifest.findByTags(['character', 'main']).length).toBe(1);
      expect(manifest.findByTags(['character', 'environment']).length).toBe(0);
    });

    it('findByType', () => {
      expect(manifest.findByType('texture').length).toBe(1);
    });

    it('findByFormat', () => {
      expect(manifest.findByFormat('ktx2').length).toBe(1);
    });

    it('search by name', () => {
      expect(manifest.search('floor').length).toBe(1);
    });

    it('findWithErrors', () => {
      expect(manifest.findWithErrors().length).toBe(1);
    });
  });

  describe('JSON round-trip', () => {
    it('toJSON and fromJSON preserve assets', () => {
      manifest.addAsset(makeAsset('rt'));
      const json = manifest.toJSON();
      const restored = AssetManifest.fromJSON(json);
      expect(restored.getAsset('rt')?.id).toBe('rt');
    });
  });

  describe('config', () => {
    it('getConfig returns current config', () => {
      expect(manifest.getConfig().projectName).toBe('TestProject');
    });

    it('updateConfig merges', () => {
      manifest.updateConfig({ projectName: 'Updated' });
      expect(manifest.getConfig().projectName).toBe('Updated');
    });
  });
});
