#!/usr/bin/env node
/**
 * scripts/run-a009-stress-test.mjs
 *
 * A-009 Example Freshness + Artist Stress-Test Routine
 *
 * Compiles a selection of example compositions and stress-test scenarios
 * against the current HoloScript compiler. On compile failure or artist
 * trait request, emits a gap-seed JSON file to be ingested by the local
 * session-start hook.
 *
 * Usage:
 *   node scripts/run-a009-stress-test.mjs [--run-id <id>] [--dry-run]
 *
 * Outputs:
 *   On success: JSON written to research/audit-reports/gaps-pending/
 *   On failure: process exit 1 (but never blocks — gaps are non-fatal)
 *
 * Author: github-copilot — 2026-04-27
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

/**
 * Stress-test compositions and scenarios to try
 */
const TEST_SCENARIOS = [
  'benchmarks/scenarios/02-high-complexity/high-complexity.holo',
  'benchmarks/scenarios/04-multiplayer-vr/multiplayer-vr.holo',
  'examples/physics-constraints-demo.hsplus',
  'examples/networked-collaboration-demo.hsplus',
];

/**
 * Run the HoloScript compiler against a file and capture errors
 */
function compileComposition(filePath) {
  return new Promise((resolve) => {
    const fullPath = path.join(ROOT, filePath);
    if (!fs.existsSync(fullPath)) {
      resolve({ success: false, error: `File not found: ${filePath}`, stderr: '' });
      return;
    }

    let stdout = '';
    let stderr = '';

    const proc = spawn('npx', ['tsx', 'packages/core/src/compiler/main.ts', '--input', fullPath, '--target', 'webgpu'], {
      cwd: ROOT,
      timeout: 30000,
    });

    proc.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      resolve({
        success: code === 0,
        error: code !== 0 ? `Compilation failed with exit code ${code}` : null,
        stderr,
        stdout,
      });
    });

    proc.on('error', (err) => {
      resolve({ success: false, error: err.message, stderr: '', stdout });
    });
  });
}

/**
 * Parse compiler errors and extract gap information
 */
function extractGapFromError(filePath, errorOutput) {
  const gaps = [];

  if (errorOutput.includes('UnknownTrait') || errorOutput.includes('unknown trait')) {
    const match = errorOutput.match(/trait\s+[@]?(\w+)/i);
    const traitName = match ? match[1] : 'unknown';
    gaps.push({
      title: `Artist requested @${traitName} trait (not in compiler)`,
      description: `Composition ${path.basename(filePath)} requested trait @${traitName} which is not currently defined in the compiler. Error: ${errorOutput.slice(0, 200)}`,
      priority: 'medium',
      tags: ['auto-filed-by-A-009', 'example-driven', 'trait-request', 'compiler'],
      dedup_key: `a009-stress-trait-${traitName}`,
    });
  } else if (errorOutput.includes('TypeError') || errorOutput.includes('type mismatch')) {
    gaps.push({
      title: 'Compiler: type mismatch in trait combination',
      description: `Stress-test file ${path.basename(filePath)} failed type checking. Error: ${errorOutput.slice(0, 300)}`,
      priority: 'high',
      tags: ['auto-filed-by-A-009', 'example-driven', 'compiler-bug', 'type-system'],
      dedup_key: `a009-stress-type-mismatch-${Date.now()}`,
    });
  } else if (errorOutput) {
    gaps.push({
      title: `Compiler error in ${path.basename(filePath)}`,
      description: `Stress-test compilation failed: ${errorOutput.slice(0, 400)}`,
      priority: 'medium',
      tags: ['auto-filed-by-A-009', 'example-driven', 'compiler-bug'],
      dedup_key: `a009-stress-compile-${Date.now()}`,
    });
  }

  return gaps;
}

/**
 * Main routine
 */
async function main() {
  const runId = process.argv.includes('--run-id') 
    ? process.argv[process.argv.indexOf('--run-id') + 1]
    : `stress-${Date.now()}`;
  const dryRun = process.argv.includes('--dry-run');

  console.log(`[A-009] Starting stress-test run: ${runId}`);

  const allGaps = [];
  let testsRun = 0;
  let testsFailed = 0;

  // Compile each scenario
  for (const scenario of TEST_SCENARIOS) {
    console.log(`[A-009] Testing: ${scenario}`);
    testsRun++;

    const result = await compileComposition(scenario);
    if (!result.success) {
      testsFailed++;
      const gaps = extractGapFromError(scenario, result.stderr || result.stdout || result.error);
      allGaps.push(...gaps);
      console.log(`  ✗ Failed: ${result.error}`);
    } else {
      console.log(`  ✓ Passed`);
    }
  }

  console.log(`[A-009] Completed ${testsRun} tests, ${testsFailed} failed`);

  // If there are gaps, write JSON seed file
  if (allGaps.length > 0) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('Z')[0] + 'Z';
    const seedFile = {
      routine_id: `trig_a009_${runId}`,
      routine_name: 'A-009 Example freshness + artist stress-test',
      fired_at: new Date().toISOString(),
      gaps: allGaps,
    };

    const outputDir = path.join(ROOT, 'research', 'audit-reports', 'gaps-pending');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputFile = path.join(outputDir, `A-009-${timestamp}-${runId.slice(0, 20)}.json`);

    if (dryRun) {
      console.log(`[A-009] [DRY-RUN] Would write to: ${outputFile}`);
      console.log(JSON.stringify(seedFile, null, 2));
    } else {
      fs.writeFileSync(outputFile, JSON.stringify(seedFile, null, 2));
      console.log(`[A-009] Wrote seed file: ${outputFile}`);
      console.log(`[A-009] Found ${allGaps.length} gap(s) to file as board task(s)`);

      // Git commit + push (optional, can be skipped in dry-run or test mode)
      if (!process.argv.includes('--no-git')) {
        try {
          const { execSync } = await import('child_process');
          execSync(`git add "${outputFile}"`, { cwd: ROOT });
          execSync(`git commit -m "audit: A-009 gap seeds from stress-test run ${runId}"`, { cwd: ROOT });
          execSync(`git push origin main`, { cwd: ROOT });
          console.log(`[A-009] Committed and pushed to main`);
        } catch (err) {
          console.error(`[A-009] Git commit/push failed (non-fatal):`, err.message);
        }
      }
    }
  } else {
    console.log(`[A-009] All tests passed, no gaps to file`);
  }

  process.exit(testsFailed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(`[A-009] Fatal error:`, err.message);
  process.exit(1);
});
