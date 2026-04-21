/**
 * poseLibrary.ts — Character Pose Library
 *
 * Pre-built and user-saved poses for character animation.
 */

// Re-export viral pose library and utilities
export {
  type BonePose,
  type ViralPose,
  type PoseTransition,
  VIRAL_POSES,
  getAllPoses,
  getPopularPoses,
  getPosesByCategory,
  getTrendingPoses,
  getPoseById,
  getRandomPose,
  getPosesByDifficulty,
  interpolatePoses,
  searchPoses,
  EASING_FUNCTIONS,
  applyEasing,
} from './character/poseLibrary';

export type Vec3 = [number, number, number];

export interface PoseData {
  id: string;
  name: string;
  category: PoseCategory;
  thumbnail?: string;
  boneRotations: Record<string, Vec3>; // Bone name → Euler rotation (degrees)
  tags: string[];
  isBuiltIn: boolean;
  createdAt: number;
}

export type PoseCategory =
  | 'standing'
  | 'sitting'
  | 'action'
  | 'emote'
  | 'combat'
  | 'relaxed'
  | 'custom';

// ═══════════════════════════════════════════════════════════════════
// Built-in Poses
// ═══════════════════════════════════════════════════════════════════

export const BUILT_IN_POSES: PoseData[] = [
  {
    id: 'pose-t',
    name: 'T-Pose',
    category: 'standing',
    tags: ['reference', 'default'],
    isBuiltIn: true,
    createdAt: 0,
    boneRotations: {
      hips: [0, 0, 0],
      spine: [0, 0, 0],
      'upper_arm.L': [0, 0, -90],
      'upper_arm.R': [0, 0, 90],
    },
  },
  {
    id: 'pose-a',
    name: 'A-Pose',
    category: 'standing',
    tags: ['reference'],
    isBuiltIn: true,
    createdAt: 0,
    boneRotations: {
      hips: [0, 0, 0],
      'upper_arm.L': [0, 0, -45],
      'upper_arm.R': [0, 0, 45],
    },
  },
  {
    id: 'pose-idle',
    name: 'Casual Stand',
    category: 'standing',
    tags: ['idle', 'natural'],
    isBuiltIn: true,
    createdAt: 0,
    boneRotations: {
      hips: [0, 5, 0],
      spine: [-3, 0, 0],
      'upper_arm.L': [0, 0, -20],
      'upper_arm.R': [0, 0, 15],
      'forearm.L': [-15, 0, 0],
    },
  },
  {
    id: 'pose-sit',
    name: 'Seated',
    category: 'sitting',
    tags: ['chair', 'rest'],
    isBuiltIn: true,
    createdAt: 0,
    boneRotations: {
      hips: [-90, 0, 0],
      'upper_leg.L': [-90, 0, 0],
      'upper_leg.R': [-90, 0, 0],
      'lower_leg.L': [90, 0, 0],
      'lower_leg.R': [90, 0, 0],
    },
  },
  {
    id: 'pose-punch',
    name: 'Punch',
    category: 'combat',
    tags: ['attack', 'fight'],
    isBuiltIn: true,
    createdAt: 0,
    boneRotations: {
      spine: [-10, 30, 0],
      'upper_arm.R': [-80, 0, 20],
      'forearm.R': [-60, 0, 0],
      'upper_arm.L': [-30, 0, -40],
    },
  },
  {
    id: 'pose-wave',
    name: 'Wave',
    category: 'emote',
    tags: ['greeting', 'friendly'],
    isBuiltIn: true,
    createdAt: 0,
    boneRotations: {
      'upper_arm.R': [0, 0, 160],
      'forearm.R': [-30, 0, 0],
      head: [0, -10, 5],
    },
  },
];

/**
 * Get all poses (built-in + custom).
 */
export function allPoses(customPoses: PoseData[] = []): PoseData[] {
  return [...BUILT_IN_POSES, ...customPoses];
}

/**
 * Get poses by category.
 */
export function posesByCategory(category: PoseCategory, customPoses: PoseData[] = []): PoseData[] {
  return allPoses(customPoses).filter((p) => p.category === category);
}

/**
 * Search built-in poses by name or tags.
 */
export function searchBuiltInPoses(query: string, customPoses: PoseData[] = []): PoseData[] {
  const q = query.toLowerCase();
  return allPoses(customPoses).filter(
    (p) => p.name.toLowerCase().includes(q) || p.tags.some((t) => t.includes(q))
  );
}

/**
 * Blend between two poses (linear interpolation of bone rotations).
 */
export function blendPoses(a: PoseData, b: PoseData, weight: number): Record<string, Vec3> {
  const w = Math.max(0, Math.min(1, weight));
  const result: Record<string, Vec3> = {};
  const allBones = new Set([...Object.keys(a.boneRotations), ...Object.keys(b.boneRotations)]);
  for (const bone of allBones) {
    const va = a.boneRotations[bone] ?? [0, 0, 0];
    const vb = b.boneRotations[bone] ?? [0, 0, 0];
    result[bone] = [
      va[0] * (1 - w) + vb[0] * w,
      va[1] * (1 - w) + vb[1] * w,
      va[2] * (1 - w) + vb[2] * w,
    ];
  }
  return result;
}

/**
 * Create a custom pose from current bone rotations.
 */
export function createCustomPose(
  name: string,
  rotations: Record<string, Vec3>,
  tags: string[] = []
): PoseData {
  return {
    id: `pose-custom-${Date.now().toString(36)}`,
    name,
    category: 'custom',
    boneRotations: rotations,
    tags,
    isBuiltIn: false,
    createdAt: Date.now(),
  };
}
