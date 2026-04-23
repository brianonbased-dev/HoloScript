/**
 * paper-7 IK latency publication runner — camera-ready bench artifact.
 *
 * Paper:  ai-ecosystem/research/paper-7-ik-siggraph.tex (Table `tab:overhead`)
 * Harness: ../IKLatencyProbe.ts (benchmarkIKLatencyMatrix + formatIKLatencyMarkdown)
 *
 * What this does:
 *   1. Runs the full 12-cell matrix (3 modes × 4 chain lengths) at paper-size
 *      task count (default 10,000) with warmup + 5 measured runs per cell.
 *   2. Emits .bench-logs/paper-7-ik-latency.json with structured numbers +
 *      a pre-rendered markdown table suitable for pasting into the .tex.
 *   3. Stdout prints the markdown table so manual verification stays quick.
 *
 * Why a runner: the harness has CI tests (IKLatencyBenchmark.test.ts) but
 * those run with task_count in {16, 64, 128} to stay fast. The paper's
 * Table 2 needs 10,000-task numbers — that's the publication run. This
 * file is the shipping slice that closes that gap.
 *
 * Environment:
 *   PAPER7_TASK_COUNT=<int>   override task count (default 10000)
 *   PAPER7_MEASURED_RUNS=<n>  override measured runs (default 5)
 *   PAPER7_SEED=<int>         override base seed (default 1337)
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  benchmarkIKLatencyMatrix,
  formatIKLatencyMarkdown,
  PAPER_7_IK_CHAIN_LENGTHS,
  PAPER_7_IK_MODES,
  type IKLatencyMatrixCell,
} from '../IKLatencyProbe';

export interface Paper7IKLatencyPublication {
  benchmark: 'paper-7-ik-latency';
  paper_ref: 'ai-ecosystem/research/paper-7-ik-siggraph.tex';
  spec_version: '2026-04-23_paper-7-publication-runner';
  ran_at: string;
  duration_ms: number;
  task_count: number;
  measured_runs: number;
  seed: number;
  modes: readonly string[];
  chain_lengths: readonly number[];
  cells: IKLatencyMatrixCell[];
  markdown_table: string;
}

export interface RunOptions {
  task_count?: number;
  warmup_runs?: number;
  measured_runs?: number;
  seed?: number;
}

export function runPaper7IKLatencyBenchmark(opts: RunOptions = {}): Paper7IKLatencyPublication {
  const task_count = opts.task_count ?? 10_000;
  const warmup_runs = opts.warmup_runs ?? 1;
  const measured_runs = opts.measured_runs ?? 5;
  const seed = opts.seed ?? 1337;

  const started = Date.now();
  const cells = benchmarkIKLatencyMatrix({
    taskCount: task_count,
    warmupRuns: warmup_runs,
    measuredRuns: measured_runs,
    seed,
  });
  const duration_ms = Date.now() - started;

  const markdown_table = formatIKLatencyMarkdown(cells);

  return {
    benchmark: 'paper-7-ik-latency',
    paper_ref: 'ai-ecosystem/research/paper-7-ik-siggraph.tex',
    spec_version: '2026-04-23_paper-7-publication-runner',
    ran_at: new Date().toISOString(),
    duration_ms,
    task_count,
    measured_runs,
    seed,
    modes: PAPER_7_IK_MODES,
    chain_lengths: PAPER_7_IK_CHAIN_LENGTHS,
    cells,
    markdown_table,
  };
}

export function writePaper7Artifact(
  publication: Paper7IKLatencyPublication,
  out_path: string
): void {
  mkdirSync(dirname(out_path), { recursive: true });
  writeFileSync(out_path, JSON.stringify(publication, null, 2), 'utf8');
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  const task_count = Number(process.env.PAPER7_TASK_COUNT ?? 10_000);
  const measured_runs = Number(process.env.PAPER7_MEASURED_RUNS ?? 5);
  const seed = Number(process.env.PAPER7_SEED ?? 1337);
  const idx = argv.indexOf('--out');
  const out_path = idx >= 0 && argv[idx + 1] ? argv[idx + 1] : '.bench-logs/paper-7-ik-latency.json';

  const publication = runPaper7IKLatencyBenchmark({ task_count, measured_runs, seed });
  writePaper7Artifact(publication, resolve(process.cwd(), out_path));

  // eslint-disable-next-line no-console
  console.log(
    `[paper-7-ik-latency] task_count=${publication.task_count} measured_runs=${publication.measured_runs} seed=${publication.seed} duration_ms=${publication.duration_ms}`
  );
  // eslint-disable-next-line no-console
  console.log(publication.markdown_table);
  // eslint-disable-next-line no-console
  console.log(`→ ${out_path}`);
  return 0;
}

const _thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && process.argv[1] === _thisFile) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      // eslint-disable-next-line no-console
      console.error('[paper-7-ik-latency] fatal', err);
      process.exit(1);
    }
  );
}
