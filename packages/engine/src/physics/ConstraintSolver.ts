/**
 * ConstraintSolver.ts
 *
 * Sequential Impulse constraint solver for the HoloScript physics engine.
 * Supports all 8 constraint types defined in PhysicsTypes.ts.
 *
 * Features:
 * - Warm starting for convergence acceleration
 * - Baumgarte stabilization for drift correction
 * - Motor and limit support for hinge/slider joints
 *
 * @module physics
 */

import {
  IVector3,
  IQuaternion,
  Constraint,
  IFixedConstraint,
  IHingeConstraint,
  ISliderConstraint,
  IBallConstraint,
  IConeConstraint,
  IDistanceConstraint,
  ISpringConstraint,
  IGeneric6DOFConstraint,
  IRigidBodyState,
} from './PhysicsTypes';

type Vec3Like = IVector3 | { x: number; y: number; z: number };

function withVec3Accessors(vec: IVector3): IVector3 {
  const target = vec as IVector3 & { x?: number; y?: number; z?: number };
  if (!Object.prototype.hasOwnProperty.call(target, 'x')) {
    Object.defineProperties(target, {
      x: {
        get() {
          return vec[0];
        },
        set(v: number) {
          vec[0] = v;
        },
        enumerable: true,
      },
      y: {
        get() {
          return vec[1];
        },
        set(v: number) {
          vec[1] = v;
        },
        enumerable: true,
      },
      z: {
        get() {
          return vec[2];
        },
        set(v: number) {
          vec[2] = v;
        },
        enumerable: true,
      },
    });
  }
  return vec;
}

function c(v: Vec3Like, i: 0 | 1 | 2): number {
  if (Array.isArray(v)) return (v as IVector3)[i];
  const named = i === 0 ? v.x : i === 1 ? v.y : v.z;
  if (named !== undefined) return named;
  // Handle numeric-keyed objects like {0:val, 1:val, 2:val} from array spread
  return (v as unknown as Record<number, number>)[i] ?? 0;
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
  accumulatedImpulse: IVector3;
  accumulatedAngularImpulse: IVector3;
  broken: boolean;
}

// =============================================================================
// VECTOR MATH HELPERS
// =============================================================================

function v3(x: number, y: number, z: number): IVector3 {
  return withVec3Accessors([x, y, z]);
}
function v3Add(a: Vec3Like, b: Vec3Like): IVector3 {
  return v3(c(a, 0) + c(b, 0), c(a, 1) + c(b, 1), c(a, 2) + c(b, 2));
}
function v3Sub(a: Vec3Like, b: Vec3Like): IVector3 {
  return v3(c(a, 0) - c(b, 0), c(a, 1) - c(b, 1), c(a, 2) - c(b, 2));
}
function v3Scale(v: Vec3Like, s: number): IVector3 {
  return v3(c(v, 0) * s, c(v, 1) * s, c(v, 2) * s);
}
function v3Dot(a: Vec3Like, b: Vec3Like): number {
  return c(a, 0) * c(b, 0) + c(a, 1) * c(b, 1) + c(a, 2) * c(b, 2);
}
function _v3Cross(a: Vec3Like, b: Vec3Like): IVector3 {
  return v3(
    c(a, 1) * c(b, 2) - c(a, 2) * c(b, 1),
    c(a, 2) * c(b, 0) - c(a, 0) * c(b, 2),
    c(a, 0) * c(b, 1) - c(a, 1) * c(b, 0)
  );
}
function v3Length(v: Vec3Like): number {
  return Math.sqrt(c(v, 0) * c(v, 0) + c(v, 1) * c(v, 1) + c(v, 2) * c(v, 2));
}
function v3Normalize(v: Vec3Like): IVector3 {
  const len = v3Length(v);
  return len > 1e-10 ? v3Scale(v, 1 / len) : v3(0, 0, 0);
}
function v3Zero(): IVector3 {
  return [0, 0, 0 ];
}

// =============================================================================
// CONSTRAINT SOLVER
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

  /**
   * Add a constraint to be solved.
   */
  addConstraint(
    constraint: Constraint,
    bodyA: IRigidBodyState,
    bodyB: IRigidBodyState | null = null
  ): void {
    this.solved.push({
      constraint,
      bodyA,
      bodyB,
      accumulatedImpulse: v3Zero(),
      accumulatedAngularImpulse: v3Zero(),
      broken: false,
    });
  }

  /**
   * Remove a constraint by ID.
   */
  removeConstraint(constraintId: string): boolean {
    const idx = this.solved.findIndex((s) => s.constraint.id === constraintId);
    if (idx < 0) return false;
    this.solved.splice(idx, 1);
    return true;
  }

  /**
   * Get all active constraints.
   */
  getConstraints(): Constraint[] {
    return this.solved.filter((s) => !s.broken).map((s) => s.constraint);
  }

  /**
   * Solve all constraints for one timestep.
   * Returns velocity corrections to apply to rigid bodies.
   */
  solve(dt: number): Map<string, { linearVelocity: IVector3; angularVelocity: IVector3 }> {
    const corrections = new Map<string, { linearVelocity: IVector3; angularVelocity: IVector3 }>();

    // Warm starting: apply accumulated impulses
    if (this.config.warmStarting) {
      for (const sc of this.solved) {
        if (sc.broken) continue;
        this.applyWarmStart(sc, corrections);
      }
    }

    // Iterative solver
    for (let iter = 0; iter < this.config.iterations; iter++) {
      for (const sc of this.solved) {
        if (sc.broken) continue;
        this.solveConstraint(sc, dt, corrections);
      }
    }

    // Check break forces
    for (const sc of this.solved) {
      if (sc.broken) continue;
      const breakForce = sc.constraint.breakForce;
      if (breakForce !== undefined && breakForce > 0) {
        const impulseLen = v3Length(sc.accumulatedImpulse) / Math.max(dt, 1e-6);
        if (impulseLen > breakForce) {
          sc.broken = true;
        }
      }
    }

    return corrections;
  }

  /**
   * Get broken constraint IDs.
   */
  getBrokenConstraints(): string[] {
    return this.solved.filter((s) => s.broken).map((s) => s.constraint.id);
  }

  /**
   * Clear all constraints.
   */
  clear(): void {
    this.solved = [];
  }

  // ---------------------------------------------------------------------------
  // Internal: Dispatch
  // ---------------------------------------------------------------------------

  private solveConstraint(
    sc: SolvedConstraint,
    dt: number,
    corrections: Map<string, { linearVelocity: IVector3; angularVelocity: IVector3 }>
  ): void {
    switch (sc.constraint.type) {
      case 'fixed':
        this.solveFixed(sc, dt, corrections);
        break;
      case 'distance':
        this.solveDistance(
          sc as SolvedConstraint & { constraint: IDistanceConstraint },
          dt,
          corrections
        );
        break;
      case 'spring':
        this.solveSpring(
          sc as SolvedConstraint & { constraint: ISpringConstraint },
          dt,
          corrections
        );
        break;
      case 'hinge':
        this.solveHinge(sc as SolvedConstraint & { constraint: IHingeConstraint }, dt, corrections);
        break;
      case 'ball':
        this.solveBall(sc, dt, corrections);
        break;
      case 'slider':
        this.solveSlider(
          sc as SolvedConstraint & { constraint: ISliderConstraint },
          dt,
          corrections
        );
        break;
      case 'cone':
        this.solveCone(sc as SolvedConstraint & { constraint: IConeConstraint }, dt, corrections);
        break;
      case 'generic6dof':
        this.solveGeneric6DOF(
          sc as SolvedConstraint & { constraint: IGeneric6DOFConstraint },
          dt,
          corrections
        );
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // Constraint Solvers
  // ---------------------------------------------------------------------------

  private solveFixed(
    sc: SolvedConstraint,
    dt: number,
    corrections: Map<string, { linearVelocity: IVector3; angularVelocity: IVector3 }>
  ): void {
    const c = sc.constraint as IFixedConstraint;
    const pivotWorld = v3Add(sc.bodyA.position, c.pivotA);
    const targetWorld = sc.bodyB ? v3Add(sc.bodyB.position, c.pivotB || v3Zero()) : pivotWorld;

    const error = v3Sub(targetWorld, pivotWorld);
    const correction = v3Scale(error, this.config.baumgarte / Math.max(dt, 1e-6));

    this.accumulateCorrection(corrections, sc.bodyA.id, correction, v3Zero());
    if (sc.bodyB) {
      this.accumulateCorrection(corrections, sc.bodyB.id, v3Scale(correction, -1), v3Zero());
    }

    sc.accumulatedImpulse = v3Add(sc.accumulatedImpulse, correction);
  }

  private solveDistance(
    sc: SolvedConstraint & { constraint: IDistanceConstraint },
    dt: number,
    corrections: Map<string, { linearVelocity: IVector3; angularVelocity: IVector3 }>
  ): void {
    const c = sc.constraint;
    const anchorA = v3Add(sc.bodyA.position, c.pivotA);
    const anchorB = sc.bodyB
      ? v3Add(sc.bodyB.position, c.pivotB || v3Zero())
      : v3Add(sc.bodyA.position, v3(c.distance, 0, 0)); // anchor in world space

    const delta = v3Sub(anchorB, anchorA);
    const currentDist = v3Length(delta);
    const dir = currentDist > 1e-10 ? v3Scale(delta, 1 / currentDist) : v3(1, 0, 0);
    const penetration = currentDist - c.distance;

    // Skip if within slop
    if (Math.abs(penetration) < this.config.slop) return;

    const stiffness = c.stiffness ?? 1.0;
    const baumgarte = this.config.baumgarte * stiffness;
    const impulse = v3Scale(dir, (penetration * baumgarte) / Math.max(dt, 1e-6));

    this.accumulateCorrection(corrections, sc.bodyA.id, impulse, v3Zero());
    if (sc.bodyB) {
      this.accumulateCorrection(corrections, sc.bodyB.id, v3Scale(impulse, -1), v3Zero());
    }

    sc.accumulatedImpulse = v3Add(sc.accumulatedImpulse, impulse);
  }

  private solveSpring(
    sc: SolvedConstraint & { constraint: ISpringConstraint },
    dt: number,
    corrections: Map<string, { linearVelocity: IVector3; angularVelocity: IVector3 }>
  ): void {
    const c = sc.constraint;
    const anchorA = v3Add(sc.bodyA.position, c.pivotA);
    const anchorB = sc.bodyB
      ? v3Add(sc.bodyB.position, c.pivotB || v3Zero())
      : v3Add(sc.bodyA.position, v3(c.restLength, 0, 0));

    const delta = v3Sub(anchorB, anchorA);
    const currentLen = v3Length(delta);
    const dir = currentLen > 1e-10 ? v3Scale(delta, 1 / currentLen) : v3(1, 0, 0);

    const displacement = currentLen - c.restLength;

    // Spring force: F = -k * x - d * v
    const springForce = -c.stiffness * displacement;

    // Damping: project relative velocity onto spring direction
    const relVel = sc.bodyB
      ? v3Sub(sc.bodyB.linearVelocity, sc.bodyA.linearVelocity)
      : v3Scale(sc.bodyA.linearVelocity, -1);
    const dampingForce = -c.damping * v3Dot(relVel, dir);

    const totalForce = springForce + dampingForce;
    const impulse = v3Scale(dir, totalForce * dt);

    this.accumulateCorrection(corrections, sc.bodyA.id, v3Scale(impulse, -1), v3Zero());
    if (sc.bodyB) {
      this.accumulateCorrection(corrections, sc.bodyB.id, impulse, v3Zero());
    }

    sc.accumulatedImpulse = v3Add(sc.accumulatedImpulse, impulse);
  }

  private solveHinge(
    sc: SolvedConstraint & { constraint: IHingeConstraint },
    dt: number,
    corrections: Map<string, { linearVelocity: IVector3; angularVelocity: IVector3 }>
  ): void {
    const c = sc.constraint;

    // Position constraint (ball joint part)
    const pivotWorld = v3Add(sc.bodyA.position, c.pivotA);
    const targetWorld = sc.bodyB ? v3Add(sc.bodyB.position, c.pivotB || v3Zero()) : pivotWorld;

    const posError = v3Sub(targetWorld, pivotWorld);
    const posCorrection = v3Scale(posError, this.config.baumgarte / Math.max(dt, 1e-6));

    this.accumulateCorrection(corrections, sc.bodyA.id, posCorrection, v3Zero());
    if (sc.bodyB) {
      this.accumulateCorrection(corrections, sc.bodyB.id, v3Scale(posCorrection, -1), v3Zero());
    }

    // Motor support
    if (c.motor) {
      const axis = v3Normalize(c.axisA);
      const currentAngVel = v3Dot(sc.bodyA.angularVelocity, axis);
      const velError = c.motor.targetVelocity - currentAngVel;
      const motorImpulse =
        Math.min(Math.abs(velError * dt), c.motor.maxForce * dt) * Math.sign(velError);
      const angImpulse = v3Scale(axis, motorImpulse);

      this.accumulateCorrection(corrections, sc.bodyA.id, v3Zero(), angImpulse);
    }

    sc.accumulatedImpulse = v3Add(sc.accumulatedImpulse, posCorrection);
  }

  private solveBall(
    sc: SolvedConstraint,
    dt: number,
    corrections: Map<string, { linearVelocity: IVector3; angularVelocity: IVector3 }>
  ): void {
    const c = sc.constraint as IBallConstraint;
    const pivotWorld = v3Add(sc.bodyA.position, c.pivotA);
    const targetWorld = sc.bodyB ? v3Add(sc.bodyB.position, c.pivotB || v3Zero()) : pivotWorld;

    const error = v3Sub(targetWorld, pivotWorld);
    const correction = v3Scale(error, this.config.baumgarte / Math.max(dt, 1e-6));

    this.accumulateCorrection(corrections, sc.bodyA.id, correction, v3Zero());
    if (sc.bodyB) {
      this.accumulateCorrection(corrections, sc.bodyB.id, v3Scale(correction, -1), v3Zero());
    }

    sc.accumulatedImpulse = v3Add(sc.accumulatedImpulse, correction);
  }

  private solveSlider(
    sc: SolvedConstraint & { constraint: ISliderConstraint },
    dt: number,
    corrections: Map<string, { linearVelocity: IVector3; angularVelocity: IVector3 }>
  ): void {
    const c = sc.constraint;
    const axis = v3Normalize(c.axisA);
    const pivotWorld = v3Add(sc.bodyA.position, c.pivotA);
    const targetWorld = sc.bodyB ? v3Add(sc.bodyB.position, c.pivotB || v3Zero()) : pivotWorld;

    const delta = v3Sub(targetWorld, pivotWorld);

    // Project out the axis component; constrain only perpendicular
    const onAxis = v3Dot(delta, axis);
    const perp = v3Sub(delta, v3Scale(axis, onAxis));
    const perpCorrection = v3Scale(perp, this.config.baumgarte / Math.max(dt, 1e-6));

    this.accumulateCorrection(corrections, sc.bodyA.id, perpCorrection, v3Zero());
    if (sc.bodyB) {
      this.accumulateCorrection(corrections, sc.bodyB.id, v3Scale(perpCorrection, -1), v3Zero());
    }

    // Limit enforcement
    if (c.limits) {
      if (onAxis < c.limits.low) {
        const limitImpulse = v3Scale(
          axis,
          ((c.limits.low - onAxis) * this.config.baumgarte) / Math.max(dt, 1e-6)
        );
        this.accumulateCorrection(corrections, sc.bodyA.id, limitImpulse, v3Zero());
      } else if (onAxis > c.limits.high) {
        const limitImpulse = v3Scale(
          axis,
          ((c.limits.high - onAxis) * this.config.baumgarte) / Math.max(dt, 1e-6)
        );
        this.accumulateCorrection(corrections, sc.bodyA.id, limitImpulse, v3Zero());
      }
    }

    sc.accumulatedImpulse = v3Add(sc.accumulatedImpulse, perpCorrection);
  }

  private solveCone(
    sc: SolvedConstraint & { constraint: IConeConstraint },
    dt: number,
    corrections: Map<string, { linearVelocity: IVector3; angularVelocity: IVector3 }>
  ): void {
    const c = sc.constraint;

    // Position constraint
    const pivotWorld = v3Add(sc.bodyA.position, c.pivotA);
    const targetWorld = sc.bodyB ? v3Add(sc.bodyB.position, c.pivotB || v3Zero()) : pivotWorld;

    const posError = v3Sub(targetWorld, pivotWorld);
    const posCorrection = v3Scale(posError, this.config.baumgarte / Math.max(dt, 1e-6));

    this.accumulateCorrection(corrections, sc.bodyA.id, posCorrection, v3Zero());
    if (sc.bodyB) {
      this.accumulateCorrection(corrections, sc.bodyB.id, v3Scale(posCorrection, -1), v3Zero());
    }

    // Twist limit enforcement
    const twistAxis = v3Normalize(c.axisA);
    const twistVel = v3Dot(sc.bodyA.angularVelocity, twistAxis);
    if (Math.abs(twistVel) > c.twistSpan) {
      const twistCorrection = v3Scale(twistAxis, -twistVel * 0.5);
      this.accumulateCorrection(corrections, sc.bodyA.id, v3Zero(), twistCorrection);
    }

    sc.accumulatedImpulse = v3Add(sc.accumulatedImpulse, posCorrection);
  }

  private solveGeneric6DOF(
    sc: SolvedConstraint & { constraint: IGeneric6DOFConstraint },
    dt: number,
    corrections: Map<string, { linearVelocity: IVector3; angularVelocity: IVector3 }>
  ): void {
    const c = sc.constraint;

    // Clamp linear axes
    const pos = sc.bodyA.position;
    const linCorrection = v3Zero();

    if (pos[0] < c.linearLowerLimit[0])
      linCorrection[0] =
        ((c.linearLowerLimit[0] - pos[0]) * this.config.baumgarte) / Math.max(dt, 1e-6);
    if (pos[0] > c.linearUpperLimit[0])
      linCorrection[0] =
        ((c.linearUpperLimit[0] - pos[0]) * this.config.baumgarte) / Math.max(dt, 1e-6);
    if (pos[1] < c.linearLowerLimit[1])
      linCorrection[1] =
        ((c.linearLowerLimit[1] - pos[1]) * this.config.baumgarte) / Math.max(dt, 1e-6);
    if (pos[1] > c.linearUpperLimit[1])
      linCorrection[1] =
        ((c.linearUpperLimit[1] - pos[1]) * this.config.baumgarte) / Math.max(dt, 1e-6);
    if (pos[2] < c.linearLowerLimit[2])
      linCorrection[2] =
        ((c.linearLowerLimit[2] - pos[2]) * this.config.baumgarte) / Math.max(dt, 1e-6);
    if (pos[2] > c.linearUpperLimit[2])
      linCorrection[2] =
        ((c.linearUpperLimit[2] - pos[2]) * this.config.baumgarte) / Math.max(dt, 1e-6);

    this.accumulateCorrection(corrections, sc.bodyA.id, linCorrection, v3Zero());

    sc.accumulatedImpulse = v3Add(sc.accumulatedImpulse, linCorrection);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private applyWarmStart(
    sc: SolvedConstraint,
    corrections: Map<string, { linearVelocity: IVector3; angularVelocity: IVector3 }>
  ): void {
    const scaled = v3Scale(sc.accumulatedImpulse, 0.8); // warm start factor
    this.accumulateCorrection(corrections, sc.bodyA.id, scaled, v3Zero());
    if (sc.bodyB) {
      this.accumulateCorrection(corrections, sc.bodyB.id, v3Scale(scaled, -1), v3Zero());
    }
  }

  private accumulateCorrection(
    corrections: Map<string, { linearVelocity: IVector3; angularVelocity: IVector3 }>,
    bodyId: string,
    linear: IVector3,
    angular: IVector3
  ): void {
    const existing = corrections.get(bodyId) || {
      linearVelocity: v3Zero(),
      angularVelocity: v3Zero(),
    };
    corrections.set(bodyId, {
      linearVelocity: v3Add(existing.linearVelocity, linear),
      angularVelocity: v3Add(existing.angularVelocity, angular),
    });
  }
}
