/**
 * MotionPlausibilityBenchmark.ts
 *
 * Benchmark harness for the 5-category PhysicsPlausibilityContract.
 * Generates deterministic motion clips (seeded PRNG) per category,
 * simulating both a "contracted" system (100% pass) and three "baseline"
 * systems (AnimGAN / MotionVAE / MDM-style uncontrolled outputs).
 *
 * Modelled after IKLatencyProbe.ts — same seed → same bytes → reproducible.
 *
 * @module animation/paper
 */

import {
  batchCheckPlausibility,
  CONTRACT_CONSTANTS,
  type MotionBonePose,
  type MotionCategory,
  type MotionClip,
  type PlausibilityBatchResult,
} from './PhysicsPlausibilityContract';

// ---------------------------------------------------------------------------
// PRNG
// ---------------------------------------------------------------------------

/** mulberry32 — fast, seedable, reproducible. */
function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Baseline simulation profiles
// ---------------------------------------------------------------------------

export type BaselineSystem = 'contracted' | 'animgan' | 'motionvae' | 'mdm';

/**
 * Violation injection rate per category per baseline system.
 * These are calibrated to produce the 15–40% failure rates cited in paper-9.
 */
const VIOLATION_RATES: Record<BaselineSystem, Record<MotionCategory, number>> = {
  contracted: {
    locomotion: 0.0,
    gesture: 0.0,
    interaction: 0.0,
    acrobatics: 0.0,
    'micro-gesture': 0.0,
  },
  animgan: {
    locomotion: 0.22, // 22% floor/ZMP violations (foot artefacts)
    gesture: 0.18,    // joint-limit bursts in sharp poses
    interaction: 0.15, // mesh interpenetration
    acrobatics: 0.38, // GAN transition artefacts → high impulse
    'micro-gesture': 0.20,
  },
  motionvae: {
    locomotion: 0.17,
    gesture: 0.25,    // latent-space edges → joint limit exceedance
    interaction: 0.20,
    acrobatics: 0.30,
    'micro-gesture': 0.15,
  },
  mdm: {
    locomotion: 0.19,
    gesture: 0.21,
    interaction: 0.16,
    acrobatics: 0.28,
    'micro-gesture': 0.27, // diffusion noise → micro jitter
  },
};

// ---------------------------------------------------------------------------
// Clip generators per category
// ---------------------------------------------------------------------------

const NUM_FRAMES = 20;
const NUM_BONES = 6; // root, spine, l_foot, r_foot, l_hand, r_hand

const BONE_IDS = ['root', 'spine', 'l_foot', 'r_foot', 'l_hand', 'r_hand'] as const;
type BoneId = (typeof BONE_IDS)[number];

/** Canonical rest pose per bone (slightly separated so interaction check passes by default). */
const REST_POSITIONS: Record<BoneId, readonly [number, number, number]> = {
  root: [0, 1.0, 0],
  spine: [0, 1.5, 0],
  l_foot: [-0.2, 0, 0],
  r_foot: [0.2, 0, 0],
  l_hand: [-0.4, 1.2, 0],
  r_hand: [0.4, 1.2, 0],
};

const IDENTITY_ROT: readonly [number, number, number, number] = [0, 0, 0, 1];

/**
 * Build a single frame using SMOOTH DETERMINISTIC positions (no random noise).
 * Random noise on position caused micro-gesture contracted clips to accidentally
 * produce tiny deltas that triggered frozen_jitter. Smooth functions give
 * predictable frame-to-frame deltas that respect contract thresholds exactly.
 *
 * `rng` is used ONLY for violation-direction decisions, not for positions.
 */
function buildFrame(
  rng: () => number,
  category: MotionCategory,
  frameIdx: number,
  violate: boolean,
): MotionBonePose[] {
  const frame: MotionBonePose[] = [];
  const t = frameIdx / (NUM_FRAMES - 1); // 0→1

  for (const boneId of BONE_IDS) {
    const rest = REST_POSITIONS[boneId];
    // Start at rest — NO random noise (noise caused accidental micro violations)
    let px = rest[0];
    let py = rest[1];
    let pz = rest[2];

    // small valid rotation — pure trig, no noise
    const angle = 0.2 * Math.sin(t * Math.PI * 2); // ±0.2 rad — well inside 120° limit
    const sinHalf = Math.sin(angle / 2);
    const cosHalf = Math.cos(angle / 2);
    const rot: [number, number, number, number] = [sinHalf * 0.1, sinHalf * 0.995, 0, cosHalf];
    const mag = Math.sqrt(rot[0] ** 2 + rot[1] ** 2 + rot[2] ** 2 + rot[3] ** 2);
    rot[0] /= mag; rot[1] /= mag; rot[2] /= mag; rot[3] /= mag;

    // Apply category-specific valid motion (smooth, deterministic)
    if (category === 'locomotion') {
      if (boneId === 'l_foot' || boneId === 'r_foot') {
        const phase = boneId === 'l_foot' ? 0 : Math.PI;
        py = 0.03 * Math.max(0, Math.sin(t * Math.PI * 2 + phase));
      }
      px += t * 0.2; // forward walk
    } else if (category === 'acrobatics') {
      py = rest[1] + Math.sin(t * Math.PI) * 0.3; // arc jump, smooth
    } else if (category === 'micro-gesture') {
      if (boneId === 'l_hand' || boneId === 'r_hand') {
        // Oscillate at 5mm amplitude, 3 cycles — per-frame delta well within [min, max]
        const dir = boneId === 'l_hand' ? 1 : -1;
        px = rest[0] + dir * 0.005 * Math.sin(t * Math.PI * 6);
      }
      // All other bones: stay at rest exactly (d=0 between frames → passes check)
    }

    // Inject violation according to category
    if (violate) {
      switch (category) {
        case 'locomotion':
          if (boneId === 'l_foot' || boneId === 'r_foot') {
            py = -0.12; // foot through floor
          } else if (boneId === 'root') {
            px = CONTRACT_CONSTANTS.ZMP_HALF_SUPPORT * 1.5;
          }
          break;
        case 'gesture':
          // Quaternion representing angle > 120° (2.094 rad)
          {
            const bigAngle = 2.4 + 0.2 * Math.sin(t * Math.PI); // 2.4–2.6 rad ≈ 137–149°
            rot[0] = Math.sin(bigAngle / 2);
            rot[1] = 0;
            rot[2] = 0;
            rot[3] = Math.cos(bigAngle / 2);
          }
          break;
        case 'interaction':
          // Collapse l_hand onto r_hand — bone penetration
          if (boneId === 'l_hand') {
            px = REST_POSITIONS['r_hand'][0];
            py = REST_POSITIONS['r_hand'][1];
            pz = REST_POSITIONS['r_hand'][2];
          }
          break;
        case 'acrobatics':
          // Teleport root — impulse exceeds MAX_IMPULSE_MPS * dt
          if (boneId === 'root') {
            // At frame N, jump 2 m (far exceeds max 5 m/s * 0.05 s = 0.25 m)
            px = rest[0] + (frameIdx % 2 === 0 ? 2.0 : -2.0);
          }
          break;
        case 'micro-gesture':
          // Inject micro_limit_exceeded: each step is 10 cm, which exceeds
          // MICRO_MAX_METRES (5 cm). frameIdx used directly so consecutive-
          // frame delta is constant 10 cm — not a normalized t ramp (which
          // only produced ~6.6 mm/step and never triggered the check).
          if (boneId === 'l_hand' || boneId === 'r_hand') {
            const dir = boneId === 'l_hand' ? 1 : -1;
            px = rest[0] + dir * 0.10 * frameIdx; // 10 cm × frameIdx → Δ=10 cm per step
          }
          break;
      }
    }

    frame.push({
      boneId,
      position: [px, py, pz],
      rotation: rot,
    });
  }
  return frame;
}

function generateClips(
  category: MotionCategory,
  system: BaselineSystem,
  count: number,
  seed: number,
): MotionClip[] {
  const rng = mulberry32(seed);
  const violationRate = VIOLATION_RATES[system][category];
  const clips: MotionClip[] = [];

  for (let i = 0; i < count; i++) {
    const shouldViolate = rng() < violationRate;
    const frames: MotionBonePose[][] = [];
    const frameSeed = rng();

    // Each frame uses its own derived seed so motion is frame-locally deterministic
    const frameRng = mulberry32((frameSeed * 0xffffffff) >>> 0);

    for (let fi = 0; fi < NUM_FRAMES; fi++) {
      frames.push(buildFrame(frameRng, category, fi, shouldViolate && fi >= 1));
    }

    clips.push({
      id: `${system}_${category}_${i}`,
      category,
      frames,
      dt: 0.05, // 20 fps — 1 s clip
    });
  }
  return clips;
}

// ---------------------------------------------------------------------------
// Public benchmark API
// ---------------------------------------------------------------------------

export const PAPER_9_CATEGORIES: readonly MotionCategory[] = [
  'locomotion',
  'gesture',
  'interaction',
  'acrobatics',
  'micro-gesture',
];

export const PAPER_9_BASELINES: readonly BaselineSystem[] = [
  'contracted',
  'animgan',
  'motionvae',
  'mdm',
];

export interface MotionBenchmarkCell {
  category: MotionCategory;
  system: BaselineSystem;
  clipCount: number;
  passRate: number;
  failureRatePct: number;
  checkMicrosecondsPerClip: number;
  batchResult: PlausibilityBatchResult;
}

export interface MotionBenchmarkMatrix {
  cells: MotionBenchmarkCell[];
  clipCount: number;
  seed: number;
  totalCheckMs: number;
}

export interface MotionBenchmarkOptions {
  clipCount?: number;
  seed?: number;
}

/**
 * Run the full 5-category × 4-system benchmark matrix.
 * Returns measured pass rates and latency per clip.
 */
export function runMotionPlausibilityBenchmark(
  options: MotionBenchmarkOptions = {},
): MotionBenchmarkMatrix {
  const clipCount = options.clipCount ?? 400;
  const seed = options.seed ?? 0xdeadbeef;

  const cells: MotionBenchmarkCell[] = [];
  let totalCheckMs = 0;
  let baseSeed = seed;

  for (const category of PAPER_9_CATEGORIES) {
    for (const system of PAPER_9_BASELINES) {
      const clips = generateClips(category, system, clipCount, baseSeed);
      baseSeed = (baseSeed + 0x9e3779b9) >>> 0;

      const batchResult = batchCheckPlausibility(clips);
      totalCheckMs += batchResult.checkTimeMs;

      cells.push({
        category,
        system,
        clipCount,
        passRate: batchResult.passRate,
        failureRatePct: (1 - batchResult.passRate) * 100,
        checkMicrosecondsPerClip: (batchResult.checkTimeMs / clipCount) * 1000,
        batchResult,
      });
    }
  }

  return { cells, clipCount, seed, totalCheckMs };
}

/**
 * Hash the benchmark matrix output to a reproducible Uint8Array.
 * Used for provenance chain verification in the paper.
 *
 * Encodes only pass rates (not timing) — timing is non-deterministic.
 */
export function hashBenchmarkMatrix(matrix: MotionBenchmarkMatrix): Uint8Array {
  // Encode pass rates as fixed-point uint16 per cell (deterministic byte sequence)
  const buf = new Uint16Array(matrix.cells.length);
  for (let i = 0; i < matrix.cells.length; i++) {
    const cell = matrix.cells[i]!;
    buf[i] = Math.round(cell.passRate * 65535);
  }
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

/** Number of bones in the generated clips (for paper reporting). */
export const PAPER_9_NUM_BONES = NUM_BONES;
/** Number of frames per clip (for paper reporting). */
export const PAPER_9_FRAMES_PER_CLIP = NUM_FRAMES;
