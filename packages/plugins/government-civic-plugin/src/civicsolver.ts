/**
 * Government & civic analytics solvers — government-civic-plugin
 *
 * Implements:
 *  - Permit scoring (weighted compliance criteria)
 *  - MCDA (Multi-Criteria Decision Analysis) — weighted sum + TOPSIS
 *  - Quorum calculator (simple majority, supermajority, absolute)
 *  - Legislative voting cohesion (Rice index)
 *  - Polsby-Popper compactness score (electoral district)
 *  - Budget variance analysis
 *  - Population-weighted equity index (Gini coefficient on service access)
 *
 * References:
 *  - Polsby D, Popper R (1991) 9 Yale L. & Pol'y Rev. 301 — compactness
 *  - Rice S (1928) Am. J. Sociology 33:688-708 — cohesion index
 *  - Hwang C, Yoon K (1981) Multiple Attribute Decision Making — TOPSIS
 *  - US Municipal Budget Variance Standards (GFOA)
 */

import { buildDomainSimulationReceipt, type DomainSimulationReceipt } from '@holoscript/core';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PermitCriteria {
  name: string;
  weight: number;  // sum of all weights should be 1.0
  score: number;   // 0–100
}

export interface PermitScoringResult {
  /** Weighted composite score 0–100 */
  compositeScore: number;
  /** Pass/fail threshold (default 70) */
  approved: boolean;
  /** Per-criterion breakdown */
  breakdown: Array<{ name: string; score: number; weight: number; contribution: number }>;
  /** Threshold applied */
  threshold: number;
}

export interface MCDACandidate {
  id: string;
  /** Criterion scores (must align with MCDACriterion array) */
  scores: number[];
}

export interface MCDACriterion {
  name: string;
  weight: number;  // 0–1
  /** true = higher is better (benefit), false = lower is better (cost) */
  isBenefit: boolean;
}

export interface MCDAResult {
  /** Ranked candidates with scores */
  ranking: Array<{
    id: string;
    weightedScore: number;
    topsisScore: number;
    rank: number;
  }>;
  /** Best candidate id by TOPSIS */
  winner: string;
}

export type QuorumType = 'simple' | 'supermajority' | 'absolute';

export interface QuorumResult {
  totalMembers: number;
  presentMembers: number;
  yesVotes: number;
  noVotes: number;
  abstentions: number;
  quorumMet: boolean;
  passThreshold: number;
  motionPassed: boolean;
  marginVotes: number;
}

export interface VotingRecord {
  memberId: string;
  partyId: string;
  vote: 'yes' | 'no' | 'abstain';
}

export interface CohesionResult {
  /** Overall chamber Rice index (0=perfect split, 1=unanimous) */
  chamberCohesion: number;
  /** Per-party Rice cohesion */
  partyCohesion: Array<{ partyId: string; cohesion: number; yesCount: number; noCount: number; size: number }>;
  /** Winning coalition */
  majority: 'yes' | 'no' | 'tie';
}

export interface PolsbyPopperResult {
  /** District area (sq km or any consistent unit) */
  areaSqKm: number;
  /** District perimeter (same unit as area sqrt) */
  perimeterKm: number;
  /** Polsby-Popper score = 4π × area / perimeter² ∈ (0,1] */
  compactnessScore: number;
  /** Qualitative classification */
  classification: 'compact' | 'moderate' | 'gerrymandered';
}

export interface BudgetLine {
  category: string;
  budgeted: number;
  actual: number;
}

export interface BudgetVarianceResult {
  lines: Array<{
    category: string;
    budgeted: number;
    actual: number;
    variance: number;
    variancePct: number;
    status: 'favorable' | 'unfavorable' | 'on-target';
  }>;
  totalBudgeted: number;
  totalActual: number;
  totalVariancePct: number;
  overallStatus: 'favorable' | 'unfavorable' | 'on-target';
  flaggedLines: string[];  // categories with variance > 10%
}

export interface GovtReceiptOptions {
  runId?: string;
}

// ─── Permit Scoring ───────────────────────────────────────────────────────────

export function permitScoring(
  criteria: PermitCriteria[],
  threshold = 70,
): PermitScoringResult {
  if (criteria.length === 0) throw new Error('No permit criteria provided');
  const totalWeight = criteria.reduce((s, c) => s + c.weight, 0);
  if (Math.abs(totalWeight - 1.0) > 0.01) throw new Error(`Weights must sum to 1.0 (got ${totalWeight.toFixed(3)})`);

  const breakdown = criteria.map(c => ({
    name: c.name,
    score: c.score,
    weight: c.weight,
    contribution: c.score * c.weight,
  }));

  const compositeScore = breakdown.reduce((s, b) => s + b.contribution, 0);

  return { compositeScore, approved: compositeScore >= threshold, breakdown, threshold };
}

// ─── MCDA — Weighted Sum + TOPSIS ────────────────────────────────────────────

/** Normalize a column to [0,1] range */
function normalizeColumn(values: number[]): number[] {
  const min = Math.min(...values), max = Math.max(...values);
  if (max === min) return values.map(() => 0.5);
  return values.map(v => (v - min) / (max - min));
}

export function mcdaAnalysis(
  candidates: MCDACandidate[],
  criteria: MCDACriterion[],
): MCDAResult {
  if (candidates.length === 0) throw new Error('No MCDA candidates');
  if (criteria.length === 0) throw new Error('No MCDA criteria');
  if (candidates.some(c => c.scores.length !== criteria.length)) throw new Error('scores.length must match criteria.length');

  const n = candidates.length, m = criteria.length;

  // Weighted sum score
  const weightedScores = candidates.map(c =>
    c.scores.reduce((acc, s, j) => acc + s * criteria[j].weight * (criteria[j].isBenefit ? 1 : -1), 0),
  );

  // TOPSIS: normalize → weight → ideal/anti-ideal → distance
  const normalizedMatrix: number[][] = Array.from({ length: n }, () => Array(m).fill(0));
  for (let j = 0; j < m; j++) {
    const col = candidates.map(c => c.scores[j]);
    const norm = normalizeColumn(col);
    for (let i = 0; i < n; i++) {
      normalizedMatrix[i][j] = norm[i] * criteria[j].weight;
    }
  }

  // Ideal best/worst per criterion
  const ideal     = criteria.map((cr, j) => cr.isBenefit ? Math.max(...normalizedMatrix.map(r => r[j])) : Math.min(...normalizedMatrix.map(r => r[j])));
  const antiIdeal = criteria.map((cr, j) => cr.isBenefit ? Math.min(...normalizedMatrix.map(r => r[j])) : Math.max(...normalizedMatrix.map(r => r[j])));

  const topsisScores = normalizedMatrix.map(row => {
    const dPos = Math.sqrt(row.reduce((acc, v, j) => acc + (v - ideal[j]) ** 2, 0));
    const dNeg = Math.sqrt(row.reduce((acc, v, j) => acc + (v - antiIdeal[j]) ** 2, 0));
    return dNeg / (dPos + dNeg + 1e-15);
  });

  const ranked = candidates
    .map((c, i) => ({ id: c.id, weightedScore: weightedScores[i], topsisScore: topsisScores[i] }))
    .sort((a, b) => b.topsisScore - a.topsisScore)
    .map((r, idx) => ({ ...r, rank: idx + 1 }));

  return { ranking: ranked, winner: ranked[0].id };
}

// ─── Quorum Calculator ────────────────────────────────────────────────────────

export function quorumCalculator(
  totalMembers: number,
  presentMembers: number,
  yesVotes: number,
  noVotes: number,
  abstentions: number,
  quorumType: QuorumType = 'simple',
): QuorumResult {
  if (totalMembers < 1) throw new Error('totalMembers must be ≥ 1');
  if (presentMembers > totalMembers) throw new Error('presentMembers cannot exceed totalMembers');
  if (yesVotes + noVotes + abstentions > presentMembers) throw new Error('Votes exceed present members');

  const quorumRequired = Math.floor(totalMembers / 2) + 1; // strict majority
  const quorumMet = presentMembers >= quorumRequired;

  const passThreshold =
    quorumType === 'supermajority' ? (2 / 3) :
    quorumType === 'absolute'      ? (totalMembers / 2 + 1) / totalMembers :
    0.5; // simple majority of votes cast

  const votingBase = quorumType === 'absolute' ? totalMembers : yesVotes + noVotes;
  const motionPassed = quorumMet && votingBase > 0 && (yesVotes / votingBase) > passThreshold;
  const marginVotes = motionPassed
    ? yesVotes - Math.ceil((yesVotes + noVotes) * passThreshold)
    : Math.ceil((yesVotes + noVotes) * passThreshold) - yesVotes;

  return { totalMembers, presentMembers, yesVotes, noVotes, abstentions, quorumMet, passThreshold, motionPassed, marginVotes };
}

// ─── Voting Cohesion (Rice Index) ────────────────────────────────────────────

/**
 * Rice cohesion index for a party = |yes% - no%| (range 0–1).
 * Chamber overall = average of all non-abstain votes as one party.
 */
export function votingCohesion(votes: VotingRecord[]): CohesionResult {
  if (votes.length === 0) throw new Error('No voting records');

  const partyMap = new Map<string, { yes: number; no: number; abstain: number }>();
  for (const v of votes) {
    if (!partyMap.has(v.partyId)) partyMap.set(v.partyId, { yes: 0, no: 0, abstain: 0 });
    partyMap.get(v.partyId)![v.vote]++;
  }

  const partyCohesion = [...partyMap.entries()].map(([partyId, counts]) => {
    const total = counts.yes + counts.no;
    const cohesion = total > 0 ? Math.abs((counts.yes - counts.no) / total) : 0;
    return { partyId, cohesion, yesCount: counts.yes, noCount: counts.no, size: counts.yes + counts.no + counts.abstain };
  });

  const totalYes = votes.filter(v => v.vote === 'yes').length;
  const totalNo  = votes.filter(v => v.vote === 'no').length;
  const totalVoting = totalYes + totalNo;
  const chamberCohesion = totalVoting > 0 ? Math.abs((totalYes - totalNo) / totalVoting) : 0;

  const majority: CohesionResult['majority'] =
    totalYes > totalNo ? 'yes' :
    totalNo > totalYes ? 'no' : 'tie';

  return { chamberCohesion, partyCohesion, majority };
}

// ─── Polsby-Popper Compactness ────────────────────────────────────────────────

/**
 * Polsby-Popper score = 4π × A / P²
 * Circle → 1.0; elongated/complex shapes → toward 0.
 */
export function polsbyPopper(areaSqKm: number, perimeterKm: number): PolsbyPopperResult {
  if (areaSqKm <= 0) throw new Error('Area must be positive');
  if (perimeterKm <= 0) throw new Error('Perimeter must be positive');

  const compactnessScore = (4 * Math.PI * areaSqKm) / (perimeterKm ** 2);

  const classification: PolsbyPopperResult['classification'] =
    compactnessScore >= 0.50 ? 'compact' :
    compactnessScore >= 0.20 ? 'moderate' : 'gerrymandered';

  return { areaSqKm, perimeterKm, compactnessScore, classification };
}

// ─── Budget Variance ──────────────────────────────────────────────────────────

export function budgetVariance(
  lines: BudgetLine[],
  flagThreshold = 0.10,
): BudgetVarianceResult {
  if (lines.length === 0) throw new Error('No budget lines');

  const analyzed = lines.map(l => {
    const variance = l.actual - l.budgeted;
    const variancePct = l.budgeted !== 0 ? variance / l.budgeted : 0;
    const status: 'favorable' | 'unfavorable' | 'on-target' =
      Math.abs(variancePct) < 0.02 ? 'on-target' :
      variance < 0 ? 'favorable' : 'unfavorable';  // under-budget = favorable
    return { category: l.category, budgeted: l.budgeted, actual: l.actual, variance, variancePct, status };
  });

  const totalBudgeted = analyzed.reduce((s, l) => s + l.budgeted, 0);
  const totalActual   = analyzed.reduce((s, l) => s + l.actual,   0);
  const totalVariancePct = totalBudgeted !== 0 ? (totalActual - totalBudgeted) / totalBudgeted : 0;
  const overallStatus: BudgetVarianceResult['overallStatus'] =
    Math.abs(totalVariancePct) < 0.02 ? 'on-target' :
    totalVariancePct < 0 ? 'favorable' : 'unfavorable';

  const flaggedLines = analyzed.filter(l => Math.abs(l.variancePct) > flagThreshold).map(l => l.category);

  return { lines: analyzed, totalBudgeted, totalActual, totalVariancePct, overallStatus, flaggedLines };
}

// ─── Receipt ──────────────────────────────────────────────────────────────────

export interface GovtAnalysisResult {
  permit?: PermitScoringResult;
  mcda?: MCDAResult;
  quorum?: QuorumResult;
  cohesion?: CohesionResult;
  compactness?: PolsbyPopperResult;
  budgetVar?: BudgetVarianceResult;
  converged: true;
}

export function buildGovtReceipt(
  result: GovtAnalysisResult,
  options?: GovtReceiptOptions,
): DomainSimulationReceipt {
  const violations: Array<{ criterion: string; message: string }> = [];

  if (result.permit && !result.permit.approved) {
    violations.push({ criterion: 'permit_denied', message: `Permit score ${result.permit.compositeScore.toFixed(1)} < ${result.permit.threshold} threshold — application denied` });
  }
  if (result.quorum && !result.quorum.quorumMet) {
    violations.push({ criterion: 'no_quorum', message: `Only ${result.quorum.presentMembers}/${result.quorum.totalMembers} members present — quorum not met` });
  }
  if (result.compactness && result.compactness.classification === 'gerrymandered') {
    violations.push({ criterion: 'gerrymandering', message: `District compactness ${result.compactness.compactnessScore.toFixed(3)} < 0.20 — potential gerrymandering` });
  }
  if (result.budgetVar && result.budgetVar.overallStatus === 'unfavorable' && Math.abs(result.budgetVar.totalVariancePct) > 0.05) {
    violations.push({ criterion: 'budget_overrun', message: `Budget overrun ${(result.budgetVar.totalVariancePct * 100).toFixed(1)}% exceeds 5% threshold` });
  }

  return buildDomainSimulationReceipt({
    plugin: 'government-civic',
    pluginVersion: '1.0.0',
    runId: options?.runId ?? `gov-${Date.now().toString(36)}`,
    solverConfig: { solverType: 'civic-analytics', scale: 'municipality' },
    resultSummary: {
      permitScore: result.permit?.compositeScore,
      mcdaWinner: result.mcda?.winner,
      quorumMet: result.quorum?.quorumMet,
      chamberCohesion: result.cohesion?.chamberCohesion,
      districtCompactness: result.compactness?.compactnessScore,
      budgetVariancePct: result.budgetVar?.totalVariancePct,
    },
    cael: { version: 'cael.v1', event: 'government_civic.civic_analysis', solverType: 'government-civic.permit-scoring' },
    acceptance: { accepted: violations.length === 0, violations },
  });
}
