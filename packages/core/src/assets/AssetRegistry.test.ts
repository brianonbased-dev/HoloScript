/**
 * @holoscript/core AssetRegistry Tests
 *
 * Comprehensive tests for the central asset registry including:
 * - Singleton behavior
 * - Manifest management
 * - Asset discovery
 * - Cache behavior (TTL, eviction strategies)
 * - Event system
 * - Configuration
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  AssetRegistry,
  getAssetRegistry,
  registerManifest,
  loadAsset,
  preloadAssets,
  AssetEvent,
  AssetEventType,
  CacheEntry,
  RegistryConfig,
} from './AssetRegistry';
import { AssetManifest, createManifest } from './AssetManifest';
import { AssetMetadata, createAssetMetadata } from './AssetMetadata';

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
    tags: overrides.tags ?? [],
    ...overrides,
  });
}

function createTestManifest(projectName = 'test-project'): AssetManifest {
  return createManifest(projectName, 'https://cdn.example.com/assets');
}

// ============================================================================
// Singleton Behavior Tests
// ============================================================================

describe('AssetRegistry - Singleton', () => {
  beforeEach(() => {
    AssetRegistry.resetInstance();
  });

  afterEach(() => {
    AssetRegistry.resetInstance();
  });

  it('should return the same instance on multiple calls', () => {
    const instance1 = AssetRegistry.getInstance();
    const instance2 = AssetRegistry.getInstance();

    expect(instance1).toBe(instance2);
  });

  it('should accept configuration on first getInstance call', () => {
    const registry = AssetRegistry.getInstance({
      maxCacheSize: 128 * 1024 * 1024,
      evictionStrategy: 'lfu',
    });

    const config = registry.getConfig();
    expect(config.maxCacheSize).toBe(128 * 1024 * 1024);
    expect(config.evictionStrategy).toBe('lfu');
  });

  it('should ignore configuration on subsequent getInstance calls', () => {
    const registry1 = AssetRegistry.getInstance({ maxCacheSize: 100 });
    const registry2 = AssetRegistry.getInstance({ maxCacheSize: 200 });

    expect(registry2.getConfig().maxCacheSize).toBe(100);
  });

  it('should reset instance correctly', () => {
    const registry1 = AssetRegistry.getInstance({ maxCacheSize: 100 });
    AssetRegistry.resetInstance();
    const registry2 = AssetRegistry.getInstance({ maxCacheSize: 200 });

    expect(registry1).not.toBe(registry2);
    expect(registry2.getConfig().maxCacheSize).toBe(200);
  });

  it('should use getAssetRegistry convenience function', () => {
    const registry1 = getAssetRegistry();
    const registry2 = getAssetRegistry();

    expect(registry1).toBe(registry2);
  });
});

// ============================================================================
// Manifest Management Tests
// ============================================================================

describe('AssetRegistry - Manifest Management', () => {
  let registry: AssetRegistry;

  beforeEach(() => {
    AssetRegistry.resetInstance();
    registry = AssetRegistry.getInstance();
  });

  afterEach(() => {
    registry.dispose();
    AssetRegistry.resetInstance();
  });

  it('should register a manifest', () => {
    const manifest = createTestManifest();
    registry.registerManifest('main', manifest);

    expect(registry.getManifest('main')).toBe(manifest);
  });

  it('should set first manifest as active by default', () => {
    const manifest = createTestManifest();
    registry.registerManifest('main', manifest);

    expect(registry.getActiveManifest()).toBe(manifest);
  });

  it('should allow setting active manifest', () => {
    const manifest1 = createTestManifest('project1');
    const manifest2 = createTestManifest('project2');

    registry.registerManifest('first', manifest1);
    registry.registerManifest('second', manifest2);

    expect(registry.getActiveManifest()).toBe(manifest1);

    const success = registry.setActiveManifest('second');
    expect(success).toBe(true);
    expect(registry.getActiveManifest()).toBe(manifest2);
  });

  it('should return false when setting non-existent manifest as active', () => {
    const success = registry.setActiveManifest('nonexistent');
    expect(success).toBe(false);
  });

  it('should emit manifest:loaded event on registration', () => {
    const events: AssetEvent[] = [];
    registry.on('manifest:loaded', (e) => events.push(e));

    const manifest = createTestManifest();
    registry.registerManifest('main', manifest);

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('manifest:loaded');
  });

  it('should emit manifest:updated event on active change', () => {
    const events: AssetEvent[] = [];
    const manifest1 = createTestManifest('project1');
    const manifest2 = createTestManifest('project2');

    registry.registerManifest('first', manifest1);
    registry.registerManifest('second', manifest2);

    registry.on('manifest:updated', (e) => events.push(e));
    registry.setActiveManifest('second');

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('manifest:updated');
  });
});

// ============================================================================
// Asset Discovery Tests
// ============================================================================

describe('AssetRegistry - Asset Discovery', () => {
  let registry: AssetRegistry;
  let manifest: AssetManifest;

  beforeEach(() => {
    AssetRegistry.resetInstance();
    registry = AssetRegistry.getInstance();
    manifest = createTestManifest();

    // Add test assets
    manifest.addAsset(createTestAsset('model-1', { tags: ['character', 'humanoid'] }));
    manifest.addAsset(createTestAsset('model-2', { tags: ['prop', 'furniture'] }));
    manifest.addAsset(
      createTestAsset('texture-1', {
        assetType: 'texture',
        format: 'png',
        tags: ['character'],
        sourcePath: '/textures/skin.png',
      })
    );

    registry.registerManifest('main', manifest);
  });

  afterEach(() => {
    registry.dispose();
    AssetRegistry.resetInstance();
  });

  it('should get asset by ID from active manifest', () => {
    const asset = registry.getAsset('model-1');
    expect(asset).toBeDefined();
    expect(asset?.id).toBe('model-1');
  });

  it('should return undefined for non-existent asset', () => {
    const asset = registry.getAsset('nonexistent');
    expect(asset).toBeUndefined();
  });

  it('should get asset by path', () => {
    const asset = registry.getAssetByPath('/assets/model-1.glb');
    expect(asset).toBeDefined();
    expect(asset?.id).toBe('model-1');
  });

  it('should find assets by tag', () => {
    const assets = registry.findByTag('character');
    expect(assets).toHaveLength(2);
    expect(assets.map((a) => a.id)).toContain('model-1');
    expect(assets.map((a) => a.id)).toContain('texture-1');
  });

  it('should find assets by type', () => {
    const models = registry.findByType('model');
    expect(models).toHaveLength(2);

    const textures = registry.findByType('texture');
    expect(textures).toHaveLength(1);
  });

  it('should search assets across manifests', () => {
    // Add second manifest
    const manifest2 = createTestManifest('project2');
    manifest2.addAsset(createTestAsset('model-3', { name: 'special-model' }));
    registry.registerManifest('second', manifest2);

    const results = registry.search('special');
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('special-model');
  });

  it('should deduplicate assets when searching across manifests', () => {
    // Add same asset to second manifest
    const manifest2 = createTestManifest('project2');
    manifest2.addAsset(createTestAsset('model-1', { tags: ['character', 'humanoid'] }));
    registry.registerManifest('second', manifest2);

    const assets = registry.findByTag('character');
    const uniqueIds = new Set(assets.map((a) => a.id));
    expect(uniqueIds.size).toBe(assets.length);
  });
});

// ============================================================================
// Cache Management Tests
// ============================================================================

describe('AssetRegistry - Cache Management', () => {
  let registry: AssetRegistry;

  beforeEach(() => {
    AssetRegistry.resetInstance();
    registry = AssetRegistry.getInstance({
      maxCacheSize: 10 * 1024, // 10KB for testing
      defaultTTL: 1000, // 1 second
      autoEvict: true,
      evictionStrategy: 'lru',
    });
  });

  afterEach(() => {
    registry.dispose();
    AssetRegistry.resetInstance();
  });

  it('should cache and retrieve assets', () => {
    const data = { mesh: 'vertices' };
    registry.setCached('asset-1', data, 500);

    const cached = registry.getCached<typeof data>('asset-1');
    expect(cached).toEqual(data);
  });

  it('should return undefined for non-cached assets', () => {
    const cached = registry.getCached('nonexistent');
    expect(cached).toBeUndefined();
  });

  it('should track cache hits and misses', () => {
    registry.setCached('asset-1', { data: 1 }, 100);

    registry.getCached('asset-1'); // hit
    registry.getCached('asset-1'); // hit
    registry.getCached('nonexistent'); // miss

    const stats = registry.getCacheStats();
    expect(stats.hits).toBe(2);
    expect(stats.misses).toBe(1);
    expect(stats.hitRate).toBeCloseTo(2 / 3, 2);
  });

  it('should evict from cache manually', () => {
    registry.setCached('asset-1', { data: 1 }, 100);
    expect(registry.getCached('asset-1')).toBeDefined();

    const evicted = registry.evictFromCache('asset-1');
    expect(evicted).toBe(true);
    expect(registry.getCached('asset-1')).toBeUndefined();
  });

  it('should clear entire cache', () => {
    registry.setCached('asset-1', { data: 1 }, 100);
    registry.setCached('asset-2', { data: 2 }, 100);

    registry.clearCache();

    expect(registry.getCached('asset-1')).toBeUndefined();
    expect(registry.getCached('asset-2')).toBeUndefined();
    expect(registry.getCacheStats().entryCount).toBe(0);
  });

  it('should emit cache events', () => {
    const cachedEvents: AssetEvent[] = [];
    const evictedEvents: AssetEvent[] = [];

    registry.on('asset:cached', (e) => cachedEvents.push(e));
    registry.on('asset:evicted', (e) => evictedEvents.push(e));

    registry.setCached('asset-1', { data: 1 }, 100);
    registry.evictFromCache('asset-1');

    expect(cachedEvents).toHaveLength(1);
    expect(evictedEvents).toHaveLength(1);
  });

  it('should track current cache size', () => {
    registry.setCached('asset-1', { data: 1 }, 1000);
    registry.setCached('asset-2', { data: 2 }, 2000);

    const stats = registry.getCacheStats();
    expect(stats.size).toBe(3000);
  });
});

// ============================================================================
// Cache TTL Tests
// ============================================================================

describe('AssetRegistry - Cache TTL', () => {
  let registry: AssetRegistry;

  beforeEach(() => {
    AssetRegistry.resetInstance();
    registry = AssetRegistry.getInstance({
      defaultTTL: 100, // 100ms for fast testing
      autoEvict: true,
    });
  });

  afterEach(() => {
    registry.dispose();
    AssetRegistry.resetInstance();
  });

  it('should expire cache entries after TTL', async () => {
    registry.setCached('asset-1', { data: 1 }, 100, 50); // 50ms TTL

    expect(registry.getCached('asset-1')).toBeDefined();

    await new Promise((resolve) => setTimeout(resolve, 60));

    expect(registry.getCached('asset-1')).toBeUndefined();
  });

  it('should use default TTL when not specified', () => {
    registry.setCached('asset-1', { data: 1 }, 100); // No TTL specified

    const stats = registry.getCacheStats();
    expect(stats.entryCount).toBe(1);
  });
});

// ============================================================================
// Cache Eviction Strategy Tests
// ============================================================================

describe('AssetRegistry - Cache Eviction Strategies', () => {
  beforeEach(() => {
    AssetRegistry.resetInstance();
  });

  afterEach(() => {
    AssetRegistry.resetInstance();
  });

  it('should evict using LRU strategy', async () => {
    const registry = AssetRegistry.getInstance({
      maxCacheSize: 2000,
      evictionStrategy: 'lru',
      autoEvict: true,
    });

    // Add entries with delay to ensure distinct timestamps
    registry.setCached('asset-1', { data: 1 }, 800);
    await new Promise((r) => setTimeout(r, 5));
    registry.setCached('asset-2', { data: 2 }, 800);

    // Access asset-1 to make it recently used
    await new Promise((r) => setTimeout(r, 5));
    registry.getCached('asset-1');

    // Add new entry that triggers eviction
    await new Promise((r) => setTimeout(r, 5));
    registry.setCached('asset-3', { data: 3 }, 800);

    // asset-2 should be evicted (least recently used)
    expect(registry.getCached('asset-1')).toBeDefined();
    expect(registry.getCached('asset-2')).toBeUndefined();
    expect(registry.getCached('asset-3')).toBeDefined();

    registry.dispose();
  });

  it('should evict using LFU strategy', () => {
    AssetRegistry.resetInstance();
    const registry = AssetRegistry.getInstance({
      maxCacheSize: 2000,
      evictionStrategy: 'lfu',
      autoEvict: true,
    });

    // Add entries
    registry.setCached('asset-1', { data: 1 }, 800);
    registry.setCached('asset-2', { data: 2 }, 800);

    // Access asset-1 multiple times to increase frequency
    registry.getCached('asset-1');
    registry.getCached('asset-1');
    registry.getCached('asset-1');

    // Access asset-2 once
    registry.getCached('asset-2');

    // Add new entry that triggers eviction
    registry.setCached('asset-3', { data: 3 }, 800);

    // asset-2 should be evicted (least frequently used)
    expect(registry.getCached('asset-1')).toBeDefined();
    expect(registry.getCached('asset-2')).toBeUndefined();
    expect(registry.getCached('asset-3')).toBeDefined();

    registry.dispose();
  });

  it('should evict using FIFO strategy', () => {
    AssetRegistry.resetInstance();
    const registry = AssetRegistry.getInstance({
      maxCacheSize: 2000,
      evictionStrategy: 'fifo',
      autoEvict: true,
    });

    // Add entries with slight delay
    registry.setCached('asset-1', { data: 1 }, 800);
    registry.setCached('asset-2', { data: 2 }, 800);

    // Access asset-1 (shouldn't matter for FIFO)
    registry.getCached('asset-1');

    // Add new entry that triggers eviction
    registry.setCached('asset-3', { data: 3 }, 800);

    // asset-1 should be evicted (first in)
    expect(registry.getCached('asset-1')).toBeUndefined();
    expect(registry.getCached('asset-2')).toBeDefined();
    expect(registry.getCached('asset-3')).toBeDefined();

    registry.dispose();
  });
});

// ============================================================================
// Event System Tests
// ============================================================================

describe('AssetRegistry - Event System', () => {
  let registry: AssetRegistry;

  beforeEach(() => {
    AssetRegistry.resetInstance();
    registry = AssetRegistry.getInstance();
  });

  afterEach(() => {
    registry.dispose();
    AssetRegistry.resetInstance();
  });

  it('should subscribe to specific event types', () => {
    const events: AssetEvent[] = [];
    registry.on('asset:cached', (e) => events.push(e));

    registry.setCached('asset-1', { data: 1 }, 100);
    registry.setCached('asset-2', { data: 2 }, 100);

    expect(events).toHaveLength(2);
    expect(events.every((e) => e.type === 'asset:cached')).toBe(true);
  });

  it('should return unsubscribe function from on()', () => {
    const events: AssetEvent[] = [];
    const unsubscribe = registry.on('asset:cached', (e) => events.push(e));

    registry.setCached('asset-1', { data: 1 }, 100);
    unsubscribe();
    registry.setCached('asset-2', { data: 2 }, 100);

    expect(events).toHaveLength(1);
  });

  it('should subscribe to all events with onAny()', () => {
    const events: AssetEvent[] = [];
    registry.onAny((e) => events.push(e));

    const manifest = createTestManifest();
    registry.registerManifest('main', manifest);
    registry.setCached('asset-1', { data: 1 }, 100);
    registry.evictFromCache('asset-1');

    expect(events.length).toBeGreaterThanOrEqual(3);
    const types = new Set(events.map((e) => e.type));
    expect(types.has('manifest:loaded')).toBe(true);
    expect(types.has('asset:cached')).toBe(true);
    expect(types.has('asset:evicted')).toBe(true);
  });

  it('should return unsubscribe function from onAny()', () => {
    const events: AssetEvent[] = [];
    const unsubscribe = registry.onAny((e) => events.push(e));

    registry.setCached('asset-1', { data: 1 }, 100);
    unsubscribe();
    registry.setCached('asset-2', { data: 2 }, 100);

    expect(events).toHaveLength(1);
  });

  it('should include timestamp in events', () => {
    let event: AssetEvent | null = null;
    registry.on('asset:cached', (e) => (event = e));

    const before = Date.now();
    registry.setCached('asset-1', { data: 1 }, 100);
    const after = Date.now();

    expect(event).not.toBeNull();
    expect(event!.timestamp).toBeGreaterThanOrEqual(before);
    expect(event!.timestamp).toBeLessThanOrEqual(after);
  });

  it('should handle listener errors gracefully', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    registry.on('asset:cached', () => {
      throw new Error('Test error');
    });

    // Should not throw
    expect(() => {
      registry.setCached('asset-1', { data: 1 }, 100);
    }).not.toThrow();

    consoleSpy.mockRestore();
  });
});

// ============================================================================
// Configuration Tests
// ============================================================================

describe('AssetRegistry - Configuration', () => {
  let registry: AssetRegistry;

  beforeEach(() => {
    AssetRegistry.resetInstance();
    registry = AssetRegistry.getInstance({
      maxCacheSize: 1000,
      defaultTTL: 5000,
      autoEvict: true,
      evictionStrategy: 'lru',
      enablePreload: true,
      concurrentLoadLimit: 4,
    });
  });

  afterEach(() => {
    registry.dispose();
    AssetRegistry.resetInstance();
  });

  it('should get current configuration', () => {
    const config = registry.getConfig();

    expect(config.maxCacheSize).toBe(1000);
    expect(config.defaultTTL).toBe(5000);
    expect(config.autoEvict).toBe(true);
    expect(config.evictionStrategy).toBe('lru');
    expect(config.enablePreload).toBe(true);
    expect(config.concurrentLoadLimit).toBe(4);
  });

  it('should update configuration', () => {
    registry.updateConfig({
      maxCacheSize: 2000,
      evictionStrategy: 'lfu',
    });

    const config = registry.getConfig();
    expect(config.maxCacheSize).toBe(2000);
    expect(config.evictionStrategy).toBe('lfu');
    // Other values should remain unchanged
    expect(config.defaultTTL).toBe(5000);
  });

  it('should return copy of config to prevent mutation', () => {
    const config = registry.getConfig();
    config.maxCacheSize = 999999;

    expect(registry.getConfig().maxCacheSize).toBe(1000);
  });
});

// ============================================================================
// Dispose Tests
// ============================================================================

describe('AssetRegistry - Dispose', () => {
  it('should clear all state on dispose', () => {
    AssetRegistry.resetInstance();
    const registry = AssetRegistry.getInstance();

    const manifest = createTestManifest();
    manifest.addAsset(createTestAsset('asset-1'));
    registry.registerManifest('main', manifest);
    registry.setCached('asset-1', { data: 1 }, 100);

    registry.dispose();

    expect(registry.getActiveManifest()).toBeNull();
    expect(registry.getManifest('main')).toBeUndefined();
    expect(registry.getCacheStats().entryCount).toBe(0);

    AssetRegistry.resetInstance();
  });
});

// ============================================================================
// Convenience Function Tests
// ============================================================================

describe('AssetRegistry - Convenience Functions', () => {
  beforeEach(() => {
    AssetRegistry.resetInstance();
  });

  afterEach(() => {
    AssetRegistry.resetInstance();
  });

  it('should register manifest using convenience function', () => {
    const manifest = createTestManifest();
    registerManifest('main', manifest);

    expect(getAssetRegistry().getManifest('main')).toBe(manifest);
  });
});

// ============================================================================
// Default Configuration Tests
// ============================================================================

describe('AssetRegistry - Default Configuration', () => {
  beforeEach(() => {
    AssetRegistry.resetInstance();
  });

  afterEach(() => {
    AssetRegistry.resetInstance();
  });

  it('should use sensible defaults', () => {
    const registry = AssetRegistry.getInstance();
    const config = registry.getConfig();

    expect(config.maxCacheSize).toBe(256 * 1024 * 1024); // 256MB
    expect(config.defaultTTL).toBe(5 * 60 * 1000); // 5 minutes
    expect(config.autoEvict).toBe(true);
    expect(config.evictionStrategy).toBe('lru');
    expect(config.enablePreload).toBe(true);
    expect(config.concurrentLoadLimit).toBe(6);
  });
});
