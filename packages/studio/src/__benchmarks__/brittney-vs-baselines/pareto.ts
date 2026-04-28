import type { BenchmarkRun, ConfigName, RunOutcome } from './types';

export interface ConfigAggregate {
  config: ConfigName;
  trials: number;
  completion_rate: number;
  mean_cost_usd: number;
  mean_wall_seconds: number;
  mean_tool_rounds: number;
  sim_contract_pass_rate: number;
}

export function aggregateByConfig(run: BenchmarkRun): ConfigAggregate[] {
  const byConfig = new Map<ConfigName, RunOutcome[]>();
  for (const o of run.outcomes) {
    if (!byConfig.has(o.config)) byConfig.set(o.config, []);
    byConfig.get(o.config)!.push(o);
  }
  const out: ConfigAggregate[] = [];
  for (const [config, outcomes] of byConfig) {
    if (outcomes.length === 0) continue;
    const completed = outcomes.filter((o) => o.creation_completion).length;
    const totalCost = outcomes.reduce((s, o) => s + o.token_cost_usd, 0);
    const totalWall = outcomes.reduce((s, o) => s + o.wall_clock_seconds, 0);
    const sumRounds = outcomes.reduce(
      (s, o) => s + (o.tool_rounds_to_completion ?? 0),
      0
    );
    const sumSc = outcomes.reduce((s, o) => s + o.sim_contract_pass_rate, 0);
    out.push({
      config,
      trials: outcomes.length,
      completion_rate: completed / outcomes.length,
      mean_cost_usd: totalCost / outcomes.length,
      mean_wall_seconds: totalWall / outcomes.length,
      mean_tool_rounds: sumRounds / outcomes.length,
      sim_contract_pass_rate: sumSc / outcomes.length,
    });
  }
  return out;
}

export function paretoFrontier(aggs: ConfigAggregate[]): ConfigAggregate[] {
  return aggs.filter((a) => {
    return !aggs.some(
      (b) =>
        b !== a &&
        b.completion_rate >= a.completion_rate &&
        b.mean_cost_usd <= a.mean_cost_usd &&
        (b.completion_rate > a.completion_rate || b.mean_cost_usd < a.mean_cost_usd)
    );
  });
}

function asciiCostBar(value: number, max: number, width = 20): string {
  if (max <= 0) return '';
  const filled = Math.min(width, Math.max(0, Math.round((value / max) * width)));
  return '#'.repeat(filled).padEnd(width, '.');
}

function asciiCompletionBar(value: number, width = 20): string {
  const filled = Math.min(width, Math.max(0, Math.round(value * width)));
  return '#'.repeat(filled).padEnd(width, '.');
}

export function renderParetoMarkdown(aggs: ConfigAggregate[]): string {
  if (aggs.length === 0) return '_(no aggregates)_\n';
  const frontier = new Set(paretoFrontier(aggs).map((a) => a.config));
  const maxCost = Math.max(0.0001, ...aggs.map((a) => a.mean_cost_usd));

  const rows = aggs.map((a) => {
    const star = frontier.has(a.config) ? '★' : ' ';
    return [
      `| ${star} \`${a.config}\``,
      `${(a.completion_rate * 100).toFixed(1)}%`,
      `\`${asciiCompletionBar(a.completion_rate)}\``,
      `$${a.mean_cost_usd.toFixed(4)}`,
      `\`${asciiCostBar(a.mean_cost_usd, maxCost)}\``,
      `${a.mean_wall_seconds.toFixed(2)}s`,
      `${a.mean_tool_rounds.toFixed(2)}`,
      `${(a.sim_contract_pass_rate * 100).toFixed(1)}%`,
      `${a.trials}`,
      '|',
    ].join(' | ');
  });

  return [
    '## Pareto frontier (cost vs completion rate)',
    '',
    '★ = on Pareto frontier (no other config dominates).',
    '',
    '| config | completion | completion bar | mean cost | cost bar | mean wall | mean rounds | sim-contract | trials |',
    '|---|---|---|---|---|---|---|---|---|',
    ...rows,
    '',
  ].join('\n');
}
