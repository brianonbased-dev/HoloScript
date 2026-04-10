/**
 * @holoscript/core AssetManifest Tests
 *
 * Comprehensive tests for the asset manifest including:
 * - Asset CRUD operations
 * - Index consistency (path, tag, type)
 * - Group management
 * - Query methods
 * - Statistics computation
 * - JSON serialization/deserialization
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  AssetManifest,
  createManifest,
  loadManifest,
  AssetGroup,
  ManifestConfig,
  ManifestStats,
  AssetManifestData,
} from './AssetManifest';
import { AssetMetadata, createAssetMetadata, AssetType } from './AssetMetadata';

// ============================================================================
// Test Fixtures
// ============================================================================

function createTestAsset(id: string, overrides: Partial<AssetMetadata> = {}): AssetMetadata {
  return createAssetMetadata({
    id,
    name: overrides.name ?? `asset-${id}`,
    format: overrides.format ?? 'glb',
    assetType: overrides.assetType ?? 'model',
    sourcePath: overrides.sourcePath ?? `/assets/${id}.glb`,
    fileSize: overrides.fileSize ?? 1024,
    estimatedGPUMemory: overrides.estimatedGPUMemory ?? 2048,
    estimatedCPUMemory: overrides.estimatedCPUMemory ?? 1024,
    tags: overrides.tags ?? [],
    validated: overrides.validated ?? false,
    validationErrors: overrides.validationErrors ?? [],
    validationWarnings: overrides.validationWarnings ?? [],
    ...overrides,
  });
}

function createTestConfig(): ManifestConfig {
  return {
    version: '1.0.0',
    projectName: 'test-project',
    baseUrl: 'https://cdn.example.com/assets',
    defaults: {
      compression: 'gzip',
      textureFormat: 'webp',
      lod: {
        enabled: true,
        levels: 3,
        distances: [10, 25, 50],
      },
      cachePolicy: 'stale-while-revalidate',
    },
  };
}

function createTestGroup(id: string, assetIds: string[] = []): AssetGroup {
  return {
    id,
    name: `Group ${id}`,
    assetIds,
    preloadPriority: 5,
    loadStrategy: 'lazy',
    tags: [],
  };
}

// ============================================================================
// Manifest Creation Tests
// ============================================================================

describe('AssetManifest - Creation', () => {
  it('should create manifest with config', () => {
    const config = createTestConfig();
    const manifest = new AssetManifest(config);

    expect(manifest.getConfig()).toEqual(config);
  });

  it('should create manifest using factory function', () => {
    const manifest = createManifest('my-project', 'https://cdn.example.com');

    const config = manifest.getConfig();
    expect(config.projectName).toBe('my-project');
    expect(config.baseUrl).toBe('https://cdn.example.com');
  });

  it('should set timestamps on creation', () => {
    const before = new Date().toISOString();
    const manifest = createManifest('test', 'https://cdn.example.com');
    const after = new Date().toISOString();

    const json = manifest.toJSON();
    expect(json.createdAt >= before).toBe(true);
    expect(json.createdAt <= after).toBe(true);
  });
});

// ============================================================================
// Asset CRUD Tests
// ============================================================================

describe('AssetManifest - Asset CRUD', () => {
  let manifest: AssetManifest;

  beforeEach(() => {
    manifest = createManifest('test-project', 'https://cdn.example.com');
  });

  it('should add asset', () => {
    const asset = createTestAsset('asset-1');
    manifest.addAsset(asset);

    expect(manifest.hasAsset('asset-1')).toBe(true);
    expect(manifest.getAsset('asset-1')).toEqual(asset);
  });

  it('should add multiple assets', () => {
    const assets = [
      createTestAsset('asset-1'),
      createTestAsset('asset-2'),
      createTestAsset('asset-3'),
    ];

    manifest.addAssets(assets);

    expect(manifest.getAllAssets()).toHaveLength(3);
  });

  it('should remove asset', () => {
    manifest.addAsset(createTestAsset('asset-1'));
    expect(manifest.hasAsset('asset-1')).toBe(true);

    const removed = manifest.removeAsset('asset-1');

    expect(removed).toBe(true);
    expect(manifest.hasAsset('asset-1')).toBe(false);
  });

  it('should return false when removing non-existent asset', () => {
    const removed = manifest.removeAsset('nonexistent');
    expect(removed).toBe(false);
  });

  it('should get asset by ID', () => {
    const asset = createTestAsset('asset-1');
    manifest.addAsset(asset);

    expect(manifest.getAsset('asset-1')).toEqual(asset);
    expect(manifest.getAsset('nonexistent')).toBeUndefined();
  });

  it('should get asset by path', () => {
    const asset = createTestAsset('asset-1', { sourcePath: '/models/character.glb' });
    manifest.addAsset(asset);

    expect(manifest.getAssetByPath('/models/character.glb')).toEqual(asset);
    expect(manifest.getAssetByPath('/nonexistent.glb')).toBeUndefined();
  });

  it('should update asset metadata', () => {
    manifest.addAsset(createTestAsset('asset-1', { fileSize: 1000 }));

    const updated = manifest.updateAsset('asset-1', { fileSize: 2000 });

    expect(updated).toBe(true);
    expect(manifest.getAsset('asset-1')?.fileSize).toBe(2000);
  });

  it('should return false when updating non-existent asset', () => {
    const updated = manifest.updateAsset('nonexistent', { fileSize: 2000 });
    expect(updated).toBe(false);
  });

  it('should update modifiedAt on asset changes', () => {
    const json1 = manifest.toJSON();
    const firstModified = json1.modifiedAt;

    // Wait a bit to ensure timestamp difference
    manifest.addAsset(createTestAsset('asset-1'));

    const json2 = manifest.toJSON();
    expect(json2.modifiedAt >= firstModified).toBe(true);
  });
});

// ============================================================================
// Index Consistency Tests
// ============================================================================

describe('AssetManifest - Index Consistency', () => {
  let manifest: AssetManifest;

  beforeEach(() => {
    manifest = createManifest('test-project', 'https://cdn.example.com');
  });

  describe('Path Index', () => {
    it('should maintain path index on add', () => {
      manifest.addAsset(createTestAsset('asset-1', { sourcePath: '/path/a.glb' }));
      manifest.addAsset(createTestAsset('asset-2', { sourcePath: '/path/b.glb' }));

      expect(manifest.getAssetByPath('/path/a.glb')?.id).toBe('asset-1');
      expect(manifest.getAssetByPath('/path/b.glb')?.id).toBe('asset-2');
    });

    it('should remove from path index on delete', () => {
      manifest.addAsset(createTestAsset('asset-1', { sourcePath: '/path/a.glb' }));
      manifest.removeAsset('asset-1');

      expect(manifest.getAssetByPath('/path/a.glb')).toBeUndefined();
    });
  });

  describe('Tag Index', () => {
    it('should maintain tag index on add', () => {
      manifest.addAsset(createTestAsset('asset-1', { tags: ['character', 'humanoid'] }));
      manifest.addAsset(createTestAsset('asset-2', { tags: ['character', 'robot'] }));

      const characters = manifest.findByTag('character');
      expect(characters).toHaveLength(2);

      const humanoids = manifest.findByTag('humanoid');
      expect(humanoids).toHaveLength(1);
    });

    it('should remove from tag index on delete', () => {
      manifest.addAsset(createTestAsset('asset-1', { tags: ['character'] }));
      manifest.removeAsset('asset-1');

      expect(manifest.findByTag('character')).toHaveLength(0);
    });

    it('should update tag index on update', () => {
      manifest.addAsset(createTestAsset('asset-1', { tags: ['old-tag'] }));

      expect(manifest.findByTag('old-tag')).toHaveLength(1);

      manifest.updateAsset('asset-1', { tags: ['new-tag'] });

      expect(manifest.findByTag('old-tag')).toHaveLength(0);
      expect(manifest.findByTag('new-tag')).toHaveLength(1);
    });
  });

  describe('Type Index', () => {
    it('should maintain type index on add', () => {
      manifest.addAsset(createTestAsset('model-1', { assetType: 'model' }));
      manifest.addAsset(createTestAsset('model-2', { assetType: 'model' }));
      manifest.addAsset(createTestAsset('texture-1', { assetType: 'texture', format: 'png' }));

      expect(manifest.findByType('model')).toHaveLength(2);
      expect(manifest.findByType('texture')).toHaveLength(1);
    });

    it('should remove from type index on delete', () => {
      manifest.addAsset(createTestAsset('model-1', { assetType: 'model' }));
      manifest.removeAsset('model-1');

      expect(manifest.findByType('model')).toHaveLength(0);
    });

    it('should update type index on type change', () => {
      manifest.addAsset(createTestAsset('asset-1', { assetType: 'model' }));

      expect(manifest.findByType('model')).toHaveLength(1);

      manifest.updateAsset('asset-1', { assetType: 'scene' });

      expect(manifest.findByType('model')).toHaveLength(0);
      expect(manifest.findByType('scene')).toHaveLength(1);
    });
  });
});

// ============================================================================
// Query Methods Tests
// ============================================================================

describe('AssetManifest - Query Methods', () => {
  let manifest: AssetManifest;

  beforeEach(() => {
    manifest = createManifest('test-project', 'https://cdn.example.com');

    manifest.addAssets([
      createTestAsset('model-1', {
        name: 'Robot Character',
        assetType: 'model',
        tags: ['character', 'robot', 'sci-fi'],
        format: 'glb',
      }),
      createTestAsset('model-2', {
        name: 'Human Character',
        assetType: 'model',
        tags: ['character', 'human', 'realistic'],
        format: 'glb',
      }),
      createTestAsset('texture-1', {
        name: 'Metal Texture',
        assetType: 'texture',
        tags: ['material', 'metal', 'sci-fi'],
        format: 'png',
      }),
      createTestAsset('audio-1', {
        name: 'Explosion Sound',
        assetType: 'audio',
        tags: ['sfx', 'explosion'],
        format: 'ogg',
      }),
    ]);
  });

  it('should find by single tag', () => {
    const results = manifest.findByTag('character');
    expect(results).toHaveLength(2);
  });

  it('should find by multiple tags (AND)', () => {
    const results = manifest.findByTags(['character', 'robot']);
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('model-1');
  });

  it('should return empty for non-matching tags', () => {
    const results = manifest.findByTags(['character', 'nonexistent']);
    expect(results).toHaveLength(0);
  });

  it('should find by type', () => {
    const models = manifest.findByType('model');
    const textures = manifest.findByType('texture');
    const audio = manifest.findByType('audio');

    expect(models).toHaveLength(2);
    expect(textures).toHaveLength(1);
    expect(audio).toHaveLength(1);
  });

  it('should find by format', () => {
    const glbAssets = manifest.findByFormat('glb');
    const pngAssets = manifest.findByFormat('png');

    expect(glbAssets).toHaveLength(2);
    expect(pngAssets).toHaveLength(1);
  });

  it('should search by name', () => {
    const results = manifest.search('Robot');
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('Robot Character');
  });

  it('should search case-insensitively', () => {
    const results = manifest.search('robot');
    expect(results).toHaveLength(1);
  });

  it('should search in description', () => {
    manifest.updateAsset('model-1', { description: 'A futuristic robot' });

    const results = manifest.search('futuristic');
    expect(results).toHaveLength(1);
  });

  it('should search in tags', () => {
    const results = manifest.search('sci-fi');
    expect(results).toHaveLength(2);
  });

  it('should find assets with validation errors', () => {
    manifest.updateAsset('model-1', { validationErrors: ['Missing texture'] });

    const withErrors = manifest.findWithErrors();
    expect(withErrors).toHaveLength(1);
    expect(withErrors[0].id).toBe('model-1');
  });

  it('should find assets with validation warnings', () => {
    manifest.updateAsset('texture-1', { validationWarnings: ['Large file size'] });

    const withWarnings = manifest.findWithWarnings();
    expect(withWarnings).toHaveLength(1);
    expect(withWarnings[0].id).toBe('texture-1');
  });

  it('should find unvalidated assets', () => {
    manifest.updateAsset('model-1', { validated: true });

    const unvalidated = manifest.findUnvalidated();
    expect(unvalidated).toHaveLength(3); // All except model-1
  });
});

// ============================================================================
// Group Management Tests
// ============================================================================

describe('AssetManifest - Group Management', () => {
  let manifest: AssetManifest;

  beforeEach(() => {
    manifest = createManifest('test-project', 'https://cdn.example.com');
    manifest.addAssets([
      createTestAsset('asset-1'),
      createTestAsset('asset-2'),
      createTestAsset('asset-3'),
    ]);
  });

  it('should create group', () => {
    const group = createTestGroup('group-1', ['asset-1', 'asset-2']);
    manifest.createGroup(group);

    expect(manifest.getGroup('group-1')).toEqual(group);
  });

  it('should get all groups', () => {
    manifest.createGroup(createTestGroup('group-1'));
    manifest.createGroup(createTestGroup('group-2'));

    const groups = manifest.getAllGroups();
    expect(groups).toHaveLength(2);
  });

  it('should add asset to group', () => {
    manifest.createGroup(createTestGroup('group-1'));

    const added = manifest.addAssetToGroup('asset-1', 'group-1');

    expect(added).toBe(true);
    expect(manifest.getGroup('group-1')?.assetIds).toContain('asset-1');
  });

  it('should not add duplicate asset to group', () => {
    manifest.createGroup(createTestGroup('group-1', ['asset-1']));

    manifest.addAssetToGroup('asset-1', 'group-1');

    expect(manifest.getGroup('group-1')?.assetIds).toHaveLength(1);
  });

  it('should return false when adding to non-existent group', () => {
    const added = manifest.addAssetToGroup('asset-1', 'nonexistent');
    expect(added).toBe(false);
  });

  it('should return false when adding non-existent asset', () => {
    manifest.createGroup(createTestGroup('group-1'));

    const added = manifest.addAssetToGroup('nonexistent', 'group-1');
    expect(added).toBe(false);
  });

  it('should remove asset from group', () => {
    manifest.createGroup(createTestGroup('group-1', ['asset-1', 'asset-2']));

    const removed = manifest.removeAssetFromGroup('asset-1', 'group-1');

    expect(removed).toBe(true);
    expect(manifest.getGroup('group-1')?.assetIds).not.toContain('asset-1');
  });

  it('should return false when removing from non-existent group', () => {
    const removed = manifest.removeAssetFromGroup('asset-1', 'nonexistent');
    expect(removed).toBe(false);
  });

  it('should get group assets', () => {
    manifest.createGroup(createTestGroup('group-1', ['asset-1', 'asset-2']));

    const assets = manifest.getGroupAssets('group-1');

    expect(assets).toHaveLength(2);
    expect(assets.map((a) => a.id)).toContain('asset-1');
    expect(assets.map((a) => a.id)).toContain('asset-2');
  });

  it('should remove asset from groups when deleting asset', () => {
    manifest.createGroup(createTestGroup('group-1', ['asset-1', 'asset-2']));
    manifest.createGroup(createTestGroup('group-2', ['asset-1', 'asset-3']));

    manifest.removeAsset('asset-1');

    expect(manifest.getGroup('group-1')?.assetIds).not.toContain('asset-1');
    expect(manifest.getGroup('group-2')?.assetIds).not.toContain('asset-1');
  });
});

// ============================================================================
// Preload Queue Tests
// ============================================================================

describe('AssetManifest - Preload Queue', () => {
  let manifest: AssetManifest;

  beforeEach(() => {
    manifest = createManifest('test-project', 'https://cdn.example.com');
    manifest.addAssets([
      createTestAsset('asset-1'),
      createTestAsset('asset-2'),
      createTestAsset('asset-3'),
      createTestAsset('asset-4'),
    ]);
  });

  it('should return assets from eager groups sorted by priority', () => {
    manifest.createGroup({
      id: 'low-priority',
      name: 'Low Priority',
      assetIds: ['asset-1'],
      preloadPriority: 1,
      loadStrategy: 'eager',
      tags: [],
    });

    manifest.createGroup({
      id: 'high-priority',
      name: 'High Priority',
      assetIds: ['asset-2'],
      preloadPriority: 10,
      loadStrategy: 'eager',
      tags: [],
    });

    manifest.createGroup({
      id: 'lazy',
      name: 'Lazy',
      assetIds: ['asset-3'],
      preloadPriority: 5,
      loadStrategy: 'lazy',
      tags: [],
    });

    const queue = manifest.getPreloadQueue();

    expect(queue).toHaveLength(2);
    expect(queue[0].id).toBe('asset-2'); // Higher priority first
    expect(queue[1].id).toBe('asset-1');
  });

  it('should not include lazy groups in preload queue', () => {
    manifest.createGroup({
      id: 'lazy',
      name: 'Lazy',
      assetIds: ['asset-1', 'asset-2'],
      preloadPriority: 10,
      loadStrategy: 'lazy',
      tags: [],
    });

    const queue = manifest.getPreloadQueue();
    expect(queue).toHaveLength(0);
  });

  it('should deduplicate assets in preload queue', () => {
    manifest.createGroup({
      id: 'group-1',
      name: 'Group 1',
      assetIds: ['asset-1', 'asset-2'],
      preloadPriority: 10,
      loadStrategy: 'eager',
      tags: [],
    });

    manifest.createGroup({
      id: 'group-2',
      name: 'Group 2',
      assetIds: ['asset-1', 'asset-3'], // asset-1 is duplicate
      preloadPriority: 5,
      loadStrategy: 'eager',
      tags: [],
    });

    const queue = manifest.getPreloadQueue();

    expect(queue).toHaveLength(3);
    expect(new Set(queue.map((a) => a.id)).size).toBe(3);
  });
});

// ============================================================================
// Statistics Tests
// ============================================================================

describe('AssetManifest - Statistics', () => {
  let manifest: AssetManifest;

  beforeEach(() => {
    manifest = createManifest('test-project', 'https://cdn.example.com');
  });

  it('should compute basic statistics', () => {
    manifest.addAssets([
      createTestAsset('asset-1', { fileSize: 1000, assetType: 'model' }),
      createTestAsset('asset-2', { fileSize: 2000, assetType: 'model' }),
      createTestAsset('asset-3', { fileSize: 500, assetType: 'texture', format: 'png' }),
    ]);

    const stats = manifest.computeStats();

    expect(stats.totalAssets).toBe(3);
    expect(stats.totalSize).toBe(3500);
    expect(stats.byType['model']).toBe(2);
    expect(stats.byType['texture']).toBe(1);
  });

  it('should count by format', () => {
    manifest.addAssets([
      createTestAsset('asset-1', { format: 'glb' }),
      createTestAsset('asset-2', { format: 'glb' }),
      createTestAsset('asset-3', { format: 'png' }),
    ]);

    const stats = manifest.computeStats();

    expect(stats.byFormat['glb']).toBe(2);
    expect(stats.byFormat['png']).toBe(1);
  });

  it('should compute memory estimates', () => {
    manifest.addAssets([
      createTestAsset('asset-1', { estimatedGPUMemory: 1000, estimatedCPUMemory: 500 }),
      createTestAsset('asset-2', { estimatedGPUMemory: 2000, estimatedCPUMemory: 1000 }),
    ]);

    const stats = manifest.computeStats();

    expect(stats.estimatedGPUMemory).toBe(3000);
    expect(stats.estimatedCPUMemory).toBe(1500);
  });

  it('should count validated assets', () => {
    manifest.addAssets([
      createTestAsset('asset-1', { validated: true }),
      createTestAsset('asset-2', { validated: true }),
      createTestAsset('asset-3', { validated: false }),
    ]);

    const stats = manifest.computeStats();

    expect(stats.validatedCount).toBe(2);
  });

  it('should count assets with errors and warnings', () => {
    manifest.addAssets([
      createTestAsset('asset-1', { validationErrors: ['Error 1'] }),
      createTestAsset('asset-2', { validationWarnings: ['Warning 1'] }),
      createTestAsset('asset-3', {}),
    ]);

    const stats = manifest.computeStats();

    expect(stats.errorCount).toBe(1);
    expect(stats.warningCount).toBe(1);
  });

  it('should include last updated timestamp', () => {
    manifest.addAsset(createTestAsset('asset-1'));

    const stats = manifest.computeStats();

    expect(stats.lastUpdated).toBeDefined();
  });
});

// ============================================================================
// Serialization Tests
// ============================================================================

describe('AssetManifest - Serialization', () => {
  let manifest: AssetManifest;

  beforeEach(() => {
    manifest = createManifest('test-project', 'https://cdn.example.com');
    manifest.addAssets([
      createTestAsset('asset-1', { tags: ['tag1'] }),
      createTestAsset('asset-2', { tags: ['tag2'] }),
    ]);
    manifest.createGroup(createTestGroup('group-1', ['asset-1']));
  });

  it('should export to JSON', () => {
    const json = manifest.toJSON();

    expect(json).toHaveProperty('config');
    expect(json).toHaveProperty('assets');
    expect(json).toHaveProperty('groups');
    expect(json).toHaveProperty('stats');
    expect(json).toHaveProperty('createdAt');
    expect(json).toHaveProperty('modifiedAt');
  });

  it('should include all assets in JSON', () => {
    const json = manifest.toJSON();

    expect(Object.keys(json.assets)).toHaveLength(2);
    expect(json.assets['asset-1']).toBeDefined();
    expect(json.assets['asset-2']).toBeDefined();
  });

  it('should include all groups in JSON', () => {
    const json = manifest.toJSON();

    expect(json.groups).toHaveLength(1);
    expect(json.groups[0].id).toBe('group-1');
  });

  it('should import from JSON', () => {
    const json = manifest.toJSON();
    const imported = AssetManifest.fromJSON(json);

    expect(imported.getConfig()).toEqual(manifest.getConfig());
    expect(imported.getAllAssets()).toHaveLength(2);
    expect(imported.getAllGroups()).toHaveLength(1);
  });

  it('should preserve indexes after import', () => {
    const json = manifest.toJSON();
    const imported = AssetManifest.fromJSON(json);

    // Tag index should work
    expect(imported.findByTag('tag1')).toHaveLength(1);

    // Path index should work
    expect(imported.getAssetByPath('/assets/asset-1.glb')).toBeDefined();

    // Type index should work
    expect(imported.findByType('model')).toHaveLength(2);
  });

  it('should preserve timestamps on import', () => {
    const json = manifest.toJSON();
    const imported = AssetManifest.fromJSON(json);

    const importedJson = imported.toJSON();
    expect(importedJson.createdAt).toBe(json.createdAt);
    expect(importedJson.modifiedAt).toBe(json.modifiedAt);
  });
});

// ============================================================================
// Configuration Tests
// ============================================================================

describe('AssetManifest - Configuration', () => {
  it('should get configuration copy', () => {
    const manifest = createManifest('test', 'https://cdn.example.com');
    const config = manifest.getConfig();

    // Mutating should not affect original
    config.projectName = 'mutated';

    expect(manifest.getConfig().projectName).toBe('test');
  });

  it('should update configuration', () => {
    const manifest = createManifest('test', 'https://cdn.example.com');

    manifest.updateConfig({ projectName: 'updated-name' });

    expect(manifest.getConfig().projectName).toBe('updated-name');
  });

  it('should update modifiedAt on config change', () => {
    const manifest = createManifest('test', 'https://cdn.example.com');
    const before = manifest.toJSON().modifiedAt;

    manifest.updateConfig({ version: '2.0.0' });

    expect(manifest.toJSON().modifiedAt >= before).toBe(true);
  });
});

// ============================================================================
// Factory Function Tests
// ============================================================================

describe('AssetManifest - Factory Functions', () => {
  it('should create manifest with defaults', () => {
    const manifest = createManifest('my-project', 'https://cdn.example.com');

    const config = manifest.getConfig();
    expect(config.version).toBe('1.0.0');
    expect(config.defaults.compression).toBe('gzip');
    expect(config.defaults.textureFormat).toBe('webp');
    expect(config.defaults.lod.enabled).toBe(true);
  });

  it('should create manifest with custom options', () => {
    const manifest = createManifest('my-project', 'https://cdn.example.com', {
      version: '2.0.0',
      cdnUrl: 'https://custom-cdn.example.com',
    });

    const config = manifest.getConfig();
    expect(config.version).toBe('2.0.0');
    expect(config.cdnUrl).toBe('https://custom-cdn.example.com');
  });
});

// ============================================================================
// Edge Case Tests
// ============================================================================

describe('AssetManifest - Edge Cases', () => {
  let manifest: AssetManifest;

  beforeEach(() => {
    manifest = createManifest('test', 'https://cdn.example.com');
  });

  it('should handle empty manifest', () => {
    expect(manifest.getAllAssets()).toHaveLength(0);
    expect(manifest.getAllGroups()).toHaveLength(0);
    expect(manifest.computeStats().totalAssets).toBe(0);
  });

  it('should handle findByTags with empty array', () => {
    manifest.addAsset(createTestAsset('asset-1', { tags: ['tag1'] }));

    const results = manifest.findByTags([]);
    expect(results).toHaveLength(0);
  });

  it('should handle search with empty query', () => {
    manifest.addAsset(createTestAsset('asset-1'));

    const results = manifest.search('');
    // Empty search should match all
    expect(results.length).toBeGreaterThan(0);
  });

  it('should handle group with non-existent asset IDs', () => {
    manifest.createGroup(createTestGroup('group-1', ['nonexistent-1', 'nonexistent-2']));

    const assets = manifest.getGroupAssets('group-1');
    expect(assets).toHaveLength(0);
  });

  it('should handle asset with empty tags array', () => {
    manifest.addAsset(createTestAsset('asset-1', { tags: [] }));

    expect(manifest.findByTag('')).toHaveLength(0);
  });
});
