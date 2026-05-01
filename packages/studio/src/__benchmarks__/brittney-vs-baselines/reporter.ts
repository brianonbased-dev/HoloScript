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
    renderCriterionFailureMatrix(run),
    renderHintRecoveryRate(run),
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
      const avgCreateObjects =
        slice.reduce((s, o) => s + (o.create_object_count ?? 0), 0) / slice.length;
      return `${completed}/${slice.length} (${avgCreateObjects.toFixed(0)} objs)`;
    });
    lines.push(`| ${t} | ${cells.join(' | ')} |`);
  }
  return lines.join('\n');
}

function renderCriterionFailureMatrix(run: BenchmarkRun): string {
  const configs = Array.from(new Set(run.outcomes.map((o) => o.config)));
  const taskIds = Array.from(new Set(run.outcomes.map((o) => o.task_id)));
  const sections: string[] = [];

  for (const taskId of taskIds) {
    const taskOutcomes = run.outcomes.filter((o) => o.task_id === taskId);
    if (taskOutcomes.length === 0) continue;

    const criterionIds = Array.from(
      new Set(taskOutcomes.flatMap((o) => o.per_criterion.map((v) => v.criterion_id)))
    );
    if (criterionIds.length === 0) continue;

    const rows: { criterion: string; cells: string[] }[] = [];
    for (const cid of criterionIds) {
      const cells = configs.map((c) => {
        const slice = taskOutcomes.filter((o) => o.config === c);
        if (slice.length === 0) return '–';
        const fails = slice.filter((o) => {
          const v = o.per_criterion.find((pc) => pc.criterion_id === cid);
          return v ? !v.passed : false;
        }).length;
        return fails === 0 ? '0' : `${fails}/${slice.length}`;
      });
      if (cells.some((s) => s !== '0' && s !== '–')) {
        rows.push({ criterion: cid, cells });
      }
    }

    if (rows.length === 0) continue;

    sections.push(`### ${taskId}`);
    sections.push(`| criterion | ${configs.join(' | ')} |`);
    sections.push(`|---|${configs.map(() => '---').join('|')}|`);
    for (const row of rows) {
      sections.push(`| ${row.criterion} | ${row.cells.join(' | ')} |`);
    }
    sections.push('');
  }

  if (sections.length === 0) {
    return `## Per-criterion failures\n\n_(none)_\n\n`;
  }
  return `## Per-criterion failures\n\n${sections.join('\n')}\n`;
}

function renderHintRecoveryRate(run: BenchmarkRun): string {
  const retries = run.outcomes.filter((o) => o.retry_of_trial !== undefined);
  if (retries.length === 0) return '';

  const recovered = retries.filter((o) => o.creation_completion).length;
  const rate = retries.length > 0 ? (recovered / retries.length) * 100 : 0;

  const byConfig = new Map<ConfigName, { attempted: number; recovered: number }>();
  for (const o of retries) {
    const prev = byConfig.get(o.config) ?? { attempted: 0, recovered: 0 };
    prev.attempted++;
    if (o.creation_completion) prev.recovered++;
    byConfig.set(o.config, prev);
  }

  const lines: string[] = [];
  lines.push(`## Hint recovery rate`);
  lines.push('');
  lines.push(`| config | attempted | recovered | rate |`);
  lines.push(`|---|---|---|---|`);
  for (const [config, stats] of byConfig) {
    const r = stats.attempted > 0 ? ((stats.recovered / stats.attempted) * 100).toFixed(1) : '0.0';
    lines.push(`| ${config} | ${stats.attempted} | ${stats.recovered} | ${r}% |`);
  }
  lines.push(`| **total** | ${retries.length} | ${recovered} | ${rate.toFixed(1)}% |`);
  lines.push('');
  return lines.join('\n');
}
