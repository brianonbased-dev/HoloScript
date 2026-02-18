/**
 * AssetValidator Production Tests
 *
 * Built-in validation rules: required fields, file size limits,
 * model poly count, texture power-of-two, and optimization suggestions.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AssetValidator, type ValidationResult } from '../AssetValidator';
import { createAssetMetadata, type AssetMetadata } from '../AssetMetadata';

function makeAsset(overrides: Partial<AssetMetadata> = {}): AssetMetadata {
  const base = createAssetMetadata({
    id: 'test',
    name: 'Test',
    format: 'glb',
    assetType: 'model',
    sourcePath: '/test.glb',
    fileSize: 1000,
    ...overrides,
  });
  // createAssetMetadata doesn't spread optional fields (meshStats, dimensions, lodLevels)
  return Object.assign(base, {
    ...(overrides.meshStats && { meshStats: overrides.meshStats }),
    ...(overrides.dimensions && { dimensions: overrides.dimensions }),
    ...(overrides.lodLevels && { lodLevels: overrides.lodLevels }),
  });
}

describe('AssetValidator — Production', () => {
  let validator: AssetValidator;

  beforeEach(() => {
    validator = new AssetValidator();
  });

  describe('valid asset', () => {
    it('passes with all required fields', () => {
      const result = validator.validate(makeAsset());
      expect(result.valid).toBe(true);
      expect(result.errorCount).toBe(0);
    });
  });

  describe('required field errors', () => {
    it('errors on missing id', () => {
      const asset = makeAsset({ id: '' });
      const result = validator.validate(asset);
      expect(result.issues.some(i => i.code === 'MISSING_ID')).toBe(true);
    });

    it('errors on missing name', () => {
      const asset = makeAsset({ name: '' });
      const result = validator.validate(asset);
      expect(result.issues.some(i => i.code === 'MISSING_NAME')).toBe(true);
    });

    it('errors on missing sourcePath', () => {
      const asset = makeAsset({ sourcePath: '' });
      const result = validator.validate(asset);
      expect(result.issues.some(i => i.code === 'MISSING_SOURCE_PATH')).toBe(true);
    });
  });

  describe('file size checks', () => {
    it('warns on large file (>10MB)', () => {
      const asset = makeAsset({ fileSize: 15 * 1024 * 1024 });
      const result = validator.validate(asset);
      expect(result.issues.some(i => i.code === 'LARGE_FILE')).toBe(true);
    });

    it('errors on huge file (>100MB)', () => {
      const asset = makeAsset({ fileSize: 150 * 1024 * 1024 });
      const result = validator.validate(asset);
      expect(result.issues.some(i => i.code === 'FILE_TOO_LARGE')).toBe(true);
    });
  });

  describe('model-specific', () => {
    it('warns on high poly count', () => {
      const asset = makeAsset({
        assetType: 'model',
        meshStats: { meshCount: 1, vertexCount: 500000, triangleCount: 600000, boneCount: 0 },
      });
      const result = validator.validate(asset);
      expect(result.issues.some(i => i.code === 'HIGH_POLY_COUNT')).toBe(true);
    });

    it('suggests LOD for large models without it', () => {
      const asset = makeAsset({
        assetType: 'model',
        meshStats: { meshCount: 1, vertexCount: 60000, triangleCount: 60000 },
      });
      const result = validator.validate(asset);
      expect(result.issues.some(i => i.code === 'MISSING_LOD')).toBe(true);
    });
  });

  describe('texture-specific', () => {
    it('warns on non-power-of-two texture', () => {
      const asset = makeAsset({
        assetType: 'texture',
        format: 'png',
        dimensions: { width: 300, height: 300 },
      });
      const result = validator.validate(asset);
      expect(result.issues.some(i => i.code === 'NON_POT_TEXTURE')).toBe(true);
    });

    it('warns on large texture', () => {
      const asset = makeAsset({
        assetType: 'texture',
        format: 'png',
        dimensions: { width: 8192, height: 8192 },
      });
      const result = validator.validate(asset);
      expect(result.issues.some(i => i.code === 'LARGE_TEXTURE')).toBe(true);
    });

    it('suggests compression for uncompressed textures', () => {
      const asset = makeAsset({
        assetType: 'texture',
        format: 'png',
      });
      const result = validator.validate(asset);
      expect(result.issues.some(i => i.code === 'UNCOMPRESSED_TEXTURE')).toBe(true);
    });
  });

  describe('validation counts', () => {
    it('counts errors and warnings correctly', () => {
      const asset = makeAsset({ id: '', fileSize: 15 * 1024 * 1024 });
      const result = validator.validate(asset);
      expect(result.errorCount).toBeGreaterThan(0);
      expect(result.warningCount).toBeGreaterThan(0);
    });
  });

  describe('custom rules', () => {
    it('registers and applies custom rule', () => {
      validator.addRule({
        id: 'custom-check',
        name: 'Custom',
        description: 'Custom check',
        severity: 'error',
        appliesTo: 'all',
        validate: (asset) => asset.fileSize === 0 ? {
          code: 'custom-check', severity: 'error', message: 'Zero size', autoFixable: false,
        } : null,
      });

      const result = validator.validate(makeAsset({ fileSize: 0 }));
      expect(result.issues.some(i => i.code === 'custom-check')).toBe(true);
    });
  });
});
