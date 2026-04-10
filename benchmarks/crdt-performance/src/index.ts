/**
 * Main benchmark runner
 *
 * Runs all CRDT performance benchmarks and generates comprehensive report
 */

import chalk from 'chalk';
import { runOperationsBench } from './suites/operations.bench.js';
import { runMemoryBench } from './suites/memory.bench.js';
import { runSerializationBench } from './suites/serialization.bench.js';
import { runMergeBench } from './suites/merge.bench.js';
import { runSigningBench } from './suites/signing.bench.js';
import { generateReport } from './reporter.js';

async function main() {
  console.log(chalk.bold.cyan('\n╔════════════════════════════════════════════════════════════╗'));
  console.log(chalk.bold.cyan('║  CRDT Performance Benchmarks                              ║'));
  console.log(chalk.bold.cyan('║  Yjs vs Automerge vs @holoscript/crdt                     ║'));
  console.log(chalk.bold.cyan('╚════════════════════════════════════════════════════════════╝\n'));

  const allResults: any = {
    timestamp: new Date().toISOString(),
    platform: process.platform,
    nodeVersion: process.version,
    arch: process.arch,
  };

  // Run all benchmark suites
  console.log(chalk.bold.yellow('\n━━━ 1/5: Operation Latency Benchmarks ━━━\n'));
  allResults.operations = await runOperationsBench();

  console.log(chalk.bold.yellow('\n━━━ 2/5: Memory Footprint Benchmarks ━━━\n'));
  allResults.memory = await runMemoryBench();

  console.log(chalk.bold.yellow('\n━━━ 3/5: Serialization Benchmarks ━━━\n'));
  allResults.serialization = await runSerializationBench();

  console.log(chalk.bold.yellow('\n━━━ 4/5: Concurrent Merge Benchmarks ━━━\n'));
  allResults.merge = await runMergeBench();

  console.log(chalk.bold.yellow('\n━━━ 5/5: DID Signing Overhead Benchmarks ━━━\n'));
  allResults.signing = await runSigningBench();

  // Generate markdown report
  console.log(chalk.bold.green('\n━━━ Generating Report ━━━\n'));
  await generateReport(allResults);

  console.log(chalk.bold.green('\n✅ All benchmarks complete!'));
  console.log(chalk.dim('📄 Results written to: benchmarks/crdt-performance/RESULTS.md\n'));
}

main().catch(console.error);
