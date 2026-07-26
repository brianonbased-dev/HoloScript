/**
 * ProvenanceCalibrationRewards.ts
 *
 * Two optional, flag-gated GRPO reward terms that extend the 5 tool-grounded
 * rewards in GRPORewardFunctions.ts (founder-approved reward-spine unification,
 * 2026-07-09):
 *
 *   V  — provenance-validity: does the completion carry a derivation that
 *        REPLAYS, step by step, through a typed exact-rational semiring and
 *        lands exactly on the claimed answer, within the contract bound?
 *        Ports the CPU-proven machinery in
 *        the N1 provenance-objective reference implementation
 *        (same op table, same wire format as n1_corpus's derivation JSON).
 *
 *   Z_m — faithful-calibration (RLMF, arXiv 2606.32032):
 *        Z_m = 1 − (F_pred − F_gold)² ∈ [0,1], where F_pred is the model's
 *        self-predicted faithful-calibration parsed from the completion and
 *        F_gold is the externally measured gold value supplied per completion.
 *
 * Both terms FAIL CLOSED: a malformed derivation, malformed/missing F_pred,
 * or missing context scores 0 — it must never default to a passing value
 * (a lenient recogniser that gracefully defaults inflates producibility;
 * the malformed-raw penalty is the whole point of the term).
 *
 * @module self-improvement
 */

import type { GRPORewardFunction, RewardFunctionOptions } from './GRPORewardFunctions';

// =============================================================================
// EXACT RATIONAL ARITHMETIC
// =============================================================================
// Replay must be an exact predicate, not "close enough" — float wobble would
// let invalid derivations pass or valid ones fail at the 2dp boundary.

/** Exact rational number backed by BigInt. Always normalized, den > 0. */
export interface Rational {
  readonly num: bigint;
  readonly den: bigint;
}

function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
}

export function rational(num: bigint, den: bigint): Rational {
  if (den === 0n) throw new ReplayError('zero denominator');
  if (den < 0n) {
    num = -num;
    den = -den;
  }
  const g = gcd(num, den) || 1n;
  return { num: num / g, den: den / g };
}

/**
 * Parse a rational from the N1 wire formats: "p/q", integer ("3", "-2"),
 * or decimal ("1.93", "-0.5"). Throws ReplayError on anything else.
 */
export function parseRational(s: string): Rational {
  const str = String(s).trim();
  const frac = /^(-?\d+)\/(\d+)$/.exec(str);
  if (frac) return rational(BigInt(frac[1]), BigInt(frac[2]));
  const dec = /^(-?)(\d+)(?:\.(\d+))?$/.exec(str);
  if (dec) {
    const sign = dec[1] === '-' ? -1n : 1n;
    const whole = BigInt(dec[2]);
    const fracDigits = dec[3] ?? '';
    const scale = 10n ** BigInt(fracDigits.length);
    const num = sign * (whole * scale + BigInt(fracDigits || '0'));
    return rational(num, scale);
  }
  throw new ReplayError(`unparseable rational ${JSON.stringify(s)}`);
}

function rAdd(a: Rational, b: Rational): Rational {
  return rational(a.num * b.den + b.num * a.den, a.den * b.den);
}
function rSub(a: Rational, b: Rational): Rational {
  return rational(a.num * b.den - b.num * a.den, a.den * b.den);
}
function rMul(a: Rational, b: Rational): Rational {
  return rational(a.num * b.num, a.den * b.den);
}
function rDiv(a: Rational, b: Rational): Rational {
  if (b.num === 0n) throw new ReplayError('division by zero in derivation');
  return rational(a.num * b.den, a.den * b.num);
}
/** a <= b */
function rLte(a: Rational, b: Rational): boolean {
  return a.num * b.den <= b.num * a.den;
}
function rEq(a: Rational, b: Rational): boolean {
  return a.num === b.num && a.den === b.den;
}

/**
 * Quantize to the grader's 2-dp resolution with exact ties-to-even rounding.
 *
 * The Python reference quantizes through IEEE-754 `round(float(x), 2)` to match
 * the EXP-3 grader byte-for-byte. Here the predicate only has to agree with
 * ITSELF (produced vs claimed both pass through this function), so exact
 * rational half-to-even is used instead of reproducing float representation
 * artifacts — deterministic and free of ULP edge cases.
 */
export function quantize2dp(x: Rational): Rational {
  // round(x * 100) with ties-to-even, then / 100
  const scaledNum = x.num * 100n;
  const q = scaledNum / x.den;
  const r = scaledNum % x.den;
  if (r === 0n) return rational(q, 100n);
  // BigInt division truncates toward zero, so q is the integer nearest zero
  // and stepping away-from-zero (±1 by sign) reaches the other neighbour.
  const awayFromZero = scaledNum < 0n ? -1n : 1n;
  const absR2 = 2n * (r < 0n ? -r : r);
  let rounded = q;
  if (absR2 > x.den) {
    rounded = q + awayFromZero;
  } else if (absR2 === x.den) {
    // tie → round to even
    rounded = q % 2n === 0n ? q : q + awayFromZero;
  }
  return rational(rounded, 100n);
}

// =============================================================================
// DERIVATION REPLAY (the typed expression semiring)
// =============================================================================

export class ReplayError extends Error {}

/** One straight-line derivation step, matching the N1 JSON wire format. */
export interface DerivationStep {
  op: string;
  /** int slot index | ["const","p/q"] | ["atom",name] */
  args: Array<number | [string, string]>;
}

type OpFn = (...args: Rational[]) => Rational;

const OP_TABLE: Record<string, { arity: number; fn: OpFn }> = {
  add: { arity: 2, fn: (a, b) => rAdd(a, b) },
  sub: { arity: 2, fn: (a, b) => rSub(a, b) },
  mul: { arity: 2, fn: (a, b) => rMul(a, b) },
  div: { arity: 2, fn: (a, b) => rDiv(a, b) },
  min: { arity: 2, fn: (a, b) => (rLte(a, b) ? a : b) },
  max: { arity: 2, fn: (a, b) => (rLte(b, a) ? a : b) },
  id: { arity: 1, fn: (a) => a },
};

function resolveRef(
  ref: number | [string, string],
  atoms: Record<string, Rational>,
  slots: Rational[]
): Rational {
  if (typeof ref === 'number') {
    if (!Number.isInteger(ref) || ref < 0 || ref >= slots.length) {
      throw new ReplayError(`slot ref ${ref} out of range (have ${slots.length})`);
    }
    return slots[ref];
  }
  if (Array.isArray(ref) && ref.length === 2) {
    if (ref[0] === 'const') return parseRational(ref[1]);
    if (ref[0] === 'atom') {
      const atom = atoms[ref[1]];
      if (atom === undefined) throw new ReplayError(`unknown atom ${JSON.stringify(ref[1])}`);
      return atom;
    }
  }
  throw new ReplayError(`malformed ref ${JSON.stringify(ref)}`);
}

/**
 * Deterministically execute a straight-line derivation. Returns the value of
 * the LAST step. Throws ReplayError on any malformed/illegal step.
 */
export function replayDerivation(
  derivation: DerivationStep[],
  atoms: Record<string, Rational>
): Rational {
  if (!Array.isArray(derivation) || derivation.length === 0) {
    throw new ReplayError('empty derivation');
  }
  const slots: Rational[] = [];
  for (const st of derivation) {
    const entry = OP_TABLE[st?.op];
    if (!entry) throw new ReplayError(`unknown op ${JSON.stringify(st?.op)}`);
    if (!Array.isArray(st.args) || st.args.length !== entry.arity) {
      throw new ReplayError(`op ${st.op} expects ${entry.arity} args, got ${st.args?.length}`);
    }
    const vals = st.args.map((r) => resolveRef(r, atoms, slots));
    slots.push(entry.fn(...vals));
  }
  return slots[slots.length - 1];
}

// =============================================================================
// PROVENANCE-VALIDITY V(d)
// =============================================================================

/** Batch-level context for the provenance-validity reward. */
export interface ProvenanceRewardContext {
  /** Contract-provided inputs, e.g. { mn: "1.2", mx: "2.66", cur: "1.5" } (rational strings) */
  atoms: Record<string, string>;
  /** Contract bound [min, max] as rational strings */
  bound: [string, string];
}

/**
 * V(d) ∈ {0,1}. Valid iff the derivation replays to the claimed answer
 * (at 2dp quantization) AND the claimed answer respects the contract bound.
 */
export function provenanceValidity(
  derivation: DerivationStep[],
  claimedAnswer: Rational,
  atoms: Record<string, Rational>,
  bound: [Rational, Rational]
): { validity: 0 | 1; reason: string } {
  let produced: Rational;
  try {
    produced = replayDerivation(derivation, atoms);
  } catch (e) {
    return { validity: 0, reason: `replay-failed: ${e instanceof Error ? e.message : e}` };
  }
  if (!rEq(quantize2dp(produced), quantize2dp(claimedAnswer))) {
    return { validity: 0, reason: 'derivation does not replay to claimed answer' };
  }
  const [mn, mx] = bound;
  if (!(rLte(mn, claimedAnswer) && rLte(claimedAnswer, mx))) {
    return { validity: 0, reason: 'answer out of contract bound' };
  }
  return { validity: 1, reason: 'ok' };
}

/**
 * Extract the (claimed answer, derivation) pair from a completion.
 * Accepts the N1 wire format: a JSON object with `property_value` and
 * `derivation`. Tolerates surrounding prose by scanning for the first
 * balanced JSON object that carries both fields. Returns null when no
 * well-formed pair is found (which the reward scores as 0 — fail closed).
 */
export function parseProvenanceCompletion(
  completion: string
): { answer: string; derivation: DerivationStep[] } | null {
  for (const candidate of jsonObjectCandidates(completion)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(candidate);
    } catch {
      continue;
    }
    if (typeof parsed !== 'object' || parsed === null) continue;
    const obj = parsed as Record<string, unknown>;
    if (obj.property_value === undefined || !Array.isArray(obj.derivation)) continue;
    return {
      answer: String(obj.property_value),
      derivation: obj.derivation as DerivationStep[],
    };
  }
  return null;
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

/**
 * Provenance-validity reward function (TRL-compatible).
 *
 * Requires kwargs.provenance (atoms + bound). Without context every
 * completion scores 0 — the term is explicitly enabled, so absent context
 * is a caller error and must not silently pass.
 */
export const provenanceValidityReward: GRPORewardFunction = async (
  completions: string[],
  kwargs?: RewardFunctionOptions
): Promise<number[]> => {
  const ctx = kwargs?.provenance;
  if (!ctx) return completions.map(() => 0);

  let atoms: Record<string, Rational>;
  let bound: [Rational, Rational];
  try {
    atoms = Object.fromEntries(
      Object.entries(ctx.atoms).map(([k, v]) => [k, parseRational(v)])
    );
    bound = [parseRational(ctx.bound[0]), parseRational(ctx.bound[1])];
  } catch {
    return completions.map(() => 0);
  }

  return completions.map((completion) => {
    const parsed = parseProvenanceCompletion(completion);
    if (!parsed) return 0;
    let claimed: Rational;
    try {
      claimed = parseRational(parsed.answer);
    } catch {
      return 0;
    }
    return provenanceValidity(parsed.derivation, claimed, atoms, bound).validity;
  });
};

// =============================================================================
// FAITHFUL-CALIBRATION Z_m (RLMF)
// =============================================================================

/** Batch-level context for the faithful-calibration reward. */
export interface CalibrationRewardContext {
  /**
   * Gold faithful-calibration per completion (index-aligned), each in [0,1].
   * Computed externally (sampling-consistency intrinsic confidence) — it is
   * an input to the term, not something the term can derive.
   */
  fGold: number[];
}

/**
 * Extract the model's self-predicted faithful-calibration F_pred from a
 * completion: a JSON object carrying `f_pred` (or `predicted_calibration`)
 * as a number in [0,1]. Returns null when missing/malformed/out-of-range.
 */
export function parsePredictedCalibration(completion: string): number | null {
  for (const candidate of jsonObjectCandidates(completion)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(candidate);
    } catch {
      continue;
    }
    if (typeof parsed !== 'object' || parsed === null) continue;
    const obj = parsed as Record<string, unknown>;
    const raw = obj.f_pred ?? obj.predicted_calibration;
    if (typeof raw !== 'number' || Number.isNaN(raw)) continue;
    if (raw < 0 || raw > 1) return null; // present but out of range → malformed, not "keep looking"
    return raw;
  }
  return null;
}

/** Z_m = 1 − (F_pred − F_gold)², clamped to [0,1]. */
export function metacognitiveGap(fPred: number, fGold: number): number {
  const z = 1 - (fPred - fGold) ** 2;
  return Math.max(0, Math.min(1, z));
}

/**
 * Faithful-calibration reward function (TRL-compatible).
 *
 * Requires kwargs.calibration.fGold aligned to the batch. Malformed or
 * missing F_pred scores 0 (never defaults), as does a missing gold value.
 */
export const faithfulCalibrationReward: GRPORewardFunction = async (
  completions: string[],
  kwargs?: RewardFunctionOptions
): Promise<number[]> => {
  const fGold = kwargs?.calibration?.fGold;
  if (!Array.isArray(fGold)) return completions.map(() => 0);

  return completions.map((completion, i) => {
    const gold = fGold[i];
    if (typeof gold !== 'number' || Number.isNaN(gold) || gold < 0 || gold > 1) return 0;
    const fPred = parsePredictedCalibration(completion);
    if (fPred === null) return 0;
    return metacognitiveGap(fPred, gold);
  });
};
