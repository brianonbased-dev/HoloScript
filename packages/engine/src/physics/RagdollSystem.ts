import type { Vector3 } from '@holoscript/core';
/**
 * RagdollSystem.ts
 *
 * Ragdoll physics system for articulated character bodies.
 * Creates rigid body chains with cone/hinge constraints for humanoid and quadruped skeletons.
 *
 * @module physics
 */

import {
  IVector3,
  IQuaternion,
  IRigidBodyConfig,
  Constraint,
  IConeConstraint,
  IHingeConstraint,
} from './PhysicsTypes';

// =============================================================================
// TYPES
// =============================================================================

export interface BoneDefinition {
  id: string;
  parentBone?: string;
  length: number;
  radius: number;
  mass: number;
  localOffset: IVector3;
  jointType: 'cone' | 'hinge';
  jointLimits?: {
    swingSpan1?: number;
    swingSpan2?: number;
    twistSpan?: number;
    low?: number;
    high?: number;
  };
}

export interface RagdollDefinition {
  id: string;
  bones: BoneDefinition[];
}

export interface RagdollInstance {
  id: string;
  definition: RagdollDefinition;
  bodies: IRigidBodyConfig[];
  constraints: Constraint[];
  rootPosition: IVector3;
}

// =============================================================================
// PRESETS
// =============================================================================

export const HUMANOID_PRESET: BoneDefinition[] = [
  // Torso
  {
    id: 'pelvis',
    length: 0.25,
    radius: 0.12,
    mass: 15,
    localOffset: [0, 0, 0 ],
    jointType: 'cone',
  },
  {
    id: 'spine',
    parentBone: 'pelvis',
    length: 0.3,
    radius: 0.1,
    mass: 12,
    localOffset: [0, 0.25, 0 ],
    jointType: 'cone',
    jointLimits: { swingSpan1: 0.3, swingSpan2: 0.3, twistSpan: 0.2 },
  },
  {
    id: 'chest',
    parentBone: 'spine',
    length: 0.25,
    radius: 0.12,
    mass: 10,
    localOffset: [0, 0.3, 0 ],
    jointType: 'cone',
    jointLimits: { swingSpan1: 0.2, swingSpan2: 0.2, twistSpan: 0.15 },
  },
  {
    id: 'head',
    parentBone: 'chest',
    length: 0.2,
    radius: 0.1,
    mass: 5,
    localOffset: [0, 0.25, 0 ],
    jointType: 'cone',
    jointLimits: { swingSpan1: 0.5, swingSpan2: 0.3, twistSpan: 0.4 },
  },

  // Left arm
  {
    id: 'l_upper_arm',
    parentBone: 'chest',
    length: 0.28,
    radius: 0.04,
    mass: 3,
    localOffset: [-0.18, 0.15, 0 ],
    jointType: 'cone',
    jointLimits: { swingSpan1: 1.5, swingSpan2: 1.0, twistSpan: 0.8 },
  },
  {
    id: 'l_forearm',
    parentBone: 'l_upper_arm',
    length: 0.25,
    radius: 0.035,
    mass: 2,
    localOffset: [0, -0.28, 0 ],
    jointType: 'hinge',
    jointLimits: { low: 0, high: 2.5 },
  },
  {
    id: 'l_hand',
    parentBone: 'l_forearm',
    length: 0.1,
    radius: 0.03,
    mass: 0.5,
    localOffset: [0, -0.25, 0 ],
    jointType: 'cone',
    jointLimits: { swingSpan1: 0.5, swingSpan2: 0.3, twistSpan: 0.3 },
  },

  // Right arm
  {
    id: 'r_upper_arm',
    parentBone: 'chest',
    length: 0.28,
    radius: 0.04,
    mass: 3,
    localOffset: [0.18, 0.15, 0 ],
    jointType: 'cone',
    jointLimits: { swingSpan1: 1.5, swingSpan2: 1.0, twistSpan: 0.8 },
  },
  {
    id: 'r_forearm',
    parentBone: 'r_upper_arm',
    length: 0.25,
    radius: 0.035,
    mass: 2,
    localOffset: [0, -0.28, 0 ],
    jointType: 'hinge',
    jointLimits: { low: 0, high: 2.5 },
  },
  {
    id: 'r_hand',
    parentBone: 'r_forearm',
    length: 0.1,
    radius: 0.03,
    mass: 0.5,
    localOffset: [0, -0.25, 0 ],
    jointType: 'cone',
    jointLimits: { swingSpan1: 0.5, swingSpan2: 0.3, twistSpan: 0.3 },
  },

  // Left leg
  {
    id: 'l_thigh',
    parentBone: 'pelvis',
    length: 0.4,
    radius: 0.06,
    mass: 8,
    localOffset: [-0.1, -0.15, 0 ],
    jointType: 'cone',
    jointLimits: { swingSpan1: 1.2, swingSpan2: 0.5, twistSpan: 0.3 },
  },
  {
    id: 'l_shin',
    parentBone: 'l_thigh',
    length: 0.38,
    radius: 0.05,
    mass: 5,
    localOffset: [0, -0.4, 0 ],
    jointType: 'hinge',
    jointLimits: { low: -2.5, high: 0 },
  },
  {
    id: 'l_foot',
    parentBone: 'l_shin',
    length: 0.15,
    radius: 0.04,
    mass: 1,
    localOffset: [0, -0.38, 0.05 ],
    jointType: 'hinge',
    jointLimits: { low: -0.5, high: 0.5 },
  },

  // Right leg
  {
    id: 'r_thigh',
    parentBone: 'pelvis',
    length: 0.4,
    radius: 0.06,
    mass: 8,
    localOffset: [0.1, -0.15, 0 ],
    jointType: 'cone',
    jointLimits: { swingSpan1: 1.2, swingSpan2: 0.5, twistSpan: 0.3 },
  },
  {
    id: 'r_shin',
    parentBone: 'r_thigh',
    length: 0.38,
    radius: 0.05,
    mass: 5,
    localOffset: [0, -0.4, 0 ],
    jointType: 'hinge',
    jointLimits: { low: -2.5, high: 0 },
  },
  {
    id: 'r_foot',
    parentBone: 'r_shin',
    length: 0.15,
    radius: 0.04,
    mass: 1,
    localOffset: [0, -0.38, 0.05 ],
    jointType: 'hinge',
    jointLimits: { low: -0.5, high: 0.5 },
  },
];

export const QUADRUPED_PRESET: BoneDefinition[] = [
  // Body
  {
    id: 'body',
    length: 0.6,
    radius: 0.15,
    mass: 20,
    localOffset: [0, 0, 0 ],
    jointType: 'cone',
  },
  {
    id: 'neck',
    parentBone: 'body',
    length: 0.2,
    radius: 0.06,
    mass: 3,
    localOffset: [0, 0.1, 0.3 ],
    jointType: 'cone',
    jointLimits: { swingSpan1: 0.8, swingSpan2: 0.4, twistSpan: 0.3 },
  },
  {
    id: 'head',
    parentBone: 'neck',
    length: 0.15,
    radius: 0.08,
    mass: 2,
    localOffset: [0, 0.05, 0.2 ],
    jointType: 'cone',
    jointLimits: { swingSpan1: 0.6, swingSpan2: 0.4, twistSpan: 0.3 },
  },
  {
    id: 'tail',
    parentBone: 'body',
    length: 0.3,
    radius: 0.02,
    mass: 0.5,
    localOffset: [0, 0.05, -0.35 ],
    jointType: 'cone',
    jointLimits: { swingSpan1: 1.0, swingSpan2: 0.5, twistSpan: 0.5 },
  },

  // Front legs
  {
    id: 'fl_upper',
    parentBone: 'body',
    length: 0.25,
    radius: 0.03,
    mass: 2,
    localOffset: [-0.12, -0.15, 0.2 ],
    jointType: 'cone',
    jointLimits: { swingSpan1: 0.8, swingSpan2: 0.4, twistSpan: 0.2 },
  },
  {
    id: 'fl_lower',
    parentBone: 'fl_upper',
    length: 0.2,
    radius: 0.025,
    mass: 1.5,
    localOffset: [0, -0.25, 0 ],
    jointType: 'hinge',
    jointLimits: { low: -2.0, high: 0 },
  },
  {
    id: 'fr_upper',
    parentBone: 'body',
    length: 0.25,
    radius: 0.03,
    mass: 2,
    localOffset: [0.12, -0.15, 0.2 ],
    jointType: 'cone',
    jointLimits: { swingSpan1: 0.8, swingSpan2: 0.4, twistSpan: 0.2 },
  },
  {
    id: 'fr_lower',
    parentBone: 'fr_upper',
    length: 0.2,
    radius: 0.025,
    mass: 1.5,
    localOffset: [0, -0.25, 0 ],
    jointType: 'hinge',
    jointLimits: { low: -2.0, high: 0 },
  },

  // Hind legs
  {
    id: 'hl_upper',
    parentBone: 'body',
    length: 0.28,
    radius: 0.04,
    mass: 3,
    localOffset: [-0.12, -0.15, -0.2 ],
    jointType: 'cone',
    jointLimits: { swingSpan1: 1.0, swingSpan2: 0.5, twistSpan: 0.2 },
  },
  {
    id: 'hl_lower',
    parentBone: 'hl_upper',
    length: 0.22,
    radius: 0.03,
    mass: 2,
    localOffset: [0, -0.28, 0 ],
    jointType: 'hinge',
    jointLimits: { low: 0, high: 2.0 },
  },
  {
    id: 'hr_upper',
    parentBone: 'body',
    length: 0.28,
    radius: 0.04,
    mass: 3,
    localOffset: [0.12, -0.15, -0.2 ],
    jointType: 'cone',
    jointLimits: { swingSpan1: 1.0, swingSpan2: 0.5, twistSpan: 0.2 },
  },
  {
    id: 'hr_lower',
    parentBone: 'hr_upper',
    length: 0.22,
    radius: 0.03,
    mass: 2,
    localOffset: [0, -0.28, 0 ],
    jointType: 'hinge',
    jointLimits: { low: 0, high: 2.0 },
  },
];

// =============================================================================
// RAGDOLL SYSTEM
// =============================================================================

export class RagdollSystem {
  private ragdolls: Map<string, RagdollInstance> = new Map();

  /**
   * Create a ragdoll from a definition at a given world position.
   */
  createRagdoll(definition: RagdollDefinition, rootPosition: IVector3): RagdollInstance {
    const bodies: IRigidBodyConfig[] = [];
    const constraints: Constraint[] = [];
    const bonePositions = new Map<string, IVector3>();

    // Pass 1: Create rigid bodies
    for (const bone of definition.bones) {
      const parentPos = bone.parentBone
        ? bonePositions.get(bone.parentBone) || rootPosition
        : rootPosition;

      const worldPos: IVector3 = [parentPos[0] + bone.localOffset[0], parentPos[1] + bone.localOffset[1], parentPos[2] + bone.localOffset[2], ];

      bonePositions.set(bone.id, worldPos);

      const bodyConfig: IRigidBodyConfig = {
        id: `${definition.id}_${bone.id}`,
        type: 'dynamic',
        transform: {
          position: worldPos,
          rotation: [0, 0, 0, 1 ],
          scale: [1, 1, 1 ],
        },
        shape: {
          type: 'capsule',
          radius: bone.radius,
          height: bone.length,
        },
        mass: bone.mass,
        material: {
          friction: 0.6,
          restitution: 0.1,
        },
        linearDamping: 0.05,
        angularDamping: 0.85,
      };

      bodies.push(bodyConfig);
    }

    // Pass 2: Create constraints
    for (const bone of definition.bones) {
      if (!bone.parentBone) continue;

      const bodyAId = `${definition.id}_${bone.parentBone}`;
      const bodyBId = `${definition.id}_${bone.id}`;
      const constraintId = `${definition.id}_joint_${bone.parentBone}_${bone.id}`;

      if (bone.jointType === 'cone') {
        const coneConstraint: IConeConstraint = {
          type: 'cone',
          id: constraintId,
          bodyA: bodyAId,
          bodyB: bodyBId,
          pivotA: bone.localOffset,
          pivotB: [0, 0, 0 ],
          axisA: [0, 1, 0 ],
          axisB: [0, 1, 0 ],
          swingSpan1: bone.jointLimits?.swingSpan1 ?? 0.5,
          swingSpan2: bone.jointLimits?.swingSpan2 ?? 0.3,
          twistSpan: bone.jointLimits?.twistSpan ?? 0.2,
        };
        constraints.push(coneConstraint);
      } else {
        const hingeConstraint: IHingeConstraint = {
          type: 'hinge',
          id: constraintId,
          bodyA: bodyAId,
          bodyB: bodyBId,
          pivotA: bone.localOffset,
          pivotB: [0, 0, 0 ],
          axisA: [1, 0, 0 ],
          axisB: [1, 0, 0 ],
          limits: {
            low: bone.jointLimits?.low ?? -1.0,
            high: bone.jointLimits?.high ?? 1.0,
          },
        };
        constraints.push(hingeConstraint);
      }
    }

    const instance: RagdollInstance = {
      id: definition.id,
      definition,
      bodies,
      constraints,
      rootPosition,
    };

    this.ragdolls.set(definition.id, instance);
    return instance;
  }

  /**
   * Create humanoid ragdoll from preset.
   */
  createHumanoid(id: string, rootPosition: IVector3): RagdollInstance {
    return this.createRagdoll({ id, bones: HUMANOID_PRESET }, rootPosition);
  }

  /**
   * Create quadruped ragdoll from preset.
   */
  createQuadruped(id: string, rootPosition: IVector3): RagdollInstance {
    return this.createRagdoll({ id, bones: QUADRUPED_PRESET }, rootPosition);
  }

  /**
   * Get a ragdoll instance by ID.
   */
  getRagdoll(id: string): RagdollInstance | undefined {
    return this.ragdolls.get(id);
  }

  /**
   * Remove a ragdoll.
   */
  removeRagdoll(id: string): boolean {
    return this.ragdolls.delete(id);
  }

  /**
   * Get total mass of a ragdoll.
   */
  getTotalMass(id: string): number {
    const ragdoll = this.ragdolls.get(id);
    if (!ragdoll) return 0;
    return ragdoll.definition.bones.reduce((sum, bone) => sum + bone.mass, 0);
  }
}
