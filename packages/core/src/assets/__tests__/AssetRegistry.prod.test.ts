/**
 * AssetRegistry Production Tests
 *
 * Singleton lifecycle, manifest management, asset lookup, cache (set/get/evict),
 * event listeners, and config.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AssetRegistry } from '../AssetRegistry';
import { AssetManifest } from '../AssetManifest';
import { createAssetMetadata } from '../AssetMetadata';

function makeManifest() {
  const m = new AssetManifest({
    version: '1.0.0',
    projectName: 'T',
    baseUrl: '/',
    defaults: { compression: 'none', textureFormat: 'RGBA8', maxTextureSize: '2K', lodLevels: 1 },
  });
  m.addAsset(
    createAssetMetadata({
      id: 'hero',
      name: 'Hero',
      format: 'glb',
      assetType: 'model',
      sourcePath: '/hero.glb',
      tags: ['character'],
      fileSize: 500,
    })
  );
  m.addAsset(
    createAssetMetadata({
      id: 'floor',
      name: 'Floor',
      format: 'png',
      assetType: 'texture',
      sourcePath: '/floor.png',
      tags: ['env'],
      fileSize: 200,
    })
  );
  return m;
}

describe('AssetRegistry — Production', () => {
  beforeEach(() => {
    AssetRegistry.resetInstance();
  });

  describe('singleton', () => {
    it('returns same instance', () => {
      expect(AssetRegistry.getInstance()).toBe(AssetRegistry.getInstance());
    });

    it('resetInstance creates fresh', () => {
      const a = AssetRegistry.getInstance();
      AssetRegistry.resetInstance();
      expect(AssetRegistry.getInstance()).not.toBe(a);
    });
  });

  describe('manifest management', () => {
    it('registers and activates manifest', () => {
      const reg = AssetRegistry.getInstance();
      const m = makeManifest();

      reg.registerManifest('main', m);
      reg.setActiveManifest('main');

      expect(reg.getActiveManifest()).toBe(m);
      expect(reg.getManifest('main')).toBe(m);
    });

    it('setActiveManifest returns false for unknown', () => {
      expect(AssetRegistry.getInstance().setActiveManifest('nope')).toBe(false);
    });
  });

  describe('asset queries', () => {
    let reg: AssetRegistry;
    beforeEach(() => {
      reg = AssetRegistry.getInstance();
      reg.registerManifest('main', makeManifest());
      reg.setActiveManifest('main');
    });

    it('getAsset by ID', () => {
      expect(reg.getAsset('hero')?.name).toBe('Hero');
    });

    it('getAssetByPath', () => {
      expect(reg.getAssetByPath('/floor.png')?.id).toBe('floor');
    });

    it('findByTag', () => {
      expect(reg.findByTag('character').length).toBe(1);
    });

    it('findByType', () => {
      expect(reg.findByType('texture').length).toBe(1);
    });

    it('search', () => {
      expect(reg.search('hero').length).toBe(1);
    });
  });

  describe('cache', () => {
    it('set and get cached', () => {
      const reg = AssetRegistry.getInstance();
      reg.setCached('hero', { meshData: true }, 500);
      expect(reg.getCached('hero')).toEqual({ meshData: true });
    });

    it('returns undefined for uncached', () => {
      expect(AssetRegistry.getInstance().getCached('missing')).toBeUndefined();
    });
  });

  describe('config', () => {
    it('getConfig returns defaults', () => {
      const cfg = AssetRegistry.getInstance().getConfig();
      expect(cfg.maxCacheSize).toBeGreaterThan(0);
    });

    it('updateConfig merges', () => {
      const reg = AssetRegistry.getInstance();
      reg.updateConfig({ maxCacheSize: 999 });
      expect(reg.getConfig().maxCacheSize).toBe(999);
    });
  });

  describe('dispose', () => {
    it('clears state', () => {
      const reg = AssetRegistry.getInstance();
      reg.registerManifest('d', makeManifest());
      reg.dispose();
      expect(reg.getActiveManifest()).toBeNull();
    });
  });
});
