/**
 * Generate a concise markdown summary of a benchmark run.
 *
 * Usage: tsx summarize-run.ts <run-id>
 */

import fs from 'node:fs';
import path from 'node:path';
import type { BenchmarkRun } from './types';

const runId = process.argv[2];
if (!runId) {
  console.error('Usage: tsx summarize-run.ts <run-id>');
  process.exit(1);
}

const resultsDir = path.join(__dirname, 'results', runId);
const run: BenchmarkRun = JSON.parse(fs.readFileSync(path.join(resultsDir, 'results.json'), 'utf8'));

const total = run.outcomes.length;
const passed = run.outcomes.filter((o) => o.creation_completion).length;
const passRate = ((passed / total) * 100).toFixed(1);
const duration = ((new Date(run.finished_at) - new Date(run.started_at)) / 60000).toFixed(1);

const byTier: Record<string, { pass: number; total: number }> = {};
for (const o of run.outcomes) {
  if (!byTier[o.tier]) byTier[o.tier] = { pass: 0, total: 0 };
  byTier[o.tier].total++;
  if (o.creation_completion) byTier[o.tier].pass++;
}

const byConfig: Record<string, { pass: number; total: number }> = {};
for (const o of run.outcomes) {
  if (!byConfig[o.config]) byConfig[o.config] = { pass: 0, total: 0 };
  byConfig[o.config].total++;
  if (o.creation_completion) byConfig[o.config].pass++;
}

const failures = run.outcomes.filter((o) => !o.creation_completion && !o.error);
const byTask: Record<string, number> = {};
for (const o of failures) {
  byTask[o.task_id] = (byTask[o.task_id] || 0) + 1;
}
const topFailures = Object.entries(byTask).sort((a, b) => b[1] - a[1]).slice(0, 5);

const lines: string[] = [
  `## Benchmark Run \`${run.run_id}\``,
  '',
  `- **Pass Rate**: ${passed}/${total} (${passRate}%)`,
  `- **Budget**: $${run.budget_usd_used.toFixed(2)} / $${run.budget_usd_max}`,
  `- **Duration**: ${duration} minutes`,
  `- **Configs**: ${run.configs.join(', ')}`,
  '',
  '### By Tier',
  ...Object.entries(byTier).map(([tier, { pass, total }]) =>
    `- ${tier}: ${pass}/${total} (${((pass / total) * 100).toFixed(1)}%)`
  ),
  '',
  '### By Config',
  ...Object.entries(byConfig).map(([config, { pass, total }]) =>
    `- ${config}: ${pass}/${total} (${((pass / total) * 100).toFixed(1)}%)`
  ),
  '',
];

if (topFailures.length > 0) {
  lines.push('### Top Failures');
  for (const [taskId, count] of topFailures) {
    const taskOutcomes = run.outcomes.filter((o) => o.task_id === taskId);
    const totalTrials = taskOutcomes.length;
    lines.push(`- ${taskId}: ${totalTrials - count}/${totalTrials} pass (${count} failures)`);
  }
  lines.push('');
}

console.log(lines.join('\n'));
