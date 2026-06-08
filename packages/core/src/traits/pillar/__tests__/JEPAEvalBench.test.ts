/**
 * JEPAEvalBench — §4-6 measurement harness for the non-LLM world-model papers.
 *
 * Produces the defensible eval axes identified in
 * research/2026-05-23_non-llm-stack-hardening-jepa-snn-eval.md (W.520/W.521):
 *
 *   Table A — Non-collapse (effective rank) of JEPAPredictor output embeddings.
 *             Pre-empts the #1 reviewer attack on JEPA papers (un-measured
 *             representation collapse).
 *
 *   Table B — Conservation-adherence@ε of PillarJEPA's conservation regulariser.
 *             The physics-domain analog of IntPhys plausibility discrimination —
 *             an axis V-JEPA cannot have (no deterministic ground-truth target
 *             encoder; we have the solver).
 *
 * Both axes are computed from SHIPPED primitives (JEPAPredictor, PillarJEPA) via
 * the shared `embedding-metrics` routine — no new model, no training loop. These
 * are BASELINE numbers (untrained / deterministic-init predictor); the trained
 * convergence curve (conservation-adherence rising as JEPA trains) is the P4/P2
 * follow-on. The harness + axes are the deliverable here.
 *
 * Numbers are written to fixtures/jepa-eval-bench.json for the paper tables.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JEPAPredictor } from '../../JEPAPredictor';
import { computeConservationLoss } from '../PillarJEPA';
import { effectiveRank, conservationAdherence } from '../embedding-metrics';

// ── seeded generator for reproducible distinct "physics state" context vectors ──
function makeLcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return (s / 0x100000000) * 2 - 1; // [-1, 1)
  };
}

function distinctContexts(count: number, dim: number, seed = 0x511c0de5): Float32Array[] {
  const rng = makeLcg(seed);
  const out: Float32Array[] = [];
  for (let i = 0; i < count; i++) {
    const v = new Float32Array(dim);
    for (let j = 0; j < dim; j++) v[j] = rng();
    out.push(v);
  }
  return out;
}

const LATENT_DIM = 16;
const SAMPLE_COUNT = 64;

describe('JEPAEvalBench — §4-6 measurement axes', () => {
  // Accumulate numbers across the two measurement tests, then write one fixture.
  const report: Record<string, unknown> = {
    generatedAt: new Date().toISOString(),
    latentDim: LATENT_DIM,
    sampleCount: SAMPLE_COUNT,
    note: 'BASELINE (untrained deterministic-init predictor). Trained convergence curve is the follow-on.',
  };

  it('Table A — non-collapse: predictor embeddings have high effective rank', () => {
    const predictor = new JEPAPredictor({ latentDim: LATENT_DIM, condDim: 0 });
    const contexts = distinctContexts(SAMPLE_COUNT, LATENT_DIM);

    const predictions = contexts.map((c) => predictor.forward(c, null).predicted);
    const rank = effectiveRank(predictions);

    report.tableA_nonCollapse = rank;

    // A non-collapsed encoder spreads variance across many dimensions.
    // ReLU MLP on distinct inputs must not collapse to a near-1-rank space.
    expect(rank.dim).toBe(LATENT_DIM);
    expect(rank.count).toBe(SAMPLE_COUNT);
    expect(rank.effectiveRank).toBeGreaterThan(1);
    expect(rank.rankRatio).toBeGreaterThan(0.1); // sanity: not collapsed
    expect(rank.totalVariance).toBeGreaterThan(0);
  });

  it('Table B — conservation-adherence@ε of PREDICTED embeddings (production L_c)', () => {
    // Scores the PREDICTOR OUTPUT through the SAME computeConservationLoss the
    // runtime uses (exported from PillarJEPA) — no re-implemented copy, so the
    // eval and the regulariser cannot drift. This is the physics-domain IntPhys
    // analog (W.521): does the model's predicted state adhere to conservation?
    const predictor = new JEPAPredictor({ latentDim: LATENT_DIM, condDim: 0 });
    const contexts = distinctContexts(SAMPLE_COUNT, LATENT_DIM, 0x7a26e7);
    const predictions = contexts.map((c) => predictor.forward(c, null).predicted);

    const margin = 0.05;
    const demand = 0.3; // conservation demand pos_1 ∈ [0,1]; moderate operating point

    // Per-prediction penalty via the production regulariser.
    const penalties = predictions.map((p) => computeConservationLoss(p, demand, margin, 'energy'));

    expect(penalties.length).toBe(SAMPLE_COUNT);

    const epsilons = [0, 0.001, 0.01, 0.05, 0.1, 0.25, 0.5, 1.0];
    const adherence = conservationAdherence(penalties, epsilons);

    report.tableB_conservationAdherence = {
      measures: 'predicted-embedding conservation via production computeConservationLoss',
      demand,
      margin,
      penaltyCount: penalties.length,
      meanPenalty: penalties.reduce((a, b) => a + b, 0) / penalties.length,
      maxPenalty: Math.max(...penalties),
      sweep: adherence,
      note: 'Eval and runtime call the SAME exported computeConservationLoss (scores predictor output ẑ_t). Resolved the conditioning-vs-prediction defect (see PillarJEPA fix + /founder ruling).',
    };

    // adherence is monotonic non-decreasing in ε and bounded in [0, 1].
    for (const { adherence: a } of adherence) {
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(1);
    }
    for (let i = 1; i < adherence.length; i++) {
      expect(adherence[i].adherence).toBeGreaterThanOrEqual(adherence[i - 1].adherence);
    }
    // Untrained predictor → a non-trivial fraction violate (curve is informative,
    // not vacuously 1 everywhere). This is the BASELINE the trained curve improves on.
    expect(adherence[0].adherence).toBeLessThan(1);
  });

  it('writes §4-6 measurement fixture for the paper tables', () => {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const fixturesDir = path.join(__dirname, 'fixtures');
    fs.mkdirSync(fixturesDir, { recursive: true });
    const outPath = path.join(fixturesDir, 'jepa-eval-bench.json');
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf-8');

    const loaded = JSON.parse(fs.readFileSync(outPath, 'utf-8'));
    expect(loaded.tableA_nonCollapse).toBeDefined();
    expect(loaded.tableB_conservationAdherence).toBeDefined();
  });
});
