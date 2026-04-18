import type { Vector3 } from '@holoscript/core';

type CompatVec3 = {
  x: number;
  y: number;
  z: number;
  0: number;
  1: number;
  2: number;
};

function makeVec3(x = 0, y = 0, z = 0): CompatVec3 {
  return { x, y, z, 0: x, 1: y, 2: z };
}

function getX(v: Vector3 | CompatVec3): number {
  return (v as any).x ?? (v as any)[0] ?? 0;
}
function getY(v: Vector3 | CompatVec3): number {
  return (v as any).y ?? (v as any)[1] ?? 0;
}
function getZ(v: Vector3 | CompatVec3): number {
  return (v as any).z ?? (v as any)[2] ?? 0;
}

function setVec3(v: CompatVec3, x: number, y: number, z: number): void {
  v.x = x;
  v.y = y;
  v.z = z;
  v[0] = x;
  v[1] = y;
  v[2] = z;
}
/**
 * RagdollController.ts
 *
 * Ragdoll physics: bone chain definition, joint limits,
 * active/ragdoll blending, and impulse application.
 *
 * @module physics
 */

// =============================================================================
// TYPES
// =============================================================================

export interface RagdollBone {
  id: string;
  name: string;
  parentId: string | null;
  position: CompatVec3;
  rotation: CompatVec3;
  velocity: CompatVec3;
  angularVelocity: CompatVec3;
  mass: number;
  length: number;
  jointLimits: {
    min: CompatVec3;
    max: CompatVec3;
  };
}

export interface RagdollConfig {
  gravity: number;
  damping: number;
  iterations: number;
}

export type RagdollState = 'active' | 'ragdoll' | 'blending';

// =============================================================================
// RAGDOLL CONTROLLER
// =============================================================================

export class RagdollController {
  private bones: Map<string, RagdollBone> = new Map();
  private rootBone: string | null = null;
  private state: RagdollState = 'active';
  private blendFactor = 0; // 0 = animated, 1 = ragdoll
  private blendSpeed = 2;
  private config: RagdollConfig;

  constructor(config?: Partial<RagdollConfig>) {
    this.config = { gravity: -9.81, damping: 0.98, iterations: 4, ...config };
  }

  // ---------------------------------------------------------------------------
  // Bone Chain Setup
  // ---------------------------------------------------------------------------

  addBone(
    name: string,
    parentId: string | null,
    mass: number,
    length: number,
    limits?: { min: Vector3; max: Vector3 }
  ): RagdollBone {
    const bone: RagdollBone = {
      id: name,
      name,
      parentId,
      position: makeVec3(0, 0, 0),
      rotation: makeVec3(0, 0, 0),
      velocity: makeVec3(0, 0, 0),
      angularVelocity: makeVec3(0, 0, 0),
      mass,
      length,
      jointLimits: limits
        ? {
            min: makeVec3(getX(limits.min), getY(limits.min), getZ(limits.min)),
            max: makeVec3(getX(limits.max), getY(limits.max), getZ(limits.max)),
          }
        : { min: makeVec3(-1, -1, -1), max: makeVec3(1, 1, 1) },
    };
    this.bones.set(name, bone);
    if (!parentId) this.rootBone = name;
    return bone;
  }

  removeBone(name: string): boolean {
    return this.bones.delete(name);
  }

  // ---------------------------------------------------------------------------
  // State Control
  // ---------------------------------------------------------------------------

  activate(): void {
    this.state = 'active';
    this.blendFactor = 0;
  }

  goRagdoll(): void {
    this.state = 'ragdoll';
    this.blendFactor = 1;
  }

  startBlend(toRagdoll = true): void {
    this.state = 'blending';
    this.blendFactor = toRagdoll ? 0 : 1;
  }

  getState(): RagdollState {
    return this.state;
  }
  getBlendFactor(): number {
    return this.blendFactor;
  }

  // ---------------------------------------------------------------------------
  // Physics Update
  // ---------------------------------------------------------------------------

  update(dt: number): void {
    // Blend transition
    if (this.state === 'blending') {
      this.blendFactor = Math.min(1, this.blendFactor + this.blendSpeed * dt);
      if (this.blendFactor >= 1) this.state = 'ragdoll';
    }

    if (this.state === 'active') return; // Animation-driven

    // Apply gravity and integrate
    for (const bone of this.bones.values()) {
      const vx = getX(bone.velocity) * this.config.damping;
      const vy = (getY(bone.velocity) + this.config.gravity * dt * this.blendFactor) *
        this.config.damping;
      const vz = getZ(bone.velocity) * this.config.damping;
      setVec3(bone.velocity, vx, vy, vz);

      setVec3(
        bone.position,
        getX(bone.position) + vx * dt,
        getY(bone.position) + vy * dt,
        getZ(bone.position) + vz * dt
      );
    }

    // Constraint solving (distance constraints between parent-child)
    for (let iter = 0; iter < this.config.iterations; iter++) {
      for (const bone of this.bones.values()) {
        if (!bone.parentId) continue;
        const parent = this.bones.get(bone.parentId);
        if (!parent) continue;

        const dx = getX(bone.position) - getX(parent.position);
        const dy = getY(bone.position) - getY(parent.position);
        const dz = getZ(bone.position) - getZ(parent.position);
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (dist > 0 && dist !== bone.length) {
          const diff = (dist - bone.length) / dist;
          const mx = dx * diff * 0.5;
          const my = dy * diff * 0.5;
          const mz = dz * diff * 0.5;

          setVec3(bone.position, getX(bone.position) - mx, getY(bone.position) - my, getZ(bone.position) - mz);
          setVec3(parent.position, getX(parent.position) + mx, getY(parent.position) + my, getZ(parent.position) + mz);
        }

        // Joint limits
        setVec3(
          bone.rotation,
          Math.max(getX(bone.jointLimits.min), Math.min(getX(bone.jointLimits.max), getX(bone.rotation))),
          Math.max(getY(bone.jointLimits.min), Math.min(getY(bone.jointLimits.max), getY(bone.rotation))),
          Math.max(getZ(bone.jointLimits.min), Math.min(getZ(bone.jointLimits.max), getZ(bone.rotation)))
        );
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Impulse
  // ---------------------------------------------------------------------------

  applyImpulse(boneId: string, impulse: Vector3): void {
    const bone = this.bones.get(boneId);
    if (!bone) return;
    setVec3(
      bone.velocity,
      getX(bone.velocity) + getX(impulse) / bone.mass,
      getY(bone.velocity) + getY(impulse) / bone.mass,
      getZ(bone.velocity) + getZ(impulse) / bone.mass
    );
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getBone(id: string): RagdollBone | undefined {
    return this.bones.get(id);
  }
  getBoneCount(): number {
    return this.bones.size;
  }
  getRootBone(): RagdollBone | undefined {
    return this.rootBone ? this.bones.get(this.rootBone) : undefined;
  }

  getChildren(boneId: string): RagdollBone[] {
    return [...this.bones.values()].filter((b) => b.parentId === boneId);
  }
}
