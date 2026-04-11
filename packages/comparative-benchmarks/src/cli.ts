#!/usr/bin/env node

/**
 * CLI for running comparative benchmarks
 */

import { runComparativeBenchmarks } from './index';
import * as fs from 'fs/promises';
import * as path from 'path';

async function main() {
  const args = process.argv.slice(2);
  const _target = args.find((arg) => arg.startsWith('--target='))?.split('=')[1] || 'all';

  console.log('HoloScript Comparative Benchmarks CLI\n');

  const { results, report } = await runComparativeBenchmarks();

  // Save results
  const resultsDir = path.join(process.cwd(), 'results');
  await fs.mkdir(resultsDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const resultsFile = path.join(resultsDir, `benchmark-${timestamp}.json`);
  const reportFile = path.join(resultsDir, `benchmark-${timestamp}.md`);

  await fs.writeFile(resultsFile, JSON.stringify(results, null, 2));
  await fs.writeFile(reportFile, report);

  console.log(`\n✅ Results saved to:`);
  console.log(`   ${resultsFile}`);
  console.log(`   ${reportFile}`);
}

main().catch(console.error);
