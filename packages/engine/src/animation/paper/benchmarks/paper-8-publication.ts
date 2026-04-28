/**
 * Paper-8 cross-backend determinism + Full Loop Demo v2 publication runner.
 *
 * Paper:  ai-ecosystem/research/paper-8-unified-siggraph.tex
 *         §"Cross-Backend Determinism Matrix" → Table tab:ik-matrix-unified
 *         §"Full Loop Demo v2" → Table tab:perf
 *
 * Artifacts:
 *   .bench-logs/paper-8-determinism.json     (determinism matrix, all 12 cells)
 *   .bench-logs/paper-8-full-loop-demo.json  (100-agent × 60-frame overhead)
 *
 * What this does:
 *   1. Runs the 3-mode × 4-chain-length = 12-cell determinism matrix
 *      (run A + run B per cell, pairwise hash equality).
 *   2. Runs the Full Loop Demo v2 harness (100 agents × 60 frames, hash
 *      composition overhead budget, target ≤ 0.34 ms/frame).
 *   3. Emits two JSON artifacts and prints markdown tables for paper paste-in.
 *
 * Environment:
 *   PAPER8_TASK_COUNT=<int>    IK tasks per cell (default 10000)
 *   PAPER8_SEED=<int>          PRNG seed (default 1337)
 *   PAPER8_AGENTS=<int>        agent count for Full Loop Demo (default 100)
 *   PAPER8_FRAMES=<int>        frame count for Full Loop Demo (default 60)
 *   PAPER8_DETERMINISM_OUT=<path>  override determinism artifact path
 *   PAPER8_FULLLOOP_OUT=<path>     override full-loop artifact path
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  runCrossBackendDeterminismMatrix,
  runFullLoopDemoV2,
  formatDeterminismMarkdown,
  formatFullLoopDemoMarkdown,
  PAPER_8_SOLVER_MODES,
  PAPER_8_CHAIN_LENGTHS,
  PAPER_8_GPU_CONFIGS,
  type DeterminismMatrixResult,
  type FullLoopDemoResult,
} from '../Paper8CrossBackendDeterminismProbe';

// ─── Publication Artifact Types ───────────────────────────────────────────────

export interface Paper8DeterminismPublication {
  readonly benchmark: 'paper-8-cross-backend-determinism';
  readonly paper_ref: 'ai-ecosystem/research/paper-8-unified-siggraph.tex';
  readonly spec_version: '2026-04-28_paper-8-determinism-runner';
  readonly ran_at: string;
  readonly duration_ms: number;
  readonly task_count: number;
  readonly seed: number;
  readonly solver_modes: readonly string[];
  readonly chain_lengths: readonly number[];
  readonly gpu_configs: readonly { id: string; label: string; platform: string }[];
  readonly matrix: DeterminismMatrixResult;
  readonly markdown_table: string;
}

export interface Paper8FullLoopPublication {
  readonly benchmark: 'paper-8-full-loop-demo-v2';
  readonly paper_ref: 'ai-ecosystem/research/paper-8-unified-siggraph.tex';
  readonly spec_version: '2026-04-28_paper-8-full-loop-demo-runner';
  readonly ran_at: string;
  readonly duration_ms: number;
  readonly agent_count: number;
  readonly frame_count: number;
  readonly seed: number;
  readonly result: FullLoopDemoResult;
  readonly markdown_summary: string;
}

// ─── Runners ──────────────────────────────────────────────────────────────────

export function runPaper8DeterminismBenchmark(opts: {
  taskCount?: number;
  seed?: number;
} = {}): Paper8DeterminismPublication {
  const task_count = opts.taskCount ?? 10_000;
  const seed = opts.seed ?? 1337;

  const started = Date.now();
  const matrix = runCrossBackendDeterminismMatrix({ taskCount: task_count, seed });
  const duration_ms = Date.now() - started;

  return {
    benchmark: 'paper-8-cross-backend-determinism',
    paper_ref: 'ai-ecosystem/research/paper-8-unified-siggraph.tex',
    spec_version: '2026-04-28_paper-8-determinism-runner',
    ran_at: new Date().toISOString(),
    duration_ms,
    task_count,
    seed,
    solver_modes: [...PAPER_8_SOLVER_MODES],
    chain_lengths: [...PAPER_8_CHAIN_LENGTHS],
    gpu_configs: [...PAPER_8_GPU_CONFIGS],
    matrix,
    markdown_table: formatDeterminismMarkdown(matrix),
  };
}

export function runPaper8FullLoopDemoBenchmark(opts: {
  agentCount?: number;
  frameCount?: number;
  seed?: number;
} = {}): Paper8FullLoopPublication {
  const agent_count = opts.agentCount ?? 100;
  const frame_count = opts.frameCount ?? 60;
  const seed = opts.seed ?? 1337;

  const started = Date.now();
  const result = runFullLoopDemoV2({ agentCount: agent_count, frameCount: frame_count, seed });
  const duration_ms = Date.now() - started;

  return {
    benchmark: 'paper-8-full-loop-demo-v2',
    paper_ref: 'ai-ecosystem/research/paper-8-unified-siggraph.tex',
    spec_version: '2026-04-28_paper-8-full-loop-demo-runner',
    ran_at: new Date().toISOString(),
    duration_ms,
    agent_count,
    frame_count,
    seed,
    result,
    markdown_summary: formatFullLoopDemoMarkdown(result),
  };
}

// ─── Write Artifacts ──────────────────────────────────────────────────────────

export function writePaper8DeterminismArtifact(
  pub: Paper8DeterminismPublication,
  out_path: string,
): void {
  mkdirSync(dirname(out_path), { recursive: true });
  writeFileSync(out_path, JSON.stringify(pub, null, 2), 'utf8');
}

export function writePaper8FullLoopArtifact(
  pub: Paper8FullLoopPublication,
  out_path: string,
): void {
  mkdirSync(dirname(out_path), { recursive: true });
  writeFileSync(out_path, JSON.stringify(pub, null, 2), 'utf8');
}

// ─── CLI Entry ────────────────────────────────────────────────────────────────

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  const task_count = Number(process.env.PAPER8_TASK_COUNT ?? 10_000);
  const seed = Number(process.env.PAPER8_SEED ?? 1337);
  const agent_count = Number(process.env.PAPER8_AGENTS ?? 100);
  const frame_count = Number(process.env.PAPER8_FRAMES ?? 60);

  const det_idx = argv.indexOf('--det-out');
  const det_path =
    (det_idx >= 0 && argv[det_idx + 1]) ||
    process.env.PAPER8_DETERMINISM_OUT ||
    '.bench-logs/paper-8-determinism.json';

  const fl_idx = argv.indexOf('--fullloop-out');
  const fl_path =
    (fl_idx >= 0 && argv[fl_idx + 1]) ||
    process.env.PAPER8_FULLLOOP_OUT ||
    '.bench-logs/paper-8-full-loop-demo.json';

  // Determinism matrix
  // eslint-disable-next-line no-console
  console.log('[paper-8-determinism] running 3-mode × 4-chain-length matrix…');
  const det_pub = runPaper8DeterminismBenchmark({ taskCount: task_count, seed });
  writePaper8DeterminismArtifact(det_pub, resolve(process.cwd(), det_path));
  // eslint-disable-next-line no-console
  console.log(
    `[paper-8-determinism] cells=${det_pub.matrix.totalCount} pass=${det_pub.matrix.passCount} overall=${det_pub.matrix.overallPassed} duration_ms=${det_pub.duration_ms}`
  );
  // eslint-disable-next-line no-console
  console.log(det_pub.markdown_table);
  // eslint-disable-next-line no-console
  console.log(`→ ${det_path}`);

  // Full Loop Demo v2
  // eslint-disable-next-line no-console
  console.log('\n[paper-8-full-loop-demo] running 100-agent × 60-frame harness…');
  const fl_pub = runPaper8FullLoopDemoBenchmark({ agentCount: agent_count, frameCount: frame_count, seed });
  writePaper8FullLoopArtifact(fl_pub, resolve(process.cwd(), fl_path));
  // eslint-disable-next-line no-console
  console.log(
    `[paper-8-full-loop-demo] agents=${fl_pub.agent_count} frames=${fl_pub.frame_count} mean_total_ms=${fl_pub.result.meanTotalMs.toFixed(4)} meets_target=${fl_pub.result.meetsTarget} duration_ms=${fl_pub.duration_ms}`
  );
  // eslint-disable-next-line no-console
  console.log(fl_pub.markdown_summary);
  // eslint-disable-next-line no-console
  console.log(`→ ${fl_path}`);

  return det_pub.matrix.overallPassed ? 0 : 1;
}

const _thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && process.argv[1] === _thisFile) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      // eslint-disable-next-line no-console
      console.error('[paper-8] fatal', err);
      process.exit(1);
    }
  );
}
