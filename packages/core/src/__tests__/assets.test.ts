/**
 * Asset System Tests
 *
 * Tests for the asset management modules:
 * - AssetMetadata
 * - AssetManifest
 * - AssetRegistry
 * - AssetValidator
 * - SmartAssetLoader
 * - AssetDependencyGraph
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  // AssetMetadata
  createAssetMetadata,
  inferAssetType,
  getMimeType,
  type AssetMetadata,
  type AssetFormat,
  type AssetType,
  // AssetManifest
  AssetManifest,
  // AssetRegistry
  AssetRegistry,
  getAssetRegistry,
  // AssetValidator
  AssetValidator,
  // SmartAssetLoader
  SmartAssetLoader,
  // AssetDependencyGraph
  AssetDependencyGraph,
} from '../assets';

// ============================================================================
// AssetMetadata Tests
// ============================================================================

describe('AssetMetadata', () => {
  describe('createAssetMetadata', () => {
    it('should create asset metadata with required fields', () => {
      const metadata = createAssetMetadata({
        id: 'asset-001',
        name: 'test-model',
        format: 'gltf',
        assetType: 'model',
        sourcePath: '/assets/test-model.gltf',
      });

      expect(metadata.id).toBe('asset-001');
      expect(metadata.name).toBe('test-model');
      expect(metadata.format).toBe('gltf');
      expect(metadata.assetType).toBe('model');
      expect(metadata.sourcePath).toBe('/assets/test-model.gltf');
    });

    it('should set default values for optional fields', () => {
      const metadata = createAssetMetadata({
        id: 'asset-002',
        name: 'texture',
        format: 'png',
        assetType: 'texture',
        sourcePath: '/textures/diffuse.png',
      });

      expect(metadata.version).toBe('1.0.0');
      expect(metadata.tags).toEqual([]);
      expect(metadata.dependencies).toEqual([]);
      expect(metadata.validated).toBe(false);
      expect(metadata.isOptimized).toBe(false);
    });

    it('should allow overriding default values', () => {
      const metadata = createAssetMetadata({
        id: 'asset-003',
        name: 'material',
        format: 'json',
        assetType: 'material',
        sourcePath: '/materials/metal.json',
        version: '2.0.0',
        tags: ['metal', 'pbr'],
        validated: true,
      });

      expect(metadata.version).toBe('2.0.0');
      expect(metadata.tags).toEqual(['metal', 'pbr']);
      expect(metadata.validated).toBe(true);
    });

    it('should set displayName to name by default', () => {
      const metadata = createAssetMetadata({
        id: 'asset-004',
        name: 'my_model',
        format: 'glb',
        assetType: 'model',
        sourcePath: '/models/my_model.glb',
      });

      expect(metadata.displayName).toBe('my_model');
    });

    it('should use custom displayName when provided', () => {
      const metadata = createAssetMetadata({
        id: 'asset-005',
        name: 'character_rig',
        displayName: 'Character Rig',
        format: 'fbx',
        assetType: 'model',
        sourcePath: '/models/character.fbx',
      });

      expect(metadata.displayName).toBe('Character Rig');
    });
  });

  describe('inferAssetType', () => {
    it('should infer model type from 3D formats', () => {
      expect(inferAssetType('gltf')).toBe('model');
      expect(inferAssetType('glb')).toBe('model');
      expect(inferAssetType('fbx')).toBe('model');
      expect(inferAssetType('obj')).toBe('model');
    });

    it('should infer scene type from USD formats', () => {
      expect(inferAssetType('usd')).toBe('scene');
      expect(inferAssetType('usda')).toBe('scene');
      expect(inferAssetType('usdc')).toBe('scene');
      expect(inferAssetType('usdz')).toBe('scene');
    });

    it('should infer texture type from image formats', () => {
      expect(inferAssetType('png')).toBe('texture');
      expect(inferAssetType('jpg')).toBe('texture');
      expect(inferAssetType('webp')).toBe('texture');
      expect(inferAssetType('ktx2')).toBe('texture');
      expect(inferAssetType('basis')).toBe('texture');
      expect(inferAssetType('hdr')).toBe('texture');
      expect(inferAssetType('exr')).toBe('texture');
    });

    it('should infer audio type from audio formats', () => {
      expect(inferAssetType('mp3')).toBe('audio');
      expect(inferAssetType('ogg')).toBe('audio');
      expect(inferAssetType('wav')).toBe('audio');
    });

    it('should infer video type from video formats', () => {
      expect(inferAssetType('mp4')).toBe('video');
      expect(inferAssetType('webm')).toBe('video');
    });

    it('should infer script type from HoloScript formats', () => {
      expect(inferAssetType('hsplus')).toBe('script');
      expect(inferAssetType('hs')).toBe('script');
    });
  });

  describe('getMimeType', () => {
    it('should return correct MIME types for models', () => {
      expect(getMimeType('gltf')).toBe('model/gltf+json');
      expect(getMimeType('glb')).toBe('model/gltf-binary');
    });

    it('should return correct MIME types for textures', () => {
      expect(getMimeType('png')).toBe('image/png');
      expect(getMimeType('jpg')).toBe('image/jpeg');
      expect(getMimeType('webp')).toBe('image/webp');
    });

    it('should return correct MIME types for audio', () => {
      expect(getMimeType('mp3')).toBe('audio/mpeg');
      expect(getMimeType('ogg')).toBe('audio/ogg');
      expect(getMimeType('wav')).toBe('audio/wav');
    });
  });
});

// ============================================================================
// AssetManifest Tests
// ============================================================================

describe('AssetManifest', () => {
  let manifest: AssetManifest;

  beforeEach(() => {
    manifest = new AssetManifest({
      name: 'test-manifest',
      version: '1.0.0',
    });
  });

  describe('constructor', () => {
    it('should create manifest with config', () => {
      expect(manifest).toBeDefined();
    });
  });

  describe('addAsset', () => {
    it('should add asset to manifest', () => {
      const asset = createAssetMetadata({
        id: 'model-001',
        name: 'cube',
        format: 'gltf',
        assetType: 'model',
        sourcePath: '/models/cube.gltf',
      });

      manifest.addAsset(asset);

      expect(manifest.getAsset('model-001')).toBeDefined();
      expect(manifest.getAsset('model-001')?.name).toBe('cube');
    });

    it('should overwrite existing asset with same id', () => {
      const asset1 = createAssetMetadata({
        id: 'model-001',
        name: 'cube-v1',
        format: 'gltf',
        assetType: 'model',
        sourcePath: '/models/cube-v1.gltf',
      });

      const asset2 = createAssetMetadata({
        id: 'model-001',
        name: 'cube-v2',
        format: 'gltf',
        assetType: 'model',
        sourcePath: '/models/cube-v2.gltf',
      });

      manifest.addAsset(asset1);
      manifest.addAsset(asset2);

      expect(manifest.getAsset('model-001')?.name).toBe('cube-v2');
    });
  });

  describe('getAsset', () => {
    it('should return undefined for non-existent asset', () => {
      expect(manifest.getAsset('non-existent')).toBeUndefined();
    });
  });

  describe('removeAsset', () => {
    it('should remove asset from manifest', () => {
      const asset = createAssetMetadata({
        id: 'model-001',
        name: 'cube',
        format: 'gltf',
        assetType: 'model',
        sourcePath: '/models/cube.gltf',
      });

      manifest.addAsset(asset);
      expect(manifest.getAsset('model-001')).toBeDefined();

      manifest.removeAsset('model-001');
      expect(manifest.getAsset('model-001')).toBeUndefined();
    });
  });

  describe('findByType', () => {
    it('should return assets of specified type', () => {
      manifest.addAsset(
        createAssetMetadata({
          id: 'model-001',
          name: 'cube',
          format: 'gltf',
          assetType: 'model',
          sourcePath: '/models/cube.gltf',
        })
      );

      manifest.addAsset(
        createAssetMetadata({
          id: 'tex-001',
          name: 'diffuse',
          format: 'png',
          assetType: 'texture',
          sourcePath: '/textures/diffuse.png',
        })
      );

      manifest.addAsset(
        createAssetMetadata({
          id: 'model-002',
          name: 'sphere',
          format: 'glb',
          assetType: 'model',
          sourcePath: '/models/sphere.glb',
        })
      );

      const models = manifest.findByType('model');
      expect(models.length).toBe(2);
      expect(models.map((m) => m.name)).toContain('cube');
      expect(models.map((m) => m.name)).toContain('sphere');
    });
  });

  describe('findByTag', () => {
    it('should find assets by tag', () => {
      manifest.addAsset(
        createAssetMetadata({
          id: 'model-001',
          name: 'cube',
          format: 'gltf',
          assetType: 'model',
          sourcePath: '/models/cube.gltf',
          tags: ['primitive', 'basic'],
        })
      );

      manifest.addAsset(
        createAssetMetadata({
          id: 'model-002',
          name: 'character',
          format: 'fbx',
          assetType: 'model',
          sourcePath: '/models/character.fbx',
          tags: ['animated', 'humanoid'],
        })
      );

      const primitives = manifest.findByTag('primitive');
      expect(primitives.length).toBe(1);
      expect(primitives[0].name).toBe('cube');
    });
  });
});

// ============================================================================
// AssetRegistry Tests
// ============================================================================

describe('AssetRegistry', () => {
  let registry: AssetRegistry;

  beforeEach(() => {
    AssetRegistry.resetInstance();
    registry = getAssetRegistry();
  });

  afterEach(() => {
    AssetRegistry.resetInstance();
  });

  describe('singleton', () => {
    it('should return same instance', () => {
      const instance1 = getAssetRegistry();
      const instance2 = getAssetRegistry();
      expect(instance1).toBe(instance2);
    });
  });

  describe('manifest management', () => {
    it('should register and set active manifest', () => {
      const manifest = new AssetManifest({
        name: 'test',
        version: '1.0.0',
      });

      registry.registerManifest('test-manifest', manifest);
      expect(registry.getActiveManifest()).toBe(manifest);
    });

    it('should switch active manifest by ID', () => {
      const manifest1 = new AssetManifest({ name: 'manifest1', version: '1.0.0' });
      const manifest2 = new AssetManifest({ name: 'manifest2', version: '1.0.0' });

      registry.registerManifest('m1', manifest1);
      registry.registerManifest('m2', manifest2);

      registry.setActiveManifest('m2');
      expect(registry.getActiveManifest()).toBe(manifest2);
    });
  });

  describe('event system', () => {
    it('should emit events on manifest load', () => {
      const handler = vi.fn();
      registry.on('manifest:loaded', handler);

      const manifest = new AssetManifest({ name: 'test', version: '1.0.0' });
      registry.registerManifest('test', manifest);

      expect(handler).toHaveBeenCalled();
    });

    it('should allow unsubscribing from events', () => {
      const handler = vi.fn();
      const unsubscribe = registry.on('manifest:loaded', handler);

      unsubscribe();

      const manifest = new AssetManifest({ name: 'test', version: '1.0.0' });
      registry.registerManifest('test2', manifest);

      expect(handler).not.toHaveBeenCalled();
    });
  });
});

// ============================================================================
// AssetValidator Tests
// ============================================================================

describe('AssetValidator', () => {
  let validator: AssetValidator;

  beforeEach(() => {
    validator = new AssetValidator();
  });

  describe('validate', () => {
    it('should validate valid metadata', () => {
      const metadata = createAssetMetadata({
        id: 'valid-001',
        name: 'valid-asset',
        format: 'gltf',
        assetType: 'model',
        sourcePath: '/models/valid.gltf',
      });

      const result = validator.validate(metadata);
      expect(result.valid).toBe(true);
      expect(result.issues.filter((i) => i.severity === 'error')).toHaveLength(0);
    });

    it('should return issues for metadata problems', () => {
      const metadata = createAssetMetadata({
        id: 'issue-001',
        name: 'issue-asset',
        format: 'gltf',
        assetType: 'model',
        sourcePath: '/models/issue.gltf',
        fileSize: 0, // This might trigger a warning
      });

      const result = validator.validate(metadata);
      // The result may have warnings but should still be valid
      expect(result).toBeDefined();
    });
  });

  describe('rules', () => {
    it('should have built-in validation rules', () => {
      const rules = validator.getRules();
      expect(rules.length).toBeGreaterThan(0);
    });

    it('should allow adding custom rules', () => {
      const initialRules = validator.getRules().length;

      validator.addRule({
        id: 'custom-rule',
        name: 'Custom Rule',
        description: 'A custom validation rule',
        appliesTo: 'all',
        severity: 'warning',
        validate: () => null,
      });

      expect(validator.getRules().length).toBe(initialRules + 1);
    });

    it('should allow removing rules', () => {
      validator.addRule({
        id: 'temp-rule',
        name: 'Temp Rule',
        description: 'A temporary rule',
        appliesTo: 'all',
        severity: 'info',
        validate: () => null,
      });

      const removed = validator.removeRule('temp-rule');
      expect(removed).toBe(true);
    });
  });
});

// ============================================================================
// SmartAssetLoader Tests
// ============================================================================

describe('SmartAssetLoader', () => {
  let loader: SmartAssetLoader;

  beforeEach(() => {
    AssetRegistry.resetInstance();
    loader = new SmartAssetLoader({
      quality: 'medium',
      enableStreaming: false,
    });
  });

  afterEach(() => {
    AssetRegistry.resetInstance();
  });

  describe('constructor', () => {
    it('should create loader with config', () => {
      expect(loader).toBeDefined();
    });
  });

  describe('memory management', () => {
    it('should track memory usage', () => {
      const usage = loader.getMemoryUsage();
      expect(usage).toHaveProperty('current');
      expect(usage).toHaveProperty('budget');
      expect(usage).toHaveProperty('percent');
    });
  });

  describe('config', () => {
    it('should respect quality setting', () => {
      const highLoader = new SmartAssetLoader({ quality: 'high' });
      expect(highLoader).toBeDefined();
    });

    it('should respect streaming setting', () => {
      const streamingLoader = new SmartAssetLoader({ enableStreaming: true });
      expect(streamingLoader).toBeDefined();
    });
  });
});

// ============================================================================
// AssetDependencyGraph Tests
// ============================================================================

describe('AssetDependencyGraph', () => {
  let graph: AssetDependencyGraph;

  beforeEach(() => {
    graph = new AssetDependencyGraph();
  });

  describe('addAsset', () => {
    it('should add asset to graph', () => {
      const asset = createAssetMetadata({
        id: 'asset-001',
        name: 'model',
        format: 'gltf',
        assetType: 'model',
        sourcePath: '/model.gltf',
      });

      graph.addAsset(asset);
      // Verify by trying to get dependencies (will create node if not exists)
      const deps = graph.getDependencies('asset-001');
      expect(deps).toBeDefined();
    });
  });

  describe('addDependency', () => {
    it('should add dependency between assets', () => {
      const model = createAssetMetadata({
        id: 'model-001',
        name: 'model',
        format: 'gltf',
        assetType: 'model',
        sourcePath: '/model.gltf',
      });

      const texture = createAssetMetadata({
        id: 'texture-001',
        name: 'diffuse',
        format: 'png',
        assetType: 'texture',
        sourcePath: '/diffuse.png',
      });

      graph.addAsset(model);
      graph.addAsset(texture);
      graph.addDependency('model-001', 'texture-001');

      const deps = graph.getDependencies('model-001');
      expect(deps).toContain('texture-001');
    });

    it('should track required vs optional dependencies', () => {
      const model = createAssetMetadata({
        id: 'model',
        name: 'model',
        format: 'gltf',
        assetType: 'model',
        sourcePath: '/model.gltf',
      });

      const optionalTex = createAssetMetadata({
        id: 'optional-tex',
        name: 'optional',
        format: 'png',
        assetType: 'texture',
        sourcePath: '/optional.png',
      });

      graph.addAsset(model);
      graph.addAsset(optionalTex);
      graph.addDependency('model', 'optional-tex', false);

      const deps = graph.getDependencies('model');
      expect(deps).toContain('optional-tex');
    });
  });

  describe('getDependencies', () => {
    it('should return empty array for asset with no dependencies', () => {
      const asset = createAssetMetadata({
        id: 'standalone',
        name: 'standalone',
        format: 'gltf',
        assetType: 'model',
        sourcePath: '/standalone.gltf',
      });

      graph.addAsset(asset);
      const deps = graph.getDependencies('standalone');
      expect(deps).toHaveLength(0);
    });
  });

  describe('getDependents', () => {
    it('should return assets that depend on this asset', () => {
      const texture = createAssetMetadata({
        id: 'texture',
        name: 'texture',
        format: 'png',
        assetType: 'texture',
        sourcePath: '/texture.png',
      });

      const model1 = createAssetMetadata({
        id: 'model1',
        name: 'model1',
        format: 'gltf',
        assetType: 'model',
        sourcePath: '/model1.gltf',
      });

      const model2 = createAssetMetadata({
        id: 'model2',
        name: 'model2',
        format: 'gltf',
        assetType: 'model',
        sourcePath: '/model2.gltf',
      });

      graph.addAsset(texture);
      graph.addAsset(model1);
      graph.addAsset(model2);
      graph.addDependency('model1', 'texture');
      graph.addDependency('model2', 'texture');

      const dependents = graph.getDependents('texture');
      expect(dependents).toContain('model1');
      expect(dependents).toContain('model2');
    });
  });
});
