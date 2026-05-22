/**
 * Clinical medicine solvers — medical-plugin
 *
 * Implements:
 *  - BMI + body composition (DuBois BSA, Devine IBW)
 *  - Cockcroft-Gault estimated GFR (renal function)
 *  - One-compartment IV bolus pharmacokinetics (Cpeak/Ctrough/t½)
 *  - NEWS2 early warning score (Royal College of Physicians 2017)
 *  - Parkland formula (Baxter 1968) — burn fluid resuscitation
 *  - Simplified 10-year Framingham cardiovascular risk
 *  - CAEL-ready receipt builder
 *
 * References:
 *  - Cockcroft D, Gault M (1976) Nephron 16:31-41
 *  - Devine B (1974) Drug Intell Clin Pharm 8:650-655
 *  - DuBois D, DuBois E (1916) Arch Int Med 17:863-871
 *  - Royal College of Physicians (2017) NEWS2. https://www.rcplondon.ac.uk/
 *  - Baxter C (1974) Surg Clin North Am 54:1355-1365
 *
 * CLINICAL DISCLAIMER: Decision support ONLY. All outputs require
 * review by a qualified medical professional before clinical application.
 */

import { buildDomainSimulationReceipt, type DomainSimulationReceipt } from '@holoscript/core';

// ─── Types ────────────────────────────────────────────────────────────────────

export type BiologicalSex = 'male' | 'female';

export type BMICategory =
  | 'underweight'       // < 18.5
  | 'normal'            // 18.5–24.9
  | 'overweight'        // 25–29.9
  | 'obese-I'           // 30–34.9
  | 'obese-II'          // 35–39.9
  | 'obese-III';        // ≥ 40

export interface BMIResult {
  bmi: number;
  category: BMICategory;
  /** Body surface area — DuBois formula (m²) */
  bsaM2: number;
  /** Ideal body weight — Devine formula (kg) */
  ibwKg: number;
  /** Adjusted body weight for obese patients (kg) */
  adjBodyWeightKg: number;
}

export interface EGFRResult {
  /** eGFR (mL/min) — Cockcroft-Gault unadjusted */
  egfrMlMin: number;
  /** eGFR normalised per 1.73 m² BSA */
  egfrNormalized: number;
  /** CKD stage: G1-G5 */
  ckdStage: 'G1' | 'G2' | 'G3a' | 'G3b' | 'G4' | 'G5';
}

export interface PKOneCompartmentInput {
  /** Dose administered (mg) */
  doseMg: number;
  /** Volume of distribution (L/kg) — multiply by weight for Vd */
  vdLPerKg: number;
  /** Total body clearance (L/h) */
  clearanceLPerH: number;
  /** Patient weight (kg) */
  weightKg: number;
  /** Dosing interval (h) */
  intervalH: number;
}

export interface PKResult {
  /** Peak concentration immediately post-dose (mg/L) */
  cpeakMgL: number;
  /** Trough concentration at end of dosing interval (mg/L) */
  ctroughMgL: number;
  /** Elimination rate constant (h⁻¹) */
  keH: number;
  /** Elimination half-life (h) */
  halfLifeH: number;
  /** Volume of distribution (L) */
  vdL: number;
  /** Area under the curve over one interval (mg·h/L) */
  aucMgHL: number;
}

export interface NEWS2Input {
  /** Respiratory rate (breaths/min) */
  respiratoryRate: number;
  /** Oxygen saturation % */
  spo2Pct: number;
  /** On supplemental oxygen? */
  supplementalOxygen: boolean;
  /** Systolic blood pressure (mmHg) */
  systolicBP: number;
  /** Heart rate (bpm) */
  heartRate: number;
  /** Consciousness: A=alert, V=voice, P=pain, U=unresponsive */
  avpu: 'A' | 'V' | 'P' | 'U';
  /** Temperature (°C) */
  temperatureC: number;
}

export type NEWS2Risk = 'low' | 'medium' | 'high';

export interface NEWS2Result {
  totalScore: number;
  risk: NEWS2Risk;
  /** Per-parameter score breakdown */
  subscores: Record<string, number>;
  /** Recommended monitoring frequency */
  monitoringFrequency: string;
}

export interface ParklandResult {
  /** Total fluid (mL) over 24 h */
  totalFluidMl: number;
  /** First 8 h (mL) — from time of injury */
  first8hMl: number;
  /** Remaining 16 h (mL) */
  next16hMl: number;
  /** Hourly rate for first 8 h (mL/h) */
  hourlyRateFirst8h: number;
}

export interface FraminghamResult {
  /** 10-year CVD event risk (%) */
  tenYearRiskPct: number;
  riskCategory: 'low' | 'intermediate' | 'high';
}

export interface MedicalReceiptOptions { runId?: string; }

export interface MedicalAnalysisResult {
  bmi?: BMIResult;
  egfr?: EGFRResult;
  pk?: PKResult;
  news2?: NEWS2Result;
  parkland?: ParklandResult;
  framingham?: FraminghamResult;
  converged: true;
}

// ─── BMI + Body Composition ───────────────────────────────────────────────────

/**
 * BMI = weight / height²
 * BSA (DuBois): 0.007184 × height(cm)^0.725 × weight(kg)^0.425
 * IBW (Devine): male = 50 + 2.3×(inches−60); female = 45.5 + 2.3×(inches−60)
 * AdjBW = IBW + 0.4 × (actualWeight − IBW)
 */
export function bmiCalculation(
  weightKg: number,
  heightCm: number,
  sex: BiologicalSex,
): BMIResult {
  if (weightKg <= 0) throw new Error('weightKg must be positive');
  if (heightCm <= 0) throw new Error('heightCm must be positive');

  const heightM = heightCm / 100;
  const bmi = +(weightKg / (heightM ** 2)).toFixed(1);

  let category: BMICategory;
  if (bmi < 18.5)       category = 'underweight';
  else if (bmi < 25.0)  category = 'normal';
  else if (bmi < 30.0)  category = 'overweight';
  else if (bmi < 35.0)  category = 'obese-I';
  else if (bmi < 40.0)  category = 'obese-II';
  else                  category = 'obese-III';

  // DuBois BSA
  const bsaM2 = +(0.007184 * Math.pow(heightCm, 0.725) * Math.pow(weightKg, 0.425)).toFixed(3);

  // Devine IBW
  const heightInches = heightCm / 2.54;
  const inchesOver5ft = Math.max(0, heightInches - 60);
  const ibwKg = +(( sex === 'male' ? 50 : 45.5) + 2.3 * inchesOver5ft).toFixed(1);

  // Adjusted body weight (for obese patients)
  const adjBodyWeightKg = +(ibwKg + 0.4 * (weightKg - ibwKg)).toFixed(1);

  return { bmi, category, bsaM2, ibwKg, adjBodyWeightKg };
}

// ─── eGFR — Cockcroft-Gault ───────────────────────────────────────────────────

/**
 * CG eGFR = (140 − age) × weight × (0.85 if female) / (72 × serumCr)
 * Normalised: eGFR × 1.73 / BSA
 * CKD stages per KDIGO 2012: G1≥90, G2=60-89, G3a=45-59, G3b=30-44, G4=15-29, G5<15
 */
export function egfrCockcroftGault(
  ageYears: number,
  weightKg: number,
  serumCreatinineMgDl: number,
  sex: BiologicalSex,
  bsaM2?: number,
): EGFRResult {
  if (ageYears <= 0 || ageYears > 120) throw new Error('ageYears must be in (0, 120]');
  if (weightKg <= 0) throw new Error('weightKg must be positive');
  if (serumCreatinineMgDl <= 0) throw new Error('serumCreatinine must be positive');

  const sexFactor = sex === 'female' ? 0.85 : 1.0;
  const egfrMlMin = +((140 - ageYears) * weightKg * sexFactor / (72 * serumCreatinineMgDl)).toFixed(1);

  // Normalise per 1.73 m² if BSA provided
  const bsa = bsaM2 ?? 1.73;
  const egfrNormalized = +(egfrMlMin * 1.73 / bsa).toFixed(1);

  let ckdStage: EGFRResult['ckdStage'];
  if (egfrNormalized >= 90)      ckdStage = 'G1';
  else if (egfrNormalized >= 60) ckdStage = 'G2';
  else if (egfrNormalized >= 45) ckdStage = 'G3a';
  else if (egfrNormalized >= 30) ckdStage = 'G3b';
  else if (egfrNormalized >= 15) ckdStage = 'G4';
  else                           ckdStage = 'G5';

  return { egfrMlMin, egfrNormalized, ckdStage };
}

// ─── One-Compartment IV Bolus PK ─────────────────────────────────────────────

/**
 * ke = CL / Vd
 * Cpeak = dose / Vd
 * Ctrough = Cpeak × e^(-ke × τ)
 * t½ = ln(2) / ke
 * AUC = Cpeak / ke (over infinite time for one dose; one-interval AUC ≈ Cpeak × (1−e^(-ke×τ)) / ke)
 */
export function oneCompartmentPK(input: PKOneCompartmentInput): PKResult {
  if (input.doseMg <= 0) throw new Error('doseMg must be positive');
  if (input.vdLPerKg <= 0) throw new Error('vdLPerKg must be positive');
  if (input.clearanceLPerH <= 0) throw new Error('clearanceLPerH must be positive');
  if (input.weightKg <= 0) throw new Error('weightKg must be positive');
  if (input.intervalH <= 0) throw new Error('intervalH must be positive');

  const vdL = +(input.vdLPerKg * input.weightKg).toFixed(2);
  const keH = +(input.clearanceLPerH / vdL).toFixed(4);
  const halfLifeH = +(Math.log(2) / keH).toFixed(2);
  const cpeakMgL = +(input.doseMg / vdL).toFixed(3);
  const ctroughMgL = +(cpeakMgL * Math.exp(-keH * input.intervalH)).toFixed(3);
  // AUC over one dosing interval
  const aucMgHL = +(cpeakMgL * (1 - Math.exp(-keH * input.intervalH)) / keH).toFixed(2);

  return { cpeakMgL, ctroughMgL, keH, halfLifeH, vdL, aucMgHL };
}

// ─── NEWS2 Score ──────────────────────────────────────────────────────────────

/**
 * Royal College of Physicians NEWS2 scoring:
 * Each parameter scored 0-3; total = sum; risk = low/medium/high
 */
export function news2Score(input: NEWS2Input): NEWS2Result {
  const subscores: Record<string, number> = {};

  // Respiratory rate
  const rr = input.respiratoryRate;
  subscores.respiratoryRate = rr <= 8 ? 3 : rr <= 11 ? 1 : rr <= 20 ? 0 : rr <= 24 ? 2 : 3;

  // SpO2 (Scale 1 — no hypercapnic drive)
  const sp = input.spo2Pct;
  subscores.spo2 = sp <= 91 ? 3 : sp <= 93 ? 2 : sp <= 95 ? 1 : 0;

  // Supplemental O2
  subscores.supplementalO2 = input.supplementalOxygen ? 2 : 0;

  // Systolic BP
  const sbp = input.systolicBP;
  subscores.systolicBP = sbp <= 90 ? 3 : sbp <= 100 ? 2 : sbp <= 110 ? 1 : sbp <= 219 ? 0 : 3;

  // Heart rate
  const hr = input.heartRate;
  subscores.heartRate = hr <= 40 ? 3 : hr <= 50 ? 1 : hr <= 90 ? 0 : hr <= 110 ? 1 : hr <= 130 ? 2 : 3;

  // Consciousness (AVPU)
  subscores.avpu = input.avpu === 'A' ? 0 : 3;

  // Temperature
  const temp = input.temperatureC;
  subscores.temperature = temp <= 35.0 ? 3 : temp <= 36.0 ? 1 : temp <= 38.0 ? 0 : temp <= 39.0 ? 1 : 2;

  const totalScore = Object.values(subscores).reduce((s, v) => s + v, 0);

  // RCP NEWS2 protocol: score ≥ 7 → HIGH; score 5-6 or any single-parameter 3 → MEDIUM; else → LOW
  let risk: NEWS2Risk;
  let monitoringFrequency: string;
  if (totalScore >= 7) {
    risk = 'high';
    monitoringFrequency = 'Continuous monitoring; urgent clinical review';
  } else if (totalScore >= 5 || Object.values(subscores).some(v => v === 3)) {
    risk = 'medium';
    monitoringFrequency = 'Minimum 1-hourly';
  } else {
    risk = 'low';
    monitoringFrequency = 'Minimum 12-hourly';
  }

  return { totalScore, risk, subscores, monitoringFrequency };
}

// ─── Parkland Formula ─────────────────────────────────────────────────────────

/**
 * Baxter-Parkland: 4 × weight(kg) × TBSA(%)  mL / 24 h (lactated Ringer's)
 * 50 % in first 8 h from time of injury, 50 % over next 16 h.
 */
export function parklandFormula(weightKg: number, tbsaPct: number): ParklandResult {
  if (weightKg <= 0) throw new Error('weightKg must be positive');
  if (tbsaPct <= 0 || tbsaPct > 100) throw new Error('tbsaPct must be in (0, 100]');

  const totalFluidMl = Math.round(4 * weightKg * tbsaPct);
  const first8hMl    = Math.round(totalFluidMl / 2);
  const next16hMl    = totalFluidMl - first8hMl;
  const hourlyRateFirst8h = Math.round(first8hMl / 8);

  return { totalFluidMl, first8hMl, next16hMl, hourlyRateFirst8h };
}

// ─── Simplified Framingham 10-Year CVD Risk ───────────────────────────────────

/**
 * Simplified point-based approximation of Framingham (Wilson 1998 ATP-III).
 * Inputs: age, total cholesterol, HDL-C, systolic BP, BP treatment, smoking, diabetes.
 * Returns 10-year hard CVD event risk %.
 */
export function framinghamRisk(params: {
  ageYears: number;
  sex: BiologicalSex;
  totalCholMgDl: number;
  hdlCholMgDl: number;
  systolicBP: number;
  bpTreated: boolean;
  smoker: boolean;
  diabetic: boolean;
}): FraminghamResult {
  const { ageYears, sex, totalCholMgDl, hdlCholMgDl, systolicBP, bpTreated, smoker, diabetic } = params;

  if (ageYears < 20 || ageYears > 79) throw new Error('ageYears must be in [20, 79]');
  if (totalCholMgDl <= 0) throw new Error('totalCholMgDl must be positive');
  if (hdlCholMgDl <= 0) throw new Error('hdlCholMgDl must be positive');

  // ATP-III simplified point scores
  let points = 0;

  // Age points (male / female differ)
  if (sex === 'male') {
    points += ageYears < 35 ? -9 : ageYears < 40 ? -4 : ageYears < 45 ? 0
            : ageYears < 50 ? 3  : ageYears < 55 ? 6  : ageYears < 60 ? 8
            : ageYears < 65 ? 10 : ageYears < 70 ? 11 : ageYears < 75 ? 12 : 13;
  } else {
    points += ageYears < 35 ? -7 : ageYears < 40 ? -3 : ageYears < 45 ? 0
            : ageYears < 50 ? 3  : ageYears < 55 ? 6  : ageYears < 60 ? 8
            : ageYears < 65 ? 10 : ageYears < 70 ? 12 : ageYears < 75 ? 14 : 16;
  }

  // Total cholesterol points
  const tc = totalCholMgDl;
  if (sex === 'male') {
    points += tc < 160 ? -3 : tc < 200 ? 0 : tc < 240 ? 1 : tc < 280 ? 2 : 3;
  } else {
    points += tc < 160 ? -2 : tc < 200 ? 0 : tc < 240 ? 1 : tc < 280 ? 2 : 3;
  }

  // HDL points
  const hdl = hdlCholMgDl;
  points += hdl < 35 ? 2 : hdl < 45 ? 1 : hdl < 50 ? 0 : hdl < 60 ? -1 : -2;

  // Systolic BP points
  const sbp = systolicBP;
  if (!bpTreated) {
    points += sbp < 120 ? -2 : sbp < 130 ? 0 : sbp < 140 ? 1 : sbp < 160 ? 2 : 3;
  } else {
    points += sbp < 120 ? 0 : sbp < 130 ? 2 : sbp < 140 ? 3 : sbp < 160 ? 4 : 5;
  }

  // Smoking
  if (smoker) points += sex === 'male' ? 4 : 3;

  // Diabetes
  if (diabetic) points += sex === 'male' ? 3 : 4;

  // Point → % risk lookup (male; roughly same table for both genders at this simplification)
  const maleLookup: Record<number, number> = {
    [-3]: 1, [-2]: 2, [-1]: 2, 0: 3, 1: 4, 2: 4, 3: 6, 4: 7, 5: 9,
    6: 11, 7: 14, 8: 18, 9: 22, 10: 27, 11: 33, 12: 40, 13: 47,
  };
  const clampedPoints = Math.max(-3, Math.min(13, points));
  const tenYearRiskPct = maleLookup[clampedPoints] ?? (clampedPoints < -3 ? 1 : 47);

  const riskCategory: FraminghamResult['riskCategory'] =
    tenYearRiskPct < 10 ? 'low' : tenYearRiskPct < 20 ? 'intermediate' : 'high';

  return { tenYearRiskPct, riskCategory };
}

// ─── Receipt ──────────────────────────────────────────────────────────────────

export function buildMedicalReceipt(
  result: MedicalAnalysisResult,
  options?: MedicalReceiptOptions,
): DomainSimulationReceipt {
  const violations: Array<{ criterion: string; message: string }> = [];

  if (result.bmi && (result.bmi.category === 'underweight' || result.bmi.category === 'obese-III')) {
    violations.push({ criterion: 'bmi_extreme', message: `BMI ${result.bmi.bmi} (${result.bmi.category}) — clinical intervention required` });
  }
  if (result.egfr && (result.egfr.ckdStage === 'G4' || result.egfr.ckdStage === 'G5')) {
    violations.push({ criterion: 'renal_impairment', message: `eGFR ${result.egfr.egfrNormalized} mL/min/1.73m² — ${result.egfr.ckdStage} (severe); dose adjustment and nephrology review required` });
  }
  if (result.news2 && result.news2.risk === 'high') {
    violations.push({ criterion: 'news2_high', message: `NEWS2 score ${result.news2.totalScore} — HIGH risk; continuous monitoring and urgent review required` });
  } else if (result.news2 && result.news2.risk === 'medium') {
    violations.push({ criterion: 'news2_medium', message: `NEWS2 score ${result.news2.totalScore} — MEDIUM risk; increased monitoring required` });
  }
  if (result.framingham && result.framingham.riskCategory === 'high') {
    violations.push({ criterion: 'cvd_high_risk', message: `10-year CVD risk ${result.framingham.tenYearRiskPct}% — HIGH; statin + lifestyle intervention indicated` });
  }

  return buildDomainSimulationReceipt({
    plugin: 'medical',
    pluginVersion: '1.0.0',
    runId: options?.runId ?? `med-${Date.now().toString(36)}`,
    solverConfig: { solverType: 'medical.clinical-analysis', scale: 'patient' },
    resultSummary: {
      bmi: result.bmi?.bmi,
      bmiCategory: result.bmi?.category,
      egfr: result.egfr?.egfrNormalized,
      ckdStage: result.egfr?.ckdStage,
      news2Score: result.news2?.totalScore,
      news2Risk: result.news2?.risk,
      cvdRiskPct: result.framingham?.tenYearRiskPct,
    },
    cael: { version: 'cael.v1', event: 'medical.clinical_analysis', solverType: 'medical.clinical' },
    acceptance: { accepted: violations.length === 0, violations },
  });
}
