/**
 * Quick benchmark - simplified version that runs fast
 */

import { HoloScriptCRDTAdapter } from './adapters/holoscript.js';
import { YjsAdapter } from './adapters/yjs.js';
import { AutomergeAdapter } from './adapters/automerge.js';

async function quickBench() {
  console.log('\n=== Quick CRDT Benchmarks ===\n');

  // Simple operation test
  console.log('Testing basic operations (100 iterations)...\n');

  const adapters = [
    new HoloScriptCRDTAdapter(),
    new YjsAdapter(),
    new AutomergeAdapter(),
  ];

  for (const adapter of adapters) {
    const start = performance.now();

    for (let i = 0; i < 100; i++) {
      await adapter.add(`element-${i}`);
    }

    const end = performance.now();
    const totalTime = end - start;
    const avgTime = totalTime / 100;

    console.log(`${adapter.name}:`);
    console.log(`  Total: ${totalTime.toFixed(2)} ms`);
    console.log(`  Avg per op: ${avgTime.toFixed(4)} ms`);
    console.log(`  Ops/sec: ${(1000 / avgTime).toFixed(0)}`);
    console.log('');

    adapter.destroy();
  }

  console.log('\n✅ Quick benchmark complete!\n');
}

quickBench().catch(console.error);
