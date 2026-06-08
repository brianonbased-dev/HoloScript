/**
 * Insurance underwriting fairness adapter — D.057 tracer-bullet
 *
 * End-to-end D.057 slice for the NAIC AI Systems Evaluation Tool pilot
 * (insurance underwriting bias audit, 12-state live pilot Jan-Sep 2026).
 *
 * Layers assembled here:
 *   STATE   — homeowners underwriting FairnessModel + realistic synthetic cohort
 *             (≥200 rows, protectedAttribute=race_proxy via ZIP-income decile per
 *             NAIC focus area) + CohortPerturber encoding insurance drift
 *             (seasonal portfolio shift + credit_tier noise).
 *   RECEIPT — FairnessReceipt (fairness.receipt.v1) with NAIC 2026 pilot +
 *             CO SB21-169 crosswalk entries.
 *
 * Core stays domain-free (D.007): no insurance vocabulary bleeds into
 * @holoscript/engine. The model, cohort, and perturber are INJECTED here and
 * consumed by the standard runFairnessSweep / runFairnessRobustness harness.
 *
 * F-flags carried:
 *   F-1 (synthetic data only; no real applicant records are used)
 *   F-2 partially closed: realistic synthetic vs. toy (ZIP-income decile proxy
 *        matches NAIC focus area; credit_tier and seasonal drift are domain-real)
 *
 * @see @holoscript/engine FairnessSweep / FairnessReceipt
 */

import { Simulation } from '@holoscript/engine';

// Re-export the types and helper from the Simulation namespace so the rest of
// this module can use them by their short names.
type FairnessModel = Simulation.FairnessModel;
type FairnessRecord = Simulation.FairnessRecord;
type CohortPerturber = Simulation.CohortPerturber;
type FairnessPerturbation = Simulation.FairnessPerturbation;
const mulberry32 = Simulation.mulberry32;

// ── Insurance-domain feature constants ──────────────────────────────────────

/**
 * Feature names for the homeowners underwriting model.
 * All normalized to [0, 1] so the model weights are directly comparable.
 *
 *   prior_claims  — normalised prior-claim count (0=none, 1=5+)
 *   credit_tier   — normalised credit tier (0=poor, 1=excellent)
 *   zip_risk      — normalised ZIP-code risk decile (0=lowest-risk, 1=highest-risk)
 *                   this is the bias trap: highly correlated with race-proxy group
 *   age_band      — normalised applicant age band (0=youngest, 1=oldest)
 */
export const UNDERWRITING_FEATURES = [
  'prior_claims',
  'credit_tier',
  'zip_risk',
  'age_band',
] as const;
export type UnderwritingFeature = (typeof UNDERWRITING_FEATURES)[number];

// ── Protected attribute: race_proxy ─────────────────────────────────────────

/**
 * The NAIC AI Systems Evaluation Tool pilot focuses on race-proxy bias
 * transmitted through ZIP-code risk deciles and credit scores. We represent
 * the protected attribute as 'race_proxy', with values 'low-decile' (group
 * benefitting from lower average ZIP-risk attribution) and 'high-decile'
 * (group facing higher average attribution due to geographic concentration).
 *
 * In synthetic data, group membership determines the ZIP-income decile
 * distribution: high-decile applicants draw from a higher zip_risk range,
 * replicating the demographic concentration pattern the NAIC pilot examines.
 *
 * Domain rationale: per NAIC model AI governance bulletin and CO Reg 10-1-1,
 * ZIP-code variables are facially neutral but operationally correlated with
 * race/ethnicity in many US markets. This is the bias the NAIC pilot looks for.
 */
export type RaceProxyGroup = 'low-decile' | 'high-decile';
export const PROTECTED_ATTRIBUTE = 'race_proxy' as const;

// ── Homeowners underwriting model ───────────────────────────────────────────

export interface HomeownersModelWeights {
  prior_claims: number;
  credit_tier: number;
  zip_risk: number;
  age_band: number;
  bias: number;
  threshold: number;
}

/**
 * Transparent linear scorer — approved iff score >= threshold.
 * score = bias
 *       + credit_tier_w * credit_tier
 *       - prior_claims_w * prior_claims
 *       - zip_risk_w * zip_risk
 *       - age_band_w * age_band
 *
 * The BIASED default weights over-penalize zip_risk (the proxy variable),
 * creating disparate impact against high-decile applicants. The REMEDIATED
 * weights zero out zip_risk — the model then relies only on actuarially
 * legitimate inputs and passes the 4/5ths threshold.
 */
export function createHomeownersModel(
  weights: HomeownersModelWeights,
  modelId = 'homeowners-underwriting-scorer'
): FairnessModel {
  return {
    id: modelId,
    decide: (features: Record<string, number>): boolean => {
      const score =
        weights.bias +
        weights.credit_tier * (features.credit_tier ?? 0) -
        weights.prior_claims * (features.prior_claims ?? 0) -
        weights.zip_risk * (features.zip_risk ?? 0) -
        weights.age_band * (features.age_band ?? 0);
      return score >= weights.threshold;
    },
    fingerprint: () => ({
      kind: 'homeowners-linear-scorer.v1',
      weights,
    }),
    determinism: { grade: 'exact' },
  };
}

/**
 * Biased model weights: zip_risk carries strong negative weight, acting as
 * a race-proxy (NAIC AI Evaluation Tool focus area). Produces
 * FLAG-DISPARATE-IMPACT for the high-decile group.
 */
export const BIASED_WEIGHTS: HomeownersModelWeights = {
  prior_claims: 0.45,
  credit_tier: 0.55,
  zip_risk: 0.6, // over-penalises high-decile (the bias lever)
  age_band: 0.1,
  bias: 0.7,
  threshold: 0.5,
};

/**
 * Remediated model weights: zip_risk eliminated (NAIC remediation guidance).
 * Relies only on actuarially legitimate inputs (prior_claims, credit_tier,
 * age_band). Produces PASS for the same cohort — and ROBUSTLY-FAIR under
 * the seasonal drift + credit-noise robustness band.
 *
 * Bias is set higher to keep approval above the 4/5ths threshold even under
 * the portfolio-drift band applied to high-decile zip_risk (which has no
 * weight here, so drift is irrelevant — credit_tier noise is the binding
 * constraint; the higher bias provides the margin).
 */
export const REMEDIATED_WEIGHTS: HomeownersModelWeights = {
  prior_claims: 0.4,
  credit_tier: 0.55,
  zip_risk: 0.0, // zeroed out — D.057 remediation
  age_band: 0.08,
  bias: 0.55,
  threshold: 0.5,
};

// ── Synthetic cohort generator ───────────────────────────────────────────────

/**
 * Generate a realistic synthetic homeowners underwriting cohort.
 *
 * Cohort design rationale (NAIC AI Systems Evaluation Tool):
 *   - n >= 200 rows (NAIC pilot requires meaningful sample sizes)
 *   - 50/50 split between low-decile and high-decile groups
 *   - ZIP-income decile proxy: high-decile applicants draw zip_risk from
 *     [0.55, 0.95], low-decile from [0.05, 0.50] — matches real US
 *     geographic concentration patterns without using real addresses
 *   - credit_tier: both groups draw from similar distributions (slightly
 *     lower mean for high-decile, reflecting systemic credit disparity)
 *   - prior_claims, age_band: comparable across groups (no intentional bias)
 *
 * @param seed  Deterministic seed for reproducibility (part of replay key)
 * @param n     Cohort size (default 400: 200/group — well above NAIC minimum)
 */
export function makeInsuranceCohort(seed: number, n = 400): FairnessRecord[] {
  const rng = mulberry32(seed);
  const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
  const rows: FairnessRecord[] = [];

  for (let i = 0; i < n; i++) {
    // Alternate groups to guarantee 50/50 split
    const group: RaceProxyGroup = i % 2 === 0 ? 'low-decile' : 'high-decile';

    // ZIP-risk proxy: the bias trap — high-decile draws from higher range
    const zip_risk =
      group === 'high-decile'
        ? clamp01(0.55 + 0.4 * rng()) // [0.55, 0.95]
        : clamp01(0.05 + 0.45 * rng()); // [0.05, 0.50]

    // Credit tier: slightly lower for high-decile (systemic disparity)
    const credit_tier =
      group === 'high-decile'
        ? clamp01(0.3 + 0.55 * rng()) // mean ~0.575
        : clamp01(0.4 + 0.55 * rng()); // mean ~0.675

    // Prior claims and age band: comparable across groups
    const prior_claims = clamp01(0.05 + 0.45 * rng()); // [0.05, 0.50]
    const age_band = clamp01(0.2 + 0.6 * rng()); // [0.20, 0.80]

    rows.push({
      group,
      features: { prior_claims, credit_tier, zip_risk, age_band },
    });
  }
  return rows;
}

// ── Domain-specific cohort perturber ─────────────────────────────────────────

/**
 * Insurance underwriting cohort perturber for robustness sweeps.
 *
 * Encodes two real insurance drift patterns for the NAIC pilot:
 *
 *   1. Seasonal portfolio shift (driftShift): in high-loss seasons (hurricane,
 *      wildfire), high-decile applicants see portfolio-level ZIP-risk elevation.
 *      Applied as a positive shift to zip_risk for high-decile records.
 *
 *   2. Credit-tier measurement noise (noiseScale): credit bureau refresh lag
 *      introduces noise in credit_tier for both groups.
 *
 * Bootstrap resampling is applied first (standard demographic ensemble), then
 * the domain-specific drift and noise are layered on.
 *
 * @see runFairnessRobustness — consumed as the `perturber` option
 */
export const insuranceUnderwritingPerturber: CohortPerturber = (
  cohort: readonly FairnessRecord[],
  { driftShift, noiseScale, rng }: FairnessPerturbation
): FairnessRecord[] => {
  const n = cohort.length;
  const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
  return Array.from({ length: n }, () => {
    const src = cohort[Math.floor(rng() * n)];
    const isHighDecile = src.group === 'high-decile';

    return {
      group: src.group,
      features: {
        // Seasonal ZIP-risk elevation for high-decile (portfolio drift)
        zip_risk: clamp01(
          src.features.zip_risk +
            (isHighDecile ? driftShift : 0) + // directed drift for high-decile
            (rng() - 0.5) * 0.5 * noiseScale // symmetric noise for both
        ),
        // Credit bureau measurement noise (both groups)
        credit_tier: clamp01(src.features.credit_tier + (rng() - 0.5) * 2 * noiseScale),
        // Prior claims: low noise (claim history is more stable)
        prior_claims: clamp01(src.features.prior_claims + (rng() - 0.5) * noiseScale),
        // Age band: stable (no drift)
        age_band: src.features.age_band,
      },
    };
  });
};

// ── NAIC + Colorado regulatory crosswalk override ────────────────────────────

/**
 * Insurance-vertical regulatory mapping, layered onto the core
 * DEFAULT_FAIRNESS_CROSSWALK. The overrides add NAIC-pilot-specific and
 * CO SB21-169/Reg-10-1-1 entries that name the insurance-specific evidence.
 *
 * Pass this as `regulatoryMapping` to runFairnessSweep / runFairnessRobustness
 * to produce receipts satisfying both the default crosswalk and the
 * insurance-vertical additions.
 *
 * Key entries added:
 *   NAIC 2026 AI pilot — this receipt IS the case file the NAIC evaluation
 *     tool expects: metrics = bias audit, protectedAttribute = race_proxy.
 *   CO SB21-169 / Reg 10-1-1 — adverse-impact ratio (4/5ths) + zip_risk proxy
 *     disclosure + credit_tier noise documentation.
 */
export const NAIC_INSURANCE_CROSSWALK: Record<string, string> = {
  // Core EU/US entries (matching DEFAULT_FAIRNESS_CROSSWALK keys)
  'EU-AI-Act Art.10 (data governance / bias mitigation)':
    'metrics.demographicParityDiff + per-cohort approvalRate; protectedAttribute=race_proxy (ZIP-income decile proxy)',
  'EU-AI-Act Art.12 (record-keeping)':
    'replayFingerprint + inputHash (append-only, content-hashed); cohort seed = replay key',
  'EU-AI-Act Art.15 (accuracy/robustness)':
    'replayFingerprint determinism=exact; robustness band encodes seasonal portfolio drift + credit-bureau noise',
  'Colorado SB21-169 / Reg 10-1-1 (unfair-discrimination testing)':
    'metrics.adverseImpactRatio (4/5ths) + fourFifthsPass; zip_risk proxy identified + remediation path shown',
  'NAIC AI Systems Evaluation Tool (sample case file + bias audit)':
    'this receipt IS the NAIC case file: modelId=homeowners-underwriting-scorer, protectedAttribute=race_proxy, metrics=bias audit, replayFingerprint=case-file hash',
  'NAIC 2026 AI pilot (12-state; Jan-Sep 2026)':
    'homeowners underwriting vertical; race_proxy=ZIP-income decile; cohort n>=200 per NAIC guidance; seasonal drift band included',
  'FDA SaMD bias review / HIPAA audit trail':
    'time-stamped, non-overwritable content hash = audit record',
  'SR 11-7 / revised-MRM (independent validation)':
    'validator re-runs from (modelHash,seed,inputHash,weights) -> same fingerprint; zip_risk weight=0.0 in remediated model',
  // Robustness-specific
  'CCAR/DFAST (reproducible stress scenarios)':
    'LHS ensemble = seasonal-drift + credit-noise sweep; ensembleHash + replayFingerprint reproduce it',
  'Colorado SB21-169 / NAIC (testing under data drift)':
    'verdict holds across seasonal portfolio-shift + credit-bureau-noise space, not a single sample',
};
