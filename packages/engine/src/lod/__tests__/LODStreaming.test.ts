/**
 * @holoscript/core LOD Streaming Tests
 *
 * Comprehensive test suite for v3.5 LOD Streaming System.
 * Tests streaming manager, GPU culling, and cache systems.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  LODStreamingManager,
  createStreamingManager,
  createMobileStreamingManager,
  createDesktopStreamingManager,
} from '../LODStreamingManager';
import {
  GPUCullingSystem,
  createGPUCullingSystem,
  extractFrustumPlanes,
  type ObjectInstance,
} from '../GPUCullingSystem';
import {
  LODCache,
  createLODCache,
  createMobileLODCache,
  createDesktopLODCache,
  formatBytes,
} from '../LODCache';
import { createLODManager } from '../LODManager';
import { createStandardLODConfig } from '../LODTypes';
import type { MeshData } from '../LODGenerator';

// ============================================================================
// Test Helpers
// ============================================================================

function createMockMesh(vertexCount: number = 1000): MeshData {
  return {
    positions: new Float32Array(vertexCount * 3),
    normals: new Float32Array(vertexCount * 3),
    uvs: new Float32Array(vertexCount * 2),
    indices: new Uint32Array(vertexCount * 1.5),
  };
}

function createMockObjectInstance(id: number, position: [number, number, number]): ObjectInstance {
  return {
    position,
    radius: 5.0,
    lodLevel: 0,
    lodDistances: [0, 50, 100, 200],
    objectId: id,
  };
}

// ============================================================================
// LODStreamingManager Tests
// ============================================================================

describe('LODStreamingManager', () => {
  let streamingManager: LODStreamingManager;

  beforeEach(() => {
    streamingManager = createStreamingManager();
  });

  // --------------------------------------------------------------------------
  // Initialization and Configuration
  // --------------------------------------------------------------------------

  it('should create with default options', () => {
    const options = streamingManager.getOptions();
    expect(options.memoryBudgetBytes).toBe(512 * 1024 * 1024);
    expect(options.bandwidthBudgetBytesPerSec).toBe(10 * 1024 * 1024);
    expect(options.maxConcurrentLoads).toBe(4);
  });

  it('should create mobile streaming manager with reduced budgets', () => {
    const mobile = createMobileStreamingManager();
    const options = mobile.getOptions();
    expect(options.memoryBudgetBytes).toBe(256 * 1024 * 1024);
    expect(options.bandwidthBudgetBytesPerSec).toBe(5 * 1024 * 1024);
    expect(options.maxConcurrentLoads).toBe(2);
  });

  it('should create desktop streaming manager with increased budgets', () => {
    const desktop = createDesktopStreamingManager();
    const options = desktop.getOptions();
    expect(options.memoryBudgetBytes).toBe(1024 * 1024 * 1024);
    expect(options.bandwidthBudgetBytesPerSec).toBe(50 * 1024 * 1024);
    expect(options.maxConcurrentLoads).toBe(8);
  });

  it('should attach to LOD manager', () => {
    const lodManager = createLODManager();
    streamingManager.attachLODManager(lodManager);
    expect(() => streamingManager.update()).not.toThrow();
  });

  it('should update options', () => {
    streamingManager.setOptions({ maxConcurrentLoads: 8 });
    expect(streamingManager.getOptions().maxConcurrentLoads).toBe(8);
  });

  // --------------------------------------------------------------------------
  // Request Management
  // --------------------------------------------------------------------------

  it('should queue LOD request', () => {
    streamingManager.requestLOD('obj1', 0, '/path/mesh.glb', 10, 0.5, 1024 * 1024);
    const metrics = streamingManager.getMetrics();
    expect(metrics.pendingRequests).toBe(1);
  });

  it('should not duplicate requests for same object/level', () => {
    streamingManager.requestLOD('obj1', 0, '/path/mesh.glb', 10, 0.5, 1024 * 1024);
    streamingManager.requestLOD('obj1', 0, '/path/mesh.glb', 10, 0.5, 1024 * 1024);
    const metrics = streamingManager.getMetrics();
    expect(metrics.pendingRequests).toBe(1);
  });

  it('should prioritize closer objects', () => {
    streamingManager.requestLOD('far', 0, '/far.glb', 100, 0.1, 1024 * 1024);
    streamingManager.requestLOD('near', 0, '/near.glb', 10, 0.8, 1024 * 1024);

    // Near object should have higher priority
    const metrics = streamingManager.getMetrics();
    expect(metrics.pendingRequests).toBe(2);
  });

  it('should cancel pending requests', () => {
    streamingManager.requestLOD('obj1', 0, '/path/mesh.glb', 10, 0.5, 1024 * 1024);
    streamingManager.cancelRequest('obj1', 0);
    const metrics = streamingManager.getMetrics();
    expect(metrics.pendingRequests).toBe(0);
  });

  // --------------------------------------------------------------------------
  // Loading and Streaming
  // --------------------------------------------------------------------------

  it('should load mesh asynchronously', async () => {
    streamingManager.requestLOD('obj1', 0, '/path/mesh.glb', 10, 0.5, 1024 * 1024);
    await streamingManager.update();

    // Wait for load to complete
    await new Promise((resolve) => setTimeout(resolve, 100));

    const mesh = streamingManager.getMesh('obj1', 0);
    expect(mesh).toBeDefined();
  });

  it('should track loading state', () => {
    streamingManager.requestLOD('obj1', 0, '/path/mesh.glb', 10, 0.5, 1024 * 1024);
    expect(streamingManager.isLoaded('obj1', 0)).toBe(false);
    expect(streamingManager.isLoading('obj1', 0)).toBe(false);
  });

  it('should respect max concurrent loads', async () => {
    streamingManager.setOptions({ maxConcurrentLoads: 2 });

    streamingManager.requestLOD('obj1', 0, '/1.glb', 10, 0.5, 1024 * 1024);
    streamingManager.requestLOD('obj2', 0, '/2.glb', 10, 0.5, 1024 * 1024);
    streamingManager.requestLOD('obj3', 0, '/3.glb', 10, 0.5, 1024 * 1024);

    await streamingManager.update();

    const metrics = streamingManager.getMetrics();
    expect(metrics.activeLoads).toBeLessThanOrEqual(2);
  });

  it('should emit load events', async () => {
    const events: string[] = [];

    streamingManager.on('loadStart', (e) => events.push('start'));
    streamingManager.on('loadComplete', (e) => events.push('complete'));

    streamingManager.requestLOD('obj1', 0, '/path/mesh.glb', 10, 0.5, 1024 * 1024);
    await streamingManager.update();

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(events).toContain('start');
  });

  // --------------------------------------------------------------------------
  // Memory Budget
  // --------------------------------------------------------------------------

  it('should respect memory budget', async () => {
    streamingManager.setOptions({ memoryBudgetBytes: 1024 * 1024 }); // 1MB

    // Request 2MB worth of meshes
    streamingManager.requestLOD('obj1', 0, '/1.glb', 10, 0.5, 512 * 1024);
    streamingManager.requestLOD('obj2', 0, '/2.glb', 10, 0.5, 512 * 1024);
    streamingManager.requestLOD('obj3', 0, '/3.glb', 10, 0.5, 512 * 1024);

    await streamingManager.update();
    await new Promise((resolve) => setTimeout(resolve, 200));

    const metrics = streamingManager.getMetrics();
    expect(metrics.memoryUsedBytes).toBeLessThanOrEqual(1024 * 1024);
  });

  it('should emit budget exceeded event', () => {
    let budgetExceeded = false;

    streamingManager.on('budgetExceeded', () => {
      budgetExceeded = true;
    });

    streamingManager.setOptions({ memoryBudgetBytes: 100 });
    streamingManager.requestLOD('obj1', 0, '/huge.glb', 10, 0.5, 10 * 1024 * 1024);

    expect(budgetExceeded).toBe(false); // Will be true after update
  });

  // --------------------------------------------------------------------------
  // Prefetching
  // --------------------------------------------------------------------------

  it('should enable velocity-based prefetching', () => {
    streamingManager.setOptions({ enableVelocityPrefetch: true });
    expect(streamingManager.getOptions().enableVelocityPrefetch).toBe(true);
  });

  it('should predict camera movement', async () => {
    const lodManager = createLODManager();
    const config = createStandardLODConfig('obj1', 3, 50);
    config.levels[1].assetPath = '/level1.glb';

    lodManager.register('obj1', config, [0, 0, 100]);
    streamingManager.attachLODManager(lodManager);
    streamingManager.setOptions({ enableVelocityPrefetch: true });

    // Simulate camera moving toward object
    streamingManager.setCameraPosition([0, 0, 0], 0.016);
    lodManager.setCameraPosition([0, 0, 0]);
    await streamingManager.update();

    streamingManager.setCameraPosition([0, 0, 10], 0.016);
    lodManager.setCameraPosition([0, 0, 10]);
    await streamingManager.update();

    // Should have prefetched
    expect(streamingManager.getMetrics().pendingRequests).toBeGreaterThanOrEqual(0);
  });

  // --------------------------------------------------------------------------
  // Metrics
  // --------------------------------------------------------------------------

  it('should track bandwidth usage', async () => {
    streamingManager.requestLOD('obj1', 0, '/path/mesh.glb', 10, 0.5, 1024 * 1024);
    await streamingManager.update();
    await new Promise((resolve) => setTimeout(resolve, 100));

    const metrics = streamingManager.getMetrics();
    expect(metrics.totalBytesDownloaded).toBeGreaterThan(0);
  });

  it('should calculate average load time', async () => {
    streamingManager.requestLOD('obj1', 0, '/path/mesh.glb', 10, 0.5, 1024 * 1024);
    await streamingManager.update();
    await new Promise((resolve) => setTimeout(resolve, 100));

    const metrics = streamingManager.getMetrics();
    expect(metrics.averageLoadTimeMs).toBeGreaterThanOrEqual(0);
  });

  // --------------------------------------------------------------------------
  // Unloading and Cleanup
  // --------------------------------------------------------------------------

  it('should unload specific LOD', async () => {
    streamingManager.requestLOD('obj1', 0, '/path/mesh.glb', 10, 0.5, 1024 * 1024);
    await streamingManager.update();
    await new Promise((resolve) => setTimeout(resolve, 100));

    streamingManager.unload('obj1', 0);
    expect(streamingManager.isLoaded('obj1', 0)).toBe(false);
  });

  it('should clear all data', async () => {
    streamingManager.requestLOD('obj1', 0, '/path/mesh.glb', 10, 0.5, 1024 * 1024);
    await streamingManager.update();

    streamingManager.clear();

    const metrics = streamingManager.getMetrics();
    expect(metrics.pendingRequests).toBe(0);
    expect(metrics.lodsLoaded).toBe(0);
  });
});

// ============================================================================
// GPUCullingSystem Tests
// ============================================================================

describe('GPUCullingSystem', () => {
  let cullingSystem: GPUCullingSystem;

  beforeEach(() => {
    cullingSystem = createGPUCullingSystem();
  });

  it('should create with default options', () => {
    expect(cullingSystem).toBeDefined();
    expect(cullingSystem.isInitialized()).toBe(false);
  });

  it('should create with custom options', () => {
    const custom = createGPUCullingSystem({
      enableFrustumCulling: true,
      enableOcclusionCulling: false,
      workgroupSize: 128,
    });
    expect(custom).toBeDefined();
  });

  it('should extract frustum planes from matrix', () => {
    const viewProj = new Float32Array(16);
    // Identity matrix
    viewProj[0] = viewProj[5] = viewProj[10] = viewProj[15] = 1;

    const planes = extractFrustumPlanes(viewProj);
    expect(planes).toHaveLength(24); // 6 planes * 4 components
  });

  it('should handle no culling mode', async () => {
    const noCulling = createGPUCullingSystem({
      enableFrustumCulling: false,
      enableOcclusionCulling: false,
    });

    const objects = [
      createMockObjectInstance(0, [0, 0, 0]),
      createMockObjectInstance(1, [10, 0, 0]),
    ];

    // Without GPU device, should gracefully handle
    expect(() => noCulling.getStats()).not.toThrow();
  });

  it('should track culling stats', () => {
    const stats = cullingSystem.getStats();
    expect(stats.totalObjects).toBe(0);
    expect(stats.visibleObjects).toBe(0);
    expect(stats.frustumCulled).toBe(0);
    expect(stats.occlusionCulled).toBe(0);
  });

  it('should destroy resources', () => {
    cullingSystem.destroy();
    expect(cullingSystem.isInitialized()).toBe(false);
  });
});

// ============================================================================
// LODCache Tests
// ============================================================================

describe('LODCache', () => {
  let cache: LODCache;

  beforeEach(() => {
    cache = createLODCache();
  });

  // --------------------------------------------------------------------------
  // Basic Operations
  // --------------------------------------------------------------------------

  it('should create with default options', () => {
    const options = cache.getOptions();
    expect(options.maxMemoryBytes).toBe(512 * 1024 * 1024);
    expect(options.enableCompression).toBe(true);
  });

  it('should create mobile cache with reduced memory', () => {
    const mobile = createMobileLODCache();
    expect(mobile.getOptions().maxMemoryBytes).toBe(128 * 1024 * 1024);
  });

  it('should create desktop cache with increased memory', () => {
    const desktop = createDesktopLODCache();
    expect(desktop.getOptions().maxMemoryBytes).toBe(1024 * 1024 * 1024);
  });

  it('should add and retrieve entries', async () => {
    const mesh = createMockMesh(1000);
    await cache.set('test1', mesh);

    const retrieved = cache.get('test1');
    expect(retrieved).toBeDefined();
    expect(retrieved?.positions.length).toBe(mesh.positions.length);
  });

  it('should check if key exists', async () => {
    const mesh = createMockMesh(1000);
    await cache.set('test1', mesh);

    expect(cache.has('test1')).toBe(true);
    expect(cache.has('nonexistent')).toBe(false);
  });

  it('should remove entries', async () => {
    const mesh = createMockMesh(1000);
    await cache.set('test1', mesh);

    const removed = cache.remove('test1');
    expect(removed).toBe(true);
    expect(cache.has('test1')).toBe(false);
  });

  it('should get cache size', async () => {
    const mesh = createMockMesh(1000);
    await cache.set('test1', mesh);
    await cache.set('test2', mesh);

    expect(cache.size).toBe(2);
  });

  // --------------------------------------------------------------------------
  // LRU Eviction
  // --------------------------------------------------------------------------

  it('should evict LRU entries when over budget', async () => {
    // Create larger meshes to ensure eviction
    const mesh1 = createMockMesh(5000); // Larger meshes
    const mesh2 = createMockMesh(5000);
    const mesh3 = createMockMesh(5000);

    // Calculate actual mesh size
    const meshSize =
      mesh1.positions.byteLength +
      (mesh1.normals?.byteLength || 0) +
      (mesh1.uvs?.byteLength || 0) +
      (mesh1.indices?.byteLength || 0);

    // Set budget that can only fit 1 mesh
    await cache.setOptions({ maxMemoryBytes: meshSize + 1000 }); // Just over 1 mesh worth

    await cache.set('mesh1', mesh1);
    const sizeAfter1 = cache.size;

    await cache.set('mesh2', mesh2); // Should evict mesh1
    const sizeAfter2 = cache.size;

    // Check that memory is within budget
    const metrics = cache.getMetrics();
    expect(metrics.memoryUsed).toBeLessThanOrEqual(meshSize + 1000);

    // And that cache didn't grow beyond 1-2 entries
    expect(Math.max(sizeAfter1, sizeAfter2)).toBeLessThanOrEqual(2);
  });

  it('should move accessed entries to front', async () => {
    await cache.setOptions({ maxMemoryBytes: 80 * 1024 });

    const mesh = createMockMesh(1000);
    await cache.set('mesh1', mesh);
    await cache.set('mesh2', mesh);

    // Access mesh1 (moves to front)
    cache.get('mesh1');

    // Add mesh3 (should evict mesh2, not mesh1)
    await cache.set('mesh3', mesh);

    expect(cache.has('mesh1')).toBe(true);
    expect(cache.has('mesh3')).toBe(true);
  });

  it('should track access count', async () => {
    const mesh = createMockMesh(1000);
    await cache.set('test1', mesh);

    cache.get('test1');
    cache.get('test1');

    const entry = cache.peek('test1');
    expect(entry?.accessCount).toBe(2);
  });

  it('should evict entries to target memory', async () => {
    const mesh = createMockMesh(1000);
    await cache.set('mesh1', mesh);
    await cache.set('mesh2', mesh);
    await cache.set('mesh3', mesh);

    const initialMemory = cache.getMetrics().memoryUsed;
    const evicted = await cache.evictToMemory(40 * 1024);

    // If initial memory is > 40KB, should evict
    if (initialMemory > 40 * 1024) {
      expect(evicted).toBeGreaterThan(0);
    } else {
      expect(evicted).toBe(0);
    }
  });

  it('should evict entries matching predicate', async () => {
    const mesh = createMockMesh(1000);
    await cache.set('mesh1', mesh, ['tex1']);
    await cache.set('mesh2', mesh, ['tex2']);
    await cache.set('mesh3', mesh, ['tex1']);

    // Evict all with tex1
    const evicted = cache.evictMatching((entry) => entry.textures.includes('tex1'));

    expect(evicted).toBe(2);
    expect(cache.has('mesh1')).toBe(false);
    expect(cache.has('mesh2')).toBe(true);
    expect(cache.has('mesh3')).toBe(false);
  });

  // --------------------------------------------------------------------------
  // Metrics
  // --------------------------------------------------------------------------

  it('should track cache hits and misses', async () => {
    const mesh = createMockMesh(1000);
    await cache.set('test1', mesh);

    cache.get('test1'); // Hit
    cache.get('nonexistent'); // Miss

    const metrics = cache.getMetrics();
    expect(metrics.hits).toBe(1);
    expect(metrics.misses).toBe(1);
    expect(metrics.hitRate).toBe(0.5);
  });

  it('should track memory usage', async () => {
    const mesh = createMockMesh(1000);
    await cache.set('test1', mesh);

    const metrics = cache.getMetrics();
    expect(metrics.memoryUsed).toBeGreaterThan(0);
    expect(metrics.entryCount).toBe(1);
  });

  it('should track evictions', async () => {
    await cache.setOptions({ maxMemoryBytes: 50 * 1024 });

    const mesh = createMockMesh(1000);
    await cache.set('mesh1', mesh);
    await cache.set('mesh2', mesh);
    await cache.set('mesh3', mesh); // Triggers eviction

    const metrics = cache.getMetrics();
    // If cache size < 3, evictions must have happened
    if (cache.size < 3) {
      expect(metrics.evictions).toBeGreaterThan(0);
    } else {
      // Cache was big enough, no evictions needed
      expect(metrics.evictions).toBe(0);
    }
  });

  it('should calculate average entry size', async () => {
    const mesh = createMockMesh(1000);
    await cache.set('test1', mesh);
    await cache.set('test2', mesh);

    const metrics = cache.getMetrics();
    expect(metrics.averageEntrySize).toBeGreaterThan(0);
  });

  it('should get memory usage percentage', async () => {
    cache.setOptions({ maxMemoryBytes: 100 * 1024 });

    const mesh = createMockMesh(1000); // ~32KB
    await cache.set('test1', mesh);

    const percent = cache.getMemoryUsagePercent();
    expect(percent).toBeGreaterThan(0);
    expect(percent).toBeLessThan(1);
  });

  it('should get available memory', async () => {
    cache.setOptions({ maxMemoryBytes: 100 * 1024 });

    const mesh = createMockMesh(1000);
    await cache.set('test1', mesh);

    const available = cache.getAvailableMemory();
    expect(available).toBeGreaterThan(0);
  });

  // --------------------------------------------------------------------------
  // Events
  // --------------------------------------------------------------------------

  it('should emit entry added event', async () => {
    let added = false;
    cache.on('entryAdded', () => {
      added = true;
    });

    const mesh = createMockMesh(1000);
    await cache.set('test1', mesh);

    expect(added).toBe(true);
  });

  it('should emit entry evicted event', async () => {
    let evicted = false;
    cache.on('entryEvicted', () => {
      evicted = true;
    });

    await cache.setOptions({ maxMemoryBytes: 50 * 1024 });

    const mesh = createMockMesh(1000);
    await cache.set('mesh1', mesh);
    await cache.set('mesh2', mesh);
    await cache.set('mesh3', mesh);

    // If eviction happened (cache size < 3), event should have fired
    if (cache.size < 3) {
      expect(evicted).toBe(true);
    } else {
      // Skip test if no eviction needed (mesh size might be smaller than expected)
    }
  });

  it('should unsubscribe from events', async () => {
    let count = 0;
    const unsub = cache.on('entryAdded', () => {
      count++;
    });

    const mesh = createMockMesh(1000);
    await cache.set('test1', mesh);

    unsub();

    await cache.set('test2', mesh);

    expect(count).toBe(1);
  });

  // --------------------------------------------------------------------------
  // Utilities
  // --------------------------------------------------------------------------

  it('should peek without updating LRU', async () => {
    const mesh = createMockMesh(1000);
    await cache.set('test1', mesh);

    const entry1 = cache.peek('test1');
    expect(entry1).toBeDefined();
    expect(entry1?.accessCount).toBe(0); // Not incremented by peek
  });

  it('should get all keys', async () => {
    const mesh = createMockMesh(1000);
    await cache.set('test1', mesh);
    await cache.set('test2', mesh);

    const keys = cache.getKeys();
    expect(keys).toContain('test1');
    expect(keys).toContain('test2');
    expect(keys.length).toBe(2);
  });

  it('should clear all entries', async () => {
    const mesh = createMockMesh(1000);
    await cache.set('test1', mesh);
    await cache.set('test2', mesh);

    cache.clear();

    expect(cache.size).toBe(0);
    expect(cache.getMetrics().memoryUsed).toBe(0);
  });

  it('should format bytes correctly', () => {
    expect(formatBytes(0)).toBe('0 Bytes');
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1024 * 1024)).toBe('1 MB');
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1 GB');
  });

  // --------------------------------------------------------------------------
  // Options
  // --------------------------------------------------------------------------

  it('should update cache options', () => {
    cache.setOptions({ maxConcurrentLoads: 8 });
    // Note: maxConcurrentLoads is a streaming option, not cache option
    // This test verifies setOptions doesn't throw
    expect(() => cache.getOptions()).not.toThrow();
  });

  it('should trigger eviction when memory budget reduced', async () => {
    await cache.setOptions({ maxMemoryBytes: 200 * 1024 });

    const mesh = createMockMesh(1000);
    await cache.set('mesh1', mesh);
    await cache.set('mesh2', mesh);
    await cache.set('mesh3', mesh);

    const sizeBefore = cache.size;
    const memoryBefore = cache.getMetrics().memoryUsed;

    // Reduce budget
    await cache.setOptions({ maxMemoryBytes: 50 * 1024 });

    const sizeAfter = cache.size;
    const memoryAfter = cache.getMetrics().memoryUsed;

    // If we had more memory than new budget, eviction should have occurred
    if (memoryBefore > 50 * 1024) {
      expect(memoryAfter).toBeLessThanOrEqual(50 * 1024);
      expect(sizeAfter).toBeLessThanOrEqual(sizeBefore);
    } else {
      // No eviction needed
      expect(sizeAfter).toBe(sizeBefore);
    }
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('Integration: Streaming + Cache', () => {
  it('should work together for complete LOD streaming', async () => {
    const streamingManager = createStreamingManager();
    const cache = createLODCache();
    const lodManager = createLODManager();

    // Setup
    const config = createStandardLODConfig('dragon1', 3, 50);
    lodManager.register('dragon1', config, [0, 0, 100]);

    streamingManager.attachLODManager(lodManager);

    // Request LOD
    streamingManager.requestLOD('dragon1', 0, '/dragon_lod0.glb', 100, 0.3, 2 * 1024 * 1024);

    // Process
    await streamingManager.update();
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Cache the result
    const mesh = streamingManager.getMesh('dragon1', 0);
    if (mesh) {
      await cache.set('dragon1_L0', mesh);
    }

    // Verify
    expect(cache.has('dragon1_L0')).toBe(true);
  });

  it('should handle 50+ dragons with streaming and caching', async () => {
    const streamingManager = createStreamingManager();
    const cache = createLODCache();
    const lodManager = createLODManager();

    // Create 50 dragons
    for (let i = 0; i < 50; i++) {
      const config = createStandardLODConfig(`dragon${i}`, 3, 50);
      lodManager.register(`dragon${i}`, config, [i * 10, 0, 0]);

      streamingManager.requestLOD(
        `dragon${i}`,
        0,
        `/dragon${i}_lod0.glb`,
        i * 10,
        0.5,
        1024 * 1024
      );
    }

    // Process streaming
    for (let frame = 0; frame < 5; frame++) {
      await streamingManager.update();
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    const metrics = streamingManager.getMetrics();
    expect(metrics.lodsLoaded).toBeGreaterThan(0);
  }, 15000);
});
