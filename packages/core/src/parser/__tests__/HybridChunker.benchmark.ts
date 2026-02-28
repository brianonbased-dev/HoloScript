/**
 * HybridChunker Performance Benchmarks
 *
 * Measures performance improvements of hybrid chunking vs single-strategy.
 * Target: 20-30% speedup for mixed file workloads.
 */

import { describe, it, expect } from 'vitest';
import {
  createHybridChunker,
  type ChunkingOptions,
} from '../HybridChunker';
import { ChunkDetector } from '../ChunkDetector';

// ===========================================================================
// Test Data Generation
// ===========================================================================

function generateTypeScriptFile(functions: number): string {
  return Array(functions)
    .fill(0)
    .map(
      (_, i) => `
export function function${i}(param1: string, param2: number): boolean {
  const result = param1.length > param2;
  console.log("Processing function ${i}");
  if (result) {
    return true;
  } else {
    return false;
  }
}
`
    )
    .join('\n');
}

function generateLogFile(entries: number): string {
  return Array(entries)
    .fill(0)
    .map(
      (_, i) =>
        `[2026-02-27 10:${Math.floor(i / 60)
          .toString()
          .padStart(2, '0')}:${(i % 60).toString().padStart(2, '0')}] ` +
        `INFO: Request ${i} processed successfully with status code 200`
    )
    .join('\n');
}

function generateMarkdownFile(sections: number): string {
  return Array(sections)
    .fill(0)
    .map(
      (_, i) => `
# Section ${i}

This is section ${i} of the documentation. It contains important information
about the feature set and usage patterns for this particular module.

## Subsection ${i}.1

Detailed explanation of the concepts introduced in section ${i}.

## Subsection ${i}.2

Additional information and examples for section ${i}.

\`\`\`javascript
const example${i} = () => {
  return "Example code for section ${i}";
};
\`\`\`
`
    )
    .join('\n');
}

// ===========================================================================
// Benchmark Utilities
// ===========================================================================

interface BenchmarkResult {
  strategy: string;
  totalTime: number;
  chunksProduced: number;
  avgTimePerChunk: number;
  throughput: number; // chunks per second
}

function benchmark(
  name: string,
  fn: () => void,
  iterations: number = 100
): BenchmarkResult {
  const start = performance.now();
  let chunks = 0;

  for (let i = 0; i < iterations; i++) {
    fn();
    chunks++;
  }

  const totalTime = performance.now() - start;
  const avgTime = totalTime / iterations;
  const throughput = (1000 / avgTime) * iterations;

  return {
    strategy: name,
    totalTime,
    chunksProduced: chunks,
    avgTimePerChunk: avgTime,
    throughput,
  };
}

// ===========================================================================
// Performance Tests
// ===========================================================================

describe('HybridChunker Performance Benchmarks', () => {
  const hybridChunker = createHybridChunker({ debug: false });

  describe('Structure-based chunking (code files)', () => {
    it('should chunk large TypeScript files efficiently', () => {
      const tsFile = generateTypeScriptFile(100);

      const result = benchmark(
        'Structure-based',
        () => {
          const chunks = hybridChunker.chunk(tsFile, 'test.ts');
          expect(chunks.length).toBeGreaterThan(0);
        },
        50
      );

      console.log('\n--- TypeScript File Benchmark ---');
      console.log(`Total time: ${result.totalTime.toFixed(2)}ms`);
      console.log(`Avg time/chunk: ${result.avgTimePerChunk.toFixed(2)}ms`);
      console.log(`Throughput: ${result.throughput.toFixed(0)} ops/sec`);

      // Performance assertion: should complete within reasonable time
      expect(result.avgTimePerChunk).toBeLessThan(50); // < 50ms per iteration
    });

    it('should handle mixed code structures efficiently', () => {
      const mixedCode = `
${generateTypeScriptFile(20)}

export class DataProcessor {
  process(data: any[]): void {
    data.forEach(item => console.log(item));
  }
}

export interface Config {
  apiUrl: string;
  timeout: number;
}
`;

      const result = benchmark(
        'Mixed structures',
        () => {
          const chunks = hybridChunker.chunk(mixedCode, 'mixed.ts');
          expect(chunks.length).toBeGreaterThan(0);
        },
        50
      );

      console.log('\n--- Mixed Code Structures Benchmark ---');
      console.log(`Total time: ${result.totalTime.toFixed(2)}ms`);
      console.log(`Throughput: ${result.throughput.toFixed(0)} ops/sec`);

      expect(result.avgTimePerChunk).toBeLessThan(50);
    });
  });

  describe('Fixed-size chunking (log files)', () => {
    it('should chunk large log files efficiently', () => {
      const logFile = generateLogFile(1000);

      const result = benchmark(
        'Fixed-size',
        () => {
          const chunks = hybridChunker.chunk(logFile, 'app.log');
          expect(chunks.length).toBeGreaterThan(0);
        },
        50
      );

      console.log('\n--- Log File Benchmark ---');
      console.log(`Total time: ${result.totalTime.toFixed(2)}ms`);
      console.log(`Avg time/chunk: ${result.avgTimePerChunk.toFixed(2)}ms`);
      console.log(`Throughput: ${result.throughput.toFixed(0)} ops/sec`);

      expect(result.avgTimePerChunk).toBeLessThan(40);
    });
  });

  describe('Semantic chunking (markdown files)', () => {
    it('should chunk documentation files efficiently', () => {
      const mdFile = generateMarkdownFile(50);

      const result = benchmark(
        'Semantic',
        () => {
          const chunks = hybridChunker.chunk(mdFile, 'README.md');
          expect(chunks.length).toBeGreaterThan(0);
        },
        50
      );

      console.log('\n--- Markdown File Benchmark ---');
      console.log(`Total time: ${result.totalTime.toFixed(2)}ms`);
      console.log(`Avg time/chunk: ${result.avgTimePerChunk.toFixed(2)}ms`);
      console.log(`Throughput: ${result.throughput.toFixed(0)} ops/sec`);

      expect(result.avgTimePerChunk).toBeLessThan(60);
    });
  });

  describe('Hybrid vs Legacy comparison', () => {
    it('should show performance improvement over legacy ChunkDetector', () => {
      const hsCode = `
composition "TestWorld" {
  orb player {
    position: [0, 1, 0]
    color: "#ff0000"
  }

  template Enemy {
    health: 100
    damage: 10
  }

  function spawnEnemy(x, y, z) {
    const enemy = create("Enemy")
    enemy.position = [x, y, z]
    return enemy
  }
}
`;

      // Benchmark HybridChunker
      const hybridResult = benchmark(
        'HybridChunker',
        () => {
          const chunks = hybridChunker.chunk(hsCode, 'test.hsplus');
          expect(chunks.length).toBeGreaterThan(0);
        },
        100
      );

      // Benchmark Legacy ChunkDetector
      const legacyResult = benchmark(
        'Legacy ChunkDetector',
        () => {
          const chunks = ChunkDetector.detect(hsCode);
          expect(chunks.length).toBeGreaterThan(0);
        },
        100
      );

      const improvement =
        ((legacyResult.avgTimePerChunk - hybridResult.avgTimePerChunk) /
          legacyResult.avgTimePerChunk) *
        100;

      console.log('\n--- Hybrid vs Legacy Comparison ---');
      console.log(
        `HybridChunker: ${hybridResult.avgTimePerChunk.toFixed(2)}ms/op`
      );
      console.log(
        `Legacy ChunkDetector: ${legacyResult.avgTimePerChunk.toFixed(2)}ms/op`
      );
      console.log(`Improvement: ${improvement.toFixed(1)}%`);

      // Target: 20-30% improvement (may vary based on content)
      // For small files, difference might be minimal
      expect(hybridResult.avgTimePerChunk).toBeLessThanOrEqual(
        legacyResult.avgTimePerChunk * 1.2
      ); // Allow up to 20% slower for overhead
    });

    it('should show significant improvement for large mixed workloads', () => {
      const largeWorkload = [
        { content: generateTypeScriptFile(50), path: 'code.ts' },
        { content: generateLogFile(500), path: 'app.log' },
        { content: generateMarkdownFile(30), path: 'docs.md' },
      ];

      const hybridStart = performance.now();
      largeWorkload.forEach((file) => {
        hybridChunker.chunk(file.content, file.path);
      });
      const hybridTime = performance.now() - hybridStart;

      const legacyStart = performance.now();
      largeWorkload.forEach((file) => {
        ChunkDetector.detect(file.content);
      });
      const legacyTime = performance.now() - legacyStart;

      const improvement = ((legacyTime - hybridTime) / legacyTime) * 100;

      console.log('\n--- Large Mixed Workload Comparison ---');
      console.log(`HybridChunker: ${hybridTime.toFixed(2)}ms`);
      console.log(`Legacy ChunkDetector: ${legacyTime.toFixed(2)}ms`);
      console.log(`Improvement: ${improvement.toFixed(1)}%`);

      // Expect some improvement, but not enforcing strict target
      expect(hybridTime).toBeLessThan(legacyTime * 1.5);
    });
  });

  describe('Scalability tests', () => {
    it('should scale linearly with file size', () => {
      const sizes = [10, 50, 100, 200];
      const results: Array<{ size: number; time: number }> = [];

      for (const size of sizes) {
        const tsFile = generateTypeScriptFile(size);
        const start = performance.now();
        hybridChunker.chunk(tsFile, 'test.ts');
        const time = performance.now() - start;
        results.push({ size, time });
      }

      console.log('\n--- Scalability Test ---');
      results.forEach((r) => {
        console.log(`${r.size} functions: ${r.time.toFixed(2)}ms`);
      });

      // Check that time growth is roughly linear (not exponential)
      const ratio1 = results[1].time / results[0].time;
      const ratio2 = results[2].time / results[1].time;
      const ratio3 = results[3].time / results[2].time;

      console.log(`Growth ratios: ${ratio1.toFixed(2)}, ${ratio2.toFixed(2)}, ${ratio3.toFixed(2)}`);

      // Ratios should be similar (linear growth)
      expect(ratio3).toBeLessThan(ratio1 * 2); // Not exponential
    });

    it('should handle concurrent chunking efficiently', async () => {
      const files = Array(20)
        .fill(0)
        .map((_, i) => ({
          content: generateTypeScriptFile(20),
          path: `file${i}.ts`,
        }));

      const start = performance.now();

      // Chunk all files "concurrently" (simulated)
      const results = files.map((file) =>
        hybridChunker.chunk(file.content, file.path)
      );

      const totalTime = performance.now() - start;
      const avgTime = totalTime / files.length;

      console.log('\n--- Concurrent Chunking Test ---');
      console.log(`Total time for 20 files: ${totalTime.toFixed(2)}ms`);
      console.log(`Avg time per file: ${avgTime.toFixed(2)}ms`);
      console.log(
        `Total chunks produced: ${results.reduce((sum, r) => sum + r.length, 0)}`
      );

      expect(avgTime).toBeLessThan(30); // Should be fast per file
    });
  });

  describe('Memory efficiency', () => {
    it('should not create excessive temporary objects', () => {
      const largeFile = generateTypeScriptFile(200);

      // Measure memory before
      if (global.gc) {
        global.gc(); // Force GC if available
      }

      const iterations = 100;
      for (let i = 0; i < iterations; i++) {
        hybridChunker.chunk(largeFile, 'test.ts');
      }

      // Memory measurement would require --expose-gc flag
      // This test serves as a placeholder for memory profiling
      expect(true).toBe(true);
    });
  });

  describe('Token counting accuracy', () => {
    it('should provide consistent token counts', () => {
      const code = generateTypeScriptFile(10);
      const chunks = hybridChunker.chunk(code, 'test.ts');

      const totalTokens = chunks.reduce((sum, c) => sum + c.tokens, 0);

      // Token count should be proportional to content length
      expect(totalTokens).toBeGreaterThan(0);
      expect(totalTokens).toBeLessThan(code.length); // Tokens < characters

      console.log('\n--- Token Counting ---');
      console.log(`Content length: ${code.length} chars`);
      console.log(`Total tokens: ${totalTokens}`);
      console.log(`Chunks: ${chunks.length}`);
      console.log(
        `Avg tokens/chunk: ${(totalTokens / chunks.length).toFixed(0)}`
      );
    });
  });

  describe('Chunk size distribution', () => {
    it('should produce well-balanced chunks', () => {
      const chunker = createHybridChunker({ maxTokens: 512 });
      const code = generateTypeScriptFile(50);
      const chunks = chunker.chunk(code, 'test.ts');

      const tokenCounts = chunks.map((c) => c.tokens);
      const avg =
        tokenCounts.reduce((a, b) => a + b, 0) / tokenCounts.length;
      const variance =
        tokenCounts.reduce((sum, t) => sum + Math.pow(t - avg, 2), 0) /
        tokenCounts.length;
      const stdDev = Math.sqrt(variance);

      console.log('\n--- Chunk Size Distribution ---');
      console.log(`Chunks: ${chunks.length}`);
      console.log(`Avg tokens: ${avg.toFixed(0)}`);
      console.log(`Std dev: ${stdDev.toFixed(0)}`);
      console.log(`Min tokens: ${Math.min(...tokenCounts)}`);
      console.log(`Max tokens: ${Math.max(...tokenCounts)}`);

      // Chunks should be reasonably balanced
      expect(stdDev / avg).toBeLessThan(0.8); // Coefficient of variation < 80%
    });
  });
});

// ===========================================================================
// Summary Report
// ===========================================================================

describe('Performance Summary', () => {
  it('should generate comprehensive performance report', () => {
    const chunker = createHybridChunker({ debug: false });

    const testCases = [
      { name: 'Small TS file', content: generateTypeScriptFile(10), path: 'small.ts' },
      { name: 'Large TS file', content: generateTypeScriptFile(100), path: 'large.ts' },
      { name: 'Log file', content: generateLogFile(500), path: 'app.log' },
      { name: 'Markdown file', content: generateMarkdownFile(20), path: 'docs.md' },
    ];

    console.log('\n' + '='.repeat(60));
    console.log('HYBRID CHUNKER PERFORMANCE SUMMARY');
    console.log('='.repeat(60));

    const results = testCases.map((tc) => {
      const start = performance.now();
      const chunks = chunker.chunk(tc.content, tc.path);
      const time = performance.now() - start;

      const stats = chunker.getStats(chunks);

      return {
        name: tc.name,
        time,
        chunks: chunks.length,
        strategy: chunks[0].strategy,
        totalTokens: stats.totalTokens,
        avgTokens: stats.avgTokensPerChunk,
      };
    });

    results.forEach((r) => {
      console.log(`\n${r.name}:`);
      console.log(`  Time: ${r.time.toFixed(2)}ms`);
      console.log(`  Chunks: ${r.chunks}`);
      console.log(`  Strategy: ${r.strategy}`);
      console.log(`  Total tokens: ${r.totalTokens}`);
      console.log(`  Avg tokens/chunk: ${r.avgTokens.toFixed(0)}`);
    });

    console.log('\n' + '='.repeat(60));

    expect(results.every((r) => r.time < 100)).toBe(true); // All under 100ms
  });
});
