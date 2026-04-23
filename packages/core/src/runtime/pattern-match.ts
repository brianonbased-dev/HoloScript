/**
 * Pattern matching — extracted from HoloScriptRuntime (W1-T4 slice 11)
 *
 * Pure helper for the `@match` expression's case-pattern tests.
 * Supports wildcard patterns (`_`, `else`, `default`), direct
 * equality, type-name patterns (`string`, `number`, `boolean`,
 * `array`, `object`), and range patterns (`[min, max]` numeric).
 *
 * **Pattern**: pure function (pattern 1). No `this`, no callbacks,
 * no state. Exported as `patternMatches(pattern, value): boolean`.
 *
 * Behavior is LOCKED by HoloScriptRuntime.characterization.test.ts.
 *
 * **See**: W1-T4 slice 11 (W4-T3 §Wave-1 split backlog)
 *         packages/core/src/HoloScriptRuntime.ts (pre-extraction
 *         LOC 3118-3151)
 *         packages/core/src/runtime/condition-evaluator.ts (slice 3)
 */

import type { HoloScriptValue } from '../types';

/** Pattern strings that match any value (equivalent to `default`). */
const WILDCARD_PATTERNS = new Set(['_', 'else', 'default']);

/** Primitive type-name patterns and their JS type checks. */
type TypeCheck = (v: HoloScriptValue) => boolean;
const TYPE_PATTERNS: Readonly<Record<string, TypeCheck>> = {
  string: (v) => typeof v === 'string',
  number: (v) => typeof v === 'number',
  boolean: (v) => typeof v === 'boolean',
  array: (v) => Array.isArray(v),
  object: (v) => typeof v === 'object' && v !== null,
};

/**
 * Test whether `pattern` matches `value`. Match order:
 *   1. Wildcard patterns (`_`, `else`, `default`) match anything.
 *   2. Strict equality (`===`).
 *   3. Type-name patterns (`string`, `number`, `boolean`, `array`,
 *      `object`) match the corresponding JS type.
 *   4. Range patterns — a 2-element `[min, max]` tuple matches a
 *      number `v` iff `min ≤ v ≤ max`.
 *   5. Otherwise, no match.
 */
export function patternMatches(pattern: HoloScriptValue, value: HoloScriptValue): boolean {
  // Wildcard pattern
  if (typeof pattern === 'string' && WILDCARD_PATTERNS.has(pattern)) {
    return true;
  }

  // Direct equality
  if (pattern === value) {
    return true;
  }

  // Type-name pattern (string literal naming a JS type)
  if (typeof pattern === 'string' && pattern in TYPE_PATTERNS) {
    return TYPE_PATTERNS[pattern](value);
  }

  // Range pattern: [min, max] matches values in that inclusive range
  if (Array.isArray(pattern) && pattern.length === 2) {
    const [min, max] = pattern;
    if (
      typeof value === 'number' &&
      typeof min === 'number' &&
      typeof max === 'number' &&
      value >= min &&
      value <= max
    ) {
      return true;
    }
  }

  return false;
}
