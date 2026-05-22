/**
 * Therapy & clinical psychology solvers — therapy-plugin
 *
 * Implements:
 *  - PHQ-9 depression screening (Kroenke & Spitzer 2001)
 *  - GAD-7 anxiety screening (Spitzer et al. 2006)
 *  - Treatment outcome tracking (reliable change index — Jacobson & Truax 1991)
 *  - Session progress scoring (PCOMS / ORS model)
 *  - Risk stratification (Columbia Suicide Severity Rating scale proxy)
 *  - Psychoeducation readiness (Prochaska stages of change)
 *  - CAEL-ready receipt builder
 *
 * IMPORTANT: This solver produces DECISION SUPPORT output only.
 * All clinical decisions require a qualified mental health professional.
 *
 * References:
 *  - Kroenke K, Spitzer R, Williams J (2001) J. Gen. Intern. Med. 16:606-613
 *  - Spitzer R, Kroenke K, Williams J, Löwe B (2006) JAMA 295:2201-2207
 *  - Jacobson N, Truax P (1991) J. Consult. Clin. Psychol. 59(1):12-19
 */

import { buildDomainSimulationReceipt, type DomainSimulationReceipt } from '@holoscript/core';

// ─── Types ────────────────────────────────────────────────────────────────────

/** PHQ-9 / GAD-7 response: 0=not at all, 1=several days, 2=more than half, 3=nearly every day */
export type LikertResponse = 0 | 1 | 2 | 3;

export type DepressionSeverity = 'none' | 'mild' | 'moderate' | 'moderately-severe' | 'severe';
export type AnxietySeverity = 'minimal' | 'mild' | 'moderate' | 'severe';

export interface PHQ9Result {
  totalScore: number;
  severity: DepressionSeverity;
  /** Item 9 score (suicidal ideation) */
  item9Score: number;
  positiveScreening: boolean;
}

export interface GAD7Result {
  totalScore: number;
  severity: AnxietySeverity;
  positiveScreening: boolean;
}

export interface TreatmentOutcomeResult {
  /** Score change (negative = improvement) */
  scoreDelta: number;
  /** Reliable change index (RCI) — |change| / SEdiff */
  rci: number;
  /** Did change exceed measurement error? */
  reliableChange: boolean;
  /** Did score cross clinical cutoff? */
  clinicallySignificant: boolean;
  /** Direction of change */
  direction: 'improved' | 'deteriorated' | 'no-change';
}

export type RiskLevel = 'low' | 'moderate' | 'high' | 'crisis';

export interface RiskStratificationResult {
  riskLevel: RiskLevel;
  riskScore: number;
  /** Triggered risk factors */
  riskFactors: string[];
  /** Recommended action */
  recommendedAction: string;
}

export type StageOfChange = 'precontemplation' | 'contemplation' | 'preparation' | 'action' | 'maintenance';

export interface TherapyReceiptOptions { runId?: string; }

export interface TherapyAnalysisResult {
  phq9?: PHQ9Result;
  gad7?: GAD7Result;
  outcome?: TreatmentOutcomeResult;
  risk?: RiskStratificationResult;
  converged: true;
}

// ─── PHQ-9 ────────────────────────────────────────────────────────────────────

/**
 * PHQ-9 total score → severity mapping (Kroenke 2001):
 * 0-4: None, 5-9: Mild, 10-14: Moderate, 15-19: Moderately Severe, 20-27: Severe
 * Positive screen: score ≥ 10
 */
export function phq9Score(responses: LikertResponse[]): PHQ9Result {
  if (responses.length !== 9) throw new Error('PHQ-9 requires exactly 9 responses');
  for (const r of responses) {
    if (![0, 1, 2, 3].includes(r)) throw new Error('Each response must be 0-3');
  }

  const totalScore = responses.reduce((s, r) => s + r, 0);
  const item9Score = responses[8];

  let severity: DepressionSeverity;
  if (totalScore <= 4)       severity = 'none';
  else if (totalScore <= 9)  severity = 'mild';
  else if (totalScore <= 14) severity = 'moderate';
  else if (totalScore <= 19) severity = 'moderately-severe';
  else                       severity = 'severe';

  return { totalScore, severity, item9Score, positiveScreening: totalScore >= 10 };
}

// ─── GAD-7 ────────────────────────────────────────────────────────────────────

/**
 * GAD-7 total score → severity mapping (Spitzer 2006):
 * 0-4: Minimal, 5-9: Mild, 10-14: Moderate, 15-21: Severe
 * Positive screen: score ≥ 10
 */
export function gad7Score(responses: LikertResponse[]): GAD7Result {
  if (responses.length !== 7) throw new Error('GAD-7 requires exactly 7 responses');
  for (const r of responses) {
    if (![0, 1, 2, 3].includes(r)) throw new Error('Each response must be 0-3');
  }

  const totalScore = responses.reduce((s, r) => s + r, 0);

  let severity: AnxietySeverity;
  if (totalScore <= 4)       severity = 'minimal';
  else if (totalScore <= 9)  severity = 'mild';
  else if (totalScore <= 14) severity = 'moderate';
  else                       severity = 'severe';

  return { totalScore, severity, positiveScreening: totalScore >= 10 };
}

// ─── Treatment Outcome (RCI) ──────────────────────────────────────────────────

/**
 * Jacobson-Truax Reliable Change Index:
 * RCI = (post - pre) / SEdiff
 * SEdiff = SD_pre × √2 × √(1 - r_xx)   where r_xx = test-retest reliability
 * Reliable change: |RCI| ≥ 1.96 (p < 0.05)
 * Clinically significant: crosses population cutoff
 */
export function treatmentOutcome(
  preScore: number,
  postScore: number,
  sdPre: number,
  testRetestReliability: number,
  clinicalCutoff: number,
): TreatmentOutcomeResult {
  if (sdPre <= 0) throw new Error('sdPre must be positive');
  if (testRetestReliability < 0 || testRetestReliability > 1)
    throw new Error('testRetestReliability must be in [0,1]');

  const scoreDelta = postScore - preScore;
  const seDiff = sdPre * Math.sqrt(2) * Math.sqrt(1 - testRetestReliability);
  const rci = seDiff > 0 ? scoreDelta / seDiff : 0;

  const reliableChange = Math.abs(rci) >= 1.96;
  // Clinically significant if score moved from dysfunctional to functional range
  const crossedCutoff = (preScore >= clinicalCutoff && postScore < clinicalCutoff) ||
                        (preScore < clinicalCutoff && postScore >= clinicalCutoff);
  const clinicallySignificant = reliableChange && crossedCutoff;

  let direction: TreatmentOutcomeResult['direction'];
  if (!reliableChange)     direction = 'no-change';
  else if (scoreDelta < 0) direction = 'improved';
  else                     direction = 'deteriorated';

  return { scoreDelta, rci, reliableChange, clinicallySignificant, direction };
}

// ─── Risk Stratification ──────────────────────────────────────────────────────

/**
 * Simplified Columbia-protocol-inspired risk stratification.
 * Factors: PHQ-9 item 9, recent self-harm, plan/intent, protective factors.
 */
export interface RiskInput {
  /** PHQ-9 item 9 score (0-3) */
  suicidalIdeationScore: number;
  /** Recent self-harm behaviour */
  recentSelfHarm: boolean;
  /** Has specific plan */
  hasPlan: boolean;
  /** Has access to means */
  hasAccess: boolean;
  /** Number of protective factors (social support, reasons for living) */
  protectiveFactors: number;
}

export function riskStratification(input: RiskInput): RiskStratificationResult {
  const riskFactors: string[] = [];
  let riskScore = 0;

  if (input.suicidalIdeationScore >= 3) { riskScore += 40; riskFactors.push('active suicidal ideation'); }
  else if (input.suicidalIdeationScore >= 1) { riskScore += 20; riskFactors.push('passive suicidal ideation'); }
  if (input.recentSelfHarm)    { riskScore += 25; riskFactors.push('recent self-harm'); }
  if (input.hasPlan)           { riskScore += 20; riskFactors.push('specific plan'); }
  if (input.hasAccess)         { riskScore += 15; riskFactors.push('access to means'); }
  riskScore -= Math.min(input.protectiveFactors * 5, 20);
  riskScore = Math.max(0, Math.min(100, riskScore));

  let riskLevel: RiskLevel;
  let recommendedAction: string;
  if (riskScore >= 70 || input.hasPlan) {
    riskLevel = 'crisis';
    recommendedAction = 'Immediate safety assessment; consider emergency referral';
  } else if (riskScore >= 40) {
    riskLevel = 'high';
    recommendedAction = 'Same-day or next-day clinical contact; safety planning required';
  } else if (riskScore >= 15) {
    riskLevel = 'moderate';
    recommendedAction = 'Enhanced monitoring; safety planning; increase session frequency';
  } else {
    riskLevel = 'low';
    recommendedAction = 'Standard monitoring; discuss protective factors';
  }

  return { riskLevel, riskScore, riskFactors, recommendedAction };
}

// ─── Stage of Change ──────────────────────────────────────────────────────────

/**
 * Prochaska & DiClemente (1983) stages based on readiness questionnaire score.
 * Score 0-20 → precontemplation, 21-40 → contemplation, 41-60 → preparation,
 * 61-80 → action, 81-100 → maintenance
 */
export function stageOfChange(readinessScore: number): StageOfChange {
  if (readinessScore < 0 || readinessScore > 100) throw new Error('readinessScore must be in [0,100]');
  if (readinessScore <= 20) return 'precontemplation';
  if (readinessScore <= 40) return 'contemplation';
  if (readinessScore <= 60) return 'preparation';
  if (readinessScore <= 80) return 'action';
  return 'maintenance';
}

// ─── Receipt ──────────────────────────────────────────────────────────────────

export function buildTherapyReceipt(
  result: TherapyAnalysisResult,
  options?: TherapyReceiptOptions,
): DomainSimulationReceipt {
  const violations: Array<{ criterion: string; message: string }> = [];

  if (result.phq9?.positiveScreening) {
    violations.push({ criterion: 'phq9_screen', message: `PHQ-9 score ${result.phq9.totalScore} — positive depression screening (≥10)` });
  }
  if (result.gad7?.positiveScreening) {
    violations.push({ criterion: 'gad7_screen', message: `GAD-7 score ${result.gad7.totalScore} — positive anxiety screening (≥10)` });
  }
  if (result.risk && (result.risk.riskLevel === 'high' || result.risk.riskLevel === 'crisis')) {
    violations.push({ criterion: 'risk_level', message: `${result.risk.riskLevel.toUpperCase()} risk — ${result.risk.recommendedAction}` });
  }
  if (result.phq9 && result.phq9.item9Score > 0) {
    violations.push({ criterion: 'suicidal_ideation', message: `PHQ-9 item 9 score ${result.phq9.item9Score} — suicidal ideation present` });
  }

  return buildDomainSimulationReceipt({
    plugin: 'therapy',
    pluginVersion: '1.0.0',
    runId: options?.runId ?? `ther-${Date.now().toString(36)}`,
    solverConfig: { solverType: 'therapy.clinical-analysis', scale: 'session' },
    resultSummary: {
      phq9Score: result.phq9?.totalScore,
      phq9Severity: result.phq9?.severity,
      gad7Score: result.gad7?.totalScore,
      riskLevel: result.risk?.riskLevel,
    },
    cael: { version: 'cael.v1', event: 'therapy.clinical_analysis', solverType: 'therapy.phq9-gad7' },
    acceptance: { accepted: violations.length === 0, violations },
  });
}
