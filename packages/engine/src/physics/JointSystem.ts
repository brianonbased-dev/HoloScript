import type { Vector3 } from '@holoscript/core';
import type { IPhysicsWorld } from './PhysicsTypes';
/**
 * JointSystem.ts
 *
 * Physics joint types: hinge, ball, slider, spring, distance, fixed.
 * Constraint solving, breakable joints, and motor forces.
 *
 * @module physics
 */

// =============================================================================
// TYPES
// =============================================================================

export type JointType = 'hinge' | 'ball' | 'slider' | 'spring' | 'distance' | 'fixed';

export interface JointDef {
  id: string;
  type: JointType;
  bodyA: string;
  bodyB: string;
  anchorA: Vector3;
  anchorB: Vector3;
  axis?: Vector3;
  limits?: { min: number; max: number };
  breakForce: number; // Infinity = unbreakable
  stiffness: number;
  damping: number;
  motorSpeed: number;
  motorForce: number;
  broken: boolean;
  enabled: boolean;
  /** Stored rest length for distance joints (set at creation from anchor separation). */
  restLength: number;
}

export interface JointState {
  currentForce: number;
  currentAngle: number;
  currentDistance: number;
  /** Previous distance used to estimate relative velocity for spring damping. */
  previousDistance: number;
}

// =============================================================================
// JOINT SYSTEM
// =============================================================================

let _jointId = 0;

export class JointSystem {
  private joints: Map<string, JointDef> = new Map();
  private states: Map<string, JointState> = new Map();
  private bodyJoints: Map<string, Set<string>> = new Map(); // body → joint ids

  // ---------------------------------------------------------------------------
  // Joint Creation
  // ---------------------------------------------------------------------------

  createJoint(type: JointType, bodyA: string, bodyB: string, config?: Partial<JointDef>): JointDef {
    const id = config?.id ?? `joint_${_jointId++}`;
    const anchorA = config?.anchorA ?? ([0, 0, 0] as Vector3);
    const anchorB = config?.anchorB ?? ([0, 0, 0] as Vector3);
    // Compute initial anchor separation as the rest length for spring / distance joints.
    const initDist = this.distance3D(anchorA, anchorB);
    const joint: JointDef = {
      id,
      type,
      bodyA,
      bodyB,
      anchorA,
      anchorB,
      axis: config?.axis ?? [0, 1, 0],
      limits: config?.limits,
      breakForce: config?.breakForce ?? Infinity,
      stiffness: config?.stiffness ?? 1,
      damping: config?.damping ?? 0.1,
      motorSpeed: config?.motorSpeed ?? 0,
      motorForce: config?.motorForce ?? 0,
      broken: false,
      enabled: true,
      restLength: initDist,
    };

    this.joints.set(id, joint);
    this.states.set(id, {
      currentForce: 0,
      currentAngle: 0,
      currentDistance: initDist,
      previousDistance: initDist,
    });

    // Index by body
    for (const body of [bodyA, bodyB]) {
      if (!this.bodyJoints.has(body)) this.bodyJoints.set(body, new Set());
      this.bodyJoints.get(body)!.add(id);
    }

    return joint;
  }

  removeJoint(id: string): boolean {
    const joint = this.joints.get(id);
    if (!joint) return false;
    this.bodyJoints.get(joint.bodyA)?.delete(id);
    this.bodyJoints.get(joint.bodyB)?.delete(id);
    this.states.delete(id);
    return this.joints.delete(id);
  }

  // ---------------------------------------------------------------------------
  // Constraint Solving
  // ---------------------------------------------------------------------------

  solve(dt: number): void {
    for (const [id, joint] of this.joints) {
      if (!joint.enabled || joint.broken) continue;
      const state = this.states.get(id)!;

      switch (joint.type) {
        case 'spring': {
          // F_spring = k * (currentDistance - restLength)
          // F_damp   = -c * vRel  where vRel = d(distance)/dt ≈ Δdist / dt
          // The damping must oppose relative velocity, not be proportional to force.
          const springForce = joint.stiffness * (state.currentDistance - joint.restLength);
          const vRel = dt > 0 ? (state.currentDistance - state.previousDistance) / dt : 0;
          const dampForce = -joint.damping * vRel;
          const force = springForce + dampForce;
          state.previousDistance = state.currentDistance;
          state.currentForce = force;
          break;
        }
        case 'distance': {
          // Measure actual current separation and compare to the stored rest length.
          // The rest length was fixed at joint creation — do NOT re-measure it here,
          // because that would zero the error on every step (the original bug).
          const currentDist = this.distance3D(joint.anchorA, joint.anchorB);
          state.currentDistance = currentDist;
          state.currentForce = joint.stiffness * Math.abs(currentDist - joint.restLength);
          break;
        }
        case 'hinge': {
          if (joint.limits) {
            state.currentAngle = Math.max(
              joint.limits.min,
              Math.min(joint.limits.max, state.currentAngle)
            );
          }
          if (joint.motorForce > 0) {
            state.currentAngle += joint.motorSpeed * dt;
          }
          state.currentForce = Math.abs(joint.stiffness * state.currentAngle);
          break;
        }
        case 'slider': {
          if (joint.limits) {
            state.currentDistance = Math.max(
              joint.limits.min,
              Math.min(joint.limits.max, state.currentDistance)
            );
          }
          state.currentForce = joint.stiffness * Math.abs(state.currentDistance);
          break;
        }
        default:
          state.currentForce = 0;
          break;
      }

      // Break check
      if (state.currentForce > joint.breakForce) {
        joint.broken = true;
      }
    }
  }

  /**
   * Couple computed joint forces into the rigid-body world (zgcn).
   *
   * `solve()` computes only a scalar `currentForce` magnitude in a vacuum — it
   * reads neither body positions nor applies anything, so on its own a joint
   * moves no body (the structural gap audited 2026-06-10). This method closes
   * the loop for the LINEAR constraint laws (spring, distance): for each enabled
   * such joint it reads the live positions/velocities of bodyA and bodyB,
   * computes the constraint force VECTOR along the A→B axis (Hooke restoring term
   * + axial damping that opposes the separation rate), and applies equal and
   * opposite forces to the two bodies via the world.
   *
   * Force on A points toward B when the bodies are stretched beyond rest length
   * (pulling them together) and away when compressed; B receives the negation —
   * so the pair conserves linear momentum. Coincident bodies (no defined axis)
   * are skipped. Hinge/slider angular DOFs are not force-coupled here — their
   * rotational constraint is the ConstraintSolver's responsibility; this method
   * applies exactly the linear law that `currentForce` represents.
   *
   * Call once per substep before `world.step(dt)`. Updates joint state
   * (currentDistance, previousDistance, currentForce) and the break check, so it
   * subsumes `solve()` for spring/distance joints when a world is present.
   *
   * @param world Rigid-body world exposing getBody / applyForce by body id.
   * @param dt    Substep duration (seconds); reserved for state bookkeeping.
   */
  applyForcesToWorld(world: IPhysicsWorld, _dt: number): void {
    const EPS = 1e-9;
    for (const [id, joint] of this.joints) {
      if (!joint.enabled || joint.broken) continue;
      if (joint.type !== 'spring' && joint.type !== 'distance') continue;

      const a = world.getBody(joint.bodyA);
      const b = world.getBody(joint.bodyB);
      if (!a || !b) continue;

      const dx = b.position[0] - a.position[0];
      const dy = b.position[1] - a.position[1];
      const dz = b.position[2] - a.position[2];
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist < EPS) continue; // coincident — no defined constraint axis

      const ux = dx / dist;
      const uy = dy / dist;
      const uz = dz / dist;

      // Hooke restoring term: >0 when stretched (pull A toward B along +u).
      const springMag = joint.stiffness * (dist - joint.restLength);

      // Axial damping opposes the separation rate vRel = (vB − vA)·û.
      const va = a.linearVelocity;
      const vb = b.linearVelocity;
      const vRel = (vb[0] - va[0]) * ux + (vb[1] - va[1]) * uy + (vb[2] - va[2]) * uz;
      const mag = springMag + joint.damping * vRel;

      const fx = mag * ux;
      const fy = mag * uy;
      const fz = mag * uz;

      // Equal and opposite: +F on A (toward B when stretched), −F on B.
      world.applyForce(joint.bodyA, [fx, fy, fz]);
      world.applyForce(joint.bodyB, [-fx, -fy, -fz]);

      const state = this.states.get(id)!;
      state.previousDistance = state.currentDistance;
      state.currentDistance = dist;
      state.currentForce = Math.abs(mag);
      if (state.currentForce > joint.breakForce) joint.broken = true;
    }
  }

  // ---------------------------------------------------------------------------
  // Controls
  // ---------------------------------------------------------------------------

  setMotor(id: string, speed: number, force: number): void {
    const joint = this.joints.get(id);
    if (joint) {
      joint.motorSpeed = speed;
      joint.motorForce = force;
    }
  }

  setEnabled(id: string, enabled: boolean): void {
    const joint = this.joints.get(id);
    if (joint) joint.enabled = enabled;
  }

  setAngle(id: string, angle: number): void {
    const state = this.states.get(id);
    if (state) state.currentAngle = angle;
  }

  setDistance(id: string, dist: number): void {
    const state = this.states.get(id);
    if (state) state.currentDistance = dist;
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getJoint(id: string): JointDef | undefined {
    return this.joints.get(id);
  }
  getState(id: string): JointState | undefined {
    return this.states.get(id);
  }
  getJointCount(): number {
    return this.joints.size;
  }
  getBrokenJoints(): JointDef[] {
    return [...this.joints.values()].filter((j) => j.broken);
  }

  getJointsForBody(bodyId: string): JointDef[] {
    const ids = this.bodyJoints.get(bodyId);
    if (!ids) return [];
    return [...ids].map((id) => this.joints.get(id)!).filter(Boolean);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private distance3D(a: Vector3, b: Vector3): number {
    const dx = b[0] - a[0],
      dy = b[1] - a[1],
      dz = b[2] - a[2];
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
}
