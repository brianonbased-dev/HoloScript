/**
 * FairnessSweep — the 6 tracer-bullet claims, now run against the REAL engine
 * (`ExperimentOrchestrator` + `UncertaintyQuantification`), not the standalone
 * proof. CI here is the gate that clears program flag F-4.
 *
 * Mirrors research/proofs/verifiable-fairness-sweep/ (ai-ecosystem):
 *   1. one fairness run → one receipt → the full regulator crosswalk
 *   2a. offline replay MATCH      2b. tamper → DRIFT
 *   3. it MEASURES (biased FLAG → remediated PASS)
 *   4. robustness band (ROBUSTLY-UNFAIR vs ROBUSTLY-FAIR)
 *   5. ensemble replay MATCH
 *
 * The decision model + cohort + drift perturber are STUBBED here (a transparent
 * linear scorer + synthetic applicants) exactly as the domain bridge would
 * inject a real model + point-in-time data in production — core stays
 * domain-free (D.007).
 */

import { describe, it, expect } from 'vitest';
import {
  runFairnessSweep,
  runFairnessRobustness,
  replayFairnessReceipt,
  verifyReceiptIntegrity,
  mulberry32,
  DEFAULT_FAIRNESS_CROSSWALK,
  type FairnessModel,
  type FairnessRecord,
  type CohortPerturber,
} from '../fairness/index';

// ── stub model + data (swapped for the bank/insurer's real model in prod) ─────

/** Transparent linear scorer; `weights` is the lever remediation varies. */
function linearScorer(
  id: string,
  weights: { income: number; zip_risk: number; bias: number; threshold: number },
): FairnessModel {
  return {
    id,
    decide: (f) =>
      weights.income * f.income - weights.zip_risk * f.zip_risk + weights.bias >= weights.threshold,
    fingerprint: () => ({ kind: 'linear-scorer.v1', ...weights }),
  };
}

/** Synthetic cohort: `zip_risk` is a group-B-correlated proxy (the bias trap). */
function makeCohort(seed: number, n = 2000): FairnessRecord[] {
  const rng = mulberry32(seed);
  const rows: FairnessRecord[] = [];
  for (let i = 0; i < n; i++) {
    const group = rng() < 0.5 ? 'A' : 'B';
    const income = 0.3 + 0.5 * rng();
    const zip_risk = (group === 'B' ? 0.55 : 0.25) + 0.25 * rng();
    rows.push({ group, features: { income, zip_risk } });
  }
  return rows;
}

/** Insurance-style perturber: bootstrap + income noise + group-B zip_risk drift. */
const insurancePerturber: CohortPerturber = (cohort, { driftShift, noiseScale, rng }) => {
  const n = cohort.length;
  const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
  return Array.from({ length: n }, () => {
    const src = cohort[Math.floor(rng() * n)];
    return {
      group: src.group,
      features: {
        income: clamp01(src.features.income + (rng() - 0.5) * 2 * noiseScale),
        zip_risk:
          src.group === 'B' ? clamp01(src.features.zip_risk + driftShift) : src.features.zip_risk,
      },
    };
  });
};

const SEED = 424242;
const ISSUED = '2026-05-29T00:00:00Z';
const biasedWeights = { income: 1.0, zip_risk: 0.55, bias: 0.0, threshold: 0.25 };
const remediatedWeights = { income: 1.0, zip_risk: 0.0, bias: -0.18, threshold: 0.25 };

// ── Claim 1 — one run, one receipt, the full regulator crosswalk ──────────────

describe('FairnessSweep — Claim 1: one receipt, many regulators', () => {
  it('emits one receipt mapping to the full crosswalk and flags the biased model', async () => {
    const cohort = makeCohort(SEED);
    const model = linearScorer('insurer-underwriting-scorer', biasedWeights);
    const { receipt, metrics } = await runFairnessSweep(model, cohort, { seed: SEED, issuedAt: ISSUED });

    expect(receipt.kind).toBe('fairness.receipt.v1');
    expect(Object.keys(receipt.regulatoryMapping)).toHaveLength(
      Object.keys(DEFAULT_FAIRNESS_CROSSWALK).length,
    );
    expect(Object.keys(receipt.regulatoryMapping).length).toBeGreaterThanOrEqual(7);
    expect(metrics.adverseImpactRatio).toBeLessThan(0.8);
    expect(receipt.decision).toBe('FLAG-DISPARATE-IMPACT');
    expect(verifyReceiptIntegrity(receipt)).toBe(true);
  });
});

// ── Claim 2a/2b — offline replay MATCH; tamper → DRIFT ────────────────────────

describe('FairnessSweep — Claim 2: offline replay + tamper detection', () => {
  it('re-running from the same inputs reproduces the fingerprint (MATCH)', async () => {
    const cohort = makeCohort(SEED);
    const model = linearScorer('insurer-underwriting-scorer', biasedWeights);

    const a = await runFairnessSweep(model, cohort, { seed: SEED, issuedAt: ISSUED });
    const b = await runFairnessSweep(model, cohort, { seed: SEED, issuedAt: ISSUED });

    expect(b.receipt.replayFingerprint).toBe(a.receipt.replayFingerprint);
    expect(b.receipt.receiptHash).toBe(a.receipt.receiptHash);
    expect(
      replayFairnessReceipt(a.receipt, {
        modelHash: b.modelHash,
        seed: SEED,
        inputHash: b.inputHash,
        weightStrategy: b.weightStrategy,
      }),
    ).toBe('MATCH');
  });

  it('perturbing one record breaks the fingerprint (DRIFT)', async () => {
    const cohort = makeCohort(SEED);
    const model = linearScorer('insurer-underwriting-scorer', biasedWeights);
    const a = await runFairnessSweep(model, cohort, { seed: SEED, issuedAt: ISSUED });

    const tampered = cohort.map((r, i) =>
      i === 0 ? { group: r.group, features: { ...r.features, income: r.features.income + 1e-4 } } : r,
    );
    const t = await runFairnessSweep(model, tampered, { seed: SEED, issuedAt: ISSUED });

    expect(t.inputHash).not.toBe(a.inputHash);
    expect(
      replayFairnessReceipt(a.receipt, {
        modelHash: t.modelHash,
        seed: SEED,
        inputHash: t.inputHash,
        weightStrategy: t.weightStrategy,
      }),
    ).toBe('DRIFT');
  });

  it('mutating a receipt field fails the integrity check', async () => {
    const cohort = makeCohort(SEED);
    const model = linearScorer('insurer-underwriting-scorer', biasedWeights);
    const { receipt } = await runFairnessSweep(model, cohort, { seed: SEED, issuedAt: ISSUED });

    const forged = { ...receipt, metrics: { ...receipt.metrics, adverseImpactRatio: 0.99 } };
    expect(verifyReceiptIntegrity(forged)).toBe(false);
  });
});

// ── Claim 3 — it MEASURES: remediation flips the verdict ──────────────────────

describe('FairnessSweep — Claim 3: measures, does not assert', () => {
  it('flags the biased model and passes the remediated model', async () => {
    const cohort = makeCohort(SEED);
    const biased = await runFairnessSweep(linearScorer('m', biasedWeights), cohort, {
      seed: SEED,
      issuedAt: ISSUED,
    });
    const remediated = await runFairnessSweep(linearScorer('m', remediatedWeights), cohort, {
      seed: SEED,
      issuedAt: ISSUED,
    });

    expect(biased.receipt.decision).toBe('FLAG-DISPARATE-IMPACT');
    expect(remediated.receipt.decision).toBe('PASS');
    expect(remediated.metrics.adverseImpactRatio).toBeGreaterThanOrEqual(0.8);
  });
});

// ── Claim 4/5 — robustness band + ensemble replay ─────────────────────────────

describe('FairnessSweep — Claim 4/5: robustness band + ensemble replay', () => {
  const REPLICATES = 96;

  it('finds the biased model ROBUSTLY-UNFAIR and the remediated model ROBUSTLY-FAIR', async () => {
    const cohort = makeCohort(SEED);

    const biased = await runFairnessRobustness(linearScorer('m', biasedWeights), cohort, {
      seed: SEED,
      issuedAt: ISSUED,
      replicates: REPLICATES,
      perturber: insurancePerturber,
    });
    const remediated = await runFairnessRobustness(linearScorer('m', remediatedWeights), cohort, {
      seed: SEED,
      issuedAt: ISSUED,
      replicates: REPLICATES,
      perturber: insurancePerturber,
    });

    expect(biased.verdict).toBe('ROBUSTLY-UNFAIR');
    expect(biased.band.ci90[1]).toBeLessThan(0.8); // entire 90% band below threshold
    expect(remediated.verdict).toBe('ROBUSTLY-FAIR');
    expect(remediated.band.ci90[0]).toBeGreaterThanOrEqual(0.8); // entire 90% band above
    expect(verifyReceiptIntegrity(biased.receipt)).toBe(true);
  });

  it('re-running the ensemble reproduces the band byte-identically', async () => {
    const cohort = makeCohort(SEED);
    const opts = {
      seed: SEED,
      issuedAt: ISSUED,
      replicates: REPLICATES,
      perturber: insurancePerturber,
    };

    const first = await runFairnessRobustness(linearScorer('m', biasedWeights), cohort, opts);
    const replay = await runFairnessRobustness(linearScorer('m', biasedWeights), cohort, opts);

    expect(replay.ensembleHash).toBe(first.ensembleHash);
    expect(replay.receipt.receiptHash).toBe(first.receipt.receiptHash);
  });
});
