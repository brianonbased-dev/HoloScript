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

export interface Vec3 { x: number; y: number; z: number }

export interface PoseData {
  id: string;
  name: string;
  category: PoseCategory;
  thumbnail?: string;
  boneRotations: Record<string, Vec3>;  // Bone name → Euler rotation (degrees)
  tags: string[];
  isBuiltIn: boolean;
  createdAt: number;
}

export type PoseCategory = 'standing' | 'sitting' | 'action' | 'emote' | 'combat' | 'relaxed' | 'custom';

// ═══════════════════════════════════════════════════════════════════
// Built-in Poses
// ═══════════════════════════════════════════════════════════════════

export const BUILT_IN_POSES: PoseData[] = [
  {
    id: 'pose-t', name: 'T-Pose', category: 'standing', tags: ['reference', 'default'],
    isBuiltIn: true, createdAt: 0,
    boneRotations: { hips: { x: 0, y: 0, z: 0 }, spine: { x: 0, y: 0, z: 0 }, 'upper_arm.L': { x: 0, y: 0, z: -90 }, 'upper_arm.R': { x: 0, y: 0, z: 90 } },
  },
  {
    id: 'pose-a', name: 'A-Pose', category: 'standing', tags: ['reference'],
    isBuiltIn: true, createdAt: 0,
    boneRotations: { hips: { x: 0, y: 0, z: 0 }, 'upper_arm.L': { x: 0, y: 0, z: -45 }, 'upper_arm.R': { x: 0, y: 0, z: 45 } },
  },
  {
    id: 'pose-idle', name: 'Casual Stand', category: 'standing', tags: ['idle', 'natural'],
    isBuiltIn: true, createdAt: 0,
    boneRotations: { hips: { x: 0, y: 5, z: 0 }, spine: { x: -3, y: 0, z: 0 }, 'upper_arm.L': { x: 0, y: 0, z: -20 }, 'upper_arm.R': { x: 0, y: 0, z: 15 }, 'forearm.L': { x: -15, y: 0, z: 0 } },
  },
  {
    id: 'pose-sit', name: 'Seated', category: 'sitting', tags: ['chair', 'rest'],
    isBuiltIn: true, createdAt: 0,
    boneRotations: { hips: { x: -90, y: 0, z: 0 }, 'upper_leg.L': { x: -90, y: 0, z: 0 }, 'upper_leg.R': { x: -90, y: 0, z: 0 }, 'lower_leg.L': { x: 90, y: 0, z: 0 }, 'lower_leg.R': { x: 90, y: 0, z: 0 } },
  },
  {
    id: 'pose-punch', name: 'Punch', category: 'combat', tags: ['attack', 'fight'],
    isBuiltIn: true, createdAt: 0,
    boneRotations: { spine: { x: -10, y: 30, z: 0 }, 'upper_arm.R': { x: -80, y: 0, z: 20 }, 'forearm.R': { x: -60, y: 0, z: 0 }, 'upper_arm.L': { x: -30, y: 0, z: -40 } },
  },
  {
    id: 'pose-wave', name: 'Wave', category: 'emote', tags: ['greeting', 'friendly'],
    isBuiltIn: true, createdAt: 0,
    boneRotations: { 'upper_arm.R': { x: 0, y: 0, z: 160 }, 'forearm.R': { x: -30, y: 0, z: 0 }, head: { x: 0, y: -10, z: 5 } },
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
  return allPoses(customPoses).filter(p => p.category === category);
}

/**
 * Search built-in poses by name or tags.
 */
export function searchBuiltInPoses(query: string, customPoses: PoseData[] = []): PoseData[] {
  const q = query.toLowerCase();
  return allPoses(customPoses).filter(p =>
    p.name.toLowerCase().includes(q) || p.tags.some(t => t.includes(q))
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
    const va = a.boneRotations[bone] ?? { x: 0, y: 0, z: 0 };
    const vb = b.boneRotations[bone] ?? { x: 0, y: 0, z: 0 };
    result[bone] = {
      x: va.x * (1 - w) + vb.x * w,
      y: va.y * (1 - w) + vb.y * w,
      z: va.z * (1 - w) + vb.z * w,
    };
  }
  return result;
}

/**
 * Create a custom pose from current bone rotations.
 */
export function createCustomPose(name: string, rotations: Record<string, Vec3>, tags: string[] = []): PoseData {
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
