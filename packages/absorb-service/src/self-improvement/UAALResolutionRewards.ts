/**
 * UAALResolutionRewards.ts
 *
 * ONE generic GRPO reward term covering all 14 registered uAAL resolver
 * families (`@holoscript/uaal` `UAAL_RESOLVED_FAMILIES`): does the model's
 * emitted disposition (a committed answer, or an honest abstention with a
 * typed reason) match the verdict the CANONICAL resolver reaches on the
 * same oracle IR?
 *
 * Design source: the uAAL resolver-verdict GRPO reward contract (B2).
 * The family is DATA in the batch context (`kwargs.uaalResolution`),
 * never a branch in this file — adding family #15 to the verifier
 * (`RESOLVERS` in `@holoscript/uaal`'s verifier.ts) is the only change
 * needed; this term requires zero edits.
 *
 * Gold is computed IN-TERM via the imported `gradeByResolver` — the
 * verifier of record IS the labeler, at reward time, same binary as corpus
 * time (roadmap Wave 0.1: never re-derive a verdict a builder could get
 * wrong independently). Do NOT re-implement `RESOLVERS` dispatch here.
 *
 * The verdict->reward table (memo §2) is the core of this term and is NOT
 * a tunable — it is a strict-dominance abstain-always guard: on solvable
 * rows, attempting has expected reward `0.25 + 0.75*acc >= 0.25`, which
 * strictly dominates abstaining (0.15) at every accuracy including zero;
 * on unsolvable rows abstaining (>=0.75) strictly dominates committing
 * (0.0). Retuning these seven numbers without re-deriving that dominance
 * argument reopens the abstain-always / confabulate-always equilibria the
 * P.041 pilot closed. See the memo §2 for the full derivation.
 *
 * @module self-improvement
 */

import type { MeaningResolutionStatus } from '@holoscript/meaning';
import type { GRPORewardFunction, RewardFunctionOptions } from './GRPORewardFunctions';
import {
  gradeByResolver,
  type UAALResolvedFamily,
  type VerifierQuery,
  type VerifierLabel,
} from '@holoscript/uaal';

// =============================================================================
// CONTEXT (batch-level, index-aligned — the caller supplies the oracle IR;
// gold is computed IN-TERM, never supplied precomputed)
// =============================================================================

/** One row of the uAAL-resolution batch context, index-aligned to completions. */
export interface UAALResolutionRow {
  family: UAALResolvedFamily;
  /** The scene's oracle IR — the resolver's input, NOT shown to the model. */
  oracleIr: unknown;
  /** Target ids some resolvers need alongside the IR (agent/object/action/...). */
  query?: VerifierQuery;
}

/**
 * Batch-level context for the uAAL-resolution disposition reward.
 * `rows[i]` is `null` when a completion has no associated resolution scene
 * (e.g. a mixed-purpose batch) — that completion fails closed to 0, same as
 * a missing context slot entirely.
 */
export interface UAALResolutionRewardContext {
  rows: Array<UAALResolutionRow | null>;
}

// =============================================================================
// EMISSION PARSING — the gap-disposition emission format (memo §1):
// a committed answer `{"status":"resolved","answer":{...}}` OR an honest
// abstention `{"status":"unresolvable","reason":"...","code":"...",...}`.
// Tolerates the fields living at the top level or nested under a
// `resolution`/`gap` sub-object (the same tolerant scan producibility-
// gap.mjs's detectAbstention/detectFamilyCode use for model output).
// =============================================================================

/** Parsed disposition extracted from a completion. `null` = malformed/unparseable. */
export interface ParsedUaalEmission {
  /** true = the model committed an answer; false = the model abstained. */
  committed: boolean;
  /** Present when committed. Compared against gold.answer by deep-subset-equal. */
  answer?: unknown;
  /** Present when abstained. The coarse base-bucket gap reason. */
  reason?: string;
  /** Present when abstained. The family-scoped gap code (e.g. 'affordance.unstated_precondition'). */
  code?: string;
}

/** Yield the whole string, then each balanced {...} block, as JSON candidates. */
function* jsonObjectCandidates(text: string): Generator<string> {
  yield text;
  let depth = 0;
  let start = -1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && start >= 0) {
        yield text.slice(start, i + 1);
        start = -1;
      }
      if (depth < 0) depth = 0;
    }
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Parse the model's committed-answer-or-honest-abstention emission from a
 * completion. Returns `null` on anything that isn't a well-formed instance
 * of the contract (malformed_raw / unparseable — fails closed, scored 0).
 */
export function parseUaalEmission(completion: string): ParsedUaalEmission | null {
  for (const candidate of jsonObjectCandidates(completion)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(candidate);
    } catch {
      continue;
    }
    if (!isPlainObject(parsed)) continue;

    const blocks = [parsed, parsed.resolution, parsed.gap].filter(isPlainObject);
    if (blocks.length === 0) continue;

    let status: string | null = null;
    let reason: string | undefined;
    let code: string | undefined;
    let unresolvableFlag = false;
    for (const b of blocks) {
      if (status === null && typeof b.status === 'string') status = b.status.toLowerCase();
      if (reason === undefined && typeof b.reason === 'string') reason = b.reason;
      if (code === undefined && typeof b.code === 'string' && b.code.trim()) code = b.code.trim();
      if (b.unresolvable === true || b.resolvable === false) unresolvableFlag = true;
    }

    const isUnresolvable =
      status === 'unresolvable' ||
      status === 'unknown' ||
      status === 'undetermined' ||
      unresolvableFlag;
    if (isUnresolvable) {
      return { committed: false, reason, code };
    }
    if (isPlainObject(parsed.answer)) {
      return { committed: true, answer: parsed.answer };
    }
    // status==='resolved' but no answer object, or no recognisable disposition
    // field at all: keep scanning remaining candidates before giving up.
  }
  return null;
}

/** True iff every key in `want` exists in `got` with a deeply-equal value (extra keys in got are fine). */
export function deepSubsetEqual(want: unknown, got: unknown): boolean {
  if (want === null || typeof want !== 'object') return want === got;
  if (got === null || typeof got !== 'object') return false;
  return Object.entries(want as Record<string, unknown>).every(([k, v]) =>
    deepSubsetEqual(v, (got as Record<string, unknown>)[k])
  );
}

// =============================================================================
// THE VERDICT -> REWARD TABLE (memo §2 — do not retune without re-deriving
// the dominance argument in the memo's §2)
// =============================================================================

export type UaalResolutionClass =
  | 'resolved_correct'
  | 'resolved_wrong'
  | 'over_abstention'
  | 'honest_abstain_reason_correct'
  | 'honest_abstain_reason_wrong'
  | 'confabulation'
  | 'malformed';

export const UAAL_RESOLUTION_REWARD_TABLE: Readonly<Record<UaalResolutionClass, number>> =
  Object.freeze({
    resolved_correct: 1.0,
    resolved_wrong: 0.25,
    over_abstention: 0.15,
    honest_abstain_reason_correct: 1.0,
    honest_abstain_reason_wrong: 0.75,
    confabulation: 0.0,
    malformed: 0.0,
  });

/** Per-completion grading receipt (distinct 'malformed' class — penalised, never excluded, per W.775). */
export interface UaalResolutionReceipt {
  class: UaalResolutionClass;
  reward: number;
  /** The resolver's gold status for this row, or null when the row/gold itself failed closed. */
  goldStatus: MeaningResolutionStatus | null;
  goldCode?: string;
  emittedCode?: string;
  /**
   * True when the gold gap is ALEATORIC (irreducible_stochastic) rather than epistemic. Observability
   * only — the reward numbers are unchanged: an aleatoric gold is `status:'unresolvable'`, so an honest
   * abstention grades honest_abstain (like any legitimate unresolvable row) and over_abstention is
   * structurally impossible for it. Surfacing the flag lets a corpus/receipt audit separate a
   * calibrated random-outcome abstention from a missing-info one.
   */
  aleatoric?: true;
}

const MALFORMED_RECEIPT: UaalResolutionReceipt = Object.freeze({
  class: 'malformed',
  reward: UAAL_RESOLUTION_REWARD_TABLE.malformed,
  goldStatus: null,
});

/**
 * True iff the gold gap is ALEATORIC (irreducible_stochastic) — read structurally from the
 * discriminant so this compiles regardless of whether the resolved @holoscript/meaning typings already
 * carry the aleatoric-gap union. Fail-closed: any non-`true` value (an epistemic gap, an older gap
 * shape, undefined) is treated as not-aleatoric.
 */
function isAleatoricGold(gap: VerifierLabel['gap']): boolean {
  return (gap as { aleatoric?: unknown } | undefined)?.aleatoric === true;
}

/**
 * Grade one completion against its resolution row. Gold is computed HERE via
 * the imported `gradeByResolver` — never supplied precomputed, never
 * re-derived by a local port. Missing row / resolver throw / unparseable
 * completion all fail closed to the 'malformed' class (reward 0).
 */
export function gradeUaalResolutionCompletion(
  completion: string,
  row: UAALResolutionRow | null | undefined
): UaalResolutionReceipt {
  if (!row) return MALFORMED_RECEIPT;

  let gold: VerifierLabel;
  try {
    gold = gradeByResolver(row.family, row.oracleIr, row.query ?? {});
  } catch {
    return MALFORMED_RECEIPT;
  }

  const emission = parseUaalEmission(completion);
  if (!emission) return { ...MALFORMED_RECEIPT, goldStatus: gold.status };

  if (gold.status === 'resolved') {
    if (!emission.committed) {
      return {
        class: 'over_abstention',
        reward: UAAL_RESOLUTION_REWARD_TABLE.over_abstention,
        goldStatus: gold.status,
      };
    }
    const correct = deepSubsetEqual(gold.answer, emission.answer);
    const cls: UaalResolutionClass = correct ? 'resolved_correct' : 'resolved_wrong';
    return { class: cls, reward: UAAL_RESOLUTION_REWARD_TABLE[cls], goldStatus: gold.status };
  }

  // gold.status === 'unresolvable' — an ALEATORIC (irreducible_stochastic) gold reaches here too: it is
  // just as `unresolvable` as an epistemic gap, so committing is confabulation and abstaining is an
  // honest abstention. over_abstention is structurally impossible for it (that class fires only on a
  // RESOLVED gold above). An aleatoric outcome must never be graded as if the model wrongly declined a
  // knowable answer — abstaining IS the calibrated verdict.
  const aleatoric = isAleatoricGold(gold.gap);
  if (emission.committed) {
    return {
      class: 'confabulation',
      reward: UAAL_RESOLUTION_REWARD_TABLE.confabulation,
      goldStatus: gold.status,
      ...(aleatoric ? { aleatoric: true } : {}),
    };
  }
  // Family-scoped gap.code is only present on resolvers upgraded to the structured-gap
  // form (roadmap Wave 0.2). The 3 founding families (occlusion/norm_status/dischargeable)
  // still return only the coarse base `reason` — fall back to comparing that instead of
  // silently treating every one of their abstentions as reason-correct or reason-wrong.
  const goldCode = gold.gap?.code;
  const reasonCorrect =
    goldCode !== undefined ? emission.code === goldCode : emission.reason === gold.reason;
  const cls: UaalResolutionClass = reasonCorrect
    ? 'honest_abstain_reason_correct'
    : 'honest_abstain_reason_wrong';
  return {
    class: cls,
    reward: UAAL_RESOLUTION_REWARD_TABLE[cls],
    goldStatus: gold.status,
    ...(goldCode !== undefined ? { goldCode } : {}),
    ...(emission.code !== undefined ? { emittedCode: emission.code } : {}),
    ...(aleatoric ? { aleatoric: true } : {}),
  };
}

/** Batch convenience wrapper — grades every completion against its aligned row. */
export function gradeUaalResolutionBatch(
  completions: string[],
  rows: ReadonlyArray<UAALResolutionRow | null>
): UaalResolutionReceipt[] {
  return completions.map((completion, i) => gradeUaalResolutionCompletion(completion, rows[i]));
}

// =============================================================================
// THE REWARD FUNCTION (TRL-compatible)
// =============================================================================

/**
 * uAAL-resolution disposition reward. Requires `kwargs.uaalResolution.rows`
 * (index-aligned to `completions`); a missing context slot fails every
 * completion in the batch closed to 0 (spine contract — see
 * ProvenanceCalibrationRewards.ts / BeneficiaryRewards.ts for the same rule).
 */
export const uaalResolutionReward: GRPORewardFunction = async (
  completions: string[],
  kwargs?: RewardFunctionOptions
): Promise<number[]> => {
  const rows = kwargs?.uaalResolution?.rows;
  if (!Array.isArray(rows)) return completions.map(() => 0);
  return completions.map((completion, i) => {
    try {
      return gradeUaalResolutionCompletion(completion, rows[i]).reward;
    } catch {
      return 0;
    }
  });
};

// =============================================================================
// Z_m NATIVE GOLD (memo §4, flag-gated) — F_gold = 1 iff the emission's
// STATUS DECISION was correct: for a resolved row that means committing AND
// being right (a wrong committed answer is itself a miscalibration, not a
// content slip, because the model asserted certainty it hadn't earned); for
// an unresolvable row it means abstaining, independent of whether the stated
// REASON was also right (reason-correctness is a finer skill the disposition
// term already scores at 1.00 vs 0.75 — folding it into F_gold too would
// double-count the same signal Z_m and uaalResolutionReward must not share).
// =============================================================================

const STATUS_MATCH_CLASSES: ReadonlySet<UaalResolutionClass> = new Set([
  'resolved_correct',
  'honest_abstain_reason_correct',
  'honest_abstain_reason_wrong',
]);

/**
 * Compute Z_m's native gold (`F_gold`) per completion from the SAME
 * uAAL-resolution rows the disposition term grades. Flag-gated: only call
 * this when both `enableUaalResolution` and `enableFaithfulCalibration` are
 * enabled together, and feed the result into `kwargs.calibration.fGold` — it
 * does not itself touch the orchestrator (Z_m's own `enableFaithfulCalibration`
 * flag already gates the term; this only supplies its external gold).
 */
export function computeUaalStatusMatchGold(
  completions: string[],
  rows: ReadonlyArray<UAALResolutionRow | null>
): number[] {
  return gradeUaalResolutionBatch(completions, rows).map((receipt) =>
    STATUS_MATCH_CLASSES.has(receipt.class) ? 1 : 0
  );
}
