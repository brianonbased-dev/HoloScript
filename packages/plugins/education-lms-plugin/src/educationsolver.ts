/**
 * Learning analytics solvers — education-lms-plugin
 *
 * Implements:
 *  - Item Response Theory (3PL logistic model, MLE ability estimation)
 *  - SM-2 spaced repetition scheduler (Wozniak 1990)
 *  - Knowledge space prerequisite graph + mastery tracking
 *  - Grade prediction (recency-weighted moving average)
 *  - Learning path optimization (Dijkstra on prerequisite DAG)
 *  - Bloom's taxonomy classification (verb heuristic)
 *  - Quiz psychometrics (p-value, discrimination index, Cronbach's α)
 *
 * References:
 *  - Lord FM (1980) Applications of Item Response Theory. ETS.
 *  - Wozniak P (1990) Optimization of Learning. SuperMemo SM-2.
 *  - Bloom BS et al. (1956) Taxonomy of Educational Objectives.
 *  - Doignon JP, Falmagne JC (1985) Psych.Rev. 92:201-224
 */

import { buildDomainSimulationReceipt, type DomainSimulationReceipt } from '@holoscript/core';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface IRTItem {
  id: string;
  /** Discrimination parameter a > 0 (default 1.0) */
  a?: number;
  /** Difficulty parameter b (logit scale, ~-3 to +3) */
  b: number;
  /** Pseudo-guessing parameter c ∈ [0,1] (default 0) */
  c?: number;
}

export interface IRTResponse {
  itemId: string;
  correct: boolean;
}

export interface IRTResult {
  /** Estimated ability θ (logit scale) */
  abilityTheta: number;
  /** Standard error of estimate */
  standardError: number;
  /** Item information at estimated θ */
  itemInformation: Array<{ itemId: string; information: number }>;
  /** Test information (sum) */
  testInformation: number;
  /** Item fit residuals */
  itemFit: Array<{ itemId: string; residual: number }>;
}

export interface SM2Card {
  id: string;
  /** Ease factor EF ∈ [1.3, 2.5], default 2.5 */
  ef?: number;
  /** Current interval days */
  interval?: number;
  /** Total repetitions */
  repetitions?: number;
}

export interface SM2Result {
  id: string;
  /** New ease factor */
  ef: number;
  /** Next review interval days */
  interval: number;
  /** Total repetitions after this review */
  repetitions: number;
  /** Due date (days from now) */
  dueDays: number;
  /** Quality of recall 0-5 */
  quality: number;
}

export interface KnowledgeNode {
  id: string;
  label: string;
  /** IDs of prerequisite nodes */
  prerequisites: string[];
  /** Estimated minutes to master */
  estimatedMinutes?: number;
}

export interface MasteryState {
  nodeId: string;
  masteryScore: number; // 0–1
}

export interface LearningPathResult {
  /** Ordered list of node IDs to study */
  path: string[];
  /** Total estimated minutes */
  totalMinutes: number;
  /** Whether all prerequisites are satisfiable */
  feasible: boolean;
}

export interface QuizPsychometrics {
  /** Number of items */
  itemCount: number;
  /** Number of respondents */
  n: number;
  /** Per-item p-value (proportion correct) */
  pValues: number[];
  /** Per-item discrimination index D = (upper27% - lower27%) correct rate */
  discriminationIndices: number[];
  /** Cronbach's alpha */
  cronbachAlpha: number;
  /** Mean score */
  meanScore: number;
  /** Score standard deviation */
  stdDevScore: number;
  /** Items flagged for poor discrimination (D < 0.2) */
  poorItems: string[];
}

export interface BloomLevel {
  level: 1 | 2 | 3 | 4 | 5 | 6;
  label: 'Remember' | 'Understand' | 'Apply' | 'Analyze' | 'Evaluate' | 'Create';
  confidence: number; // 0–1, fraction of matched verbs
}

export interface EducationReceiptOptions {
  runId?: string;
}

// ─── IRT 3-Parameter Logistic Model ──────────────────────────────────────────

/** P(correct | θ, a, b, c) = c + (1-c) / (1 + exp(-a(θ-b))) */
function irt3PL(theta: number, a: number, b: number, c: number): number {
  return c + (1 - c) / (1 + Math.exp(-a * (theta - b)));
}

/** Item information I(θ) = a²(1-P)(P-c)² / ((1-c)²P) */
function itemInfo(theta: number, a: number, b: number, c: number): number {
  const P = irt3PL(theta, a, b, c);
  const Q = 1 - P;
  if (P <= c || P >= 1) return 0;
  return (a * a * Q * (P - c) * (P - c)) / ((1 - c) * (1 - c) * P);
}

/**
 * Estimate student ability θ via Newton-Raphson MLE.
 * Iterates until convergence or max 50 steps.
 */
export function irtAbilityEstimate(
  items: IRTItem[],
  responses: IRTResponse[],
): IRTResult {
  if (items.length === 0) throw new Error('No items provided');
  if (responses.length !== items.length) throw new Error('responses must match items length');

  const itemMap = new Map(items.map(it => [it.id, it]));
  const responseMap = new Map(responses.map(r => [r.itemId, r.correct ? 1 : 0]));

  // Newton-Raphson MLE
  let theta = 0.0;
  for (let iter = 0; iter < 50; iter++) {
    let firstDeriv = 0, secondDeriv = 0;
    for (const item of items) {
      const a = item.a ?? 1.0, b = item.b, c = item.c ?? 0;
      const P = irt3PL(theta, a, b, c);
      const u = responseMap.get(item.id) ?? 0;
      const W = (P - c) / ((1 - c) * P * (1 - P) + 1e-15);
      const dP = a * (P - c) * (1 - P) / (1 - c + 1e-15);
      firstDeriv  += (u - P) * dP / (P * (1 - P) + 1e-15);
      secondDeriv -= dP * dP / (P * (1 - P) + 1e-15);
    }
    if (Math.abs(secondDeriv) < 1e-12) break;
    const step = firstDeriv / secondDeriv;
    theta -= step;
    theta = Math.max(-6, Math.min(6, theta));
    if (Math.abs(step) < 1e-6) break;
  }

  // Standard error = 1 / sqrt(test information)
  const infoArr = items.map(item => {
    const a = item.a ?? 1.0, b = item.b, c = item.c ?? 0;
    return { itemId: item.id, information: itemInfo(theta, a, b, c) };
  });
  const testInformation = infoArr.reduce((s, x) => s + x.information, 0);
  const standardError = testInformation > 0 ? 1 / Math.sqrt(testInformation) : Infinity;

  // Item fit residuals
  const itemFit = items.map(item => {
    const a = item.a ?? 1.0, b = item.b, c = item.c ?? 0;
    const P = irt3PL(theta, a, b, c);
    const u = responseMap.get(item.id) ?? 0;
    const residual = (u - P) / Math.sqrt(P * (1 - P) + 1e-15);
    return { itemId: item.id, residual };
  });

  return { abilityTheta: theta, standardError, itemInformation: infoArr, testInformation, itemFit };
}

// ─── SM-2 Spaced Repetition ───────────────────────────────────────────────────

/**
 * Apply one SM-2 review to a flashcard.
 * quality: 0=complete blackout, 5=perfect recall
 * EF' = EF + (0.1 - (5-q)(0.08 + (5-q)×0.02))
 * If quality < 3: reset repetitions and interval.
 */
export function sm2Review(card: SM2Card, quality: 0 | 1 | 2 | 3 | 4 | 5): SM2Result {
  if (quality < 0 || quality > 5) throw new Error('quality must be 0-5');

  let ef  = card.ef ?? 2.5;
  let rep = card.repetitions ?? 0;
  let interval = card.interval ?? 1;

  // Update EF (clamp to [1.3, 2.5])
  ef = Math.max(1.3, Math.min(2.5, ef + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))));

  if (quality < 3) {
    // Failure — restart
    rep = 0;
    interval = 1;
  } else {
    rep++;
    if (rep === 1) interval = 1;
    else if (rep === 2) interval = 6;
    else interval = Math.round(interval * ef);
  }

  return { id: card.id, ef, interval, repetitions: rep, dueDays: interval, quality };
}

// ─── Knowledge Space + Learning Path ─────────────────────────────────────────

/**
 * Topological sort of prerequisite DAG.
 * Returns nodes in study order starting from unmastered leaves.
 */
export function learningPathOptimizer(
  nodes: KnowledgeNode[],
  masteryStates: MasteryState[],
  masteryThreshold = 0.80,
): LearningPathResult {
  if (nodes.length === 0) throw new Error('No knowledge nodes provided');

  const masteryMap = new Map(masteryStates.map(m => [m.nodeId, m.masteryScore]));
  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  // Validate prerequisites exist
  for (const node of nodes) {
    for (const prereq of node.prerequisites) {
      if (!nodeMap.has(prereq)) throw new Error(`Prerequisite ${prereq} not found for node ${node.id}`);
    }
  }

  // Kahn's topological sort
  const inDegree = new Map(nodes.map(n => [n.id, 0]));
  for (const node of nodes) {
    for (const prereq of node.prerequisites) {
      inDegree.set(node.id, (inDegree.get(node.id) ?? 0) + 1);
    }
  }

  const queue: string[] = nodes.filter(n => (inDegree.get(n.id) ?? 0) === 0).map(n => n.id);
  const topoOrder: string[] = [];
  const adj = new Map<string, string[]>();
  for (const node of nodes) {
    for (const prereq of node.prerequisites) {
      if (!adj.has(prereq)) adj.set(prereq, []);
      adj.get(prereq)!.push(node.id);
    }
  }

  while (queue.length > 0) {
    const cur = queue.shift()!;
    topoOrder.push(cur);
    for (const child of (adj.get(cur) ?? [])) {
      const newDeg = (inDegree.get(child) ?? 0) - 1;
      inDegree.set(child, newDeg);
      if (newDeg === 0) queue.push(child);
    }
  }

  const feasible = topoOrder.length === nodes.length;

  // Filter to nodes that need study (mastery < threshold)
  const path = topoOrder.filter(id => (masteryMap.get(id) ?? 0) < masteryThreshold);
  const totalMinutes = path.reduce((acc, id) => acc + (nodeMap.get(id)?.estimatedMinutes ?? 30), 0);

  return { path, totalMinutes, feasible };
}

// ─── Grade prediction ─────────────────────────────────────────────────────────

export interface GradeEntry {
  /** Assignment weight */
  weight: number;
  /** Score as fraction [0,1] */
  score: number;
  /** Recency index (higher = more recent) */
  recencyIndex: number;
}

/**
 * Predict final grade using recency-weighted moving average.
 * decay: exponential decay factor per recency unit (default 0.85)
 */
export function gradePredictor(
  grades: GradeEntry[],
  decay = 0.85,
): { predictedGrade: number; letterGrade: string; gpa: number } {
  if (grades.length === 0) throw new Error('No grade entries provided');
  if (decay <= 0 || decay > 1) throw new Error('decay must be in (0, 1]');

  const maxRecency = Math.max(...grades.map(g => g.recencyIndex));
  let weightedSum = 0, totalWeight = 0;
  for (const g of grades) {
    const recencyWeight = Math.pow(decay, maxRecency - g.recencyIndex);
    const w = g.weight * recencyWeight;
    weightedSum += g.score * w;
    totalWeight += w;
  }
  const predictedGrade = totalWeight > 0 ? weightedSum / totalWeight : 0;

  // Letter grade (US standard)
  const letter =
    predictedGrade >= 0.93 ? 'A'  :
    predictedGrade >= 0.90 ? 'A-' :
    predictedGrade >= 0.87 ? 'B+' :
    predictedGrade >= 0.83 ? 'B'  :
    predictedGrade >= 0.80 ? 'B-' :
    predictedGrade >= 0.77 ? 'C+' :
    predictedGrade >= 0.73 ? 'C'  :
    predictedGrade >= 0.70 ? 'C-' :
    predictedGrade >= 0.67 ? 'D+' :
    predictedGrade >= 0.60 ? 'D'  : 'F';

  const gpaMap: Record<string, number> = {
    'A':4.0,'A-':3.7,'B+':3.3,'B':3.0,'B-':2.7,'C+':2.3,'C':2.0,'C-':1.7,'D+':1.3,'D':1.0,'F':0.0,
  };

  return { predictedGrade, letterGrade: letter, gpa: gpaMap[letter] };
}

// ─── Bloom's Taxonomy classifier ──────────────────────────────────────────────

const BLOOM_VERBS: Record<string, number> = {
  // L1 Remember
  define:1, list:1, recall:1, recognize:1, identify:1, name:1, state:1, describe:1, memorize:1,
  // L2 Understand
  explain:2, summarize:2, paraphrase:2, classify:2, compare:2, interpret:2, discuss:2, review:2,
  // L3 Apply
  apply:3, use:3, demonstrate:3, solve:3, implement:3, compute:3, execute:3, calculate:3, practice:3,
  // L4 Analyze
  analyze:4, differentiate:4, examine:4, distinguish:4, break:4, deconstruct:4, investigate:4, inspect:4,
  // L5 Evaluate
  evaluate:5, judge:5, critique:5, justify:5, assess:5, argue:5, defend:5, prioritize:5, rank:5,
  // L6 Create
  create:6, design:6, construct:6, develop:6, formulate:6, compose:6, plan:6, produce:6, generate:6,
};

const BLOOM_LABELS = ['','Remember','Understand','Apply','Analyze','Evaluate','Create'] as const;

/**
 * Classify learning objective text into Bloom's taxonomy level.
 */
export function bloomClassifier(objectiveText: string): BloomLevel {
  const words = objectiveText.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/);
  const levelCounts = [0,0,0,0,0,0,0];
  let matched = 0;
  for (const word of words) {
    const lvl = BLOOM_VERBS[word];
    if (lvl) { levelCounts[lvl]++; matched++; }
  }
  if (matched === 0) {
    return { level: 1, label: 'Remember', confidence: 0 };
  }
  let bestLevel = 1;
  for (let l = 2; l <= 6; l++) if (levelCounts[l] > levelCounts[bestLevel]) bestLevel = l;
  const level = bestLevel as 1|2|3|4|5|6;
  return { level, label: BLOOM_LABELS[level], confidence: levelCounts[level] / words.length };
}

// ─── Quiz psychometrics ───────────────────────────────────────────────────────

/**
 * Compute classical test theory statistics for a quiz.
 * responses: matrix [student][item] = 0/1
 * itemIds: label per item
 */
export function quizPsychometrics(
  responses: number[][],
  itemIds: string[],
): QuizPsychometrics {
  const n = responses.length;
  if (n < 2) throw new Error('At least 2 respondents required');
  const k = itemIds.length;
  if (responses.some(row => row.length !== k)) throw new Error('All response rows must match itemIds length');

  // P-values
  const pValues = itemIds.map((_, j) => {
    const correct = responses.filter(r => r[j] === 1).length;
    return correct / n;
  });

  // Total scores
  const scores = responses.map(row => row.reduce((a, b) => a + b, 0));
  const meanScore = scores.reduce((a, b) => a + b, 0) / n;
  const variance  = scores.reduce((acc, s) => acc + (s - meanScore) ** 2, 0) / (n - 1);
  const stdDevScore = Math.sqrt(variance);

  // Discrimination indices (upper/lower 27%)
  const sortedIndices = [...scores.keys()].sort((a, b) => scores[b] - scores[a]);
  const k27 = Math.max(1, Math.floor(0.27 * n));
  const upper = sortedIndices.slice(0, k27);
  const lower = sortedIndices.slice(n - k27);

  const discriminationIndices = itemIds.map((_, j) => {
    const pU = upper.filter(i => responses[i][j] === 1).length / k27;
    const pL = lower.filter(i => responses[i][j] === 1).length / k27;
    return pU - pL;
  });

  // Cronbach's alpha: α = (k/(k-1)) × (1 − Σvar_i / var_total)
  const itemVariances = itemIds.map((_, j) => {
    const p = pValues[j];
    return p * (1 - p);
  });
  const sumItemVar = itemVariances.reduce((a, b) => a + b, 0);
  const cronbachAlpha = k > 1 && variance > 0
    ? (k / (k - 1)) * (1 - sumItemVar / variance)
    : 0;

  const poorItems = itemIds.filter((_, j) => discriminationIndices[j] < 0.2);

  return { itemCount: k, n, pValues, discriminationIndices, cronbachAlpha, meanScore, stdDevScore, poorItems };
}

// ─── Receipt ──────────────────────────────────────────────────────────────────

export interface EducationAnalysisResult {
  irt?: IRTResult;
  sm2?: SM2Result[];
  learningPath?: LearningPathResult;
  grade?: ReturnType<typeof gradePredictor>;
  bloom?: BloomLevel;
  psychometrics?: QuizPsychometrics;
  converged: true;
}

export function buildEducationReceipt(
  result: EducationAnalysisResult,
  options?: EducationReceiptOptions,
): DomainSimulationReceipt {
  const violations: Array<{ criterion: string; message: string }> = [];

  if (result.psychometrics) {
    const { cronbachAlpha, poorItems } = result.psychometrics;
    if (cronbachAlpha < 0.70) {
      violations.push({ criterion: 'reliability', message: `Cronbach's α ${cronbachAlpha.toFixed(3)} < 0.70 — quiz reliability is poor` });
    }
    if (poorItems.length > result.psychometrics.itemCount / 2) {
      violations.push({ criterion: 'discrimination', message: `${poorItems.length}/${result.psychometrics.itemCount} items have poor discrimination (D < 0.2)` });
    }
  }
  if (result.learningPath && !result.learningPath.feasible) {
    violations.push({ criterion: 'prerequisite_cycle', message: 'Prerequisite graph contains a cycle — learning path is infeasible' });
  }

  return buildDomainSimulationReceipt({
    plugin: 'education-lms',
    pluginVersion: '1.0.0',
    runId: options?.runId ?? `edu-${Date.now().toString(36)}`,
    solverConfig: { solverType: 'learning-analytics', scale: 'course' },
    resultSummary: {
      abilityTheta: result.irt?.abilityTheta,
      cronbachAlpha: result.psychometrics?.cronbachAlpha,
      predictedGrade: result.grade?.predictedGrade,
      learningPathNodes: result.learningPath?.path.length,
      bloomLevel: result.bloom?.level,
    },
    cael: { version: 'cael.v1', event: 'education_lms.learning_analysis', solverType: 'education-lms.irt-3pl' },
    acceptance: { accepted: violations.length === 0, violations },
  });
}
