/**
 * constraint-impulse.ts
 *
 * Pure sequential-impulse / PGS numerics for the constraint solver.
 *
 * This module is the real impulse-resolution core that ConstraintSolver
 * composes. It is intentionally free of solver bookkeeping (no constraint
 * registry, no dispatch, no warm-start storage) so it can be unit-tested in
 * isolation against analytical results (effective mass, momentum
 * conservation, restitution).
 *
 * Conventions:
 * - Vectors are [x, y, z] tuples.
 * - "invMass" is 1/mass (0 == static/infinite mass).
 * - "invInertia" is the diagonal inverse inertia tensor in world space
 *   (approximated as body-aligned diagonal — full quaternion rotation of the
 *   tensor is a future refinement; for the diagonal/spherical defaults this
 *   is exact, and for the joint/contact cases the dominant term is linear).
 *
 * The central equation solved per constraint row is the standard
 * sequential-impulse update:
 *
 *     effectiveMass = 1 / (Jₐ·M⁻¹ₐ·Jₐᵀ + J_b·M⁻¹_b·J_bᵀ)
 *     lambda        = -effectiveMass · (J·v + bias)
 *     v += M⁻¹ · Jᵀ · lambda      (applied to each body)
 *
 * For a point constraint between two bodies the linear Jacobian is ±n and the
 * angular Jacobian is ±(r × n), giving the familiar contact effective mass
 *
 *     k = invMassA + invMassB
 *       + nᵀ (Iₐ⁻¹ (rₐ×n)×rₐ) + nᵀ (I_b⁻¹ (r_b×n)×r_b)
 *
 * @module physics
 */

export type Vec3 = [number, number, number];

/** Minimal body view the impulse math needs — decoupled from IRigidBodyState. */
export interface ImpulseBody {
  linearVelocity: Vec3;
  angularVelocity: Vec3;
  /** 1/mass. 0 => static / infinite mass. */
  invMass: number;
  /** Diagonal inverse inertia tensor (world-aligned diagonal approximation). */
  invInertia: Vec3;
}

// ── small vector helpers (tuple-native, no allocation churn beyond results) ──

export function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}
export function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
export function scale(a: Vec3, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}
export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
export function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
export function length(a: Vec3): number {
  return Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
}
export function normalize(a: Vec3): Vec3 {
  const len = length(a);
  return len > 1e-12 ? scale(a, 1 / len) : [0, 0, 0];
}
/** Component-wise multiply (used for diagonal inertia tensor application). */
export function mul(a: Vec3, b: Vec3): Vec3 {
  return [a[0] * b[0], a[1] * b[1], a[2] * b[2]];
}

/**
 * Velocity of the material point at world offset `r` from a body's center:
 *   v_point = v_linear + ω × r
 */
export function pointVelocity(body: ImpulseBody, r: Vec3): Vec3 {
  return add(body.linearVelocity, cross(body.angularVelocity, r));
}

/**
 * Effective mass denominator for a point constraint along direction `dir`
 * between (up to) two bodies with lever arms rA / rB.
 *
 * Returns `K = J M⁻¹ Jᵀ` for the single scalar row; the impulse is then
 * `lambda = -(targetRelVel) / K`. Returns 0 if both bodies are immovable
 * along this direction (caller must guard against divide-by-zero).
 */
export function effectiveMass(
  dir: Vec3,
  bodyA: ImpulseBody,
  rA: Vec3,
  bodyB: ImpulseBody | null,
  rB: Vec3
): number {
  let k = bodyA.invMass;
  // angular term A: nᵀ ((Iₐ⁻¹ (rₐ×n)) × rₐ)
  const rAxn = cross(rA, dir);
  const angA = cross(mul(bodyA.invInertia, rAxn), rA);
  k += dot(dir, angA);
  if (bodyB) {
    k += bodyB.invMass;
    const rBxn = cross(rB, dir);
    const angB = cross(mul(bodyB.invInertia, rBxn), rB);
    k += dot(dir, angB);
  }
  return k;
}

/** Accumulated velocity delta to apply to one body. */
export interface VelocityDelta {
  linear: Vec3;
  angular: Vec3;
}

export function zeroDelta(): VelocityDelta {
  return { linear: [0, 0, 0], angular: [0, 0, 0] };
}

/**
 * Apply a scalar impulse `lambda` along `dir` at lever arm `r` to a body's
 * velocity, in place. Returns the body so callers can chain. Mass-weighted:
 *   Δv      = invMass · (dir · lambda)
 *   Δω      = invInertia · (r × dir) · lambda
 */
export function applyImpulse(
  body: ImpulseBody,
  dir: Vec3,
  r: Vec3,
  lambda: number,
  sign: 1 | -1
): void {
  const p = scale(dir, lambda * sign);
  body.linearVelocity = add(body.linearVelocity, scale(p, body.invMass));
  const angImpulse = cross(r, p);
  body.angularVelocity = add(body.angularVelocity, mul(body.invInertia, angImpulse));
}

/**
 * Result of one sequential-impulse row solve: the scalar impulse magnitude
 * actually applied this iteration (after clamping), and the new accumulated
 * impulse for warm-starting.
 */
export interface RowSolveResult {
  /** Incremental impulse applied this iteration. */
  applied: number;
  /** New accumulated impulse (clamped). */
  accumulated: number;
}

/**
 * Solve one velocity-constraint row using sequential impulses with
 * accumulated-impulse clamping (the correct PGS form — clamp the TOTAL
 * accumulated impulse, not the increment).
 *
 *   relVel = J·v   (relative velocity along dir at the contact)
 *   lambda = -(relVel + bias) / K
 *   newAccum = clamp(accumulated + lambda, lo, hi)
 *   applied  = newAccum - accumulated          (the increment actually used)
 *
 * `bias` carries the Baumgarte positional term and/or restitution target.
 * Mutates both bodies' velocities by `applied`. `lo`/`hi` bound the TOTAL
 * accumulated impulse (e.g. [0, +inf] for a unilateral contact normal,
 * [-inf,+inf] for a bilateral joint row, [-μλn, +μλn] for friction).
 */
export function solveRow(
  dir: Vec3,
  bias: number,
  accumulated: number,
  lo: number,
  hi: number,
  bodyA: ImpulseBody,
  rA: Vec3,
  bodyB: ImpulseBody | null,
  rB: Vec3
): RowSolveResult {
  const k = effectiveMass(dir, bodyA, rA, bodyB, rB);
  if (k <= 1e-12) {
    return { applied: 0, accumulated };
  }
  const vA = pointVelocity(bodyA, rA);
  const vB = bodyB ? pointVelocity(bodyB, rB) : ([0, 0, 0] as Vec3);
  // Relative velocity of A w.r.t. B along dir.
  const relVel = dot(sub(vA, vB), dir);
  const lambda = -(relVel + bias) / k;
  const newAccum = Math.max(lo, Math.min(hi, accumulated + lambda));
  const applied = newAccum - accumulated;
  if (applied !== 0) {
    applyImpulse(bodyA, dir, rA, applied, 1);
    if (bodyB) applyImpulse(bodyB, dir, rB, applied, -1);
  }
  return { applied, accumulated: newAccum };
}

/** Build two orthonormal tangents perpendicular to a unit normal. */
export function tangentBasis(normal: Vec3): [Vec3, Vec3] {
  // Pick the axis least aligned with the normal to avoid degeneracy.
  const ref: Vec3 = Math.abs(normal[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const t1 = normalize(cross(normal, ref));
  const t2 = normalize(cross(normal, t1));
  return [t1, t2];
}

/**
 * Derive a usable invMass/invInertia view from a loosely-typed body that may
 * carry `mass` / `invMass` / `invInertia` (any of them optional). Backward
 * compatible: a body with no mass info is treated as unit mass (invMass = 1)
 * so legacy massless test fixtures still resolve.
 *
 * A body explicitly marked static (type === 'static' or 'kinematic', or
 * mass === 0) becomes immovable (invMass = 0, invInertia = 0).
 */
export function resolveInverseMass(body: {
  type?: string;
  mass?: number;
  invMass?: number;
  invInertia?: Vec3;
}): { invMass: number; invInertia: Vec3 } {
  let invMass: number;
  if (typeof body.invMass === 'number') {
    invMass = body.invMass;
  } else if (typeof body.mass === 'number') {
    invMass = body.mass > 0 ? 1 / body.mass : 0;
  } else {
    invMass = 1; // legacy default: unit mass
  }
  if (body.type === 'static' || body.type === 'kinematic') {
    invMass = 0;
  }
  let invInertia: Vec3;
  if (Array.isArray(body.invInertia)) {
    invInertia = [body.invInertia[0], body.invInertia[1], body.invInertia[2]];
  } else {
    // Sphere-like default: tie rotational response to linear response so
    // angular impulses still resolve without a real inertia tensor.
    const i = invMass;
    invInertia = [i, i, i];
  }
  if (invMass === 0) invInertia = [0, 0, 0];
  return { invMass, invInertia };
}
