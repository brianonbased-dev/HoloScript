import fs from 'node:fs';
import path from 'node:path';
import type { BenchmarkRun, ConfigName, RunOutcome } from './types';
import { aggregateByConfig, renderParetoMarkdown } from './pareto';

export interface WriteResultsOptions {
  run: BenchmarkRun;
  outDir: string;
}

export function writeResults(opts: WriteResultsOptions): {
  jsonPath: string;
  mdPath: string;
} {
  const runDir = path.join(opts.outDir, opts.run.run_id);
  fs.mkdirSync(runDir, { recursive: true });
  const jsonPath = path.join(runDir, 'results.json');
  const mdPath = path.join(runDir, 'results.md');
  fs.writeFileSync(jsonPath, JSON.stringify(opts.run, null, 2));
  fs.writeFileSync(mdPath, renderResultsMarkdown(opts.run));
  return { jsonPath, mdPath };
}

export function renderResultsMarkdown(run: BenchmarkRun): string {
  const aggs = aggregateByConfig(run);
  const byConfig = new Map<ConfigName, RunOutcome[]>();
  for (const o of run.outcomes) {
    if (!byConfig.has(o.config)) byConfig.set(o.config, []);
    byConfig.get(o.config)!.push(o);
  }

  const errorOutcomes = run.outcomes.filter((o) => o.error);

  return [
    `# Brittney vs Baselines — run ${run.run_id}`,
    ``,
    `- **Started**: ${run.started_at}`,
    `- **Finished**: ${run.finished_at}`,
    `- **Configs**: ${run.configs.join(', ')}`,
    `- **Tasks**: ${run.tasks.length} (${run.tasks.join(', ')})`,
    `- **Trials per cell**: ${run.trials_per_cell}`,
    `- **Budget used / max**: $${run.budget_usd_used.toFixed(4)} / $${run.budget_usd_max.toFixed(2)}`,
    `- **Total cells**: ${run.outcomes.length}`,
    `- **Cells with errors**: ${errorOutcomes.length}`,
    ``,
    renderParetoMarkdown(aggs),
    `## Per-task per-config completion`,
    ``,
    renderTaskMatrix(run),
    ``,
    `## Errors`,
    ``,
    errorOutcomes.length === 0
      ? '_(none)_'
      : errorOutcomes
          .map(
            (o) =>
              `- task=${o.task_id} config=${o.config} trial=${o.trial} → ${o.error}`
          )
          .join('\n'),
    ``,
  ].join('\n');
}

function renderTaskMatrix(run: BenchmarkRun): string {
  const taskIds = Array.from(new Set(run.outcomes.map((o) => o.task_id)));
  const configs = Array.from(new Set(run.outcomes.map((o) => o.config)));
  const lines: string[] = [];
  lines.push('| task | ' + configs.join(' | ') + ' |');
  lines.push('|---|' + configs.map(() => '---').join('|') + '|');
  for (const t of taskIds) {
    const cells = configs.map((c) => {
      const slice = run.outcomes.filter((o) => o.task_id === t && o.config === c);
      if (slice.length === 0) return '–';
      const completed = slice.filter((o) => o.creation_completion).length;
      return `${completed}/${slice.length}`;
    });
    lines.push(`| ${t} | ${cells.join(' | ')} |`);
  }
  return lines.join('\n');
}
