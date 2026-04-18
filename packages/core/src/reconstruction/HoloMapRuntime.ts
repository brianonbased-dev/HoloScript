/**
 * HoloMapRuntime — feed-forward 3D reconstruction from RGB streams.
 *
 * HoloX-pattern native answer to lingbot-map (Ant Group). Runs entirely in
 * the browser on WebGPU; emits `.holo` trait compositions directly.
 *
 * Scope (Sprint 1): scaffold + TS interfaces only. No transformer pass yet.
 * See RFC-HoloMap.md for operator inventory and weight-acquisition plan.
 *
 * @version 0.0.1 (scaffold)
 */

import type { AnchorContextState } from './AnchorContext';
import type { TrajectoryMemoryState } from './TrajectoryMemory';

// =============================================================================
// INPUT / OUTPUT TYPES
// =============================================================================

export interface ReconstructionFrame {
  /** Monotonic frame index within a session */
  index: number;
  /** Capture timestamp (ms since session start) */
  timestampMs: number;
  /** Raw RGB bytes (HxWx3 or HxWx4 — see `stride`) */
  rgb: Uint8Array;
  width: number;
  height: number;
  /** Byte stride per row (4 implies RGBA, 3 implies RGB) */
  stride: 3 | 4;
}

export interface CameraPose {
  /** World-space position */
  position: [number, number, number];
  /** Quaternion (x, y, z, w) */
  rotation: [number, number, number, number];
  /** Reconstructor confidence [0, 1] */
  confidence: number;
}

export interface PointCloudChunk {
  /** xyz positions (N * 3 floats) */
  positions: Float32Array;
  /** rgb colors (N * 3 uint8, 0-255) */
  colors: Uint8Array;
  /** Optional normals (N * 3 floats) */
  normals?: Float32Array;
  /** Per-point confidence [0, 1] */
  confidence: Float32Array;
}

export interface ReconstructionStep {
  frame: ReconstructionFrame;
  pose: CameraPose;
  points: PointCloudChunk;
  /** Snapshot of trajectory memory at this step (for replay) */
  trajectory: TrajectoryMemoryState;
  /** Snapshot of anchor context at this step (for replay) */
  anchor: AnchorContextState;
}

// =============================================================================
// RUNTIME CONFIG
// =============================================================================

export interface HoloMapConfig {
  /** Input resolution — rescales frames before inference */
  inputResolution: { width: number; height: number };
  /** Target inference FPS (runtime throttles input frames) */
  targetFPS: number;
  /** Max sequence length before KV cache eviction kicks in */
  maxSequenceLength: number;
  /** Seed for deterministic inference (required for SimulationContract replay) */
  seed: number;
  /** Model checkpoint identifier (content-addressed) */
  modelHash: string;
  /** Optional CPU offloading for limited VRAM */
  cpuOffload: boolean;
}

export const HOLOMAP_DEFAULTS: HoloMapConfig = {
  inputResolution: { width: 518, height: 378 },
  targetFPS: 15,
  maxSequenceLength: 10_000,
  seed: 0,
  modelHash: 'unset',
  cpuOffload: false,
};

// =============================================================================
// RUNTIME INTERFACE
// =============================================================================

export interface HoloMapRuntime {
  /** Initialize the WebGPU pipeline and load weights */
  init(config: HoloMapConfig): Promise<void>;

  /** Feed one frame, return the incremental reconstruction step */
  step(frame: ReconstructionFrame): Promise<ReconstructionStep>;

  /** Finalize and export the full reconstruction as a .holo trait composition */
  finalize(): Promise<ReconstructionManifest>;

  /** Hash of (videoHash || modelHash || seed) — deterministic replay key */
  replayHash(): string;

  /** Release GPU resources */
  dispose(): Promise<void>;
}

// =============================================================================
// MANIFEST (EXPORT SHAPE)
// =============================================================================

export interface ReconstructionManifest {
  version: '0.1.0';
  worldId: string;
  displayName: string;
  pointCount: number;
  frameCount: number;
  bounds: {
    min: [number, number, number];
    max: [number, number, number];
  };
  /** Content-addressed replay identity */
  replayHash: string;
  /** External provenance anchor (OpenTimestamps + Base calldata per I.007) */
  provenance: {
    anchorHash?: string;
    opentimestampsProof?: string;
    baseCalldataTx?: string;
    capturedAtIso: string;
  };
  /** Relative asset paths emitted alongside the manifest */
  assets: {
    points: string;
    trajectory: string;
    anchors: string;
    splats?: string;
  };
}

// =============================================================================
// FACTORY (stub — real implementation lands in Sprint 2)
// =============================================================================

export function createHoloMapRuntime(_config?: Partial<HoloMapConfig>): HoloMapRuntime {
  throw new Error(
    'HoloMapRuntime is scaffolded in Sprint 1; implementation lands in Sprint 2. See reconstruction/RFC-HoloMap.md'
  );
}
