/**
 * FairnessSweep — governed, replayable algorithmic-fairness evaluation built on
 * the REAL HoloScript experiment engine (not a re-implementation):
 *
 *   - the single bias sweep runs through `ExperimentOrchestrator` (+ its
 *     `ProvenanceTracker`), wrapping the institution's decision model as a
 *     `SolverHandle` whose `getStats()` returns the disparity scalars; and
 *   - the robustness band runs through `UncertaintyQuantification` (seeded LHS),
 *     so `getScalarDistribution('adverseImpactRatio').percentiles.{p5,p95}` IS
 *     the 90% confidence band and `.min` is the worst case.
 *
 * Core stays domain-free (D.007): the model, the cohort, and the population
 * perturbation are all INJECTED. No banking / insurance / healthcare vocabulary
 * lives here — the `.holo` domain bridge supplies the real model + point-in-time
 * data + the drift/noise semantics for a given vertical.
 *
 * @see ./FairnessReceipt — the sovereign receipt + Guarantee-6 replay primitives
 * @see ../experiment/ExperimentOrchestrator — the real sweep engine
 * @see ../UncertaintyQuantification — the real seeded-LHS robustness engine
 */

import {
  ExperimentOrchestrator,
  type SolverHandle,
} from '../experiment/ExperimentOrchestrator';
import { UncertaintyQuantification, type UQSolverHandle } from '../UncertaintyQuantification';
import {
  emitFairnessReceipt,
  emitRobustnessReceipt,
  hashContent,
  type FairnessMetrics,
  type FairnessReceipt,
  type FairnessRobustnessReceipt,
  type RobustnessBand,
} from './FairnessReceipt';
import type { HashMode } from '../sha256';

// ── Domain-free model + data abstractions ─────────────────────────────────────

/** One evaluated record: a protected-attribute value + an opaque feature payload. */
export interface FairnessRecord {
  /** Protected-attribute value (e.g. "A" / "B" / "group-1"). Domain-free. */
  group: string;
  /** Feature payload consumed by the decision model. */
  features: Record<string, number>;
}

/** The decision model under test — injected, so core never sees its internals. */
export interface FairnessModel {
  /** Stable model identifier. */
  id: string;
  /** Approve (true) / deny (false) a single record's features. */
  decide(features: Record<string, number>): boolean;
  /** Content that uniquely determines this model's behavior (weights / version). */
  fingerprint(): unknown;
}

/** A single ensemble replicate's perturbation knobs. */
export interface FairnessPerturbation {
  /** Population-drift magnitude for this replicate. */
  driftShift: number;
  /** Measurement-noise magnitude for this replicate. */
  noiseScale: number;
  /** Deterministic uniform stream, seeded per replicate. */
  rng: () => number;
}

/**
 * Perturb a base cohort for one robustness replicate. Domain-specific (which
 * feature drifts, for which subgroup) — supplied by the `.holo` bridge. A
 * feature-agnostic default ({@link defaultPerturber}) is used when omitted.
 */
export type CohortPerturber = (
  cohort: readonly FairnessRecord[],
  p: FairnessPerturbation,
) => FairnessRecord[];

// ── Deterministic RNG (mulberry32 — matches ParameterSpace's seeded PRNG) ──────

/** Seeded uniform PRNG in [0,1). Exported so injected perturbers can stay deterministic. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

/**
 * Feature-agnostic default perturbation: bootstrap-resample the cohort, then add
 * symmetric measurement noise to every feature (scaled by `noiseScale`). Drift
 * is genuinely domain-specific (which subgroup, which feature shifts), so the
 * default applies none — pass a `perturber` to model population drift for a
 * given vertical. Kept honest: this default proves the harness reuse, not a
 * vertical's real drift physics.
 */
export const defaultPerturber: CohortPerturber = (cohort, { noiseScale, rng }) => {
  const n = cohort.length;
  const out: FairnessRecord[] = [];
  for (let i = 0; i < n; i++) {
    const src = cohort[Math.floor(rng() * n)];
    const features: Record<string, number> = {};
    for (const k of Object.keys(src.features)) {
      features[k] = clamp01(src.features[k] + (rng() - 0.5) * 2 * noiseScale);
    }
    out.push({ group: src.group, features });
  }
  return out;
};

// ── Disparity math (the metrics regulators name) ──────────────────────────────

/**
 * Compute disparity metrics over a set of group-tagged decisions. Generalizes
 * the EEOC 4/5ths rule to N groups: adverse-impact ratio = min/max of the
 * per-group approval rates; demographic-parity diff = max − min.
 */
export function analyzeDisparity(
  decisions: ReadonlyArray<{ group: string; approved: boolean }>,
): FairnessMetrics {
  const counts = new Map<string, { n: number; approved: number }>();
  for (const d of decisions) {
    const c = counts.get(d.group) ?? { n: 0, approved: 0 };
    c.n++;
    if (d.approved) c.approved++;
    counts.set(d.group, c);
  }

  const approvalRate: Record<string, number> = {};
  const rates: number[] = [];
  for (const [group, c] of [...counts.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    const rate = c.n > 0 ? c.approved / c.n : 0;
    approvalRate[group] = round(rate);
    rates.push(rate);
  }

  const favored = rates.length ? Math.max(...rates) : 0;
  const disfavored = rates.length ? Math.min(...rates) : 0;
  const adverseImpactRatio = favored > 0 ? round(disfavored / favored) : 1;
  const demographicParityDiff = round(favored - disfavored);

  return {
    approvalRate,
    adverseImpactRatio,
    demographicParityDiff,
    fourFifthsPass: adverseImpactRatio >= 0.8,
  };
}

const round = (x: number): number => Math.round(x * 1e4) / 1e4;

// ── Solver handle: the model-under-test as an engine solver ───────────────────

/**
 * Wrap (model, cohort) as a `SolverHandle`. `solve()` runs the model over the
 * whole cohort; `getStats()` exposes the disparity metrics — the full
 * `FairnessMetrics` object under `metrics`, plus flattened numeric scalars so
 * the same handle flows through `UncertaintyQuantification`'s scalar collection.
 */
function fairnessSolverHandle(
  model: FairnessModel,
  cohort: readonly FairnessRecord[],
): SolverHandle {
  let metrics: FairnessMetrics | null = null;
  return {
    solve: () => {
      const decisions = cohort.map((r) => ({ group: r.group, approved: model.decide(r.features) }));
      metrics = analyzeDisparity(decisions);
    },
    getStats: () => {
      if (!metrics) return { converged: false };
      const stats: Record<string, unknown> = {
        metrics,
        adverseImpactRatio: metrics.adverseImpactRatio,
        demographicParityDiff: metrics.demographicParityDiff,
        fourFifthsPass: metrics.fourFifthsPass,
        converged: true,
      };
      for (const [g, rate] of Object.entries(metrics.approvalRate)) {
        stats[`approvalRate_${g}`] = rate;
      }
      return stats;
    },
    dispose: () => {},
  };
}

// ── Single bias sweep (Claims 1–3) ────────────────────────────────────────────

export interface FairnessSweepOptions {
  /** Protected attribute label recorded on the receipt (e.g. "group"). */
  protectedAttribute?: string;
  /** Seed recorded on the receipt as part of the replay key. */
  seed?: number;
  /** Fixed issuance timestamp (wall-clock in prod; fixed for byte-stable tests). */
  issuedAt?: string;
  /** Override the per-decision regulator crosswalk. */
  regulatoryMapping?: Record<string, string>;
  /** Hash mode: 'fnv1a' (default) or 'sha256' (adversarial-peer opt-in). */
  hashMode?: HashMode;
}

export interface FairnessSweepResult {
  receipt: FairnessReceipt;
  metrics: FairnessMetrics;
  inputHash: string;
  modelHash: string;
  weightStrategy: string;
}

/**
 * Run one fairness evaluation through the REAL `ExperimentOrchestrator` (a
 * single-variant grid sweep → one solver run, tracked by ProvenanceTracker) and
 * emit a per-decision {@link FairnessReceipt}.
 */
export async function runFairnessSweep(
  model: FairnessModel,
  cohort: readonly FairnessRecord[],
  options: FairnessSweepOptions = {},
): Promise<FairnessSweepResult> {
  const mode = options.hashMode;
  const inputHash = hashContent(cohort, mode);
  const modelHash = hashContent({ id: model.id }, mode);
  const weightStrategy = hashContent(model.fingerprint(), mode);

  const orchestrator = new ExperimentOrchestrator(() => fairnessSolverHandle(model, cohort));
  const result = await orchestrator.run({
    name: `fairness:${model.id}`,
    baseConfig: {},
    solverType: 'fairness',
    parameters: [], // empty → grid size 1 → exactly one model run over the cohort
    sampling: 'grid',
  });

  const metrics = result.runs[0]?.stats.metrics as FairnessMetrics | undefined;
  if (!metrics) {
    throw new Error('[FairnessSweep] orchestrator returned no metrics — solver did not run.');
  }

  const receipt = emitFairnessReceipt({
    modelId: model.id,
    modelHash,
    seed: options.seed ?? 0,
    inputHash,
    weightStrategy,
    sampleSize: cohort.length,
    protectedAttribute: options.protectedAttribute ?? 'group',
    metrics,
    regulatoryMapping: options.regulatoryMapping,
    issuedAt: options.issuedAt ?? new Date(0).toISOString(),
    hashMode: mode,
  });

  return { receipt, metrics, inputHash, modelHash, weightStrategy };
}

// ── Robustness sweep (Claims 4–5) ─────────────────────────────────────────────

export interface FairnessRobustnessOptions extends FairnessSweepOptions {
  /** Number of LHS replicates (default 200). */
  replicates?: number;
  /** Population-drift range [min, max] swept by LHS (default [-0.05, 0.10]). */
  driftRange?: [number, number];
  /** Measurement-noise range [min, max] swept by LHS (default [0, 0.05]). */
  noiseRange?: [number, number];
  /** Domain-specific cohort perturber (default {@link defaultPerturber}). */
  perturber?: CohortPerturber;
}

export interface FairnessRobustnessResult {
  receipt: FairnessRobustnessReceipt;
  band: RobustnessBand;
  verdict: FairnessRobustnessReceipt['verdict'];
  ensembleHash: string;
  ratios: number[];
}

/**
 * Run a seeded-LHS robustness sweep through the REAL
 * `UncertaintyQuantification` engine and emit a {@link FairnessRobustnessReceipt}.
 *
 * The LHS-sampled drift/noise values are applied to the per-replicate config and
 * read back by the wrapped solver, which perturbs the cohort and emits the
 * `adverseImpactRatio` scalar. UQ's reproducible LHS (fixed seed) makes the band
 * — and its `ensembleHash` — byte-identical on replay.
 */
export async function runFairnessRobustness(
  model: FairnessModel,
  cohort: readonly FairnessRecord[],
  options: FairnessRobustnessOptions = {},
): Promise<FairnessRobustnessResult> {
  const mode = options.hashMode;
  const replicates = options.replicates ?? 200;
  const [driftMin, driftMax] = options.driftRange ?? [-0.05, 0.1];
  const [noiseMin, noiseMax] = options.noiseRange ?? [0, 0.05];
  const perturber = options.perturber ?? defaultPerturber;

  const baseInputHash = hashContent(cohort, mode);
  const modelHash = hashContent({ id: model.id }, mode);
  const weightStrategy = hashContent(model.fingerprint(), mode);

  const uq = new UncertaintyQuantification(
    {
      name: `fairness-robustness:${model.id}`,
      baseConfig: {},
      solverType: 'fairness',
      uncertainParameters: [
        { path: 'driftShift', min: driftMin, max: driftMax },
        { path: 'noiseScale', min: noiseMin, max: noiseMax },
        { path: 'resampleU', min: 0, max: 1 },
      ],
      sampleCount: replicates,
      scalarKeys: ['adverseImpactRatio'],
    },
    (_type, cfg): UQSolverHandle => {
      let ratio = 1;
      return {
        solve: () => {
          const driftShift = (cfg.driftShift as number) ?? 0;
          const noiseScale = (cfg.noiseScale as number) ?? 0;
          const resampleU = (cfg.resampleU as number) ?? 0;
          const rng = mulberry32(Math.floor(resampleU * 2 ** 31) >>> 0);
          const pop = perturber(cohort, { driftShift, noiseScale, rng });
          const decisions = pop.map((r) => ({ group: r.group, approved: model.decide(r.features) }));
          ratio = analyzeDisparity(decisions).adverseImpactRatio;
        },
        getStats: () => ({ adverseImpactRatio: ratio, converged: true }),
        dispose: () => {},
      };
    },
  );

  await uq.solve();
  const dist = uq.getScalarDistribution('adverseImpactRatio');
  if (!dist) {
    throw new Error('[FairnessSweep] UQ produced no adverse-impact distribution.');
  }

  // Reconstruct the sorted ensemble for a reproducible content hash.
  const ratios = (uq.getResult()?.experimentResult.runs ?? [])
    .map((r) => r.stats.adverseImpactRatio as number)
    .filter((x) => typeof x === 'number' && Number.isFinite(x))
    .sort((a, b) => a - b);
  const ensembleHash = hashContent(ratios.map(round), mode);

  const band: RobustnessBand = {
    mean: round(dist.mean),
    std: round(dist.std),
    ci90: [round(dist.percentiles.p5), round(dist.percentiles.p95)],
    worstCase: round(dist.min),
  };

  const robustlyFair = dist.percentiles.p5 >= 0.8;
  const robustlyUnfair = dist.percentiles.p95 < 0.8;
  const verdict = robustlyFair
    ? 'ROBUSTLY-FAIR'
    : robustlyUnfair
      ? 'ROBUSTLY-UNFAIR'
      : 'INDETERMINATE-FAIRNESS';

  const receipt = emitRobustnessReceipt({
    modelId: model.id,
    modelHash,
    seed: options.seed ?? 0,
    baseInputHash,
    weightStrategy,
    replicates,
    ensembleHash,
    robustness: band,
    verdict,
    regulatoryMapping: options.regulatoryMapping,
    issuedAt: options.issuedAt ?? new Date(0).toISOString(),
    hashMode: mode,
  });

  return { receipt, band, verdict, ensembleHash, ratios };
}
