/**
 * Serialization Size Benchmarks
 *
 * Measures wire format efficiency:
 * - Serialized size after N operations
 * - Serialization time
 * - Deserialization time
 */

import { HoloScriptCRDTAdapter } from '../adapters/holoscript.js';
import { YjsAdapter } from '../adapters/yjs.js';
import { AutomergeAdapter } from '../adapters/automerge.js';
import type { SerializationResult } from '../types.js';

async function runSerializationTest(
  AdapterClass: any,
  operationCount: number
): Promise<SerializationResult> {
  const adapter = new AdapterClass();

  // Perform operations
  for (let i = 0; i < operationCount; i++) {
    await adapter.add(`element-${i}`);
  }

  // Measure serialization
  const serializeStart = performance.now();
  const serialized = adapter.serialize();
  const serializeTime = performance.now() - serializeStart;

  const serializedSize =
    typeof serialized === 'string' ? new Blob([serialized]).size : serialized.byteLength;

  // Measure deserialization
  const newAdapter = new AdapterClass();
  const deserializeStart = performance.now();
  newAdapter.deserialize(serialized);
  const deserializeTime = performance.now() - deserializeStart;

  const result: SerializationResult = {
    name: `${adapter.name} - ${operationCount} operations`,
    library: adapter.name as any,
    operationCount,
    serializedSize,
    serializeTime,
    deserializeTime,
  };

  adapter.destroy();
  newAdapter.destroy();

  return result;
}

export async function runSerializationBench(): Promise<SerializationResult[]> {
  const results: SerializationResult[] = [];

  const operationCounts = [1000, 10000]; // Reduced to avoid timeout issues with Automerge

  for (const count of operationCounts) {
    console.log(`\nTesting ${count} operations...`);

    for (const AdapterClass of [HoloScriptCRDTAdapter, YjsAdapter, AutomergeAdapter]) {
      const result = await runSerializationTest(AdapterClass, count);
      results.push(result);
      console.log(`  ${result.library}: ${(result.serializedSize / 1024).toFixed(2)} KB`);
    }
  }

  return results;
}

// Run standalone
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('Running serialization benchmarks...\n');
  const results = await runSerializationBench();

  console.log('\n\n=== Serialization Results ===\n');
  for (const result of results) {
    console.log(`${result.name}:`);
    console.log(`  Size: ${(result.serializedSize / 1024).toFixed(2)} KB`);
    console.log(`  Serialize time: ${result.serializeTime.toFixed(4)} ms`);
    console.log(`  Deserialize time: ${result.deserializeTime.toFixed(4)} ms`);
    console.log(
      `  Bytes per operation: ${(result.serializedSize / result.operationCount).toFixed(2)}`
    );
    console.log('');
  }
}
