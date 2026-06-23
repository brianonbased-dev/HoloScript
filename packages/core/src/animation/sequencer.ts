/**
 * Sequencer — pure keyframe-track interpolation (the runtime core harvested from
 * Theatre.js's Sequence model). Given a track's ordered keyframes and a time `t`,
 * return the interpolated value, applying the **per-segment easing**: the
 * destination keyframe's `easing` governs the segment arriving at it (the
 * Theatre.js / CSS `transition-timing-function` convention). Reuses the shipped
 * {@link applyEasing} so a keyframe can ease with `spring` / `bounce` / `easeX`
 * — the direct payoff of the anime.js harvest.
 *
 * Pure and framework-free so it is unit-testable and reused by ANY consumer: the
 * studio `<TimelineDriver>` samples each frame and publishes via
 * `setTimelineValue`, and `__animatedTransform` consumers read the result. The
 * compile bridge that resolves AST `KeyframeNode.value` (an expression) to a
 * number and feeds compiled tracks to the driver is the render-parity slice (S4).
 */
import { applyEasing } from '../runtime/easing';

/**
 * A resolved (numeric) keyframe — the compile bridge resolves the AST
 * `KeyframeNode.value` expression to a number before the runtime samples it.
 */
export interface SampledKeyframe {
  /** Position along the track (seconds, or normalized 0..1 — the driver decides). */
  time: number;
  /** Target value at this keyframe. */
  value: number;
  /**
   * Easing for the segment ENDING at this keyframe (anime.js/Theatre/CSS
   * convention: the destination keyframe governs the incoming tween). Defaults
   * to `linear`. Accepts any {@link applyEasing} name incl. `spring`/`bounce`.
   */
  easing?: string;
}

/**
 * Sample a keyframe track at time `t`.
 *
 * - empty track → `0`
 * - single keyframe → its value at any `t`
 * - `t` at/below the first keyframe → first value (clamp)
 * - `t` at/above the last keyframe → last value (clamp)
 * - between `k[i]` and `k[i+1]` → `lerp(k[i].value, k[i+1].value, ease(localT))`,
 *   where `ease = k[i+1].easing` and `localT = (t - k[i].time) / span`.
 *
 * Note: `spring` (and any overshooting ease) can push the eased factor past 1,
 * so the sampled value overshoots the destination mid-segment then settles —
 * that is the spring bounce, by design. Keyframes are defensively sorted by time.
 */
export function sampleTrack(
  keyframes: SampledKeyframe[],
  t: number,
  defaultEasing = 'linear'
): number {
  if (keyframes.length === 0) return 0;
  if (keyframes.length === 1) return keyframes[0].value;

  const ks = keyframes.slice().sort((a, b) => a.time - b.time);
  if (t <= ks[0].time) return ks[0].value;
  const last = ks[ks.length - 1];
  if (t >= last.time) return last.value;

  for (let i = 0; i < ks.length - 1; i++) {
    const a = ks[i];
    const b = ks[i + 1];
    if (t >= a.time && t <= b.time) {
      const span = b.time - a.time;
      const localT = span <= 0 ? 0 : (t - a.time) / span;
      const eased = applyEasing(localT, b.easing ?? defaultEasing);
      return a.value + (b.value - a.value) * eased;
    }
  }
  return last.value;
}
