import type { Vector3 } from '@holoscript/core';
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
  position: [number, number, number];
  rotation: Vector3;
  velocity: Vector3;
  angularVelocity: Vector3;
  mass: number;
  length: number;
  jointLimits: {
    min: Vector3;
    max: Vector3;
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
      position: [0, 0, 0],
      rotation: [0, 0, 0 ],
      velocity: [0, 0, 0 ],
      angularVelocity: [0, 0, 0 ],
      mass,
      length,
      jointLimits: limits ?? { min: [-1, -1, -1 ], max: [1, 1, 1 ] },
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
      bone.velocity[1] += this.config.gravity * dt * this.blendFactor;
      bone.velocity[0] *= this.config.damping;
      bone.velocity[1] *= this.config.damping;
      bone.velocity[2] *= this.config.damping;

      bone.position[0] += bone.velocity[0] * dt;
      bone.position[1] += bone.velocity[1] * dt;
      bone.position[2] += bone.velocity[2] * dt;
    }

    // Constraint solving (distance constraints between parent-child)
    for (let iter = 0; iter < this.config.iterations; iter++) {
      for (const bone of this.bones.values()) {
        if (!bone.parentId) continue;
        const parent = this.bones.get(bone.parentId);
        if (!parent) continue;

        const dx = bone.position[0] - parent.position[0];
        const dy = bone.position[1] - parent.position[1];
        const dz = bone.position[2] - parent.position[2];
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (dist > 0 && dist !== bone.length) {
          const diff = (dist - bone.length) / dist;
          const mx = dx * diff * 0.5;
          const my = dy * diff * 0.5;
          const mz = dz * diff * 0.5;

          bone.position[0] -= mx;
          bone.position[1] -= my;
          bone.position[2] -= mz;
          parent.position[0] += mx;
          parent.position[1] += my;
          parent.position[2] += mz;
        }

        // Joint limits
        bone.rotation[0] = Math.max(
          bone.jointLimits.min[0],
          Math.min(bone.jointLimits.max[0], bone.rotation[0])
        );
        bone.rotation[1] = Math.max(
          bone.jointLimits.min[1],
          Math.min(bone.jointLimits.max[1], bone.rotation[1])
        );
        bone.rotation[2] = Math.max(
          bone.jointLimits.min[2],
          Math.min(bone.jointLimits.max[2], bone.rotation[2])
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
    bone.velocity[0] += impulse[0] / bone.mass;
    bone.velocity[1] += impulse[1] / bone.mass;
    bone.velocity[2] += impulse[2] / bone.mass;
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
