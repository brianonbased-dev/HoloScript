#!/usr/bin/env tsx
/* eslint-disable no-console */
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { buildAllConfigs } from './configs';
import { loadAllTasks, loadQuickSubset } from './tasks';
import { runBenchmark } from './runner';
import { writeResults } from './reporter';
import type { ConfigName, ConfigRunner } from './types';

interface CliArgs {
  quick: boolean;
  configs?: ConfigName[];
  trials?: number;
  budgetUsdMax?: number;
  taskIds?: string[];
  brittneyEndpoint?: string;
  brittneyAuthHeader?: string;
  brittneyCookie?: string;
}

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = { quick: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--quick':
        out.quick = true;
        break;
      case '--configs':
        out.configs = (argv[++i] ?? '').split(',').filter(Boolean) as ConfigName[];
        break;
      case '--trials':
        out.trials = Number(argv[++i]);
        break;
      case '--budget':
        out.budgetUsdMax = Number(argv[++i]);
        break;
      case '--tasks':
        out.taskIds = (argv[++i] ?? '').split(',').filter(Boolean);
        break;
      case '--brittney-endpoint':
        out.brittneyEndpoint = argv[++i];
        break;
      case '--brittney-auth':
        out.brittneyAuthHeader = argv[++i];
        break;
      case '--brittney-cookie':
        out.brittneyCookie = argv[++i];
        break;
      case '--help':
      case '-h':
        printHelpAndExit(0);
        break;
    }
  }
  return out;
}

function printHelpAndExit(code: number): never {
  console.log(
    [
      'Usage: tsx run.ts [options]',
      '',
      '  --quick                          run smoke test (3 tasks, 1 trial)',
      '  --configs <a,b,...>              subset of configs (default: all 4)',
      '  --trials <N>                     trials per cell (default: 3 full / 1 quick)',
      '  --budget <USD>                   hard budget cap (default: 50 full / 2 quick)',
      '  --tasks <id,id,...>              subset of task IDs',
      '  --brittney-endpoint <URL>        defaults to BRITTNEY_PROD_URL env or http://localhost:3100/api/brittney',
      '  --brittney-auth <header>         Authorization header for /api/brittney',
      '  --brittney-cookie <cookie>       Cookie header for /api/brittney',
      '',
      'Required env: ANTHROPIC_API_KEY',
    ].join('\n')
  );
  process.exit(code);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY is required');
    process.exit(2);
  }

  const allTasks = loadAllTasks();
  const tasks = args.quick
    ? loadQuickSubset()
    : args.taskIds
      ? allTasks.filter((t) => args.taskIds!.includes(t.id))
      : allTasks;

  if (tasks.length === 0) {
    console.error('no tasks selected');
    process.exit(2);
  }

  const trialsPerCell = args.trials ?? (args.quick ? 1 : 3);
  const budgetUsdMax = args.budgetUsdMax ?? (args.quick ? 2 : 50);

  const endpoint =
    args.brittneyEndpoint ??
    process.env.BRITTNEY_PROD_URL ??
    'http://localhost:3100/api/brittney';

  let allConfigs = buildAllConfigs({
    anthropicApiKey: apiKey,
    brittneyEndpoint: endpoint,
    brittneyAuthHeader: args.brittneyAuthHeader,
    brittneyCookie: args.brittneyCookie,
  });
  if (args.configs && args.configs.length > 0) {
    const want = new Set(args.configs);
    allConfigs = allConfigs.filter((c: ConfigRunner) => want.has(c.name));
  }
  if (allConfigs.length === 0) {
    console.error('no configs selected');
    process.exit(2);
  }

  console.log(
    `[harness] tasks=${tasks.length} configs=${allConfigs.length} trials=${trialsPerCell} budget=$${budgetUsdMax}`
  );
  console.log(`[harness] cells = ${tasks.length * allConfigs.length * trialsPerCell}`);
  if (!args.quick) {
    if (process.env.HARNESS_FOUNDER_GO !== '1') {
      console.error(
        '[harness] full run requires HARNESS_FOUNDER_GO=1 (founder budget approval). Use --quick first.'
      );
      process.exit(3);
    }
  }

  const judgeClient = new Anthropic({ apiKey });

  const run = await runBenchmark({
    configs: allConfigs,
    tasks,
    trialsPerCell,
    budgetUsdMax,
    judgeClient,
    onProgress: (e) => {
      if (e.type === 'cell_complete') {
        const o = e.outcome;
        const status = o.error ? `ERR(${o.error.slice(0, 40)})` : o.creation_completion ? 'PASS' : 'FAIL';
        console.log(
          `  ${o.task_id} ${o.config} t${o.trial}: ${status} cost=$${o.token_cost_usd.toFixed(4)} wall=${o.wall_clock_seconds.toFixed(1)}s`
        );
      } else if (e.type === 'budget_exceeded') {
        console.warn(
          `[harness] BUDGET EXCEEDED at $${e.used_usd.toFixed(4)} / $${e.max_usd}; halting.`
        );
      }
    },
  });

  const outDir = path.join(__dirname, 'results');
  const { jsonPath, mdPath } = writeResults({ run, outDir });
  console.log(`[harness] wrote ${jsonPath}`);
  console.log(`[harness] wrote ${mdPath}`);
  console.log(
    `[harness] used $${run.budget_usd_used.toFixed(4)} / $${run.budget_usd_max} across ${run.outcomes.length} cells`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
