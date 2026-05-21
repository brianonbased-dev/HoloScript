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

// ---------------------------------------------------------------------------
// Romantic dynamics / affective bonding solver (Strogatz–Rinaldi style + 5D extension)
// Used by the social simulation & affective bonding domain (Paper 26+ / HoloLand track).
// Pure math — no runtime side effects. Matches the physics-math module contract.
// States: [R, J, I, P, C] — Responsiveness, Jealousy, Idealization, Passion, Commitment
// ---------------------------------------------------------------------------

export interface LoveParams {
  a?: number; // responsiveness to partner feeling
  b?: number; // jealousy / insecurity gain
  c?: number; // idealization decay
  d?: number; // passion saturation
  k?: number; // commitment reinforcement from rhythm
}

export type LoveState = [number, number, number, number, number]; // [R, J, I, P, C]

const DEFAULT_LOVE_PARAMS: Required<LoveParams> = {
  a: 0.8,
  b: 0.3,
  c: 0.2,
  d: 0.6,
  k: 0.4,
};

/**
 * Derivative of the 5D romantic state (R, J, I, P, C).
 * Based on classic Strogatz–Rinaldi romantic dynamics extended with
 * the R,J,I,P,C taxonomy from the integrating-love research.
 */
function loveDeriv(state: LoveState, params: Required<LoveParams>): LoveState {
  const [R, J, I, P, C] = state;
  const { a, b, c, d, k } = params;

  // Responsiveness grows with partner feeling, damped by jealousy and commitment load
  const dR = a * (1 - J) * P - 0.1 * C;

  // Jealousy increases when responsiveness is high but reciprocity feels low
  const dJ = b * Math.max(0, R - P) - 0.05 * I;

  // Idealization decays over time unless fed by passion and positive rhythm
  const dI = -c * I + 0.3 * P * (1 - J);

  // Passion saturates and is modulated by idealization and commitment
  const dP = d * (I * (1 - J) - P) + 0.2 * C;

  // Commitment integrates positive rhythm (passion + low jealousy) over time
  const dC = k * Math.max(0, P - J) - 0.02 * C;

  return [dR, dJ, dI, dP, dC];
}

/**
 * One RK4 step of the romantic dynamics ODE.
 * Returns the new state after time dt (seconds or abstract steps).
 */
export function stepLoveRK4(
  state: LoveState,
  dt: number,
  params: LoveParams = {}
): LoveState {
  const p = { ...DEFAULT_LOVE_PARAMS, ...params };

  const k1 = loveDeriv(state, p);
  const k2 = loveDeriv(
    state.map((v, i) => v + (dt / 2) * k1[i]) as LoveState,
    p
  );
  const k3 = loveDeriv(
    state.map((v, i) => v + (dt / 2) * k2[i]) as LoveState,
    p
  );
  const k4 = loveDeriv(
    state.map((v, i) => v + dt * k3[i]) as LoveState,
    p
  );

  return state.map((v, i) => v + (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i])) as LoveState;
}

/**
 * Convenience: run N steps and return the final state + a simple bond score
 * (useful for traits and runtime tracking).
 */
export function integrateLove(
  initial: LoveState,
  steps: number,
  dt = 0.1,
  params: LoveParams = {}
): { final: LoveState; bondScore: number } {
  let s = [...initial] as LoveState;
  for (let i = 0; i < steps; i++) {
    s = stepLoveRK4(s, dt, params);
  }
  const [R, J, I, P, C] = s;
  const bondScore = Math.max(0, Math.min(1, (R + I + P + C) / 4 - J * 0.5));
  return { final: s, bondScore };
}
