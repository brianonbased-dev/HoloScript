/**
 * Animation system — extracted from HoloScriptRuntime (W1-T4 slice 6)
 *
 * Per-tick animation advancement: lerps each active animation from
 * `from` → `to` using the eased progress curve, writes the current
 * value back through the `setVariable` callback, and removes
 * completed non-looping entries from the state container Map.
 *
 * Supports loop + yoyo modes (yoyo swaps from/to at progress≥1;
 * loop resets startTime; both retain the entry).
 *
 * **Pattern**: state-container + callback injection (slices 4 + 3
 * combined). The caller owns `animations` (Map) and `setVariable`
 * (state-write callback) and the clock (`now`).
 *
 * Behavior is LOCKED by HoloScriptRuntime.characterization.test.ts.
 *
 * **See**: W1-T4 slice 6 (W4-T3 §Wave-1 split backlog)
 *         packages/core/src/HoloScriptRuntime.ts (pre-extraction LOC 2108-2140)
 *         packages/core/src/runtime/easing.ts (slice 1, used here)
 */

import type { Animation } from '../types';
import { applyEasing } from './easing';

/**
 * Advance all animations one tick. Mutates `animations` in place:
 * completes/removes finished entries, resets startTime for loops,
 * swaps from/to for yoyos.
 *
 * @param animations    Map of animation entries (tick target).
 * @param setVariable   Callback that writes a value into the
 *                      runtime's current scope under the dotted key
 *                      `${target}.${property}`.
 * @param now           Current time in ms (`Date.now()`). Passed in
 *                      so tests can fake the clock.
 */
export function updateAnimations(
  animations: Map<string, Animation>,
  setVariable: (name: string, value: unknown) => void,
  now: number,
): void {
  for (const [key, anim] of animations) {
    const elapsed = now - anim.startTime;
    let progress = Math.min(elapsed / anim.duration, 1);

    // Apply easing (shared pure helper from slice 1)
    progress = applyEasing(progress, anim.easing);

    // Calculate current value
    const currentValue = anim.from + (anim.to - anim.from) * progress;

    // Handle yoyo — swap direction when the ball hits the edge
    if (anim.yoyo && progress >= 1) {
      anim.startTime = now;
      [anim.from, anim.to] = [anim.to, anim.from];
    }

    // Update the property through the provided callback
    setVariable(`${anim.target}.${anim.property}`, currentValue);

    // Remove completed non-looping animations; reset looping ones.
    if (progress >= 1 && !anim.loop && !anim.yoyo) {
      animations.delete(key);
    } else if (progress >= 1 && anim.loop) {
      anim.startTime = now;
    }
  }
}
