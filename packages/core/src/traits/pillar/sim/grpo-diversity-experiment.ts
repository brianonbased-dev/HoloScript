/**
 * grpo-diversity-experiment.ts — Paper 26, Contribution 3 (tractable subset)
 *
 * MEASURED CLAIM
 * ──────────────
 * "Diverse pillar coordinates produce a diverse (non-collapsed) training
 *  distribution, and a collapsed agent is detected."  This validates the
 *  mode-collapse guard, which is the measurable part of the GRPO diversity
 *  guarantee (Paper 26 §contribution 3).
 *
 * WHAT THIS DOES
 * ──────────────
 *   1. Drives the REAL `sliceEmitterHandler` (SliceEmitter.ts) — not a
 *      reimplementation — over two slice streams:
 *        (a) HEALTHY  — real seed Pillars (PillarRegistry.ts) generate varied
 *                       slices across many domains with randomised metadata.
 *        (b) COLLAPSED — a single agent re-emits near-identical (p1,p2) from
 *                       one pillar (mode collapse).
 *   2. Measures the diversity_ratio ρ emitted on `emitter:diversity_stats`
 *      over a rolling window W=1000, and checks the alert fires below
 *      config.diversity_target for the collapsed stream only.
 *   3. Computes the GRPO advantage variance for diverse vs collapsed groups
 *      using a synthetic reward = -L_total proxy (the real GRPORewardFunctions
 *      shell out to vitest/tsc/eslint per-completion and cannot be driven
 *      in-process over thousands of slices). This shows the mechanistic link:
 *      diverse groups → high within-group reward variance → non-zero
 *      policy-gradient signal; collapsed groups → ~0 variance → ~0 signal.
 *
 * DEFERRED (NOT measured here — honestly out of scope)
 * ────────────────────────────────────────────────────
 *   The full poverty-of-stimulus M/N generalization claim (a policy TRAINED on
 *   N slices generalizing to M>N held-out scenarios) requires a real,
 *   long-running GRPO training loop with the live reward pipeline. That is
 *   explicitly marked `deferred` in the artifact. This experiment measures only
 *   the diversity-guarantee + advantage-variance link, which is tractable now.
 *
 * RUN:  npx tsx packages/core/src/traits/pillar/sim/grpo-diversity-experiment.ts
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { sliceEmitterHandler, type DiversityStats } from '../SliceEmitter.js';
import type { SliceEmitterConfig } from '../SliceEmitter.js';
import {
  PHYSICS_CONSERVATION_PILLAR,
  INTENT_TRUTH_APPROVAL_PILLAR,
  RENDERING_LOD_PILLAR,
  AGENT_GOAL_PILLAR,
  ECONOMICS_BUDGET_PILLAR,
  SOLVER_PRECISION_PILLAR,
  COORDINATION_SYNC_PILLAR,
  STORAGE_CAPACITY_PILLAR,
  type Pillar,
  type PillarContext,
} from '../PillarRegistry.js';
import type { PillarSlice, BrainCoord } from '../SemanticCollaborationContract.js';
import type { HSPlusNode, TraitContext, TraitEvent } from '../../TraitTypes.js';

// ─────────────────────────────────────────────────────────────────────────────
// Minimal harness around the REAL trait handler
// ─────────────────────────────────────────────────────────────────────────────

const WINDOW = 1000;
const DIVERSITY_TARGET = 0.8;

/** A deterministic LCG so the run is reproducible (no Math.random nondeterminism). */
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

/** Build the minimal node + context needed to drive sliceEmitterHandler. */
function makeRig(config: SliceEmitterConfig) {
  const node = {} as HSPlusNode;
  const diversityLog: DiversityStats[] = [];
  const ctx = {
    emit(event: string, payload?: unknown) {
      if (event === 'emitter:diversity_stats') {
        diversityLog.push(payload as DiversityStats);
      }
    },
  } as unknown as TraitContext;
  sliceEmitterHandler.onAttach?.(node, config, ctx);
  return { node, ctx, diversityLog };
}

/** Feed one slice through the real handler's emitter:emit path. */
function emitSlice(
  node: HSPlusNode,
  config: SliceEmitterConfig,
  ctx: TraitContext,
  slice: PillarSlice,
  agent_id: string,
  sim_step: number
): void {
  const brain_coord: BrainCoord = { mni_x: 0, mni_y: 0, mni_z: 0, cortical_depth: 3 };
  const event: TraitEvent = {
    type: 'emitter:emit',
    payload: { slice, brain_coord, sim_step, agent_id },
  };
  sliceEmitterHandler.onEvent?.(node, config, ctx, event);
}

// ─────────────────────────────────────────────────────────────────────────────
// Stream generators (use REAL Pillars; only vary the inputs)
// ─────────────────────────────────────────────────────────────────────────────

const HEALTHY_PILLARS: Pillar[] = [
  PHYSICS_CONSERVATION_PILLAR,
  INTENT_TRUTH_APPROVAL_PILLAR,
  RENDERING_LOD_PILLAR,
  AGENT_GOAL_PILLAR,
  ECONOMICS_BUDGET_PILLAR,
  SOLVER_PRECISION_PILLAR,
  COORDINATION_SYNC_PILLAR,
  STORAGE_CAPACITY_PILLAR,
];

/**
 * HEALTHY: many agents, many domains, randomised metadata so the real Pillars
 * emit slices spread across the coordinate space. Metadata keys are the union
 * of fields the seed Pillars read; each Pillar picks the ones it needs.
 */
function healthySlice(rng: () => number, step: number): { slice: PillarSlice; agent: string } {
  const pillar = HEALTHY_PILLARS[Math.floor(rng() * HEALTHY_PILLARS.length)];
  const r = () => Math.round(rng() * 100) / 100; // 2-decimal grid (matches fingerprint .toFixed(2))
  const metadata: Record<string, unknown> = {
    energy_conservation: r(), violation_pressure: r(),
    truth_score: r(), approval_pressure: r(),
    lod_level: r(), distance: r(),
    goal_priority: r(), goal_progress: r(),
    budget_used: r(), value_delivered: r(),
    convergence: r(), timestep: r(),
    consensus: r(), trust: r(),
    retrieval_load: r(), compression: r(),
  };
  const ctx: PillarContext = {
    layer: 'inner_loop',
    agent_id: `agent_${Math.floor(rng() * 12)}`,
    timestamp_ms: step,
    metadata,
  };
  const slice = pillar.generate(ctx);
  return { slice, agent: ctx.agent_id };
}

/**
 * COLLAPSED: a single agent that has mode-collapsed — it emits from ONE pillar
 * with near-fixed metadata, so (axis ids, pos_1, pos_2) repeat after rounding.
 * A tiny jitter << 0.005 keeps the floats moving but collapses under toFixed(2),
 * which is exactly the regime the SliceEmitter fingerprint is built to catch.
 */
function collapsedSlice(rng: () => number, step: number): { slice: PillarSlice; agent: string } {
  const pillar = AGENT_GOAL_PILLAR;
  const jitter = () => 0.5 + (rng() - 0.5) * 0.004; // ±0.002 → identical at toFixed(2)
  const ctx: PillarContext = {
    layer: 'inner_loop',
    agent_id: 'collapsed_agent',
    timestamp_ms: step,
    metadata: { goal_priority: jitter(), goal_progress: jitter() },
  };
  const slice = pillar.generate(ctx);
  return { slice, agent: ctx.agent_id };
}

// ─────────────────────────────────────────────────────────────────────────────
// Run a stream and capture final ρ
// ─────────────────────────────────────────────────────────────────────────────

interface Checkpoint {
  n: number;
  unique: number;
  diversity_ratio: number;
}

interface StreamResult {
  label: string;
  total: number;
  unique: number;
  diversity_ratio: number;
  alert_fired: boolean;
  first_alert_step: number | null;
  /** ρ sampled at N = 10, 100, 1000 — exposes cumulative decay behaviour */
  checkpoints: Checkpoint[];
  /** the (pos_1,pos_2) groups used for the advantage calc */
  slices: PillarSlice[];
}

function runStream(
  label: string,
  gen: (rng: () => number, step: number) => { slice: PillarSlice; agent: string },
  seed: number
): StreamResult {
  const config: SliceEmitterConfig = {
    emit_to_grpo: false,
    emit_to_knowledge_store: false,
    max_buffer_size: WINDOW,
    diversity_target: DIVERSITY_TARGET,
  };
  const { node, ctx, diversityLog } = makeRig(config);
  const rng = makeRng(seed);
  const slices: PillarSlice[] = [];
  let firstAlert: number | null = null;
  const checkpointAt = new Set([10, 100, 1000]);
  const checkpoints: Checkpoint[] = [];

  for (let step = 0; step < WINDOW; step++) {
    const { slice, agent } = gen(rng, step);
    emitSlice(node, config, ctx, slice, agent, step);
    slices.push(slice);
    const last = diversityLog[diversityLog.length - 1];
    if (firstAlert === null && last.diversity_ratio < DIVERSITY_TARGET) {
      firstAlert = step;
    }
    if (checkpointAt.has(last.total_count)) {
      checkpoints.push({
        n: last.total_count,
        unique: last.unique_count,
        diversity_ratio: last.diversity_ratio,
      });
    }
  }

  const final = diversityLog[diversityLog.length - 1];
  return {
    label,
    total: final.total_count,
    unique: final.unique_count,
    diversity_ratio: final.diversity_ratio,
    alert_fired: final.diversity_ratio < DIVERSITY_TARGET,
    first_alert_step: firstAlert,
    checkpoints,
    slices,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// GRPO advantage variance (synthetic reward = -L_total proxy)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Synthetic per-slice reward proxy. In real GRPO the reward comes from
 * GRPORewardFunctions (vitest/tsc/eslint pass-rates). Here we use a smooth,
 * coordinate-dependent reward r = -L_total, with L_total = ||(p1,p2)-target||²,
 * so a slice's reward is a deterministic function of its pillar coordinates.
 * Diverse coordinates → diverse rewards within a group; collapsed coordinates →
 * (near-)identical rewards.
 */
function reward(slice: PillarSlice): number {
  const targetP1 = 0.7;
  const targetP2 = 0.3;
  const l = (slice.pos_1 - targetP1) ** 2 + (slice.pos_2 - targetP2) ** 2;
  return -l; // r = -L_total
}

/**
 * GRPO group-relative advantage: A_i = (r_i - mean(r)) / (std(r) + eps).
 * The policy-gradient signal magnitude scales with within-group reward spread.
 * We report the within-group reward variance (the un-normalised driver) so the
 * collapse → zero-signal effect is visible without the eps regulariser hiding it.
 */
function advantageStats(slices: PillarSlice[], groupSize = 8): {
  mean_reward_variance: number;
  mean_abs_advantage: number;
  groups: number;
} {
  let varSum = 0;
  let advSum = 0;
  let groups = 0;
  for (let i = 0; i + groupSize <= slices.length; i += groupSize) {
    const group = slices.slice(i, i + groupSize);
    const rewards = group.map(reward);
    const mean = rewards.reduce((a, b) => a + b, 0) / rewards.length;
    const variance = rewards.reduce((a, b) => a + (b - mean) ** 2, 0) / rewards.length;
    const std = Math.sqrt(variance);
    const advantages = rewards.map((r) => (r - mean) / (std + 1e-8));
    varSum += variance;
    advSum += advantages.reduce((a, b) => a + Math.abs(b), 0) / advantages.length;
    groups++;
  }
  return {
    mean_reward_variance: varSum / groups,
    mean_abs_advantage: advSum / groups,
    groups,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

function main(): void {
  const healthy = runStream('healthy', healthySlice, 0xC0FFEE);
  const collapsed = runStream('collapsed', collapsedSlice, 0xBADBEEF);

  const healthyAdv = advantageStats(healthy.slices);
  const collapsedAdv = advantageStats(collapsed.slices);

  const date = new Date().toISOString().slice(0, 10);

  const artifact = {
    experiment: 'grpo-diversity-experiment',
    paper: 'Paper 26',
    contribution: 'Contribution 3 — GRPO diversity guarantee (tractable subset)',
    date,
    config: { window: WINDOW, diversity_target: DIVERSITY_TARGET, group_size: 8 },
    real_components_used: [
      'packages/core/src/traits/pillar/SliceEmitter.ts :: sliceEmitterHandler (diversity tracking, unmodified)',
      'packages/core/src/traits/pillar/PillarRegistry.ts :: seed Pillars (real slice generation)',
    ],
    measured: {
      diversity_guarantee: {
        healthy: {
          total: healthy.total,
          unique: healthy.unique,
          diversity_ratio: healthy.diversity_ratio,
          alert_fired: healthy.alert_fired,
          first_alert_step: healthy.first_alert_step,
          checkpoints: healthy.checkpoints,
        },
        collapsed: {
          total: collapsed.total,
          unique: collapsed.unique,
          diversity_ratio: collapsed.diversity_ratio,
          alert_fired: collapsed.alert_fired,
          first_alert_step: collapsed.first_alert_step,
          checkpoints: collapsed.checkpoints,
        },
        // Honest discrimination metric: at matched N the healthy stream carries
        // far more unique fingerprints than the collapsed one. This is the real,
        // robust signal — and it does NOT depend on the fixed 0.8 threshold.
        discrimination_ratio_unique_healthy_over_collapsed:
          collapsed.unique > 0 ? healthy.unique / collapsed.unique : Infinity,
        // The collapse guard (ρ < target) fires correctly for the collapsed
        // stream (true positive). The collapsed agent IS detected.
        collapse_detected: collapsed.diversity_ratio < DIVERSITY_TARGET && collapsed.alert_fired,
        // FINDING (honest negative): SliceEmitter's diversity_ratio is a LIFETIME
        // cumulative ratio (unique_fingerprints Set never evicts; total_count
        // grows unbounded — SliceEmitter.ts:212-216). For ANY stream with a
        // bounded fingerprint vocabulary, ρ → 0 as total → ∞. So a healthy
        // stream ALSO trips the fixed 0.8 threshold over a long run (here ρ_healthy
        // = 0.371 at N=1000). The fixed-threshold guard therefore over-alerts on
        // healthy long-running streams — a real mis-tuning / spec defect, NOT a
        // pass. The robust collapse signal is the discrimination ratio + the rate
        // of unique-count growth, not the absolute ρ vs a static threshold.
        finding_threshold_is_miscalibrated_for_cumulative_ratio: true,
      },
      advantage_variance_link: {
        note:
          'Synthetic reward r = -L_total proxy; real GRPORewardFunctions ' +
          'shell out per-completion and cannot be driven in-process at this scale.',
        healthy_mean_reward_variance: healthyAdv.mean_reward_variance,
        collapsed_mean_reward_variance: collapsedAdv.mean_reward_variance,
        healthy_mean_abs_advantage: healthyAdv.mean_abs_advantage,
        collapsed_mean_abs_advantage: collapsedAdv.mean_abs_advantage,
        variance_ratio_healthy_over_collapsed:
          collapsedAdv.mean_reward_variance > 0
            ? healthyAdv.mean_reward_variance / collapsedAdv.mean_reward_variance
            : Infinity,
      },
    },
    deferred: {
      poverty_of_stimulus_M_over_N:
        'NOT measured. The full generalization claim — a policy TRAINED on N ' +
        'slices generalizing to M>N held-out scenarios — requires a real ' +
        'long-running GRPO training loop with the live reward pipeline ' +
        '(GRPORewardFunctions / GRPORewardOrchestrator). Out of scope for this ' +
        'artifact; remains future work.',
    },
  };

  const dir = resolve(process.cwd(), 'research', 'paper-26-artifacts');
  mkdirSync(dir, { recursive: true });
  const jsonPath = resolve(dir, `grpo-diversity-experiment-${date}.json`);
  writeFileSync(jsonPath, JSON.stringify(artifact, null, 2));

  const m = artifact.measured;
  const md = `# GRPO Diversity Experiment — Paper 26 Contribution 3 (tractable subset)

**Date:** ${date}
**Script:** \`packages/core/src/traits/pillar/sim/grpo-diversity-experiment.ts\`
**Run:** \`npx tsx packages/core/src/traits/pillar/sim/grpo-diversity-experiment.ts\`

## What is measured

Drives the **real** \`sliceEmitterHandler\` (SliceEmitter.ts, unmodified) and the
**real** seed Pillars (PillarRegistry.ts) over two slice streams of W=${WINDOW}.
Diversity ratio ρ = unique_fingerprints / total, fingerprint =
\`axis_1:axis_2:pos_1.toFixed(2):pos_2.toFixed(2)\`. Alert threshold = ${DIVERSITY_TARGET}.

## Result 1 — Diversity guarantee (mode-collapse guard)

| Stream | total | unique | ρ (lifetime) | alert fired | first alert step |
|--------|------:|-------:|----:|:-----------:|:----------------:|
| healthy | ${m.diversity_guarantee.healthy.total} | ${m.diversity_guarantee.healthy.unique} | ${m.diversity_guarantee.healthy.diversity_ratio.toFixed(4)} | ${m.diversity_guarantee.healthy.alert_fired} | ${m.diversity_guarantee.healthy.first_alert_step ?? 'none'} |
| collapsed | ${m.diversity_guarantee.collapsed.total} | ${m.diversity_guarantee.collapsed.unique} | ${m.diversity_guarantee.collapsed.diversity_ratio.toFixed(4)} | ${m.diversity_guarantee.collapsed.alert_fired} | ${m.diversity_guarantee.collapsed.first_alert_step ?? 'none'} |

ρ at checkpoints (unique / N):

| N | healthy ρ | collapsed ρ |
|--:|----------:|------------:|
${[10, 100, 1000].map((n) => {
  const h = m.diversity_guarantee.healthy.checkpoints.find((c) => c.n === n);
  const c = m.diversity_guarantee.collapsed.checkpoints.find((cp) => cp.n === n);
  return `| ${n} | ${h ? h.diversity_ratio.toFixed(4) : '—'} | ${c ? c.diversity_ratio.toFixed(4) : '—'} |`;
}).join('\n')}

**Collapse detected: ${m.diversity_guarantee.collapse_detected}** — the collapsed agent's
ρ drops to ${m.diversity_guarantee.collapsed.diversity_ratio.toFixed(4)} and the alert fires (true positive; the mode-collapse
guard catches it). Discrimination ratio (unique_healthy / unique_collapsed) at
N=1000: **${Number(m.diversity_guarantee.discrimination_ratio_unique_healthy_over_collapsed).toFixed(0)}×**.

### HONEST FINDING — fixed threshold is miscalibrated for a cumulative ratio

SliceEmitter's \`diversity_ratio\` is a **lifetime cumulative** ratio: the
\`unique_fingerprints\` Set never evicts while \`total_count\` grows unbounded
(SliceEmitter.ts:212–216). For any stream with a bounded fingerprint vocabulary,
ρ → 0 as total → ∞. Consequently the **healthy** stream also trips the fixed
${DIVERSITY_TARGET} threshold over a long run (ρ_healthy = ${m.diversity_guarantee.healthy.diversity_ratio.toFixed(3)} at N=1000), so the
static-threshold guard **over-alerts on healthy long-running streams** — a real
mis-tuning, not a pass. The *robust* collapse signal is the discrimination ratio
and the unique-count growth rate (healthy unique keeps climbing; collapsed
plateaus at ${m.diversity_guarantee.collapsed.unique}), not absolute ρ vs a static threshold. Recommended fix
for SliceEmitter: compute ρ over a true rolling window of the last W slices, or
evict fingerprints alongside the buffer eviction it already does.

## Result 2 — Advantage-variance link (synthetic reward proxy)

Reward r = −L_total = −‖(p1,p2)−target‖². GRPO advantage A_i = (r_i − mean)/(std+ε).
Within-group reward variance drives the policy-gradient signal magnitude.

| Stream | mean within-group reward variance | mean |advantage| |
|--------|---------------------------------:|----------------:|
| healthy | ${m.advantage_variance_link.healthy_mean_reward_variance.toExponential(3)} | ${m.advantage_variance_link.healthy_mean_abs_advantage.toFixed(4)} |
| collapsed | ${m.advantage_variance_link.collapsed_mean_reward_variance.toExponential(3)} | ${m.advantage_variance_link.collapsed_mean_abs_advantage.toFixed(4)} |

Variance ratio (healthy / collapsed): **${Number(m.advantage_variance_link.variance_ratio_healthy_over_collapsed).toExponential(3)}** —
diverse groups carry a non-zero gradient signal; collapsed groups carry ≈0.

## Deferred (honest scope boundary)

**Poverty-of-stimulus M/N generalization is NOT measured here.** A policy trained
on N slices generalizing to M>N held-out scenarios requires a real long-running
GRPO training loop with the live reward pipeline (GRPORewardFunctions /
GRPORewardOrchestrator, which shell out to vitest/tsc/eslint per completion).
That remains future work. This artifact measures only the diversity-guarantee +
advantage-variance link, which is tractable in-process today.
`;
  const mdPath = resolve(dir, `grpo-diversity-experiment-${date}.md`);
  writeFileSync(mdPath, md);

  // Console summary
  console.log(JSON.stringify(artifact.measured, null, 2));
  console.log(`\nArtifact JSON: ${jsonPath}`);
  console.log(`Artifact MD:   ${mdPath}`);
}

main();
