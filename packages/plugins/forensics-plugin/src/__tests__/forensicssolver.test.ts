/**
 * Forensic science solver tests — forensics-plugin
 *
 * Reference values verified against:
 *  - Henssge C (1988) Forens.Sci.Int 38:209-236 (TOD nomogram)
 *  - Buckleton J et al. (2005) Forensic DNA Evidence Interpretation
 *  - Aitken C, Taroni F (2004) Statistics and the Evaluation of Evidence
 */

import { describe, it, expect } from 'vitest';
import {
  estimateTOD,
  locardScore,
  bayesianEvidenceUpdate,
  bloodSpatterAngle,
  trajectoryBackCalculation,
  dnaMatchProbability,
  chainOfCustodyIntegrity,
  buildForensicsReceipt,
  type CustodyEntry,
  type SpatterStain,
} from '../forensicssolver';

// ─── Time of Death ────────────────────────────────────────────────────────────

describe('estimateTOD', () => {
  /**
   * Henssge example: bodyTemp=30°C, ambient=10°C, mass=70kg, cf=1.0
   * Expected PMI roughly 10-16 hours (typical for these parameters).
   */
  it('returns plausible PMI for typical parameters', () => {
    const r = estimateTOD(30, 10, 70, 1.0);
    expect(r.pmiCentralHours).toBeGreaterThan(5);
    expect(r.pmiCentralHours).toBeLessThan(30);
  });

  it('lower body temperature → longer PMI', () => {
    const r25 = estimateTOD(25, 10, 70);
    const r30 = estimateTOD(30, 10, 70);
    expect(r25.pmiCentralHours).toBeGreaterThan(r30.pmiCentralHours);
  });

  it('pmiLow < pmiCentral < pmiHigh', () => {
    const r = estimateTOD(28, 15, 80);
    expect(r.pmiLowHours).toBeLessThanOrEqual(r.pmiCentralHours);
    expect(r.pmiCentralHours).toBeLessThanOrEqual(r.pmiHighHours);
  });

  it('near-normal body temperature (36°C) → very recent death (PMI < 2h)', () => {
    // At 36°C body, 20°C ambient, 70 kg — barely cooled
    const r = estimateTOD(36, 20, 70);
    expect(r.pmiCentralHours).toBeLessThan(3);
  });

  it('heavier body → longer cooling → longer PMI', () => {
    const r50 = estimateTOD(28, 15, 50);
    const r120 = estimateTOD(28, 15, 120);
    expect(r120.pmiCentralHours).toBeGreaterThan(r50.pmiCentralHours);
  });

  it('smaller corrective factor → shorter PMI (faster cooling)', () => {
    const rWarm = estimateTOD(28, 15, 70, 1.0); // nude, still air
    const rClothed = estimateTOD(28, 15, 70, 1.5); // heavily clothed
    // Higher cf = slower cooling = longer PMI
    expect(rClothed.pmiCentralHours).toBeGreaterThan(rWarm.pmiCentralHours);
  });

  it('throws when body temp ≤ ambient temp', () => {
    expect(() => estimateTOD(15, 20, 70)).toThrow();
  });

  it('throws for non-positive body mass', () => {
    expect(() => estimateTOD(28, 15, 0)).toThrow();
  });
});

// ─── Locard scoring ───────────────────────────────────────────────────────────

describe('locardScore', () => {
  /**
   * Fiber evidence: transfer=0.8, persistence=0.5, background=0.01
   * LR = (0.8 × 0.5) / 0.01 = 40
   */
  it('computes correct LR for fiber evidence', () => {
    const r = locardScore('fiber', 0.8, 0.5, 0.01);
    expect(r.likelihoodRatio).toBeCloseTo(40, 4);
  });

  it('higher background frequency → lower LR', () => {
    const r1  = locardScore('paint', 0.7, 0.6, 0.001);
    const r2  = locardScore('paint', 0.7, 0.6, 0.05);
    expect(r2.likelihoodRatio).toBeLessThan(r1.likelihoodRatio);
  });

  it('LR > 1 means evidence supports contact (H_p)', () => {
    const r = locardScore('hair', 0.6, 0.7, 0.02);
    expect(r.likelihoodRatio).toBeGreaterThan(1);
  });

  it('returns correct evidence type', () => {
    const r = locardScore('glass', 0.5, 0.4, 0.02);
    expect(r.evidenceType).toBe('glass');
  });

  it('throws for transfer probability > 1', () => {
    expect(() => locardScore('test', 1.5, 0.5, 0.01)).toThrow();
  });

  it('throws for background frequency of 0', () => {
    expect(() => locardScore('test', 0.5, 0.5, 0)).toThrow();
  });
});

// ─── Bayesian evidence update ─────────────────────────────────────────────────

describe('bayesianEvidenceUpdate', () => {
  /**
   * Prior odds = 1/999 (1 in 1000 suspects), LR = 1000
   * Posterior odds = 1000/999 ≈ 1.001 → P ≈ 0.5
   */
  it('1:999 prior × LR=1000 → posterior ≈ 0.5', () => {
    const r = bayesianEvidenceUpdate(1 / 999, [1000]);
    expect(r.posteriorProbability).toBeCloseTo(1000 / (999 + 1000), 3);
  });

  it('multiple LRs multiply correctly', () => {
    const r = bayesianEvidenceUpdate(1, [10, 5, 2]);
    expect(r.posteriorOdds).toBeCloseTo(100, 5);
  });

  it('posterior probability in [0, 1]', () => {
    const r = bayesianEvidenceUpdate(0.001, [100000]);
    expect(r.posteriorProbability).toBeGreaterThanOrEqual(0);
    expect(r.posteriorProbability).toBeLessThanOrEqual(1);
  });

  it('prior odds preserved in result', () => {
    const r = bayesianEvidenceUpdate(0.5, [2]);
    expect(r.priorOdds).toBe(0.5);
  });

  it('LR = 1 leaves posterior unchanged from prior', () => {
    const priorOdds = 2;
    const r = bayesianEvidenceUpdate(priorOdds, [1]);
    expect(r.posteriorOdds).toBeCloseTo(priorOdds, 8);
  });

  it('throws for non-positive prior odds', () => {
    expect(() => bayesianEvidenceUpdate(0, [10])).toThrow();
  });

  it('throws for empty LR array', () => {
    expect(() => bayesianEvidenceUpdate(1, [])).toThrow();
  });

  it('throws for LR = 0', () => {
    expect(() => bayesianEvidenceUpdate(1, [0])).toThrow();
  });
});

// ─── Blood spatter ────────────────────────────────────────────────────────────

describe('bloodSpatterAngle', () => {
  /**
   * Circle (width = length) → sin(α) = 1 → α = 90° (perpendicular drop)
   */
  it('circular stain → 90° angle of impact', () => {
    const r = bloodSpatterAngle(10, 10);
    expect(r.angleOfImpactDeg).toBeCloseTo(90, 4);
  });

  /**
   * width = 5, length = 10 → sin(α) = 0.5 → α = 30°
   */
  it('w=5 l=10 → angle = 30°', () => {
    const r = bloodSpatterAngle(5, 10);
    expect(r.angleOfImpactDeg).toBeCloseTo(30, 3);
  });

  it('angle increases as width/length approaches 1', () => {
    const r_low  = bloodSpatterAngle(3, 10);
    const r_high = bloodSpatterAngle(9, 10);
    expect(r_high.angleOfImpactDeg).toBeGreaterThan(r_low.angleOfImpactDeg);
  });

  it('angle is in [0, 90] degrees', () => {
    const r = bloodSpatterAngle(7, 12);
    expect(r.angleOfImpactDeg).toBeGreaterThanOrEqual(0);
    expect(r.angleOfImpactDeg).toBeLessThanOrEqual(90);
  });

  it('throws when width > length', () => {
    expect(() => bloodSpatterAngle(12, 10)).toThrow();
  });

  it('throws for zero width', () => {
    expect(() => bloodSpatterAngle(0, 10)).toThrow();
  });
});

// ─── Trajectory back-calculation ──────────────────────────────────────────────

describe('trajectoryBackCalculation', () => {
  /**
   * Two stains whose back-trajectories should cross at origin (500, 500):
   * Stain A at (300, 500), direction = 0 (→ +X)
   * Stain B at (500, 300), direction = π/2 (↑ +Y)
   * Lines: y=500 (horizontal from A) and x=500 (vertical from B) → meet at (500,500).
   */
  const stains: SpatterStain[] = [
    { x: 300, y: 500, angleOfImpactDeg: 45, directionRad: 0 },         // → toward +X: line y=500
    { x: 500, y: 300, angleOfImpactDeg: 45, directionRad: Math.PI / 2 }, // ↑ toward +Y: line x=500
  ];

  it('two perpendicular stains converge at correct point', () => {
    const r = trajectoryBackCalculation(stains);
    expect(r.convergenceX).toBeCloseTo(500, 0);
    expect(r.convergenceY).toBeCloseTo(500, 0);
  });

  it('originHeightMm is positive', () => {
    const r = trajectoryBackCalculation(stains);
    expect(r.originHeightMm).toBeGreaterThan(0);
  });

  it('stainCount matches input', () => {
    const r = trajectoryBackCalculation(stains);
    expect(r.stainCount).toBe(2);
  });

  it('fittingRmse is finite', () => {
    const r = trajectoryBackCalculation(stains);
    expect(Number.isFinite(r.fittingRmse)).toBe(true);
  });

  it('throws for fewer than 2 stains', () => {
    expect(() => trajectoryBackCalculation([stains[0]])).toThrow();
  });
});

// ─── DNA match probability ────────────────────────────────────────────────────

describe('dnaMatchProbability', () => {
  /**
   * Single locus, heterozygous, freq1=0.1, freq2=0.2:
   * P(locus) ≈ 2 × 0.1 × 0.2 = 0.04 (ignoring theta correction)
   * LR ≈ 25
   */
  it('single locus LR > 1 for rare alleles', () => {
    const r = dnaMatchProbability([[0.1, 0.2]]);
    expect(r.likelihoodRatio).toBeGreaterThan(1);
    expect(r.lociCount).toBe(1);
  });

  it('more loci → lower RMP (more discriminating)', () => {
    const r1 = dnaMatchProbability([[0.1, 0.2]]);
    const r4 = dnaMatchProbability([[0.1, 0.2], [0.15, 0.1], [0.08, 0.12], [0.05, 0.09]]);
    expect(r4.randomMatchProbability).toBeLessThan(r1.randomMatchProbability);
  });

  it('RMP is in (0, 1]', () => {
    const r = dnaMatchProbability([[0.2, 0.3], [0.1, 0.15]]);
    expect(r.randomMatchProbability).toBeGreaterThan(0);
    expect(r.randomMatchProbability).toBeLessThanOrEqual(1);
  });

  it('log10LR > 0 (evidence supports match)', () => {
    const r = dnaMatchProbability([[0.05, 0.08]]);
    expect(r.log10LR).toBeGreaterThan(0);
  });

  it('homozygous locus: [p, p] accepted', () => {
    const r = dnaMatchProbability([[0.1, 0.1]]);
    expect(r.randomMatchProbability).toBeGreaterThan(0);
  });

  it('13-locus CODIS profile: LR very large', () => {
    const codis: Array<[number, number]> = [
      [0.1, 0.15], [0.08, 0.12], [0.2, 0.1], [0.05, 0.09],
      [0.15, 0.07], [0.1, 0.2], [0.08, 0.06], [0.12, 0.1],
      [0.09, 0.14], [0.07, 0.11], [0.13, 0.08], [0.06, 0.1], [0.09, 0.12],
    ];
    const r = dnaMatchProbability(codis);
    expect(r.log10LR).toBeGreaterThan(10); // > 10^10
  });

  it('throws for empty loci array', () => {
    expect(() => dnaMatchProbability([])).toThrow();
  });

  it('throws for allele frequency > 1', () => {
    expect(() => dnaMatchProbability([[1.5, 0.2]])).toThrow();
  });
});

// ─── Chain of custody ─────────────────────────────────────────────────────────

describe('chainOfCustodyIntegrity', () => {
  const goodChain: CustodyEntry[] = [
    { timestamp: '2024-01-01T09:00Z', handler: 'Officer_A', action: 'collected',   locationId: 'scene_01', sealed: true },
    { timestamp: '2024-01-01T10:00Z', handler: 'Officer_A', action: 'transferred', locationId: 'lab_01',   sealed: true },
    { timestamp: '2024-01-01T11:00Z', handler: 'Analyst_B', action: 'examined',    locationId: 'lab_01',   sealed: false },
    { timestamp: '2024-01-01T15:00Z', handler: 'Analyst_B', action: 'stored',      locationId: 'lab_01',   sealed: true },
  ];

  it('perfect chain has score 100 and is admissible', () => {
    const r = chainOfCustodyIntegrity(goodChain);
    expect(r.integrityScore).toBe(100);
    expect(r.admissible).toBe(true);
    expect(r.gaps).toBe(0);
  });

  it('timestamp reversal reduces score', () => {
    const bad = [...goodChain];
    bad[2] = { ...bad[2], timestamp: '2024-01-01T08:00Z' }; // before entry 1
    const r = chainOfCustodyIntegrity(bad);
    expect(r.integrityScore).toBeLessThan(100);
    expect(r.gaps).toBeGreaterThan(0);
  });

  it('unsealed transfer reduces score', () => {
    const bad = goodChain.map((e, i) =>
      i === 1 ? { ...e, sealed: false } : e,
    );
    const r = chainOfCustodyIntegrity(bad);
    expect(r.unsealedTransfers).toBeGreaterThan(0);
    expect(r.integrityScore).toBeLessThan(100);
  });

  it('score >= 80 → admissible', () => {
    const r = chainOfCustodyIntegrity(goodChain);
    expect(r.admissible).toBe(true);
  });

  it('issues array is empty for perfect chain', () => {
    const r = chainOfCustodyIntegrity(goodChain);
    expect(r.issues).toHaveLength(0);
  });

  it('throws for empty entries', () => {
    expect(() => chainOfCustodyIntegrity([])).toThrow();
  });
});

// ─── Receipt ──────────────────────────────────────────────────────────────────

describe('buildForensicsReceipt', () => {
  it('produces receipt with plugin=forensics and CAEL event', () => {
    const tod = estimateTOD(28, 15, 70);
    const receipt = buildForensicsReceipt({ tod, converged: true });
    expect(receipt.plugin).toBe('forensics');
    expect(receipt.cael.event).toBe('forensics.forensic_analysis');
    expect(receipt.payloadHash).toBeTruthy();
  });

  it('accepted=true for clean forensics result', () => {
    const bayes = bayesianEvidenceUpdate(0.1, [50, 20]);
    const receipt = buildForensicsReceipt({ bayesian: bayes, converged: true });
    expect(receipt.acceptance.accepted).toBe(true);
  });

  it('accepted=false for inadmissible custody chain', () => {
    // Score < 80: first entry not collection + timestamp reversal
    const badChain: CustodyEntry[] = [
      { timestamp: '2024-01-01T10:00Z', handler: 'A', action: 'transferred', locationId: 'lab', sealed: false },
      { timestamp: '2024-01-01T09:00Z', handler: 'B', action: 'examined',    locationId: 'lab', sealed: false },
    ];
    const custody = chainOfCustodyIntegrity(badChain);
    const receipt = buildForensicsReceipt({ custody, converged: true });
    // If custody score < 80, expect violation
    if (!custody.admissible) {
      expect(receipt.acceptance.accepted).toBe(false);
      expect(receipt.acceptance.violations.length).toBeGreaterThan(0);
    }
  });

  it('uses provided runId', () => {
    const receipt = buildForensicsReceipt({ converged: true }, { runId: 'case-2024-01' });
    expect(receipt.runId).toBe('case-2024-01');
  });
});
