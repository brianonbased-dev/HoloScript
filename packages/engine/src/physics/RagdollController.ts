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
  rotation: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number };
  angularVelocity: { x: number; y: number; z: number };
  mass: number;
  length: number;
  jointLimits: {
    min: { x: number; y: number; z: number };
    max: { x: number; y: number; z: number };
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
    limits?: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } }
  ): RagdollBone {
    const bone: RagdollBone = {
      id: name,
      name,
      parentId,
      position: [0, 0, 0],
      rotation: { x: 0, y: 0, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      angularVelocity: { x: 0, y: 0, z: 0 },
      mass,
      length,
      jointLimits: limits ?? { min: { x: -1, y: -1, z: -1 }, max: { x: 1, y: 1, z: 1 } },
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
      bone.velocity.y += this.config.gravity * dt * this.blendFactor;
      bone.velocity.x *= this.config.damping;
      bone.velocity.y *= this.config.damping;
      bone.velocity.z *= this.config.damping;

      bone.position.x += bone.velocity.x * dt;
      bone.position.y += bone.velocity.y * dt;
      bone.position.z += bone.velocity.z * dt;
    }

    // Constraint solving (distance constraints between parent-child)
    for (let iter = 0; iter < this.config.iterations; iter++) {
      for (const bone of this.bones.values()) {
        if (!bone.parentId) continue;
        const parent = this.bones.get(bone.parentId);
        if (!parent) continue;

        const dx = bone.position.x - parent.position.x;
        const dy = bone.position.y - parent.position.y;
        const dz = bone.position.z - parent.position.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (dist > 0 && dist !== bone.length) {
          const diff = (dist - bone.length) / dist;
          const mx = dx * diff * 0.5;
          const my = dy * diff * 0.5;
          const mz = dz * diff * 0.5;

          bone.position.x -= mx;
          bone.position.y -= my;
          bone.position.z -= mz;
          parent.position.x += mx;
          parent.position.y += my;
          parent.position.z += mz;
        }

        // Joint limits
        bone.rotation.x = Math.max(
          bone.jointLimits.min.x,
          Math.min(bone.jointLimits.max.x, bone.rotation.x)
        );
        bone.rotation.y = Math.max(
          bone.jointLimits.min.y,
          Math.min(bone.jointLimits.max.y, bone.rotation.y)
        );
        bone.rotation.z = Math.max(
          bone.jointLimits.min.z,
          Math.min(bone.jointLimits.max.z, bone.rotation.z)
        );
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Impulse
  // ---------------------------------------------------------------------------

  applyImpulse(boneId: string, impulse: { x: number; y: number; z: number }): void {
    const bone = this.bones.get(boneId);
    if (!bone) return;
    bone.velocity.x += impulse.x / bone.mass;
    bone.velocity.y += impulse.y / bone.mass;
    bone.velocity.z += impulse.z / bone.mass;
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
