/**
 * poseLibrary.ts — Viral Pose Library for Trending Character Poses
 *
 * MEME-004: Viral pose trait
 * Priority: Medium | Estimate: 6 hours
 *
 * Features:
 * - Library of trending poses (dab, floss, griddy, etc.)
 * - Pose definitions with bone rotations
 * - Pose metadata (name, popularity, difficulty)
 * - Search and filter poses by category
 * - Custom pose creation
 */

import type { _Quaternion, _Vector3 } from 'three';

// ─── Types ───────────────────────────────────────────────────────────────────

export type PoseCategory = 'classic' | 'viral' | 'trending' | 'dance' | 'emote' | 'flex';

export interface BonePose {
  boneName: string;
  rotation: {
    x: number;
    y: number;
    z: number;
    w: number;
  };
  position?: {
    x: number;
    y: number;
    z: number;
  };
}

export interface ViralPose {
  id: string;
  name: string;
  emoji: string;
  description: string;
  category: PoseCategory;
  popularity: number; // 1-5
  difficulty: 'easy' | 'medium' | 'hard';
  duration: number; // milliseconds for hold time
  bones: BonePose[];
  tags: string[];
  yearTrending?: number;
}

export interface PoseTransition {
  fromPose: string;
  toPose: string;
  duration: number; // milliseconds
  easing: 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'bounce';
}

// ─── Pose Library ────────────────────────────────────────────────────────────

export const VIRAL_POSES: ViralPose[] = [
  // Classic Poses
  {
    id: 'dab',
    name: 'Dab',
    emoji: '😎',
    description: 'The classic 2016 viral pose',
    category: 'classic',
    popularity: 5,
    difficulty: 'easy',
    duration: 1500,
    yearTrending: 2016,
    tags: ['dance', 'classic', '2016', 'meme'],
    bones: [
      // Hide face in left arm
      { boneName: 'LeftArm', rotation: { x: 0, y: -0.9, z: 0, w: 0.436 } },
      { boneName: 'LeftForeArm', rotation: { x: 0, y: 0, z: -0.7, w: 0.714 } },
      // Point right arm
      { boneName: 'RightArm', rotation: { x: 0, y: 0.7, z: 0.7, w: 0.1 } },
      { boneName: 'RightForeArm', rotation: { x: 0, y: 0, z: 0, w: 1 } },
      // Slight lean
      { boneName: 'Spine', rotation: { x: 0.1, y: -0.2, z: 0, w: 0.977 } },
    ],
  },
  {
    id: 'floss',
    name: 'Floss',
    emoji: '🦷',
    description: 'The iconic Fortnite dance move',
    category: 'viral',
    popularity: 5,
    difficulty: 'medium',
    duration: 2000,
    yearTrending: 2018,
    tags: ['dance', 'fortnite', 'viral', 'trending'],
    bones: [
      // Swing arms (this is frame 1 of animation)
      { boneName: 'LeftArm', rotation: { x: 0, y: -0.707, z: 0, w: 0.707 } },
      { boneName: 'RightArm', rotation: { x: 0, y: 0.707, z: 0, w: 0.707 } },
      { boneName: 'Hips', rotation: { x: 0, y: 0.259, z: 0, w: 0.966 } },
    ],
  },
  {
    id: 'griddy',
    name: 'Griddy',
    emoji: '🏈',
    description: 'NFL celebration dance, TikTok viral 2022',
    category: 'trending',
    popularity: 5,
    difficulty: 'hard',
    duration: 2500,
    yearTrending: 2022,
    tags: ['dance', 'nfl', 'sports', 'viral', 'tiktok'],
    bones: [
      // High knees + arm swing
      { boneName: 'LeftLeg', rotation: { x: 1.2, y: 0, z: 0, w: 0.362 } },
      { boneName: 'RightLeg', rotation: { x: 0.2, y: 0, z: 0, w: 0.98 } },
      { boneName: 'LeftArm', rotation: { x: -0.5, y: 0.3, z: -0.3, w: 0.766 } },
      { boneName: 'RightArm', rotation: { x: -0.5, y: -0.3, z: 0.3, w: 0.766 } },
      { boneName: 'Spine', rotation: { x: -0.1, y: 0, z: 0, w: 0.995 } },
    ],
  },
  {
    id: 't-pose',
    name: 'T-Pose',
    emoji: '🤖',
    description: 'Assert dominance with the T-Pose',
    category: 'classic',
    popularity: 4,
    difficulty: 'easy',
    duration: 3000,
    yearTrending: 2017,
    tags: ['meme', 'dominance', 'gaming', 'glitch'],
    bones: [
      // Arms straight out
      { boneName: 'LeftArm', rotation: { x: 0, y: 0, z: -0.707, w: 0.707 } },
      { boneName: 'RightArm', rotation: { x: 0, y: 0, z: 0.707, w: 0.707 } },
      { boneName: 'LeftForeArm', rotation: { x: 0, y: 0, z: 0, w: 1 } },
      { boneName: 'RightForeArm', rotation: { x: 0, y: 0, z: 0, w: 1 } },
      // Stand straight
      { boneName: 'Spine', rotation: { x: 0, y: 0, z: 0, w: 1 } },
      { boneName: 'Head', rotation: { x: 0, y: 0, z: 0, w: 1 } },
    ],
  },
  {
    id: 'thinking',
    name: 'Thinking',
    emoji: '🤔',
    description: 'The thinking emoji pose',
    category: 'emote',
    popularity: 4,
    difficulty: 'easy',
    duration: 2000,
    yearTrending: 2015,
    tags: ['emote', 'thinking', 'meme', 'emoji'],
    bones: [
      // Hand to chin
      { boneName: 'RightArm', rotation: { x: 0.5, y: 0.3, z: 0.3, w: 0.766 } },
      { boneName: 'RightForeArm', rotation: { x: 0, y: 0, z: -1.2, w: 0.362 } },
      // Slight head tilt
      { boneName: 'Head', rotation: { x: 0.1, y: 0.1, z: 0, w: 0.99 } },
    ],
  },
  {
    id: 'shrug',
    name: 'Shrug',
    emoji: '🤷',
    description: 'The universal "I dunno" gesture',
    category: 'emote',
    popularity: 5,
    difficulty: 'easy',
    duration: 1500,
    tags: ['emote', 'shrug', 'idk', 'gesture'],
    bones: [
      // Raise arms + palms up
      { boneName: 'LeftArm', rotation: { x: 0, y: -0.3, z: -0.5, w: 0.809 } },
      { boneName: 'RightArm', rotation: { x: 0, y: 0.3, z: 0.5, w: 0.809 } },
      { boneName: 'LeftForeArm', rotation: { x: 0, y: 0.5, z: -0.3, w: 0.809 } },
      { boneName: 'RightForeArm', rotation: { x: 0, y: -0.5, z: 0.3, w: 0.809 } },
      // Slight shoulder raise (simulated with spine tilt)
      { boneName: 'Spine', rotation: { x: -0.05, y: 0, z: 0, w: 0.999 } },
    ],
  },
  {
    id: 'flex',
    name: 'Flex',
    emoji: '💪',
    description: 'Show off those gains',
    category: 'flex',
    popularity: 5,
    difficulty: 'easy',
    duration: 2000,
    tags: ['flex', 'strong', 'gains', 'gym'],
    bones: [
      // Both arms flexed
      { boneName: 'LeftArm', rotation: { x: 0, y: -0.5, z: -0.7, w: 0.5 } },
      { boneName: 'RightArm', rotation: { x: 0, y: 0.5, z: 0.7, w: 0.5 } },
      { boneName: 'LeftForeArm', rotation: { x: 0, y: 0, z: -1.4, w: 0.17 } },
      { boneName: 'RightForeArm', rotation: { x: 0, y: 0, z: 1.4, w: 0.17 } },
      // Puff chest
      { boneName: 'Spine', rotation: { x: -0.15, y: 0, z: 0, w: 0.989 } },
    ],
  },
  {
    id: 'heart-hands',
    name: 'Heart Hands',
    emoji: '💖',
    description: 'Make a heart with your hands',
    category: 'emote',
    popularity: 5,
    difficulty: 'medium',
    duration: 2000,
    yearTrending: 2020,
    tags: ['love', 'heart', 'kpop', 'cute'],
    bones: [
      // Arms raised, hands together forming heart
      { boneName: 'LeftArm', rotation: { x: -0.7, y: -0.3, z: -0.4, w: 0.516 } },
      { boneName: 'RightArm', rotation: { x: -0.7, y: 0.3, z: 0.4, w: 0.516 } },
      { boneName: 'LeftForeArm', rotation: { x: 0, y: 0.3, z: -0.5, w: 0.809 } },
      { boneName: 'RightForeArm', rotation: { x: 0, y: -0.3, z: 0.5, w: 0.809 } },
      // Slight lean back
      { boneName: 'Spine', rotation: { x: -0.1, y: 0, z: 0, w: 0.995 } },
    ],
  },
  {
    id: 'peace-sign',
    name: 'Peace Sign',
    emoji: '✌️',
    description: 'Classic peace/victory sign',
    category: 'classic',
    popularity: 4,
    difficulty: 'easy',
    duration: 1500,
    tags: ['peace', 'victory', 'classic', 'photo'],
    bones: [
      // Right hand up with peace sign
      { boneName: 'RightArm', rotation: { x: -0.5, y: 0.5, z: 0.7, w: 0.173 } },
      { boneName: 'RightForeArm', rotation: { x: 0, y: 0, z: 0.5, w: 0.866 } },
      // Slight head tilt
      { boneName: 'Head', rotation: { x: 0, y: 0.1, z: 0.1, w: 0.99 } },
    ],
  },
  {
    id: 'nae-nae',
    name: 'Nae Nae',
    emoji: '🕺',
    description: 'Watch me whip, watch me nae nae',
    category: 'dance',
    popularity: 4,
    difficulty: 'medium',
    duration: 2000,
    yearTrending: 2015,
    tags: ['dance', 'viral', '2015', 'watch-me'],
    bones: [
      // Lean and swing arm
      { boneName: 'RightArm', rotation: { x: 0, y: 0.866, z: 0.5, w: 0 } },
      { boneName: 'LeftArm', rotation: { x: 0, y: -0.3, z: -0.2, w: 0.93 } },
      { boneName: 'Spine', rotation: { x: 0, y: -0.3, z: -0.2, w: 0.93 } },
      { boneName: 'Hips', rotation: { x: 0, y: -0.259, z: 0, w: 0.966 } },
    ],
  },
];

// ─── Pose Library Functions ──────────────────────────────────────────────────

/**
 * Get all poses
 */
export function getAllPoses(): ViralPose[] {
  return VIRAL_POSES;
}

/**
 * Get poses sorted by popularity
 */
export function getPopularPoses(): ViralPose[] {
  return [...VIRAL_POSES].sort((a, b) => b.popularity - a.popularity);
}

/**
 * Get poses by category
 */
export function getPosesByCategory(category: PoseCategory): ViralPose[] {
  return VIRAL_POSES.filter((pose) => pose.category === category);
}

/**
 * Get trending poses (recent years)
 */
export function getTrendingPoses(): ViralPose[] {
  const currentYear = new Date().getFullYear();
  return VIRAL_POSES.filter(
    (pose) => pose.yearTrending && currentYear - pose.yearTrending <= 3
  ).sort((a, b) => (b.yearTrending || 0) - (a.yearTrending || 0));
}

/**
 * Search poses by name or tags
 */
export function searchPoses(query: string): ViralPose[] {
  const lowerQuery = query.toLowerCase();
  return VIRAL_POSES.filter(
    (pose) =>
      pose.name.toLowerCase().includes(lowerQuery) ||
      pose.description.toLowerCase().includes(lowerQuery) ||
      pose.tags.some((tag) => tag.toLowerCase().includes(lowerQuery))
  );
}

/**
 * Get pose by ID
 */
export function getPoseById(id: string): ViralPose | undefined {
  return VIRAL_POSES.find((pose) => pose.id === id);
}

/**
 * Get random pose
 */
export function getRandomPose(): ViralPose {
  return VIRAL_POSES[Math.floor(Math.random() * VIRAL_POSES.length)];
}

/**
 * Get poses by difficulty
 */
export function getPosesByDifficulty(difficulty: 'easy' | 'medium' | 'hard'): ViralPose[] {
  return VIRAL_POSES.filter((pose) => pose.difficulty === difficulty);
}

/**
 * Create custom pose
 */
export function createCustomPose(
  name: string,
  bones: BonePose[],
  options?: Partial<Omit<ViralPose, 'id' | 'name' | 'bones'>>
): ViralPose {
  return {
    id: `custom-${Date.now()}`,
    name,
    emoji: options?.emoji || '🎭',
    description: options?.description || `Custom pose: ${name}`,
    category: options?.category || 'emote',
    popularity: options?.popularity || 3,
    difficulty: options?.difficulty || 'medium',
    duration: options?.duration || 2000,
    bones,
    tags: options?.tags || ['custom'],
  };
}

/**
 * Interpolate between two poses (for smooth transitions)
 */
export function interpolatePoses(
  fromPose: ViralPose,
  toPose: ViralPose,
  progress: number // 0-1
): BonePose[] {
  const result: BonePose[] = [];

  // Get all unique bone names from both poses
  const boneNames = new Set([
    ...fromPose.bones.map((b) => b.boneName),
    ...toPose.bones.map((b) => b.boneName),
  ]);

  boneNames.forEach((boneName) => {
    const fromBone = fromPose.bones.find((b) => b.boneName === boneName);
    const toBone = toPose.bones.find((b) => b.boneName === boneName);

    if (!fromBone && !toBone) return;

    // Use identity rotation if bone not found in either pose
    const fromRot = fromBone?.rotation || { x: 0, y: 0, z: 0, w: 1 };
    const toRot = toBone?.rotation || { x: 0, y: 0, z: 0, w: 1 };

    // Spherical linear interpolation (SLERP) for quaternions
    const interpolated = slerpQuaternion(fromRot, toRot, progress);

    result.push({
      boneName,
      rotation: interpolated,
    });
  });

  return result;
}

/**
 * Spherical linear interpolation for quaternions
 */
function slerpQuaternion(
  q1: { x: number; y: number; z: number; w: number },
  q2: { x: number; y: number; z: number; w: number },
  t: number
): { x: number; y: number; z: number; w: number } {
  // Calculate dot product
  let dot = q1.x * q2.x + q1.y * q2.y + q1.z * q2.z + q1.w * q2.w;

  // If negative, negate one quaternion to take shorter path
  let q2x = q2.x;
  let q2y = q2.y;
  let q2z = q2.z;
  let q2w = q2.w;

  if (dot < 0) {
    q2x = -q2x;
    q2y = -q2y;
    q2z = -q2z;
    q2w = -q2w;
    dot = -dot;
  }

  // Clamp dot product
  dot = Math.min(Math.max(dot, -1), 1);

  // If quaternions are very close, use linear interpolation
  if (dot > 0.9995) {
    return {
      x: q1.x + t * (q2x - q1.x),
      y: q1.y + t * (q2y - q1.y),
      z: q1.z + t * (q2z - q1.z),
      w: q1.w + t * (q2w - q1.w),
    };
  }

  // Calculate interpolation parameters
  const theta0 = Math.acos(dot);
  const theta = theta0 * t;
  const sinTheta = Math.sin(theta);
  const sinTheta0 = Math.sin(theta0);

  const s0 = Math.cos(theta) - (dot * sinTheta) / sinTheta0;
  const s1 = sinTheta / sinTheta0;

  return {
    x: s0 * q1.x + s1 * q2x,
    y: s0 * q1.y + s1 * q2y,
    z: s0 * q1.z + s1 * q2z,
    w: s0 * q1.w + s1 * q2w,
  };
}

// ─── Easing Functions ────────────────────────────────────────────────────────

export const EASING_FUNCTIONS = {
  linear: (t: number) => t,
  easeIn: (t: number) => t * t,
  easeOut: (t: number) => t * (2 - t),
  easeInOut: (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  bounce: (t: number) => {
    if (t < 1 / 2.75) {
      return 7.5625 * t * t;
    } else if (t < 2 / 2.75) {
      return 7.5625 * (t -= 1.5 / 2.75) * t + 0.75;
    } else if (t < 2.5 / 2.75) {
      return 7.5625 * (t -= 2.25 / 2.75) * t + 0.9375;
    } else {
      return 7.5625 * (t -= 2.625 / 2.75) * t + 0.984375;
    }
  },
};

/**
 * Apply easing to transition progress
 */
export function applyEasing(progress: number, easing: keyof typeof EASING_FUNCTIONS): number {
  return EASING_FUNCTIONS[easing](progress);
}
