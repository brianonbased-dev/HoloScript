/**
 * Performance Benchmarking Suite
 *
 * Comprehensive benchmarks for:
 * - AI adapter response times
 * - Parser performance
 * - Cache effectiveness
 * - Batch generation throughput
 * - Memory usage
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { HoloScriptGenerator } from '@holoscript/framework/ai';
import { GenerationCache, cachedGenerate } from './GenerationCache';
import { HoloScriptPlusParser } from '../parser/HoloScriptPlusParser';

// =============================================================================
// MOCK ADAPTER FOR BENCHMARKS
// =============================================================================

class BenchmarkAdapter {
  readonly id = 'benchmark';
  readonly name = 'BenchmarkAdapter';
  private responseDelayMs: number;

  constructor(delayMs: number = 100) {
    this.responseDelayMs = delayMs;
  }

  isReady() {
    return true;
  }

  async generateHoloScript() {
    await this.sleep(this.responseDelayMs);
    return {
      holoScript: `orb #test { geometry: "sphere"; position: [0, 0, 0] }`,
      confidence: 0.95,
    };
  }

  async explainHoloScript() {
    return { explanation: 'Test code' };
  }

  async optimizeHoloScript(code: string) {
    return { holoScript: code, improvements: ['benchmark optimization'] };
  }

  async fixHoloScript(code: string) {
    return { holoScript: code, fixes: [] as Array<{ line: number; issue: string; fix: string }> };
  }

  async chat(message: string) {
    return message;
  }

  async getEmbeddings(texts: string[]) {
    return texts.map(() => [0.1, 0.2, 0.3]);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// =============================================================================
// BENCHMARK UTILITIES
// =============================================================================

interface BenchmarkResult {
  name: string;
  operationsCount: number;
  totalTimeMs: number;
  avgTimeMs: number;
  opsPerSecond: number;
  minTimeMs: number;
  maxTimeMs: number;
  stdDevMs: number;
}

function calculateStats(times: number[]): Omit<BenchmarkResult, 'name' | 'operationsCount'> {
  const sorted = [...times].sort((a, b) => a - b);
  const total = times.reduce((a, b) => a + b, 0);
  const avg = total / times.length;
  const variance = times.reduce((sum, t) => sum + Math.pow(t - avg, 2), 0) / times.length;
  const stdDev = Math.sqrt(variance);

  return {
    totalTimeMs: total,
    avgTimeMs: avg,
    opsPerSecond: (times.length / total) * 1000,
    minTimeMs: sorted[0],
    maxTimeMs: sorted[sorted.length - 1],
    stdDevMs: stdDev,
  };
}

function printBenchmarkResult(result: BenchmarkResult): void {
  console.log(`\n${result.name}:`);
  console.log(`  Operations: ${result.operationsCount}`);
  console.log(`  Total Time: ${result.totalTimeMs.toFixed(0)}ms`);
  console.log(`  Avg Time: ${result.avgTimeMs.toFixed(2)}ms`);
  console.log(`  Throughput: ${result.opsPerSecond.toFixed(2)} ops/sec`);
  console.log(`  Min/Max: ${result.minTimeMs.toFixed(2)}ms / ${result.maxTimeMs.toFixed(2)}ms`);
  console.log(`  Std Dev: ${result.stdDevMs.toFixed(2)}ms`);
}

// =============================================================================
// BENCHMARKS
// =============================================================================

describe('Performance Benchmarks', () => {
  let parser: HoloScriptPlusParser;
  let cache: GenerationCache;

  beforeEach(() => {
    parser = new HoloScriptPlusParser({ strict: false });
    cache = new GenerationCache({ maxSize: 10000 });
  });

  // =========================================================================
  // PARSER PERFORMANCE
  // =========================================================================

  describe('Parser Performance', () => {
    it('should parse simple code efficiently', () => {
      const code = `orb #test { geometry: "sphere" }`;
      const times: number[] = [];

      for (let i = 0; i < 1000; i++) {
        const start = performance.now();
        parser.parse(code);
        times.push(performance.now() - start);
      }

      const stats = calculateStats(times);
      const result: BenchmarkResult = {
        name: 'Parse Simple Code (1000 iterations)',
        operationsCount: 1000,
        ...stats,
      };

      printBenchmarkResult(result);
      expect(result.avgTimeMs).toBeLessThan(10);
    });

    it('should parse complex code efficiently', () => {
      const code = `
composition "ComplexScene" {
  environment { skybox: "default"; ambient_light: 0.5 }
  
  object "Player" {
    @grabbable
    @networked
    geometry: "humanoid"
    position: [0, 1.6, 0]
    scale: 1.0
    physics: { mass: 1.0; type: "dynamic" }
  }
  
  object "Enemy" {
    geometry: "sphere"
    position: [5, 1, 0]
    scale: 0.5
  }
}
      `.trim();

      const times: number[] = [];

      for (let i = 0; i < 100; i++) {
        const start = performance.now();
        parser.parse(code);
        times.push(performance.now() - start);
      }

      const stats = calculateStats(times);
      const result: BenchmarkResult = {
        name: 'Parse Complex Code (100 iterations)',
        operationsCount: 100,
        ...stats,
      };

      printBenchmarkResult(result);
      expect(result.avgTimeMs).toBeLessThan(50);
    });

    it('should parse large code efficiently', () => {
      let code = `composition "LargeScene" { environment { skybox: "default" }`;

      for (let i = 0; i < 50; i++) {
        code += `\n  object "Obj${i}" { geometry: "cube"; position: [${i}, 0, 0] }`;
      }

      code += '\n}';

      const times: number[] = [];

      for (let i = 0; i < 50; i++) {
        const start = performance.now();
        parser.parse(code);
        times.push(performance.now() - start);
      }

      const stats = calculateStats(times);
      const result: BenchmarkResult = {
        name: 'Parse Large Code (50 iterations)',
        operationsCount: 50,
        ...stats,
      };

      printBenchmarkResult(result);
      expect(result.avgTimeMs).toBeLessThan(100);
    });
  });

  // =========================================================================
  // CACHE PERFORMANCE
  // =========================================================================

  describe('Cache Performance', () => {
    it('should demonstrate cache hit efficiency', async () => {
      const adapter = new BenchmarkAdapter(50); // 50ms per call
      const prompt = 'Test prompt';

      // First call (cache miss)
      const uncachedStart = performance.now();
      await cachedGenerate(prompt, 'test', cache, () => adapter.generateHoloScript());
      const uncachedTime = performance.now() - uncachedStart;

      // Second call (cache hit)
      const cachedStart = performance.now();
      await cachedGenerate(prompt, 'test', cache, () => adapter.generateHoloScript());
      const cachedTime = performance.now() - cachedStart;

      console.log(`\nCache Performance:`);
      console.log(`  Uncached (with API): ${uncachedTime.toFixed(2)}ms`);
      console.log(`  Cached (from cache): ${cachedTime.toFixed(2)}ms`);
      console.log(`  Speedup: ${(uncachedTime / cachedTime).toFixed(1)}x`);

      expect(cachedTime).toBeLessThan(uncachedTime);
      expect(cachedTime).toBeLessThan(5);
    });

    it('should track cache statistics', () => {
      for (let i = 0; i < 100; i++) {
        cache.set(`prompt-${i % 10}`, `code-${i}`, 0.9, 'adapter');
      }

      const stats = cache.getStats();

      console.log(`\nCache Statistics:`);
      console.log(`  Entries: ${stats.entriesCount}`);
      console.log(`  Total Hits: ${stats.totalHits}`);
      console.log(`  Total Misses: ${stats.totalMisses}`);
      console.log(`  Hit Rate: ${(stats.hitRate * 100).toFixed(1)}%`);

      expect(stats.entriesCount).toBeGreaterThan(0);
    });

    it('should evict LRU entries correctly', () => {
      const smallCache = new GenerationCache({ maxSize: 10 });

      // Fill cache beyond limit
      for (let i = 0; i < 20; i++) {
        smallCache.set(`prompt-${i}`, `code-${i}`, 0.9, 'adapter');
      }

      const stats = smallCache.getStats();

      console.log(`\nLRU Eviction:`);
      console.log(`  Max Size: ${stats.maxSize}`);
      console.log(`  Current Size: ${stats.entriesCount}`);

      // Cache should not store all 20 items (should evict some)
      expect(stats.entriesCount).toBeLessThan(20);
    });
  });

  // =========================================================================
  // GENERATION PERFORMANCE
  // =========================================================================

  describe('Generation Performance', () => {
    it('should measure single generation time', async () => {
      const generator = new HoloScriptGenerator();
      const adapter = new BenchmarkAdapter(100);
      const session = generator.createSession(adapter);

      const times: number[] = [];

      for (let i = 0; i < 5; i++) {
        const start = performance.now();
        await generator.generate(`Prompt ${i}`, session);
        times.push(performance.now() - start);
      }

      const stats = calculateStats(times);
      const result: BenchmarkResult = {
        name: 'Single Generation (5 iterations)',
        operationsCount: 5,
        ...stats,
      };

      printBenchmarkResult(result);
    });

    it('should measure batch generation throughput', async () => {
      const generator = new HoloScriptGenerator();
      const adapter = new BenchmarkAdapter(50);
      const session = generator.createSession(adapter);

      const prompts = Array.from({ length: 10 }, (_, i) => `Prompt ${i}`);

      const start = performance.now();
      for (const prompt of prompts) {
        await generator.generate(prompt, session);
      }
      const totalTime = performance.now() - start;

      const throughput = (prompts.length / totalTime) * 1000;

      console.log(`\nBatch Generation (10 prompts):`);
      console.log(`  Total Time: ${totalTime.toFixed(0)}ms`);
      console.log(`  Throughput: ${throughput.toFixed(2)} prompts/sec`);
      console.log(`  Avg Per Prompt: ${(totalTime / prompts.length).toFixed(0)}ms`);

      expect(throughput).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // SESSION PERFORMANCE
  // =========================================================================

  describe('Session Performance', () => {
    it('should track session statistics efficiently', async () => {
      const generator = new HoloScriptGenerator();
      const adapter = new BenchmarkAdapter(25);
      const session = generator.createSession(adapter);

      // Generate multiple
      for (let i = 0; i < 10; i++) {
        await generator.generate(`Prompt ${i}`, session);
      }

      // Get stats multiple times
      const times: number[] = [];

      for (let i = 0; i < 100; i++) {
        const start = performance.now();
        generator.getStats(session);
        times.push(performance.now() - start);
      }

      const stats = calculateStats(times);
      const result: BenchmarkResult = {
        name: 'Get Stats (100 iterations)',
        operationsCount: 100,
        ...stats,
      };

      printBenchmarkResult(result);
      expect(result.avgTimeMs).toBeLessThan(1);
    });
  });

  // =========================================================================
  // MEMORY PERFORMANCE
  // =========================================================================

  describe('Memory Performance', () => {
    it('should estimate cache memory usage', () => {
      for (let i = 0; i < 100; i++) {
        const code = `orb #test${i} { geometry: "cube"; position: [${i}, 0, 0] }`;
        cache.set(`Prompt ${i}`, code, 0.9, 'adapter');
      }

      const serialized = cache.serialize();
      const sizeBytes = serialized.length;
      const sizeKB = sizeBytes / 1024;

      console.log(`\nCache Memory Usage:`);
      console.log(`  Entries: 100`);
      console.log(`  Total Size: ${sizeBytes} bytes (${sizeKB.toFixed(2)} KB)`);
      console.log(`  Avg Per Entry: ${(sizeBytes / 100).toFixed(0)} bytes`);

      expect(sizeKB).toBeLessThan(100); // Should be reasonably small
    });
  });

  // =========================================================================
  // COMPARISON BENCHMARKS
  // =========================================================================

  describe('Comparison Benchmarks', () => {
    it('should compare cached vs uncached performance', async () => {
      const adapter = new BenchmarkAdapter(100);
      const noCacheGen = () => adapter.generateHoloScript();

      const uncachedTimes: number[] = [];

      for (let i = 0; i < 5; i++) {
        const start = performance.now();
        await noCacheGen();
        uncachedTimes.push(performance.now() - start);
      }

      const uncachedAvg = uncachedTimes.reduce((a, b) => a + b) / uncachedTimes.length;

      const freshCache = new GenerationCache();
      const cachedTimes: number[] = [];

      for (let i = 0; i < 5; i++) {
        const start = performance.now();
        await cachedGenerate(`prompt-${i}`, 'adapter', freshCache, noCacheGen);
        cachedTimes.push(performance.now() - start);
      }

      // All from cache (same prompt)
      const cachedHits: number[] = [];
      for (let i = 0; i < 5; i++) {
        const start = performance.now();
        await cachedGenerate(`prompt-0`, 'adapter', freshCache, noCacheGen);
        cachedHits.push(performance.now() - start);
      }

      const hitAvg = cachedHits.reduce((a, b) => a + b) / cachedHits.length;

      console.log(`\nCached vs Uncached Comparison:`);
      console.log(`  Uncached (API calls): ${uncachedAvg.toFixed(2)}ms avg`);
      console.log(`  Cached (hits): ${hitAvg.toFixed(2)}ms avg`);
      console.log(`  Speedup: ${(uncachedAvg / hitAvg).toFixed(1)}x faster`);

      expect(hitAvg).toBeLessThan(uncachedAvg);
    });
  });
});
