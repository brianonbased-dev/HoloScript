/**
 * HumanoidSkeleton.ts
 *
 * 65-bone humanoid skeleton template compatible with VRM, Mixamo,
 * Ready Player Me, Apple ARKit, and Unreal MetaHuman.
 *
 * Hierarchy:
 *   root → hips → spine chain → neck/head (+ FACS bones)
 *                → shoulder → arm → forearm → hand (+ 15 finger bones)
 *                → upper_leg → lower_leg → foot → toes
 *
 * @see W.244: Seven-stage pipeline enables single-source multi-platform deploy
 * @see P.CHAR.004: Multi-Platform Export
 * @module character
 */

// =============================================================================
// Bone Definition
// =============================================================================

export interface BoneDefinition {
  name: string;
  parent: string | null;
  /** Local-space position relative to parent */
  position: [number, number, number];
  /** Bone length in meters */
  length: number;
  /** Rotation limits in degrees [minX, maxX, minY, maxY, minZ, maxZ] */
  rotationLimits?: [number, number, number, number, number, number];
}

// =============================================================================
// Standard Bone Names (65 bones)
// =============================================================================

export const HUMANOID_BONE_NAMES = [
  // Root
  'root',
  'hips',

  // Spine chain (5)
  'spine',
  'spine1',
  'spine2',
  'neck',
  'head',

  // Left arm (4 + 15 fingers = 19)
  'left_shoulder',
  'left_upper_arm',
  'left_forearm',
  'left_hand',
  'left_thumb_proximal',
  'left_thumb_intermediate',
  'left_thumb_distal',
  'left_index_proximal',
  'left_index_intermediate',
  'left_index_distal',
  'left_middle_proximal',
  'left_middle_intermediate',
  'left_middle_distal',
  'left_ring_proximal',
  'left_ring_intermediate',
  'left_ring_distal',
  'left_pinky_proximal',
  'left_pinky_intermediate',
  'left_pinky_distal',

  // Right arm (4 + 15 fingers = 19)
  'right_shoulder',
  'right_upper_arm',
  'right_forearm',
  'right_hand',
  'right_thumb_proximal',
  'right_thumb_intermediate',
  'right_thumb_distal',
  'right_index_proximal',
  'right_index_intermediate',
  'right_index_distal',
  'right_middle_proximal',
  'right_middle_intermediate',
  'right_middle_distal',
  'right_ring_proximal',
  'right_ring_intermediate',
  'right_ring_distal',
  'right_pinky_proximal',
  'right_pinky_intermediate',
  'right_pinky_distal',

  // Left leg (5)
  'left_upper_leg',
  'left_lower_leg',
  'left_foot',
  'left_toes',
  'left_toe_end',

  // Right leg (5)
  'right_upper_leg',
  'right_lower_leg',
  'right_foot',
  'right_toes',
  'right_toe_end',
] as const;

export type HumanoidBoneName = (typeof HUMANOID_BONE_NAMES)[number];

// =============================================================================
// 65-Bone Humanoid Template
// =============================================================================

/** Average adult male proportions (1.75m height). */
export const HUMANOID_65_SKELETON: BoneDefinition[] = [
  // Root & hips
  { name: 'root', parent: null, position: [0, 0, 0], length: 0 },
  {
    name: 'hips',
    parent: 'root',
    position: [0, 0.95, 0],
    length: 0.12,
    rotationLimits: [-30, 30, -40, 40, -30, 30],
  },

  // Spine chain
  {
    name: 'spine',
    parent: 'hips',
    position: [0, 0.12, 0],
    length: 0.12,
    rotationLimits: [-20, 40, -20, 20, -20, 20],
  },
  {
    name: 'spine1',
    parent: 'spine',
    position: [0, 0.12, 0],
    length: 0.12,
    rotationLimits: [-20, 30, -15, 15, -15, 15],
  },
  {
    name: 'spine2',
    parent: 'spine1',
    position: [0, 0.12, 0],
    length: 0.12,
    rotationLimits: [-15, 25, -10, 10, -10, 10],
  },
  {
    name: 'neck',
    parent: 'spine2',
    position: [0, 0.12, 0],
    length: 0.08,
    rotationLimits: [-40, 40, -50, 50, -30, 30],
  },
  {
    name: 'head',
    parent: 'neck',
    position: [0, 0.08, 0],
    length: 0.2,
    rotationLimits: [-30, 30, -60, 60, -20, 20],
  },

  // Left arm
  {
    name: 'left_shoulder',
    parent: 'spine2',
    position: [0.08, 0.1, 0],
    length: 0.1,
    rotationLimits: [-15, 15, -10, 30, -30, 10],
  },
  {
    name: 'left_upper_arm',
    parent: 'left_shoulder',
    position: [0.1, 0, 0],
    length: 0.28,
    rotationLimits: [-90, 90, -60, 135, -90, 30],
  },
  {
    name: 'left_forearm',
    parent: 'left_upper_arm',
    position: [0.28, 0, 0],
    length: 0.25,
    rotationLimits: [0, 145, -90, 90, 0, 0],
  },
  {
    name: 'left_hand',
    parent: 'left_forearm',
    position: [0.25, 0, 0],
    length: 0.08,
    rotationLimits: [-70, 70, -30, 30, -15, 15],
  },

  // Left fingers — thumb
  { name: 'left_thumb_proximal', parent: 'left_hand', position: [0.03, -0.01, 0.02], length: 0.03 },
  {
    name: 'left_thumb_intermediate',
    parent: 'left_thumb_proximal',
    position: [0.03, 0, 0],
    length: 0.025,
  },
  {
    name: 'left_thumb_distal',
    parent: 'left_thumb_intermediate',
    position: [0.025, 0, 0],
    length: 0.02,
  },
  // Left fingers — index
  { name: 'left_index_proximal', parent: 'left_hand', position: [0.08, 0, 0.02], length: 0.035 },
  {
    name: 'left_index_intermediate',
    parent: 'left_index_proximal',
    position: [0.035, 0, 0],
    length: 0.025,
  },
  {
    name: 'left_index_distal',
    parent: 'left_index_intermediate',
    position: [0.025, 0, 0],
    length: 0.02,
  },
  // Left fingers — middle
  { name: 'left_middle_proximal', parent: 'left_hand', position: [0.08, 0, 0], length: 0.038 },
  {
    name: 'left_middle_intermediate',
    parent: 'left_middle_proximal',
    position: [0.038, 0, 0],
    length: 0.028,
  },
  {
    name: 'left_middle_distal',
    parent: 'left_middle_intermediate',
    position: [0.028, 0, 0],
    length: 0.02,
  },
  // Left fingers — ring
  { name: 'left_ring_proximal', parent: 'left_hand', position: [0.08, 0, -0.015], length: 0.035 },
  {
    name: 'left_ring_intermediate',
    parent: 'left_ring_proximal',
    position: [0.035, 0, 0],
    length: 0.025,
  },
  {
    name: 'left_ring_distal',
    parent: 'left_ring_intermediate',
    position: [0.025, 0, 0],
    length: 0.018,
  },
  // Left fingers — pinky
  { name: 'left_pinky_proximal', parent: 'left_hand', position: [0.075, 0, -0.03], length: 0.028 },
  {
    name: 'left_pinky_intermediate',
    parent: 'left_pinky_proximal',
    position: [0.028, 0, 0],
    length: 0.02,
  },
  {
    name: 'left_pinky_distal',
    parent: 'left_pinky_intermediate',
    position: [0.02, 0, 0],
    length: 0.015,
  },

  // Right arm (mirrored X)
  {
    name: 'right_shoulder',
    parent: 'spine2',
    position: [-0.08, 0.1, 0],
    length: 0.1,
    rotationLimits: [-15, 15, -30, 10, -10, 30],
  },
  {
    name: 'right_upper_arm',
    parent: 'right_shoulder',
    position: [-0.1, 0, 0],
    length: 0.28,
    rotationLimits: [-90, 90, -135, 60, -30, 90],
  },
  {
    name: 'right_forearm',
    parent: 'right_upper_arm',
    position: [-0.28, 0, 0],
    length: 0.25,
    rotationLimits: [0, 145, -90, 90, 0, 0],
  },
  {
    name: 'right_hand',
    parent: 'right_forearm',
    position: [-0.25, 0, 0],
    length: 0.08,
    rotationLimits: [-70, 70, -30, 30, -15, 15],
  },

  // Right fingers — thumb
  {
    name: 'right_thumb_proximal',
    parent: 'right_hand',
    position: [-0.03, -0.01, 0.02],
    length: 0.03,
  },
  {
    name: 'right_thumb_intermediate',
    parent: 'right_thumb_proximal',
    position: [-0.03, 0, 0],
    length: 0.025,
  },
  {
    name: 'right_thumb_distal',
    parent: 'right_thumb_intermediate',
    position: [-0.025, 0, 0],
    length: 0.02,
  },
  // Right fingers — index
  { name: 'right_index_proximal', parent: 'right_hand', position: [-0.08, 0, 0.02], length: 0.035 },
  {
    name: 'right_index_intermediate',
    parent: 'right_index_proximal',
    position: [-0.035, 0, 0],
    length: 0.025,
  },
  {
    name: 'right_index_distal',
    parent: 'right_index_intermediate',
    position: [-0.025, 0, 0],
    length: 0.02,
  },
  // Right fingers — middle
  { name: 'right_middle_proximal', parent: 'right_hand', position: [-0.08, 0, 0], length: 0.038 },
  {
    name: 'right_middle_intermediate',
    parent: 'right_middle_proximal',
    position: [-0.038, 0, 0],
    length: 0.028,
  },
  {
    name: 'right_middle_distal',
    parent: 'right_middle_intermediate',
    position: [-0.028, 0, 0],
    length: 0.02,
  },
  // Right fingers — ring
  {
    name: 'right_ring_proximal',
    parent: 'right_hand',
    position: [-0.08, 0, -0.015],
    length: 0.035,
  },
  {
    name: 'right_ring_intermediate',
    parent: 'right_ring_proximal',
    position: [-0.035, 0, 0],
    length: 0.025,
  },
  {
    name: 'right_ring_distal',
    parent: 'right_ring_intermediate',
    position: [-0.025, 0, 0],
    length: 0.018,
  },
  // Right fingers — pinky
  {
    name: 'right_pinky_proximal',
    parent: 'right_hand',
    position: [-0.075, 0, -0.03],
    length: 0.028,
  },
  {
    name: 'right_pinky_intermediate',
    parent: 'right_pinky_proximal',
    position: [-0.028, 0, 0],
    length: 0.02,
  },
  {
    name: 'right_pinky_distal',
    parent: 'right_pinky_intermediate',
    position: [-0.02, 0, 0],
    length: 0.015,
  },

  // Left leg
  {
    name: 'left_upper_leg',
    parent: 'hips',
    position: [0.09, -0.05, 0],
    length: 0.42,
    rotationLimits: [-20, 120, -45, 45, -40, 30],
  },
  {
    name: 'left_lower_leg',
    parent: 'left_upper_leg',
    position: [0, -0.42, 0],
    length: 0.4,
    rotationLimits: [-130, 0, 0, 0, 0, 0],
  },
  {
    name: 'left_foot',
    parent: 'left_lower_leg',
    position: [0, -0.4, 0],
    length: 0.15,
    rotationLimits: [-40, 40, -20, 20, -15, 15],
  },
  {
    name: 'left_toes',
    parent: 'left_foot',
    position: [0, 0, 0.15],
    length: 0.06,
    rotationLimits: [-30, 60, 0, 0, 0, 0],
  },
  { name: 'left_toe_end', parent: 'left_toes', position: [0, 0, 0.06], length: 0 },

  // Right leg (mirrored X)
  {
    name: 'right_upper_leg',
    parent: 'hips',
    position: [-0.09, -0.05, 0],
    length: 0.42,
    rotationLimits: [-20, 120, -45, 45, -30, 40],
  },
  {
    name: 'right_lower_leg',
    parent: 'right_upper_leg',
    position: [0, -0.42, 0],
    length: 0.4,
    rotationLimits: [-130, 0, 0, 0, 0, 0],
  },
  {
    name: 'right_foot',
    parent: 'right_lower_leg',
    position: [0, -0.4, 0],
    length: 0.15,
    rotationLimits: [-40, 40, -20, 20, -15, 15],
  },
  {
    name: 'right_toes',
    parent: 'right_foot',
    position: [0, 0, 0.15],
    length: 0.06,
    rotationLimits: [-30, 60, 0, 0, 0, 0],
  },
  { name: 'right_toe_end', parent: 'right_toes', position: [0, 0, 0.06], length: 0 },
];

// =============================================================================
// Cross-Platform Bone Mapping
// =============================================================================

/** Maps HumanoidBoneName → Mixamo bone name for animation retargeting. */
export const MIXAMO_BONE_MAP: Partial<Record<HumanoidBoneName, string>> = {
  hips: 'mixamorig:Hips',
  spine: 'mixamorig:Spine',
  spine1: 'mixamorig:Spine1',
  spine2: 'mixamorig:Spine2',
  neck: 'mixamorig:Neck',
  head: 'mixamorig:Head',
  left_shoulder: 'mixamorig:LeftShoulder',
  left_upper_arm: 'mixamorig:LeftArm',
  left_forearm: 'mixamorig:LeftForeArm',
  left_hand: 'mixamorig:LeftHand',
  right_shoulder: 'mixamorig:RightShoulder',
  right_upper_arm: 'mixamorig:RightArm',
  right_forearm: 'mixamorig:RightForeArm',
  right_hand: 'mixamorig:RightHand',
  left_upper_leg: 'mixamorig:LeftUpLeg',
  left_lower_leg: 'mixamorig:LeftLeg',
  left_foot: 'mixamorig:LeftFoot',
  left_toes: 'mixamorig:LeftToeBase',
  right_upper_leg: 'mixamorig:RightUpLeg',
  right_lower_leg: 'mixamorig:RightLeg',
  right_foot: 'mixamorig:RightFoot',
  right_toes: 'mixamorig:RightToeBase',
};

/** Maps HumanoidBoneName → VRM 1.0 humanBones key. */
export const VRM_BONE_MAP: Partial<Record<HumanoidBoneName, string>> = {
  hips: 'hips',
  spine: 'spine',
  spine2: 'chest',
  neck: 'neck',
  head: 'head',
  left_shoulder: 'leftShoulder',
  left_upper_arm: 'leftUpperArm',
  left_forearm: 'leftLowerArm',
  left_hand: 'leftHand',
  right_shoulder: 'rightShoulder',
  right_upper_arm: 'rightUpperArm',
  right_forearm: 'rightLowerArm',
  right_hand: 'rightHand',
  left_upper_leg: 'leftUpperLeg',
  left_lower_leg: 'leftLowerLeg',
  left_foot: 'leftFoot',
  left_toes: 'leftToes',
  right_upper_leg: 'rightUpperLeg',
  right_lower_leg: 'rightLowerLeg',
  right_foot: 'rightFoot',
  right_toes: 'rightToes',
};

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Get all children of a bone in the skeleton hierarchy.
 */
export function getBoneChildren(
  boneName: string,
  skeleton: BoneDefinition[] = HUMANOID_65_SKELETON
): BoneDefinition[] {
  return skeleton.filter((b) => b.parent === boneName);
}

/**
 * Get the chain of bones from root to target bone.
 */
export function getBoneChain(
  boneName: string,
  skeleton: BoneDefinition[] = HUMANOID_65_SKELETON
): BoneDefinition[] {
  const chain: BoneDefinition[] = [];
  let current = skeleton.find((b) => b.name === boneName);
  while (current) {
    chain.unshift(current);
    if (!current.parent) break;
    current = skeleton.find((b) => b.name === current!.parent);
  }
  return chain;
}

/**
 * Validate that a skeleton definition has no orphaned bones.
 */
export function validateSkeleton(skeleton: BoneDefinition[]): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const names = new Set(skeleton.map((b) => b.name));

  for (const bone of skeleton) {
    if (bone.parent !== null && !names.has(bone.parent)) {
      errors.push(`Bone "${bone.name}" references missing parent "${bone.parent}"`);
    }
  }

  // Check for exactly one root
  const roots = skeleton.filter((b) => b.parent === null);
  if (roots.length !== 1) {
    errors.push(`Expected exactly 1 root bone, found ${roots.length}`);
  }

  return { valid: errors.length === 0, errors };
}

