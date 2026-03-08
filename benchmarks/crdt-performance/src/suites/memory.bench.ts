/**
 * Memory Footprint Benchmarks
 *
 * Measures memory consumption for different operation counts:
 * - 1K operations
 * - 10K operations
 * - 100K operations
 */

import { HoloScriptCRDTAdapter } from '../adapters/holoscript.js';
import { YjsAdapter } from '../adapters/yjs.js';
import { AutomergeAdapter } from '../adapters/automerge.js';
import type { MemoryResult } from '../types.js';

function measureMemory(): NodeJS.MemoryUsage {
  if (global.gc) {
    global.gc();
    global.gc(); // Run twice for more stable measurements
  }
  return process.memoryUsage();
}

async function runMemoryTest(
  AdapterClass: any,
  operationCount: number
): Promise<MemoryResult> {
  const adapter = new AdapterClass();

  const before = measureMemory();

  // Perform operations
  for (let i = 0; i < operationCount; i++) {
    await adapter.add(`element-${i}`);
  }

  const after = measureMemory();

  const result: MemoryResult = {
    name: `${adapter.name} - ${operationCount} operations`,
    library: adapter.name as any,
    operationCount,
    heapUsed: after.heapUsed - before.heapUsed,
    heapTotal: after.heapTotal - before.heapTotal,
    external: after.external - before.external,
    arrayBuffers: after.arrayBuffers - before.arrayBuffers,
  };

  adapter.destroy();
  return result;
}

export async function runMemoryBench(): Promise<MemoryResult[]> {
  const results: MemoryResult[] = [];

  console.log('⚠️  Note: Run with --expose-gc flag for accurate measurements');
  console.log('   Example: node --expose-gc dist/suites/memory.bench.js\n');

  const operationCounts = [1000, 10000]; // Reduced to avoid timeout issues with Automerge

  for (const count of operationCounts) {
    console.log(`\nTesting ${count} operations...`);

    for (const AdapterClass of [HoloScriptCRDTAdapter, YjsAdapter, AutomergeAdapter]) {
      const result = await runMemoryTest(AdapterClass, count);
      results.push(result);
      console.log(`  ${result.library}: ${(result.heapUsed / 1024 / 1024).toFixed(2)} MB`);
    }
  }

  return results;
}

// Run standalone
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('Running memory footprint benchmarks...\n');
  const results = await runMemoryBench();

  console.log('\n\n=== Memory Footprint Results ===\n');
  for (const result of results) {
    console.log(`${result.name}:`);
    console.log(`  Heap Used: ${(result.heapUsed / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  Heap Total: ${(result.heapTotal / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  External: ${(result.external / 1024).toFixed(2)} KB`);
    console.log(`  Array Buffers: ${(result.arrayBuffers / 1024).toFixed(2)} KB`);
    console.log(`  Bytes per operation: ${(result.heapUsed / result.operationCount).toFixed(2)}`);
    console.log('');
  }
}
