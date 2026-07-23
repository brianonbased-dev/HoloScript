/**
 * Semantic-closure receipt for the three HoloScript source surfaces.
 *
 * Parsing is not execution. This contract makes every admitted construct report
 * what survived each language stage so a compiler cannot silently discard
 * syntax and still claim success. It belongs in HoloMeaning because every
 * parser, compiler, VM, grader, and agent-facing diagnostic consumes the same
 * stage vocabulary.
 */

export const SEMANTIC_CLOSURE_STAGES = [
  'parsed',
  'typed',
  'lowered',
  'enforced',
  'executed',
  'target_preserved',
] as const;

export type SemanticClosureStage = (typeof SEMANTIC_CLOSURE_STAGES)[number];
export type SemanticClosureStatus = 'passed' | 'deferred' | 'rejected' | 'not_applicable';
export type HoloScriptSurface = '.holo' | '.hsplus' | '.hs';

export interface SemanticClosureStageResult {
  status: SemanticClosureStatus;
  /**
   * Stable machine diagnostic for a deferred or rejected stage.
   * Required with `reason` so unsupported semantics are actionable.
   */
  diagnosticCode?: string;
  /** Human-readable explanation. Required for every non-passed stage. */
  reason?: string;
}

export interface SemanticClosureEntry {
  /** Stable identity inside this receipt, normally `relative-file#ast-path`. */
  constructId: string;
  surface: HoloScriptSurface;
  /** Parser/IR family such as `action`, `brain`, `function`, or `world`. */
  kind: string;
  /** Optional target-specific identity when one receipt covers several targets. */
  target?: string;
  /** Every stage is explicit. There is no implicit/skipped state. */
  stages: Record<SemanticClosureStage, SemanticClosureStageResult>;
}

export interface SemanticClosureSummary {
  totalConstructs: number;
  passedStages: number;
  deferredStages: number;
  rejectedStages: number;
  notApplicableStages: number;
  /** True when every admitted construct is reported and no stage is deferred/rejected. */
  complete: boolean;
  /** Stricter than complete: true only when no stage is target-inapplicable. */
  allStagesPassed: boolean;
}

export interface SemanticClosureReceipt {
  schemaVersion: 'holoscript.semantic-closure-receipt.v1';
  /** Digest of the complete admitted source set, supplied by the caller. */
  sourceDigest: string;
  /** Compiler/runtime build identifier. */
  toolchain: string;
  /** Sovereign execution target or explicit multi-target label. */
  target: string;
  entries: SemanticClosureEntry[];
  summary: SemanticClosureSummary;
}

export interface CreateSemanticClosureReceiptInput {
  sourceDigest: string;
  toolchain: string;
  target: string;
  /**
   * Complete construct inventory admitted by the parser/front-end.
   * The constructor fails if an expected construct has no entry or an entry was
   * not present in this inventory.
   */
  expectedConstructs: string[];
  entries: SemanticClosureEntry[];
}

function requireNonEmpty(value: string, label: string): void {
  if (!value.trim()) throw new Error(`${label} must be non-empty`);
}

function validateStage(
  entry: SemanticClosureEntry,
  stage: SemanticClosureStage,
  result: SemanticClosureStageResult | undefined
): void {
  if (!result) {
    throw new Error(`Unreported stage "${stage}" for construct "${entry.constructId}"`);
  }

  if (!['passed', 'deferred', 'rejected', 'not_applicable'].includes(result.status)) {
    throw new Error(
      `Unknown semantic-closure status "${String(result.status)}" for ${entry.constructId}:${stage}`
    );
  }

  if (result.status === 'deferred' || result.status === 'rejected') {
    if (!result.reason?.trim() || !result.diagnosticCode?.trim()) {
      throw new Error(
        `${result.status} stage "${stage}" for "${entry.constructId}" requires a reason and diagnostic code`
      );
    }
  }

  if (result.status === 'not_applicable' && !result.reason?.trim()) {
    throw new Error(`not_applicable stage "${stage}" for "${entry.constructId}" requires a reason`);
  }
}

/**
 * Construct a deterministic, fail-closed semantic-closure receipt.
 *
 * The function intentionally has no timestamp: identical source, toolchain,
 * target, and stage evidence produce byte-stable JSON after serialization.
 */
export function createSemanticClosureReceipt(
  input: CreateSemanticClosureReceiptInput
): SemanticClosureReceipt {
  requireNonEmpty(input.sourceDigest, 'sourceDigest');
  requireNonEmpty(input.toolchain, 'toolchain');
  requireNonEmpty(input.target, 'target');

  const expected = new Set<string>();
  for (const constructId of input.expectedConstructs) {
    requireNonEmpty(constructId, 'expected construct id');
    if (expected.has(constructId)) {
      throw new Error(`Duplicate expected construct "${constructId}"`);
    }
    expected.add(constructId);
  }

  const reported = new Set<string>();
  for (const entry of input.entries) {
    requireNonEmpty(entry.constructId, 'entry constructId');
    requireNonEmpty(entry.kind, `kind for "${entry.constructId}"`);
    if (!expected.has(entry.constructId)) {
      throw new Error(`Unexpected construct "${entry.constructId}" was reported`);
    }
    if (reported.has(entry.constructId)) {
      throw new Error(`Duplicate semantic-closure entry for "${entry.constructId}"`);
    }
    reported.add(entry.constructId);

    for (const stage of SEMANTIC_CLOSURE_STAGES) {
      validateStage(entry, stage, entry.stages[stage]);
    }
  }

  for (const constructId of expected) {
    if (!reported.has(constructId)) {
      throw new Error(`Unreported construct "${constructId}" in semantic-closure receipt`);
    }
  }

  const entries = [...input.entries]
    .map((entry) => ({
      ...entry,
      stages: Object.fromEntries(
        SEMANTIC_CLOSURE_STAGES.map((stage) => [stage, { ...entry.stages[stage] }])
      ) as Record<SemanticClosureStage, SemanticClosureStageResult>,
    }))
    .sort(
      (a, b) =>
        a.constructId.localeCompare(b.constructId) ||
        a.surface.localeCompare(b.surface) ||
        (a.target ?? '').localeCompare(b.target ?? '')
    );

  const summary: SemanticClosureSummary = {
    totalConstructs: entries.length,
    passedStages: 0,
    deferredStages: 0,
    rejectedStages: 0,
    notApplicableStages: 0,
    complete: true,
    allStagesPassed: true,
  };

  for (const entry of entries) {
    for (const stage of SEMANTIC_CLOSURE_STAGES) {
      switch (entry.stages[stage].status) {
        case 'passed':
          summary.passedStages++;
          break;
        case 'deferred':
          summary.deferredStages++;
          summary.complete = false;
          summary.allStagesPassed = false;
          break;
        case 'rejected':
          summary.rejectedStages++;
          summary.complete = false;
          summary.allStagesPassed = false;
          break;
        case 'not_applicable':
          summary.notApplicableStages++;
          summary.allStagesPassed = false;
          break;
      }
    }
  }

  return {
    schemaVersion: 'holoscript.semantic-closure-receipt.v1',
    sourceDigest: input.sourceDigest,
    toolchain: input.toolchain,
    target: input.target,
    entries,
    summary,
  };
}
