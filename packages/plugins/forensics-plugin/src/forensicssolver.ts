/**
 * Forensic science solvers — forensics-plugin
 *
 * Implements:
 *  - Time of Death (TOD) estimation via Henssge nomogram (body cooling)
 *  - Locard exchange principle scoring (trace evidence probability)
 *  - Bayesian evidence strength update (likelihood ratio chain)
 *  - Blood spatter angle of impact (inverse sine of width/length)
 *  - Trajectory back-calculation (convergence of multiple spatter stains)
 *  - DNA match probability (product rule for STR alleles)
 *  - Chain of custody integrity scoring
 *
 * References:
 *  - Henssge C (1988) Forens.Sci.Int 38:209-236
 *  - Kind SS (1987) The Scientific Investigation of Crime
 *  - Buckleton J et al. (2005) Forensic DNA Evidence Interpretation
 */

import { buildDomainSimulationReceipt, type DomainSimulationReceipt } from '@holoscript/core';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TODResult {
  /** Estimated post-mortem interval lower bound hours */
  pmiLowHours: number;
  /** Estimated post-mortem interval upper bound hours */
  pmiHighHours: number;
  /** Central estimate hours */
  pmiCentralHours: number;
  /** Corrective factor used */
  correctiveFactor: number;
  /** Ambient temperature °C */
  ambientTempC: number;
  /** Body temperature at scene °C */
  bodyTempC: number;
}

export interface LocardScore {
  /** Type of trace evidence */
  evidenceType: string;
  /** Prior probability of transfer given contact */
  transferProbability: number;
  /** Prior probability of persistence */
  persistenceProbability: number;
  /** Background frequency in population */
  backgroundFrequency: number;
  /** Likelihood ratio: P(E|contact) / P(E|no contact) */
  likelihoodRatio: number;
}

export interface BayesianEvidenceResult {
  /** Prior odds (suspect is guilty) */
  priorOdds: number;
  /** Array of likelihood ratios applied */
  likelihoodRatios: number[];
  /** Posterior odds after all LRs applied */
  posteriorOdds: number;
  /** Posterior probability [0,1] */
  posteriorProbability: number;
  /** Verbal equivalence per ENFSI guidelines */
  verbalEquivalent: string;
}

export interface BloodSpatterResult {
  /** Width of elliptical stain mm */
  widthMm: number;
  /** Length of elliptical stain mm */
  lengthMm: number;
  /** Angle of impact degrees (0° = parallel to surface, 90° = perpendicular) */
  angleOfImpactDeg: number;
  /** Direction of travel from striation pattern */
  directionComment: string;
}

export interface TrajectoryResult {
  /** Convergence point x mm (surface coordinate) */
  convergenceX: number;
  /** Convergence point y mm (surface coordinate) */
  convergenceY: number;
  /** Area of origin height mm (stringing method estimate) */
  originHeightMm: number;
  /** Number of stains used */
  stainCount: number;
  /** RMSE of line intersection fit mm */
  fittingRmse: number;
}

export interface DNAMatchResult {
  /** Number of STR loci tested */
  lociCount: number;
  /** Match probability (random match probability) */
  randomMatchProbability: number;
  /** Likelihood ratio: P(match|same person) / P(match|random) */
  likelihoodRatio: number;
  /** Log10 LR for verbal equivalence */
  log10LR: number;
  /** Verbal equivalence per SWGDAM */
  verbalEquivalent: string;
}

export interface ForensicsReceiptOptions {
  runId?: string;
}

// ─── Time of Death (Henssge nomogram) ────────────────────────────────────────

/**
 * Estimate post-mortem interval using Henssge's double-exponential cooling model.
 *
 * Body temperature over time:
 *   T(t) = Ta + (37.2 - Ta) × [1.25 × exp(−t/B) − 0.25 × exp(−5t/B)]
 *
 * Where B ≈ C_f × bodyMassKg^0.625 × (1/1.07)
 *
 * Corrective factor C_f accounts for clothing, body position, air movement.
 * Standard C_f values:
 *   1.0 = nude body, still air
 *   0.75 = light clothing
 *   0.5 = heavy clothing or water immersion (adjust)
 */
export function estimateTOD(
  bodyTempC: number,
  ambientTempC: number,
  bodyMassKg: number,
  correctiveFactor = 1.0,
): TODResult {
  if (bodyTempC <= ambientTempC) throw new Error('Body temperature must exceed ambient temperature');
  if (bodyMassKg <= 0) throw new Error('bodyMassKg must be positive');
  if (correctiveFactor <= 0) throw new Error('correctiveFactor must be positive');

  const T_r = 37.2; // Normal rectal temperature °C

  // Henssge B constant: cooling time constant
  const B = correctiveFactor * Math.pow(bodyMassKg, 0.625) / 1.07;

  // Normalise temperature: Q = (T_body - T_ambient) / (T_r - T_ambient)
  const Q = (bodyTempC - ambientTempC) / (T_r - ambientTempC);

  // Solve for t numerically (bisection):
  // Q = 1.25 × exp(−t/B) − 0.25 × exp(−5t/B)
  const f = (t: number) => 1.25 * Math.exp(-t / B) - 0.25 * Math.exp(-5 * t / B) - Q;

  if (Q >= 1.0) {
    // Body hasn't cooled yet — very recent death
    return { pmiLowHours: 0, pmiHighHours: 1, pmiCentralHours: 0.5, correctiveFactor, ambientTempC, bodyTempC };
  }
  if (Q <= 0) throw new Error('Temperature ratio Q ≤ 0: body may be at or below ambient temperature');

  let lo = 0, hi = 200;
  for (let iter = 0; iter < 100; iter++) {
    const mid = (lo + hi) / 2;
    if (f(mid) > 0) lo = mid; else hi = mid;
  }
  const pmiCentralHours = (lo + hi) / 2;

  // Uncertainty: ±95% CI is approximately ±2.8 hours (Henssge 1988)
  const uncertainty = 2.8;

  return {
    pmiLowHours:    Math.max(0, pmiCentralHours - uncertainty),
    pmiHighHours:   pmiCentralHours + uncertainty,
    pmiCentralHours,
    correctiveFactor,
    ambientTempC,
    bodyTempC,
  };
}

// ─── Locard exchange principle scoring ───────────────────────────────────────

/**
 * Compute likelihood ratio for Locard trace evidence.
 * LR = P(E | H_p: contact occurred) / P(E | H_d: no contact)
 *    ≈ (transferProbability × persistenceProbability) / backgroundFrequency
 */
export function locardScore(
  evidenceType: string,
  transferProbability: number,
  persistenceProbability: number,
  backgroundFrequency: number,
): LocardScore {
  if (transferProbability < 0 || transferProbability > 1) throw new Error('transferProbability must be in [0,1]');
  if (persistenceProbability < 0 || persistenceProbability > 1) throw new Error('persistenceProbability must be in [0,1]');
  if (backgroundFrequency <= 0 || backgroundFrequency > 1) throw new Error('backgroundFrequency must be in (0,1]');

  const likelihoodRatio = (transferProbability * persistenceProbability) / backgroundFrequency;
  return { evidenceType, transferProbability, persistenceProbability, backgroundFrequency, likelihoodRatio };
}

// ─── Bayesian evidence integration ───────────────────────────────────────────

/**
 * Chain multiple likelihood ratios via Bayes' theorem.
 * priorOdds: initial odds ratio (guilt/innocence) before evidence
 * likelihoodRatios: array of LR values from independent evidence items
 *
 * Posterior odds = priorOdds × Π(LR_i)
 * Posterior probability = posteriorOdds / (1 + posteriorOdds)
 */
export function bayesianEvidenceUpdate(
  priorOdds: number,
  likelihoodRatios: number[],
): BayesianEvidenceResult {
  if (priorOdds <= 0) throw new Error('priorOdds must be positive');
  if (likelihoodRatios.length === 0) throw new Error('At least one likelihood ratio required');
  if (likelihoodRatios.some(lr => lr <= 0)) throw new Error('All likelihood ratios must be positive');

  const posteriorOdds = priorOdds * likelihoodRatios.reduce((acc, lr) => acc * lr, 1);
  const posteriorProbability = posteriorOdds / (1 + posteriorOdds);
  const log10Post = Math.log10(posteriorOdds);

  // ENFSI verbal equivalence scale (log10 scale)
  let verbalEquivalent: string;
  if (log10Post < -3) verbalEquivalent = 'Very strong support for H_d (innocence)';
  else if (log10Post < -1) verbalEquivalent = 'Moderate support for H_d';
  else if (log10Post < 1) verbalEquivalent = 'Limited support / inconclusive';
  else if (log10Post < 2) verbalEquivalent = 'Moderate support for H_p (guilt)';
  else if (log10Post < 4) verbalEquivalent = 'Strong support for H_p';
  else verbalEquivalent = 'Very strong support for H_p';

  return { priorOdds, likelihoodRatios, posteriorOdds, posteriorProbability, verbalEquivalent };
}

// ─── Blood spatter analysis ───────────────────────────────────────────────────

/**
 * Compute angle of impact from elliptical bloodstain dimensions.
 * sin(α) = width / length  →  α = arcsin(w/l)
 * α = 90° means straight down (perpendicular), 0° = glancing blow.
 */
export function bloodSpatterAngle(widthMm: number, lengthMm: number): BloodSpatterResult {
  if (widthMm <= 0) throw new Error('widthMm must be positive');
  if (lengthMm <= 0) throw new Error('lengthMm must be positive');
  if (widthMm > lengthMm) throw new Error('widthMm must be ≤ lengthMm (width ≤ length for ellipse)');

  const sinAlpha = widthMm / lengthMm;
  const angleOfImpactDeg = Math.asin(Math.min(1, sinAlpha)) * (180 / Math.PI);
  const directionComment = angleOfImpactDeg < 30
    ? 'Shallow angle — source likely distant or moving fast'
    : angleOfImpactDeg < 60
    ? 'Moderate angle — intermediate distance/velocity'
    : 'Steep angle — source likely near or directly above';

  return { widthMm, lengthMm, angleOfImpactDeg, directionComment };
}

// ─── Trajectory back-calculation (area of origin) ────────────────────────────

export interface SpatterStain {
  /** X position on surface mm */
  x: number;
  /** Y position on surface mm */
  y: number;
  /** Angle of impact degrees */
  angleOfImpactDeg: number;
  /** Direction of travel from tail (radians, 0=+X) */
  directionRad: number;
}

/**
 * Compute area of origin from multiple bloodstain trajectories.
 * Each stain defines a line from its surface position back toward the origin.
 * The convergence point is found by least-squares intersection of trajectory lines.
 * Height is estimated as: h = dist × tan(impactAngle)
 */
export function trajectoryBackCalculation(stains: SpatterStain[]): TrajectoryResult {
  if (stains.length < 2) throw new Error('At least 2 stains required for trajectory calculation');

  // Each stain i defines line: (x − x_i) × sin(θ_i) − (y − y_i) × cos(θ_i) = 0
  // → a_i × x + b_i × y = c_i
  // a_i = sin(dir_i), b_i = −cos(dir_i), c_i = x_i×sin(dir_i) − y_i×cos(dir_i)
  let sumAA = 0, sumAB = 0, sumBB = 0, sumAC = 0, sumBC = 0;
  for (const s of stains) {
    const a = Math.sin(s.directionRad);
    const b = -Math.cos(s.directionRad);
    const c = s.x * a + s.y * b;
    sumAA += a * a; sumAB += a * b; sumBB += b * b;
    sumAC += a * c; sumBC += b * c;
  }

  // Normal equations: [sumAA sumAB; sumAB sumBB] [x; y] = [sumAC; sumBC]
  const det = sumAA * sumBB - sumAB * sumAB;
  if (Math.abs(det) < 1e-12) throw new Error('Stains are collinear — cannot compute convergence');

  const convergenceX = (sumBB * sumAC - sumAB * sumBC) / det;
  const convergenceY = (sumAA * sumBC - sumAB * sumAC) / det;

  // RMSE of fits
  let sumErr2 = 0;
  for (const s of stains) {
    const a = Math.sin(s.directionRad);
    const b = -Math.cos(s.directionRad);
    const c = s.x * a + s.y * b;
    const err = a * convergenceX + b * convergenceY - c;
    sumErr2 += err * err;
  }
  const fittingRmse = Math.sqrt(sumErr2 / stains.length);

  // Estimate height from stringing method
  const heights = stains.map(s => {
    const dx = convergenceX - s.x;
    const dy = convergenceY - s.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    return dist * Math.tan(s.angleOfImpactDeg * Math.PI / 180);
  });
  const originHeightMm = heights.reduce((a, b) => a + b, 0) / heights.length;

  return { convergenceX, convergenceY, originHeightMm, stainCount: stains.length, fittingRmse };
}

// ─── DNA match probability ────────────────────────────────────────────────────

/**
 * Compute random match probability for a multi-locus STR profile.
 * alleleFrequencies: per-locus array, each locus = [freq1, freq2] for two alleles
 * Uses the product rule with ceiling correction (NRC II recommendation):
 *   homozygous locus: p_i^2 + p_i(1-p_i)/N  (theta correction with N=200 reference)
 *   heterozygous locus: 2 × p_1 × p_2
 */
export function dnaMatchProbability(
  alleleFrequencies: Array<[number, number]>,
  thetaCorrection = 0.01,
): DNAMatchResult {
  if (alleleFrequencies.length === 0) throw new Error('At least 1 locus required');
  if (alleleFrequencies.some(([p1, p2]) => p1 <= 0 || p2 <= 0 || p1 > 1 || p2 > 1)) {
    throw new Error('All allele frequencies must be in (0, 1]');
  }

  let rmp = 1.0;
  for (const [p1, p2] of alleleFrequencies) {
    let locusProb: number;
    if (Math.abs(p1 - p2) < 1e-9) {
      // Homozygous: theta-correction formula
      locusProb = (2 * thetaCorrection + (1 - thetaCorrection) * p1) *
                  (3 * thetaCorrection + (1 - thetaCorrection) * p1);
      locusProb /= (1 + thetaCorrection) * (1 + 2 * thetaCorrection);
    } else {
      // Heterozygous
      locusProb = 2 * (thetaCorrection + (1 - thetaCorrection) * p1) *
                      (thetaCorrection + (1 - thetaCorrection) * p2);
      locusProb /= (1 + thetaCorrection) * (1 + 2 * thetaCorrection);
    }
    rmp *= locusProb;
  }

  const likelihoodRatio = 1 / rmp;
  const log10LR = Math.log10(likelihoodRatio);

  let verbalEquivalent: string;
  if (log10LR < 3) verbalEquivalent = 'Limited discrimination power';
  else if (log10LR < 6) verbalEquivalent = 'Strong match (1 in million+)';
  else if (log10LR < 9) verbalEquivalent = 'Very strong match (1 in billion+)';
  else verbalEquivalent = 'Extremely strong match (> 1 in billion)';

  return { lociCount: alleleFrequencies.length, randomMatchProbability: rmp, likelihoodRatio, log10LR, verbalEquivalent };
}

// ─── Chain of custody scoring ─────────────────────────────────────────────────

export interface CustodyEntry {
  timestamp: string;
  handler: string;
  action: 'collected' | 'transferred' | 'examined' | 'stored' | 'disposed';
  locationId: string;
  sealed: boolean;
}

export interface CustodyIntegrityResult {
  /** 0–100 integrity score */
  integrityScore: number;
  /** Number of gaps in custody chain */
  gaps: number;
  /** Number of unsealed transfers */
  unsealedTransfers: number;
  /** Whether chain is admissible (score ≥ 80) */
  admissible: boolean;
  issues: string[];
}

export function chainOfCustodyIntegrity(entries: CustodyEntry[]): CustodyIntegrityResult {
  if (entries.length === 0) throw new Error('No custody entries provided');

  const issues: string[] = [];
  let score = 100;
  let gaps = 0;
  let unsealedTransfers = 0;

  // Check first entry is collection
  if (entries[0].action !== 'collected') {
    issues.push('First entry is not a collection event');
    score -= 10;
  }

  for (let i = 1; i < entries.length; i++) {
    const prev = entries[i - 1];
    const curr = entries[i];

    // Temporal order check
    if (curr.timestamp < prev.timestamp) {
      issues.push(`Timestamp reversal between entries ${i - 1} and ${i}`);
      score -= 15;
      gaps++;
    }

    // Transfer must be sealed
    if (curr.action === 'transferred' && !curr.sealed) {
      issues.push(`Unsealed transfer at entry ${i} by ${curr.handler}`);
      score -= 5;
      unsealedTransfers++;
    }

    // Consecutive handlers in different locations need explicit transfer
    if (curr.handler !== prev.handler && curr.action !== 'transferred' && curr.locationId !== prev.locationId) {
      issues.push(`Handler change without transfer event at entry ${i}`);
      score -= 10;
      gaps++;
    }
  }

  score = Math.max(0, score);

  return {
    integrityScore: score,
    gaps,
    unsealedTransfers,
    admissible: score >= 80,
    issues,
  };
}

// ─── Receipt ──────────────────────────────────────────────────────────────────

export interface ForensicsAnalysisResult {
  tod?: TODResult;
  bayesian?: BayesianEvidenceResult;
  bloodSpatter?: BloodSpatterResult;
  trajectory?: TrajectoryResult;
  dna?: DNAMatchResult;
  custody?: CustodyIntegrityResult;
  converged: true;
}

export function buildForensicsReceipt(
  result: ForensicsAnalysisResult,
  options?: ForensicsReceiptOptions,
): DomainSimulationReceipt {
  const violations: Array<{ criterion: string; message: string }> = [];

  if (result.custody && !result.custody.admissible) {
    violations.push({
      criterion: 'chain_of_custody',
      message: `Custody integrity score ${result.custody.integrityScore}/100 — not admissible`,
    });
  }
  if (result.bayesian && result.bayesian.posteriorProbability < 0.5 && result.bayesian.likelihoodRatios.length > 1) {
    violations.push({
      criterion: 'bayesian_evidence',
      message: `Posterior probability ${(result.bayesian.posteriorProbability * 100).toFixed(1)}% — evidence does not support hypothesis`,
    });
  }

  return buildDomainSimulationReceipt({
    plugin: 'forensics',
    pluginVersion: '1.0.0',
    runId: options?.runId ?? `forensics-${Date.now().toString(36)}`,
    solverConfig: { solverType: 'forensic-analytics', scale: 'casework' },
    resultSummary: {
      pmiCentralHours: result.tod?.pmiCentralHours,
      posteriorProbability: result.bayesian?.posteriorProbability,
      dnaLog10LR: result.dna?.log10LR,
      custodyScore: result.custody?.integrityScore,
      impactAngleDeg: result.bloodSpatter?.angleOfImpactDeg,
    },
    cael: { version: 'cael.v1', event: 'forensics.forensic_analysis', solverType: 'forensics.bayesian-locard' },
    acceptance: { accepted: violations.length === 0, violations },
  });
}
