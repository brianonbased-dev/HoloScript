/**
 * AmbisonicDecoderCoordinator — Production Test Suite
 *
 * Two layers:
 *  1. Adversarial checks on the real spherical-harmonic rotation math
 *     (orthonormality, proper-rotation determinant, identity, round-trip,
 *     W-channel invariance) for ambisonic orders 1–3.
 *  2. Integration: attach the REAL AmbisonicsTrait, tick it with a rotated head
 *     pose, and assert the coordinator received `ambisonics_update_rotation`
 *     and mutated decoder rotation state. This assertion FAILS against the
 *     pre-coordinator code (0 listeners → soundfield never rotates).
 */
import { describe, it, expect, vi } from 'vitest';
import { EventBus } from '../events';
import {
  AmbisonicDecoderCoordinator,
  createAmbisonicDecoderCoordinator,
} from '../AmbisonicDecoderCoordinator';
import {
  ambisonicRotationMatrix,
  quaternionToMatrix3,
  channelCount,
  type Matrix,
  type Quaternion,
} from '../ambisonicRotation';
// Real trait source (type-only internal imports → safe to load directly).
import { ambisonicsHandler } from '../../../core/src/traits/AmbisonicsTrait';

// ─── matrix helpers ─────────────────────────────────────────────────────────

function transpose(M: Matrix): Matrix {
  const r = M.length;
  const c = M[0].length;
  const T: Matrix = Array.from({ length: c }, () => new Array<number>(r).fill(0));
  for (let i = 0; i < r; i++) for (let j = 0; j < c; j++) T[j][i] = M[i][j];
  return T;
}

function multiply(A: Matrix, B: Matrix): Matrix {
  const n = A.length;
  const m = B[0].length;
  const k = B.length;
  const C: Matrix = Array.from({ length: n }, () => new Array<number>(m).fill(0));
  for (let i = 0; i < n; i++)
    for (let j = 0; j < m; j++) {
      let s = 0;
      for (let t = 0; t < k; t++) s += A[i][t] * B[t][j];
      C[i][j] = s;
    }
  return C;
}

function isIdentity(M: Matrix, eps = 1e-9): boolean {
  for (let i = 0; i < M.length; i++)
    for (let j = 0; j < M[i].length; j++) {
      const expected = i === j ? 1 : 0;
      if (Math.abs(M[i][j] - expected) > eps) return false;
    }
  return true;
}

function maxAbsDiff(A: Matrix, B: Matrix): number {
  let m = 0;
  for (let i = 0; i < A.length; i++)
    for (let j = 0; j < A[i].length; j++) m = Math.max(m, Math.abs(A[i][j] - B[i][j]));
  return m;
}

/** Determinant via Gaussian elimination with partial pivoting. */
function determinant(M: Matrix): number {
  const n = M.length;
  const a = M.map((row) => row.slice());
  let det = 1;
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(a[r][col]) > Math.abs(a[pivot][col])) pivot = r;
    if (Math.abs(a[pivot][col]) < 1e-12) return 0;
    if (pivot !== col) {
      [a[pivot], a[col]] = [a[col], a[pivot]];
      det = -det;
    }
    det *= a[col][col];
    for (let r = col + 1; r < n; r++) {
      const f = a[r][col] / a[col][col];
      for (let c = col; c < n; c++) a[r][c] -= f * a[col][c];
    }
  }
  return det;
}

function quatAboutAxis(axis: [number, number, number], angle: number): Quaternion {
  const h = angle / 2;
  const s = Math.sin(h);
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(h)];
}

// A non-trivial rotation used across math tests.
const Q_TILT: Quaternion = quatAboutAxis(
  [1 / Math.sqrt(3), 1 / Math.sqrt(3), 1 / Math.sqrt(3)],
  0.97
);

// ─── 1. spherical-harmonic rotation math ────────────────────────────────────

describe('quaternionToMatrix3', () => {
  it('identity quaternion → identity matrix', () => {
    expect(isIdentity(quaternionToMatrix3([0, 0, 0, 1]))).toBe(true);
  });
  it('zero quaternion falls back to identity (no NaN)', () => {
    expect(isIdentity(quaternionToMatrix3([0, 0, 0, 0]))).toBe(true);
  });
  it('is orthonormal (R·Rᵀ = I) for an arbitrary rotation', () => {
    const R = quaternionToMatrix3(Q_TILT);
    expect(isIdentity(multiply(R, transpose(R)), 1e-9)).toBe(true);
  });
  it('is a proper rotation (det = +1)', () => {
    expect(determinant(quaternionToMatrix3(Q_TILT))).toBeCloseTo(1, 9);
  });
});

describe('ambisonicRotationMatrix — identity', () => {
  for (const order of [1, 2, 3]) {
    it(`order ${order}: identity quaternion → identity channel matrix`, () => {
      const M = ambisonicRotationMatrix([0, 0, 0, 1], order);
      expect(M.length).toBe(channelCount(order));
      expect(isIdentity(M, 1e-9)).toBe(true);
    });
  }
});

describe('ambisonicRotationMatrix — orthonormality (Ivanic–Ruedenberg correctness)', () => {
  for (const order of [1, 2, 3]) {
    it(`order ${order}: M·Mᵀ = I (a wrong recursion would break this)`, () => {
      const M = ambisonicRotationMatrix(Q_TILT, order);
      expect(isIdentity(multiply(M, transpose(M)), 1e-7)).toBe(true);
    });
    it(`order ${order}: proper rotation (det = +1)`, () => {
      const M = ambisonicRotationMatrix(Q_TILT, order);
      expect(determinant(M)).toBeCloseTo(1, 6);
    });
  }
});

describe('ambisonicRotationMatrix — physical invariants', () => {
  it('W channel (order 0) is rotation-invariant', () => {
    const M = ambisonicRotationMatrix(Q_TILT, 3);
    expect(M[0][0]).toBeCloseTo(1, 9);
    for (let j = 1; j < M.length; j++) {
      expect(Math.abs(M[0][j])).toBeLessThan(1e-9);
      expect(Math.abs(M[j][0])).toBeLessThan(1e-9);
    }
  });
  it('round-trip: M(q)·M(conj q) = I (rotation then inverse)', () => {
    const M = ambisonicRotationMatrix(Q_TILT, 3);
    const conj: Quaternion = [-Q_TILT[0], -Q_TILT[1], -Q_TILT[2], Q_TILT[3]];
    const Minv = ambisonicRotationMatrix(conj, 3);
    expect(isIdentity(multiply(M, Minv), 1e-7)).toBe(true);
  });
  it('a non-trivial rotation actually moves the soundfield (≠ identity)', () => {
    const M = ambisonicRotationMatrix(Q_TILT, 1);
    expect(isIdentity(M, 1e-3)).toBe(false);
  });
});

// ─── 2. integration with the real AmbisonicsTrait ────────────────────────────

/** Wire a trait context whose emit forwards into the runtime EventBus. */
function makeTraitContext(bus: EventBus) {
  const spy = vi.fn((event: string, payload?: unknown) => bus.emit(event, payload));
  return { emit: spy };
}

function attachPlayingTrait(bus: EventBus, sceneRotationLock = false) {
  const node: any = { id: 'amb_node_1' };
  const ctx = makeTraitContext(bus);
  const cfg = { ...ambisonicsHandler.defaultConfig!, scene_rotation_lock: sceneRotationLock };
  ambisonicsHandler.onAttach!(node, cfg, ctx as any);
  // Simulate decoder + source readiness and a started playback.
  node.__ambisonicsState.isPlaying = true;
  // Rotated head pose arrives from head tracking.
  ambisonicsHandler.onEvent!(node, cfg, ctx as any, {
    type: 'listener_rotation_update',
    rotation: Q_TILT,
  });
  return { node, ctx, cfg };
}

describe('AmbisonicDecoderCoordinator — Pattern E wiring', () => {
  it('registers a listener for ambisonics_update_rotation (0 before this code shipped)', () => {
    const bus = new EventBus();
    expect(bus.listenerCount('ambisonics_update_rotation')).toBe(0);
    const coord = new AmbisonicDecoderCoordinator({ bus });
    coord.start();
    expect(bus.listenerCount('ambisonics_update_rotation')).toBeGreaterThan(0);
  });

  it('real trait tick mutates decoder rotation state (the done-when assertion)', () => {
    const bus = new EventBus();
    const coord = createAmbisonicDecoderCoordinator({ bus });

    const { node, ctx, cfg } = attachPlayingTrait(bus, false);
    // The onAttach emitted ambisonics_init_decoder → decoder exists at identity.
    const before = coord.getDecoder('amb_node_1');
    expect(before).toBeDefined();
    expect(before!.rotationUpdateCount).toBe(0);
    expect(isIdentity(before!.rotationMatrix, 1e-9)).toBe(true);

    // Tick the trait while playing + unlocked → emits ambisonics_update_rotation.
    ambisonicsHandler.onUpdate!(node, cfg, ctx as any, 0.016);

    expect(ctx.emit).toHaveBeenCalledWith('ambisonics_update_rotation', expect.any(Object));

    const after = coord.getDecoder('amb_node_1')!;
    expect(after.rotationUpdateCount).toBe(1);
    // The genuine mutation: rotation operator is no longer identity…
    expect(isIdentity(after.rotationMatrix, 1e-3)).toBe(false);
    // …and is a valid soundfield rotation (orthonormal).
    expect(isIdentity(multiply(after.rotationMatrix, transpose(after.rotationMatrix)), 1e-7)).toBe(
      true
    );
    // …and matches the standalone math for the applied head pose.
    expect(maxAbsDiff(after.rotationMatrix, ambisonicRotationMatrix(Q_TILT, 1))).toBeLessThan(1e-9);
  });

  it('scene_rotation_lock=true → trait emits nothing → decoder stays at identity', () => {
    const bus = new EventBus();
    const coord = createAmbisonicDecoderCoordinator({ bus });
    const { node, ctx, cfg } = attachPlayingTrait(bus, true);
    ambisonicsHandler.onUpdate!(node, cfg, ctx as any, 0.016);
    expect(ctx.emit).not.toHaveBeenCalledWith('ambisonics_update_rotation', expect.any(Object));
    const rec = coord.getDecoder('amb_node_1')!;
    expect(rec.rotationUpdateCount).toBe(0);
    expect(isIdentity(rec.rotationMatrix, 1e-9)).toBe(true);
  });

  it('cleanup removes the decoder record', () => {
    const bus = new EventBus();
    const coord = createAmbisonicDecoderCoordinator({ bus });
    attachPlayingTrait(bus, false);
    expect(coord.decoderCount()).toBe(1);
    bus.emit('ambisonics_cleanup', { node: { id: 'amb_node_1' } });
    expect(coord.decoderCount()).toBe(0);
  });
});
