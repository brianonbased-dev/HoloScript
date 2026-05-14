#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  createAdversarialTrajectoryReport,
  replayTrajectory,
  type AdversarialTrajectoryReport,
} from './index';

const DEFAULT_REPORT_PATH = 'docs/public/evidence/adversarial-trajectory-report.json';

interface CliOptions {
  command: 'generate' | 'replay';
  trajectoryId?: string;
  count?: string;
  cwd?: string;
  generatedAt?: string;
  help?: boolean;
  json: boolean;
  out?: string;
  report?: string;
  seed?: string;
  task?: string;
}

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  printHelp();
  process.exit(0);
}

try {
  if (args.command === 'generate') {
    runGenerate(args);
  } else {
    runReplay(args);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function runGenerate(args: CliOptions): void {
  const cwd = resolve(args.cwd ?? findGitRoot(process.cwd()) ?? process.cwd());
  const out = resolve(cwd, args.out ?? args.report ?? DEFAULT_REPORT_PATH);
  const report = createAdversarialTrajectoryReport({
    count: args.count ? Number.parseInt(args.count, 10) : 20,
    seed: args.seed,
    generatedAt: args.generatedAt,
    reportPath: relativeFromCwd(cwd, out),
    taskId: args.task,
  });

  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.error(`[adversarial-trajectory] wrote ${relativeFromCwd(cwd, out)}`);
  console.error(
    `[adversarial-trajectory] ${report.summary.total} traces: ${report.summary.solved} solved, ${report.summary.unresolved} unresolved, ${report.summary.invalid} invalid`,
  );
  console.error(`[adversarial-trajectory] report ${report.reportHash}`);
}

function runReplay(args: CliOptions): void {
  const cwd = resolve(args.cwd ?? findGitRoot(process.cwd()) ?? process.cwd());
  const reportPath = resolve(cwd, args.report ?? args.out ?? DEFAULT_REPORT_PATH);
  if (!args.trajectoryId) {
    throw new Error('replay requires a trajectory id');
  }

  const report = JSON.parse(readFileSync(reportPath, 'utf8')) as AdversarialTrajectoryReport;
  const result = replayTrajectory(report, args.trajectoryId);

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`Replay ${result.trajectoryId}: ${result.replayStatus.toUpperCase()}`);
  console.log(`Status: expected=${result.expectedStatus} actual=${result.actualStatus}`);
  console.log('Receipt hashes:');
  console.log(`- scene: ${result.receiptHashes.sceneHash}`);
  console.log(`- actions: ${result.receiptHashes.actionTraceHash}`);
  console.log(`- observations: ${result.receiptHashes.observationTraceHash}`);
  console.log(`- expected predicates: ${result.receiptHashes.expectedPredicateHash}`);
  console.log(`- actual predicates: ${result.receiptHashes.actualPredicateHash}`);
  console.log(`- CAEL receipt: ${result.receiptHashes.caelReceiptHash}`);
  console.log('Predicate deltas:');
  for (const delta of result.predicateDeltas) {
    const mark = delta.stable ? 'PASS' : 'FAIL';
    console.log(
      `- ${mark} ${delta.name}: expected=${delta.expected} actual=${delta.actual} delta=${delta.delta} threshold=${delta.threshold}`,
    );
  }

  if (result.replayStatus === 'fail') {
    process.exitCode = 1;
  }
}

function parseArgs(argv: string[]): CliOptions {
  const normalizedArgv = argv[0] === '--' ? argv.slice(1) : argv;
  const parsed: CliOptions = {
    command: 'generate',
    json: false,
  };
  let start = 0;
  if (normalizedArgv[0] === 'generate' || normalizedArgv[0] === 'replay') {
    parsed.command = normalizedArgv[0];
    start = 1;
  }

  for (let i = start; i < normalizedArgv.length; i += 1) {
    const arg = normalizedArgv[i];
    if (arg === '--') continue;
    if (arg === '--help' || arg === '-h') {
      parsed.help = true;
      continue;
    }
    if (arg === '--json') {
      parsed.json = true;
      continue;
    }
    if (!arg.startsWith('--')) {
      if (parsed.command === 'replay' && !parsed.trajectoryId) {
        parsed.trajectoryId = arg;
        continue;
      }
      throw new Error(`Unexpected positional argument: ${arg}`);
    }

    const [rawKey, inline] = arg.slice(2).split(/=(.*)/s, 2);
    const key = rawKey.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
    const value = inline ?? readValue(normalizedArgv, ++i, arg);
    (parsed as unknown as Record<string, string>)[key] = value;
  }

  return parsed;
}

function readValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (!value || value.startsWith('--')) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function relativeFromCwd(cwd: string, path: string): string {
  const normalizedCwd = cwd.replace(/\\/g, '/').replace(/\/$/, '');
  const normalizedPath = resolve(path).replace(/\\/g, '/');
  return normalizedPath.startsWith(`${normalizedCwd}/`)
    ? normalizedPath.slice(normalizedCwd.length + 1)
    : normalizedPath;
}

function findGitRoot(cwd: string): string | undefined {
  const result = spawnSync('git', ['rev-parse', '--show-toplevel'], {
    cwd,
    encoding: 'utf8',
    timeout: 5_000,
  });
  if (result.status !== 0) return undefined;
  return result.stdout.trim() || undefined;
}

function printHelp(): void {
  console.log(`HoloLand adversarial trajectory buffer

Usage:
  hololand-adversarial-trajectory generate --count 20 --out docs/public/evidence/adversarial-trajectory-report.json
  hololand-adversarial-trajectory replay traj_001_abc12345 --report docs/public/evidence/adversarial-trajectory-report.json

Options:
  --count <n>             Number of action traces to generate; coerced to at least 20
  --seed <seed>           Deterministic seed
  --generated-at <iso>    Override generatedAt for reproducible reports
  --task <task_id>        Board task id to bind into the report
  --out <path>            Output report path for generate
  --report <path>         Report path for replay
  --cwd <path>            Repository root for relative paths
  --json                  Print JSON output
  --help                  Show this message
`);
}
