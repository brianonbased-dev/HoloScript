#!/usr/bin/env node
/**
 * run-emergent-spacetime-benchmark.mjs
 *
 * Vast.ai RTX 6000 Ada Benchmark Runner for Paper 3 §7.8
 *
 * Usage:
 *   # Local run (development):
 *   node scripts/run-emergent-spacetime-benchmark.mjs --voxels=1000 --frames=300
 *
 *   # Vast.ai deployment:
 *   1. Provision RTX 6000 Ada instance on Vast.ai
 *   2. Clone HoloScript repo
 *   3. pnpm install
 *   4. node scripts/run-emergent-spacetime-benchmark.mjs --voxels=1000 --frames=300 --output=json
 *   5. Upload results to Paper 3 evidence folder
 *
 * Output:
 *   - Console table with all metrics
 *   - JSON results file (if --output=json)
 *   - Paper 3 budget compliance summary
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { writeFileSync, mkdirSync, existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

// Parse arguments
const args = process.argv.slice(2);
const parseArg = (name, defaultValue) => {
  const arg = args.find(a => a.startsWith(`--${name}=`));
  return arg ? arg.split('=')[1] : defaultValue;
};

const voxelCount = parseInt(parseArg('voxels', '1000'), 10);
const frameSamples = parseInt(parseArg('frames', '300'), 10);
const outputFormat = parseArg('output', 'console');
const outputFile = parseArg('output-file', null);

console.log(`
╔══════════════════════════════════════════════════════════════════╗
║   EmergentSpacetime RTX 6000 Ada Benchmark (Paper 3 §7.8)       ║
╚══════════════════════════════════════════════════════════════════╝

Configuration:
  Voxels: ${voxelCount}
  Frames: ${frameSamples}
  Output: ${outputFormat}${outputFile ? ` → ${outputFile}` : ''}

`);

// Dynamic import (needs to run after Node.js environment is confirmed)
const { runEmergentSpacetimeBenchmark } = await import(
  join(projectRoot, 'packages', 'studio', 'src', '__benchmarks__', 'emergent-spacetime-rtx-benchmark.ts')
);

async function main() {
  const startTime = Date.now();

  const results = await runEmergentSpacetimeBenchmark({
    voxelCount,
    frameSamples,
    seed: 42, // Reproducibility for Paper 3
  });

  const elapsed = Date.now() - startTime;

  // Console output
  if (outputFormat === 'console' || outputFormat === 'both') {
    console.log('\n=== Benchmark Results ===\n');
    console.table(results.summary);

    console.log('\n=== Hardware ===');
    console.log(`  GPU: ${results.hardware.gpu}`);
    console.log(`  CPU: ${results.hardware.cpu}`);
    console.log(`  Memory: ${results.hardware.deviceMemory || 'N/A'} GB`);

    console.log('\n=== Paper 3 Budget Compliance ===');
    console.log(`  60 FPS Target: ${results.budgetCheck.within60fpsBudget ? '✓ PASS' : '✗ FAIL'}`);
    console.log(`  30 FPS Target: ${results.budgetCheck.within30fpsBudget ? '✓ PASS' : '✗ FAIL'}`);

    if (results.budgetCheck.violations.length > 0) {
      console.log('\n=== Violations ===');
      results.budgetCheck.violations.forEach((v, i) => console.log(`  ${i + 1}. ${v}`));
    }

    console.log(`\nTotal elapsed: ${elapsed}ms`);
  }

  // JSON output
  if (outputFormat === 'json' || outputFormat === 'both') {
    const output = outputFile || join(projectRoot, 'benchmark-results', `emergent-spacetime-${voxelCount}voxels-${Date.now()}.json`);

    const outputDir = dirname(output);
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    writeFileSync(output, JSON.stringify(results, null, 2));
    console.log(`\nResults written to: ${output}`);
  }

  // Exit with error if budget failed
  if (!results.budgetCheck.within30fpsBudget) {
    console.error('\n❌ Benchmark FAILED: Did not meet 30 FPS target');
    process.exit(1);
  }

  console.log('\n✅ Benchmark PASSED');
  process.exit(0);
}

main().catch(err => {
  console.error('Benchmark error:', err);
  process.exit(1);
});
