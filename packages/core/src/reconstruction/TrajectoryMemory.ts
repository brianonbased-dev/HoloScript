/**
 * TrajectoryMemory — long-term trajectory store for drift correction.
 *
 * Mirrors lingbot-map's trajectory memory module. Holds a compressed record
 * of camera poses and key-frame embeddings so the reconstructor can snap
 * back to the correct coordinate frame after long runs.
 *
 * Scope (Sprint 1): state shape + interface. Ring-buffer and drift-detection
 * logic lands in Sprint 2.
 *
 * @version 0.0.1 (scaffold)
 */

import type { CameraPose } from './HoloMapRuntime';

// =============================================================================
// TYPES
// =============================================================================

export interface TrajectoryKeyframe {
  frameIndex: number;
  timestampMs: number;
  pose: CameraPose;
  /** Compressed embedding used for loop-closure matching */
  embedding: Float32Array;
}

export interface TrajectoryMemoryState {
  keyframes: TrajectoryKeyframe[];
  /** Accumulated drift estimate in meters since session start */
  estimatedDriftMeters: number;
  /** Frame index of the last detected loop closure (−1 if none) */
  lastLoopClosureFrame: number;
  /** Monotonic revision counter (for replay diffing) */
  revision: number;
}

export interface TrajectoryMemoryConfig {
  /** Max keyframes retained (older ones compressed or evicted) */
  maxKeyframes: number;
  /** Minimum translation (meters) between keyframes */
  keyframeStrideMeters: number;
  /** Threshold on embedding cosine similarity to trigger loop closure */
  loopClosureThreshold: number;
}

export const TRAJECTORY_DEFAULTS: TrajectoryMemoryConfig = {
  maxKeyframes: 512,
  keyframeStrideMeters: 0.25,
  loopClosureThreshold: 0.92,
};

// =============================================================================
// INTERFACE
// =============================================================================

export interface TrajectoryMemory {
  readonly config: TrajectoryMemoryConfig;

  /** Ingest a pose; returns the new keyframe if one was emitted */
  push(pose: CameraPose, frameIndex: number, timestampMs: number): TrajectoryKeyframe | null;

  /** Check for loop closure against an embedding; returns matched keyframe if any */
  detectLoopClosure(embedding: Float32Array): TrajectoryKeyframe | null;

  /** Snapshot current state (for replay and manifest export) */
  snapshot(): TrajectoryMemoryState;

  /** Restore state (used when resuming from a replay hash) */
  restore(state: TrajectoryMemoryState): void;

  /** Reset the memory (new session) */
  reset(): void;
}

// =============================================================================
// FACTORY (stub)
// =============================================================================

export function createTrajectoryMemory(
  _config?: Partial<TrajectoryMemoryConfig>
): TrajectoryMemory {
  throw new Error(
    'TrajectoryMemory is scaffolded in Sprint 1; implementation lands in Sprint 2. See reconstruction/RFC-HoloMap.md §Trajectory'
  );
}
