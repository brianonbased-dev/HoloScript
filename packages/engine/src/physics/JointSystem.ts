import type { Vector3 } from '@holoscript/core';
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
