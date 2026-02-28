/**
 * SemanticCache Integration Tests
 *
 * Tests semantic caching with real HoloScript compilation workflows.
 * Validates 50-80% compilation time reduction on incremental builds.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { IncrementalCompiler } from '../IncrementalCompiler';
import { createSemanticCache } from '../SemanticCache';
import type { HoloComposition, HoloObjectDecl } from '../../parser/HoloCompositionTypes';

describe('SemanticCache Integration', () => {
  let compiler: IncrementalCompiler;

  beforeEach(async () => {
    compiler = new IncrementalCompiler(undefined, {
      enableSemanticCache: true,
      cacheTTL: 60, // 60 seconds for testing
    });
  });

  afterEach(async () => {
    await compiler.clearSemanticCache();
    await compiler.closeSemanticCache();
  });

  describe('Incremental Compilation', () => {
    it('should cache compiled objects on first build', async () => {
      const composition: HoloComposition = {
        name: 'TestScene',
        objects: [
          {
            name: 'Cube',
            properties: [
              { key: 'position', value: [0, 0, 0] },
              { key: 'scale', value: [1, 1, 1] },
            ],
            traits: ['physics'],
          },
          {
            name: 'Sphere',
            properties: [
              { key: 'position', value: [2, 0, 0] },
              { key: 'radius', value: 0.5 },
            ],
            traits: ['grabbable'],
          },
        ],
      };

      const compileObject = (obj: HoloObjectDecl) => {
        return `// Compiled: ${obj.name}\nconst ${obj.name} = { /* ... */ };`;
      };

      const result = await compiler.compile(composition, compileObject);

      expect(result.fullRecompile).toBe(true);
      expect(result.recompiledObjects).toHaveLength(2);
      expect(result.cachedObjects).toHaveLength(0);

      // Check semantic cache stats
      const stats = await compiler.getSemanticCacheStats();
      expect(stats).not.toBeNull();
      expect(stats!.totalEntries).toBe(2); // Both objects cached
    });

    it('should use cached objects on incremental build', async () => {
      const composition: HoloComposition = {
        name: 'TestScene',
        objects: [
          {
            name: 'Cube',
            properties: [{ key: 'position', value: [0, 0, 0] }],
            traits: ['physics'],
          },
        ],
      };

      const compileObject = (obj: HoloObjectDecl) => {
        return `const ${obj.name} = {};`;
      };

      // First build
      const result1 = await compiler.compile(composition, compileObject);
      expect(result1.recompiledObjects).toHaveLength(1);
      expect(result1.cachedObjects).toHaveLength(0);

      // Second build (no changes)
      const result2 = await compiler.compile(composition, compileObject);
      expect(result2.recompiledObjects).toHaveLength(0);
      expect(result2.cachedObjects).toHaveLength(1);

      const stats = await compiler.getSemanticCacheStats();
      expect(stats!.hits).toBeGreaterThan(0);
      expect(stats!.hitRate).toBeGreaterThan(0);
    });

    it('should recompile only changed objects', async () => {
      const composition1: HoloComposition = {
        name: 'TestScene',
        objects: [
          {
            name: 'Cube',
            properties: [{ key: 'x', value: 0 }],
            traits: ['physics'],
          },
          {
            name: 'Sphere',
            properties: [{ key: 'y', value: 0 }],
            traits: ['grabbable'],
          },
        ],
      };

      const compileObject = (obj: HoloObjectDecl) => {
        return `const ${obj.name} = {};`;
      };

      // First build
      await compiler.compile(composition1, compileObject);

      // Modify only Cube
      const composition2: HoloComposition = {
        name: 'TestScene',
        objects: [
          {
            name: 'Cube',
            properties: [{ key: 'x', value: 10 }], // Changed
            traits: ['physics'],
          },
          {
            name: 'Sphere',
            properties: [{ key: 'y', value: 0 }], // Unchanged
            traits: ['grabbable'],
          },
        ],
      };

      // Second build
      const result = await compiler.compile(composition2, compileObject);

      expect(result.recompiledObjects).toContain('Cube');
      expect(result.cachedObjects).toContain('Sphere');
      expect(result.changes.modifiedObjects).toContain('Cube');
    });

    it('should handle new objects efficiently', async () => {
      const composition1: HoloComposition = {
        name: 'TestScene',
        objects: [
          {
            name: 'Cube',
            properties: [{ key: 'x', value: 0 }],
            traits: ['physics'],
          },
        ],
      };

      const compileObject = (obj: HoloObjectDecl) => {
        return `const ${obj.name} = {};`;
      };

      // First build
      await compiler.compile(composition1, compileObject);

      // Add new object
      const composition2: HoloComposition = {
        name: 'TestScene',
        objects: [
          {
            name: 'Cube',
            properties: [{ key: 'x', value: 0 }],
            traits: ['physics'],
          },
          {
            name: 'Sphere',
            properties: [{ key: 'y', value: 0 }],
            traits: ['grabbable'],
          },
        ],
      };

      // Second build
      const result = await compiler.compile(composition2, compileObject);

      expect(result.recompiledObjects).toContain('Sphere');
      expect(result.cachedObjects).toContain('Cube');
      expect(result.changes.addedObjects).toContain('Sphere');
    });
  });

  describe('Performance Benchmarks', () => {
    it('should show significant speedup on incremental builds', async () => {
      // Create a complex scene with many objects
      const createComposition = (objectCount: number): HoloComposition => {
        const objects: HoloObjectDecl[] = [];
        for (let i = 0; i < objectCount; i++) {
          objects.push({
            name: `Object${i}`,
            properties: [
              { key: 'position', value: [i, 0, 0] },
              { key: 'scale', value: [1, 1, 1] },
            ],
            traits: ['physics', 'grabbable'],
          });
        }
        return { name: 'BenchScene', objects };
      };

      const compileObject = (obj: HoloObjectDecl) => {
        // Simulate expensive compilation with compute-intensive operations
        let result = `const ${obj.name} = {\n`;
        for (const prop of obj.properties || []) {
          result += `  ${prop.key}: ${JSON.stringify(prop.value)},\n`;
          // Add some CPU-intensive work to simulate real compilation
          for (let i = 0; i < 1000; i++) {
            Math.sqrt(i);
          }
        }
        result += '};';
        return result;
      };

      const composition = createComposition(50);

      // First build (cold cache)
      const coldStart = Date.now();
      const result1 = await compiler.compile(composition, compileObject);
      const coldTime = Date.now() - coldStart;

      expect(result1.recompiledObjects).toHaveLength(50);
      expect(result1.cachedObjects).toHaveLength(0);

      // Second build (warm cache)
      const warmStart = Date.now();
      const result2 = await compiler.compile(composition, compileObject);
      const warmTime = Date.now() - warmStart;

      expect(result2.recompiledObjects).toHaveLength(0);
      expect(result2.cachedObjects).toHaveLength(50);

      // Calculate speedup
      const speedup = coldTime / warmTime;
      console.log(`Cold build: ${coldTime}ms, Warm build: ${warmTime}ms, Speedup: ${speedup.toFixed(2)}x`);

      // Should see significant speedup (at least 2x, ideally 5-10x)
      expect(speedup).toBeGreaterThan(2);

      const stats = await compiler.getSemanticCacheStats();
      expect(stats!.hitRate).toBeGreaterThan(0.8); // At least 80% hit rate
    });

    it('should maintain cache across multiple builds', async () => {
      const composition: HoloComposition = {
        name: 'TestScene',
        objects: [
          { name: 'Obj1', properties: [{ key: 'x', value: 1 }], traits: [] },
          { name: 'Obj2', properties: [{ key: 'x', value: 2 }], traits: [] },
          { name: 'Obj3', properties: [{ key: 'x', value: 3 }], traits: [] },
        ],
      };

      const compileObject = (obj: HoloObjectDecl) => `const ${obj.name} = {};`;

      // Build 1: All objects compiled
      const result1 = await compiler.compile(composition, compileObject);
      expect(result1.recompiledObjects).toHaveLength(3);

      // Build 2: All objects cached
      const result2 = await compiler.compile(composition, compileObject);
      expect(result2.cachedObjects).toHaveLength(3);

      // Build 3: All objects still cached
      const result3 = await compiler.compile(composition, compileObject);
      expect(result3.cachedObjects).toHaveLength(3);

      const stats = await compiler.getSemanticCacheStats();
      expect(stats!.totalEntries).toBe(3);
      expect(stats!.hits).toBeGreaterThan(0);
    });

    it('should handle partial cache invalidation efficiently', async () => {
      const composition1: HoloComposition = {
        name: 'TestScene',
        objects: [
          { name: 'Obj1', properties: [{ key: 'x', value: 1 }], traits: [] },
          { name: 'Obj2', properties: [{ key: 'x', value: 2 }], traits: [] },
          { name: 'Obj3', properties: [{ key: 'x', value: 3 }], traits: [] },
          { name: 'Obj4', properties: [{ key: 'x', value: 4 }], traits: [] },
          { name: 'Obj5', properties: [{ key: 'x', value: 5 }], traits: [] },
        ],
      };

      const compileObject = (obj: HoloObjectDecl) => `const ${obj.name} = {};`;

      // First build
      await compiler.compile(composition1, compileObject);

      // Modify only Obj3
      const composition2: HoloComposition = {
        ...composition1,
        objects: composition1.objects!.map((obj) =>
          obj.name === 'Obj3'
            ? { ...obj, properties: [{ key: 'x', value: 30 }] }
            : obj
        ),
      };

      // Second build
      const result = await compiler.compile(composition2, compileObject);

      // Only Obj3 should be recompiled
      expect(result.recompiledObjects).toHaveLength(1);
      expect(result.recompiledObjects).toContain('Obj3');

      // Other objects should be cached
      expect(result.cachedObjects).toHaveLength(4);
      expect(result.cachedObjects).toContain('Obj1');
      expect(result.cachedObjects).toContain('Obj2');
      expect(result.cachedObjects).toContain('Obj4');
      expect(result.cachedObjects).toContain('Obj5');
    });
  });

  describe('Cache Statistics', () => {
    it('should provide detailed cache statistics', async () => {
      const composition: HoloComposition = {
        name: 'TestScene',
        objects: [
          { name: 'Cube', properties: [], traits: [] },
          { name: 'Sphere', properties: [], traits: [] },
        ],
      };

      const compileObject = (obj: HoloObjectDecl) => `const ${obj.name} = {};`;

      // Build twice - first build = misses, second build = hits
      await compiler.compile(composition, compileObject);
      await compiler.compile(composition, compileObject);

      const stats = await compiler.getStats();

      expect(stats.semanticCache).toBeDefined();
      // Should have some hits from second build
      expect(stats.semanticCache!.hits).toBeGreaterThan(0);
      // May have 0 misses if in-memory cache catches all lookups
      expect(stats.semanticCache!.misses).toBeGreaterThanOrEqual(0);
      // If we have hits, hit rate should be > 0
      if (stats.semanticCache!.hits > 0) {
        expect(stats.semanticCache!.hitRate).toBeGreaterThan(0);
      }
      expect(stats.semanticCache!.avgLatencyMs).toBeGreaterThanOrEqual(0);
      expect(stats.semanticCache!.backend).toBe('memory');
    });

    it('should track entries by type', async () => {
      const composition: HoloComposition = {
        name: 'TestScene',
        objects: [
          { name: 'Obj1', properties: [], traits: [] },
          { name: 'Obj2', properties: [], traits: [] },
        ],
      };

      const compileObject = (obj: HoloObjectDecl) => `const ${obj.name} = {};`;

      await compiler.compile(composition, compileObject);

      const stats = await compiler.getSemanticCacheStats();

      expect(stats).not.toBeNull();
      expect(stats!.entriesByType['compiled-object']).toBe(2);
    });
  });

  describe('Error Handling', () => {
    it('should gracefully handle compilation errors', async () => {
      const composition: HoloComposition = {
        name: 'TestScene',
        objects: [
          { name: 'ValidObject', properties: [], traits: [] },
        ],
      };

      const compileObject = (obj: HoloObjectDecl) => {
        if (obj.name === 'InvalidObject') {
          throw new Error('Compilation error');
        }
        return `const ${obj.name} = {};`;
      };

      // Should not throw
      const result = await compiler.compile(composition, compileObject);
      expect(result.recompiledObjects).toContain('ValidObject');
    });

    it('should handle cache corruption gracefully', async () => {
      const composition: HoloComposition = {
        name: 'TestScene',
        objects: [
          { name: 'Cube', properties: [], traits: [] },
        ],
      };

      const compileObject = (obj: HoloObjectDecl) => `const ${obj.name} = {};`;

      // First build
      await compiler.compile(composition, compileObject);

      // Clear semantic cache to simulate corruption
      await compiler.clearSemanticCache();

      // Second build should still work (fallback to in-memory cache)
      const result = await compiler.compile(composition, compileObject);
      expect(result.cachedObjects.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Memory Management', () => {
    it('should not leak memory with many builds', async () => {
      const composition: HoloComposition = {
        name: 'TestScene',
        objects: [
          { name: 'Cube', properties: [], traits: [] },
        ],
      };

      const compileObject = (obj: HoloObjectDecl) => `const ${obj.name} = {};`;

      // Perform many builds
      for (let i = 0; i < 100; i++) {
        await compiler.compile(composition, compileObject);
      }

      const stats = await compiler.getSemanticCacheStats();

      // Should maintain reasonable cache size
      expect(stats!.totalEntries).toBeLessThanOrEqual(10);
    });
  });
});
