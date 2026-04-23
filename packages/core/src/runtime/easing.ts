/**
 * Easing functions — extracted from HoloScriptRuntime (W1-T4 first slice)
 *
 * Pure helper: (t, easing) → number. No runtime state.
 *
 * **Vocabulary**: this module uses camelCase easing names
 * (`easeIn`, `easeOut`, `easeInOut`, plus `-Quad` variants) as
 * required by the HoloScript animation DSL. `MorphTrait.ts` has its
 * own hyphenated vocabulary (`ease-in`, `ease-out`, `ease-in-out`)
 * for CSS-style compatibility — intentionally kept separate; do not
 * unify without DSL+CSS migration.
 *
 * Behavior is LOCKED by HoloScriptRuntime.characterization.test.ts.
 * Any edit here must re-pass the characterization harness without
 * re-locking snapshots.
 *
 * **See**: W1-T4 (W4-T3 §Wave-1 split backlog)
 *         packages/core/src/HoloScriptRuntime.ts (historical home,
 *         pre-extraction LOC marker: 2449-2467)
 *         packages/core/src/HoloScriptRuntime.characterization.test.ts
 */

/** Easing curve name (camelCase — HoloScript DSL vocabulary) */
export type EasingName =
  | 'linear'
  | 'easeIn'
  | 'easeOut'
  | 'easeInOut'
  | 'easeInQuad'
  | 'easeOutQuad'
  | 'easeInOutQuad';

/**
 * Apply an easing curve to a normalized progress value.
 *
 * @param t       Progress in [0, 1]
 * @param easing  Easing curve name (unknown names fall back to linear)
 * @returns       Eased progress in [0, 1]
 */
export function applyEasing(t: number, easing: string): number {
  switch (easing) {
    case 'easeIn':
      return t * t;
    case 'easeOut':
      return t * (2 - t);
    case 'easeInOut':
      return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    case 'easeInQuad':
      return t * t;
    case 'easeOutQuad':
      return t * (2 - t);
    case 'easeInOutQuad':
      return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    case 'linear':
    default:
      return t;
  }
}
