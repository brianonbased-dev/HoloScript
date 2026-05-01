/**
 * Compare two benchmark runs and show delta.
 *
 * Usage: tsx compare-runs.ts <run-id-a> <run-id-b>
 */

import fs from 'node:fs';
import path from 'node:path';
import type { BenchmarkRun, RunOutcome } from './types';

const [runA, runB] = process.argv.slice(2);
if (!runA || !runB) {
  console.error('Usage: tsx compare-runs.ts <run-id-a> <run-id-b>');
  process.exit(1);
}

const resultsDir = path.join(__dirname, 'results');

function load(runId: string): BenchmarkRun {
  const p = path.join(resultsDir, runId, 'results.json');
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

const a = load(runA);
const b = load(runB);

function summarize(run: BenchmarkRun) {
  const total = run.outcomes.length;
  const passed = run.outcomes.filter((o) => o.creation_completion).length;
  return { total, passed, rate: passed / total, cost: run.budget_usd_used };
}

const sa = summarize(a);
const sb = summarize(b);

console.log(`=== Benchmark Run Comparison ===\n`);
console.log(`Baseline:  ${runA} — ${sa.passed}/${sa.total} (${(sa.rate * 100).toFixed(1)}%) $${sa.cost.toFixed(2)}`);
console.log(`Current:   ${runB} — ${sb.passed}/${sb.total} (${(sb.rate * 100).toFixed(1)}%) $${sb.cost.toFixed(2)}`);
console.log(`Delta:     ${sb.passed - sa.passed} cells, ${((sb.rate - sa.rate) * 100).toFixed(1)} pp, $${(sb.cost - sa.cost).toFixed(2)}\n`);

// Per-task comparison
const allTasks = Array.from(new Set([...a.outcomes.map((o) => o.task_id), ...b.outcomes.map((o) => o.task_id)])).sort();

console.log('Per-task delta (config=baseline → current):');
for (const taskId of allTasks) {
  const aOutcomes = a.outcomes.filter((o) => o.task_id === taskId);
  const bOutcomes = b.outcomes.filter((o) => o.task_id === taskId);
  if (aOutcomes.length === 0 || bOutcomes.length === 0) continue;

  const aPass = aOutcomes.filter((o) => o.creation_completion).length;
  const bPass = bOutcomes.filter((o) => o.creation_completion).length;
  const delta = bPass - aPass;

  if (delta !== 0) {
    const sign = delta > 0 ? '+' : '';
    console.log(`  ${taskId}: ${aPass}/${aOutcomes.length} → ${bPass}/${bOutcomes.length} (${sign}${delta})`);
  }
}

// Cells that changed status
console.log('\nCell-level changes:');
const aByKey = new Map(a.outcomes.map((o) => [`${o.task_id}:${o.config}:${o.trial}`, o]));
const bByKey = new Map(b.outcomes.map((o) => [`${o.task_id}:${o.config}:${o.trial}`, o]));

let improved = 0;
let regressed = 0;
for (const [key, bOutcome] of bByKey) {
  const aOutcome = aByKey.get(key);
  if (!aOutcome) continue;

  if (!aOutcome.creation_completion && bOutcome.creation_completion) {
    improved++;
    console.log(`  + ${key}: FAIL → PASS`);
  } else if (aOutcome.creation_completion && !bOutcome.creation_completion) {
    regressed++;
    console.log(`  - ${key}: PASS → FAIL`);
  }
}

console.log(`\nTotal: ${improved} improved, ${regressed} regressed`);
