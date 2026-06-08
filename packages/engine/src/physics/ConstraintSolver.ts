/**
 * ConstraintSolver.ts
 *
 * Sequential-impulse / PGS constraint solver for the HoloScript physics
 * engine. Supports the 8 joint constraint types in PhysicsTypes.ts plus a
 * unilateral contact constraint (normal + friction).
 *
 * This is a REAL impulse solver, not a position-bias heuristic:
 * - Each constraint row computes its effective mass `K = J·M⁻¹·Jᵀ` and the
 *   impulse `lambda = -(J·v + bias)/K`, mass-weighted via inverse mass /
 *   inverse inertia (constraint-impulse.ts).
 * - Impulses ACCUMULATE across the iteration loop and are clamped on the
 *   TOTAL accumulated value (proper PGS), so the 10-iteration loop actually
 *   converges instead of being a no-op multiplier.
 * - Warm-starting re-injects the previous frame's accumulated impulse at the
 *   start of the solve.
 * - Contacts resolve as unilateral normal impulses (clamped >= 0) plus
 *   Coulomb-clamped friction; restitution and Baumgarte penetration bias are
 *   folded into the row bias.
 *
 * The public API and return shape are unchanged: `solve(dt)` returns a Map of
 * per-body velocity corrections (the Δv each body should receive this step).
 *
 * @module physics
 */

import {
  IVector3,
  Constraint,
  IFixedConstraint,
  IHingeConstraint,
  ISliderConstraint,
  IBallConstraint,
  IConeConstraint,
  IDistanceConstraint,
  ISpringConstraint,
  IGeneric6DOFConstraint,
  IContactConstraint,
  IRigidBodyState,
} from './PhysicsTypes';
import {
  Vec3,
  ImpulseBody,
  VelocityDelta,
  add,
  sub,
  scale,
  dot,
  cross,
  length,
  normalize,
  pointVelocity,
  solveRow,
  tangentBasis,
  resolveInverseMass,
} from './constraint-impulse';

type Vec3Like = IVector3 | { x: number; y: number; z: number };

function c(v: Vec3Like, i: 0 | 1 | 2): number {
  if (Array.isArray(v)) return (v as IVector3)[i];
  const named = i === 0 ? v.x : i === 1 ? v.y : v.z;
  if (named !== undefined) return named;
  return (v as unknown as Record<number, number>)[i] ?? 0;
}

/** Coerce any vec3-like (tuple OR {x,y,z}) into a plain tuple. */
function asVec3(v: Vec3Like | undefined): Vec3 {
  if (!v) return [0, 0, 0];
  return [c(v, 0), c(v, 1), c(v, 2)];
}

// =============================================================================
// TYPES
// =============================================================================

export interface ConstraintSolverConfig {
  iterations: number;
  baumgarte: number; // Baumgarte stabilization factor (0.1 - 0.3 typical)
  warmStarting: boolean;
  slop: number; // Penetration slop to prevent jitter
}

interface SolvedConstraint {
  constraint: Constraint;
  bodyA: IRigidBodyState;
  bodyB: IRigidBodyState | null;
  /** Accumulated scalar impulse along the constraint's primary axis (warm start). */
  accumulatedImpulse: IVector3;
  accumulatedAngularImpulse: IVector3;
  /** Accumulated normal impulse for contacts (warm start, clamped >= 0). */
  accumNormal: number;
  /** Accumulated friction impulses along the two contact tangents. */
  accumFriction: [number, number];
  /**
   * Restitution target normal velocity, captured ONCE from the initial
   * approach velocity before the iteration loop. Recomputing restitution per
   * iteration is the classic sequential-impulse bug — by iteration 2 the body
   * is already separating and the bounce would be cancelled. Captured in a
   * pre-pass and held constant across iterations. NaN until captured.
   */
  restitutionTarget: number;
  broken: boolean;
}

// =============================================================================
// SOLVER
// =============================================================================

const DEFAULT_CONFIG: ConstraintSolverConfig = {
  iterations: 10,
  baumgarte: 0.2,
  warmStarting: true,
  slop: 0.005,
};

export class ConstraintSolver {
  private config: ConstraintSolverConfig;
  private solved: SolvedConstraint[] = [];

  constructor(config: Partial<ConstraintSolverConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  addConstraint(
    constraint: Constraint,
    bodyA: IRigidBodyState,
    bodyB: IRigidBodyState | null = null
  ): void {
    this.solved.push({
      constraint,
      bodyA,
      bodyB,
      accumulatedImpulse: [0, 0, 0],
      accumulatedAngularImpulse: [0, 0, 0],
      accumNormal: 0,
      accumFriction: [0, 0],
      restitutionTarget: NaN,
      broken: false,
    });
  }

  removeConstraint(constraintId: string): boolean {
    const idx = this.solved.findIndex((s) => s.constraint.id === constraintId);
    if (idx < 0) return false;
    this.solved.splice(idx, 1);
    return true;
  }

  getConstraints(): Constraint[] {
    return this.solved.filter((s) => !s.broken).map((s) => s.constraint);
  }

  /**
   * Solve all constraints for one timestep using sequential impulses.
   *
   * Returns the velocity correction (Δv) to apply to each rigid body — the
   * difference between the post-solve velocity and the body's input velocity.
   * The caller integrates these onto the bodies; the solver never mutates the
   * caller's IRigidBodyState objects.
   */
  solve(dt: number): Map<string, { linearVelocity: IVector3; angularVelocity: IVector3 }> {
    const out = new Map<string, { linearVelocity: IVector3; angularVelocity: IVector3 }>();
    if (this.solved.length === 0) return out;

    // Build mutable impulse-bodies from the input states. We snapshot the
    // ORIGINAL velocities so we can compute deltas at the end; the working
    // copies below are what the iteration loop mutates.
    const work = new Map<string, ImpulseBody>();
    const original = new Map<string, { lin: Vec3; ang: Vec3 }>();
    const ensureBody = (b: IRigidBodyState): ImpulseBody => {
      let w = work.get(b.id);
      if (!w) {
        const lin = asVec3((b.linearVelocity ?? b.velocity) as Vec3Like);
        const ang = asVec3(b.angularVelocity as Vec3Like);
        const { invMass, invInertia } = resolveInverseMass(b);
        w = { linearVelocity: lin, angularVelocity: ang, invMass, invInertia };
        work.set(b.id, w);
        original.set(b.id, { lin: [...lin] as Vec3, ang: [...ang] as Vec3 });
      }
      return w;
    };
    for (const sc of this.solved) {
      if (sc.broken) continue;
      ensureBody(sc.bodyA);
      if (sc.bodyB) ensureBody(sc.bodyB);
    }

    // Restitution pre-pass: capture the bounce target from the INITIAL
    // approach velocity, before warm-start or any impulse mutates it.
    for (const sc of this.solved) {
      if (sc.broken || sc.constraint.type !== 'contact') continue;
      const con = sc.constraint as IContactConstraint;
      const a = work.get(sc.bodyA.id)!;
      const b = sc.bodyB ? work.get(sc.bodyB.id)! : null;
      const normal = normalize(asVec3(con.normal));
      const point = asVec3(con.point);
      const posA = asVec3(sc.bodyA.position as Vec3Like);
      const posB = sc.bodyB ? asVec3(sc.bodyB.position as Vec3Like) : posA;
      const rA = sub(point, posA);
      const rB = sub(point, posB);
      const vA = pointVelocity(a, rA);
      const vB = b ? pointVelocity(b, rB) : ([0, 0, 0] as Vec3);
      const relNormalVel = dot(sub(vA, vB), normal);
      const restitution = con.restitution ?? 0;
      // Only bounce if approaching faster than a small threshold (avoid
      // restitution jitter at resting contact).
      sc.restitutionTarget = relNormalVel < -0.01 ? restitution * relNormalVel : 0;
    }

    // Warm starting: re-inject previous accumulated impulses as velocity.
    if (this.config.warmStarting) {
      for (const sc of this.solved) {
        if (sc.broken) continue;
        this.warmStart(sc, work);
      }
    }

    // Iterative PGS: each iteration re-reads updated velocities (real, not a
    // no-op multiplier — impulses accumulate and converge).
    for (let iter = 0; iter < this.config.iterations; iter++) {
      for (const sc of this.solved) {
        if (sc.broken) continue;
        this.solveConstraint(sc, dt, work);
      }
    }

    // Break-force check: total impulse / dt vs threshold.
    for (const sc of this.solved) {
      if (sc.broken) continue;
      const breakForce = sc.constraint.breakForce;
      if (breakForce !== undefined && breakForce > 0) {
        const force = length(sc.accumulatedImpulse as Vec3) / Math.max(dt, 1e-6);
        if (force > breakForce) sc.broken = true;
      }
    }

    // Emit velocity deltas (post - pre).
    for (const [id, w] of work) {
      const o = original.get(id)!;
      out.set(id, {
        linearVelocity: sub(w.linearVelocity, o.lin),
        angularVelocity: sub(w.angularVelocity, o.ang),
      });
    }
    return out;
  }

  getBrokenConstraints(): string[] {
    return this.solved.filter((s) => s.broken).map((s) => s.constraint.id);
  }

  clear(): void {
    this.solved = [];
  }

  // ---------------------------------------------------------------------------
  // Internal: dispatch
  // ---------------------------------------------------------------------------

  private solveConstraint(sc: SolvedConstraint, dt: number, work: Map<string, ImpulseBody>): void {
    switch (sc.constraint.type) {
      case 'fixed':
        this.solvePoint(sc, sc.constraint as IFixedConstraint, dt, work);
        break;
      case 'ball':
        this.solvePoint(sc, sc.constraint as IBallConstraint, dt, work);
        break;
      case 'distance':
        this.solveDistance(sc, sc.constraint as IDistanceConstraint, dt, work);
        break;
      case 'spring':
        this.solveSpring(sc, sc.constraint as ISpringConstraint, dt, work);
        break;
      case 'hinge':
        this.solveHinge(sc, sc.constraint as IHingeConstraint, dt, work);
        break;
      case 'slider':
        this.solveSlider(sc, sc.constraint as ISliderConstraint, dt, work);
        break;
      case 'cone':
        this.solveCone(sc, sc.constraint as IConeConstraint, dt, work);
        break;
      case 'generic6dof':
        this.solveGeneric6DOF(sc, sc.constraint as IGeneric6DOFConstraint, dt, work);
        break;
      case 'contact':
        this.solveContact(sc, sc.constraint as IContactConstraint, dt, work);
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // Point constraints (fixed / ball): hold pivotA at pivotB, 3 axes
  // ---------------------------------------------------------------------------

  private solvePoint(
    sc: SolvedConstraint,
    con: IFixedConstraint | IBallConstraint,
    dt: number,
    work: Map<string, ImpulseBody>
  ): void {
    const a = work.get(sc.bodyA.id)!;
    const b = sc.bodyB ? work.get(sc.bodyB.id)! : null;
    const pivotA = asVec3(con.pivotA);
    const pivotB = asVec3(con.pivotB);
    const posA = asVec3(sc.bodyA.position as Vec3Like);
    const posB = sc.bodyB ? asVec3(sc.bodyB.position as Vec3Like) : posA;
    const rA = pivotA;
    const rB = sc.bodyB ? pivotB : [0, 0, 0];
    const anchorA = add(posA, pivotA);
    const anchorB = sc.bodyB ? add(posB, pivotB) : anchorA;
    const err = sub(anchorB, anchorA); // positional drift A->B
    // Solve each world axis as an independent row with a Baumgarte bias.
    const axes: Vec3[] = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ];
    let totalImpulse: Vec3 = [0, 0, 0];
    for (let i = 0; i < 3; i++) {
      const dir = axes[i];
      const bias = -(this.config.baumgarte * dot(err, dir)) / Math.max(dt, 1e-6);
      const res = solveRow(dir, bias, 0, -Infinity, Infinity, a, rA, b, rB as Vec3);
      totalImpulse = add(totalImpulse, scale(dir, res.applied));
    }
    sc.accumulatedImpulse = add(sc.accumulatedImpulse as Vec3, totalImpulse);
  }

  // ---------------------------------------------------------------------------
  // Distance constraint: keep |anchorB - anchorA| == distance
  // ---------------------------------------------------------------------------

  private solveDistance(
    sc: SolvedConstraint,
    con: IDistanceConstraint,
    dt: number,
    work: Map<string, ImpulseBody>
  ): void {
    const a = work.get(sc.bodyA.id)!;
    const b = sc.bodyB ? work.get(sc.bodyB.id)! : null;
    const posA = asVec3(sc.bodyA.position as Vec3Like);
    const pivotA = asVec3(con.pivotA);
    const anchorA = add(posA, pivotA);
    const anchorB = sc.bodyB
      ? add(asVec3(sc.bodyB.position as Vec3Like), asVec3(con.pivotB))
      : add(posA, [con.distance, 0, 0]);
    const delta = sub(anchorB, anchorA);
    const currentDist = length(delta);
    const dir = currentDist > 1e-9 ? scale(delta, 1 / currentDist) : ([1, 0, 0] as Vec3);
    const error = currentDist - con.distance; // >0 too far apart

    if (Math.abs(error) < this.config.slop) return;

    const stiffness = con.stiffness ?? 1.0;
    // Negative bias so that error>0 (too far apart) drives lambda>0, which
    // applies +dir impulse to A (toward B) and -dir to B (toward A) —
    // matching the legacy sign convention (corrA.x>0 when B is at +x).
    const bias = -(this.config.baumgarte * stiffness * error) / Math.max(dt, 1e-6);
    const res = solveRow(dir, bias, 0, -Infinity, Infinity, a, pivotA, b, asVec3(con.pivotB));
    sc.accumulatedImpulse = add(sc.accumulatedImpulse as Vec3, scale(dir, res.applied));
  }

  // ---------------------------------------------------------------------------
  // Spring constraint: soft force, F = -k·x - d·v applied as an impulse
  // ---------------------------------------------------------------------------

  private solveSpring(
    sc: SolvedConstraint,
    con: ISpringConstraint,
    dt: number,
    work: Map<string, ImpulseBody>
  ): void {
    const a = work.get(sc.bodyA.id)!;
    const b = sc.bodyB ? work.get(sc.bodyB.id)! : null;
    const posA = asVec3(sc.bodyA.position as Vec3Like);
    const pivotA = asVec3(con.pivotA);
    const anchorA = add(posA, pivotA);
    const anchorB = sc.bodyB
      ? add(asVec3(sc.bodyB.position as Vec3Like), asVec3(con.pivotB))
      : add(posA, [con.restLength, 0, 0]);
    const delta = sub(anchorB, anchorA);
    const currentLen = length(delta);
    const dir = currentLen > 1e-9 ? scale(delta, 1 / currentLen) : ([1, 0, 0] as Vec3);
    const displacement = currentLen - con.restLength;

    // Relative velocity along the spring axis (for damping).
    const vA = pointVelocity(a, pivotA);
    const vB = b ? pointVelocity(b, asVec3(con.pivotB)) : ([0, 0, 0] as Vec3);
    const relVelAlong = dot(sub(vB, vA), dir);

    // Force -> impulse over dt. Spring pulls anchors together when stretched.
    const springForce = -con.stiffness * displacement;
    const dampingForce = -con.damping * relVelAlong;
    const impulseMag = (springForce + dampingForce) * dt;
    const impulse = scale(dir, impulseMag);

    // Apply mass-weighted: A gets -impulse (toward B when stretched), B gets +impulse.
    a.linearVelocity = add(a.linearVelocity, scale(impulse, -a.invMass));
    if (b) b.linearVelocity = add(b.linearVelocity, scale(impulse, b.invMass));
    sc.accumulatedImpulse = add(sc.accumulatedImpulse as Vec3, impulse);
  }

  // ---------------------------------------------------------------------------
  // Hinge: point constraint + optional motor about axisA
  // ---------------------------------------------------------------------------

  private solveHinge(
    sc: SolvedConstraint,
    con: IHingeConstraint,
    dt: number,
    work: Map<string, ImpulseBody>
  ): void {
    this.solvePoint(sc, con as unknown as IBallConstraint, dt, work);
    if (con.motor) {
      const a = work.get(sc.bodyA.id)!;
      const axis = normalize(asVec3(con.axisA));
      const currentAngVel = dot(a.angularVelocity, axis);
      const velError = con.motor.targetVelocity - currentAngVel;
      // Effective angular mass along the axis: axisᵀ I⁻¹ axis.
      const kAng = dot(axis, [
        a.invInertia[0] * axis[0],
        a.invInertia[1] * axis[1],
        a.invInertia[2] * axis[2],
      ]);
      let lambda = kAng > 1e-12 ? velError / kAng : 0;
      // Clamp by motor max impulse (maxForce·dt).
      const maxImpulse = con.motor.maxForce * dt;
      lambda = Math.max(-maxImpulse, Math.min(maxImpulse, lambda));
      a.angularVelocity = add(a.angularVelocity, [
        a.invInertia[0] * axis[0] * lambda,
        a.invInertia[1] * axis[1] * lambda,
        a.invInertia[2] * axis[2] * lambda,
      ]);
      sc.accumulatedAngularImpulse = add(sc.accumulatedAngularImpulse as Vec3, scale(axis, lambda));
    }
  }

  // ---------------------------------------------------------------------------
  // Slider: constrain perpendicular DOFs + axis limits
  // ---------------------------------------------------------------------------

  private solveSlider(
    sc: SolvedConstraint,
    con: ISliderConstraint,
    dt: number,
    work: Map<string, ImpulseBody>
  ): void {
    const a = work.get(sc.bodyA.id)!;
    const b = sc.bodyB ? work.get(sc.bodyB.id)! : null;
    const axis = normalize(asVec3(con.axisA));
    const pivotA = asVec3(con.pivotA);
    const pivotB = asVec3(con.pivotB);
    const posA = asVec3(sc.bodyA.position as Vec3Like);
    const posB = sc.bodyB ? asVec3(sc.bodyB.position as Vec3Like) : posA;
    const anchorA = add(posA, pivotA);
    const anchorB = sc.bodyB ? add(posB, pivotB) : anchorA;
    const delta = sub(anchorB, anchorA);
    const onAxis = dot(delta, axis);
    const perp = sub(delta, scale(axis, onAxis));

    // Constrain perpendicular drift to zero (two rows along perp basis).
    const perpLen = length(perp);
    if (perpLen > this.config.slop) {
      const dir = scale(perp, 1 / perpLen);
      const bias = -(this.config.baumgarte * perpLen) / Math.max(dt, 1e-6);
      solveRow(dir, bias, 0, -Infinity, Infinity, a, pivotA, b, pivotB);
    }

    // Limit enforcement along the axis (unilateral).
    if (con.limits) {
      let violation = 0;
      if (onAxis < con.limits.low) violation = con.limits.low - onAxis;
      else if (onAxis > con.limits.high) violation = con.limits.high - onAxis;
      if (violation !== 0) {
        const bias = -(this.config.baumgarte * violation) / Math.max(dt, 1e-6);
        const res = solveRow(axis, bias, 0, -Infinity, Infinity, a, pivotA, b, pivotB);
        sc.accumulatedImpulse = add(sc.accumulatedImpulse as Vec3, scale(axis, res.applied));
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Cone twist: point constraint + twist-velocity limit
  // ---------------------------------------------------------------------------

  private solveCone(
    sc: SolvedConstraint,
    con: IConeConstraint,
    dt: number,
    work: Map<string, ImpulseBody>
  ): void {
    this.solvePoint(sc, con as unknown as IBallConstraint, dt, work);
    const a = work.get(sc.bodyA.id)!;
    const twistAxis = normalize(asVec3(con.axisA));
    const twistVel = dot(a.angularVelocity, twistAxis);
    if (Math.abs(twistVel) > con.twistSpan) {
      // Damp the excess twist velocity (mass-weighted along the axis).
      const excess = twistVel - Math.sign(twistVel) * con.twistSpan;
      const kAng = dot(twistAxis, [
        a.invInertia[0] * twistAxis[0],
        a.invInertia[1] * twistAxis[1],
        a.invInertia[2] * twistAxis[2],
      ]);
      const lambda = kAng > 1e-12 ? -excess / kAng : 0;
      a.angularVelocity = add(a.angularVelocity, [
        a.invInertia[0] * twistAxis[0] * lambda,
        a.invInertia[1] * twistAxis[1] * lambda,
        a.invInertia[2] * twistAxis[2] * lambda,
      ]);
      sc.accumulatedAngularImpulse = add(
        sc.accumulatedAngularImpulse as Vec3,
        scale(twistAxis, lambda)
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Generic 6-DOF: clamp linear position to box limits (per-axis unilateral)
  // ---------------------------------------------------------------------------

  private solveGeneric6DOF(
    sc: SolvedConstraint,
    con: IGeneric6DOFConstraint,
    dt: number,
    work: Map<string, ImpulseBody>
  ): void {
    const a = work.get(sc.bodyA.id)!;
    const pos = asVec3(sc.bodyA.position as Vec3Like);
    const lower = asVec3(con.linearLowerLimit);
    const upper = asVec3(con.linearUpperLimit);
    const pivotA: Vec3 = [0, 0, 0];
    let totalImpulse: Vec3 = [0, 0, 0];
    const axes: Vec3[] = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ];
    for (let i = 0; i < 3; i++) {
      let violation = 0;
      if (pos[i] < lower[i]) violation = lower[i] - pos[i];
      else if (pos[i] > upper[i]) violation = upper[i] - pos[i];
      if (violation === 0) continue;
      const dir = axes[i];
      const bias = -(this.config.baumgarte * violation) / Math.max(dt, 1e-6);
      const res = solveRow(dir, bias, 0, -Infinity, Infinity, a, pivotA, null, [0, 0, 0]);
      totalImpulse = add(totalImpulse, scale(dir, res.applied));
    }
    sc.accumulatedImpulse = add(sc.accumulatedImpulse as Vec3, totalImpulse);
  }

  // ---------------------------------------------------------------------------
  // Contact: unilateral normal impulse (>=0) + Coulomb-clamped friction
  // ---------------------------------------------------------------------------

  private solveContact(
    sc: SolvedConstraint,
    con: IContactConstraint,
    dt: number,
    work: Map<string, ImpulseBody>
  ): void {
    const a = work.get(sc.bodyA.id)!;
    const b = sc.bodyB ? work.get(sc.bodyB.id)! : null;
    const normal = normalize(asVec3(con.normal));
    const point = asVec3(con.point);
    const posA = asVec3(sc.bodyA.position as Vec3Like);
    const posB = sc.bodyB ? asVec3(sc.bodyB.position as Vec3Like) : posA;
    const rA = sub(point, posA);
    const rB = sub(point, posB);

    const friction = con.friction ?? 0.5;
    const penetration = con.penetration ?? 0;

    // Bias: Baumgarte penetration push-out (only beyond slop) plus the
    // restitution bounce target captured in the pre-pass (held constant across
    // iterations so the bounce is not cancelled once the body separates).
    const positionBias =
      penetration > this.config.slop
        ? -(this.config.baumgarte * (penetration - this.config.slop)) / Math.max(dt, 1e-6)
        : 0;
    const restitutionBias = Number.isNaN(sc.restitutionTarget) ? 0 : sc.restitutionTarget;
    const bias = positionBias + restitutionBias;

    // Normal row: clamp TOTAL accumulated normal impulse to [0, +inf).
    const nRes = solveRow(normal, bias, sc.accumNormal, 0, Infinity, a, rA, b, rB);
    sc.accumNormal = nRes.accumulated;
    sc.accumulatedImpulse = scale(normal, sc.accumNormal);

    // Friction rows: two tangents, each clamped to [-μλn, +μλn].
    const [t1, t2] = tangentBasis(normal);
    const maxFriction = friction * sc.accumNormal;
    const f1 = solveRow(t1, 0, sc.accumFriction[0], -maxFriction, maxFriction, a, rA, b, rB);
    sc.accumFriction[0] = f1.accumulated;
    const f2 = solveRow(t2, 0, sc.accumFriction[1], -maxFriction, maxFriction, a, rA, b, rB);
    sc.accumFriction[1] = f2.accumulated;
  }

  // ---------------------------------------------------------------------------
  // Warm starting
  // ---------------------------------------------------------------------------

  private warmStart(sc: SolvedConstraint, work: Map<string, ImpulseBody>): void {
    const a = work.get(sc.bodyA.id);
    const b = sc.bodyB ? work.get(sc.bodyB.id) : null;
    if (!a) return;
    if (sc.constraint.type === 'contact') {
      const con = sc.constraint as IContactConstraint;
      const normal = normalize(asVec3(con.normal));
      const point = asVec3(con.point);
      const posA = asVec3(sc.bodyA.position as Vec3Like);
      const posB = sc.bodyB ? asVec3(sc.bodyB.position as Vec3Like) : posA;
      const rA = sub(point, posA);
      const rB = sub(point, posB);
      const p = scale(normal, sc.accumNormal);
      a.linearVelocity = add(a.linearVelocity, scale(p, a.invMass));
      a.angularVelocity = add(a.angularVelocity, [
        a.invInertia[0] * cross(rA, p)[0],
        a.invInertia[1] * cross(rA, p)[1],
        a.invInertia[2] * cross(rA, p)[2],
      ]);
      if (b) {
        b.linearVelocity = sub(b.linearVelocity, scale(p, b.invMass));
        const pn = cross(rB, scale(p, -1));
        b.angularVelocity = add(b.angularVelocity, [
          b.invInertia[0] * pn[0],
          b.invInertia[1] * pn[1],
          b.invInertia[2] * pn[2],
        ]);
      }
      return;
    }
    // Joints: re-inject accumulated linear impulse (scaled for stability).
    const p = scale(sc.accumulatedImpulse as Vec3, 0.8);
    a.linearVelocity = add(a.linearVelocity, scale(p, a.invMass));
    if (b) b.linearVelocity = sub(b.linearVelocity, scale(p, b.invMass));
  }
}
