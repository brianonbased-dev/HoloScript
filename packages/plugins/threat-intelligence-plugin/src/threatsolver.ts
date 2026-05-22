/**
 * Threat intelligence solvers — threat-intelligence-plugin
 *
 * Implements:
 *  - CVSS v3.1 base score calculator (FIRST.org specification)
 *  - Kill chain stage probability (multiplicative model)
 *  - IOC confidence scoring (quality × freshness × corroboration)
 *  - Asset risk prioritization (CVSS × criticality weighted)
 *  - Diamond model actor scoring (capability × intent × opportunity)
 *  - Threat landscape aggregation
 *  - CAEL-ready receipt builder
 *
 * References:
 *  - FIRST CVSS v3.1 Specification (2019) https://www.first.org/cvss/v3.1/specification-document
 *  - Lockheed Martin Cyber Kill Chain (2011)
 *  - Caltagirone S, Pendergast A, Betz C (2013) The Diamond Model of Intrusion Analysis
 */

import { buildDomainSimulationReceipt, type DomainSimulationReceipt } from '@holoscript/core';

// ─── Types ────────────────────────────────────────────────────────────────────

/** CVSS v3.1 metric values */
export type AttackVector = 'N' | 'A' | 'L' | 'P';          // Network/Adjacent/Local/Physical
export type AttackComplexity = 'L' | 'H';                   // Low/High
export type PrivilegesRequired = 'N' | 'L' | 'H';          // None/Low/High
export type UserInteraction = 'N' | 'R';                    // None/Required
export type Scope = 'U' | 'C';                              // Unchanged/Changed
export type Impact = 'N' | 'L' | 'H';                      // None/Low/High

export interface CVSSv31Input {
  attackVector: AttackVector;
  attackComplexity: AttackComplexity;
  privilegesRequired: PrivilegesRequired;
  userInteraction: UserInteraction;
  scope: Scope;
  confidentialityImpact: Impact;
  integrityImpact: Impact;
  availabilityImpact: Impact;
}

export type CVSSSeverity = 'None' | 'Low' | 'Medium' | 'High' | 'Critical';

export interface CVSSResult {
  baseScore: number;
  severity: CVSSSeverity;
  /** Exploitability sub-score */
  exploitabilityScore: number;
  /** Impact sub-score */
  impactScore: number;
}

export interface KillChainStage {
  name: string;
  /** Probability of adversary success at this stage (0-1) */
  successProbability: number;
}

export interface KillChainResult {
  /** Overall attack success probability (product of all stages) */
  overallProbability: number;
  /** Weakest link stage */
  bottleneckStage: string;
  /** Stages with probability < 0.3 (defensive controls effective) */
  defendedStages: string[];
}

export interface IOCIndicator {
  type: 'ip' | 'domain' | 'hash' | 'url' | 'email';
  /** Quality of source (0-1) */
  sourceQuality: number;
  /** Days since last seen (freshness) */
  ageDays: number;
  /** Number of independent corroborating sources */
  corroboration: number;
}

export interface IOCResult {
  confidence: number;   // 0-100
  tier: 'high' | 'medium' | 'low';
  decayFactor: number;
}

export interface VulnerabilityAsset {
  assetId: string;
  cvssScore: number;
  /** Business criticality (1-5) */
  assetCriticality: number;
  /** Is it internet-exposed? */
  exposed: boolean;
}

export interface PrioritizedVuln {
  assetId: string;
  riskScore: number;
  priority: 1 | 2 | 3;  // 1=critical, 2=high, 3=normal
}

export interface DiamondModelInput {
  /** Adversary capability score (0-10) */
  capability: number;
  /** Adversary intent score (0-10) */
  intent: number;
  /** Opportunity score (0-10) — attack surface exposure */
  opportunity: number;
}

export interface ThreatReceiptOptions { runId?: string; }

export interface ThreatAnalysisResult {
  cvss?: CVSSResult;
  killChain?: KillChainResult;
  iocConfidence?: IOCResult;
  prioritizedVulns?: PrioritizedVuln[];
  converged: true;
}

// ─── CVSS v3.1 Base Score ─────────────────────────────────────────────────────

/**
 * CVSS v3.1 base score per FIRST specification:
 * ISCBase = 1 − (1−C)(1−I)(1−A)
 * Impact = Scope-U: 6.42×ISC; Scope-C: 7.52×(ISC−0.029)−3.25×(ISC−0.02)^15
 * Exploitability = 8.22 × AV × AC × PR × UI
 * Base = roundup(min((Impact + Exploitability), 10))
 */
export function cvssScore(input: CVSSv31Input): CVSSResult {
  // Metric weights per CVSS v3.1 spec
  const avW  = { N: 0.85, A: 0.62, L: 0.55, P: 0.20 }[input.attackVector];
  const acW  = { L: 0.77, H: 0.44 }[input.attackComplexity];
  const prW  = input.scope === 'C'
    ? { N: 0.85, L: 0.68, H: 0.50 }[input.privilegesRequired]
    : { N: 0.85, L: 0.62, H: 0.27 }[input.privilegesRequired];
  const uiW  = { N: 0.85, R: 0.62 }[input.userInteraction];
  const cW   = { N: 0.00, L: 0.22, H: 0.56 }[input.confidentialityImpact];
  const iW   = { N: 0.00, L: 0.22, H: 0.56 }[input.integrityImpact];
  const aW   = { N: 0.00, L: 0.22, H: 0.56 }[input.availabilityImpact];

  const iscBase = 1 - (1 - cW) * (1 - iW) * (1 - aW);

  let impactScore: number;
  if (input.scope === 'U') {
    impactScore = 6.42 * iscBase;
  } else {
    impactScore = 7.52 * (iscBase - 0.029) - 3.25 * Math.pow(iscBase - 0.02, 15);
  }

  const exploitabilityScore = 8.22 * avW * acW * prW * uiW;

  let baseScore = 0;
  if (impactScore > 0) {
    const raw = input.scope === 'U'
      ? Math.min(impactScore + exploitabilityScore, 10)
      : Math.min(1.08 * (impactScore + exploitabilityScore), 10);
    // CVSS roundup: ceiling to 1 decimal
    baseScore = Math.ceil(raw * 10) / 10;
  }

  let severity: CVSSSeverity;
  if (baseScore === 0)      severity = 'None';
  else if (baseScore < 4.0) severity = 'Low';
  else if (baseScore < 7.0) severity = 'Medium';
  else if (baseScore < 9.0) severity = 'High';
  else                      severity = 'Critical';

  return { baseScore, severity, exploitabilityScore: Math.round(exploitabilityScore * 10) / 10, impactScore: Math.round(impactScore * 10) / 10 };
}

// ─── Kill Chain Analysis ──────────────────────────────────────────────────────

/**
 * Multiplicative model: overall = Π p_i
 * Bottleneck = stage with lowest p_i
 */
export function killChainAnalysis(stages: KillChainStage[]): KillChainResult {
  if (stages.length === 0) throw new Error('No kill chain stages');

  const overallProbability = stages.reduce((p, s) => p * s.successProbability, 1);
  const minStage = stages.reduce((a, b) => a.successProbability < b.successProbability ? a : b);
  const defendedStages = stages.filter(s => s.successProbability < 0.30).map(s => s.name);

  return { overallProbability, bottleneckStage: minStage.name, defendedStages };
}

// ─── IOC Confidence ───────────────────────────────────────────────────────────

/**
 * confidence = sourceQuality × decayFactor × corroborationBonus
 * decayFactor = exp(-λ × ageDays), λ calibrated for 50% decay at 30 days
 * corroborationBonus = min(1, 0.5 + 0.15 × corroboration)
 */
export function iocConfidence(indicator: IOCIndicator): IOCResult {
  const lambda = Math.log(2) / 30; // half-life 30 days
  const decayFactor = Math.exp(-lambda * indicator.ageDays);
  const corroborationBonus = Math.min(1, 0.5 + 0.15 * indicator.corroboration);
  const confidence = Math.round(Math.min(100, indicator.sourceQuality * decayFactor * corroborationBonus * 100));

  const tier: IOCResult['tier'] = confidence >= 70 ? 'high' : confidence >= 40 ? 'medium' : 'low';
  return { confidence, tier, decayFactor };
}

// ─── Vulnerability Prioritization ────────────────────────────────────────────

/**
 * riskScore = cvssScore × criticality × exposureMultiplier
 * Priority 1 (critical): riskScore ≥ 30 or CVSS ≥ 9.0 and exposed
 */
export function vulnerabilityPrioritization(vulns: VulnerabilityAsset[]): PrioritizedVuln[] {
  if (vulns.length === 0) throw new Error('No vulnerabilities to prioritize');

  return vulns
    .map(v => {
      const exposureMultiplier = v.exposed ? 1.5 : 1.0;
      const riskScore = v.cvssScore * v.assetCriticality * exposureMultiplier;
      let priority: 1 | 2 | 3;
      // Priority 1: riskScore ≥ 50 OR critical CVSS on an exposed asset
      // Priority 2: riskScore ≥ 20 (elevated but not critical)
      // Priority 3: everything else
      if (riskScore >= 50 || (v.cvssScore >= 9.0 && v.exposed)) priority = 1;
      else if (riskScore >= 20) priority = 2;
      else priority = 3;
      return { assetId: v.assetId, riskScore: Math.round(riskScore * 10) / 10, priority };
    })
    .sort((a, b) => b.riskScore - a.riskScore);
}

// ─── Diamond Model ────────────────────────────────────────────────────────────

/**
 * Threat actor score = geometric mean of capability, intent, opportunity (normalised 0-10)
 */
export function diamondModelScore(input: DiamondModelInput): {
  threatScore: number;
  classification: 'nation-state' | 'organized-crime' | 'hacktivist' | 'script-kiddie';
} {
  for (const [k, v] of Object.entries(input)) {
    if (v < 0 || v > 10) throw new Error(`${k} must be in [0, 10]`);
  }
  const threatScore = +(Math.pow(input.capability * input.intent * input.opportunity, 1 / 3)).toFixed(2);

  let classification: ReturnType<typeof diamondModelScore>['classification'];
  if (threatScore >= 8 && input.capability >= 8) classification = 'nation-state';
  else if (threatScore >= 6) classification = 'organized-crime';
  else if (input.intent >= 7 && input.capability < 5) classification = 'hacktivist';
  else classification = 'script-kiddie';

  return { threatScore, classification };
}

// ─── Receipt ──────────────────────────────────────────────────────────────────

export function buildThreatReceipt(
  result: ThreatAnalysisResult,
  options?: ThreatReceiptOptions,
): DomainSimulationReceipt {
  const violations: Array<{ criterion: string; message: string }> = [];

  if (result.cvss && result.cvss.baseScore >= 9.0) {
    violations.push({ criterion: 'critical_cve', message: `CVSS ${result.cvss.baseScore} — Critical severity; immediate patching required` });
  } else if (result.cvss && result.cvss.baseScore >= 7.0) {
    violations.push({ criterion: 'high_cve', message: `CVSS ${result.cvss.baseScore} — High severity; patch within 7 days` });
  }
  if (result.killChain && result.killChain.overallProbability > 0.20) {
    violations.push({ criterion: 'kill_chain', message: `Attack success probability ${(result.killChain.overallProbability * 100).toFixed(1)}% exceeds 20% threshold` });
  }
  if (result.prioritizedVulns && result.prioritizedVulns.some(v => v.priority === 1)) {
    const p1 = result.prioritizedVulns.filter(v => v.priority === 1).length;
    violations.push({ criterion: 'critical_vulns', message: `${p1} critical-priority vulnerability/vulnerabilities require immediate remediation` });
  }

  return buildDomainSimulationReceipt({
    plugin: 'threat-intelligence',
    pluginVersion: '1.0.0',
    runId: options?.runId ?? `ti-${Date.now().toString(36)}`,
    solverConfig: { solverType: 'threat-intelligence.threat-analysis', scale: 'enterprise' },
    resultSummary: {
      cvssScore: result.cvss?.baseScore ?? null,
      cvssSeverity: result.cvss?.severity ?? null,
      killChainProbability: result.killChain?.overallProbability ?? null,
      criticalVulns: result.prioritizedVulns?.filter(v => v.priority === 1).length ?? null,
    },
    cael: { version: 'cael.v1', event: 'threat_intelligence.threat_analysis', solverType: 'threat-intelligence.cvss-v31' },
    acceptance: { accepted: violations.length === 0, violations },
  });
}
