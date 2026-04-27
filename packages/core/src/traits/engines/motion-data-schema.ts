/**
 * MotionMatching training/inference data schema.
 *
 * Defines the on-disk + in-memory shape for motion data consumed by the
 * future MotionMatchingEngine reimplementation (BUILD-1, per /founder
 * ruling 2026-04-26 — primary-literature reimplement: Holden 2017
 * Phase-Functioned NN, Starke 2019 NSM, 2020 Local Motion Phases,
 * 2022 DeepPhase).
 *
 * Schema is versioned so future captures remain identifiable as the format
 * evolves. v1 covers the minimum needed for Phase-Functioned + NSM-style
 * inference: per-frame joint transforms, root velocity, contact features,
 * gait label, phase value.
 *
 * No backend dependency (pure types + validators). Backends — ONNX, pure-JS
 * forward pass, WebGPU compute — slot in via the MotionMatchingEngine
 * interface in motion-matching.ts.
 */

import type { Vec3, ContactFeatures, Gait, SkeletonPose } from './motion-matching';

export const MOTION_DATA_SCHEMA_VERSION = 1 as const;

/**
 * One frame of training data — paired (input, output) for supervised learning.
 *
 * Captured at FPS specified in the parent TrainingCorpus. Source can be:
 *   - mocap (Vicon, Xsens, etc.)
 *   - retargeted gameplay (Unity ML Agents reinforcement-learning rollouts)
 *   - synthetic (procedural walk-cycle generator — see fixtures/)
 */
export interface TrainingFrame {
  /** Sequential frame index within the parent capture session. */
  frameIndex: number;
  /** Wall-clock timestamp when the frame was captured (ms epoch). */
  timestampMs: number;

  // ── INPUTS (what the network sees) ──────────────────────────────────────
  /** Skeletal pose at this frame. Keys are joint names (skeleton-specific). */
  pose: SkeletonPose;
  /** Root-bone linear velocity in world-space (m/s). */
  rootVelocity: Vec3;
  /** Root-bone angular velocity around vertical axis (rad/s). */
  rootAngularVelocity: number;
  /** Phase value in [0, 1) — the Phase-Functioned cyclic position. */
  phase: number;
  /** Terrain surface normal at the root position (optional — defaults to up). */
  terrainNormal?: Vec3;

  // ── LABELS (what the network learns to predict) ─────────────────────────
  /** Foot-contact bitmask — which feet are grounded at this frame. */
  contactFeatures: ContactFeatures;
  /** Discrete gait label — for classifier head + ablation studies. */
  gait: Gait;
  /** Energy-cost annotation for this frame (joules — optional, for energy-aware training). */
  energyCost?: number;
}

/**
 * One frame of inference input — what the engine receives at runtime.
 * Strict subset of TrainingFrame — only the input fields, no labels.
 */
export interface InferenceFrame {
  pose: SkeletonPose;
  rootVelocity: Vec3;
  rootAngularVelocity: number;
  phase: number;
  terrainNormal?: Vec3;
}

/**
 * A captured motion sequence. Multiple frames sharing skeleton + sampling rate.
 */
export interface MotionCapture {
  /** Schema version — used to gate ingest compatibility. */
  schemaVersion: typeof MOTION_DATA_SCHEMA_VERSION;
  /** Capture identifier — e.g. "mocap_walk_run_001" or "synth_walk_cycle_v1". */
  captureId: string;
  /** Skeleton identifier — e.g. "biped_humanoid_v2". */
  skeletonId: string;
  /** Source modality. */
  source: 'mocap' | 'retargeted' | 'synthetic' | 'gameplay';
  /** Capture frame rate in Hz (typically 30 or 60). */
  fps: number;
  /** License + provenance — required for any capture used in training. */
  license: {
    /** SPDX identifier or 'proprietary' — must be commercial-use-OK for HoloScript. */
    spdx: string;
    /** Original creator / capture owner. */
    attribution: string;
    /** URL or reference to the capture source. */
    sourceUrl?: string;
  };
  /** Sequential frames in temporal order. */
  frames: TrainingFrame[];
}

/**
 * A training corpus = many MotionCaptures grouped for one training run.
 */
export interface TrainingCorpus {
  schemaVersion: typeof MOTION_DATA_SCHEMA_VERSION;
  /** Corpus identifier — e.g. "biped_v1_train_2026-Q3". */
  corpusId: string;
  /** Target skeleton — all captures must share this. */
  skeletonId: string;
  /** Train/val/test split — frames assigned by captureId, not frame-by-frame. */
  splits: {
    train: string[]; // captureIds
    val: string[];
    test: string[];
  };
  captures: MotionCapture[];
}

// =============================================================================
// VALIDATORS — pure functions, throw on invalid input
// =============================================================================

export function validateTrainingFrame(frame: TrainingFrame): void {
  if (typeof frame.frameIndex !== 'number' || frame.frameIndex < 0) {
    throw new Error(`TrainingFrame: frameIndex must be a non-negative number, got ${frame.frameIndex}`);
  }
  if (typeof frame.phase !== 'number' || frame.phase < 0 || frame.phase >= 1) {
    throw new Error(`TrainingFrame: phase must be in [0, 1), got ${frame.phase}`);
  }
  if (!frame.pose || typeof frame.pose !== 'object' || !frame.pose.joints) {
    throw new Error('TrainingFrame: pose.joints required');
  }
  if (!frame.contactFeatures || typeof frame.contactFeatures !== 'object') {
    throw new Error('TrainingFrame: contactFeatures required');
  }
  const validGaits: Gait[] = ['idle', 'walk', 'trot', 'run', 'crouch'];
  if (!validGaits.includes(frame.gait)) {
    throw new Error(`TrainingFrame: gait must be one of ${validGaits.join(', ')}, got ${frame.gait}`);
  }
}

export function validateMotionCapture(capture: MotionCapture): void {
  if (capture.schemaVersion !== MOTION_DATA_SCHEMA_VERSION) {
    throw new Error(
      `MotionCapture: schemaVersion ${capture.schemaVersion} unsupported (current=${MOTION_DATA_SCHEMA_VERSION})`
    );
  }
  if (!capture.captureId || typeof capture.captureId !== 'string') {
    throw new Error('MotionCapture: captureId required');
  }
  if (!capture.skeletonId || typeof capture.skeletonId !== 'string') {
    throw new Error('MotionCapture: skeletonId required');
  }
  if (capture.fps <= 0 || capture.fps > 240) {
    throw new Error(`MotionCapture: fps must be in (0, 240], got ${capture.fps}`);
  }
  if (!capture.license || !capture.license.spdx) {
    throw new Error(
      'MotionCapture: license.spdx required — every training capture must declare a commercial-use-compatible license (refuses CC BY-NC, GPL viral, proprietary without explicit grant)'
    );
  }
  // Reject license shapes incompatible with @holoscript/core npm publishing
  const blockedSpdx = ['CC-BY-NC-4.0', 'CC-BY-NC-SA-4.0', 'CC-BY-NC-ND-4.0', 'GPL-3.0', 'AGPL-3.0'];
  if (blockedSpdx.includes(capture.license.spdx)) {
    throw new Error(
      `MotionCapture: license ${capture.license.spdx} is incompatible with @holoscript/core commercial distribution. ` +
      `Permitted: MIT, Apache-2.0, BSD-3-Clause, CC-BY-4.0 (with attribution), proprietary-with-grant.`
    );
  }
  if (!Array.isArray(capture.frames) || capture.frames.length === 0) {
    throw new Error('MotionCapture: frames must be a non-empty array');
  }
  for (const frame of capture.frames) validateTrainingFrame(frame);
}

export function validateTrainingCorpus(corpus: TrainingCorpus): void {
  if (corpus.schemaVersion !== MOTION_DATA_SCHEMA_VERSION) {
    throw new Error(`TrainingCorpus: schemaVersion ${corpus.schemaVersion} unsupported`);
  }
  if (!corpus.corpusId) throw new Error('TrainingCorpus: corpusId required');
  if (!corpus.skeletonId) throw new Error('TrainingCorpus: skeletonId required');
  if (!corpus.splits) throw new Error('TrainingCorpus: splits required');

  const captureIds = new Set(corpus.captures.map((c) => c.captureId));
  const splitIds = [...corpus.splits.train, ...corpus.splits.val, ...corpus.splits.test];
  for (const id of splitIds) {
    if (!captureIds.has(id)) {
      throw new Error(`TrainingCorpus: split references unknown captureId ${id}`);
    }
  }
  // No capture appears in multiple splits (data leakage prevention)
  const seenInSplit = new Set<string>();
  for (const id of splitIds) {
    if (seenInSplit.has(id)) {
      throw new Error(`TrainingCorpus: captureId ${id} appears in multiple splits — data leakage`);
    }
    seenInSplit.add(id);
  }
  // All captures share the corpus skeleton
  for (const cap of corpus.captures) {
    if (cap.skeletonId !== corpus.skeletonId) {
      throw new Error(
        `TrainingCorpus: capture ${cap.captureId} skeleton ${cap.skeletonId} differs from corpus skeleton ${corpus.skeletonId}`
      );
    }
    validateMotionCapture(cap);
  }
}

/**
 * Convert an InferenceFrame into the flat tensor input shape that backends
 * (ONNX, WebGPU compute, pure-JS forward pass) all consume identically.
 *
 * Layout: [phase, rootVelX, rootVelY, rootVelZ, rootAngVel,
 *          terrainNX, terrainNY, terrainNZ,
 *          jointPos[0..N*3-1], jointRot[0..N*4-1]]
 *
 * Joint order is determined by the caller-provided sortedJointNames so the
 * tensor layout is deterministic across calls (matches training-time order).
 */
export function inferenceFrameToTensor(
  frame: InferenceFrame,
  sortedJointNames: string[]
): Float32Array {
  const headerLen = 8; // phase + 3 vel + 1 angVel + 3 terrain
  const jointLen = sortedJointNames.length * 7; // 3 pos + 4 rot per joint
  const out = new Float32Array(headerLen + jointLen);

  out[0] = frame.phase;
  out[1] = frame.rootVelocity.x;
  out[2] = frame.rootVelocity.y;
  out[3] = frame.rootVelocity.z;
  out[4] = frame.rootAngularVelocity;
  const terrain = frame.terrainNormal ?? { x: 0, y: 1, z: 0 };
  out[5] = terrain.x;
  out[6] = terrain.y;
  out[7] = terrain.z;

  for (let i = 0; i < sortedJointNames.length; i++) {
    const jointName = sortedJointNames[i];
    const joint = frame.pose.joints[jointName];
    const base = headerLen + i * 7;
    if (joint) {
      out[base + 0] = joint.position[0];
      out[base + 1] = joint.position[1];
      out[base + 2] = joint.position[2];
      out[base + 3] = joint.rotation[0];
      out[base + 4] = joint.rotation[1];
      out[base + 5] = joint.rotation[2];
      out[base + 6] = joint.rotation[3];
    }
    // missing joints → zero-padded (training-time augmentation handles this)
  }

  return out;
}
