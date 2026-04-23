/**
 * Physics math helpers — extracted from HoloScriptRuntime (W1-T4 slice 2)
 *
 * Pure Vec3/scalar math. No runtime state, no event emission,
 * no `this` binding. Callers supply inputs, get outputs.
 *
 * Behavior is LOCKED by HoloScriptRuntime.characterization.test.ts —
 * any edit here must re-pass the characterization harness without
 * re-locking snapshots.
 *
 * **See**: W1-T4 slice 2 (W4-T3 §Wave-1 split backlog)
 *         packages/core/src/HoloScriptRuntime.ts (historical home,
 *         pre-extraction LOC marker: 2419-2442)
 *         packages/core/src/HoloScriptRuntime.characterization.test.ts
 *         packages/core/src/runtime/easing.ts (slice 1 sibling)
 */

import type { SpatialPosition } from '../types';

/** Earth-surface gravity magnitude (m/s²) used by arc compensation. */
const GRAVITY = 9.81;

/** Distance below which arc calculation degenerates to pure-upward velocity. */
const ARC_MIN_DISTANCE = 0.1;

/**
 * Compute an initial velocity vector that moves a projectile from
 * `start` to `end` along a simple ballistic arc with the given
 * horizontal speed. Y component includes gravity compensation so
 * the projectile lands at `end.y` at time t = dist/speed.
 *
 * If horizontal distance is under {@link ARC_MIN_DISTANCE}, returns
 * a pure upward velocity `[0, speed, 0]` (degenerate case — shooter
 * and target nearly coincident, any horizontal solution is unstable).
 *
 * @param start  World-space origin (m).
 * @param end    World-space target (m).
 * @param speed  Horizontal travel speed (m/s). Must be > 0.
 * @returns      Velocity vector `[vx, vy, vz]` (m/s).
 */
export function calculateArc(
  start: SpatialPosition,
  end: SpatialPosition,
  speed: number,
): [number, number, number] {
  const dx = end[0] - start[0];
  const dz = end[2] - start[2];
  const dy = end[1] - start[1];
  const dist = Math.sqrt(dx * dx + dz * dz);

  if (dist < ARC_MIN_DISTANCE) return [0, speed, 0];

  // Basic projectile velocity with upward arc:
  //   v_x = dx / t
  //   v_z = dz / t
  //   v_y = dy / t + 0.5 * g * t  (gravity compensation)
  const t = dist / speed;
  const vx = dx / t;
  const vz = dz / t;
  const vy = dy / t + 0.5 * GRAVITY * t;

  return [vx, vy, vz];
}
