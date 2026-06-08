/**
 * Insurance underwriting fairness adapter — integration test (D.057 tracer-bullet)
 *
 * Tests the NAIC AI Systems Evaluation Tool pilot slice end-to-end:
 *   1. Adapter importable; cohort ≥200 rows with correct shape.
 *   2. Biased model → FLAG-DISPARATE-IMPACT on the race_proxy attribute.
 *   3. Remediated model → PASS on the same cohort.
 *   4. FairnessReceipt integrity: receiptHash verifies + replayFingerprint stable.
 *   5. Replay determinism: re-run from same inputs reproduces fingerprint (MATCH).
 *   6. Regulatory crosswalk: NAIC 2026 pilot + CO SB21-169 keys present.
 *   7. Robustness band: biased model ROBUSTLY-UNFAIR, remediated ROBUSTLY-FAIR.
 *   8. Ensemble replay: same band byte-identically on second run.
 *
 * F-flags:
 *   F-1 carried (synthetic data only — no external model assertions).
 *   F-2 partially closed (realistic synthetic; ZIP-income decile proxy mirrors
 *        NAIC focus area; seasonal drift + credit-bureau noise are domain-real).
 *
 * Validation evidence: this file + pnpm test output (passed locally).
 */

import { describe, it, expect } from 'vitest';
import { Simulation } from '@holoscript/engine';

import {
  createHomeownersModel,
  makeInsuranceCohort,
  insuranceUnderwritingPerturber,
  BIASED_WEIGHTS,
  REMEDIATED_WEIGHTS,
  NAIC_INSURANCE_CROSSWALK,
  PROTECTED_ATTRIBUTE,
} from '../fairness-underwriting';

const {
  runFairnessSweep,
  runFairnessRobustness,
  replayFairnessReceipt,
  verifyReceiptIntegrity,
  verifyReplayExecution,
  computeDecisionDigest,
} = Simulation;

const SEED = 202601;
const ISSUED = '2026-06-08T00:00:00Z';
const COHORT_SIZE = 400; // 200 per group — well above NAIC minimum

// ── 1. Adapter and cohort shape ───────────────────────────────────────────────

describe('insurance-underwriting adapter — cohort shape', () => {
  it('generates ≥200 rows with correct feature keys and group labels', () => {
    const cohort = makeInsuranceCohort(SEED, COHORT_SIZE);
    expect(cohort.length).toBe(COHORT_SIZE);
    for (const row of cohort) {
      expect(['low-decile', 'high-decile']).toContain(row.group);
      expect(typeof row.features.prior_claims).toBe('number');
      expect(typeof row.features.credit_tier).toBe('number');
      expect(typeof row.features.zip_risk).toBe('number');
      expect(typeof row.features.age_band).toBe('number');
      // All features must be in [0,1]
      for (const v of Object.values(row.features)) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it('has ~50/50 group split', () => {
    const cohort = makeInsuranceCohort(SEED, COHORT_SIZE);
    const low = cohort.filter((r) => r.group === 'low-decile').length;
    const high = cohort.filter((r) => r.group === 'high-decile').length;
    expect(low).toBe(COHORT_SIZE / 2);
    expect(high).toBe(COHORT_SIZE / 2);
  });

  it('high-decile has higher mean zip_risk than low-decile (bias proxy)', () => {
    const cohort = makeInsuranceCohort(SEED, COHORT_SIZE);
    const mean = (g: string) => {
      const rows = cohort.filter((r) => r.group === g);
      return rows.reduce((s, r) => s + r.features.zip_risk, 0) / rows.length;
    };
    expect(mean('high-decile')).toBeGreaterThan(mean('low-decile'));
  });
});

// ── 2. Biased model — FLAG-DISPARATE-IMPACT ───────────────────────────────────

describe('insurance-underwriting — biased model flags disparate impact', () => {
  it('adverse-impact ratio < 0.8 and receipt decision = FLAG-DISPARATE-IMPACT', async () => {
    const cohort = makeInsuranceCohort(SEED, COHORT_SIZE);
    const model = createHomeownersModel(BIASED_WEIGHTS);
    const { receipt, metrics } = await runFairnessSweep(model, cohort, {
      seed: SEED,
      issuedAt: ISSUED,
      protectedAttribute: PROTECTED_ATTRIBUTE,
      hashMode: 'sha256',
      verifyDeterminism: true,
      regulatoryMapping: NAIC_INSURANCE_CROSSWALK,
    });

    expect(metrics.adverseImpactRatio).toBeLessThan(0.8);
    expect(receipt.decision).toBe('FLAG-DISPARATE-IMPACT');
    expect(receipt.protectedAttribute).toBe('race_proxy');
    expect(receipt.kind).toBe('fairness.receipt.v1');
    // Determinism: linear model is exact
    expect(receipt.replayDeterminism).toBe('exact');
    expect(receipt.replayTolerance).toBe(0);
  });
});

// ── 3. Remediated model — PASS ────────────────────────────────────────────────

describe('insurance-underwriting — remediated model passes', () => {
  it('adverse-impact ratio ≥ 0.8 and receipt decision = PASS', async () => {
    const cohort = makeInsuranceCohort(SEED, COHORT_SIZE);
    const model = createHomeownersModel(REMEDIATED_WEIGHTS, 'homeowners-remediated');
    const { receipt, metrics } = await runFairnessSweep(model, cohort, {
      seed: SEED,
      issuedAt: ISSUED,
      protectedAttribute: PROTECTED_ATTRIBUTE,
      hashMode: 'sha256',
      regulatoryMapping: NAIC_INSURANCE_CROSSWALK,
    });

    expect(metrics.adverseImpactRatio).toBeGreaterThanOrEqual(0.8);
    expect(receipt.decision).toBe('PASS');
  });
});

// ── 4. Receipt integrity ──────────────────────────────────────────────────────

describe('insurance-underwriting — receipt integrity', () => {
  it('verifyReceiptIntegrity returns true for a freshly emitted receipt', async () => {
    const cohort = makeInsuranceCohort(SEED, COHORT_SIZE);
    const model = createHomeownersModel(BIASED_WEIGHTS);
    const { receipt } = await runFairnessSweep(model, cohort, {
      seed: SEED,
      issuedAt: ISSUED,
      hashMode: 'sha256',
      regulatoryMapping: NAIC_INSURANCE_CROSSWALK,
    });

    expect(verifyReceiptIntegrity(receipt)).toBe(true);
  });

  it('mutating a metric field fails the integrity check (tamper detection)', async () => {
    const cohort = makeInsuranceCohort(SEED, COHORT_SIZE);
    const model = createHomeownersModel(BIASED_WEIGHTS);
    const { receipt } = await runFairnessSweep(model, cohort, {
      seed: SEED,
      issuedAt: ISSUED,
      hashMode: 'sha256',
    });

    const forged = { ...receipt, metrics: { ...receipt.metrics, adverseImpactRatio: 0.99 } };
    expect(verifyReceiptIntegrity(forged)).toBe(false);
  });
});

// ── 5. Replay determinism — MATCH on same inputs ──────────────────────────────

describe('insurance-underwriting — replay determinism', () => {
  it('re-running from the same inputs produces the same replayFingerprint (MATCH)', async () => {
    const cohort = makeInsuranceCohort(SEED, COHORT_SIZE);
    const model = createHomeownersModel(BIASED_WEIGHTS);
    const opts = {
      seed: SEED,
      issuedAt: ISSUED,
      hashMode: 'sha256' as const,
      regulatoryMapping: NAIC_INSURANCE_CROSSWALK,
    };

    const a = await runFairnessSweep(model, cohort, opts);
    const b = await runFairnessSweep(model, cohort, opts);

    expect(b.receipt.replayFingerprint).toBe(a.receipt.replayFingerprint);
    expect(b.receipt.receiptHash).toBe(a.receipt.receiptHash);

    const verdict = replayFairnessReceipt(a.receipt, {
      modelHash: b.modelHash,
      seed: SEED,
      inputHash: b.inputHash,
      weightStrategy: b.weightStrategy,
    });
    expect(verdict).toBe('MATCH');
  });

  it('verifyReplayExecution — re-run decision digest matches (exact model)', async () => {
    const cohort = makeInsuranceCohort(SEED, COHORT_SIZE);
    const model = createHomeownersModel(BIASED_WEIGHTS);
    const { receipt, metrics } = await runFairnessSweep(model, cohort, {
      seed: SEED,
      issuedAt: ISSUED,
      hashMode: 'sha256',
      verifyDeterminism: true,
    });

    // Independent re-run by a validator
    const rerunDigest = computeDecisionDigest(
      cohort.map((r) => model.decide(r.features)),
      'sha256'
    );

    const reExec = verifyReplayExecution(receipt, {
      decisionDigest: rerunDigest,
      adverseImpactRatio: metrics.adverseImpactRatio,
    });
    expect(reExec).toBe('MATCH');
  });

  it('perturbing one input record breaks the fingerprint (DRIFT)', async () => {
    const cohort = makeInsuranceCohort(SEED, COHORT_SIZE);
    const model = createHomeownersModel(BIASED_WEIGHTS);
    const a = await runFairnessSweep(model, cohort, {
      seed: SEED,
      issuedAt: ISSUED,
      hashMode: 'sha256',
    });

    const tampered = cohort.map((r, i) =>
      i === 0
        ? { group: r.group, features: { ...r.features, zip_risk: r.features.zip_risk + 1e-4 } }
        : r
    );
    const t = await runFairnessSweep(model, tampered, {
      seed: SEED,
      issuedAt: ISSUED,
      hashMode: 'sha256',
    });

    expect(t.inputHash).not.toBe(a.inputHash);
    const verdict = replayFairnessReceipt(a.receipt, {
      modelHash: t.modelHash,
      seed: SEED,
      inputHash: t.inputHash,
      weightStrategy: t.weightStrategy,
    });
    expect(verdict).toBe('DRIFT');
  });
});

// ── 6. Regulatory crosswalk — NAIC 2026 pilot + CO SB21-169 ──────────────────

describe('insurance-underwriting — regulatory crosswalk keys', () => {
  it('receipt contains NAIC 2026 AI pilot crosswalk key', async () => {
    const cohort = makeInsuranceCohort(SEED, COHORT_SIZE);
    const model = createHomeownersModel(BIASED_WEIGHTS);
    const { receipt } = await runFairnessSweep(model, cohort, {
      seed: SEED,
      issuedAt: ISSUED,
      hashMode: 'sha256',
      regulatoryMapping: NAIC_INSURANCE_CROSSWALK,
    });

    const keys = Object.keys(receipt.regulatoryMapping);
    expect(keys.some((k) => k.includes('NAIC 2026'))).toBe(true);
    expect(keys.some((k) => k.includes('Colorado SB21-169'))).toBe(true);
    // Must have at least the standard crosswalk entries + NAIC pilot additions
    expect(keys.length).toBeGreaterThanOrEqual(8);
  });

  it('NAIC crosswalk entry references race_proxy and homeowners-underwriting-scorer', () => {
    const naicEntry =
      NAIC_INSURANCE_CROSSWALK['NAIC AI Systems Evaluation Tool (sample case file + bias audit)'];
    expect(naicEntry).toBeTruthy();
    expect(naicEntry).toContain('homeowners-underwriting-scorer');
    expect(naicEntry).toContain('race_proxy');
  });

  it('CO SB21-169 crosswalk entry references zip_risk proxy', () => {
    const coEntry =
      NAIC_INSURANCE_CROSSWALK['Colorado SB21-169 / Reg 10-1-1 (unfair-discrimination testing)'];
    expect(coEntry).toBeTruthy();
    expect(coEntry).toContain('zip_risk');
  });
});

// ── 7. Robustness band ────────────────────────────────────────────────────────

describe('insurance-underwriting — robustness band', () => {
  const REPLICATES = 80; // reduced for test speed; full demo uses ≥200

  it('biased model is ROBUSTLY-UNFAIR under seasonal drift + credit noise', async () => {
    const cohort = makeInsuranceCohort(SEED, COHORT_SIZE);
    const model = createHomeownersModel(BIASED_WEIGHTS);
    const result = await runFairnessRobustness(model, cohort, {
      seed: SEED,
      issuedAt: ISSUED,
      hashMode: 'sha256',
      replicates: REPLICATES,
      perturber: insuranceUnderwritingPerturber,
      regulatoryMapping: NAIC_INSURANCE_CROSSWALK,
    });

    expect(result.verdict).toBe('ROBUSTLY-UNFAIR');
    // Entire 90% CI band below 0.8
    expect(result.band.ci90[1]).toBeLessThan(0.8);
    expect(verifyReceiptIntegrity(result.receipt)).toBe(true);
    expect(result.receipt.kind).toBe('fairness.robustness.v1');
  });

  it('remediated model is ROBUSTLY-FAIR under the same drift space', async () => {
    const cohort = makeInsuranceCohort(SEED, COHORT_SIZE);
    const model = createHomeownersModel(REMEDIATED_WEIGHTS, 'homeowners-remediated');
    const result = await runFairnessRobustness(model, cohort, {
      seed: SEED,
      issuedAt: ISSUED,
      hashMode: 'sha256',
      replicates: REPLICATES,
      perturber: insuranceUnderwritingPerturber,
      regulatoryMapping: NAIC_INSURANCE_CROSSWALK,
    });

    expect(result.verdict).toBe('ROBUSTLY-FAIR');
    // Entire 90% CI band above 0.8
    expect(result.band.ci90[0]).toBeGreaterThanOrEqual(0.8);
    expect(verifyReceiptIntegrity(result.receipt)).toBe(true);
  });
});

// ── 8. Ensemble replay ────────────────────────────────────────────────────────

describe('insurance-underwriting — ensemble replay', () => {
  const REPLICATES = 60;

  it('re-running the robustness sweep produces the same ensembleHash and receiptHash', async () => {
    const cohort = makeInsuranceCohort(SEED, COHORT_SIZE);
    const model = createHomeownersModel(BIASED_WEIGHTS);
    const opts = {
      seed: SEED,
      issuedAt: ISSUED,
      hashMode: 'sha256' as const,
      replicates: REPLICATES,
      perturber: insuranceUnderwritingPerturber,
      regulatoryMapping: NAIC_INSURANCE_CROSSWALK,
    };

    const first = await runFairnessRobustness(model, cohort, opts);
    const replay = await runFairnessRobustness(model, cohort, opts);

    expect(replay.ensembleHash).toBe(first.ensembleHash);
    expect(replay.receipt.receiptHash).toBe(first.receipt.receiptHash);
  });
});
