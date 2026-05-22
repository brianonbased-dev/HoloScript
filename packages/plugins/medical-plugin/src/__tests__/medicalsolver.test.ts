/**
 * Clinical medicine solver tests — medical-plugin
 *
 * Reference values verified against:
 *  - Cockcroft D, Gault M (1976) Nephron 16:31-41
 *  - Devine B (1974) Drug Intell Clin Pharm 8:650-655
 *  - DuBois D, DuBois E (1916) Arch Int Med 17:863-871
 *  - Royal College of Physicians (2017) NEWS2 scoring guide
 *  - Baxter C (1974) Surg Clin North Am 54:1355-1365
 *
 * CLINICAL DISCLAIMER: This test suite validates DECISION SUPPORT math only.
 * Output must be reviewed by a qualified medical professional.
 */

import { describe, it, expect } from 'vitest';
import {
  bmiCalculation,
  egfrCockcroftGault,
  oneCompartmentPK,
  news2Score,
  parklandFormula,
  framinghamRisk,
  buildMedicalReceipt,
} from '../medicalsolver';

// ─── BMI + Body Composition ───────────────────────────────────────────────────

describe('bmiCalculation', () => {
  /**
   * BMI = 70 / 1.75² = 22.86 → normal
   * BSA (DuBois) = 0.007184 × 175^0.725 × 70^0.425 ≈ 1.859 m²
   * IBW (Devine male, 175cm = 68.9 in, 68.9-60 = 8.9 over 5ft): 50 + 2.3×8.9 = 70.5 kg
   */
  it('normal BMI male — 70 kg 175 cm', () => {
    const r = bmiCalculation(70, 175, 'male');
    expect(r.bmi).toBeCloseTo(70 / (1.75 ** 2), 1);
    expect(r.category).toBe('normal');
  });

  it('BSA ≈ 1.86 m² for 70 kg 175 cm', () => {
    const r = bmiCalculation(70, 175, 'male');
    const expected = 0.007184 * Math.pow(175, 0.725) * Math.pow(70, 0.425);
    expect(r.bsaM2).toBeCloseTo(expected, 2);
  });

  it('IBW (Devine male) = 50 + 2.3 × inches-over-5ft', () => {
    const r = bmiCalculation(70, 175, 'male');
    const heightIn = 175 / 2.54;
    const expected = 50 + 2.3 * (heightIn - 60);
    expect(r.ibwKg).toBeCloseTo(expected, 1);
  });

  it('IBW female = 45.5 + 2.3 × inches-over-5ft', () => {
    const r = bmiCalculation(60, 165, 'female');
    const heightIn = 165 / 2.54;
    const expected = 45.5 + 2.3 * (heightIn - 60);
    expect(r.ibwKg).toBeCloseTo(expected, 1);
  });

  it('BMI < 18.5 → underweight', () => {
    const r = bmiCalculation(45, 170, 'female');
    expect(r.category).toBe('underweight');
  });

  it('BMI 25-29.9 → overweight', () => {
    const r = bmiCalculation(80, 170, 'male');
    expect(r.category).toBe('overweight');
  });

  it('BMI ≥ 40 → obese-III', () => {
    const r = bmiCalculation(130, 170, 'female');
    expect(r.category).toBe('obese-III');
  });

  it('adjBodyWeightKg = IBW + 0.4 × (actual - IBW)', () => {
    const r = bmiCalculation(100, 175, 'male');
    const adj = r.ibwKg + 0.4 * (100 - r.ibwKg);
    expect(r.adjBodyWeightKg).toBeCloseTo(adj, 1);
  });

  it('throws for non-positive weight', () => {
    expect(() => bmiCalculation(0, 170, 'male')).toThrow();
  });

  it('throws for non-positive height', () => {
    expect(() => bmiCalculation(70, 0, 'male')).toThrow();
  });
});

// ─── eGFR — Cockcroft-Gault ───────────────────────────────────────────────────

describe('egfrCockcroftGault', () => {
  /**
   * Male, 50y, 70 kg, sCr 1.0 mg/dL:
   * eGFR = (140-50) × 70 × 1.0 / (72 × 1.0) = 6300/72 = 87.5 mL/min → G2
   */
  it('male 50y 70kg sCr=1.0 → ~87.5 mL/min', () => {
    const r = egfrCockcroftGault(50, 70, 1.0, 'male');
    expect(r.egfrMlMin).toBeCloseTo(87.5, 0);
    expect(r.ckdStage).toBe('G2');
  });

  it('female multiplier 0.85 applied', () => {
    const male   = egfrCockcroftGault(50, 70, 1.0, 'male');
    const female = egfrCockcroftGault(50, 70, 1.0, 'female');
    expect(female.egfrMlMin).toBeCloseTo(male.egfrMlMin * 0.85, 0);
  });

  it('sCr=2.5 → eGFR halved vs sCr=1.25 (linear relationship)', () => {
    const low  = egfrCockcroftGault(60, 70, 1.25, 'male');
    const high = egfrCockcroftGault(60, 70, 2.50, 'male');
    expect(low.egfrMlMin).toBeCloseTo(high.egfrMlMin * 2, 0);
  });

  it('eGFR ≥ 90 → CKD stage G1', () => {
    const r = egfrCockcroftGault(30, 80, 0.8, 'male');
    expect(r.ckdStage).toBe('G1');
  });

  it('eGFR < 15 → CKD stage G5', () => {
    const r = egfrCockcroftGault(75, 60, 5.0, 'female');
    expect(r.ckdStage).toBe('G5');
  });

  it('throws for invalid age', () => {
    expect(() => egfrCockcroftGault(0, 70, 1.0, 'male')).toThrow();
  });

  it('throws for zero creatinine', () => {
    expect(() => egfrCockcroftGault(50, 70, 0, 'male')).toThrow();
  });
});

// ─── One-Compartment PK ───────────────────────────────────────────────────────

describe('oneCompartmentPK', () => {
  /**
   * Gentamicin-like: dose=240mg, Vd=0.3 L/kg, CL=6 L/h, wt=80kg, τ=24h
   * Vd = 0.3×80 = 24 L
   * ke = 6/24 = 0.25 h⁻¹
   * t½ = 0.693/0.25 = 2.77 h
   * Cpeak = 240/24 = 10 mg/L
   * Ctrough = 10 × e^(-0.25×24) = 10 × e^(-6) ≈ 0.0025 mg/L
   */
  it('ke = CL / Vd', () => {
    const r = oneCompartmentPK({ doseMg: 240, vdLPerKg: 0.3, clearanceLPerH: 6, weightKg: 80, intervalH: 24 });
    expect(r.keH).toBeCloseTo(6 / (0.3 * 80), 3);
  });

  it('Cpeak = dose / Vd', () => {
    const r = oneCompartmentPK({ doseMg: 240, vdLPerKg: 0.3, clearanceLPerH: 6, weightKg: 80, intervalH: 24 });
    expect(r.cpeakMgL).toBeCloseTo(240 / 24, 2);
  });

  it('t½ = ln(2) / ke', () => {
    const r = oneCompartmentPK({ doseMg: 240, vdLPerKg: 0.3, clearanceLPerH: 6, weightKg: 80, intervalH: 24 });
    expect(r.halfLifeH).toBeCloseTo(Math.log(2) / r.keH, 1);
  });

  it('Ctrough < Cpeak', () => {
    const r = oneCompartmentPK({ doseMg: 500, vdLPerKg: 0.5, clearanceLPerH: 4, weightKg: 70, intervalH: 12 });
    expect(r.ctroughMgL).toBeLessThan(r.cpeakMgL);
  });

  it('Ctrough = Cpeak × exp(-ke × τ)', () => {
    const r = oneCompartmentPK({ doseMg: 240, vdLPerKg: 0.3, clearanceLPerH: 6, weightKg: 80, intervalH: 24 });
    const expected = r.cpeakMgL * Math.exp(-r.keH * 24);
    expect(r.ctroughMgL).toBeCloseTo(expected, 3);
  });

  it('shorter interval → higher trough', () => {
    const long  = oneCompartmentPK({ doseMg: 240, vdLPerKg: 0.3, clearanceLPerH: 3, weightKg: 80, intervalH: 24 });
    const short = oneCompartmentPK({ doseMg: 240, vdLPerKg: 0.3, clearanceLPerH: 3, weightKg: 80, intervalH: 8 });
    expect(short.ctroughMgL).toBeGreaterThan(long.ctroughMgL);
  });

  it('throws for non-positive dose', () => {
    expect(() => oneCompartmentPK({ doseMg: 0, vdLPerKg: 0.3, clearanceLPerH: 6, weightKg: 80, intervalH: 24 })).toThrow();
  });
});

// ─── NEWS2 Score ──────────────────────────────────────────────────────────────

describe('news2Score', () => {
  const normal = {
    respiratoryRate: 16, spo2Pct: 97, supplementalOxygen: false,
    systolicBP: 130, heartRate: 75, avpu: 'A' as const, temperatureC: 37.2,
  };

  it('all-normal parameters → score 0 and low risk', () => {
    const r = news2Score(normal);
    expect(r.totalScore).toBe(0);
    expect(r.risk).toBe('low');
  });

  it('supplemental O2 adds 2 points', () => {
    const r = news2Score({ ...normal, supplementalOxygen: true });
    expect(r.subscores.supplementalO2).toBe(2);
  });

  it('RR ≤ 8 scores 3', () => {
    const r = news2Score({ ...normal, respiratoryRate: 7 });
    expect(r.subscores.respiratoryRate).toBe(3);
  });

  it('RR 21-24 scores 2', () => {
    const r = news2Score({ ...normal, respiratoryRate: 22 });
    expect(r.subscores.respiratoryRate).toBe(2);
  });

  it('SpO2 ≤ 91 scores 3', () => {
    const r = news2Score({ ...normal, spo2Pct: 88 });
    expect(r.subscores.spo2).toBe(3);
  });

  it('AVPU not-A scores 3', () => {
    const r = news2Score({ ...normal, avpu: 'V' });
    expect(r.subscores.avpu).toBe(3);
  });

  it('high NEWS2 → high risk', () => {
    const sick = {
      respiratoryRate: 28, spo2Pct: 88, supplementalOxygen: true,
      systolicBP: 85, heartRate: 130, avpu: 'P' as const, temperatureC: 39.5,
    };
    const r = news2Score(sick);
    expect(r.totalScore).toBeGreaterThanOrEqual(7);
    expect(r.risk).toBe('high');
  });

  it('monitoringFrequency is non-empty string', () => {
    const r = news2Score(normal);
    expect(typeof r.monitoringFrequency).toBe('string');
    expect(r.monitoringFrequency.length).toBeGreaterThan(0);
  });
});

// ─── Parkland Formula ─────────────────────────────────────────────────────────

describe('parklandFormula', () => {
  /**
   * 70 kg patient, 40% TBSA burn:
   * Total = 4 × 70 × 40 = 11 200 mL
   * First 8h = 5 600 mL → 700 mL/h
   * Next 16h = 5 600 mL
   */
  it('totalFluidMl = 4 × weight × TBSA', () => {
    const r = parklandFormula(70, 40);
    expect(r.totalFluidMl).toBe(4 * 70 * 40);
  });

  it('first8hMl = totalFluidMl / 2', () => {
    const r = parklandFormula(70, 40);
    expect(r.first8hMl).toBe(r.totalFluidMl / 2);
  });

  it('hourlyRateFirst8h = first8hMl / 8', () => {
    const r = parklandFormula(70, 40);
    expect(r.hourlyRateFirst8h).toBe(Math.round(r.first8hMl / 8));
  });

  it('first8hMl + next16hMl = totalFluidMl', () => {
    const r = parklandFormula(80, 25);
    expect(r.first8hMl + r.next16hMl).toBe(r.totalFluidMl);
  });

  it('larger weight → more fluid', () => {
    const light = parklandFormula(60, 30);
    const heavy = parklandFormula(100, 30);
    expect(heavy.totalFluidMl).toBeGreaterThan(light.totalFluidMl);
  });

  it('throws for non-positive weight', () => {
    expect(() => parklandFormula(0, 30)).toThrow();
  });

  it('throws for TBSA > 100', () => {
    expect(() => parklandFormula(70, 101)).toThrow();
  });
});

// ─── Framingham Risk ──────────────────────────────────────────────────────────

describe('framinghamRisk', () => {
  const base = {
    ageYears: 45, sex: 'male' as const,
    totalCholMgDl: 200, hdlCholMgDl: 50,
    systolicBP: 120, bpTreated: false,
    smoker: false, diabetic: false,
  };

  it('young healthy male → low risk', () => {
    const r = framinghamRisk({ ...base, ageYears: 35 });
    expect(r.riskCategory).toBe('low');
    expect(r.tenYearRiskPct).toBeLessThan(10);
  });

  it('older + smoking + DM + high TC → higher risk', () => {
    const r = framinghamRisk({
      ...base, ageYears: 65, smoker: true, diabetic: true,
      totalCholMgDl: 280, hdlCholMgDl: 35, systolicBP: 160, bpTreated: true,
    });
    expect(r.tenYearRiskPct).toBeGreaterThan(framinghamRisk(base).tenYearRiskPct);
  });

  it('smoking increases risk vs non-smoker', () => {
    const noSmoke = framinghamRisk(base);
    const smoke   = framinghamRisk({ ...base, smoker: true });
    expect(smoke.tenYearRiskPct).toBeGreaterThanOrEqual(noSmoke.tenYearRiskPct);
  });

  it('tenYearRiskPct in (0, 100)', () => {
    const r = framinghamRisk(base);
    expect(r.tenYearRiskPct).toBeGreaterThan(0);
    expect(r.tenYearRiskPct).toBeLessThan(100);
  });

  it('throws for age outside [20, 79]', () => {
    expect(() => framinghamRisk({ ...base, ageYears: 15 })).toThrow();
  });
});

// ─── Receipt ─────────────────────────────────────────────────────────────────

describe('buildMedicalReceipt', () => {
  it('plugin=medical and CAEL event correct', () => {
    const receipt = buildMedicalReceipt({ converged: true });
    expect(receipt.plugin).toBe('medical');
    expect(receipt.cael.event).toBe('medical.clinical_analysis');
    expect(receipt.payloadHash).toBeTruthy();
  });

  it('accepted=true for healthy patient', () => {
    const bmi = bmiCalculation(70, 175, 'male');
    const egfr = egfrCockcroftGault(40, 70, 0.9, 'male');
    const news2 = news2Score({
      respiratoryRate: 16, spo2Pct: 98, supplementalOxygen: false,
      systolicBP: 125, heartRate: 70, avpu: 'A', temperatureC: 37.0,
    });
    expect(bmi.category).toBe('normal');
    expect(['G1', 'G2']).toContain(egfr.ckdStage);
    expect(news2.risk).toBe('low');
    const receipt = buildMedicalReceipt({ bmi, egfr, news2, converged: true });
    expect(receipt.acceptance.accepted).toBe(true);
  });

  it('accepted=false for obese-III BMI', () => {
    const bmi = bmiCalculation(130, 165, 'female');
    expect(bmi.category).toBe('obese-III');
    const receipt = buildMedicalReceipt({ bmi, converged: true });
    expect(receipt.acceptance.accepted).toBe(false);
    expect(receipt.acceptance.violations.length).toBeGreaterThan(0);
  });

  it('accepted=false for CKD G5', () => {
    const egfr = egfrCockcroftGault(75, 55, 5.5, 'female');
    expect(egfr.ckdStage).toBe('G5');
    const receipt = buildMedicalReceipt({ egfr, converged: true });
    expect(receipt.acceptance.accepted).toBe(false);
  });

  it('accepted=false for high NEWS2', () => {
    const news2 = news2Score({
      respiratoryRate: 28, spo2Pct: 88, supplementalOxygen: true,
      systolicBP: 85, heartRate: 130, avpu: 'P', temperatureC: 39.8,
    });
    expect(news2.risk).toBe('high');
    const receipt = buildMedicalReceipt({ news2, converged: true });
    expect(receipt.acceptance.accepted).toBe(false);
  });

  it('uses provided runId', () => {
    const receipt = buildMedicalReceipt({ converged: true }, { runId: 'med-ward-42' });
    expect(receipt.runId).toBe('med-ward-42');
  });
});
