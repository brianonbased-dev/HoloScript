/**
 * paper-6 Mecanim cross-version divergence publication runner.
 *
 * Paper:  ai-ecosystem/research/paper-6-animation-sca.tex
 *         §"Baseline Divergence Rates" (line 361),
 *         (E1) gate cited at lines 423-431,
 *         \todo{} at lines 115-120.
 * Harness: ../Paper6MecanimDivergenceProbe.ts
 *
 * What this does:
 *   1. Runs the (10 rigs × N Mecanim versions) divergence matrix vs. the
 *      HoloScript contract baseline. With the canonical chain N=3 this is
 *      a 30-cell matrix.
 *   2. Emits .bench-logs/paper-6-gpu-bench.json with the structure the
 *      paper cites (line 402): per-version divergence rate, mean max-L1,
 *      p99 max-L1, and every per-rig cell with both hashes.
 *   3. Stdout prints the markdown table so manual paper paste-in stays
 *      quick.
 *
 * Why a runner: the harness has CI tests (p6-gpu-publication.test.ts)
 * that run the full matrix at probe-default scale. This runner is the
 * shipping slice that closes the (E2)→(E1) gate by writing the JSON
 * artifact at the path the paper's table references.
 *
 * Environment:
 *   PAPER6_OUT=<path>   override JSON output path
 *                       (default .bench-logs/paper-6-gpu-bench.json)
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  runMecanimDivergenceMatrix,
  PAPER_6_RIG_FIXTURES,
  PAPER_6_MECANIM_VERSION_CHAIN,
  type RigVersionCellResult,
  type PerVersionDivergenceStats,
} from '../Paper6MecanimDivergenceProbe';

export interface Paper6MecanimPublication {
  readonly benchmark: 'paper-6-mecanim-divergence';
  readonly paper_ref: 'ai-ecosystem/research/paper-6-animation-sca.tex';
  readonly spec_version: '2026-04-27_paper-6-mecanim-divergence-runner';
  readonly ran_at: string;
  readonly duration_ms: number;
  readonly rig_count: number;
  readonly version_count: number;
  readonly rigs: readonly { id: string; name: string; boneCount: number; category: string }[];
  readonly versions: readonly { label: string; samplerPrecision: string; keyframeTimeTolerance: number; tQuantizationStep: number; flushDenormals: boolean }[];
  readonly cells: readonly RigVersionCellResult[];
  readonly per_version: readonly PerVersionDivergenceStats[];
  readonly markdown_table: string;
}

export function runPaper6MecanimBenchmark(): Paper6MecanimPublication {
  const started = Date.now();
  const report = runMecanimDivergenceMatrix();
  const duration_ms = Date.now() - started;

  return {
    benchmark: 'paper-6-mecanim-divergence',
    paper_ref: 'ai-ecosystem/research/paper-6-animation-sca.tex',
    spec_version: '2026-04-27_paper-6-mecanim-divergence-runner',
    ran_at: new Date().toISOString(),
    duration_ms,
    rig_count: PAPER_6_RIG_FIXTURES.length,
    version_count: PAPER_6_MECANIM_VERSION_CHAIN.length,
    rigs: PAPER_6_RIG_FIXTURES.map((r) => ({
      id: r.id,
      name: r.name,
      boneCount: r.boneCount,
      category: r.category,
    })),
    versions: PAPER_6_MECANIM_VERSION_CHAIN.map((v) => ({
      label: v.label,
      samplerPrecision: v.samplerPrecision,
      keyframeTimeTolerance: v.keyframeTimeTolerance,
      tQuantizationStep: v.tQuantizationStep,
      flushDenormals: v.flushDenormals,
    })),
    cells: report.cells,
    per_version: report.perVersion,
    markdown_table: report.markdownTable,
  };
}

export function writePaper6Artifact(publication: Paper6MecanimPublication, out_path: string): void {
  mkdirSync(dirname(out_path), { recursive: true });
  // Stable JSON: ran_at + duration_ms are the only non-deterministic fields;
  // they're intentionally surfaced (CI diff tooling can ignore them).
  writeFileSync(out_path, JSON.stringify(publication, null, 2), 'utf8');
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  const idx = argv.indexOf('--out');
  const out_path =
    (idx >= 0 && argv[idx + 1]) ||
    process.env.PAPER6_OUT ||
    '.bench-logs/paper-6-gpu-bench.json';

  const publication = runPaper6MecanimBenchmark();
  writePaper6Artifact(publication, resolve(process.cwd(), out_path));

  // eslint-disable-next-line no-console
  console.log(
    `[paper-6-mecanim-divergence] rigs=${publication.rig_count} versions=${publication.version_count} cells=${publication.cells.length} duration_ms=${publication.duration_ms}`
  );
  // eslint-disable-next-line no-console
  console.log(publication.markdown_table);
  // eslint-disable-next-line no-console
  console.log(`-> ${out_path}`);
  return 0;
}

const _thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && process.argv[1] === _thisFile) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      // eslint-disable-next-line no-console
      console.error('[paper-6-mecanim-divergence] fatal', err);
      process.exit(1);
    }
  );
}
