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
