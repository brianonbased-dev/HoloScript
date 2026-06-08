/**
 * tropical-gamma-experiment.ts
 *
 * Paper 26 — Contribution 1 measurement experiment.
 *
 * CLAIM UNDER TEST
 * ────────────────
 * The tropical-geometry bilateral coordination bounding box produced by a
 * ParallelPillar yields a hemisphere-agreement scalar γ = 1 − box_area that
 * behaves as a *coordination agreement metric*: γ is high when the two
 * hemispheres observe the same underlying physics state, and decreases
 * monotonically as their measurements diverge.
 *
 * This script does NOT reimplement the primitive. It imports the REAL
 * `computeParallelBounds` / `makeParallelPillar` from ParallelPillar.ts and
 * drives them with realistic correlated physics-state slice pairs, then
 * measures the resulting γ distribution and its dependence on hemisphere
 * divergence.
 *
 * EXPERIMENTAL DESIGN
 * ───────────────────
 * Two hemispheres (left / right) each observe the SAME underlying physics
 * state — a 2D point (s1, s2) ∈ [0,1]² sweeping the conservation axis (s1)
 * and the symmetry axis (s2). Each hemisphere reports a noisy measurement:
 *
 *   left.pos_k  = clamp01(s_k + ε_L,k)
 *   right.pos_k = clamp01(s_k + ε_R,k)
 *
 * where ε are zero-mean Gaussians whose standard deviation is the
 * "divergence" parameter d ∈ [0,1]. d=0 ⇒ perfect agreement (both
 * hemispheres see the true state); larger d ⇒ measurements drift apart.
 *
 * The two hemispheres are partially correlated (ρ): in a real bilateral
 * system the hemispheres share an underlying observation, so their errors
 * are not independent. We model a shared common-mode error plus an
 * independent per-hemisphere error.
 *
 * γ is collected over a sweep of divergence levels and a large per-level
 * sample. The validation is that mean(γ | d) decreases monotonically in d.
 *
 * RUN
 * ───
 *   npx tsx packages/core/src/traits/pillar/sim/tropical-gamma-experiment.ts
 *
 * Emits:
 *   research/paper-26-artifacts/tropical-gamma-experiment-<date>.json
 *   research/paper-26-artifacts/tropical-gamma-experiment-<date>.md
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { computeParallelBounds, makeParallelPillar } from '../ParallelPillar';
import type { Pillar, PillarContext } from '../PillarRegistry';
import type { PillarSlice } from '../SemanticCollaborationContract';

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic RNG (mulberry32) — reproducible artifact across runs
// ─────────────────────────────────────────────────────────────────────────────
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box–Muller standard normal from a uniform RNG. */
function randn(rng: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

// ─────────────────────────────────────────────────────────────────────────────
// Hemisphere pillars whose pos values are injected per-sample via metadata.
// These are REAL physics-domain Pillars (pillar_domain: 'physics'); the
// generate() reads the noisy measured positions from the PillarContext.metadata.
// We feed slices through the REAL computeParallelBounds / makeParallelPillar.
// ─────────────────────────────────────────────────────────────────────────────

const LEFT_OBS_PILLAR: Pillar = {
  id: 'physics_observer_left',
  domain: 'physics',
  axis_vocabulary: ['conservation', 'symmetry'] as const,
  generate(context: PillarContext): PillarSlice {
    const m = context.metadata as Record<string, number>;
    return {
      axis_1_id: 'conservation',
      axis_2_id: 'symmetry',
      pos_1: m.left_pos_1,
      pos_2: m.left_pos_2,
      pillar_id: this.id,
      pillar_domain: this.domain,
    };
  },
};

const RIGHT_OBS_PILLAR: Pillar = {
  id: 'physics_observer_right',
  domain: 'physics',
  axis_vocabulary: ['conservation', 'symmetry'] as const,
  generate(context: PillarContext): PillarSlice {
    const m = context.metadata as Record<string, number>;
    return {
      axis_1_id: 'conservation',
      axis_2_id: 'symmetry',
      pos_1: m.right_pos_1,
      pos_2: m.right_pos_2,
      pillar_id: this.id,
      pillar_domain: this.domain,
    };
  },
};

// REAL primitive: pair the two hemisphere observers.
const BILATERAL_PHYSICS_PARALLEL = makeParallelPillar(
  'bilateral_physics_observer',
  LEFT_OBS_PILLAR,
  RIGHT_OBS_PILLAR
);

// ─────────────────────────────────────────────────────────────────────────────
// Sample generation
// ─────────────────────────────────────────────────────────────────────────────

interface GammaSample {
  divergence: number;
  s1: number;
  s2: number;
  left_pos_1: number;
  left_pos_2: number;
  right_pos_1: number;
  right_pos_2: number;
  box_area: number;
  gamma: number;
}

/**
 * Generate one (left,right) physics-slice pair observing true state (s1,s2)
 * with measurement divergence d, and run it through the REAL primitive.
 *
 * Error model: shared common-mode component (correlation ρ) + independent
 * per-hemisphere component. Total per-hemisphere error std = d.
 */
function sampleGamma(
  rng: () => number,
  d: number,
  s1: number,
  s2: number,
  rho: number
): GammaSample {
  // Split variance d^2 into common (rho) and independent (1-rho) parts.
  const commonStd = d * Math.sqrt(rho);
  const indepStd = d * Math.sqrt(1 - rho);

  const common1 = randn(rng) * commonStd;
  const common2 = randn(rng) * commonStd;

  const eL1 = common1 + randn(rng) * indepStd;
  const eL2 = common2 + randn(rng) * indepStd;
  const eR1 = common1 + randn(rng) * indepStd;
  const eR2 = common2 + randn(rng) * indepStd;

  const left_pos_1 = clamp01(s1 + eL1);
  const left_pos_2 = clamp01(s2 + eL2);
  const right_pos_1 = clamp01(s1 + eR1);
  const right_pos_2 = clamp01(s2 + eR2);

  // Drive the REAL primitive via makeParallelPillar.generateParallel so that
  // both code paths (factory + computeParallelBounds) are exercised.
  const ctx: PillarContext = {
    layer: 'experiment',
    agent_id: 'tropical-gamma-experiment',
    timestamp_ms: 0,
    metadata: { left_pos_1, left_pos_2, right_pos_1, right_pos_2 },
  };
  const slice = BILATERAL_PHYSICS_PARALLEL.generateParallel(ctx);

  // Cross-check against the standalone computeParallelBounds export.
  const standalone = computeParallelBounds(slice.left, slice.right);
  if (Math.abs(standalone.hemisphere_agreement - slice.hemisphere_agreement) > 1e-12) {
    throw new Error('PRIMITIVE INCONSISTENCY: factory γ ≠ standalone computeParallelBounds γ');
  }

  return {
    divergence: d,
    s1,
    s2,
    left_pos_1,
    left_pos_2,
    right_pos_1,
    right_pos_2,
    box_area: slice.box_area,
    gamma: slice.hemisphere_agreement,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Stats helpers
// ─────────────────────────────────────────────────────────────────────────────
function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
function std(xs: number[], mu: number): number {
  return Math.sqrt(xs.reduce((a, b) => a + (b - mu) * (b - mu), 0) / xs.length);
}

/** Pearson correlation between two equal-length arrays. */
function pearson(xs: number[], ys: number[]): number {
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < xs.length; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    dx += (xs[i] - mx) ** 2;
    dy += (ys[i] - my) ** 2;
  }
  return num / Math.sqrt(dx * dy);
}

// ─────────────────────────────────────────────────────────────────────────────
// Experiment
// ─────────────────────────────────────────────────────────────────────────────
function main(): void {
  const SEED = 26_2026; // Paper 26, year 2026
  const RHO = 0.5; // hemisphere error correlation (shared common-mode)
  const STATES_PER_LEVEL = 100; // (s1,s2) grid samples per divergence level
  const REPS_PER_STATE = 12; // noise repetitions per state
  const DIVERGENCE_LEVELS = [0.0, 0.02, 0.05, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5, 0.7, 1.0];

  const rng = mulberry32(SEED);

  const allGammas: number[] = [];
  const allDiv: number[] = [];
  const perLevel: Array<{
    divergence: number;
    n: number;
    mean_gamma: number;
    std_gamma: number;
    min_gamma: number;
    max_gamma: number;
    mean_box_area: number;
  }> = [];

  for (const d of DIVERGENCE_LEVELS) {
    const levelGammas: number[] = [];
    const levelAreas: number[] = [];
    for (let si = 0; si < STATES_PER_LEVEL; si++) {
      // True physics state sampled uniformly across the [0,1]² unit square
      // (conservation axis × symmetry axis).
      const s1 = rng();
      const s2 = rng();
      for (let r = 0; r < REPS_PER_STATE; r++) {
        const sample = sampleGamma(rng, d, s1, s2, RHO);
        levelGammas.push(sample.gamma);
        levelAreas.push(sample.box_area);
        allGammas.push(sample.gamma);
        allDiv.push(d);
      }
    }
    const mu = mean(levelGammas);
    perLevel.push({
      divergence: d,
      n: levelGammas.length,
      mean_gamma: mu,
      std_gamma: std(levelGammas, mu),
      min_gamma: Math.min(...levelGammas),
      max_gamma: Math.max(...levelGammas),
      mean_box_area: mean(levelAreas),
    });
  }

  // ── Global stats ───────────────────────────────────────────────────────────
  const N = allGammas.length;
  const globalMean = mean(allGammas);
  const globalStd = std(allGammas, globalMean);
  const globalMin = Math.min(...allGammas);
  const globalMax = Math.max(...allGammas);

  // ── Validation checks ────────────────────────────────────────────────────
  const inRange = allGammas.every((g) => g >= 0 && g <= 1);

  // Monotonic decrease of mean γ with divergence.
  let monotonic = true;
  for (let i = 1; i < perLevel.length; i++) {
    if (perLevel[i].mean_gamma > perLevel[i - 1].mean_gamma + 1e-9) {
      monotonic = false;
      break;
    }
  }

  // γ vs divergence correlation should be strongly negative.
  const corrGammaDiv = pearson(allGammas, allDiv);

  // At d=0 γ must be exactly 1 (point box, perfect agreement).
  const gammaAtZero = perLevel[0].mean_gamma;
  const perfectAtZero = Math.abs(gammaAtZero - 1) < 1e-9;

  const validates = inRange && monotonic && corrGammaDiv < -0.3 && perfectAtZero;

  // ── Artifact ───────────────────────────────────────────────────────────────
  const date = new Date().toISOString().slice(0, 10);
  const __filename = fileURLToPath(import.meta.url);
  const repoRoot = resolve(dirname(__filename), '../../../../../..');
  const outDir = resolve(repoRoot, 'research/paper-26-artifacts');
  mkdirSync(outDir, { recursive: true });

  const artifact = {
    experiment: 'paper-26-contribution-1-tropical-gamma',
    claim:
      'γ = 1 − box_area from the tropical-geometry bilateral coordination bounding box is a coordination-agreement metric: high when hemispheres agree, monotonically decreasing as measurement divergence increases.',
    primitive: {
      source: 'packages/core/src/traits/pillar/ParallelPillar.ts',
      functions: ['computeParallelBounds', 'makeParallelPillar'],
      definition: 'box_area = (pos_1_max − pos_1_min) · (pos_2_max − pos_2_min); γ = 1 − box_area',
    },
    method: {
      rng: 'mulberry32',
      seed: SEED,
      hemisphere_error_correlation_rho: RHO,
      true_state_axes: ['conservation (pos_1)', 'symmetry (pos_2)'],
      pillar_domain: 'physics',
      states_per_level: STATES_PER_LEVEL,
      reps_per_state: REPS_PER_STATE,
      divergence_levels: DIVERGENCE_LEVELS,
      total_samples: N,
      error_model:
        'each hemisphere measures true state (s1,s2) ∈ [0,1]² with zero-mean Gaussian noise std = divergence d, split into a shared common-mode (rho) and independent component; positions clamped to [0,1].',
    },
    global_stats: {
      n: N,
      mean_gamma: globalMean,
      std_gamma: globalStd,
      min_gamma: globalMin,
      max_gamma: globalMax,
    },
    divergence_sweep: perLevel,
    validation: {
      gamma_in_unit_range: inRange,
      mean_gamma_monotonic_decreasing_in_divergence: monotonic,
      gamma_divergence_pearson_corr: corrGammaDiv,
      gamma_at_zero_divergence: gammaAtZero,
      perfect_agreement_at_zero_divergence: perfectAtZero,
      claim_validated: validates,
    },
  };

  const jsonPath = resolve(outDir, `tropical-gamma-experiment-${date}.json`);
  writeFileSync(jsonPath, JSON.stringify(artifact, null, 2), 'utf8');

  // ── Human-readable summary ───────────────────────────────────────────────
  const md = `# Paper 26 — Contribution 1: Tropical-Geometry Bilateral Coordination γ

**Date:** ${date}
**Experiment:** \`paper-26-contribution-1-tropical-gamma\`
**Primitive (REAL, imported — not reimplemented):** \`packages/core/src/traits/pillar/ParallelPillar.ts\` → \`computeParallelBounds\`, \`makeParallelPillar\`
**Definition:** \`box_area = (pos_1_max − pos_1_min)·(pos_2_max − pos_2_min)\`, \`γ = 1 − box_area\`

## Claim under test

> γ = 1 − box_area, the hemisphere-agreement scalar from the tropical bilateral bounding box, is a **coordination-agreement metric**: high when the two hemispheres observe the same underlying physics state, and **monotonically decreasing** as their measurements diverge.

## Method

Two REAL physics-domain (\`pillar_domain: 'physics'\`) hemisphere Pillars each observe the same true state \`(s1, s2) ∈ [0,1]²\` (conservation axis × symmetry axis) with zero-mean Gaussian measurement noise of std = divergence \`d\`, split into a shared common-mode part (ρ = ${RHO}) and an independent part. Each \`(left,right)\` pair is fed through the real \`makeParallelPillar().generateParallel()\`; γ is also cross-checked against the standalone \`computeParallelBounds\` export (asserted equal). Sweep over ${DIVERGENCE_LEVELS.length} divergence levels × ${STATES_PER_LEVEL} states × ${REPS_PER_STATE} reps = **${N} samples**, deterministic (mulberry32, seed ${SEED}).

## Global γ distribution

| stat | value |
|------|-------|
| N | ${N} |
| mean γ | ${globalMean.toFixed(6)} |
| std γ | ${globalStd.toFixed(6)} |
| min γ | ${globalMin.toFixed(6)} |
| max γ | ${globalMax.toFixed(6)} |

## Divergence sweep (the validation relationship)

| divergence d | n | mean γ | std γ | min γ | max γ | mean box_area |
|--------------|---|--------|-------|-------|-------|---------------|
${perLevel
  .map(
    (l) =>
      `| ${l.divergence.toFixed(2)} | ${l.n} | ${l.mean_gamma.toFixed(5)} | ${l.std_gamma.toFixed(5)} | ${l.min_gamma.toFixed(5)} | ${l.max_gamma.toFixed(5)} | ${l.mean_box_area.toFixed(5)} |`
  )
  .join('\n')}

## Validation

| check | result |
|-------|--------|
| γ ∈ [0,1] for all samples | ${inRange ? 'PASS' : 'FAIL'} |
| mean γ monotonically decreasing in divergence | ${monotonic ? 'PASS' : 'FAIL'} |
| γ↔divergence Pearson correlation | ${corrGammaDiv.toFixed(4)} (${corrGammaDiv < -0.3 ? 'strongly negative — PASS' : 'FAIL'}) |
| γ = 1 at zero divergence (point box) | ${perfectAtZero ? 'PASS' : 'FAIL'} (mean=${gammaAtZero.toFixed(6)}) |
| **Claim validated** | **${validates ? 'YES' : 'NO'}** |

## Interpretation

${
  validates
    ? `γ behaves exactly as a coordination-agreement metric should. At zero measurement divergence the two hemispheres collapse to the same point, the tropical bounding box degenerates (area 0), and γ = 1 (perfect agreement). As divergence grows, the box expands and γ falls monotonically, with a strong negative γ↔divergence correlation (${corrGammaDiv.toFixed(3)}). This is the measured evidence backing Paper 26 Contribution 1: the tropical bilateral bounding box is a valid coordination-agreement measure, not merely an asserted construction.`
    : `γ does NOT cleanly satisfy the coordination-agreement properties on this measurement set — see the failing checks above. Report this as the finding rather than forcing a number.`
}

Artifact JSON: \`research/paper-26-artifacts/tropical-gamma-experiment-${date}.json\`
`;

  const mdPath = resolve(outDir, `tropical-gamma-experiment-${date}.md`);
  writeFileSync(mdPath, md, 'utf8');

  // ── Console report ─────────────────────────────────────────────────────────
  /* eslint-disable no-console */
  console.log('=== Paper 26 C1 — Tropical γ experiment ===');
  console.log(`samples: ${N}`);
  console.log(
    `global mean γ: ${globalMean.toFixed(6)}  std: ${globalStd.toFixed(6)}  range:[${globalMin.toFixed(4)}, ${globalMax.toFixed(4)}]`
  );
  console.log('divergence → mean γ:');
  for (const l of perLevel) {
    console.log(
      `  d=${l.divergence.toFixed(2)}  γ=${l.mean_gamma.toFixed(5)}  box_area=${l.mean_box_area.toFixed(5)}`
    );
  }
  console.log(`γ↔divergence corr: ${corrGammaDiv.toFixed(4)}`);
  console.log(`γ∈[0,1]: ${inRange}  monotonic↓: ${monotonic}  γ(d=0)=1: ${perfectAtZero}`);
  console.log(`CLAIM VALIDATED: ${validates}`);
  console.log(`artifact: ${jsonPath}`);
  console.log(`summary:  ${mdPath}`);
  /* eslint-enable no-console */
}

main();
