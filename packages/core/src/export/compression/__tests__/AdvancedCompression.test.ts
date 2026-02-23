/**
 * Advanced Compression Tests
 *
 * Tests for KTX2 and Draco compression
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AdvancedCompression } from '../AdvancedCompression';
import type { CompressionOptions, CompressionStats } from '../CompressionTypes';
import {
  getQualityPresetOptions,
  calculateCompressionRatio,
  calculateReductionPercentage,
} from '../CompressionTypes';
import type { IGLTFDocument } from '../../gltf/GLTFTypes';
import { createEmptyGLTFDocument } from '../../gltf/GLTFTypes';

describe('AdvancedCompression', () => {
  let compressor: AdvancedCompression;
  let mockDocument: IGLTFDocument;

  beforeEach(() => {
    compressor = new AdvancedCompression();
    mockDocument = createMockGLTFDocument();
  });

  describe('Constructor and Options', () => {
    it('should create with default options', () => {
      const comp = new AdvancedCompression();
      expect(comp).toBeDefined();
    });

    it('should apply quality preset options', () => {
      const comp = new AdvancedCompression({ qualityPreset: 'fast' });
      expect(comp).toBeDefined();
    });

    it('should merge custom options with defaults', () => {
      const comp = new AdvancedCompression({
        compressTextures: true,
        textureQuality: 90,
        dracoLevel: 10,
      });
      expect(comp).toBeDefined();
    });

    it('should apply balanced preset correctly', () => {
      const options = getQualityPresetOptions('balanced');
      expect(options.textureQuality).toBe(75);
      expect(options.dracoLevel).toBe(7);
      expect(options.positionBits).toBe(14);
    });

    it('should apply fast preset correctly', () => {
      const options = getQualityPresetOptions('fast');
      expect(options.textureQuality).toBe(50);
      expect(options.dracoLevel).toBe(3);
      expect(options.generateMipmaps).toBe(false);
    });

    it('should apply best preset correctly', () => {
      const options = getQualityPresetOptions('best');
      expect(options.textureQuality).toBe(95);
      expect(options.dracoLevel).toBe(10);
      expect(options.positionBits).toBe(16);
    });
  });

  describe('Texture Compression', () => {
    it('should compress textures when enabled', async () => {
      const comp = new AdvancedCompression({ compressTextures: true });
      const result = await comp.compress(mockDocument);

      expect(result).toBeDefined();
      const stats = comp.getStats();
      expect(stats.texturesCompressed).toBeGreaterThan(0);
    });

    it('should skip texture compression when disabled', async () => {
      const comp = new AdvancedCompression({ compressTextures: false });
      const result = await comp.compress(mockDocument);

      const stats = comp.getStats();
      expect(stats.texturesCompressed).toBe(0);
    });

    it('should achieve >70% texture compression', async () => {
      const comp = new AdvancedCompression({
        compressTextures: true,
        textureQuality: 75,
      });

      const result = await comp.compress(mockDocument);
      const stats = comp.getStats();

      if (stats.texturesCompressed > 0) {
        const textureRatio = calculateReductionPercentage(
          stats.textureReduction + stats.compressedSize,
          stats.compressedSize
        );
        expect(textureRatio).toBeGreaterThanOrEqual(70);
      }
    });

    it('should add KHR_texture_basisu extension', async () => {
      const comp = new AdvancedCompression({ compressTextures: true });
      const result = await comp.compress(mockDocument);

      expect(result.extensionsUsed).toContain('KHR_texture_basisu');
    });

    it('should handle different quality levels', async () => {
      const lowQuality = new AdvancedCompression({ textureQuality: 25 });
      const highQuality = new AdvancedCompression({ textureQuality: 95 });

      await lowQuality.compress(createMockGLTFDocument());
      await highQuality.compress(createMockGLTFDocument());

      const lowStats = lowQuality.getStats();
      const highStats = highQuality.getStats();

      // Lower quality should result in smaller size
      expect(lowStats.compressedSize).toBeLessThanOrEqual(highStats.compressedSize);
    });

    it('should generate mipmaps when enabled', async () => {
      const comp = new AdvancedCompression({ generateMipmaps: true });
      const result = await comp.compress(mockDocument);

      expect(result).toBeDefined();
    });

    it('should handle empty image array', async () => {
      const emptyDoc = createEmptyGLTFDocument();
      const comp = new AdvancedCompression();

      const result = await comp.compress(emptyDoc);
      const stats = comp.getStats();

      expect(stats.texturesCompressed).toBe(0);
    });
  });

  describe('Mesh Compression', () => {
    it('should compress meshes when enabled', async () => {
      const comp = new AdvancedCompression({ compressMeshes: true });
      const result = await comp.compress(mockDocument);

      const stats = comp.getStats();
      expect(stats.meshesCompressed).toBeGreaterThan(0);
    });

    it('should skip mesh compression when disabled', async () => {
      const comp = new AdvancedCompression({ compressMeshes: false });
      const result = await comp.compress(mockDocument);

      const stats = comp.getStats();
      expect(stats.meshesCompressed).toBe(0);
    });

    it('should achieve >60% mesh compression', async () => {
      const comp = new AdvancedCompression({
        compressMeshes: true,
        dracoLevel: 7,
      });

      const result = await comp.compress(mockDocument);
      const stats = comp.getStats();

      if (stats.meshesCompressed > 0) {
        const meshRatio = calculateReductionPercentage(
          stats.meshReduction + stats.compressedSize,
          stats.compressedSize
        );
        expect(meshRatio).toBeGreaterThanOrEqual(60);
      }
    });

    it('should add KHR_draco_mesh_compression extension', async () => {
      const comp = new AdvancedCompression({ compressMeshes: true });
      const result = await comp.compress(mockDocument);

      expect(result.extensionsUsed).toContain('KHR_draco_mesh_compression');
    });

    it('should handle different compression levels', async () => {
      const lowCompression = new AdvancedCompression({ dracoLevel: 3 });
      const highCompression = new AdvancedCompression({ dracoLevel: 10 });

      await lowCompression.compress(createMockGLTFDocument());
      await highCompression.compress(createMockGLTFDocument());

      const lowStats = lowCompression.getStats();
      const highStats = highCompression.getStats();

      // Higher compression should result in smaller size
      expect(highStats.compressedSize).toBeLessThanOrEqual(lowStats.compressedSize);
    });

    it('should handle different quantization bits', async () => {
      const comp = new AdvancedCompression({
        positionBits: 14,
        normalBits: 10,
        uvBits: 12,
        colorBits: 10,
      });

      const result = await comp.compress(mockDocument);
      expect(result).toBeDefined();
    });

    it('should handle empty mesh array', async () => {
      const emptyDoc = createEmptyGLTFDocument();
      const comp = new AdvancedCompression();

      const result = await comp.compress(emptyDoc);
      const stats = comp.getStats();

      expect(stats.meshesCompressed).toBe(0);
    });
  });

  describe('Compression Statistics', () => {
    it('should calculate compression stats', async () => {
      const comp = new AdvancedCompression();
      await comp.compress(mockDocument);

      const stats = comp.getStats();
      expect(stats.originalSize).toBeGreaterThan(0);
      expect(stats.compressedSize).toBeGreaterThan(0);
      expect(stats.compressionRatio).toBeGreaterThan(0);
      expect(stats.compressionTime).toBeGreaterThan(0);
    });

    it('should track texture reduction', async () => {
      const comp = new AdvancedCompression({ compressTextures: true });
      await comp.compress(mockDocument);

      const stats = comp.getStats();
      if (stats.texturesCompressed > 0) {
        expect(stats.textureReduction).toBeGreaterThan(0);
      }
    });

    it('should track mesh reduction', async () => {
      const comp = new AdvancedCompression({ compressMeshes: true });
      await comp.compress(mockDocument);

      const stats = comp.getStats();
      if (stats.meshesCompressed > 0) {
        expect(stats.meshReduction).toBeGreaterThan(0);
      }
    });

    it('should generate compression report', async () => {
      const comp = new AdvancedCompression();
      await comp.compress(mockDocument);

      const report = comp.getCompressionReport();
      expect(report).toBeDefined();
      expect(report).toContain('Compression Report');
      expect(report).toContain('Original Size');
      expect(report).toContain('Compressed Size');
    });
  });

  describe('Compression Ratio Calculations', () => {
    it('should calculate compression ratio correctly', () => {
      const ratio = calculateCompressionRatio(1000, 200);
      expect(ratio).toBe(0.2);
    });

    it('should handle zero original size', () => {
      const ratio = calculateCompressionRatio(0, 100);
      expect(ratio).toBe(0);
    });

    it('should calculate reduction percentage correctly', () => {
      const reduction = calculateReductionPercentage(1000, 200);
      expect(reduction).toBe(80);
    });

    it('should handle zero original size in reduction', () => {
      const reduction = calculateReductionPercentage(0, 100);
      expect(reduction).toBe(0);
    });
  });

  describe('Integration Tests', () => {
    it('should compress both textures and meshes', async () => {
      const comp = new AdvancedCompression({
        compressTextures: true,
        compressMeshes: true,
      });

      const result = await comp.compress(mockDocument);
      const stats = comp.getStats();

      expect(stats.texturesCompressed).toBeGreaterThan(0);
      expect(stats.meshesCompressed).toBeGreaterThan(0);
      expect(result.extensionsUsed).toContain('KHR_texture_basisu');
      expect(result.extensionsUsed).toContain('KHR_draco_mesh_compression');
    });

    it('should achieve overall compression target', async () => {
      const comp = new AdvancedCompression({
        compressTextures: true,
        compressMeshes: true,
        qualityPreset: 'balanced',
      });

      const result = await comp.compress(mockDocument);
      const stats = comp.getStats();

      // Overall compression should be significant
      expect(stats.compressionRatio).toBeLessThan(0.5); // >50% reduction
    });

    it('should complete compression in reasonable time', async () => {
      const comp = new AdvancedCompression();
      const start = performance.now();

      await comp.compress(mockDocument);

      const duration = performance.now() - start;
      expect(duration).toBeLessThan(5000); // 5 seconds
    });
  });

  describe('Format Bytes Utility', () => {
    it('should format bytes correctly', () => {
      expect(AdvancedCompression.formatBytes(0)).toBe('0 Bytes');
      expect(AdvancedCompression.formatBytes(1024)).toBe('1 KB');
      expect(AdvancedCompression.formatBytes(1048576)).toBe('1 MB');
      expect(AdvancedCompression.formatBytes(1073741824)).toBe('1 GB');
    });

    it('should format partial units', () => {
      const formatted = AdvancedCompression.formatBytes(1536);
      expect(formatted).toContain('1.5');
      expect(formatted).toContain('KB');
    });
  });

  describe('Edge Cases', () => {
    it('should handle document with no buffers', async () => {
      const emptyDoc = createEmptyGLTFDocument();
      const comp = new AdvancedCompression();

      const result = await comp.compress(emptyDoc);
      expect(result).toBeDefined();
    });

    it('should handle very small documents', async () => {
      const smallDoc = createEmptyGLTFDocument();
      smallDoc.images = [{ name: 'test', uri: 'test.png' }];

      const comp = new AdvancedCompression();
      const result = await comp.compress(smallDoc);

      expect(result).toBeDefined();
    });

    it('should handle very large documents', async () => {
      const largeDoc = createMockGLTFDocument();
      // Add many meshes and textures
      for (let i = 0; i < 10; i++) {
        largeDoc.meshes?.push({
          name: `mesh${i}`,
          primitives: [{ attributes: { POSITION: i } }],
        });
        largeDoc.images?.push({ name: `image${i}` });
      }

      const comp = new AdvancedCompression();
      const result = await comp.compress(largeDoc);

      expect(result).toBeDefined();
    });
  });
});

/**
 * Create mock GLTF document for testing
 */
function createMockGLTFDocument(): IGLTFDocument {
  const doc = createEmptyGLTFDocument('HoloScript Test');

  // Add mock meshes
  doc.meshes = [
    {
      name: 'TestMesh',
      primitives: [
        {
          attributes: {
            POSITION: 0,
            NORMAL: 1,
            TEXCOORD_0: 2,
          },
          indices: 3,
          mode: 4,
        },
      ],
    },
  ];

  // Add mock images
  doc.images = [
    { name: 'TestImage1', uri: 'test1.png' },
    { name: 'TestImage2', uri: 'test2.png' },
  ];

  // Add mock textures
  doc.textures = [
    { name: 'TestTexture', source: 0, sampler: 0 },
  ];

  // Add mock buffers
  doc.buffers = [
    { byteLength: 2400000 }, // 2.4MB
  ];

  // Add mock buffer views
  doc.bufferViews = [
    { buffer: 0, byteOffset: 0, byteLength: 1200000 },
    { buffer: 0, byteOffset: 1200000, byteLength: 1200000 },
  ];

  // Add mock accessors
  doc.accessors = [
    {
      bufferView: 0,
      componentType: 5126,
      count: 100000,
      type: 'VEC3',
    },
    {
      bufferView: 1,
      componentType: 5126,
      count: 100000,
      type: 'VEC3',
    },
  ];

  return doc;
}
