/**
 * PhysicsPlausibilityContract.ts
 *
 * Five-category physics plausibility checker for AI-generated motion clips.
 * Used as the core contract in Paper-9 "Verifiable Motion" benchmark suite.
 *
 * Categories:
 *   1. locomotion   — foot-sliding / ZMP (zero moment point) checks
 *   2. gesture      — joint-limit burst detection
 *   3. interaction  — bone penetration / proximity checks
 *   4. acrobatics   — impulse-limit enforcement
 *   5. micro-gesture — jitter threshold / sub-limit noise checks
 *
 * @module animation/paper
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MotionCategory =
  | 'locomotion'
  | 'gesture'
  | 'interaction'
  | 'acrobatics'
  | 'micro-gesture';

/** A single bone pose in one frame, using plain arrays for determinism. */
export interface MotionBonePose {
  boneId: string;
  /** World-space position [x, y, z] — units: metres */
  position: readonly [number, number, number];
  /** Unit quaternion [x, y, z, w] */
  rotation: readonly [number, number, number, number];
}

/** One motion clip to validate. */
export interface MotionClip {
  id: string;
  category: MotionCategory;
  /** Ordered list of frames; each frame is a list of bone poses. */
  frames: MotionBonePose[][];
  /** Time-step between frames (seconds). */
  dt: number;
}

/** Result returned by `checkPlausibility`. */
export interface PlausibilityResult {
  pass: boolean;
  category: MotionCategory;
  clipId: string;
  violatedConstraint?: string;
  frameIndex?: number;
  boneId?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FOOT_FLOOR_THRESHOLD = -0.05; // metres below ground = floor violation
const ZMP_HALF_SUPPORT = 0.35;       // metres from root centre-line
const JOINT_ANGLE_LIMIT_RAD = 2.094; // ~120° (radians) — max single-axis arc
const COLLISION_RADIUS = 0.1;         // metres — min bone-to-bone distance
const MAX_IMPULSE_MPS = 5.0;          // m/s — max velocity change per frame
const MICRO_MAX_METRES = 0.05;        // metres — upper bound for micro-gesture
const MICRO_MIN_METRES = 1e-4;        // metres — below this is frozen jitter

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Quaternion [x,y,z,w] → rotation angle in radians (≥0). */
function quatAngle(r: readonly [number, number, number, number]): number {
  // clamp w to [-1,1] for numerical safety
  const w = Math.max(-1, Math.min(1, r[3]));
  return 2 * Math.acos(Math.abs(w));
}

/** Squared Euclidean distance between two 3-vectors. */
function dist2(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return dx * dx + dy * dy + dz * dz;
}

/** Euclidean distance. */
function dist(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
): number {
  return Math.sqrt(dist2(a, b));
}

// ---------------------------------------------------------------------------
// Per-category checkers
// ---------------------------------------------------------------------------

function checkLocomotion(clip: MotionClip): PlausibilityResult {
  for (let fi = 0; fi < clip.frames.length; fi++) {
    const frame = clip.frames[fi]!;
    for (const bone of frame) {
      // Foot bones: any bone whose id contains 'foot', 'toe', or 'ankle'
      if (/foot|toe|ankle/i.test(bone.boneId)) {
        if (bone.position[1] < FOOT_FLOOR_THRESHOLD) {
          return {
            pass: false,
            category: 'locomotion',
            clipId: clip.id,
            violatedConstraint: 'foot_below_floor',
            frameIndex: fi,
            boneId: bone.boneId,
          };
        }
      }
      // ZMP: root bone must stay within support polygon
      if (/root|pelvis|hips/i.test(bone.boneId)) {
        if (Math.abs(bone.position[0]) > ZMP_HALF_SUPPORT) {
          return {
            pass: false,
            category: 'locomotion',
            clipId: clip.id,
            violatedConstraint: 'zmp_outside_support',
            frameIndex: fi,
            boneId: bone.boneId,
          };
        }
      }
    }
  }
  return { pass: true, category: 'locomotion', clipId: clip.id };
}

function checkGesture(clip: MotionClip): PlausibilityResult {
  for (let fi = 0; fi < clip.frames.length; fi++) {
    const frame = clip.frames[fi]!;
    for (const bone of frame) {
      const angle = quatAngle(bone.rotation);
      if (angle > JOINT_ANGLE_LIMIT_RAD) {
        return {
          pass: false,
          category: 'gesture',
          clipId: clip.id,
          violatedConstraint: 'joint_limit_burst',
          frameIndex: fi,
          boneId: bone.boneId,
        };
      }
    }
  }
  return { pass: true, category: 'gesture', clipId: clip.id };
}

function checkInteraction(clip: MotionClip): PlausibilityResult {
  const r2 = COLLISION_RADIUS * COLLISION_RADIUS;
  for (let fi = 0; fi < clip.frames.length; fi++) {
    const frame = clip.frames[fi]!;
    for (let i = 0; i < frame.length; i++) {
      for (let j = i + 1; j < frame.length; j++) {
        if (dist2(frame[i]!.position, frame[j]!.position) < r2) {
          return {
            pass: false,
            category: 'interaction',
            clipId: clip.id,
            violatedConstraint: 'bone_penetration',
            frameIndex: fi,
            boneId: frame[i]!.boneId,
          };
        }
      }
    }
  }
  return { pass: true, category: 'interaction', clipId: clip.id };
}

function checkAcrobatics(clip: MotionClip): PlausibilityResult {
  const maxDist = MAX_IMPULSE_MPS * clip.dt;
  for (let fi = 1; fi < clip.frames.length; fi++) {
    const prev = clip.frames[fi - 1]!;
    const curr = clip.frames[fi]!;
    for (let bi = 0; bi < curr.length; bi++) {
      const d = dist(curr[bi]!.position, prev[bi]!.position);
      if (d > maxDist) {
        return {
          pass: false,
          category: 'acrobatics',
          clipId: clip.id,
          violatedConstraint: 'impulse_exceeded',
          frameIndex: fi,
          boneId: curr[bi]!.boneId,
        };
      }
    }
  }
  return { pass: true, category: 'acrobatics', clipId: clip.id };
}

function checkMicroGesture(clip: MotionClip): PlausibilityResult {
  for (let fi = 1; fi < clip.frames.length; fi++) {
    const prev = clip.frames[fi - 1]!;
    const curr = clip.frames[fi]!;
    for (let bi = 0; bi < curr.length; bi++) {
      const d = dist(curr[bi]!.position, prev[bi]!.position);
      // Violation: sub-threshold noise (frozen jitter = too small to be intentional)
      if (d > 0 && d < MICRO_MIN_METRES) {
        return {
          pass: false,
          category: 'micro-gesture',
          clipId: clip.id,
          violatedConstraint: 'frozen_jitter',
          frameIndex: fi,
          boneId: curr[bi]!.boneId,
        };
      }
      // Violation: movement exceeds micro-gesture budget
      if (d > MICRO_MAX_METRES) {
        return {
          pass: false,
          category: 'micro-gesture',
          clipId: clip.id,
          violatedConstraint: 'micro_limit_exceeded',
          frameIndex: fi,
          boneId: curr[bi]!.boneId,
        };
      }
    }
  }
  return { pass: true, category: 'micro-gesture', clipId: clip.id };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Check a motion clip against the physics plausibility contract. */
export function checkPlausibility(clip: MotionClip): PlausibilityResult {
  switch (clip.category) {
    case 'locomotion':
      return checkLocomotion(clip);
    case 'gesture':
      return checkGesture(clip);
    case 'interaction':
      return checkInteraction(clip);
    case 'acrobatics':
      return checkAcrobatics(clip);
    case 'micro-gesture':
      return checkMicroGesture(clip);
  }
}

/**
 * Batch-check an array of clips and return aggregate statistics.
 * Returns pass count, fail count, and per-violation breakdowns.
 */
export interface PlausibilityBatchResult {
  total: number;
  passed: number;
  failed: number;
  passRate: number;
  violations: Record<string, number>;
  checkTimeMs: number;
}

export function batchCheckPlausibility(clips: MotionClip[]): PlausibilityBatchResult {
  const violations: Record<string, number> = {};
  let passed = 0;
  const t0 = performance.now();
  for (const clip of clips) {
    const r = checkPlausibility(clip);
    if (r.pass) {
      passed++;
    } else {
      const key = r.violatedConstraint ?? 'unknown';
      violations[key] = (violations[key] ?? 0) + 1;
    }
  }
  const checkTimeMs = performance.now() - t0;
  return {
    total: clips.length,
    passed,
    failed: clips.length - passed,
    passRate: passed / clips.length,
    violations,
    checkTimeMs,
  };
}

/** Export constants for use in benchmark harness. */
export const CONTRACT_CONSTANTS = {
  FOOT_FLOOR_THRESHOLD,
  ZMP_HALF_SUPPORT,
  JOINT_ANGLE_LIMIT_RAD,
  COLLISION_RADIUS,
  MAX_IMPULSE_MPS,
  MICRO_MAX_METRES,
  MICRO_MIN_METRES,
} as const;
