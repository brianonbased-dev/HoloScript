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
  verifyReplayExecution,
  computeDecisionDigest,
  compileBiasAuditReport,
  mulberry32,
  DEFAULT_FAIRNESS_CROSSWALK,
  JURISDICTION_CONFIGS,
  type FairnessModel,
  type FairnessRecord,
  type CohortPerturber,
} from '../fairness/index';

// ── stub model + data (swapped for the bank/insurer's real model in prod) ─────

/** Transparent linear scorer; `weights` is the lever remediation varies. */
function linearScorer(
  id: string,
  weights: { income: number; zip_risk: number; bias: number; threshold: number }
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
    const { receipt, metrics } = await runFairnessSweep(model, cohort, {
      seed: SEED,
      issuedAt: ISSUED,
    });

    expect(receipt.kind).toBe('fairness.receipt.v1');
    expect(Object.keys(receipt.regulatoryMapping)).toHaveLength(
      Object.keys(DEFAULT_FAIRNESS_CROSSWALK).length
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
      })
    ).toBe('MATCH');
  });

  it('perturbing one record breaks the fingerprint (DRIFT)', async () => {
    const cohort = makeCohort(SEED);
    const model = linearScorer('insurer-underwriting-scorer', biasedWeights);
    const a = await runFairnessSweep(model, cohort, { seed: SEED, issuedAt: ISSUED });

    const tampered = cohort.map((r, i) =>
      i === 0
        ? { group: r.group, features: { ...r.features, income: r.features.income + 1e-4 } }
        : r
    );
    const t = await runFairnessSweep(model, tampered, { seed: SEED, issuedAt: ISSUED });

    expect(t.inputHash).not.toBe(a.inputHash);
    expect(
      replayFairnessReceipt(a.receipt, {
        modelHash: t.modelHash,
        seed: SEED,
        inputHash: t.inputHash,
        weightStrategy: t.weightStrategy,
      })
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

// ── Determinism mode (F-1 honesty layer) ──────────────────────────────────────

describe('FairnessSweep — determinism mode', () => {
  it('exact model: decisionDigest re-runs byte-identical and re-execution MATCHes', async () => {
    const cohort = makeCohort(SEED);
    const model = linearScorer('insurer-underwriting-scorer', biasedWeights);
    const a = await runFairnessSweep(model, cohort, {
      seed: SEED,
      issuedAt: ISSUED,
      verifyDeterminism: true,
    });

    expect(a.replayDeterminism).toBe('exact');
    expect(a.receipt.replayDeterminism).toBe('exact');
    expect(a.receipt.replayTolerance).toBe(0);

    // a validator independently re-runs the model on the recorded inputs
    const rerunDigest = computeDecisionDigest(cohort.map((r) => model.decide(r.features)));
    expect(rerunDigest).toBe(a.receipt.decisionDigest);
    expect(
      verifyReplayExecution(a.receipt, {
        decisionDigest: rerunDigest,
        adverseImpactRatio: a.metrics.adverseImpactRatio,
      })
    ).toBe('MATCH');
  });

  it('verifyReplayExecution returns DRIFT for an exact receipt when the re-run digest differs', async () => {
    const cohort = makeCohort(SEED);
    const a = await runFairnessSweep(linearScorer('m', biasedWeights), cohort, {
      seed: SEED,
      issuedAt: ISSUED,
    });
    expect(
      verifyReplayExecution(a.receipt, {
        decisionDigest: 'not-the-recorded-digest',
        adverseImpactRatio: a.metrics.adverseImpactRatio,
      })
    ).toBe('DRIFT');
  });

  it('auto-downgrades an over-claimed "exact" model to quantized with a measured tolerance', async () => {
    const cohort = makeCohort(SEED);
    const n = cohort.length;
    // Non-deterministic across passes: pass 1 raises the threshold by zip_risk, so
    // borderline group-B records flip — yet the model DECLARES exact. The engine
    // must catch the double-run divergence and refuse to record 'exact'.
    let calls = 0;
    const flaky: FairnessModel = {
      id: 'flaky-underwriter',
      decide: (f) => {
        const pass = Math.floor(calls / n);
        calls++;
        const threshold = pass % 2 === 0 ? 0.5 : 0.5 + 0.1 * f.zip_risk;
        return f.income >= threshold;
      },
      fingerprint: () => ({ kind: 'flaky-underwriter.v1' }),
      determinism: { grade: 'exact' }, // deliberate over-claim
    };

    const r = await runFairnessSweep(flaky, cohort, {
      seed: SEED,
      issuedAt: ISSUED,
      verifyDeterminism: true,
    });
    expect(r.replayDeterminism).toBe('quantized');
    expect(r.receipt.replayDeterminism).toBe('quantized');
    expect(r.receipt.replayTolerance).toBeGreaterThan(0);
    expect(verifyReceiptIntegrity(r.receipt)).toBe(true);
  });

  it('without verifyDeterminism, the model self-declaration is recorded as-is', async () => {
    const cohort = makeCohort(SEED);
    const declared: FairnessModel = {
      ...linearScorer('q', biasedWeights),
      determinism: { grade: 'quantized', tolerance: 0.02 },
    };
    const r = await runFairnessSweep(declared, cohort, { seed: SEED, issuedAt: ISSUED });
    expect(r.receipt.replayDeterminism).toBe('quantized');
    expect(r.receipt.replayTolerance).toBe(0.02);
  });
});

describe('FairnessSweep jurisdiction packs', () => {
  it('attaches the NYC LL144 statistical test battery to the receipt', async () => {
    const cohort = makeCohort(SEED);
    const result = await runFairnessSweep(linearScorer('m', biasedWeights), cohort, {
      seed: SEED,
      issuedAt: ISSUED,
      jurisdiction: 'NYC_LL144',
    });

    expect(result.jurisdiction?.jurisdictionId).toBe('NYC_LL144');
    expect(result.receipt.jurisdiction?.requiredTests).toEqual(
      JURISDICTION_CONFIGS.NYC_LL144.requiredTests
    );
    expect(result.receipt.jurisdiction?.testResults.map((r) => r.test)).toEqual([
      'four_fifths',
      'fisher_exact',
      'chi_squared',
    ]);
    expect(result.receipt.jurisdiction?.passed).toBe(false);
    expect(verifyReceiptIntegrity(result.receipt)).toBe(true);
  });

  it('compiles a jurisdiction-specific bias audit report from a FairnessReceipt', async () => {
    const cohort = makeCohort(SEED);
    const result = await runFairnessSweep(linearScorer('m', biasedWeights), cohort, {
      seed: SEED,
      issuedAt: ISSUED,
      jurisdiction: 'NYC_LL144',
    });

    const report = compileBiasAuditReport({
      receipt: result.receipt,
      generatedAt: '2026-06-21T00:00:00Z',
      issuer: 'test-auditor',
    });

    expect(report.target).toBe('bias_audit_report');
    expect(report.jurisdictionId).toBe('NYC_LL144');
    expect(report.content).toContain('NYC Local Law 144 annual AEDT bias audit public summary');
    expect(report.content).toContain('fisher_exact');
    expect(report.contentHash).toMatch(/^[a-z0-9]+$/);
  });
});
