/**
 * Test suite for exporters.ts utility functions
 * Tests estimateExportSize and supportedFormats functions
 */

import { describe, it, expect } from 'vitest';
import { estimateExportSize, supportedFormats, type ExportFormat } from '../exporters';

describe('Exporters Utilities', () => {
  describe('estimateExportSize', () => {
    it('should estimate correct size for GLB format', () => {
      const result = estimateExportSize(10, 'glb');
      expect(result).toBe(5120); // 10 nodes * 512 bytes per node
    });

    it('should estimate correct size for GLTF format', () => {
      const result = estimateExportSize(5, 'gltf');
      expect(result).toBe(3840); // 5 nodes * 768 bytes per node
    });

    it('should estimate correct size for OBJ format', () => {
      const result = estimateExportSize(20, 'obj');
      expect(result).toBe(5120); // 20 nodes * 256 bytes per node
    });

    it('should estimate correct size for FBX format', () => {
      const result = estimateExportSize(3, 'fbx');
      expect(result).toBe(3072); // 3 nodes * 1024 bytes per node
    });

    it('should estimate correct size for USD format', () => {
      const result = estimateExportSize(7, 'usd');
      expect(result).toBe(4480); // 7 nodes * 640 bytes per node
    });

    it('should estimate correct size for HoloScript format', () => {
      const result = estimateExportSize(15, 'holoscript');
      expect(result).toBe(1920); // 15 nodes * 128 bytes per node
    });

    it('should return 0 for 0 nodes', () => {
      const result = estimateExportSize(0, 'glb');
      expect(result).toBe(0);
    });

    it('should handle large node counts', () => {
      const result = estimateExportSize(10000, 'glb');
      expect(result).toBe(5120000); // 10000 nodes * 512 bytes per node
    });

    it('should use default size for unknown formats', () => {
      // Cast to unknown format to test fallback behavior
      const result = estimateExportSize(10, 'unknown' as ExportFormat);
      expect(result).toBe(5120); // 10 nodes * 512 (default) bytes per node
    });

    it('should handle decimal node counts correctly', () => {
      // Even though nodeCount should be integer, test mathematical correctness
      const result = estimateExportSize(2.5, 'holoscript');
      expect(result).toBe(320); // 2.5 nodes * 128 bytes per node
    });

    it('should validate size estimates are reasonable', () => {
      // Sanity checks for different formats
      const glbSize = estimateExportSize(100, 'glb');
      const holoscriptSize = estimateExportSize(100, 'holoscript');
      const fbxSize = estimateExportSize(100, 'fbx');

      // HoloScript should be smallest, FBX should be largest
      expect(holoscriptSize).toBeLessThan(glbSize);
      expect(glbSize).toBeLessThan(fbxSize);

      // All should be positive
      expect(glbSize).toBeGreaterThan(0);
      expect(holoscriptSize).toBeGreaterThan(0);
      expect(fbxSize).toBeGreaterThan(0);
    });
  });

  describe('supportedFormats', () => {
    it('should return array of supported formats', () => {
      const formats = supportedFormats();
      expect(Array.isArray(formats)).toBe(true);
      expect(formats.length).toBeGreaterThan(0);
    });

    it('should include all expected formats', () => {
      const formats = supportedFormats();
      const formatValues = formats.map((f) => f.format);

      expect(formatValues).toContain('glb');
      expect(formatValues).toContain('gltf');
      expect(formatValues).toContain('obj');
      expect(formatValues).toContain('usd');
      expect(formatValues).toContain('holoscript');
    });

    it('should include GLB format with correct metadata', () => {
      const formats = supportedFormats();
      const glb = formats.find((f) => f.format === 'glb');

      expect(glb).toBeDefined();
      expect(glb?.label).toBe('glTF Binary');
      expect(glb?.extension).toBe('.glb');
    });

    it('should include GLTF format with correct metadata', () => {
      const formats = supportedFormats();
      const gltf = formats.find((f) => f.format === 'gltf');

      expect(gltf).toBeDefined();
      expect(gltf?.label).toBe('glTF JSON');
      expect(gltf?.extension).toBe('.gltf');
    });

    it('should include OBJ format with correct metadata', () => {
      const formats = supportedFormats();
      const obj = formats.find((f) => f.format === 'obj');

      expect(obj).toBeDefined();
      expect(obj?.label).toBe('Wavefront OBJ');
      expect(obj?.extension).toBe('.obj');
    });

    it('should include USD format with correct metadata', () => {
      const formats = supportedFormats();
      const usd = formats.find((f) => f.format === 'usd');

      expect(usd).toBeDefined();
      expect(usd?.label).toBe('Universal Scene Description');
      expect(usd?.extension).toBe('.usda');
    });

    it('should include HoloScript format with correct metadata', () => {
      const formats = supportedFormats();
      const holoscript = formats.find((f) => f.format === 'holoscript');

      expect(holoscript).toBeDefined();
      expect(holoscript?.label).toBe('HoloScript Source');
      expect(holoscript?.extension).toBe('.holo');
    });

    it('should return consistent results on multiple calls', () => {
      const formats1 = supportedFormats();
      const formats2 = supportedFormats();

      expect(formats1).toEqual(formats2);
    });

    it('should return objects with required properties', () => {
      const formats = supportedFormats();

      formats.forEach((format) => {
        expect(format).toHaveProperty('format');
        expect(format).toHaveProperty('label');
        expect(format).toHaveProperty('extension');
        expect(typeof format.format).toBe('string');
        expect(typeof format.label).toBe('string');
        expect(typeof format.extension).toBe('string');
        expect(format.extension).toMatch(/^\.[a-z]+$/); // Should be .ext format
      });
    });

    it('should have unique format values', () => {
      const formats = supportedFormats();
      const formatValues = formats.map((f) => f.format);
      const uniqueFormats = [...new Set(formatValues)];

      expect(formatValues).toHaveLength(uniqueFormats.length);
    });

    it('should have descriptive labels', () => {
      const formats = supportedFormats();

      formats.forEach((format) => {
        expect(format.label.length).toBeGreaterThan(3);
        expect(format.label).not.toBe(format.format); // Label should be more descriptive than format
      });
    });
  });

  describe('Integration Tests', () => {
    it('should have size estimates for all supported formats', () => {
      const formats = supportedFormats();

      formats.forEach((format) => {
        const size = estimateExportSize(10, format.format);
        expect(size).toBeGreaterThan(0);
        expect(typeof size).toBe('number');
        expect(isFinite(size)).toBe(true);
      });
    });

    it('should maintain format consistency between functions', () => {
      const supportedFormatValues = supportedFormats().map((f) => f.format);
      const testFormats: ExportFormat[] = ['glb', 'gltf', 'obj', 'fbx', 'usd', 'holoscript'];

      // All test formats should be covered by supportedFormats (except fbx which is legacy)
      testFormats.forEach((format) => {
        if (format !== 'fbx') {
          // FBX not in supportedFormats but handled by estimateExportSize
          expect(supportedFormatValues).toContain(format);
        }
      });
    });
  });
});
