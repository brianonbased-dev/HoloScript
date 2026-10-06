/**
 * Back-translation proof — shared types.
 *
 * The proof: agent A describes a behaviour as a plain-language checklist; agent
 * B (a different model family) rebuilds the behaviour from the checklist alone;
 * a twin test runs original and rebuild over seeded situations; planted faults
 * (mutants of the original) measure whether the twin test can catch a real
 * change at all. These types are the receipt contract for one behaviour.
 */

/** One numbered, checkable line of the plain-language checklist. */
export interface ChecklistLine {
  n: number;
  text: string;
}

export interface BehaviourChecklist {
  /** Stable id for the behaviour (e.g. `model-village/behavior`). */
  behaviourId: string;
  /** Repo-relative path of the ORIGINAL source the checklist describes. */
  sourcePath: string;
  /** Who wrote the checklist (agent A). */
  author: string;
  lines: ChecklistLine[];
}

/** One prompt/response exchange with agent B, recorded verbatim. */
export interface ModelExchange {
  round: number;
  kind: 'rebuild' | 'repair';
  provider: string;
  model: string;
  reportedModel: string | null;
  prompt: { system: string; user: string };
  response: string;
  /** Source extracted from the response (fenced block contents). */
  extractedSource: string;
  validation: { valid: boolean; errors: string[] };
  usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
  at: string;
}

export type DivergenceClass = 'real-fault' | 'checklist-ambiguity' | 'b-error';

export interface ClassifiedDivergence {
  iteration: number;
  reason: string;
  /** Plain description of what differed. */
  difference: string;
  classification: DivergenceClass;
  /** Why this classification (checklist line numbers involved, etc.). */
  rationale: string;
}

export interface MutantOutcome {
  id: string;
  operator: string;
  description: string;
  /** Unified one-line view of the change, e.g. `line 13: "+" -> "-"`. */
  change: string;
  situations: number;
  divergentSituations: number;
  caught: boolean;
  /** First divergence reason and message, for the record. */
  firstDivergence?: { iteration: number; reason: string; detail: string };
}

export interface BackTranslationReceipt {
  schema: 'holoscript.back-translation-proof.v1';
  behaviourId: string;
  generatedAt: string;
  runSurface: {
    branch: string;
    commit: string;
    note: string;
  };
  checklist: BehaviourChecklist;
  plainLanguageCheck: { tool: string; exitCode: number | null; findings: string };
  rebuild: {
    provider: string;
    model: string;
    seesOriginalSource: false;
    inputs: string[];
    rounds: number;
    validated: boolean;
    exchangesDir: string;
    rebuiltSourcePath: string;
    recordedNotLive: boolean;
  };
  twin: {
    harness: string;
    runner: string;
    situations: number;
    seed: number;
    oracleFields: string[];
    excludedFields: { field: string; why: string }[];
  };
  originalVsRebuild: {
    passed: boolean;
    divergentSituations: number;
    divergences: ClassifiedDivergence[];
    falseAlarms: number;
  };
  /** Sanity: original vs itself must never diverge (the oracle is deterministic). */
  originalVsSelf: { passed: boolean; divergentSituations: number };
  faults: {
    planted: number;
    caught: number;
    mutants: MutantOutcome[];
  };
  verdict: string;
  weakestLink: string;
}

// ── Slice 2: intent-based metric ──────────────────────────────────────────
//
// In real use there is no trusted original: the author's program may be
// faulty and B's rebuild (from the checklist) stands for the intent. A planted
// fault in the original is CAUGHT when B and the faulty program disagree in a
// situation where B agrees with the correct original, so the disagreement is
// attributable to the fault and not to B's own misreading of the checklist.

export interface IntentCatchOutcome {
  id: string;
  operator: string;
  description: string;
  change: string;
  inDecision: boolean;
  situations: number;
  /** Oracle sanity: original vs mutant. */
  oracleDivergentSituations: number;
  /** Any B-vs-mutant disagreement (includes B's own misreadings). */
  rawDivergentSituations: number;
  /** B-vs-mutant disagreements in situations where B agrees with the original. */
  attributableDivergentSituations: number;
  caught: boolean;
}

export interface BackTranslationReceiptV2 {
  schema: 'holoscript.back-translation-proof.v2';
  behaviourId: string;
  title: string;
  generatedAt: string;
  runSurface: { branch: string; commit: string; note: string };
  checklist: BehaviourChecklist;
  interfaceCard: string;
  plainLanguageCheck: { tool: string; exitCode: number | null; findings: string };
  rebuild: {
    provider: string;
    model: string;
    seesOriginalSource: false;
    inputs: string[];
    checker: string;
    rounds: number;
    validated: boolean;
    exchangesDir: string;
    rebuiltSourcePath: string;
    recordedNotLive: boolean;
    note?: string;
  };
  twin: {
    harness: string;
    runner: string;
    generator: string;
    situations: number;
    edgeSituations: number;
    seed: number;
    oracleFields: string[];
    excludedFields: { field: string; why: string }[];
  };
  precheck: { originalRanAllSituations: boolean; situationsRun: number };
  falseAlarms: {
    situations: number;
    divergentSituations: number;
    byClass: Record<DivergenceClass, number>;
    divergences: ClassifiedDivergence[];
  };
  catch: {
    planted: number;
    oracleVisible: number;
    caught: number;
    /** caught / planted. */
    catchRate: number;
    mutants: IntentCatchOutcome[];
  };
  verdict: string;
}

// ── Slice 3: outcome kinds on the card, new behaviours, several recordings ──
//
// Same intent metric as slice 2. B is called several times with the same
// inputs (fresh calls); each recording is measured on its own, and the receipt
// carries the spread, because one recording is not enough to state a
// false-alarm rate.

export interface RecordingMeasurement {
  /** Recording id, e.g. `r1`. */
  recording: string;
  model: string;
  rounds: number;
  validated: boolean;
  exchangesDir: string;
  rebuiltSourcePath: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
  falseAlarms: {
    situations: number;
    divergentSituations: number;
    byClass: Record<DivergenceClass, number>;
    divergences: ClassifiedDivergence[];
  };
  catch: {
    planted: number;
    oracleVisible: number;
    caught: number;
    catchRate: number;
    mutants: IntentCatchOutcome[];
  };
}

export interface SpreadStat {
  min: number;
  max: number;
  mean: number;
}

/** Person-facing false-alarm tolerance, stated per 20 situations. */
export interface FalseAlarmTolerance {
  maxPer20Situations: number;
  why: string;
}

export interface BackTranslationReceiptV3 {
  schema: 'holoscript.back-translation-proof.v3';
  behaviourId: string;
  title: string;
  /** `measured` counts toward the slice score; `before-after` is a separate labelled check. */
  role: 'measured' | 'before-after';
  generatedAt: string;
  runSurface: { branch: string; commit: string; note: string };
  checklist: BehaviourChecklist;
  interfaceCard: string;
  plainLanguageCheck: { tool: string; exitCode: number | null; findings: string };
  rebuild: {
    provider: string;
    seesOriginalSource: false;
    inputs: string[];
    checker: string;
    maxRepairRounds: number;
    recordedNotLive: boolean;
  };
  twin: {
    harness: string;
    runner: string;
    generator: string;
    situations: number;
    edgeSituations: number;
    seed: number;
    oracleFields: string[];
    excludedFields: { field: string; why: string }[];
  };
  precheck: { originalRanAllSituations: boolean; situationsRun: number };
  /** Planted mistakes left out because the oracle cannot tell them from the correct program. */
  skippedMutants: Array<{ id: string; description: string; why: string }>;
  recordings: RecordingMeasurement[];
  spread: { catchRate: SpreadStat; falseAlarmSituations: SpreadStat };
  verdict: string;
}
