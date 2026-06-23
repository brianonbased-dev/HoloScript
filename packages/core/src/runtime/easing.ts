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
  | 'easeInOutQuad'
  // `spring` overshoots above 1 before settling — physics easing, see below.
  | 'spring';

/**
 * Spring (physics) easing — the analytic step response of an underdamped
 * mass-spring-damper, i.e. the closed-form solution of the same 2nd-order
 * ODE the physics solver integrates numerically (D.104: one physics,
 * expressed as a pure easing curve so `.holo`/`.hsplus` can author it via
 * `move <t> to <d> over <n> easing spring`). The curve rises, overshoots
 * once (~31% with these constants), then settles back to 1.
 *
 * Endpoints are anchored (see {@link springEasing}) so a duration-locked
 * `move … over <n>` lands exactly on target: f(0)=0, f(1)=1.
 */
const SPRING_ZETA = 0.35; // damping ratio (<1 ⇒ underdamped ⇒ visible overshoot)
const SPRING_OMEGA = 8.38; // natural angular frequency (first peak ≈ t=0.4, settled by t=1)
const SPRING_OMEGA_D = SPRING_OMEGA * Math.sqrt(1 - SPRING_ZETA * SPRING_ZETA);

/** Raw underdamped step response: 0 at t=0, oscillates toward 1. May exceed 1. */
function springStepResponse(t: number): number {
  const decay = Math.exp(-SPRING_ZETA * SPRING_OMEGA * t);
  const osc =
    Math.cos(SPRING_OMEGA_D * t) +
    ((SPRING_ZETA * SPRING_OMEGA) / SPRING_OMEGA_D) * Math.sin(SPRING_OMEGA_D * t);
  return 1 - decay * osc;
}

/** Residual at t=1 (system has not fully settled); used to anchor f(1)=1 exactly. */
const SPRING_RESIDUAL = 1 - springStepResponse(1);

/**
 * Spring easing curve. Keeps the overshoot of the raw step response but
 * applies a tiny linear correction so endpoints are exact: f(0)=0, f(1)=1.
 * Returns values >1 mid-curve (the overshoot) — consumers that lerp
 * `from + (to-from)*f(t)` get the spring bounce; consumers that clamp lose it.
 */
export function springEasing(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return springStepResponse(t) + t * SPRING_RESIDUAL;
}

/**
 * Apply an easing curve to a normalized progress value.
 *
 * @param t       Progress in [0, 1]
 * @param easing  Easing curve name (unknown names fall back to linear)
 * @returns       Eased progress (normally [0, 1]; `spring` overshoots above 1
 *                mid-curve before settling exactly to 1 at t=1)
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
    case 'spring':
      return springEasing(t);
    case 'linear':
    default:
      return t;
  }
}
