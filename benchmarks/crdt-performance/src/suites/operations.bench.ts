/**
 * Operation Latency Benchmarks
 *
 * Measures the latency of basic CRDT operations:
 * - Insert/set operations
 * - Delete/remove operations
 * - Increment operations (counters)
 */

import { Bench } from 'tinybench';
import { HoloScriptCRDTAdapter } from '../adapters/holoscript.js';
import { YjsAdapter } from '../adapters/yjs.js';
import { AutomergeAdapter } from '../adapters/automerge.js';
import type { BenchmarkResult } from '../types.js';

export async function runOperationsBench(): Promise<BenchmarkResult[]> {
  const results: BenchmarkResult[] = [];

  // === Register/Text Set Operations ===
  const setTestData = Array.from({ length: 100 }, (_, i) => `test-value-${i}`);

  for (const AdapterClass of [HoloScriptCRDTAdapter, YjsAdapter, AutomergeAdapter]) {
    const bench = new Bench({ time: 2000, iterations: 1000 });
    const adapter = new AdapterClass();
    let index = 0;

    bench.add(`${adapter.name} - register set`, async () => {
      await adapter.setText(setTestData[index++ % setTestData.length]);
    });

    await bench.run();

    const task = bench.tasks[0];
    results.push({
      name: `${adapter.name} - register set`,
      library: adapter.name as any,
      operation: 'set',
      avgTime: task.result!.mean,
      minTime: task.result!.min,
      maxTime: task.result!.max,
      ops: task.result!.totalTime,
      samples: task.result!.samples.length,
      hz: task.result!.hz,
      margin: task.result!.rme,
    });

    adapter.destroy();
  }

  // === Counter Increment Operations ===
  for (const AdapterClass of [HoloScriptCRDTAdapter, YjsAdapter, AutomergeAdapter]) {
    const bench = new Bench({ time: 2000, iterations: 1000 });
    const adapter = new AdapterClass();

    bench.add(`${adapter.name} - counter increment`, async () => {
      await adapter.increment(1);
    });

    await bench.run();

    const task = bench.tasks[0];
    results.push({
      name: `${adapter.name} - counter increment`,
      library: adapter.name as any,
      operation: 'increment',
      avgTime: task.result!.mean,
      minTime: task.result!.min,
      maxTime: task.result!.max,
      ops: task.result!.totalTime,
      samples: task.result!.samples.length,
      hz: task.result!.hz,
      margin: task.result!.rme,
    });

    adapter.destroy();
  }

  // === Set Add Operations ===
  for (const AdapterClass of [HoloScriptCRDTAdapter, YjsAdapter, AutomergeAdapter]) {
    const bench = new Bench({ time: 2000, iterations: 1000 });
    const adapter = new AdapterClass();
    let index = 0;

    bench.add(`${adapter.name} - set add`, async () => {
      await adapter.add(`element-${index++}`);
    });

    await bench.run();

    const task = bench.tasks[0];
    results.push({
      name: `${adapter.name} - set add`,
      library: adapter.name as any,
      operation: 'add',
      avgTime: task.result!.mean,
      minTime: task.result!.min,
      maxTime: task.result!.max,
      ops: task.result!.totalTime,
      samples: task.result!.samples.length,
      hz: task.result!.hz,
      margin: task.result!.rme,
    });

    adapter.destroy();
  }

  // === Set Remove Operations ===
  for (const AdapterClass of [HoloScriptCRDTAdapter, YjsAdapter, AutomergeAdapter]) {
    const bench = new Bench({ time: 2000, iterations: 500 });
    const adapter = new AdapterClass();

    // Pre-populate with elements
    for (let i = 0; i < 500; i++) {
      await adapter.add(`element-${i}`);
    }

    let removeIndex = 0;

    bench.add(`${adapter.name} - set remove`, async () => {
      await adapter.remove(`element-${removeIndex++}`);
    });

    await bench.run();

    const task = bench.tasks[0];
    results.push({
      name: `${adapter.name} - set remove`,
      library: adapter.name as any,
      operation: 'remove',
      avgTime: task.result!.mean,
      minTime: task.result!.min,
      maxTime: task.result!.max,
      ops: task.result!.totalTime,
      samples: task.result!.samples.length,
      hz: task.result!.hz,
      margin: task.result!.rme,
    });

    adapter.destroy();
  }

  return results;
}

// Run standalone
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('Running operation latency benchmarks...\n');
  const results = await runOperationsBench();

  console.log('\n=== Operation Latency Results ===\n');
  for (const result of results) {
    console.log(`${result.name}:`);
    console.log(`  Avg: ${(result.avgTime * 1000).toFixed(4)} μs`);
    console.log(`  Min: ${(result.minTime * 1000).toFixed(4)} μs`);
    console.log(`  Max: ${(result.maxTime * 1000).toFixed(4)} μs`);
    console.log(`  Ops/sec: ${result.hz.toFixed(0)}`);
    console.log(`  Margin: ±${result.margin.toFixed(2)}%`);
    console.log('');
  }
}
