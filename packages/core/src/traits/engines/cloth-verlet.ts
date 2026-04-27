/**
 * cloth-verlet — pure Verlet+constraint cloth solver.
 *
 * Extracted from `packages/runtime/src/traits/PhysicsTraits.ts` ClothTrait
 * (was lines 120-214) to apply the RULING 2 per-trait wrapper pattern
 * established by NeuralAnimation: engine-agnostic core math, both core/traits
 * and runtime/traits get thin wrappers around the same engine.
 *
 * No THREE.js / PhysicsWorld dependency. Operates on raw Float32Array
 * position buffers — caller supplies them, engine modifies in place.
 *
 * /stub-audit 2026-04-26 flagged ClothTrait at 15 effective LOC + 17 compiler
 * refs as a CONFIRMED Pattern B violation. The core/traits/ClothTrait.ts
 * handler emits cloth_create/cloth_step/cloth_apply_force events that ZERO
 * runtime listeners ever consume. The actual cloth simulation lives in
 * runtime/traits/PhysicsTraits.ts (Pattern E manifestation: two unbridged
 * TraitSystems). This engine extraction is the first step toward bridging
 * — the math now lives in a place both can call.
 */

/**
 * Mutable simulation state. Caller owns the buffers; engine modifies in place
 * on every step. Float32Array layout is row-major xyz: positions[i*3..i*3+3].
 */
export interface ClothVerletState {
  /** Current vertex positions (count * 3 floats). Modified in place by stepClothVerlet. */
  positions: Float32Array;
  /** Previous-tick vertex positions (count * 3 floats). Modified in place. */
  prevPositions: Float32Array;
  /** Vertex indices that are pinned (immovable). */
  pinned: Set<number>;
  /** Distance constraints — each entry is [vertexA, vertexB, restLength]. */
  constraints: Array<[number, number, number]>;
  /** Wall-clock simulation time (seconds). Caller-managed; engine reads only. */
  time: number;
}

export interface ClothVerletConfig {
  /** 0–1 — how strongly constraints pull vertices back to rest length. */
  stiffness: number;
  /** 0–1 — velocity damping per step (0 = no damping, 1 = full stop). */
  damping: number;
  /** Gravity scale (1 = -9.81 m/s² on Y). */
  gravityScale: number;
  /** 0–1 — turbulent wind force magnitude. */
  windResponse: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

import { smoothNoise } from './noise';

/**
 * Build the structural-spring constraint set for a square cloth grid.
 *
 * Connects each vertex to its right + bottom neighbor (no diagonals — that's
 * the shear constraint set, intentionally omitted here for backward parity
 * with the previous runtime impl). Rest length is computed from the actual
 * positions in the buffer at construction time, so non-uniform initial
 * grids are supported.
 */
export function buildClothConstraints(
  resolution: number,
  positions: Float32Array
): Array<[number, number, number]> {
  const constraints: Array<[number, number, number]> = [];
  for (let i = 0; i < resolution; i++) {
    for (let j = 0; j < resolution; j++) {
      const idx = i * resolution + j;
      // Right neighbor
      if (j < resolution - 1) {
        const right = idx + 1;
        const dx = positions[idx * 3] - positions[right * 3];
        const dy = positions[idx * 3 + 1] - positions[right * 3 + 1];
        const dz = positions[idx * 3 + 2] - positions[right * 3 + 2];
        constraints.push([idx, right, Math.sqrt(dx * dx + dy * dy + dz * dz)]);
      }
      // Bottom neighbor
      if (i < resolution - 1) {
        const below = idx + resolution;
        const dx = positions[idx * 3] - positions[below * 3];
        const dy = positions[idx * 3 + 1] - positions[below * 3 + 1];
        const dz = positions[idx * 3 + 2] - positions[below * 3 + 2];
        constraints.push([idx, below, Math.sqrt(dx * dx + dy * dy + dz * dz)]);
      }
    }
  }
  return constraints;
}

/**
 * Advance one Verlet integration step + iterative constraint solve.
 *
 * Modifies state.positions and state.prevPositions in place.
 * Caller is responsible for advancing state.time before/after the call —
 * engine reads it for wind turbulence but does not modify.
 *
 * Iteration count for constraint solve = ceil(stiffness * 5).
 */
export function stepClothVerlet(
  state: ClothVerletState,
  config: ClothVerletConfig,
  delta: number
): void {
  const positions = state.positions;
  const prev = state.prevPositions;
  const pinned = state.pinned;
  const constraints = state.constraints;
  const dampingFactor = 1.0 - config.damping;

  const count = positions.length / 3;
  const gravity = -9.81 * config.gravityScale * delta * delta;

  // Wind turbulence — deterministic from state.time
  const windX = smoothNoise(state.time * 0.5, 0) * config.windResponse * delta;
  const windZ = smoothNoise(state.time * 0.7, 1) * config.windResponse * delta;

  // Verlet integration: pos' = pos + (pos - prev) * damping + gravity
  for (let i = 0; i < count; i++) {
    if (pinned.has(i)) continue;

    const ix = i * 3;
    const iy = ix + 1;
    const iz = ix + 2;
    const cx = positions[ix];
    const cy = positions[iy];
    const cz = positions[iz];

    const vx = (cx - prev[ix]) * dampingFactor;
    const vy = (cy - prev[iy]) * dampingFactor;
    const vz = (cz - prev[iz]) * dampingFactor;

    prev[ix] = cx;
    prev[iy] = cy;
    prev[iz] = cz;

    positions[ix] = cx + vx + windX;
    positions[iy] = cy + vy + gravity;
    positions[iz] = cz + vz + windZ;
  }

  // Constraint relaxation — multiple iterations for higher stiffness
  const iterations = Math.ceil(config.stiffness * 5);
  for (let iter = 0; iter < iterations; iter++) {
    for (const [a, b, restLen] of constraints) {
      const ax = positions[a * 3];
      const ay = positions[a * 3 + 1];
      const az = positions[a * 3 + 2];
      const bx = positions[b * 3];
      const by = positions[b * 3 + 1];
      const bz = positions[b * 3 + 2];

      const dx = bx - ax;
      const dy = by - ay;
      const dz = bz - az;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist < 0.0001) continue;

      const diff = ((dist - restLen) / dist) * 0.5;
      const ox = dx * diff;
      const oy = dy * diff;
      const oz = dz * diff;

      const aPin = pinned.has(a);
      const bPin = pinned.has(b);

      if (!aPin && !bPin) {
        positions[a * 3] += ox;
        positions[a * 3 + 1] += oy;
        positions[a * 3 + 2] += oz;
        positions[b * 3] -= ox;
        positions[b * 3 + 1] -= oy;
        positions[b * 3 + 2] -= oz;
      } else if (!aPin) {
        positions[a * 3] += ox * 2;
        positions[a * 3 + 1] += oy * 2;
        positions[a * 3 + 2] += oz * 2;
      } else if (!bPin) {
        positions[b * 3] -= ox * 2;
        positions[b * 3 + 1] -= oy * 2;
        positions[b * 3 + 2] -= oz * 2;
      }
    }
  }
}
