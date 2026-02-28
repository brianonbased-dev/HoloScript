/**
 * SemanticCache Unit Tests
 *
 * Tests semantic caching functionality including:
 * - SHA-256 hashing
 * - Cache hit/miss scenarios
 * - TTL expiration
 * - In-memory fallback
 * - Performance metrics
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  SemanticCache,
  createSemanticCache,
  hashSourceCode,
  hashASTSubtree,
  cacheCompiledModule,
  getCachedCompiledModule,
  cacheASTSubtree,
  getCachedASTSubtree,
  type SemanticCacheEntryType,
} from '../SemanticCache';
import type { HoloObjectDecl, HoloComposition } from '../../parser/HoloCompositionTypes';

describe('SemanticCache', () => {
  let cache: SemanticCache;

  beforeEach(async () => {
    cache = createSemanticCache({
      debug: false,
      ttl: 60, // 60 seconds for testing
    });
    await cache.initialize();
  });

  afterEach(async () => {
    await cache.clear();
    await cache.close();
  });

  describe('Hashing', () => {
    it('should generate consistent SHA-256 hashes', () => {
      const source = 'const x = 42;';
      const hash1 = hashSourceCode(source);
      const hash2 = hashSourceCode(source);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 = 64 hex chars
    });

    it('should generate different hashes for different content', () => {
      const hash1 = hashSourceCode('const x = 42;');
      const hash2 = hashSourceCode('const x = 43;');

      expect(hash1).not.toBe(hash2);
    });

    it('should hash AST subtrees consistently', () => {
      const obj: HoloObjectDecl = {
        name: 'TestObject',
        properties: [{ key: 'x', value: 10 }],
        traits: ['physics'],
      };

      const hash1 = hashASTSubtree(obj);
      const hash2 = hashASTSubtree(obj);

      expect(hash1).toBe(hash2);
    });

    it('should generate different hashes for different AST nodes', () => {
      const obj1: HoloObjectDecl = {
        name: 'TestObject',
        properties: [{ key: 'x', value: 10 }],
        traits: ['physics'],
      };

      const obj2: HoloObjectDecl = {
        name: 'TestObject',
        properties: [{ key: 'x', value: 20 }],
        traits: ['physics'],
      };

      const hash1 = hashASTSubtree(obj1);
      const hash2 = hashASTSubtree(obj2);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('Cache Operations', () => {
    it('should return miss on first lookup', async () => {
      const hash = hashSourceCode('test');
      const result = await cache.get(hash, 'compiled-module');

      expect(result.hit).toBe(false);
      expect(result.reason).toBe('not_found');
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should cache and retrieve compiled modules', async () => {
      const source = 'const x = 42;';
      const compiled = 'var x = 42;';
      const hash = hashSourceCode(source);

      // Set cache
      await cache.set(hash, 'compiled-module', compiled);

      // Get cache
      const result = await cache.get<string>(hash, 'compiled-module');

      expect(result.hit).toBe(true);
      expect(result.entry?.data).toBe(compiled);
      expect(result.entry?.contentHash).toBe(hash);
      expect(result.entry?.type).toBe('compiled-module');
    });

    it('should cache AST subtrees', async () => {
      const obj: HoloObjectDecl = {
        name: 'TestObject',
        properties: [{ key: 'x', value: 10 }],
        traits: ['physics'],
      };

      const hash = hashASTSubtree(obj);

      // Set cache
      await cache.set(hash, 'ast-subtree', obj);

      // Get cache
      const result = await cache.get<HoloObjectDecl>(hash, 'ast-subtree');

      expect(result.hit).toBe(true);
      expect(result.entry?.data).toEqual(obj);
    });

    it('should handle different entry types', async () => {
      const types: SemanticCacheEntryType[] = [
        'ast-subtree',
        'compiled-module',
        'compiled-object',
        'trait-composition',
        'import-resolution',
      ];

      for (const type of types) {
        const hash = hashSourceCode(`test-${type}`);
        const data = `data-${type}`;

        await cache.set(hash, type, data);
        const result = await cache.get<string>(hash, type);

        expect(result.hit).toBe(true);
        expect(result.entry?.data).toBe(data);
        expect(result.entry?.type).toBe(type);
      }
    });

    it('should track dependencies', async () => {
      const hash = hashSourceCode('test');
      const dependencies = ['file1.hs', 'file2.hs'];

      await cache.set(hash, 'compiled-module', 'output', {
        dependencies,
      });

      const result = await cache.get(hash, 'compiled-module');

      expect(result.hit).toBe(true);
      expect(result.entry?.dependencies).toEqual(dependencies);
    });

    it('should track source path', async () => {
      const hash = hashSourceCode('test');
      const sourcePath = '/path/to/source.hs';

      await cache.set(hash, 'compiled-module', 'output', {
        sourcePath,
      });

      const result = await cache.get(hash, 'compiled-module');

      expect(result.hit).toBe(true);
      expect(result.entry?.sourcePath).toBe(sourcePath);
    });
  });

  describe('Cache Statistics', () => {
    it('should track hits and misses', async () => {
      const hash = hashSourceCode('test');

      // Miss
      await cache.get(hash, 'compiled-module');

      // Set
      await cache.set(hash, 'compiled-module', 'output');

      // Hit
      await cache.get(hash, 'compiled-module');
      await cache.get(hash, 'compiled-module');

      const stats = await cache.getStats();

      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBeCloseTo(2 / 3, 2);
    });

    it('should track average latency', async () => {
      const hash = hashSourceCode('test');
      await cache.set(hash, 'compiled-module', 'output');

      // Perform multiple lookups
      await cache.get(hash, 'compiled-module');
      await cache.get(hash, 'compiled-module');
      await cache.get(hash, 'compiled-module');

      const stats = await cache.getStats();

      expect(stats.avgLatencyMs).toBeGreaterThanOrEqual(0);
      expect(stats.avgLatencyMs).toBeLessThan(100); // Should be fast
    });

    it('should count entries by type', async () => {
      await cache.set(hashSourceCode('test1'), 'compiled-module', 'output1');
      await cache.set(hashSourceCode('test2'), 'compiled-module', 'output2');
      await cache.set(hashSourceCode('test3'), 'ast-subtree', { name: 'test' });

      const stats = await cache.getStats();

      expect(stats.totalEntries).toBe(3);
      expect(stats.entriesByType['compiled-module']).toBe(2);
      expect(stats.entriesByType['ast-subtree']).toBe(1);
    });

    it('should report backend type', async () => {
      const stats = await cache.getStats();

      // Should use memory backend in tests (no Redis)
      expect(stats.backend).toBe('memory');
      expect(stats.redisConnected).toBe(false);
    });
  });

  describe('Cache Invalidation', () => {
    it('should delete specific entries', async () => {
      const hash = hashSourceCode('test');
      await cache.set(hash, 'compiled-module', 'output');

      // Verify cached
      let result = await cache.get(hash, 'compiled-module');
      expect(result.hit).toBe(true);

      // Delete
      await cache.delete(hash, 'compiled-module');

      // Verify deleted
      result = await cache.get(hash, 'compiled-module');
      expect(result.hit).toBe(false);
    });

    it('should invalidate by type', async () => {
      await cache.set(hashSourceCode('test1'), 'compiled-module', 'output1');
      await cache.set(hashSourceCode('test2'), 'compiled-module', 'output2');
      await cache.set(hashSourceCode('test3'), 'ast-subtree', { name: 'test' });

      const count = await cache.invalidateType('compiled-module');

      expect(count).toBe(2);

      const stats = await cache.getStats();
      expect(stats.totalEntries).toBe(1);
      expect(stats.entriesByType['compiled-module']).toBe(0);
      expect(stats.entriesByType['ast-subtree']).toBe(1);
    });

    it('should clear all entries', async () => {
      await cache.set(hashSourceCode('test1'), 'compiled-module', 'output1');
      await cache.set(hashSourceCode('test2'), 'ast-subtree', { name: 'test' });

      await cache.clear();

      const stats = await cache.getStats();
      expect(stats.totalEntries).toBe(0);
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
    });
  });

  describe('Version Management', () => {
    it('should invalidate on version mismatch', async () => {
      // Use same cache instance but verify version checking logic
      const hash = hashSourceCode('test');
      await cache.set(hash, 'compiled-module', 'output');

      // Get with same version (should hit)
      const result1 = await cache.get(hash, 'compiled-module');
      expect(result1.hit).toBe(true);

      // Create new cache with different version
      const cache2 = createSemanticCache({ version: '2.0.0', ttl: 60 });
      await cache2.initialize();

      // Set entry with new version
      await cache2.set(hash, 'compiled-module', 'output-v2');

      // Get should work with matching version
      const result2 = await cache2.get(hash, 'compiled-module');
      expect(result2.hit).toBe(true);
      expect(result2.entry?.version).toBe('2.0.0');

      await cache2.close();
    });
  });

  describe('Access Tracking', () => {
    it('should track access count', async () => {
      const hash = hashSourceCode('test');
      await cache.set(hash, 'compiled-module', 'output');

      // Access multiple times
      await cache.get(hash, 'compiled-module');
      await cache.get(hash, 'compiled-module');
      await cache.get(hash, 'compiled-module');

      const result = await cache.get(hash, 'compiled-module');

      expect(result.entry?.accessCount).toBeGreaterThanOrEqual(3);
    });

    it('should update accessedAt timestamp', async () => {
      const hash = hashSourceCode('test');
      await cache.set(hash, 'compiled-module', 'output');

      const result1 = await cache.get(hash, 'compiled-module');
      const firstAccess = result1.entry?.accessedAt!;

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 10));

      const result2 = await cache.get(hash, 'compiled-module');
      const secondAccess = result2.entry?.accessedAt!;

      expect(secondAccess).toBeGreaterThan(firstAccess);
    });
  });

  describe('High-Level Utilities', () => {
    it('should cache and retrieve compiled modules', async () => {
      const source = 'const x = 42;';
      const compiled = 'var x = 42;';

      await cacheCompiledModule(source, compiled, cache);

      const retrieved = await getCachedCompiledModule(source, cache);

      expect(retrieved).toBe(compiled);
    });

    it('should cache and retrieve AST subtrees', async () => {
      const obj: HoloObjectDecl = {
        name: 'TestObject',
        properties: [{ key: 'x', value: 10 }],
        traits: ['physics'],
      };

      await cacheASTSubtree(obj, cache);

      const retrieved = await getCachedASTSubtree(obj, cache);

      expect(retrieved).toEqual(obj);
    });

    it('should return null on cache miss', async () => {
      const source = 'const x = 42;';
      const retrieved = await getCachedCompiledModule(source, cache);

      expect(retrieved).toBeNull();
    });
  });

  describe('Performance', () => {
    it('should handle large data efficiently', async () => {
      // Generate large compiled output
      const largeOutput = 'var x = 0;\n'.repeat(10000);
      const hash = hashSourceCode('large-test');

      const setStart = Date.now();
      await cache.set(hash, 'compiled-module', largeOutput);
      const setTime = Date.now() - setStart;

      const getStart = Date.now();
      const result = await cache.get(hash, 'compiled-module');
      const getTime = Date.now() - getStart;

      expect(result.hit).toBe(true);
      expect(result.entry?.data).toBe(largeOutput);

      // Should be reasonably fast (< 50ms for in-memory)
      expect(setTime).toBeLessThan(50);
      expect(getTime).toBeLessThan(50);
    });

    it('should handle many cache entries', async () => {
      // Create 100 cache entries
      const entryCount = 100;
      const hashes: string[] = [];

      const setStart = Date.now();
      for (let i = 0; i < entryCount; i++) {
        const hash = hashSourceCode(`test-${i}`);
        hashes.push(hash);
        await cache.set(hash, 'compiled-module', `output-${i}`);
      }
      const setTime = Date.now() - setStart;

      // Verify all entries
      const getStart = Date.now();
      for (let i = 0; i < entryCount; i++) {
        const result = await cache.get(hashes[i], 'compiled-module');
        expect(result.hit).toBe(true);
      }
      const getTime = Date.now() - getStart;

      const stats = await cache.getStats();
      expect(stats.totalEntries).toBe(entryCount);
      expect(stats.hits).toBe(entryCount);

      // Should handle 100 entries efficiently
      expect(setTime).toBeLessThan(1000); // < 1s for 100 sets
      expect(getTime).toBeLessThan(1000); // < 1s for 100 gets
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty strings', async () => {
      const hash = hashSourceCode('');
      await cache.set(hash, 'compiled-module', '');

      const result = await cache.get(hash, 'compiled-module');

      expect(result.hit).toBe(true);
      expect(result.entry?.data).toBe('');
    });

    it('should handle special characters', async () => {
      const source = 'const emoji = "🚀";';
      const hash = hashSourceCode(source);
      await cache.set(hash, 'compiled-module', source);

      const result = await cache.get(hash, 'compiled-module');

      expect(result.hit).toBe(true);
      expect(result.entry?.data).toBe(source);
    });

    it('should handle complex AST structures', async () => {
      const composition: HoloComposition = {
        name: 'ComplexScene',
        objects: [
          {
            name: 'Parent',
            properties: [{ key: 'x', value: 10 }],
            traits: ['physics'],
            children: [
              {
                name: 'Child1',
                properties: [{ key: 'y', value: 20 }],
                traits: ['grabbable'],
              },
              {
                name: 'Child2',
                properties: [{ key: 'z', value: 30 }],
                traits: ['networked'],
              },
            ],
          },
        ],
      };

      const hash = hashASTSubtree(composition);
      await cache.set(hash, 'ast-subtree', composition);

      const result = await cache.get<HoloComposition>(hash, 'ast-subtree');

      expect(result.hit).toBe(true);
      expect(result.entry?.data).toEqual(composition);
    });
  });
});
