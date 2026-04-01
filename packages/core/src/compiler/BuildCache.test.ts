/**
 * BuildCache Tests
 *
 * Sprint 4 Priority 3: Build Caching
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, writeFileSync, unlinkSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  BuildCache,
  createBuildCache,
  ContentAddressableStore,
  createBuildManifest,
  validateBuildManifest,
  type CacheEntryType,
  type BuildArtifact,
} from './BuildCache';

// Test directory
const TEST_CACHE_DIR = join(tmpdir(), 'holoscript-cache-test-' + Date.now());
const TEST_SOURCE_DIR = join(tmpdir(), 'holoscript-source-test-' + Date.now());

describe('BuildCache', () => {
  let cache: BuildCache;
  let testSourceFile: string;

  beforeEach(async () => {
    // Create test directories
    if (!existsSync(TEST_CACHE_DIR)) {
      mkdirSync(TEST_CACHE_DIR, { recursive: true });
    }
    if (!existsSync(TEST_SOURCE_DIR)) {
      mkdirSync(TEST_SOURCE_DIR, { recursive: true });
    }

    // Create test source file
    testSourceFile = join(TEST_SOURCE_DIR, 'test.holo');
    writeFileSync(testSourceFile, 'orb "Test" { color: "red" }');

    // Create cache instance
    cache = createBuildCache({
      cacheDir: TEST_CACHE_DIR,
      version: '1.0.0',
      debug: false,
    });

    await cache.initialize();
  });

  afterEach(async () => {
    await cache.clear();

    // Clean up test directories
    if (existsSync(TEST_CACHE_DIR)) {
      rmSync(TEST_CACHE_DIR, { recursive: true, force: true });
    }
    if (existsSync(TEST_SOURCE_DIR)) {
      rmSync(TEST_SOURCE_DIR, { recursive: true, force: true });
    }
  });

  describe('Initialization', () => {
    it('should create cache directories', async () => {
      const types: CacheEntryType[] = ['ast', 'compiled', 'bundle', 'sourcemap', 'metadata'];
      for (const type of types) {
        expect(existsSync(join(TEST_CACHE_DIR, type))).toBe(true);
      }
    });

    it('should initialize with default options', () => {
      const c = createBuildCache({ cacheDir: TEST_CACHE_DIR });
      expect(c).toBeInstanceOf(BuildCache);
    });

    it('should handle multiple initialize calls', async () => {
      await cache.initialize();
      await cache.initialize();
      // Should not throw
    });
  });

  describe('Cache Operations', () => {
    it('should store and retrieve cache entries', async () => {
      const testData = { ast: { type: 'composition', objects: [] } };

      await cache.set(testSourceFile, 'ast', testData);
      const result = await cache.get(testSourceFile, 'ast');

      expect(result.hit).toBe(true);
      expect(result.entry?.data).toEqual(testData);
    });

    it('should report cache miss for non-existent entries', async () => {
      const result = await cache.get('/nonexistent/file.holo', 'ast');

      expect(result.hit).toBe(false);
      expect(result.reason).toBe('not_found');
    });

    it('should invalidate cache on source file change', async () => {
      const testData = { ast: { type: 'composition' } };
      await cache.set(testSourceFile, 'ast', testData);

      // Verify cache hit
      let result = await cache.get(testSourceFile, 'ast');
      expect(result.hit).toBe(true);

      // Modify source file (with slight delay to ensure different mtime)
      await new Promise((resolve) => setTimeout(resolve, 10));
      writeFileSync(testSourceFile, 'orb "Test" { color: "blue" }');

      // Cache should now be stale
      result = await cache.get(testSourceFile, 'ast');
      expect(result.hit).toBe(false);
      expect(result.reason).toBe('stale');
    });

    it('should invalidate specific cache types', async () => {
      await cache.set(testSourceFile, 'ast', { ast: true });
      await cache.set(testSourceFile, 'compiled', { compiled: true });

      // Invalidate only AST
      const count = await cache.invalidate(testSourceFile, ['ast']);
      expect(count).toBe(1);

      // AST should be gone
      const astResult = await cache.get(testSourceFile, 'ast');
      expect(astResult.hit).toBe(false);

      // Compiled should still exist
      const compiledResult = await cache.get(testSourceFile, 'compiled');
      expect(compiledResult.hit).toBe(true);
    });

    it('should invalidate all types when not specified', async () => {
      await cache.set(testSourceFile, 'ast', { ast: true });
      await cache.set(testSourceFile, 'compiled', { compiled: true });

      const count = await cache.invalidate(testSourceFile);
      expect(count).toBe(2);

      const astResult = await cache.get(testSourceFile, 'ast');
      expect(astResult.hit).toBe(false);

      const compiledResult = await cache.get(testSourceFile, 'compiled');
      expect(compiledResult.hit).toBe(false);
    });
  });

  describe('Dependencies', () => {
    it('should track dependencies and invalidate dependents', async () => {
      const baseFile = join(TEST_SOURCE_DIR, 'base.holo');
      writeFileSync(baseFile, 'template "Base" { color: "red" }');

      const mainFile = join(TEST_SOURCE_DIR, 'main.holo');
      writeFileSync(mainFile, 'orb "Main" { ...Base }');

      // Cache main with dependency on base
      await cache.set(
        mainFile,
        'compiled',
        { main: true },
        {
          dependencies: [baseFile],
        }
      );

      // Verify cache hit
      let result = await cache.get(mainFile, 'compiled');
      expect(result.hit).toBe(true);

      // Invalidate dependents of base
      const count = await cache.invalidateDependents(baseFile);
      expect(count).toBe(1);

      // Main should be invalidated
      result = await cache.get(mainFile, 'compiled');
      expect(result.hit).toBe(false);
    });
  });

  describe('Tags', () => {
    it('should support tags for bulk invalidation', async () => {
      const file1 = join(TEST_SOURCE_DIR, 'file1.holo');
      const file2 = join(TEST_SOURCE_DIR, 'file2.holo');
      writeFileSync(file1, 'orb "F1" {}');
      writeFileSync(file2, 'orb "F2" {}');

      await cache.set(file1, 'compiled', { f1: true }, { tags: ['production'] });
      await cache.set(file2, 'compiled', { f2: true }, { tags: ['development'] });

      // Invalidate by tag
      const count = await cache.invalidateByTag('production');
      expect(count).toBe(1);

      // Production cache should be gone
      const f1Result = await cache.get(file1, 'compiled');
      expect(f1Result.hit).toBe(false);

      // Development cache should remain
      const f2Result = await cache.get(file2, 'compiled');
      expect(f2Result.hit).toBe(true);
    });
  });

  describe('Statistics', () => {
    it('should track hit and miss counts', async () => {
      await cache.set(testSourceFile, 'ast', { test: true });

      // Hit
      await cache.get(testSourceFile, 'ast');
      // Miss
      await cache.get('/nonexistent.holo', 'ast');
      await cache.get('/another.holo', 'ast');

      const stats = cache.getStats();
      expect(stats.hitCount).toBe(1);
      expect(stats.missCount).toBe(2);
      expect(stats.hitRate).toBeCloseTo(1 / 3);
    });

    it('should track entries by type', async () => {
      await cache.set(testSourceFile, 'ast', { ast: true });
      await cache.set(testSourceFile, 'compiled', { compiled: true });
      await cache.set(testSourceFile, 'bundle', { bundle: true });

      const stats = cache.getStats();
      expect(stats.totalEntries).toBe(3);
      expect(stats.entriesByType.ast).toBe(1);
      expect(stats.entriesByType.compiled).toBe(1);
      expect(stats.entriesByType.bundle).toBe(1);
    });

    it('should track total size', async () => {
      await cache.set(testSourceFile, 'ast', { large: 'x'.repeat(1000) });

      const stats = cache.getStats();
      expect(stats.totalSize).toBeGreaterThan(1000);
    });
  });

  describe('Cache Management', () => {
    it('should clear all entries', async () => {
      await cache.set(testSourceFile, 'ast', { ast: true });
      await cache.set(testSourceFile, 'compiled', { compiled: true });

      await cache.clear();

      const stats = cache.getStats();
      expect(stats.totalEntries).toBe(0);
    });

    it('should prune expired entries', async () => {
      // Create cache with very short TTL
      const shortTTLCache = createBuildCache({
        cacheDir: TEST_CACHE_DIR + '-ttl',
        version: '1.0.0',
        ttl: 1, // 1ms TTL
        debug: false,
      });

      mkdirSync(TEST_CACHE_DIR + '-ttl', { recursive: true });
      await shortTTLCache.initialize();

      await shortTTLCache.set(testSourceFile, 'ast', { test: true });

      // Wait for TTL to expire
      await new Promise((resolve) => setTimeout(resolve, 10));

      const prunedCount = await shortTTLCache.prune();
      expect(prunedCount).toBeGreaterThanOrEqual(1);

      await shortTTLCache.clear();
      rmSync(TEST_CACHE_DIR + '-ttl', { recursive: true, force: true });
    });

    it('should list cached files', async () => {
      const file1 = join(TEST_SOURCE_DIR, 'f1.holo');
      const file2 = join(TEST_SOURCE_DIR, 'f2.holo');
      writeFileSync(file1, 'orb "F1" {}');
      writeFileSync(file2, 'orb "F2" {}');

      await cache.set(file1, 'ast', { f1: true });
      await cache.set(file2, 'ast', { f2: true });

      const files = cache.getCachedFiles();
      expect(files).toContain(file1);
      expect(files).toContain(file2);
    });
  });

  describe('Version Management', () => {
    it('should invalidate cache on version change', async () => {
      // Set cache with v1
      await cache.set(testSourceFile, 'ast', { v1: true });

      // Create new cache with different version
      const v2Cache = createBuildCache({
        cacheDir: TEST_CACHE_DIR,
        version: '2.0.0',
        debug: false,
      });

      await v2Cache.initialize();

      // Cache should be cleared due to version mismatch
      const result = await v2Cache.get(testSourceFile, 'ast');
      expect(result.hit).toBe(false);
    });
  });

  describe('Cache Warming', () => {
    it('should warm cache for multiple files', async () => {
      const file1 = join(TEST_SOURCE_DIR, 'w1.holo');
      const file2 = join(TEST_SOURCE_DIR, 'w2.holo');
      writeFileSync(file1, 'orb "W1" {}');
      writeFileSync(file2, 'orb "W2" {}');

      // Pre-cache file1
      await cache.set(file1, 'ast', { pre: true });

      const result = await cache.warmCache([file1, file2], 'ast', async (path) => ({
        computed: path,
      }));

      expect(result.cached).toBe(1);
      expect(result.computed).toBe(1);
    });
  });
});

describe('ContentAddressableStore', () => {
  let store: ContentAddressableStore;
  const storeDir = join(tmpdir(), 'holoscript-cas-test-' + Date.now());

  beforeEach(() => {
    store = new ContentAddressableStore(storeDir);
  });

  afterEach(() => {
    if (existsSync(storeDir)) {
      rmSync(storeDir, { recursive: true, force: true });
    }
  });

  it('should store and retrieve content', () => {
    const content = 'Hello, World!';
    const hash = store.store(content);

    expect(hash).toBeDefined();
    expect(hash.length).toBe(16);

    const retrieved = store.retrieve(hash);
    expect(retrieved).toBe(content);
  });

  it('should return same hash for same content', () => {
    const content = 'Same content';
    const hash1 = store.store(content);
    const hash2 = store.store(content);

    expect(hash1).toBe(hash2);
  });

  it('should return different hashes for different content', () => {
    const hash1 = store.store('Content A');
    const hash2 = store.store('Content B');

    expect(hash1).not.toBe(hash2);
  });

  it('should check if content exists', () => {
    const hash = store.store('Test content');

    expect(store.has(hash)).toBe(true);
    expect(store.has('nonexistent')).toBe(false);
  });

  it('should remove content', () => {
    const hash = store.store('To be removed');

    expect(store.has(hash)).toBe(true);
    const removed = store.remove(hash);
    expect(removed).toBe(true);
    expect(store.has(hash)).toBe(false);
  });

  it('should return null for non-existent content', () => {
    const result = store.retrieve('nonexistent');
    expect(result).toBeNull();
  });
});

describe('Build Manifest', () => {
  const manifestDir = join(tmpdir(), 'holoscript-manifest-test-' + Date.now());
  let sourceFile: string;

  beforeEach(() => {
    mkdirSync(manifestDir, { recursive: true });
    sourceFile = join(manifestDir, 'source.holo');
    writeFileSync(sourceFile, 'orb "Test" {}');
  });

  afterEach(() => {
    if (existsSync(manifestDir)) {
      rmSync(manifestDir, { recursive: true, force: true });
    }
  });

  it('should create a build manifest', () => {
    const artifacts: BuildArtifact[] = [
      {
        type: 'js',
        hash: 'abc123',
        size: 1024,
        createdAt: Date.now(),
        sourceFiles: [sourceFile],
      },
    ];

    const manifest = createBuildManifest([sourceFile], artifacts, { target: 'web' });

    expect(manifest.version).toBe('1.0.0');
    expect(manifest.buildId).toContain('build-');
    expect(manifest.artifacts).toEqual(artifacts);
    expect(manifest.sourceHashes[sourceFile]).toBeDefined();
    expect(manifest.metadata.target).toBe('web');
  });

  it('should validate unchanged manifest', () => {
    const manifest = createBuildManifest([sourceFile], []);
    const result = validateBuildManifest(manifest);

    expect(result.valid).toBe(true);
    expect(result.changedFiles).toEqual([]);
    expect(result.missingFiles).toEqual([]);
  });

  it('should detect changed files', async () => {
    const manifest = createBuildManifest([sourceFile], []);

    // Wait and modify file
    await new Promise((resolve) => setTimeout(resolve, 10));
    writeFileSync(sourceFile, 'orb "Modified" {}');

    const result = validateBuildManifest(manifest);

    expect(result.valid).toBe(false);
    expect(result.changedFiles).toContain(sourceFile);
  });

  it('should detect missing files', () => {
    const manifest = createBuildManifest([sourceFile], []);

    // Remove file
    unlinkSync(sourceFile);

    const result = validateBuildManifest(manifest);

    expect(result.valid).toBe(false);
    expect(result.missingFiles).toContain(sourceFile);
  });
});
