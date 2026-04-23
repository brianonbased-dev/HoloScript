/**
 * paper-13 benchmark runner — end-to-end contract audit on a synthetic T1 asset.
 *
 * Spec: ai-ecosystem/research/2026-04-23_paper-13-neural-rendering-contract-spec.md
 *
 * What this does:
 *   1. Builds a synthetic T1 NeuralAssetManifest with 4 canonical viewpoints
 *      (front/back/top/right-3/4) and realistic tolerance bands.
 *   2. Runs auditNeuralAsset() using a deterministic fixed-metrics comparator
 *      (real NeRF / 3DGS frame comparators land with framework bindings).
 *   3. Emits the ContractAuditResult as .bench-logs/neural-contract-audit.json.
 *
 * Why a synthetic runner: paper-13's implementable checklist needs an
 * end-to-end audit pipeline exercised by CI BEFORE framework-specific
 * bindings land. This runner is the contract between the core neural
 * rendering module and any future binding — if a binding can produce
 * ViewMetrics, this harness validates them against the manifest bounds.
 *
 * Framework adapters (NeRFBinding, GaussianSplatBinding) replace the
 * fixedMetricsComparator with real render-and-compare code. The benchmark
 * JSON shape stays stable so downstream trend analysis keeps working.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildManifest, type NeuralAssetManifest, type ViewSpec } from '../NeuralAssetManifest';
import {
  auditNeuralAsset,
  fixedMetricsComparator,
  type ContractAuditResult,
  type ViewMetrics,
} from '../ContractAudit';

export interface NeuralContractAuditBenchmark {
  benchmark: 'neural-contract-audit';
  spec_version: '2026-04-23_paper-13-neural-rendering-contract-spec';
  ran_at: string;
  duration_ms: number;
  manifest_asset_id: string;
  manifest_tier: 'T1';
  viewpoints: number;
  audit: ContractAuditResult;
  pass: boolean;
}

/** Synthetic viewpoint fixture: 4 cameras around a unit-sphere origin. */
function syntheticViewpoints(): ViewSpec[] {
  const r = 2.5;
  const mkView = (id: string, pos: [number, number, number], goldenSuffix: string): ViewSpec => ({
    view_id: id,
    camera: {
      position: pos,
      target: [0, 0, 0],
      up: [0, 1, 0],
      fov_degrees: 55,
      resolution: [1024, 1024],
    },
    golden_frame_hash: `fnv1a:golden:${goldenSuffix}`,
  });
  return [
    mkView('front', [0, 0, r], 'front'),
    mkView('back', [0, 0, -r], 'back'),
    mkView('top', [0, r, 0], 'top'),
    mkView('right_3q', [r * Math.cos(Math.PI / 4), r * 0.3, r * Math.sin(Math.PI / 4)], 'right_3q'),
  ];
}

/** Synthetic per-view metrics: within-bound values (PASS path by default). */
function syntheticPassingMetrics(views: ViewSpec[]): Record<string, ViewMetrics> {
  const out: Record<string, ViewMetrics> = {};
  // Spread metrics slightly so the benchmark exercises bound-checking, not a
  // degenerate "same number everywhere" case.
  const base = [
    { psnr: 34.2, ssim: 0.961, depth_l1: 0.038 },
    { psnr: 33.8, ssim: 0.958, depth_l1: 0.044 },
    { psnr: 35.1, ssim: 0.965, depth_l1: 0.031 },
    { psnr: 33.5, ssim: 0.955, depth_l1: 0.049 },
  ];
  views.forEach((v, i) => {
    const m = base[i % base.length];
    out[v.view_id] = {
      view_id: v.view_id,
      psnr: m.psnr,
      ssim: m.ssim,
      depth_l1: m.depth_l1,
      rendered_frame_hash: `fnv1a:rendered:${v.view_id}`,
    };
  });
  return out;
}

/** Synthetic per-view metrics: one viewpoint fails PSNR to exercise FAIL path. */
function syntheticFailingMetrics(views: ViewSpec[]): Record<string, ViewMetrics> {
  const passing = syntheticPassingMetrics(views);
  const first = views[0];
  if (first) {
    passing[first.view_id] = {
      ...passing[first.view_id],
      psnr: 22.4, // below psnr_min=30
    };
  }
  return passing;
}

export async function buildSyntheticT1Manifest(): Promise<NeuralAssetManifest> {
  return buildManifest({
    tier: 'T1',
    representation: 'nerf',
    checkpoint_hash: 'sha256:synthetic-t1-benchmark-ckpt-v1',
    canonical_viewpoints: syntheticViewpoints(),
    tolerance_bands: {
      psnr_min: 30,
      ssim_min: 0.92,
      depth_l1_max: 0.15,
    },
    hash_mode: 'fnv1a',
    upgrade_path: 'neural:fnv1a:meshproxy-fallback',
    created_at: '2026-04-23T00:00:00Z',
    created_by: 'paper-13-benchmark-synthetic',
  });
}

export interface RunOptions {
  /** Inject failing metrics for one viewpoint to exercise the violation path. */
  exercise_fail_path?: boolean;
}

export async function runContractAuditBenchmark(
  opts: RunOptions = {}
): Promise<NeuralContractAuditBenchmark> {
  const started = Date.now();
  const manifest = await buildSyntheticT1Manifest();
  const metrics = opts.exercise_fail_path
    ? syntheticFailingMetrics(manifest.canonical_viewpoints)
    : syntheticPassingMetrics(manifest.canonical_viewpoints);
  const comparator = fixedMetricsComparator(metrics);
  const audit = await auditNeuralAsset(manifest, comparator);
  const duration_ms = Date.now() - started;
  return {
    benchmark: 'neural-contract-audit',
    spec_version: '2026-04-23_paper-13-neural-rendering-contract-spec',
    ran_at: new Date().toISOString(),
    duration_ms,
    manifest_asset_id: manifest.asset_id,
    manifest_tier: 'T1',
    viewpoints: manifest.canonical_viewpoints.length,
    audit,
    pass: audit.pass,
  };
}

/** Write the benchmark artifact to disk. Idempotent on path. */
export function writeBenchmarkArtifact(
  result: NeuralContractAuditBenchmark,
  out_path: string
): void {
  mkdirSync(dirname(out_path), { recursive: true });
  writeFileSync(out_path, JSON.stringify(result, null, 2), 'utf8');
}

/** CLI entry — invoked when this file is run directly via node/tsx. */
export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  const exercise_fail_path = argv.includes('--fail-path');
  const idx = argv.indexOf('--out');
  const out_path = idx >= 0 && argv[idx + 1] ? argv[idx + 1] : '.bench-logs/neural-contract-audit.json';

  const result = await runContractAuditBenchmark({ exercise_fail_path });
  writeBenchmarkArtifact(result, resolve(process.cwd(), out_path));

  // Keep stdout terse so CI log diffs stay readable.
  // eslint-disable-next-line no-console
  console.log(
    `[neural-contract-audit] asset=${result.manifest_asset_id} views=${result.viewpoints} pass=${result.pass} duration_ms=${result.duration_ms} → ${out_path}`
  );
  if (result.audit.violations.length > 0) {
    // eslint-disable-next-line no-console
    console.log(`  violations: ${JSON.stringify(result.audit.violations)}`);
  }
  // Failing path exits 0 by design — the artifact is evidence, not a gate.
  // A separate CI rule can grep pass:false if the fail path is disallowed.
  return 0;
}

// Direct-execution guard — only runs when invoked as CLI, not when imported.
const _thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && process.argv[1] === _thisFile) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      // eslint-disable-next-line no-console
      console.error('[neural-contract-audit] fatal', err);
      process.exit(1);
    }
  );
}
