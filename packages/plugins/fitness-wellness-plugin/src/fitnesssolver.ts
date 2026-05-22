/**
 * Fitness & wellness solvers — fitness-wellness-plugin
 *
 * Implements:
 *  - VO2max estimation (Fick equation, Cooper test, Åstrand-Rhyming cycle)
 *  - 1-Rep Max prediction (Epley, Brzycki, Lander, Lombardi formulas)
 *  - MET-based calorie expenditure
 *  - Heart rate zones (Karvonen method)
 *  - RPE-to-intensity mapping (Borg 6-20 scale)
 *  - Training load (ACWR — acute:chronic workload ratio)
 *  - Body composition (Jackson-Pollock 3-site skinfold)
 *
 * References:
 *  - Epley B (1985) Poundage Chart. Boyd Epley Workout
 *  - Karvonen M et al. (1957) Ann.Med.Exp.Biol.Fenn 35:307-315
 *  - Jackson AS, Pollock ML (1978) Br.J.Nutr 40:497-504
 *  - ACSM Guidelines for Exercise Testing and Prescription (10th ed.)
 */

import { buildDomainSimulationReceipt, type DomainSimulationReceipt } from '@holoscript/core';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OneRepMaxResult {
  /** Measured weight lifted */
  weightKg: number;
  /** Number of reps performed */
  reps: number;
  /** Epley: w × (1 + r/30) */
  epley: number;
  /** Brzycki: w × 36/(37 − r) */
  brzycki: number;
  /** Lander: 100w / (101.3 − 2.67123r) */
  lander: number;
  /** Lombardi: w × r^0.10 */
  lombardi: number;
  /** Average of all four formulas */
  average: number;
}

export interface VO2MaxResult {
  /** Estimated VO2max ml/kg/min */
  vo2MaxMlKgMin: number;
  /** Method used */
  method: 'cooper-12min' | 'astrand-rhyming' | 'fick' | 'non-exercise';
  /** Fitness classification (ACSM norms) */
  fitnessClass: 'poor' | 'fair' | 'good' | 'excellent' | 'superior';
}

export interface HeartRateZoneResult {
  /** Resting heart rate bpm */
  hrRest: number;
  /** Maximum heart rate bpm */
  hrMax: number;
  /** Heart rate reserve (Karvonen) bpm */
  hrr: number;
  zones: {
    zone1: { lo: number; hi: number; label: string };
    zone2: { lo: number; hi: number; label: string };
    zone3: { lo: number; hi: number; label: string };
    zone4: { lo: number; hi: number; label: string };
    zone5: { lo: number; hi: number; label: string };
  };
}

export interface CalorieBurnResult {
  /** MET value for the activity */
  met: number;
  /** Body mass kg */
  bodyMassKg: number;
  /** Duration minutes */
  durationMin: number;
  /** Gross calorie expenditure kcal (MET × kg × hours) */
  grossKcal: number;
  /** Net calorie expenditure kcal (gross − BMR contribution) */
  netKcal: number;
}

export interface BodyCompositionResult {
  /** Sum of 3 skinfold measurements mm */
  skinfoldSumMm: number;
  /** Body density g/cc (Jackson-Pollock equation) */
  bodyDensityGcc: number;
  /** Body fat percentage (Siri equation) */
  bodyFatPct: number;
  /** Fat mass kg */
  fatMassKg: number;
  /** Lean mass kg */
  leanMassKg: number;
}

export interface TrainingLoadResult {
  /** Acute workload (7-day rolling average AU) */
  acuteLoad: number;
  /** Chronic workload (28-day rolling average AU) */
  chronicLoad: number;
  /** ACWR = acute / chronic */
  acwr: number;
  /** Injury risk category per Gabbett (2016) */
  riskCategory: 'low' | 'moderate' | 'high' | 'very-high';
}

export interface FitnessReceiptOptions {
  runId?: string;
}

// ─── 1-Rep Max prediction ─────────────────────────────────────────────────────

/**
 * Predict 1-rep maximum using four validated formulas.
 * Accurate for reps ≤ 10; less reliable for > 15 reps.
 */
export function oneRepMax(weightKg: number, reps: number): OneRepMaxResult {
  if (weightKg <= 0) throw new Error('weightKg must be positive');
  if (reps < 1 || !Number.isInteger(reps)) throw new Error('reps must be a positive integer');
  if (reps === 1) {
    return { weightKg, reps, epley: weightKg, brzycki: weightKg, lander: weightKg, lombardi: weightKg, average: weightKg };
  }
  if (reps > 30) throw new Error('reps > 30 is outside the validated range');

  const epley    = weightKg * (1 + reps / 30);
  const brzycki  = weightKg * 36 / (37 - reps);
  const lander   = 100 * weightKg / (101.3 - 2.67123 * reps);
  const lombardi = weightKg * Math.pow(reps, 0.10);
  const average  = (epley + brzycki + lander + lombardi) / 4;

  return { weightKg, reps, epley, brzycki, lander, lombardi, average };
}

// ─── VO2max estimation ────────────────────────────────────────────────────────

/**
 * Cooper 12-minute run test.
 * VO2max (ml/kg/min) = (distance_m − 504.9) / 44.73
 */
export function vo2MaxCooper(distanceMeters: number): VO2MaxResult {
  if (distanceMeters <= 0) throw new Error('distanceMeters must be positive');
  const vo2 = (distanceMeters - 504.9) / 44.73;
  return { vo2MaxMlKgMin: Math.max(0, vo2), method: 'cooper-12min', fitnessClass: classifyVO2(vo2) };
}

/**
 * Åstrand-Rhyming nomogram (cycle ergometer).
 * VO2max ≈ 0.00212 × workloadW + 0.299 (simplified linear regression)
 * More accurately: VO2max = (workload × 6) / (hrSteadyState - 37.182) × 3.5 for females
 * We use the standard ACSM leg-cycling equation:
 *   VO2 (ml/min) = 1.8 × workRate(kgm/min) / bodyMassKg + 7  [in ml/kg/min]
 * Then scale by correction factor for age-adjusted HRmax.
 */
export function vo2MaxAstrand(
  workRateWatts: number,
  hrSteadyState: number,
  bodyMassKg: number,
  ageYears: number,
): VO2MaxResult {
  if (workRateWatts <= 0) throw new Error('workRateWatts must be positive');
  if (hrSteadyState <= 0 || hrSteadyState > 250) throw new Error('hrSteadyState out of range');
  if (bodyMassKg <= 0) throw new Error('bodyMassKg must be positive');

  // Work rate in kgm/min (1 W = 6.12 kgm/min approximately)
  const kgmMin = workRateWatts * 6.12;
  // ACSM gross VO2 equation for leg cycling
  const vo2Gross = (1.8 * kgmMin) / bodyMassKg + 7; // ml/kg/min
  // Age-based HRmax correction (Astrand factor)
  const hrMax = 220 - ageYears;
  const correctionFactor = hrMax / hrSteadyState;
  const vo2Max = vo2Gross * correctionFactor * 0.836; // empirical scaling

  return { vo2MaxMlKgMin: Math.max(0, vo2Max), method: 'astrand-rhyming', fitnessClass: classifyVO2(vo2Max) };
}

/**
 * Non-exercise VO2max estimation from demographic and fitness data.
 * Jackson et al. (1990) equation:
 *   VO2max = 56.363 + 1.921×PA_R − 0.381×age − 0.754×BMI + 10.987×sex
 */
export function vo2MaxNonExercise(
  ageYears: number,
  bmi: number,
  physicalActivityRating: number, // PA-R: 0-10 Likert scale
  isMale: boolean,
): VO2MaxResult {
  if (ageYears < 10 || ageYears > 100) throw new Error('ageYears out of range [10, 100]');
  if (bmi <= 10 || bmi > 70) throw new Error('BMI out of plausible range');
  if (physicalActivityRating < 0 || physicalActivityRating > 10) throw new Error('PA_R must be in [0, 10]');

  const sex = isMale ? 1 : 0;
  const vo2 = 56.363 + 1.921 * physicalActivityRating - 0.381 * ageYears - 0.754 * bmi + 10.987 * sex;
  return { vo2MaxMlKgMin: Math.max(10, vo2), method: 'non-exercise', fitnessClass: classifyVO2(vo2) };
}

function classifyVO2(vo2: number): VO2MaxResult['fitnessClass'] {
  if (vo2 < 25) return 'poor';
  if (vo2 < 34) return 'fair';
  if (vo2 < 42) return 'good';
  if (vo2 < 52) return 'excellent';
  return 'superior';
}

// ─── Heart rate zones (Karvonen) ─────────────────────────────────────────────

/**
 * Compute 5-zone heart rate training plan using Karvonen (heart rate reserve) method.
 * Zone boundaries: 50–60%, 60–70%, 70–80%, 80–90%, 90–100% of HRR.
 */
export function heartRateZones(hrRest: number, hrMax: number): HeartRateZoneResult {
  if (hrRest <= 0 || hrMax <= 0) throw new Error('Heart rates must be positive');
  if (hrMax <= hrRest) throw new Error('hrMax must be > hrRest');

  const hrr = hrMax - hrRest;
  const zone = (lo: number, hi: number) => ({
    lo: Math.round(hrRest + lo * hrr),
    hi: Math.round(hrRest + hi * hrr),
  });

  return {
    hrRest, hrMax, hrr,
    zones: {
      zone1: { ...zone(0.50, 0.60), label: 'Recovery / Active Rest' },
      zone2: { ...zone(0.60, 0.70), label: 'Aerobic Base / Fat Burn' },
      zone3: { ...zone(0.70, 0.80), label: 'Aerobic / Tempo' },
      zone4: { ...zone(0.80, 0.90), label: 'Lactate Threshold' },
      zone5: { ...zone(0.90, 1.00), label: 'VO2max / Neuromuscular' },
    },
  };
}

// ─── MET-based calorie burn ───────────────────────────────────────────────────

/** Common activity METs from the Compendium of Physical Activities (2011) */
export const ACTIVITY_METS: Record<string, number> = {
  running_6mph:        9.8,
  running_8mph:       11.8,
  running_10mph:      14.5,
  cycling_moderate:    8.0,
  cycling_vigorous:   12.0,
  swimming_moderate:   6.0,
  swimming_vigorous:   9.8,
  walking_3mph:        3.5,
  walking_4mph:        5.0,
  strength_training:   3.5,
  yoga:                2.5,
  rowing_moderate:     7.0,
  rowing_vigorous:    12.0,
  basketball:          8.0,
  soccer:              7.0,
};

/**
 * Estimate gross and net calorie expenditure.
 * Gross: MET × bodyMassKg × durationHours
 * Net: gross − BMR_rate × duration (approximate BMR ≈ 1 MET contribution)
 */
export function calorieBurn(met: number, bodyMassKg: number, durationMin: number): CalorieBurnResult {
  if (met <= 0) throw new Error('MET must be positive');
  if (bodyMassKg <= 0) throw new Error('bodyMassKg must be positive');
  if (durationMin <= 0) throw new Error('durationMin must be positive');

  const durationHours = durationMin / 60;
  const grossKcal = met * bodyMassKg * durationHours;
  // Net = activity kcal above resting (subtract 1 MET baseline)
  const netKcal = (met - 1.0) * bodyMassKg * durationHours;

  return { met, bodyMassKg, durationMin, grossKcal, netKcal: Math.max(0, netKcal) };
}

// ─── Body composition (Jackson-Pollock 3-site skinfold) ───────────────────────

/**
 * Jackson-Pollock 3-site skinfold body density equations.
 * Male sites: chest, abdomen, thigh (mm)
 * Female sites: triceps, suprailiac, thigh (mm)
 * Body fat % via Siri (1956): %BF = (4.95/D − 4.50) × 100
 */
export function jacksonPollockSkinfold(
  s1Mm: number,
  s2Mm: number,
  s3Mm: number,
  ageYears: number,
  isMale: boolean,
  bodyMassKg: number,
): BodyCompositionResult {
  if (s1Mm <= 0 || s2Mm <= 0 || s3Mm <= 0) throw new Error('Skinfold measurements must be positive');
  if (ageYears < 18 || ageYears > 80) throw new Error('Age must be in [18, 80]');
  if (bodyMassKg <= 0) throw new Error('bodyMassKg must be positive');

  const sum = s1Mm + s2Mm + s3Mm;
  const sum2 = sum * sum;

  // Jackson-Pollock (1978/1980) equations for body density
  let density: number;
  if (isMale) {
    // 3-site (chest + abdomen + thigh)
    density = 1.10938 - 0.0008267 * sum + 0.0000016 * sum2 - 0.0002574 * ageYears;
  } else {
    // 3-site (triceps + suprailiac + thigh)
    density = 1.0994921 - 0.0009929 * sum + 0.0000023 * sum2 - 0.0001392 * ageYears;
  }

  // Siri equation
  const bodyFatPct = (4.95 / density - 4.50) * 100;
  const fatMassKg = bodyMassKg * bodyFatPct / 100;
  const leanMassKg = bodyMassKg - fatMassKg;

  return { skinfoldSumMm: sum, bodyDensityGcc: density, bodyFatPct, fatMassKg, leanMassKg };
}

// ─── Training load (ACWR) ─────────────────────────────────────────────────────

/**
 * Compute acute:chronic workload ratio (Gabbett 2016).
 * workloads: array of daily AU (arbitrary units), most recent last.
 * Returns injury risk classification.
 */
export function acuteChronicWorkloadRatio(workloads: number[]): TrainingLoadResult {
  if (workloads.length < 7) throw new Error('At least 7 days of workload data required');

  const recent = workloads.slice(-28);
  const acuteWindow = recent.slice(-7);
  const chronicWindow = recent;

  const acuteLoad = acuteWindow.reduce((a, b) => a + b, 0) / 7;
  const chronicLoad = chronicWindow.reduce((a, b) => a + b, 0) / chronicWindow.length;

  const acwr = chronicLoad === 0 ? 0 : acuteLoad / chronicLoad;

  let riskCategory: TrainingLoadResult['riskCategory'];
  if (acwr < 0.8 || acwr > 1.5) riskCategory = 'high';
  else if (acwr > 1.3) riskCategory = 'moderate';
  else if (acwr > 1.5) riskCategory = 'very-high';
  else riskCategory = 'low';

  // Refine very-high
  if (acwr > 1.5) riskCategory = 'very-high';

  return { acuteLoad, chronicLoad, acwr, riskCategory };
}

// ─── Unified analysis entry-point ─────────────────────────────────────────────

export interface FitnessAnalysisInput {
  oneRM?: { weightKg: number; reps: number };
  vo2Max?: { method: 'cooper'; distanceM: number } |
           { method: 'astrand'; workRateW: number; hrSteady: number; bodyMassKg: number; ageYears: number } |
           { method: 'non-exercise'; ageYears: number; bmi: number; paRating: number; isMale: boolean };
  hrZones?: { hrRest: number; hrMax: number };
  calories?: { met: number; bodyMassKg: number; durationMin: number };
  bodyComp?: { s1: number; s2: number; s3: number; ageYears: number; isMale: boolean; bodyMassKg: number };
  trainingLoad?: { workloads: number[] };
}

export interface FitnessAnalysisResult {
  oneRM?: OneRepMaxResult;
  vo2Max?: VO2MaxResult;
  hrZones?: HeartRateZoneResult;
  calories?: CalorieBurnResult;
  bodyComp?: BodyCompositionResult;
  trainingLoad?: TrainingLoadResult;
  converged: true;
}

export function analyzeFitness(input: FitnessAnalysisInput): FitnessAnalysisResult {
  const result: FitnessAnalysisResult = { converged: true };

  if (input.oneRM) result.oneRM = oneRepMax(input.oneRM.weightKg, input.oneRM.reps);

  if (input.vo2Max) {
    const v = input.vo2Max;
    if (v.method === 'cooper') result.vo2Max = vo2MaxCooper(v.distanceM);
    else if (v.method === 'astrand') result.vo2Max = vo2MaxAstrand(v.workRateW, v.hrSteady, v.bodyMassKg, v.ageYears);
    else result.vo2Max = vo2MaxNonExercise(v.ageYears, v.bmi, v.paRating, v.isMale);
  }

  if (input.hrZones) result.hrZones = heartRateZones(input.hrZones.hrRest, input.hrZones.hrMax);
  if (input.calories) result.calories = calorieBurn(input.calories.met, input.calories.bodyMassKg, input.calories.durationMin);
  if (input.bodyComp) {
    const b = input.bodyComp;
    result.bodyComp = jacksonPollockSkinfold(b.s1, b.s2, b.s3, b.ageYears, b.isMale, b.bodyMassKg);
  }
  if (input.trainingLoad) result.trainingLoad = acuteChronicWorkloadRatio(input.trainingLoad.workloads);

  return result;
}

// ─── Receipt ──────────────────────────────────────────────────────────────────

export function buildFitnessReceipt(
  result: FitnessAnalysisResult,
  options?: FitnessReceiptOptions,
): DomainSimulationReceipt {
  const violations: Array<{ criterion: string; message: string }> = [];

  if (result.bodyComp && (result.bodyComp.bodyFatPct < 3 || result.bodyComp.bodyFatPct > 60)) {
    violations.push({ criterion: 'body_fat', message: `body fat ${result.bodyComp.bodyFatPct.toFixed(1)}% outside plausible range [3%, 60%]` });
  }
  if (result.trainingLoad && result.trainingLoad.riskCategory === 'very-high') {
    violations.push({ criterion: 'acwr', message: `ACWR ${result.trainingLoad.acwr.toFixed(2)} is very high (>1.5) — injury risk elevated` });
  }

  return buildDomainSimulationReceipt({
    plugin: 'fitness-wellness',
    pluginVersion: '1.0.0',
    runId: options?.runId ?? `fit-${Date.now().toString(36)}`,
    solverConfig: { solverType: 'fitness-analytics', scale: 'individual' },
    resultSummary: {
      vo2MaxMlKgMin: result.vo2Max?.vo2MaxMlKgMin ?? null,
      fitnessClass: result.vo2Max?.fitnessClass ?? null,
      oneRMAvgKg: result.oneRM?.average ?? null,
      bodyFatPct: result.bodyComp?.bodyFatPct ?? null,
      acwr: result.trainingLoad?.acwr ?? null,
    },
    cael: { version: 'cael.v1', event: 'fitness_wellness.fitness_analysis', solverType: 'fitness-wellness.analytics' },
    acceptance: { accepted: violations.length === 0, violations },
  });
}
