/**
 * AssetMetadata Production Tests
 *
 * Factory functions and utility mappings: createAssetMetadata, getMimeType,
 * inferAssetType, estimateMemoryUsage.
 */

import { describe, it, expect } from 'vitest';
import {
  createAssetMetadata,
  getMimeType,
  inferAssetType,
  estimateMemoryUsage,
} from '../AssetMetadata';

describe('AssetMetadata — Production', () => {

  describe('createAssetMetadata', () => {
    it('creates metadata with required fields and defaults', () => {
      const meta = createAssetMetadata({
        id: 'hero_model',
        name: 'Hero',
        format: 'glb',
        assetType: 'model',
        sourcePath: '/models/hero.glb',
      });

      expect(meta.id).toBe('hero_model');
      expect(meta.displayName).toBe('Hero');
      expect(meta.mimeType).toBe('model/gltf-binary');
      expect(meta.extension).toBe('glb');
      expect(meta.version).toBe('1.0.0');
      expect(meta.tags).toEqual([]);
      expect(meta.validated).toBe(false);
      expect(meta.isOptimized).toBe(false);
      expect(meta.platformCompatibility.webgl).toBe(true);
    });

    it('overrides defaults with provided values', () => {
      const meta = createAssetMetadata({
        id: 'tex1',
        name: 'Floor',
        format: 'ktx2',
        assetType: 'texture',
        sourcePath: '/tex/floor.ktx2',
        version: '2.0.0',
        tags: ['ground', 'material'],
        fileSize: 1024,
      });

      expect(meta.version).toBe('2.0.0');
      expect(meta.tags).toEqual(['ground', 'material']);
      expect(meta.fileSize).toBe(1024);
    });

    it('sets createdAt and modifiedAt timestamps', () => {
      const meta = createAssetMetadata({
        id: 'a', name: 'a', format: 'png', assetType: 'texture', sourcePath: '/a.png',
      });

      expect(meta.createdAt).toBeDefined();
      expect(meta.modifiedAt).toBeDefined();
    });
  });

  describe('getMimeType', () => {
    it('returns correct MIME for common formats', () => {
      expect(getMimeType('glb')).toBe('model/gltf-binary');
      expect(getMimeType('png')).toBe('image/png');
      expect(getMimeType('mp3')).toBe('audio/mpeg');
      expect(getMimeType('mp4')).toBe('video/mp4');
      expect(getMimeType('usdz')).toBe('model/vnd.usdz+zip');
      expect(getMimeType('holo')).toBe('text/x-holoscript');
    });
  });

  describe('inferAssetType', () => {
    it('infers model types', () => {
      expect(inferAssetType('glb')).toBe('model');
      expect(inferAssetType('fbx')).toBe('model');
      expect(inferAssetType('obj')).toBe('model');
    });

    it('infers texture types', () => {
      expect(inferAssetType('png')).toBe('texture');
      expect(inferAssetType('ktx2')).toBe('texture');
      expect(inferAssetType('hdr')).toBe('texture');
    });

    it('infers scene types', () => {
      expect(inferAssetType('usd')).toBe('scene');
      expect(inferAssetType('usdz')).toBe('scene');
    });

    it('infers audio/video', () => {
      expect(inferAssetType('mp3')).toBe('audio');
      expect(inferAssetType('mp4')).toBe('video');
    });

    it('infers script types', () => {
      expect(inferAssetType('hsplus')).toBe('script');
    });
  });

  describe('estimateMemoryUsage', () => {
    it('estimates texture memory (4x GPU)', () => {
      const est = estimateMemoryUsage(1000, 'png', 'texture');
      expect(est.gpu).toBe(4000);
      expect(est.cpu).toBe(1000);
    });

    it('estimates model memory (2x GPU, 1.5x CPU)', () => {
      const est = estimateMemoryUsage(2000, 'glb', 'model');
      expect(est.gpu).toBe(4000);
      expect(est.cpu).toBe(3000);
    });

    it('estimates audio memory (CPU only)', () => {
      const est = estimateMemoryUsage(500, 'mp3', 'audio');
      expect(est.gpu).toBe(0);
      expect(est.cpu).toBe(500);
    });

    it('defaults to CPU only for unknown types', () => {
      const est = estimateMemoryUsage(100, 'holo', 'data');
      expect(est.gpu).toBe(0);
      expect(est.cpu).toBe(100);
    });
  });
});
