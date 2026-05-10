import type { ConversionCandidate } from './conversionAdvisor';

export type PublishWorthinessDimensionKey =
  | 'userIntent'
  | 'projectDNA'
  | 'absorbGraph'
  | 'conversionOpportunities'
  | 'novelty'
  | 'evidencePath'
  | 'd011Feasibility';

export type PublishWorthinessVerdict = 'locked' | 'candidate' | 'unlock';

export interface PublishWorthinessProjectDNA {
  kind?: string;
  confidence?: number;
  languages?: string[];
  frameworks?: string[];
  packageManagers?: string[];
  runtimes?: string[];
  repoShape?: string;
  strengths?: string[];
  riskSignals?: string[];
  recommendedMode?: string;
}

export interface PublishWorthinessAbsorbGraph {
  totalFiles?: number;
  totalSymbols?: number;
  totalImports?: number;
  totalLoc?: number;
  totalCalls?: number;
  hubFiles?: Array<{ path: string; inDegree?: number; symbols?: number }>;
  leafFirstOrder?: string[];
  errors?: string[];
  domainTerms?: string[];
}

export interface PublishWorthinessEvidencePath {
  artifacts?: string[];
  claims?: string[];
  benchmarkPaths?: string[];
  demoPaths?: string[];
  studyPaths?: string[];
  ablationPaths?: string[];
  hardwarePaths?: string[];
  hasHardwarePlan?: boolean;
  hasN12StudyPlan?: boolean;
  hasFullLoopDemo?: boolean;
  hasAblationPlan?: boolean;
  hasBenchmarkHarness?: boolean;
}

export interface PublishWorthinessLLMReview {
  verdict?: PublishWorthinessVerdict | 'hold' | 'reject';
  score?: number;
  confidence?: number;
  rationale?: string;
  blockers?: string[];
  evidenceCitations?: string[];
  dimensionScores?: Partial<Record<PublishWorthinessDimensionKey, number>>;
}

export interface PublishWorthinessInput {
  userIntent?: string | null;
  projectDNA?: PublishWorthinessProjectDNA | null;
  absorbGraph?: PublishWorthinessAbsorbGraph | null;
  conversionCandidates?: ConversionCandidate[];
  paths?: string[];
  noveltyClaims?: string[];
  differentiators?: string[];
  baselineComparisons?: string[];
  evidence?: PublishWorthinessEvidencePath | null;
  llmReview?: PublishWorthinessLLMReview | null;
  unlockThreshold?: number;
  deterministicFloor?: number;
}

export interface PublishWorthinessDimension {
  key: PublishWorthinessDimensionKey;
  label: string;
  score: number;
  maxScore: number;
  evidence: string[];
  blockers: string[];
}

export interface PublishWorthinessAssessment {
  verdict: PublishWorthinessVerdict;
  hiddenPaperProgramUnlocked: boolean;
  deterministicScore: number;
  finalScore: number;
  threshold: number;
  deterministicFloor: number;
  llmAdjustment: number;
  disqualifyingSignals: string[];
  dimensions: PublishWorthinessDimension[];
  requiredGateFailures: string[];
  nextActions: string[];
  llmAssistPrompt: string;
}

const DIMENSION_LABELS: Record<PublishWorthinessDimensionKey, string> = {
  userIntent: 'User intent',
  projectDNA: 'Project DNA',
  absorbGraph: 'Absorb graph',
  conversionOpportunities: 'HoloScript conversion opportunities',
  novelty: 'Novelty',
  evidencePath: 'Evidence path',
  d011Feasibility: 'D.011 feasibility',
};

const DIMENSION_MAX: Record<PublishWorthinessDimensionKey, number> = {
  userIntent: 10,
  projectDNA: 12,
  absorbGraph: 12,
  conversionOpportunities: 14,
  novelty: 18,
  evidencePath: 18,
  d011Feasibility: 16,
};

const DEFAULT_UNLOCK_THRESHOLD = 78;
const DEFAULT_DETERMINISTIC_FLOOR = 68;

const RESEARCH_TERMS = [
  'ablation',
  'benchmark',
  'cael',
  'compiler',
  'crdt',
  'evidence',
  'experiment',
  'formal',
  'gpu',
  'harness',
  'hololand',
  'holoscript',
  'novel',
  'paper',
  'provenance',
  'replay',
  'reproducible',
  'simulation',
  'solver',
  'spatial',
  'study',
  'trust',
  'webgpu',
];

const ROUTINE_TERMS = [
  'admin panel',
  'boilerplate',
  'cleanup',
  'crud',
  'dashboard clone',
  'demo only',
  'landing page',
  'portfolio',
  'refactor only',
  'starter',
  'thin demo',
  'todo cleanup',
];

const GENERIC_CRUD_PATH_RE =
  /(^|\/)(users?|posts?|products?|orders?|todos?|items?)\/(page|route|index|list|form)\.(ts|tsx|js|jsx)$/i;

function normalizeText(value: unknown): string {
  return String(value ?? '').toLowerCase();
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.?\/+/, '');
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function roundScore(value: number): number {
  return Math.round(value * 10) / 10;
}

function keywordHits(text: string, terms: string[]): string[] {
  return terms.filter((term) => text.includes(term));
}

function allText(input: PublishWorthinessInput): string {
  return [
    input.userIntent,
    ...(input.paths ?? []),
    ...(input.noveltyClaims ?? []),
    ...(input.differentiators ?? []),
    ...(input.baselineComparisons ?? []),
    ...(input.evidence?.artifacts ?? []),
    ...(input.evidence?.claims ?? []),
    ...(input.absorbGraph?.domainTerms ?? []),
    ...(input.conversionCandidates ?? []).map((candidate) =>
      [
        candidate.detectedPattern,
        candidate.target,
        candidate.whyItMatters,
        candidate.nextAction,
        ...candidate.sourcePaths,
      ].join(' ')
    ),
  ]
    .map(normalizeText)
    .join('\n');
}

function dimension(
  key: PublishWorthinessDimensionKey,
  score: number,
  evidence: string[] = [],
  blockers: string[] = []
): PublishWorthinessDimension {
  return {
    key,
    label: DIMENSION_LABELS[key],
    score: roundScore(clamp(score, 0, DIMENSION_MAX[key])),
    maxScore: DIMENSION_MAX[key],
    evidence: unique(evidence),
    blockers: unique(blockers),
  };
}

function assessUserIntent(input: PublishWorthinessInput, text: string): PublishWorthinessDimension {
  const intent = input.userIntent?.trim();
  const blockers: string[] = [];
  const evidence: string[] = [];
  if (!intent) {
    return dimension('userIntent', 0, [], ['No user intent supplied.']);
  }

  let score = 1;
  if (intent.length >= 40) score += 2;
  if (
    /\b(problem|hypothesis|claim|research|paper|experiment|benchmark|prove|validate)\b/i.test(
      intent
    )
  )
    score += 3;
  if (/\b(user|reviewer|scientist|agent|developer|operator|patient|artist)\b/i.test(intent))
    score += 1.5;
  if (/\b(because|so that|in order to|vs\.?|baseline|instead of)\b/i.test(intent)) score += 1.5;

  const researchHits = keywordHits(text, RESEARCH_TERMS);
  if (researchHits.length > 0) {
    score += Math.min(2, researchHits.length * 0.5);
    evidence.push(`Research intent terms: ${researchHits.slice(0, 4).join(', ')}`);
  }

  const routineHits = keywordHits(normalizeText(intent), ROUTINE_TERMS);
  if (routineHits.length > 0) {
    score = Math.min(score, 4);
    blockers.push(`Routine intent terms: ${routineHits.join(', ')}`);
  }

  return dimension('userIntent', score, evidence, blockers);
}

function assessProjectDNA(input: PublishWorthinessInput): PublishWorthinessDimension {
  const dna = input.projectDNA;
  if (!dna) return dimension('projectDNA', 0, [], ['Project DNA unavailable.']);

  const evidence: string[] = [];
  const blockers: string[] = [];
  let score = 0;
  const kind = normalizeText(dna.kind);
  if (kind && kind !== 'unknown') {
    score += 2;
    evidence.push(`Kind: ${dna.kind}`);
  }
  if (['spatial', 'agent-backend', 'data', 'library', 'automation'].includes(kind)) score += 2.5;
  if ((dna.confidence ?? 0) >= 0.45) score += 2;
  if ((dna.frameworks?.length ?? 0) > 0) {
    score += Math.min(2, dna.frameworks!.length * 0.5);
    evidence.push(`Frameworks: ${dna.frameworks!.slice(0, 4).join(', ')}`);
  }
  if ((dna.languages?.length ?? 0) > 1) score += 1;
  if (dna.repoShape === 'monorepo' || dna.repoShape === 'polyglot') score += 1.5;
  if ((dna.strengths?.length ?? 0) > 0) {
    score += Math.min(2, dna.strengths!.length * 0.6);
    evidence.push(`Strengths: ${dna.strengths!.slice(0, 4).join(', ')}`);
  }
  if ((dna.riskSignals?.length ?? 0) > 0) {
    score -= Math.min(2, dna.riskSignals!.length * 0.4);
    blockers.push(`Risk signals: ${dna.riskSignals!.slice(0, 4).join(', ')}`);
  }

  return dimension('projectDNA', score, evidence, blockers);
}

function assessAbsorbGraph(input: PublishWorthinessInput): PublishWorthinessDimension {
  const graph = input.absorbGraph;
  if (!graph) return dimension('absorbGraph', 0, [], ['Absorb graph unavailable.']);

  const evidence: string[] = [];
  const blockers: string[] = [];
  let score = 0;
  if ((graph.totalFiles ?? 0) >= 20) score += 2;
  if ((graph.totalSymbols ?? 0) >= 50) score += 2;
  if ((graph.totalImports ?? 0) >= 25) score += 1.5;
  if ((graph.totalLoc ?? 0) >= 2_000) score += 1.5;
  if ((graph.totalCalls ?? 0) >= 50) score += 1.5;
  if ((graph.hubFiles?.length ?? 0) > 0) {
    score += Math.min(2, graph.hubFiles!.length * 0.5);
    evidence.push(
      `Hub files: ${graph
        .hubFiles!.slice(0, 3)
        .map((hub) => hub.path)
        .join(', ')}`
    );
  }
  if ((graph.domainTerms?.length ?? 0) > 0) {
    score += Math.min(2, graph.domainTerms!.length * 0.4);
    evidence.push(`Domain terms: ${graph.domainTerms!.slice(0, 5).join(', ')}`);
  }
  if ((graph.errors?.length ?? 0) > 0) {
    score -= Math.min(2, graph.errors!.length * 0.3);
    blockers.push(`Absorb errors: ${graph.errors!.length}`);
  }

  return dimension('absorbGraph', score, evidence, blockers);
}

function assessConversionOpportunities(input: PublishWorthinessInput): PublishWorthinessDimension {
  const candidates = input.conversionCandidates ?? [];
  if (candidates.length === 0) {
    return dimension('conversionOpportunities', 0, [], ['No HoloScript conversion candidates.']);
  }

  const targets = new Set(candidates.map((candidate) => candidate.target));
  const evidence: string[] = [
    `Candidates: ${candidates.length}`,
    `Targets: ${Array.from(targets).slice(0, 5).join(', ')}`,
  ];
  const blockers: string[] = [];
  const topValue = candidates.slice(0, 5).reduce((sum, candidate) => sum + candidate.value, 0);
  const averageConfidence =
    candidates.reduce((sum, candidate) => sum + candidate.confidence, 0) / candidates.length;
  const quickWins = candidates.filter(
    (candidate) => candidate.effort === 'quick' && candidate.risk !== 'high'
  ).length;
  const highRisk = candidates.filter((candidate) => candidate.risk === 'high').length;

  let score = Math.min(5, topValue / 8);
  score += Math.min(3, targets.size * 0.75);
  score += Math.min(3, quickWins * 0.75);
  score += Math.min(2, averageConfidence * 2);
  if (targets.has('hololand-scene') || targets.has('compiler-export-target')) score += 1;
  if (highRisk > 0) {
    score -= Math.min(2, highRisk * 0.5);
    blockers.push(`High-risk conversions: ${highRisk}`);
  }

  return dimension('conversionOpportunities', score, evidence, blockers);
}

function assessNovelty(input: PublishWorthinessInput, text: string): PublishWorthinessDimension {
  const evidence: string[] = [];
  const blockers: string[] = [];
  let score = 0;

  if ((input.noveltyClaims?.length ?? 0) > 0) {
    score += Math.min(5, input.noveltyClaims!.length * 2);
    evidence.push(`Novelty claims: ${input.noveltyClaims!.slice(0, 3).join('; ')}`);
  }
  if ((input.differentiators?.length ?? 0) > 0) {
    score += Math.min(4, input.differentiators!.length * 1.5);
    evidence.push(`Differentiators: ${input.differentiators!.slice(0, 3).join('; ')}`);
  }
  if ((input.baselineComparisons?.length ?? 0) > 0) {
    score += Math.min(4, input.baselineComparisons!.length * 1.5);
    evidence.push(`Baselines: ${input.baselineComparisons!.slice(0, 3).join('; ')}`);
  }

  const researchHits = keywordHits(text, RESEARCH_TERMS);
  score += Math.min(4, researchHits.length * 0.45);
  if (researchHits.length > 0)
    evidence.push(`Novelty terms: ${researchHits.slice(0, 6).join(', ')}`);

  const candidateTargets = new Set(
    (input.conversionCandidates ?? []).map((candidate) => candidate.target)
  );
  if (candidateTargets.has('compiler-export-target')) score += 1.5;
  if (candidateTargets.has('hololand-scene')) score += 1;

  const routineHits = keywordHits(text, ROUTINE_TERMS);
  if (routineHits.length > 0) {
    score = Math.min(score, 6);
    blockers.push(`Routine novelty blockers: ${routineHits.slice(0, 4).join(', ')}`);
  }

  return dimension('novelty', score, evidence, blockers);
}

function assessEvidencePath(input: PublishWorthinessInput): PublishWorthinessDimension {
  const evidenceInput = input.evidence;
  const paths = (input.paths ?? []).map(normalizePath);
  const artifacts = [
    ...(evidenceInput?.artifacts ?? []),
    ...(evidenceInput?.benchmarkPaths ?? []),
    ...(evidenceInput?.demoPaths ?? []),
    ...(evidenceInput?.studyPaths ?? []),
    ...(evidenceInput?.ablationPaths ?? []),
    ...(evidenceInput?.hardwarePaths ?? []),
  ].map(normalizePath);
  const allPaths = [...paths, ...artifacts];
  const evidence: string[] = [];
  const blockers: string[] = [];
  let score = 0;

  if (
    allPaths.some(
      (p) => /(^|\/)(test|tests|__tests__|spec|e2e)\//i.test(p) || /\.(test|spec)\./i.test(p)
    )
  ) {
    score += 3;
    evidence.push('Tests present.');
  }
  if (
    allPaths.some((p) => /(^|\/)(docs|research|paper|papers)\//i.test(p) || /readme\.md$/i.test(p))
  ) {
    score += 2.5;
    evidence.push('Docs or research artifacts present.');
  }
  if (allPaths.some((p) => /(bench|benchmark|harness|perf)/i.test(p))) {
    score += 3;
    evidence.push('Benchmark or harness path present.');
  }
  if (allPaths.some((p) => /(demo|walkthrough|scenario|replay)/i.test(p))) {
    score += 2;
    evidence.push('Demo or replay path present.');
  }
  if ((evidenceInput?.claims?.length ?? 0) > 0) {
    score += Math.min(3, evidenceInput!.claims!.length);
    evidence.push(`Claims: ${evidenceInput!.claims!.slice(0, 3).join('; ')}`);
  }
  if (artifacts.length > 0) score += Math.min(3, artifacts.length * 0.5);
  if (allPaths.length === 0) blockers.push('No artifact paths supplied.');

  return dimension('evidencePath', score, evidence, blockers);
}

function assessD011Feasibility(input: PublishWorthinessInput): PublishWorthinessDimension {
  const evidenceInput = input.evidence;
  if (!evidenceInput) {
    return dimension('d011Feasibility', 0, [], ['D.011 evidence plan unavailable.']);
  }

  const evidence: string[] = [];
  const blockers: string[] = [];
  let score = 0;
  const gates = [
    [
      'G1 hardware/env capture',
      evidenceInput.hasHardwarePlan || (evidenceInput.hardwarePaths?.length ?? 0) > 0,
    ],
    [
      'G2 N=12 study or waiver',
      evidenceInput.hasN12StudyPlan || (evidenceInput.studyPaths?.length ?? 0) > 0,
    ],
    [
      'G3 full-loop demo',
      evidenceInput.hasFullLoopDemo || (evidenceInput.demoPaths?.length ?? 0) > 0,
    ],
    [
      'G4 ablation',
      evidenceInput.hasAblationPlan || (evidenceInput.ablationPaths?.length ?? 0) > 0,
    ],
  ] as const;

  for (const [name, present] of gates) {
    if (present) {
      score += 3.2;
      evidence.push(name);
    } else {
      blockers.push(`Missing ${name}.`);
    }
  }

  if (evidenceInput.hasBenchmarkHarness || (evidenceInput.benchmarkPaths?.length ?? 0) > 0) {
    score += 2.2;
    evidence.push('Benchmark harness.');
  }
  if ((evidenceInput.artifacts?.length ?? 0) >= 4) score += 1;

  return dimension('d011Feasibility', score, evidence, blockers);
}

function detectDisqualifyingSignals(input: PublishWorthinessInput, text: string): string[] {
  const signals: string[] = [];
  const routineHits = keywordHits(text, ROUTINE_TERMS);
  if (
    routineHits.includes('cleanup') ||
    routineHits.includes('todo cleanup') ||
    routineHits.includes('refactor only')
  ) {
    signals.push('routine-cleanup');
  }
  if (routineHits.includes('thin demo') || routineHits.includes('demo only')) {
    signals.push('thin-demo');
  }

  const paths = (input.paths ?? []).map(normalizePath);
  const crudPathCount = paths.filter((p) => GENERIC_CRUD_PATH_RE.test(p)).length;
  if (crudPathCount >= 3 && keywordHits(text, RESEARCH_TERMS).length < 3) {
    signals.push('generic-crud');
  }
  if (routineHits.includes('crud')) signals.push('generic-crud');
  if (
    routineHits.includes('landing page') ||
    routineHits.includes('portfolio') ||
    routineHits.includes('starter')
  ) {
    signals.push('thin-demo');
  }

  return unique(signals);
}

function computeLLMAdjustment(
  input: PublishWorthinessInput,
  dimensions: PublishWorthinessDimension[]
): { adjustment: number; blockers: string[] } {
  const review = input.llmReview;
  if (!review) return { adjustment: 0, blockers: [] };

  const confidence = clamp(review.confidence ?? 0.5, 0, 1);
  let adjustment = 0;
  const blockers = review.blockers ?? [];

  if (typeof review.score === 'number') {
    const deterministic = dimensions.reduce((sum, item) => sum + item.score, 0);
    adjustment += clamp((review.score - deterministic) * 0.2, -8, 6) * confidence;
  }

  if (review.dimensionScores) {
    for (const dimensionScore of dimensions) {
      const llmScore = review.dimensionScores[dimensionScore.key];
      if (typeof llmScore !== 'number') continue;
      adjustment += clamp(llmScore - dimensionScore.score, -3, 2) * 0.2 * confidence;
    }
  }

  if (review.verdict === 'unlock') adjustment += 4 * confidence;
  if (review.verdict === 'candidate' || review.verdict === 'hold') adjustment -= 2 * confidence;
  if (review.verdict === 'locked' || review.verdict === 'reject') adjustment -= 8 * confidence;

  return { adjustment: roundScore(clamp(adjustment, -12, 8)), blockers };
}

function requiredGateFailures(
  dimensions: PublishWorthinessDimension[],
  disqualifyingSignals: string[]
): string[] {
  const byKey = new Map(dimensions.map((item) => [item.key, item]));
  const failures: string[] = [];
  if (disqualifyingSignals.length > 0) {
    failures.push(`Disqualified by ${disqualifyingSignals.join(', ')}.`);
  }
  if ((byKey.get('novelty')?.score ?? 0) < 8)
    failures.push('Novelty score below hidden unlock floor.');
  if ((byKey.get('evidencePath')?.score ?? 0) < 8)
    failures.push('Evidence path score below hidden unlock floor.');
  if ((byKey.get('d011Feasibility')?.score ?? 0) < 7)
    failures.push('D.011 feasibility score below hidden unlock floor.');
  return failures;
}

function buildNextActions(
  dimensions: PublishWorthinessDimension[],
  requiredFailures: string[],
  finalScore: number,
  threshold: number
): string[] {
  if (requiredFailures.length === 0 && finalScore >= threshold) {
    return [
      'Open the hidden paper-program lane with a draft problem statement and D.011 tracker.',
      'Ask the LLM reviewer to turn the rubric evidence into a one-page paper-lane brief.',
    ];
  }

  const weakest = [...dimensions].sort((a, b) => a.score / a.maxScore - b.score / b.maxScore);
  const actions: string[] = [];
  for (const item of weakest.slice(0, 3)) {
    if (item.key === 'novelty')
      actions.push('Add a concrete novelty claim and baseline comparison.');
    if (item.key === 'evidencePath')
      actions.push('Add test, benchmark, demo, or research artifacts that support the claim.');
    if (item.key === 'd011Feasibility')
      actions.push(
        'Sketch D.011 G1 hardware, G2 N=12 or waiver, G3 full-loop demo, and G4 ablation.'
      );
    if (item.key === 'absorbGraph')
      actions.push('Run Absorb and attach graph stats before considering paper unlock.');
    if (item.key === 'projectDNA')
      actions.push(
        'Attach Project DNA so the detector can separate product shape from paper shape.'
      );
  }
  return unique(actions);
}

function buildLLMAssistPrompt(
  input: PublishWorthinessInput,
  dimensions: PublishWorthinessDimension[],
  disqualifyingSignals: string[]
): string {
  const summary = {
    userIntent: input.userIntent ?? null,
    projectDNA: input.projectDNA ?? null,
    absorbGraph: input.absorbGraph ?? null,
    conversionCandidates: (input.conversionCandidates ?? []).slice(0, 8),
    noveltyClaims: input.noveltyClaims ?? [],
    differentiators: input.differentiators ?? [],
    baselineComparisons: input.baselineComparisons ?? [],
    evidence: input.evidence ?? null,
    deterministicDimensions: dimensions.map(({ key, score, maxScore, evidence, blockers }) => ({
      key,
      score,
      maxScore,
      evidence,
      blockers,
    })),
    disqualifyingSignals,
  };
  return [
    'You are reviewing whether a Studio user project deserves the hidden HoloScript paper-program lane.',
    'Return JSON with verdict, score, confidence, rationale, blockers, evidenceCitations, and dimensionScores.',
    'Do not unlock routine cleanup, generic CRUD, starter apps, landing pages, or thin demos.',
    'Reward clear novelty, Project DNA fit, Absorb graph substance, conversion opportunities, evidence artifacts, and D.011 feasibility.',
    JSON.stringify(summary, null, 2),
  ].join('\n\n');
}

export function assessPublishWorthiness(
  input: PublishWorthinessInput
): PublishWorthinessAssessment {
  const text = allText(input);
  const dimensions = [
    assessUserIntent(input, text),
    assessProjectDNA(input),
    assessAbsorbGraph(input),
    assessConversionOpportunities(input),
    assessNovelty(input, text),
    assessEvidencePath(input),
    assessD011Feasibility(input),
  ];
  const deterministicScore = roundScore(dimensions.reduce((sum, item) => sum + item.score, 0));
  const disqualifyingSignals = detectDisqualifyingSignals(input, text);
  const { adjustment, blockers: llmBlockers } = computeLLMAdjustment(input, dimensions);
  const finalScore = roundScore(clamp(deterministicScore + adjustment, 0, 100));
  const threshold = input.unlockThreshold ?? DEFAULT_UNLOCK_THRESHOLD;
  const deterministicFloor = input.deterministicFloor ?? DEFAULT_DETERMINISTIC_FLOOR;
  const requiredFailures = requiredGateFailures(dimensions, disqualifyingSignals);
  if (llmBlockers.length > 0) {
    requiredFailures.push(`LLM reviewer blockers: ${llmBlockers.join('; ')}`);
  }

  const hiddenPaperProgramUnlocked =
    finalScore >= threshold &&
    deterministicScore >= deterministicFloor &&
    requiredFailures.length === 0;
  const verdict: PublishWorthinessVerdict = hiddenPaperProgramUnlocked
    ? 'unlock'
    : finalScore >= threshold - 12 && deterministicScore >= deterministicFloor - 10
      ? 'candidate'
      : 'locked';

  return {
    verdict,
    hiddenPaperProgramUnlocked,
    deterministicScore,
    finalScore,
    threshold,
    deterministicFloor,
    llmAdjustment: adjustment,
    disqualifyingSignals,
    dimensions,
    requiredGateFailures: requiredFailures,
    nextActions: buildNextActions(dimensions, requiredFailures, finalScore, threshold),
    llmAssistPrompt: buildLLMAssistPrompt(input, dimensions, disqualifyingSignals),
  };
}
