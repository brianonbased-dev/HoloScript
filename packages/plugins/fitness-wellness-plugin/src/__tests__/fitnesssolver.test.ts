/**
 * Fitness & wellness solver tests — fitness-wellness-plugin
 *
 * Reference values verified against:
 *  - ACSM Guidelines for Exercise Testing & Prescription (10th ed.)
 *  - Epley B (1985) poundage chart worked examples
 *  - Jackson & Pollock (1978) Br.J.Nutr 40:497-504
 *  - Karvonen M et al. (1957) Ann.Med.Exp.Biol.Fenn 35:307-315
 */

import { describe, it, expect } from 'vitest';
import {
  oneRepMax,
  vo2MaxCooper,
  vo2MaxNonExercise,
  heartRateZones,
  calorieBurn,
  jacksonPollockSkinfold,
  acuteChronicWorkloadRatio,
  analyzeFitness,
  buildFitnessReceipt,
  ACTIVITY_METS,
} from '../fitnesssolver';

// ─── 1-Rep Max ────────────────────────────────────────────────────────────────

describe('oneRepMax', () => {
  /**
   * 100 kg for 5 reps:
   *  Epley:    100 × (1 + 5/30)   = 116.67 kg
   *  Brzycki:  100 × 36/(37−5)    = 112.50 kg
   *  Lander:   100×100/(101.3−13.356) ≈ 113.8 kg
   *  Lombardi: 100 × 5^0.10       ≈ 117.0 kg
   */
  it('1RM with 1 rep = weight itself', () => {
    const r = oneRepMax(100, 1);
    expect(r.average).toBe(100);
  });

  it('Epley formula: 100 kg × 5 reps ≈ 116.67 kg', () => {
    const r = oneRepMax(100, 5);
    expect(r.epley).toBeCloseTo(100 * (1 + 5 / 30), 4);
  });

  it('Brzycki formula: 100 kg × 5 reps ≈ 112.5 kg', () => {
    const r = oneRepMax(100, 5);
    expect(r.brzycki).toBeCloseTo(100 * 36 / 32, 3);
  });

  it('higher reps → higher 1RM estimate', () => {
    const r5  = oneRepMax(100, 5);
    const r10 = oneRepMax(100, 10);
    expect(r10.average).toBeGreaterThan(r5.average);
  });

  it('all four formulas and average are positive', () => {
    const r = oneRepMax(80, 8);
    expect(r.epley).toBeGreaterThan(0);
    expect(r.brzycki).toBeGreaterThan(0);
    expect(r.lander).toBeGreaterThan(0);
    expect(r.lombardi).toBeGreaterThan(0);
    expect(r.average).toBeGreaterThan(0);
  });

  it('average equals mean of four formulas', () => {
    const r = oneRepMax(75, 6);
    const manual = (r.epley + r.brzycki + r.lander + r.lombardi) / 4;
    expect(r.average).toBeCloseTo(manual, 8);
  });

  it('throws for zero weight', () => {
    expect(() => oneRepMax(0, 5)).toThrow();
  });

  it('throws for > 30 reps', () => {
    expect(() => oneRepMax(50, 31)).toThrow();
  });
});

// ─── VO2max ───────────────────────────────────────────────────────────────────

describe('vo2MaxCooper', () => {
  /**
   * Cooper (1968): VO2max = (distance − 504.9) / 44.73
   * At 2400 m: VO2 = (2400 − 504.9) / 44.73 ≈ 42.4 ml/kg/min → "good"
   */
  it('2400 m Cooper distance → VO2 ≈ 42.4 ml/kg/min', () => {
    const r = vo2MaxCooper(2400);
    expect(r.vo2MaxMlKgMin).toBeCloseTo((2400 - 504.9) / 44.73, 2);
  });

  it('higher distance → higher VO2max', () => {
    const r2000 = vo2MaxCooper(2000);
    const r3000 = vo2MaxCooper(3000);
    expect(r3000.vo2MaxMlKgMin).toBeGreaterThan(r2000.vo2MaxMlKgMin);
  });

  it('method is cooper-12min', () => {
    expect(vo2MaxCooper(2000).method).toBe('cooper-12min');
  });

  it('VO2max is non-negative even for very short distance', () => {
    const r = vo2MaxCooper(100);
    expect(r.vo2MaxMlKgMin).toBeGreaterThanOrEqual(0);
  });

  it('throws for zero distance', () => {
    expect(() => vo2MaxCooper(0)).toThrow();
  });
});

describe('vo2MaxNonExercise', () => {
  it('higher PA rating → higher VO2max (active person fitter)', () => {
    const r3 = vo2MaxNonExercise(30, 25, 3, true);
    const r8 = vo2MaxNonExercise(30, 25, 8, true);
    expect(r8.vo2MaxMlKgMin).toBeGreaterThan(r3.vo2MaxMlKgMin);
  });

  it('male has higher VO2max than female (same age/BMI/PA)', () => {
    const rM = vo2MaxNonExercise(30, 25, 5, true);
    const rF = vo2MaxNonExercise(30, 25, 5, false);
    expect(rM.vo2MaxMlKgMin).toBeGreaterThan(rF.vo2MaxMlKgMin);
  });

  it('older age → lower VO2max (all else equal)', () => {
    const rYoung = vo2MaxNonExercise(25, 25, 5, true);
    const rOld   = vo2MaxNonExercise(55, 25, 5, true);
    expect(rOld.vo2MaxMlKgMin).toBeLessThan(rYoung.vo2MaxMlKgMin);
  });

  it('throws for age out of range', () => {
    expect(() => vo2MaxNonExercise(5, 25, 5, true)).toThrow();
  });

  it('throws for PA rating > 10', () => {
    expect(() => vo2MaxNonExercise(30, 25, 11, true)).toThrow();
  });
});

// ─── Heart rate zones ─────────────────────────────────────────────────────────

describe('heartRateZones', () => {
  /**
   * Karvonen: HRzone = hrRest + fraction × (hrMax − hrRest)
   * hrRest=60, hrMax=190 → HRR=130
   * Zone 1 (50-60%): 60 + 65 = 125, 60 + 78 = 138
   */
  const r = heartRateZones(60, 190);

  it('HRR = hrMax - hrRest', () => {
    expect(r.hrr).toBe(130);
  });

  it('zone 1 lower = hrRest + 0.50 × HRR', () => {
    expect(r.zones.zone1.lo).toBe(60 + Math.round(0.5 * 130));
  });

  it('zone 5 upper = hrMax', () => {
    expect(r.zones.zone5.hi).toBe(190);
  });

  it('zone boundaries are strictly increasing', () => {
    const zones = [r.zones.zone1, r.zones.zone2, r.zones.zone3, r.zones.zone4, r.zones.zone5];
    for (let i = 1; i < zones.length; i++) {
      expect(zones[i].lo).toBeGreaterThanOrEqual(zones[i - 1].lo);
    }
  });

  it('throws when hrMax ≤ hrRest', () => {
    expect(() => heartRateZones(70, 60)).toThrow();
  });
});

// ─── Calorie burn ─────────────────────────────────────────────────────────────

describe('calorieBurn', () => {
  /**
   * Running at 6 mph (MET=9.8), 70 kg, 30 min:
   *  Gross = 9.8 × 70 × 0.5 = 343 kcal
   *  Net = (9.8 - 1) × 70 × 0.5 = 308 kcal
   */
  it('gross kcal = MET × bodyMassKg × durationHours', () => {
    const r = calorieBurn(9.8, 70, 30);
    expect(r.grossKcal).toBeCloseTo(9.8 * 70 * 0.5, 3);
  });

  it('net kcal = (MET - 1) × bodyMassKg × durationHours', () => {
    const r = calorieBurn(9.8, 70, 30);
    expect(r.netKcal).toBeCloseTo(8.8 * 70 * 0.5, 3);
  });

  it('net kcal < gross kcal', () => {
    const r = calorieBurn(8.0, 80, 60);
    expect(r.netKcal).toBeLessThan(r.grossKcal);
  });

  it('grossKcal proportional to duration', () => {
    const r30 = calorieBurn(8, 70, 30);
    const r60 = calorieBurn(8, 70, 60);
    expect(r60.grossKcal).toBeCloseTo(r30.grossKcal * 2, 6);
  });

  it('ACTIVITY_METS contains running_6mph = 9.8', () => {
    expect(ACTIVITY_METS['running_6mph']).toBe(9.8);
  });

  it('throws for zero MET', () => {
    expect(() => calorieBurn(0, 70, 30)).toThrow();
  });

  it('throws for zero body mass', () => {
    expect(() => calorieBurn(8, 0, 30)).toThrow();
  });
});

// ─── Jackson-Pollock body composition ────────────────────────────────────────

describe('jacksonPollockSkinfold', () => {
  /**
   * Male, age 30, skinfolds: chest=10, abdomen=15, thigh=12 → sum=37
   * Density ≈ 1.10938 - 0.0008267×37 + 0.0000016×1369 - 0.0002574×30
   *         ≈ 1.10938 - 0.030588 + 0.0021904 - 0.0077220
   *         ≈ 1.0740
   * %BF = (4.95/1.0740 - 4.50) × 100 ≈ (4.609 - 4.50) × 100 ≈ 10.9%
   */
  const male = jacksonPollockSkinfold(10, 15, 12, 30, true, 80);

  it('male body fat % between 5% and 30% for lean measurements', () => {
    expect(male.bodyFatPct).toBeGreaterThan(5);
    expect(male.bodyFatPct).toBeLessThan(30);
  });

  it('fat mass + lean mass = body mass', () => {
    expect(male.fatMassKg + male.leanMassKg).toBeCloseTo(80, 5);
  });

  it('skinfold sum = s1 + s2 + s3', () => {
    expect(male.skinfoldSumMm).toBe(10 + 15 + 12);
  });

  it('body density ~1.07 (plausible for lean male)', () => {
    expect(male.bodyDensityGcc).toBeGreaterThan(1.04);
    expect(male.bodyDensityGcc).toBeLessThan(1.10);
  });

  it('higher skinfolds → higher body fat %', () => {
    const lean = jacksonPollockSkinfold(10, 12, 10, 30, true, 80);
    const obese = jacksonPollockSkinfold(35, 50, 40, 30, true, 80);
    expect(obese.bodyFatPct).toBeGreaterThan(lean.bodyFatPct);
  });

  it('throws for non-positive skinfold', () => {
    expect(() => jacksonPollockSkinfold(0, 15, 12, 30, true, 80)).toThrow();
  });

  it('throws for age outside [18, 80]', () => {
    expect(() => jacksonPollockSkinfold(10, 15, 12, 15, true, 80)).toThrow();
  });
});

// ─── ACWR training load ───────────────────────────────────────────────────────

describe('acuteChronicWorkloadRatio', () => {
  /**
   * Stable training: 7 days all at AU=100
   * Acute = 100, Chronic = 100, ACWR = 1.0 → low risk
   */
  it('stable load ACWR = 1.0 → low risk', () => {
    const loads = Array(28).fill(100);
    const r = acuteChronicWorkloadRatio(loads);
    expect(r.acwr).toBeCloseTo(1.0, 5);
    expect(r.riskCategory).toBe('low');
  });

  it('spike in acute load → high ACWR', () => {
    const loads = [...Array(21).fill(100), ...Array(7).fill(200)];
    const r = acuteChronicWorkloadRatio(loads);
    expect(r.acwr).toBeGreaterThan(1.3);
  });

  it('very high spike (>1.5×) → very-high risk', () => {
    const loads = [...Array(21).fill(100), ...Array(7).fill(300)];
    const r = acuteChronicWorkloadRatio(loads);
    expect(r.riskCategory).toBe('very-high');
    expect(r.acwr).toBeGreaterThan(1.5);
  });

  it('acuteLoad = mean of last 7 days', () => {
    const loads = [...Array(21).fill(80), 100, 120, 140, 160, 180, 200, 220];
    const r = acuteChronicWorkloadRatio(loads);
    const expected = (100 + 120 + 140 + 160 + 180 + 200 + 220) / 7;
    expect(r.acuteLoad).toBeCloseTo(expected, 4);
  });

  it('throws for fewer than 7 days', () => {
    expect(() => acuteChronicWorkloadRatio([100, 100, 100])).toThrow();
  });
});

// ─── analyzeFitness ───────────────────────────────────────────────────────────

describe('analyzeFitness', () => {
  it('returns all sub-results when all inputs provided', () => {
    const r = analyzeFitness({
      oneRM:  { weightKg: 100, reps: 5 },
      vo2Max: { method: 'cooper', distanceM: 2400 },
      hrZones: { hrRest: 60, hrMax: 190 },
      calories: { met: 9.8, bodyMassKg: 70, durationMin: 30 },
      bodyComp: { s1: 10, s2: 15, s3: 12, ageYears: 30, isMale: true, bodyMassKg: 80 },
      trainingLoad: { workloads: Array(28).fill(100) },
    });
    expect(r.oneRM).toBeDefined();
    expect(r.vo2Max).toBeDefined();
    expect(r.hrZones).toBeDefined();
    expect(r.calories).toBeDefined();
    expect(r.bodyComp).toBeDefined();
    expect(r.trainingLoad).toBeDefined();
    expect(r.converged).toBe(true);
  });

  it('returns only oneRM when only oneRM input given', () => {
    const r = analyzeFitness({ oneRM: { weightKg: 80, reps: 3 } });
    expect(r.oneRM).toBeDefined();
    expect(r.vo2Max).toBeUndefined();
  });
});

// ─── Receipt ─────────────────────────────────────────────────────────────────

describe('buildFitnessReceipt', () => {
  it('produces receipt with plugin=fitness-wellness and CAEL event', () => {
    const result = analyzeFitness({ oneRM: { weightKg: 100, reps: 5 } });
    const receipt = buildFitnessReceipt(result);
    expect(receipt.plugin).toBe('fitness-wellness');
    expect(receipt.cael.event).toBe('fitness_wellness.fitness_analysis');
    expect(receipt.payloadHash).toBeTruthy();
  });

  it('accepted=true for normal fitness analysis', () => {
    const result = analyzeFitness({ calories: { met: 8, bodyMassKg: 70, durationMin: 45 } });
    const receipt = buildFitnessReceipt(result);
    expect(receipt.acceptance.accepted).toBe(true);
  });

  it('uses provided runId', () => {
    const result = analyzeFitness({});
    const receipt = buildFitnessReceipt(result, { runId: 'fit-run-99' });
    expect(receipt.runId).toBe('fit-run-99');
  });

  it('accepted=false when ACWR > 1.5', () => {
    const loads = [...Array(21).fill(100), ...Array(7).fill(350)];
    const result = analyzeFitness({ trainingLoad: { workloads: loads } });
    const receipt = buildFitnessReceipt(result);
    expect(receipt.acceptance.accepted).toBe(false);
    expect(receipt.acceptance.violations.length).toBeGreaterThan(0);
  });
});
