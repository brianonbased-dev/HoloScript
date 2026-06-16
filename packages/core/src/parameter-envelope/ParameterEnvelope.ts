/**
 * ParameterEnvelope — first-class valid-parameter domain for simulation receipts.
 *
 * ## Purpose (H1 roadmap §ParameterEnvelope)
 *
 * A simulation run proves an instance. A *parameter envelope* names the SPACE
 * the instance lives in. Within-envelope remixes inherit the proof automatically;
 * out-of-envelope remixes either re-discharge (re-run the proof for the new
 * params) or emit an honest error rather than silently inheriting a stale receipt.
 *
 * This closes the "prove the space, not the instance" gap identified in the
 * simulation-as-proof north star.
 *
 * ## Design constraints
 *
 * - DOMAIN-NEUTRAL. No domain nouns (no "Young's modulus", "dose", "temperature").
 *   Physical units go via DimensionalTypeSystem; envelope records carry an
 *   optional `unit` string for human display only.
 * - NEVER hardcodes domain vocabulary. Retires `UNIT_RANGES` hardcodes in plugins.
 * - Records are DATA (JSON-serializable). The envelope itself is carried into the
 *   DomainSimulationReceipt as `parameterEnvelope` so it is part of the proof.
 *
 * ## `onViolation` semantics
 *
 *   'warn'        — record the violation but keep `passed: true`; the run can
 *                   proceed but the receipt notes the out-of-envelope param.
 *   'error'       — record the violation and set `passed: false`; callers should
 *                   refuse to run or mark the receipt as invalid.
 *   'redischarge' — special: the run is OUT of the envelope but a RE-RUN with the
 *                   new params is required to inherit the proof. The receipt
 *                   carries `redischarge: true`; callers must trigger re-proof.
 *
 * Default `onViolation` when absent from a record is `'error'`.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

/** Action to take when a parameter is outside its declared envelope. */
export type EnvelopeViolationAction = 'warn' | 'error' | 'redischarge';

/**
 * A single parameter's valid domain declaration.
 *
 * Exactly one of the following must be provided:
 *   - `min` / `max` — for numeric ranges (either or both may be present)
 *   - `allowed`     — for discrete allowed values (any primitive type)
 *
 * If neither is provided the record is a no-op (the param is always in-envelope).
 * `param` is the name of the config key this record guards.
 */
export interface ParameterEnvelopeRecord {
  /** Config key this record guards. Used as the display name in violations. */
  param: string;
  /**
   * Inclusive lower bound (numeric params only).
   * Absent → no lower bound.
   */
  min?: number;
  /**
   * Inclusive upper bound (numeric params only).
   * Absent → no upper bound.
   */
  max?: number;
  /**
   * Explicit set of allowed values (any primitive).
   * When provided together with min/max, a value must satisfy BOTH the
   * range constraint AND appear in this set.
   */
  allowed?: ReadonlyArray<string | number | boolean | null>;
  /**
   * Human-readable unit label for this parameter (e.g. "m/s", "kg").
   * Pure display; not machine-validated by this module.
   */
  unit?: string;
  /**
   * Action when the param value is outside this envelope.
   * Default: `'error'`.
   */
  onViolation?: EnvelopeViolationAction;
}

/** A recorded violation from `checkParameterEnvelope`. */
export interface EnvelopeViolation {
  /** The parameter name (= `record.param`). */
  param: string;
  /** The actual value that was checked. */
  value: unknown;
  /** The record that declared the envelope. */
  record: ParameterEnvelopeRecord;
  /** The action triggered by this violation. */
  verdict: EnvelopeViolationAction;
  /** Human-readable description of the violation. */
  message: string;
}

/** Result of `checkParameterEnvelope`. */
export interface EnvelopeCheckResult {
  /**
   * `true` when there are no `'error'`-verdict violations (warn and
   * redischarge violations are present in `violations` but do not
   * set `passed: false`).
   */
  passed: boolean;
  /**
   * `true` when ANY violation has verdict `'redischarge'`.
   * Callers must re-run the proof before the receipt can be inherited.
   */
  redischarge: boolean;
  /** All recorded violations, regardless of verdict. */
  violations: EnvelopeViolation[];
}

/** An array of envelope records forming a complete parameter envelope. */
export type ParameterEnvelope = ParameterEnvelopeRecord[];

// ── Core logic ────────────────────────────────────────────────────────────────

/**
 * Check whether a single numeric or discrete value falls within a record's envelope.
 *
 * Returns `true` when the value satisfies all constraints declared in `record`.
 * A record with no constraints (no min, no max, no allowed) always returns `true`.
 */
export function isInEnvelope(value: unknown, record: ParameterEnvelopeRecord): boolean {
  const { min, max, allowed } = record;

  // Numeric range check (applies to number values only)
  if (typeof value === 'number') {
    if (min !== undefined && value < min) return false;
    if (max !== undefined && value > max) return false;
  } else if (min !== undefined || max !== undefined) {
    // Non-numeric value against a numeric-range constraint → always out
    return false;
  }

  // Discrete allowed-set check
  if (allowed !== undefined) {
    if (!allowed.includes(value as string | number | boolean | null)) return false;
  }

  return true;
}

/**
 * Check a flat params map against a ParameterEnvelope.
 *
 * For each record in `envelope`:
 *   1. If the param key is absent from `params`, the record is skipped (no
 *      violation — the absence itself may be intentional, checked elsewhere).
 *   2. Otherwise, `isInEnvelope(params[record.param], record)` is called.
 *      On failure, a violation is recorded with the declared `onViolation` action.
 *
 * @param params  Flat key→value map of the run's config parameters.
 * @param envelope  Array of `ParameterEnvelopeRecord` declarations.
 * @returns `EnvelopeCheckResult` with `passed`, `redischarge`, and `violations`.
 */
export function checkParameterEnvelope(
  params: Record<string, unknown>,
  envelope: ParameterEnvelope,
): EnvelopeCheckResult {
  const violations: EnvelopeViolation[] = [];

  for (const record of envelope) {
    if (!(record.param in params)) continue; // absent key → skip

    const value = params[record.param];
    if (isInEnvelope(value, record)) continue; // in-envelope → ok

    const verdict = record.onViolation ?? 'error';
    const rangeDesc = buildRangeDescription(record);
    const unitSuffix = record.unit ? ` ${record.unit}` : '';
    violations.push({
      param: record.param,
      value,
      record,
      verdict,
      message:
        `Parameter "${record.param}" value ${JSON.stringify(value)}${unitSuffix} ` +
        `is outside its declared envelope (${rangeDesc})`,
    });
  }

  const passed = violations.every((v) => v.verdict !== 'error');
  const redischarge = violations.some((v) => v.verdict === 'redischarge');
  return { passed, redischarge, violations };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildRangeDescription(record: ParameterEnvelopeRecord): string {
  const parts: string[] = [];
  if (record.min !== undefined) parts.push(`min=${record.min}`);
  if (record.max !== undefined) parts.push(`max=${record.max}`);
  if (record.allowed !== undefined) {
    parts.push(`allowed=[${record.allowed.map((v) => JSON.stringify(v)).join(', ')}]`);
  }
  return parts.length > 0 ? parts.join(', ') : 'unconstrained';
}
