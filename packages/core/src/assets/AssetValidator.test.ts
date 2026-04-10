/**
 * @holoscript/core AssetValidator Tests
 *
 * Comprehensive tests for asset validation including:
 * - All 13 built-in validation rules
 * - Custom rule management
 * - Validation results structure
 * - Platform compatibility checks
 * - Optimization suggestions
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  AssetValidator,
  createAssetValidator,
  validateAsset,
  isAssetValid,
  ValidationRule,
  ValidationResult,
  ValidationIssue,
} from './AssetValidator';
import { AssetMetadata, createAssetMetadata, PlatformCompatibility } from './AssetMetadata';

// ============================================================================
// Test Fixtures
// ============================================================================

function createValidAsset(overrides: Partial<AssetMetadata> = {}): AssetMetadata {
  return createAssetMetadata({
    id: 'test-asset',
    name: 'test-asset',
    format: 'glb',
    assetType: 'model',
    sourcePath: '/assets/test.glb',
    fileSize: 1024 * 1024, // 1MB
    platformCompatibility: {
      webgl: true,
      webgl2: true,
      desktop: true,
    },
    tags: ['test'],
    semanticTags: { category: 'prop' },
    dependencies: [],
    ...overrides,
  });
}

function createTextureAsset(overrides: Partial<AssetMetadata> = {}): AssetMetadata {
  const base = createAssetMetadata({
    id: 'test-texture',
    name: 'test-texture',
    format: 'png',
    assetType: 'texture',
    sourcePath: '/textures/test.png',
    fileSize: 512 * 1024, // 512KB
    platformCompatibility: { webgl: true },
    tags: ['texture'],
  });
  // Add optional properties that createAssetMetadata doesn't forward
  return {
    ...base,
    dimensions: { width: 1024, height: 1024 },
    ...overrides,
  };
}

function createModelAsset(overrides: Partial<AssetMetadata> = {}): AssetMetadata {
  const base = createAssetMetadata({
    id: 'test-model',
    name: 'test-model',
    format: 'glb',
    assetType: 'model',
    sourcePath: '/models/test.glb',
    fileSize: 2 * 1024 * 1024, // 2MB
    platformCompatibility: { webgl: true },
    tags: ['model'],
  });
  // Add optional properties that createAssetMetadata doesn't forward
  return {
    ...base,
    meshStats: {
      meshCount: 1,
      vertexCount: 10000,
      triangleCount: 20000,
    },
    ...overrides,
  };
}

// ============================================================================
// Validator Instance Tests
// ============================================================================

describe('AssetValidator - Instance', () => {
  it('should create validator with default rules', () => {
    const validator = new AssetValidator();
    const rules = validator.getRules();

    expect(rules.length).toBeGreaterThanOrEqual(13);
  });

  it('should create validator using factory function', () => {
    const validator = createAssetValidator();
    expect(validator).toBeInstanceOf(AssetValidator);
  });
});

// ============================================================================
// Required Field Rules Tests
// ============================================================================

describe('AssetValidator - Required Field Rules', () => {
  let validator: AssetValidator;

  beforeEach(() => {
    validator = new AssetValidator();
  });

  it('should fail validation for missing ID', () => {
    const asset = createValidAsset();
    (asset as any).id = '';

    const result = validator.validate(asset);

    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === 'MISSING_ID')).toBe(true);
  });

  it('should fail validation for missing name', () => {
    const asset = createValidAsset();
    (asset as any).name = '';

    const result = validator.validate(asset);

    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === 'MISSING_NAME')).toBe(true);
  });

  it('should fail validation for missing source path', () => {
    const asset = createValidAsset();
    (asset as any).sourcePath = '';

    const result = validator.validate(asset);

    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === 'MISSING_SOURCE_PATH')).toBe(true);
  });

  it('should pass validation for valid asset', () => {
    const asset = createValidAsset();
    const result = validator.validate(asset);

    expect(result.errorCount).toBe(0);
  });
});

// ============================================================================
// File Size Rules Tests
// ============================================================================

describe('AssetValidator - File Size Rules', () => {
  let validator: AssetValidator;

  beforeEach(() => {
    validator = new AssetValidator();
  });

  it('should warn about large files (>10MB)', () => {
    const asset = createValidAsset({
      fileSize: 15 * 1024 * 1024, // 15MB
    });

    const result = validator.validate(asset);

    expect(result.warningCount).toBeGreaterThan(0);
    expect(result.issues.some((i) => i.code === 'LARGE_FILE')).toBe(true);
  });

  it('should error on extremely large files (>100MB)', () => {
    const asset = createValidAsset({
      fileSize: 150 * 1024 * 1024, // 150MB
    });

    const result = validator.validate(asset);

    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === 'FILE_TOO_LARGE')).toBe(true);
  });

  it('should not warn about reasonably sized files', () => {
    const asset = createValidAsset({
      fileSize: 5 * 1024 * 1024, // 5MB
    });

    const result = validator.validate(asset);

    expect(result.issues.some((i) => i.code === 'LARGE_FILE')).toBe(false);
    expect(result.issues.some((i) => i.code === 'FILE_TOO_LARGE')).toBe(false);
  });
});

// ============================================================================
// Model-Specific Rules Tests
// ============================================================================

describe('AssetValidator - Model Rules', () => {
  let validator: AssetValidator;

  beforeEach(() => {
    validator = new AssetValidator();
  });

  it('should warn about high polygon count (>100k)', () => {
    const asset = createModelAsset({
      meshStats: {
        meshCount: 1,
        vertexCount: 200000,
        triangleCount: 150000,
      },
    });

    const result = validator.validate(asset);

    expect(result.issues.some((i) => i.code === 'HIGH_POLY_COUNT')).toBe(true);
  });

  it('should suggest LOD for large models without LOD', () => {
    const asset = createModelAsset({
      meshStats: {
        meshCount: 1,
        vertexCount: 100000,
        triangleCount: 60000,
      },
      lodLevels: undefined,
    });

    const result = validator.validate(asset);

    expect(result.issues.some((i) => i.code === 'MISSING_LOD')).toBe(true);
  });

  it('should not suggest LOD when already present', () => {
    const asset = createModelAsset({
      meshStats: {
        meshCount: 1,
        vertexCount: 100000,
        triangleCount: 60000,
      },
      lodLevels: [
        { level: 0, distance: 0 },
        { level: 1, distance: 10 },
        { level: 2, distance: 25 },
      ],
    });

    const result = validator.validate(asset);

    expect(result.issues.some((i) => i.code === 'MISSING_LOD')).toBe(false);
  });

  it('should not apply model rules to textures', () => {
    const asset = createTextureAsset();

    const result = validator.validate(asset);

    expect(result.issues.some((i) => i.code === 'HIGH_POLY_COUNT')).toBe(false);
    expect(result.issues.some((i) => i.code === 'MISSING_LOD')).toBe(false);
  });
});

// ============================================================================
// Texture-Specific Rules Tests
// ============================================================================

describe('AssetValidator - Texture Rules', () => {
  let validator: AssetValidator;

  beforeEach(() => {
    validator = new AssetValidator();
  });

  it('should warn about non-power-of-two textures', () => {
    const asset = createTextureAsset({
      dimensions: { width: 1000, height: 1000 }, // Not POT
    });

    const result = validator.validate(asset);

    expect(result.issues.some((i) => i.code === 'NON_POT_TEXTURE')).toBe(true);
  });

  it('should not warn about power-of-two textures', () => {
    const asset = createTextureAsset({
      dimensions: { width: 1024, height: 512 },
    });

    const result = validator.validate(asset);

    expect(result.issues.some((i) => i.code === 'NON_POT_TEXTURE')).toBe(false);
  });

  it('should warn about very large textures (>4096)', () => {
    const asset = createTextureAsset({
      dimensions: { width: 8192, height: 8192 },
    });

    const result = validator.validate(asset);

    expect(result.issues.some((i) => i.code === 'LARGE_TEXTURE')).toBe(true);
  });

  it('should suggest compression for uncompressed textures', () => {
    const asset = createTextureAsset({
      format: 'png', // Uncompressed
    });

    const result = validator.validate(asset);

    expect(result.issues.some((i) => i.code === 'UNCOMPRESSED_TEXTURE')).toBe(true);
  });

  it('should not suggest compression for KTX2 textures', () => {
    const asset = createTextureAsset({
      format: 'ktx2',
    });

    const result = validator.validate(asset);

    expect(result.issues.some((i) => i.code === 'UNCOMPRESSED_TEXTURE')).toBe(false);
  });

  it('should not apply texture rules to models', () => {
    const asset = createModelAsset();

    const result = validator.validate(asset);

    expect(result.issues.some((i) => i.code === 'NON_POT_TEXTURE')).toBe(false);
    expect(result.issues.some((i) => i.code === 'UNCOMPRESSED_TEXTURE')).toBe(false);
  });
});

// ============================================================================
// Platform Compatibility Rules Tests
// ============================================================================

describe('AssetValidator - Platform Rules', () => {
  let validator: AssetValidator;

  beforeEach(() => {
    validator = new AssetValidator();
  });

  it('should warn when no platform is defined', () => {
    const asset = createValidAsset({
      platformCompatibility: {}, // No platforms
    });

    const result = validator.validate(asset);

    expect(result.issues.some((i) => i.code === 'NO_PLATFORM_DEFINED')).toBe(true);
  });

  it('should not warn when platforms are defined', () => {
    const asset = createValidAsset({
      platformCompatibility: { webgl: true },
    });

    const result = validator.validate(asset);

    expect(result.issues.some((i) => i.code === 'NO_PLATFORM_DEFINED')).toBe(false);
  });
});

// ============================================================================
// Dependency Rules Tests
// ============================================================================

describe('AssetValidator - Dependency Rules', () => {
  let validator: AssetValidator;

  beforeEach(() => {
    validator = new AssetValidator();
  });

  it('should error on required dependencies without fallback', () => {
    const asset = createValidAsset({
      dependencies: [{ assetId: 'missing-texture', type: 'texture', required: true }],
    });

    const result = validator.validate(asset);

    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === 'MISSING_DEPENDENCIES')).toBe(true);
  });

  it('should pass when required dependencies have fallbacks', () => {
    const asset = createValidAsset({
      dependencies: [
        { assetId: 'texture', type: 'texture', required: true, fallback: 'default-texture' },
      ],
    });

    const result = validator.validate(asset);

    expect(result.issues.some((i) => i.code === 'MISSING_DEPENDENCIES')).toBe(false);
  });

  it('should pass for optional dependencies without fallback', () => {
    const asset = createValidAsset({
      dependencies: [{ assetId: 'optional-texture', type: 'texture', required: false }],
    });

    const result = validator.validate(asset);

    expect(result.issues.some((i) => i.code === 'MISSING_DEPENDENCIES')).toBe(false);
  });
});

// ============================================================================
// Semantic Tags Rules Tests
// ============================================================================

describe('AssetValidator - Semantic Tags Rules', () => {
  let validator: AssetValidator;

  beforeEach(() => {
    validator = new AssetValidator();
  });

  it('should suggest adding tags when none exist', () => {
    const asset = createValidAsset({
      tags: [],
    });

    const result = validator.validate(asset);

    expect(result.issues.some((i) => i.code === 'NO_TAGS')).toBe(true);
    expect(result.issues.find((i) => i.code === 'NO_TAGS')?.severity).toBe('info');
  });

  it('should suggest adding semantic category when missing', () => {
    const asset = createValidAsset({
      semanticTags: {},
    });

    const result = validator.validate(asset);

    expect(result.issues.some((i) => i.code === 'NO_SEMANTIC_CATEGORY')).toBe(true);
  });

  it('should not suggest tags when they exist', () => {
    const asset = createValidAsset({
      tags: ['character', 'humanoid'],
      semanticTags: { category: 'character' },
    });

    const result = validator.validate(asset);

    expect(result.issues.some((i) => i.code === 'NO_TAGS')).toBe(false);
    expect(result.issues.some((i) => i.code === 'NO_SEMANTIC_CATEGORY')).toBe(false);
  });
});

// ============================================================================
// Custom Rules Tests
// ============================================================================

describe('AssetValidator - Custom Rules', () => {
  let validator: AssetValidator;

  beforeEach(() => {
    validator = new AssetValidator();
  });

  it('should add custom validation rule', () => {
    const customRule: ValidationRule = {
      id: 'custom-name-check',
      name: 'Custom Name Check',
      description: 'Names must not contain spaces',
      severity: 'error',
      appliesTo: 'all',
      validate: (asset) => {
        if (asset.name.includes(' ')) {
          return {
            code: 'NAME_HAS_SPACES',
            severity: 'error',
            message: 'Asset name contains spaces',
            field: 'name',
            autoFixable: true,
          };
        }
        return null;
      },
    };

    validator.addRule(customRule);

    const asset = createValidAsset({ name: 'my asset' });
    const result = validator.validate(asset);

    expect(result.issues.some((i) => i.code === 'NAME_HAS_SPACES')).toBe(true);
  });

  it('should remove rule by ID', () => {
    const initialRuleCount = validator.getRules().length;

    const removed = validator.removeRule('required-id');

    expect(removed).toBe(true);
    expect(validator.getRules().length).toBe(initialRuleCount - 1);

    // Validation should now pass without ID
    const asset = createValidAsset();
    (asset as any).id = '';
    const result = validator.validate(asset);

    expect(result.issues.some((i) => i.code === 'MISSING_ID')).toBe(false);
  });

  it('should return false when removing non-existent rule', () => {
    const removed = validator.removeRule('nonexistent-rule');
    expect(removed).toBe(false);
  });

  it('should get all rules', () => {
    const rules = validator.getRules();

    expect(Array.isArray(rules)).toBe(true);
    expect(rules.length).toBeGreaterThan(0);
    expect(rules[0]).toHaveProperty('id');
    expect(rules[0]).toHaveProperty('validate');
  });
});

// ============================================================================
// Validation Result Structure Tests
// ============================================================================

describe('AssetValidator - Validation Result', () => {
  let validator: AssetValidator;

  beforeEach(() => {
    validator = new AssetValidator();
  });

  it('should return correct result structure', () => {
    const asset = createValidAsset();
    const result = validator.validate(asset);

    expect(result).toHaveProperty('valid');
    expect(result).toHaveProperty('issues');
    expect(result).toHaveProperty('errorCount');
    expect(result).toHaveProperty('warningCount');
    expect(result).toHaveProperty('infoCount');
    expect(result).toHaveProperty('validatedAt');
    expect(result).toHaveProperty('optimizations');
  });

  it('should count issues by severity correctly', () => {
    const asset = createValidAsset({
      id: '', // Error
      fileSize: 15 * 1024 * 1024, // Warning
      tags: [], // Info
    });

    const result = validator.validate(asset);

    expect(result.errorCount).toBeGreaterThanOrEqual(1);
    expect(result.warningCount).toBeGreaterThanOrEqual(1);
    expect(result.infoCount).toBeGreaterThanOrEqual(1);
  });

  it('should set valid=false only when errors exist', () => {
    const validAsset = createValidAsset({
      tags: [], // Only info issue
    });

    const invalidAsset = createValidAsset({
      id: '', // Error
    });

    expect(validator.validate(validAsset).valid).toBe(true);
    expect(validator.validate(invalidAsset).valid).toBe(false);
  });

  it('should include timestamp in result', () => {
    const before = new Date().toISOString();
    const result = validator.validate(createValidAsset());
    const after = new Date().toISOString();

    expect(result.validatedAt).toBeDefined();
    expect(result.validatedAt >= before).toBe(true);
    expect(result.validatedAt <= after).toBe(true);
  });
});

// ============================================================================
// Optimization Suggestions Tests
// ============================================================================

describe('AssetValidator - Optimization Suggestions', () => {
  let validator: AssetValidator;

  beforeEach(() => {
    validator = new AssetValidator();
  });

  it('should suggest texture compression for uncompressed textures', () => {
    const asset = createTextureAsset({ format: 'png' });
    const result = validator.validate(asset);

    expect(result.optimizations.some((o) => o.type === 'texture_compression')).toBe(true);
  });

  it('should suggest LOD generation for large models', () => {
    const asset = createModelAsset({
      meshStats: {
        meshCount: 1,
        vertexCount: 100000,
        triangleCount: 60000,
      },
    });

    const result = validator.validate(asset);

    expect(result.optimizations.some((o) => o.type === 'lod_generation')).toBe(true);
  });

  it('should suggest mesh simplification for high poly models', () => {
    const asset = createModelAsset({
      meshStats: {
        meshCount: 1,
        vertexCount: 200000,
        triangleCount: 150000,
      },
      estimatedGPUMemory: 50000000,
    });

    const result = validator.validate(asset);

    expect(result.optimizations.some((o) => o.type === 'mesh_simplification')).toBe(true);
  });

  it('should suggest format conversion for large files', () => {
    const asset = createModelAsset({
      fileSize: 15 * 1024 * 1024,
    });

    const result = validator.validate(asset);

    expect(result.optimizations.some((o) => o.type === 'format_conversion')).toBe(true);
  });

  it('should include estimated improvements in optimizations', () => {
    const asset = createTextureAsset({ format: 'png' });
    const result = validator.validate(asset);

    const textureOpt = result.optimizations.find((o) => o.type === 'texture_compression');
    expect(textureOpt).toBeDefined();
    expect(textureOpt?.estimatedImprovement).toBeDefined();
    expect(textureOpt?.estimatedImprovement.memorySavings).toBeGreaterThan(0);
  });
});

// ============================================================================
// Batch Validation Tests
// ============================================================================

describe('AssetValidator - Batch Validation', () => {
  let validator: AssetValidator;

  beforeEach(() => {
    validator = new AssetValidator();
  });

  it('should validate multiple assets', () => {
    const assets = [
      createValidAsset({ id: 'asset-1' }),
      createValidAsset({ id: 'asset-2' }),
      createValidAsset({ id: 'asset-3', fileSize: 150 * 1024 * 1024 }), // Invalid
    ];

    const results = validator.validateAll(assets);

    expect(results.size).toBe(3);
    expect(results.get('asset-1')?.valid).toBe(true);
    expect(results.get('asset-2')?.valid).toBe(true);
    expect(results.get('asset-3')?.valid).toBe(false);
  });
});

// ============================================================================
// Platform Compatibility Check Tests
// ============================================================================

describe('AssetValidator - Platform Compatibility Check', () => {
  let validator: AssetValidator;

  beforeEach(() => {
    validator = new AssetValidator();
  });

  it('should check VR compatibility for large files', () => {
    const asset = createModelAsset({
      fileSize: 25 * 1024 * 1024, // 25MB
      platformCompatibility: { vr: true },
    });

    const result = validator.checkPlatformCompatibility(asset, 'vr');

    expect(result.compatible).toBe(false);
    expect(result.issues.some((i) => i.includes('File size'))).toBe(true);
  });

  it('should check VR compatibility for high poly models', () => {
    const asset = createModelAsset({
      meshStats: {
        meshCount: 1,
        vertexCount: 100000,
        triangleCount: 60000,
      },
      platformCompatibility: { vr: true },
    });

    const result = validator.checkPlatformCompatibility(asset, 'vr');

    expect(result.compatible).toBe(false);
    expect(result.issues.some((i) => i.includes('polygon'))).toBe(true);
  });

  it('should check mobile compatibility for large textures', () => {
    const asset = createTextureAsset({
      dimensions: { width: 4096, height: 4096 },
      platformCompatibility: { mobile: true },
    });

    const result = validator.checkPlatformCompatibility(asset, 'mobile');

    expect(result.compatible).toBe(false);
    expect(result.issues.some((i) => i.includes('texture'))).toBe(true);
  });

  it('should detect explicitly unsupported platforms', () => {
    const asset = createModelAsset({
      platformCompatibility: { webgpu: false },
    });

    const result = validator.checkPlatformCompatibility(asset, 'webgpu');

    expect(result.compatible).toBe(false);
    expect(result.issues.some((i) => i.includes('not supported'))).toBe(true);
  });

  it('should pass for compatible assets', () => {
    const asset = createModelAsset({
      fileSize: 1024 * 1024, // 1MB
      meshStats: {
        meshCount: 1,
        vertexCount: 5000,
        triangleCount: 10000,
      },
      platformCompatibility: { vr: true, desktop: true },
    });

    const vrResult = validator.checkPlatformCompatibility(asset, 'vr');
    const desktopResult = validator.checkPlatformCompatibility(asset, 'desktop');

    expect(vrResult.compatible).toBe(true);
    expect(desktopResult.compatible).toBe(true);
  });
});

// ============================================================================
// Convenience Function Tests
// ============================================================================

describe('AssetValidator - Convenience Functions', () => {
  it('should validate using validateAsset function', () => {
    const asset = createValidAsset();
    const result = validateAsset(asset);

    expect(result).toHaveProperty('valid');
    expect(result).toHaveProperty('issues');
  });

  it('should check validity using isAssetValid function', () => {
    const validAsset = createValidAsset();
    const invalidAsset = createValidAsset({ id: '' });

    expect(isAssetValid(validAsset)).toBe(true);
    expect(isAssetValid(invalidAsset)).toBe(false);
  });
});

// ============================================================================
// Issue Structure Tests
// ============================================================================

describe('AssetValidator - Issue Structure', () => {
  let validator: AssetValidator;

  beforeEach(() => {
    validator = new AssetValidator();
  });

  it('should include all required issue fields', () => {
    const asset = createValidAsset({ id: '' });
    const result = validator.validate(asset);

    const issue = result.issues.find((i) => i.code === 'MISSING_ID');

    expect(issue).toBeDefined();
    expect(issue).toHaveProperty('code');
    expect(issue).toHaveProperty('severity');
    expect(issue).toHaveProperty('message');
    expect(issue).toHaveProperty('autoFixable');
  });

  it('should include field path when applicable', () => {
    const asset = createValidAsset({ id: '' });
    const result = validator.validate(asset);

    const issue = result.issues.find((i) => i.code === 'MISSING_ID');

    expect(issue?.field).toBe('id');
  });

  it('should include suggestion when applicable', () => {
    const asset = createTextureAsset({
      dimensions: { width: 1000, height: 1000 },
    });

    const result = validator.validate(asset);
    const issue = result.issues.find((i) => i.code === 'NON_POT_TEXTURE');

    expect(issue?.suggestion).toBeDefined();
    expect(issue?.suggestion).toContain('power-of-two');
  });
});
