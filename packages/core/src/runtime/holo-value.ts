/**
 * HoloValue resolution — extracted from HoloScriptRuntime (W1-T4 slice 13)
 *
 * Recursively walks a parsed `HoloValue` tree and flattens it into
 * a `HoloScriptValue` (runtime-usable form). Primitives pass through
 * unchanged. Arrays and plain objects recurse element-wise. Bind
 * markers (`__bind: true` sentinel) pass through intact so the
 * runtime can resolve them later in execution scope.
 *
 * **Pattern**: pure recursive function (pattern 1). No `this`, no
 * callbacks, no state.
 *
 * Behavior is LOCKED by HoloScriptRuntime.characterization.test.ts.
 *
 * **See**: W1-T4 slice 13 (W4-T3 §Wave-1 split backlog)
 *         packages/core/src/HoloScriptRuntime.ts (pre-extraction
 *         LOC 2507-2525)
 */

import type { HoloScriptValue, HoloValue } from '../types';

/**
 * Flatten a parsed `HoloValue` into a runtime `HoloScriptValue`.
 * Recursive; leaves (null, primitives, bind-markers) short-circuit.
 */
export function resolveHoloValue(value: HoloValue): HoloScriptValue {
  if (value === null) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((e) => resolveHoloValue(e));
  }
  // Bind marker — pass through; runtime resolves later
  if ((value as Record<string, unknown>).__bind) {
    return value as HoloScriptValue;
  }
  // Generic object — recurse per-key
  const obj: Record<string, HoloScriptValue> = {};
  for (const k in value as Record<string, unknown>) {
    obj[k] = resolveHoloValue((value as Record<string, unknown>)[k] as HoloValue);
  }
  return obj;
}
