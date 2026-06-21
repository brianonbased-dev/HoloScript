/**
 * HoloMapRuntime — feed-forward 3D reconstruction from RGB streams.
 *
 * HoloX-pattern native answer to lingbot-map (Ant Group). Runs on WebGPU;
 * emits reconstruction manifests suitable for `.holo` / trait composition.
 *
 * v1.0: deterministic replay fingerprint + SimulationContract binding metadata.
 * See RFC-HoloMap.md and docs/holomap/CHARTER.md.
 */

import type { AnchorContextState } from './AnchorContext';
import type { TrajectoryKeyframe, TrajectoryMemoryState } from './TrajectoryMemory';
import {
  createHoloMapMicroEncoder,
  runHoloMapMicroEncoderCpu,
  tryCreateHoloMapEncoderDevice,
  type HoloMapMicroEncoder,
  type HoloMapMicroConfig,
  type HoloMapMicroFrame,
} from './holoMapMicroEncoder';
import { computeHoloMapReplayFingerprint } from './replayFingerprint';
import { HOLOMAP_SIMULATION_CONTRACT_KIND } from './contractConstants';
import { getVersionString } from '../version';
import { createHoloMapRunId, logHoloMapEvent } from './holoMapTelemetry';
import { isWebGpuEnvironmentPresent } from './webgpuGate';
import { loadHoloMapWeightBlob } from './holoMapWeightLoader';
import {
  anchorReconstructionManifest,
  selfAttestReconstructionManifest,
  type HoloMapProvenanceAnchorProvider,
} from './holoMapAnchoredManifest';

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
  /**
   * Optional MEASURED per-pixel depth (row-major, length width*height, 0=near
   * .. 1=far) from a real device sensor — iOS LiDAR `sceneDepth.depthMap`,
   * ARCore depth, ToF, etc. When present the reconstructor uses it for point Z
   * instead of the monocular luminance/latent estimate. Absent → estimate
   * (sensorless devices / laptop webcam). See depth-infer.ts for the estimate.
   */
  depth?: Float32Array;
  /**
   * Optional metric depth in metres, row-major, length width*height. This is the
   * ARCore/ARKit path for scale-bearing reconstruction; `depth` remains the
   * legacy normalized 0..1 signal.
   */
  depthMeters?: Float32Array;
  /**
   * Optional MEASURED per-pixel depth confidence (row-major, length width*height,
   * normalized 0..1) from a real device sensor. When present, sampled depth
   * confidence gates the emitted point confidence so bad sensor cells remain
   * visible in replay instead of being silently trusted.
   */
  depthConfidence?: Float32Array;
  /** Camera intrinsics for metric depth projection. Pixel units, same image domain as the depth map. */
  cameraIntrinsics?: HoloMapCameraIntrinsics;
  /**
   * Optional MEASURED device pose (6-DoF) from platform tracking — ARKit
   * `frame.camera.transform`, ARCore pose, etc. When present it is used as the
   * camera pose (driving trajectory, drift, loop closure, keyframes) instead of
   * the scan-derived centroid pose. Absent → derived pose (E4).
   */
  devicePose?: CameraPose;
}

export interface HoloMapCameraIntrinsics {
  width: number;
  height: number;
  fx: number;
  fy: number;
  cx: number;
  cy: number;
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
  /** Closed-form per-frame depth fit used when metric sensor depth is present. */
  depthAlignment?: DepthAlignmentFit;
}

export interface DepthAlignmentFit {
  kind: 'shift-scale';
  sampleCount: number;
  scale: number;
  shift: number;
  rmseMeters: number;
}

// =============================================================================
// RUNTIME CONFIG
// =============================================================================

/** Capture-domain hint for specialist weights (v1.1+); affects replay fingerprint when not `generalist`. */
export type HoloMapVerticalProfile = 'generalist' | 'indoor' | 'outdoor' | 'object';

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
  /** Optional hash of source video / media (included in replay fingerprint) */
  videoHash?: string;
  /** Tiles per axis sampled from each accepted frame. points/frame = tileGrid^2. */
  tileGrid?: number;
  /** Optional content-addressed weights reference (changes replay fingerprint when set) */
  weightCid?: string;
  /** URL for weight blob fetch (pair with weightCid for digest verify). See RFC §5.1. */
  weightUrl?: string;
  /** Fallback URLs tried after weightUrl fails. */
  weightUrls?: string[];
  /** Optional CPU offloading for limited VRAM */
  cpuOffload: boolean;
  /** Model/weights strategy gate for MVP */
  weightStrategy?: 'distill' | 'fine-tune' | 'from-scratch';
  /**
   * Optional vertical specialist profile (pairs with a vertical-tuned `weightCid` in v1.1+).
   * Omitted or `generalist` does not change the replay fingerprint.
   */
  verticalProfile?: HoloMapVerticalProfile;
  /**
   * When false, initialization requires a browser WebGPU adapter. Node / headless CI
   * should keep true (default) or use compatibility ingest (Marble) for benchmarks.
   */
  allowCpuFallback?: boolean;
  /**
   * Platform-specific mesh-local weight resolver (RFC §5.1 HoloLand pointer mode).
   * Tried before cache and network. Receives `weightCid`, returns bytes or undefined.
   */
  localResolver?: (weightCid: string) => Promise<ArrayBuffer | undefined>;
  /**
   * Optional provenance anchor provider. When set, finalize() asks it to anchor the
   * canonical manifest digest through OTS/Base and falls back to self-attestation.
   */
  provenanceAnchorProvider?: HoloMapProvenanceAnchorProvider;
}

export const HOLOMAP_DEFAULTS: HoloMapConfig = {
  inputResolution: { width: 518, height: 378 },
  targetFPS: 15,
  maxSequenceLength: 10_000,
  seed: 0,
  modelHash: 'unset',
  tileGrid: 4,
  cpuOffload: false,
  weightStrategy: 'distill',
  allowCpuFallback: true,
};

// =============================================================================
// RUNTIME INTERFACE
// =============================================================================

export interface HoloMapRuntime {
  /** Initialize the WebGPU pipeline and load weights */
  init(config: HoloMapConfig): Promise<void>;

  /** Feed one frame, return the incremental reconstruction step (null if throttled). */
  step(frame: ReconstructionFrame): Promise<ReconstructionStep | null>;

  /** Finalize and export the full reconstruction as a .holo trait composition */
  finalize(): Promise<ReconstructionManifest>;

  /** Hash of replay-defining config and source identity — deterministic replay key */
  replayHash(): string;

  /** Release GPU resources */
  dispose(): Promise<void>;
}

// =============================================================================
// MANIFEST (EXPORT SHAPE)
// =============================================================================

export interface ReconstructionManifest {
  version: '1.0.0';
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
  /** SimulationContract-oriented binding (hash identity for reconstruction) */
  simulationContract: {
    kind: typeof HOLOMAP_SIMULATION_CONTRACT_KIND;
    replayFingerprint: string;
    holoScriptBuild: string;
  };
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
  /** Strategy used for selecting / running model weights */
  weightStrategy: 'distill' | 'fine-tune' | 'from-scratch';
}

// =============================================================================
// FACTORY
// =============================================================================

interface HoloMapTileSample {
  tile: HoloMapMicroFrame;
  meanColor: [number, number, number];
  centerUv: [number, number];
  luminance: number;
  texture: number;
}

interface EncodedTileSample extends HoloMapTileSample {
  latent: [number, number, number];
  rawDepthSignal: number;
  metricDepthMeters?: number;
}

interface LoopClosureCandidate {
  frameIndex: number;
  position: [number, number, number];
  descriptor: Float32Array;
}

interface RetainedReconstructionStep {
  frameIndex: number;
  points: Pick<PointCloudChunk, 'positions' | 'confidence'>;
}

class HoloMapRuntimeImpl implements HoloMapRuntime {
  private config: HoloMapConfig = { ...HOLOMAP_DEFAULTS };
  private initialized = false;
  private readonly steps: RetainedReconstructionStep[] = [];
  private replayKey = 'unset';
  private readonly runId = createHoloMapRunId();
  private encoderDevice: GPUDevice | null = null;
  private microEncoder: HoloMapMicroEncoder | null = null;
  /** Loaded weight blob (optional; GPU upload wiring follows R3+). */
  private weightBytes: ArrayBuffer | null = null;

  // ── Sprint-3 performance / determinism state ──
  /** Running bounding box (updated incrementally per step). */
  private boundsMin: [number, number, number] = [0, 0, 0];
  private boundsMax: [number, number, number] = [0, 0, 0];
  private boundsValid = false;
  /** Running total point count (avoids O(n) re-scan in finalize). */
  private totalPointCount = 0;
  // ── Scan-derived trajectory / drift state ──
  // Anchor pose, trajectory keyframes, and drift are derived from the scan
  // geometry rather than emitted as constants. Drift is an uncertainty-weighted
  // inter-frame pose delta accumulated over the capture.
  /** Accumulated drift estimate (meters) over the capture. */
  private cumulativeDriftMeters = 0;
  /**
   * Running sum of every observed point position + confidence (eviction-adjusted).
   * The anchor pose is the centroid (sum/count) of all observed points and the
   * descriptor carries the global mean confidence, so a single tampered point
   * moves the anchor — bounds center/extent alone are insensitive to a one-point
   * nudge that does not touch an extremum. (E4 acceptance bar.)
   */
  private globalPosSum: [number, number, number] = [0, 0, 0];
  private globalConfSum = 0;
  /** Previous frame camera pose (centroid of that frame's points). */
  private prevPose: [number, number, number] | null = null;
  /** Previous full camera pose, including scan-derived principal-axis rotation. */
  private prevCameraPose: CameraPose | null = null;
  /** Previous inter-frame velocity, for constant-velocity drift prediction. */
  private prevVelocity: [number, number, number] | null = null;
  /** Frame index of the last detected loop closure (−1 if none). */
  private lastLoopClosureFrameIdx = -1;
  /** Compact camera-pose history for loop-closure (revisit) detection. */
  private readonly poseHistory: LoopClosureCandidate[] = [];
  /** Compact trajectory snapshot emitted with every accepted step. */
  private readonly trajectoryKeyframes: TrajectoryKeyframe[] = [];
  private static readonly LOOP_CLOSURE_MIN_GAP = 3;
  private static readonly LOOP_CLOSURE_RADIUS = 0.05;
  private static readonly POSE_HISTORY_CAP = 512;
  private static readonly TRAJECTORY_KEYFRAME_CAP = 512;
  /** Maps normalized measured depth [0=near,1=far] to a point Z range matching
   *  the monocular estimate's spread (±~0.17), so sensor and estimate paths
   *  produce geometry in the same coordinate scale. */
  private static readonly DEPTH_Z_SCALE = 0.34;
  private static readonly LOOP_CLOSURE_DESCRIPTOR_DISTANCE = 0.015;

  /**
   * Nearest-neighbour sample of a row-major depth map at a normalized UV.
   * Used to read MEASURED sensor depth at a tile centre (frame.depth). Nearest
   * (not bilinear) keeps it deterministic and cheap; tiles are small.
   */
  private static sampleDepthNearestUv(
    depth: Float32Array,
    width: number,
    height: number,
    uv: [number, number]
  ): number {
    const px = Math.min(width - 1, Math.max(0, Math.round(uv[0] * (width - 1))));
    const py = Math.min(height - 1, Math.max(0, Math.round(uv[1] * (height - 1))));
    const v = depth[py * width + px];
    return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.5;
  }

  private static sampleMetricDepthNearestUv(
    depthMeters: Float32Array,
    width: number,
    height: number,
    uv: [number, number]
  ): number | undefined {
    const px = Math.min(width - 1, Math.max(0, Math.round(uv[0] * (width - 1))));
    const py = Math.min(height - 1, Math.max(0, Math.round(uv[1] * (height - 1))));
    const v = depthMeters[py * width + px];
    return Number.isFinite(v) && v > 0 ? v : undefined;
  }

  private static hasUsableIntrinsics(
    intrinsics: HoloMapCameraIntrinsics | undefined
  ): intrinsics is HoloMapCameraIntrinsics {
    return (
      !!intrinsics &&
      Number.isFinite(intrinsics.width) &&
      Number.isFinite(intrinsics.height) &&
      Number.isFinite(intrinsics.fx) &&
      Number.isFinite(intrinsics.fy) &&
      Number.isFinite(intrinsics.cx) &&
      Number.isFinite(intrinsics.cy) &&
      intrinsics.width > 0 &&
      intrinsics.height > 0 &&
      intrinsics.fx > 0 &&
      intrinsics.fy > 0
    );
  }

  private static normalizeQuaternion(
    q: [number, number, number, number]
  ): [number, number, number, number] {
    const len = Math.hypot(q[0], q[1], q[2], q[3]);
    if (len <= 1e-12) return [0, 0, 0, 1];
    return [q[0] / len, q[1] / len, q[2] / len, q[3] / len];
  }

  private static rotateByQuaternion(
    v: [number, number, number],
    q: [number, number, number, number]
  ): [number, number, number] {
    const [x, y, z, w] = HoloMapRuntimeImpl.normalizeQuaternion(q);
    const [vx, vy, vz] = v;
    const tx = 2 * (y * vz - z * vy);
    const ty = 2 * (z * vx - x * vz);
    const tz = 2 * (x * vy - y * vx);
    return [
      vx + w * tx + (y * tz - z * ty),
      vy + w * ty + (z * tx - x * tz),
      vz + w * tz + (x * ty - y * tx),
    ];
  }

  private static projectMetricDepthToWorld(
    uv: [number, number],
    depthMeters: number,
    intrinsics: HoloMapCameraIntrinsics,
    pose?: CameraPose
  ): [number, number, number] {
    const pixelX = uv[0] * intrinsics.width;
    const pixelY = uv[1] * intrinsics.height;
    const local: [number, number, number] = [
      ((pixelX - intrinsics.cx) * depthMeters) / intrinsics.fx,
      ((intrinsics.cy - pixelY) * depthMeters) / intrinsics.fy,
      -depthMeters,
    ];
    if (!pose) return local;
    const rotated = HoloMapRuntimeImpl.rotateByQuaternion(local, pose.rotation);
    return [
      pose.position[0] + rotated[0],
      pose.position[1] + rotated[1],
      pose.position[2] + rotated[2],
    ];
  }

  private static fitShiftScaleDepth(
    samples: readonly EncodedTileSample[]
  ): DepthAlignmentFit | undefined {
    const paired = samples
      .filter((sample) => sample.metricDepthMeters !== undefined)
      .map((sample) => ({
        x: sample.rawDepthSignal,
        y: sample.metricDepthMeters!,
      }));
    if (paired.length === 0) return undefined;

    let meanX = 0;
    let meanY = 0;
    for (const sample of paired) {
      meanX += sample.x;
      meanY += sample.y;
    }
    meanX /= paired.length;
    meanY /= paired.length;

    let varianceX = 0;
    let covariance = 0;
    for (const sample of paired) {
      const dx = sample.x - meanX;
      varianceX += dx * dx;
      covariance += dx * (sample.y - meanY);
    }

    const scale = varianceX > 1e-12 ? covariance / varianceX : 0;
    const shift = meanY - scale * meanX;
    let squared = 0;
    for (const sample of paired) {
      const err = scale * sample.x + shift - sample.y;
      squared += err * err;
    }

    return {
      kind: 'shift-scale',
      sampleCount: paired.length,
      scale,
      shift,
      rmseMeters: Math.sqrt(squared / paired.length),
    };
  }

  private static alignedDepthMeters(
    sample: EncodedTileSample,
    fit: DepthAlignmentFit | undefined
  ): number | undefined {
    if (fit) {
      const aligned = fit.scale * sample.rawDepthSignal + fit.shift;
      if (Number.isFinite(aligned) && aligned > 0) return aligned;
    }
    return sample.metricDepthMeters;
  }

  private static buildLoopClosureDescriptor(samples: readonly EncodedTileSample[]): Float32Array {
    if (samples.length === 0) return new Float32Array([0, 0, 0, 0, 0, 0]);
    let r = 0;
    let g = 0;
    let b = 0;
    let luma = 0;
    let texture = 0;
    let depth = 0;
    let depthCount = 0;
    for (const sample of samples) {
      r += sample.meanColor[0] / 255;
      g += sample.meanColor[1] / 255;
      b += sample.meanColor[2] / 255;
      luma += sample.luminance;
      texture += sample.texture;
      if (sample.metricDepthMeters !== undefined) {
        depth += Math.min(1, sample.metricDepthMeters / 10);
        depthCount += 1;
      }
    }
    const inv = 1 / samples.length;
    return new Float32Array([
      r * inv,
      g * inv,
      b * inv,
      luma * inv,
      texture * inv,
      depthCount > 0 ? depth / depthCount : 0,
    ]);
  }

  private static descriptorDistance(a: Float32Array, b: Float32Array): number {
    const n = Math.min(a.length, b.length);
    if (n === 0) return Number.POSITIVE_INFINITY;
    let squared = 0;
    for (let i = 0; i < n; i += 1) {
      const d = (a[i] ?? 0) - (b[i] ?? 0);
      squared += d * d;
    }
    return Math.sqrt(squared / n);
  }
  /** Last accepted capture timestamp (ms) for deterministic FPS throttling. */
  private lastAcceptedFrameTimestampMs: number | null = null;
  /** Deterministic session start timestamp. */
  private sessionStartMs = 0;
  /** Performance metrics accumulated across steps. */
  private perfMetrics: {
    stepCount: number;
    throttledCount: number;
    totalStepMs: number;
    maxStepMs: number;
    minStepMs: number;
  } = { stepCount: 0, throttledCount: 0, totalStepMs: 0, maxStepMs: 0, minStepMs: Infinity };

  private static computeBounds(steps: RetainedReconstructionStep[]): {
    min: [number, number, number];
    max: [number, number, number];
  } {
    if (steps.length === 0) {
      return {
        min: [0, 0, 0],
        max: [0, 0, 0],
      };
    }

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let minZ = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    let maxZ = Number.NEGATIVE_INFINITY;

    for (const step of steps) {
      const { positions } = step.points;
      for (let i = 0; i < positions.length; i += 3) {
        const x = positions[i] ?? 0;
        const y = positions[i + 1] ?? 0;
        const z = positions[i + 2] ?? 0;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (z < minZ) minZ = z;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
        if (z > maxZ) maxZ = z;
      }
    }

    if (!Number.isFinite(minX)) {
      return {
        min: [0, 0, 0],
        max: [0, 0, 0],
      };
    }

    return {
      min: [minX, minY, minZ],
      max: [maxX, maxY, maxZ],
    };
  }

  /** Update running bounds with new point positions. */
  private updateBounds(positions: Float32Array): void {
    if (positions.length === 0) return;
    if (!this.boundsValid) {
      this.boundsMin = [
        Number.POSITIVE_INFINITY,
        Number.POSITIVE_INFINITY,
        Number.POSITIVE_INFINITY,
      ];
      this.boundsMax = [
        Number.NEGATIVE_INFINITY,
        Number.NEGATIVE_INFINITY,
        Number.NEGATIVE_INFINITY,
      ];
    }
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i] ?? 0;
      const y = positions[i + 1] ?? 0;
      const z = positions[i + 2] ?? 0;
      if (x < this.boundsMin[0]) this.boundsMin[0] = x;
      if (y < this.boundsMin[1]) this.boundsMin[1] = y;
      if (z < this.boundsMin[2]) this.boundsMin[2] = z;
      if (x > this.boundsMax[0]) this.boundsMax[0] = x;
      if (y > this.boundsMax[1]) this.boundsMax[1] = y;
      if (z > this.boundsMax[2]) this.boundsMax[2] = z;
    }
    this.boundsValid = true;
  }

  /** Get current bounds (running or computed). */
  private getBounds(): { min: [number, number, number]; max: [number, number, number] } {
    if (this.boundsValid) {
      return { min: [...this.boundsMin], max: [...this.boundsMax] };
    }
    return HoloMapRuntimeImpl.computeBounds(this.steps);
  }

  private static *retainedPositionChunks(
    steps: readonly RetainedReconstructionStep[],
    current: Float32Array
  ): Iterable<Float32Array> {
    for (const step of steps) yield step.points.positions;
    yield current;
  }

  private static estimatePrincipalAxisRotation(
    chunks: Iterable<Float32Array>,
    centroid: [number, number, number]
  ): [number, number, number, number] {
    let xx = 0;
    let zz = 0;
    let xz = 0;
    let n = 0;

    for (const positions of chunks) {
      for (let i = 0; i < positions.length; i += 3) {
        const dx = (positions[i] ?? 0) - centroid[0];
        const dz = (positions[i + 2] ?? 0) - centroid[2];
        xx += dx * dx;
        zz += dz * dz;
        xz += dx * dz;
        n += 1;
      }
    }

    if (n < 2 || xx + zz < 1e-12) return [0, 0, 0, 1];
    const yaw = 0.5 * Math.atan2(2 * xz, xx - zz);
    return HoloMapRuntimeImpl.yawToQuaternion(yaw);
  }

  private static yawToQuaternion(yaw: number): [number, number, number, number] {
    const half = yaw / 2;
    return [0, Math.sin(half), 0, Math.cos(half)];
  }

  private static poseDistanceMeters(a: CameraPose, b: CameraPose): number {
    const dx = a.position[0] - b.position[0];
    const dy = a.position[1] - b.position[1];
    const dz = a.position[2] - b.position[2];
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  private static poseRotationDeltaRadians(a: CameraPose, b: CameraPose): number {
    const dot = Math.abs(
      a.rotation[0] * b.rotation[0] +
        a.rotation[1] * b.rotation[1] +
        a.rotation[2] * b.rotation[2] +
        a.rotation[3] * b.rotation[3]
    );
    const clamped = Math.max(-1, Math.min(1, dot));
    return 2 * Math.acos(clamped);
  }

  private static buildTrajectoryEmbedding(
    pose: CameraPose,
    anchorDescriptor: Float32Array,
    interFrameDeltaMeters: number,
    interFrameRotationRadians: number
  ): Float32Array {
    return new Float32Array([
      pose.position[0],
      pose.position[1],
      pose.position[2],
      pose.rotation[0],
      pose.rotation[1],
      pose.rotation[2],
      pose.rotation[3],
      pose.confidence,
      interFrameDeltaMeters,
      interFrameRotationRadians,
      anchorDescriptor[0] ?? 0,
      anchorDescriptor[1] ?? 0,
      anchorDescriptor[2] ?? 0,
      anchorDescriptor[3] ?? 0,
    ]);
  }

  private static cloneTrajectoryKeyframes(
    keyframes: readonly TrajectoryKeyframe[]
  ): TrajectoryKeyframe[] {
    return keyframes.map((keyframe) => ({
      frameIndex: keyframe.frameIndex,
      timestampMs: keyframe.timestampMs,
      pose: {
        position: [...keyframe.pose.position] as [number, number, number],
        rotation: [...keyframe.pose.rotation] as [number, number, number, number],
        confidence: keyframe.pose.confidence,
      },
      embedding: new Float32Array(keyframe.embedding),
    }));
  }

  private pushTrajectoryKeyframe(keyframe: TrajectoryKeyframe): void {
    this.trajectoryKeyframes.push(keyframe);
    if (this.trajectoryKeyframes.length > HoloMapRuntimeImpl.TRAJECTORY_KEYFRAME_CAP) {
      this.trajectoryKeyframes.shift();
    }
  }

  async init(config: HoloMapConfig): Promise<void> {
    this.config = { ...config };
    this.config.tileGrid = HoloMapRuntimeImpl.normalizeTileGrid(this.config.tileGrid);
    const allowCpu = this.config.allowCpuFallback !== false;
    if (!allowCpu && !isWebGpuEnvironmentPresent()) {
      const err =
        'HoloMap: native reconstruction requires WebGPU (allowCpuFallback=false). ' +
        'Run in a WebGPU-capable browser, or set allowCpuFallback=true for CPU fallback, ' +
        'or use compatibility scene ingest (Marble) for headless benchmarks.';
      logHoloMapEvent(this.runId, 'error', { message: err });
      throw new Error(err);
    }
    // Sprint-3: reset all state deterministically
    this.steps.length = 0;
    this.totalPointCount = 0;
    this.boundsValid = false;
    this.boundsMin = [0, 0, 0];
    this.boundsMax = [0, 0, 0];
    this.cumulativeDriftMeters = 0;
    this.prevPose = null;
    this.prevCameraPose = null;
    this.prevVelocity = null;
    this.lastLoopClosureFrameIdx = -1;
    this.poseHistory.length = 0;
    this.trajectoryKeyframes.length = 0;
    this.globalPosSum = [0, 0, 0];
    this.globalConfSum = 0;
    this.lastAcceptedFrameTimestampMs = null;
    this.sessionStartMs = performance.now();
    this.perfMetrics = {
      stepCount: 0,
      throttledCount: 0,
      totalStepMs: 0,
      maxStepMs: 0,
      minStepMs: Infinity,
    };

    this.replayKey = computeHoloMapReplayFingerprint({
      modelHash: this.config.modelHash,
      seed: this.config.seed,
      weightStrategy: this.config.weightStrategy ?? 'distill',
      videoHash: this.config.videoHash,
      tileGrid: this.config.tileGrid,
      weightCid: this.config.weightCid,
      verticalProfile: this.config.verticalProfile,
    });
    this.weightBytes = null;
    if (this.config.weightUrl) {
      const result = await loadHoloMapWeightBlob({
        weightUrl: this.config.weightUrl,
        weightUrls: this.config.weightUrls,
        weightCid: this.config.weightCid,
        localResolver: this.config.localResolver,
      });
      this.weightBytes = result.bytes;
    }

    this.encoderDevice = await tryCreateHoloMapEncoderDevice();
    this.microEncoder = this.encoderDevice ? createHoloMapMicroEncoder(this.encoderDevice) : null;

    this.initialized = true;
    logHoloMapEvent(this.runId, 'init', {
      modelHash: this.config.modelHash,
      seed: this.config.seed,
      allowCpuFallback: allowCpu,
      webgpu: isWebGpuEnvironmentPresent(),
      microEncoder: this.microEncoder ? 'webgpu' : 'cpu',
      tileGrid: this.config.tileGrid,
      weightLoadedBytes: this.weightBytes?.byteLength ?? 0,
      replayFingerprint: this.replayKey,
    });
  }

  /**
   * Default number of tiles per axis used to fan the encoder across the frame.
   * Total points emitted = tileGrid * tileGrid (one per tile).
   * Each tile runs the full 8-kernel transformer chain via the micro encoder
   * (imagePatchEmbed → layerNorm → gemm Q/K/V → rope → fusedMHA →
   * layerNorm → gelu → gemm xyz). pagedKV append/lookup remains available
   * for future streaming kLen>1 paths.
   */
  private static readonly GRID_N = 4;
  private static readonly MAX_GRID_N = 32;

  private static normalizeTileGrid(value: number | undefined): number {
    const raw = value ?? HoloMapRuntimeImpl.GRID_N;
    if (!Number.isFinite(raw)) {
      throw new Error(`HoloMapRuntime.init invalid tileGrid: ${String(value)}`);
    }
    const tileGrid = Math.floor(raw);
    if (tileGrid < 1 || tileGrid > HoloMapRuntimeImpl.MAX_GRID_N) {
      throw new Error(
        `HoloMapRuntime.init tileGrid must be an integer from 1 to ${HoloMapRuntimeImpl.MAX_GRID_N}`
      );
    }
    return tileGrid;
  }

  /**
   * Carve `frame` into gridN×gridN tiles. Each tile carries its own
   * (rgb, width, height, stride, index) and the mean RGB color over its
   * pixels (used to color the corresponding output point).
   *
   * Tiles inherit `frame.index` shifted by tile id so micro-encoder
   * per-frame seeds remain deterministic and distinct across tiles.
   */
  private static tileFrame(frame: ReconstructionFrame, gridN: number): HoloMapTileSample[] {
    const out: HoloMapTileSample[] = [];
    const tileW = Math.max(1, Math.floor(frame.width / gridN));
    const tileH = Math.max(1, Math.floor(frame.height / gridN));
    const stride = frame.stride;

    for (let ty = 0; ty < gridN; ty += 1) {
      for (let tx = 0; tx < gridN; tx += 1) {
        // Last column/row absorbs remainder so we cover the full image even
        // when width/height aren't divisible by gridN.
        const x0 = tx * tileW;
        const y0 = ty * tileH;
        const x1 = tx === gridN - 1 ? frame.width : x0 + tileW;
        const y1 = ty === gridN - 1 ? frame.height : y0 + tileH;
        const w = x1 - x0;
        const h = y1 - y0;
        const tileBytes = new Uint8Array(w * h * stride);
        let rSum = 0;
        let gSum = 0;
        let bSum = 0;
        let lumaSum = 0;
        let lumaSqSum = 0;
        let count = 0;
        for (let y = 0; y < h; y += 1) {
          const srcRow = (y0 + y) * frame.width * stride;
          const dstRow = y * w * stride;
          for (let x = 0; x < w; x += 1) {
            const sIdx = srcRow + (x0 + x) * stride;
            const dIdx = dstRow + x * stride;
            const r = frame.rgb[sIdx] ?? 0;
            const g = frame.rgb[sIdx + 1] ?? 0;
            const b = frame.rgb[sIdx + 2] ?? 0;
            tileBytes[dIdx] = r;
            tileBytes[dIdx + 1] = g;
            tileBytes[dIdx + 2] = b;
            if (stride === 4) tileBytes[dIdx + 3] = frame.rgb[sIdx + 3] ?? 255;
            rSum += r;
            gSum += g;
            bSum += b;
            const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
            lumaSum += luma;
            lumaSqSum += luma * luma;
            count += 1;
          }
        }
        const denom = Math.max(1, count);
        const meanLuma = lumaSum / denom;
        const lumaVariance = Math.max(0, lumaSqSum / denom - meanLuma * meanLuma);
        const tileId = ty * gridN + tx;
        out.push({
          tile: {
            // Encode (frameIndex, tileId) into the per-tile micro index so
            // each tile gets a distinct deterministic micro-encoder seed.
            index: frame.index * gridN * gridN + tileId,
            rgb: tileBytes,
            width: w,
            height: h,
            stride,
          },
          centerUv: [
            ((x0 + x1) * 0.5) / Math.max(1, frame.width),
            ((y0 + y1) * 0.5) / Math.max(1, frame.height),
          ],
          luminance: meanLuma / 255,
          texture: Math.sqrt(lumaVariance) / 255,
          meanColor: [Math.round(rSum / denom), Math.round(gSum / denom), Math.round(bSum / denom)],
        });
      }
    }
    return out;
  }

  private async encodeTile(
    tile: HoloMapMicroFrame,
    microCfg: HoloMapMicroConfig
  ): Promise<Float32Array> {
    if (!this.microEncoder) {
      return runHoloMapMicroEncoderCpu(tile, microCfg);
    }

    try {
      return await this.microEncoder.run(tile, microCfg);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (this.config.allowCpuFallback === false) {
        throw new Error(`HoloMap WebGPU micro-encoder failed: ${message}`);
      }
      logHoloMapEvent(this.runId, 'micro_encoder_fallback', {
        frameIndex: tile.index,
        reason: message,
      });
      this.microEncoder = null;
      return runHoloMapMicroEncoderCpu(tile, microCfg);
    }
  }

  async step(frame: ReconstructionFrame): Promise<ReconstructionStep | null> {
    if (!this.initialized) {
      throw new Error('HoloMapRuntime not initialized. Call init(config) before step(frame).');
    }

    if (!Number.isFinite(frame.timestampMs)) {
      throw new Error(`HoloMapRuntime.step invalid frame timestamp: ${frame.timestampMs}`);
    }

    const expectedBytes = frame.width * frame.height * frame.stride;
    if (frame.rgb.byteLength !== expectedBytes) {
      throw new Error(
        `HoloMapRuntime.step invalid frame byte length: got ${frame.rgb.byteLength}, expected ${expectedBytes} (w=${frame.width}, h=${frame.height}, stride=${frame.stride})`
      );
    }
    if (frame.depth && frame.depth.length !== frame.width * frame.height) {
      throw new Error(
        `HoloMapRuntime.step invalid measured depth length: got ${frame.depth.length}, expected ${frame.width * frame.height} (w=${frame.width}, h=${frame.height})`
      );
    }
    if (frame.depthMeters && frame.depthMeters.length !== frame.width * frame.height) {
      throw new Error(
        `HoloMapRuntime.step invalid metric depth length: got ${frame.depthMeters.length}, expected ${frame.width * frame.height} (w=${frame.width}, h=${frame.height})`
      );
    }
    if (frame.depthConfidence && frame.depthConfidence.length !== frame.width * frame.height) {
      throw new Error(
        `HoloMapRuntime.step invalid measured depth confidence length: got ${frame.depthConfidence.length}, expected ${frame.width * frame.height} (w=${frame.width}, h=${frame.height})`
      );
    }

    // Sprint-3: deterministic frame-rate throttling. Use capture timestamps,
    // not wall-clock runtime speed, so replay keeps the same accepted frames.
    const minIntervalMs = 1000 / Math.max(1, this.config.targetFPS);
    if (
      this.lastAcceptedFrameTimestampMs !== null &&
      frame.timestampMs - this.lastAcceptedFrameTimestampMs < minIntervalMs
    ) {
      this.perfMetrics.throttledCount += 1;
      logHoloMapEvent(this.runId, 'step_throttled', {
        frameIndex: frame.index,
        elapsedFrameMs: Math.round(frame.timestampMs - this.lastAcceptedFrameTimestampMs),
        targetIntervalMs: Math.round(minIntervalMs),
      });
      return null;
    }

    const stepStartMs = performance.now();
    this.lastAcceptedFrameTimestampMs = frame.timestampMs;

    // Sprint-3: memory bound enforcement
    if (this.steps.length >= this.config.maxSequenceLength) {
      const evicted = this.steps.shift()!;
      const evictedPoints = evicted.points.positions.length / 3;
      this.totalPointCount -= evictedPoints;
      // Keep the global centroid/confidence accumulators consistent with the
      // retained window by subtracting the evicted step's contribution.
      const ep = evicted.points.positions;
      for (let i = 0; i < ep.length; i += 3) {
        this.globalPosSum[0] -= ep[i]!;
        this.globalPosSum[1] -= ep[i + 1]!;
        this.globalPosSum[2] -= ep[i + 2]!;
      }
      const ec = evicted.points.confidence;
      for (let i = 0; i < ec.length; i += 1) this.globalConfSum -= ec[i]!;
      // Recompute bounds from all remaining retained steps so the subsequent
      // updateBounds(positions) call starts from the correct baseline rather
      // than reinitializing to ±Infinity from just the incoming frame.
      // (Without this, bounds after eviction reflected only the newest frame.)
      this.boundsValid = false;
      for (const s of this.steps) {
        this.updateBounds(s.points.positions);
      }
      logHoloMapEvent(this.runId, 'step_evict', {
        frameIndex: evicted.frameIndex,
        evictedPoints,
        retainedSteps: this.steps.length,
      });
    }

    const microCfg = {
      seed: this.config.seed,
      modelHash: this.config.modelHash,
      // Wire the loaded checkpoint through to the encoder. Previously weightBytes
      // was fetched + verified in init() then never passed here, so the encoder
      // always ran on PRNG weights even when a real checkpoint was provided.
      weightBytes: this.weightBytes,
    };

    // Run the full 8-kernel transformer pass once per tile.
    // Each tile call exercises:
    //   imagePatchEmbed → layerNorm → gemm(Q/K/V) →
    //   rope → fusedMHA → layerNorm → gelu → gemm(xyz)
    // and emits a 3-vector that becomes one point in the output cloud.
    //
    // Cap grid by frame extent so tiny test fixtures (e.g. 2×2) still produce
    // a non-degenerate cloud: gridN cannot exceed min(width, height).
    const configuredGrid = this.config.tileGrid ?? HoloMapRuntimeImpl.GRID_N;
    const gridN = Math.max(1, Math.min(configuredGrid, frame.width, frame.height));
    const tiles = HoloMapRuntimeImpl.tileFrame(frame, gridN);
    const numPoints = tiles.length;

    const positions = new Float32Array(numPoints * 3);
    const colors = new Uint8Array(numPoints * 3);
    const confidence = new Float32Array(numPoints);
    const aspect = frame.width / Math.max(1, frame.height);
    const metricIntrinsics = HoloMapRuntimeImpl.hasUsableIntrinsics(frame.cameraIntrinsics)
      ? frame.cameraIntrinsics
      : undefined;
    const encodedTiles: EncodedTileSample[] = [];

    for (let t = 0; t < numPoints; t += 1) {
      const sample = tiles[t]!;
      const xyz = await this.encodeTile(sample.tile, microCfg);
      const latentX = xyz[0] ?? 0;
      const latentY = xyz[1] ?? 0;
      const latentZ = xyz[2] ?? 0;
      const depthHint = (sample.luminance - 0.5) * 0.34 + sample.texture * 0.24;
      encodedTiles.push({
        ...sample,
        latent: [latentX, latentY, latentZ],
        rawDepthSignal: depthHint + latentZ * 0.12,
        metricDepthMeters: frame.depthMeters
          ? HoloMapRuntimeImpl.sampleMetricDepthNearestUv(
              frame.depthMeters,
              frame.width,
              frame.height,
              sample.centerUv
            )
          : undefined,
      });
    }

    const depthAlignment = HoloMapRuntimeImpl.fitShiftScaleDepth(encodedTiles);
    const loopDescriptor = HoloMapRuntimeImpl.buildLoopClosureDescriptor(encodedTiles);
    const rawDevicePose: CameraPose | undefined = frame.devicePose
      ? {
          position: [...frame.devicePose.position],
          rotation: [...frame.devicePose.rotation],
          confidence: frame.devicePose.confidence,
        }
      : undefined;
    let loopCorrectedPose: CameraPose | undefined;
    if (frame.depthMeters && metricIntrinsics) {
      for (const kf of this.poseHistory) {
        if (frame.index - kf.frameIndex < HoloMapRuntimeImpl.LOOP_CLOSURE_MIN_GAP) continue;
        const descriptorDistance = HoloMapRuntimeImpl.descriptorDistance(
          loopDescriptor,
          kf.descriptor
        );
        if (descriptorDistance <= HoloMapRuntimeImpl.LOOP_CLOSURE_DESCRIPTOR_DISTANCE) {
          this.lastLoopClosureFrameIdx = frame.index;
          if (rawDevicePose) {
            loopCorrectedPose = {
              ...rawDevicePose,
              position: [...kf.position],
              confidence: Math.min(1, Math.max(rawDevicePose.confidence, 0.9)),
            };
          }
          break;
        }
      }
    }
    const metricProjectionPose = loopCorrectedPose ?? rawDevicePose;

    let centroidX = 0;
    let centroidY = 0;
    let centroidZ = 0;
    let confidenceSum = 0;

    for (let t = 0; t < numPoints; t += 1) {
      const { meanColor, centerUv, texture, latent, rawDepthSignal } = encodedTiles[t]!;
      const [latentX, latentY, latentZ] = latent;
      const planeX = (centerUv[0] - 0.5) * 2 * aspect;
      const planeY = (0.5 - centerUv[1]) * 2;
      let px = planeX + latentX * 0.08;
      let py = planeY + latentY * 0.08;
      // MEASURED depth (sensor) takes precedence over the monocular estimate.
      // Device depth is authoritative — map normalized [0=near,1=far] to the same
      // Z range as the estimate (±~0.17) so downstream geometry is consistent.
      let pz: number;
      const metricDepth = HoloMapRuntimeImpl.alignedDepthMeters(encodedTiles[t]!, depthAlignment);
      if (metricDepth !== undefined && metricIntrinsics) {
        const worldPoint = HoloMapRuntimeImpl.projectMetricDepthToWorld(
          centerUv,
          metricDepth,
          metricIntrinsics,
          metricProjectionPose
        );
        px = worldPoint[0];
        py = worldPoint[1];
        pz = worldPoint[2];
      } else if (metricDepth !== undefined) {
        pz = -metricDepth;
      } else if (frame.depth) {
        const measured = HoloMapRuntimeImpl.sampleDepthNearestUv(
          frame.depth,
          frame.width,
          frame.height,
          centerUv
        );
        pz = (0.5 - measured) * HoloMapRuntimeImpl.DEPTH_Z_SCALE;
      } else {
        pz = rawDepthSignal;
      }

      positions[t * 3] = px;
      positions[t * 3 + 1] = py;
      positions[t * 3 + 2] = pz;
      colors[t * 3] = meanColor[0];
      colors[t * 3 + 1] = meanColor[1];
      colors[t * 3 + 2] = meanColor[2];
      const latentMag = Math.sqrt(latentX * latentX + latentY * latentY + latentZ * latentZ);
      const baseConfidence = Math.min(
        1,
        0.45 + 0.35 / (1 + latentMag) + Math.min(0.2, texture * 1.5)
      );
      if (frame.depthConfidence) {
        const sensorConfidence = HoloMapRuntimeImpl.sampleDepthNearestUv(
          frame.depthConfidence,
          frame.width,
          frame.height,
          centerUv
        );
        confidence[t] = baseConfidence * sensorConfidence;
      } else {
        confidence[t] = baseConfidence;
      }
      confidenceSum += confidence[t]!;

      centroidX += px;
      centroidY += py;
      centroidZ += pz;
    }

    const inv = 1 / Math.max(1, numPoints);
    const poseX = centroidX * inv;
    const poseY = centroidY * inv;
    const poseZ = centroidZ * inv;
    const meanConfidence = confidenceSum * inv;

    // ── Scan-derived pose + drift ───────────────────────────────────────────
    // Pose = point centroid + horizontal principal-axis rotation. Drift is the
    // uncertainty-weighted inter-frame pose delta, plus a residual term when the
    // trajectory deviates from constant-velocity motion.
    // MEASURED device pose (ARKit/ARCore) takes precedence over the scan-derived
    // centroid pose: when present it drives the whole trajectory (drift, loop
    // closure, keyframes) from real tracking instead of an estimate. Absent →
    // derived pose (E4 + peer principal-axis rotation).
    const derivedPosition: [number, number, number] = [poseX, poseY, poseZ];
    const poseConfidence = Math.max(0, Math.min(1, meanConfidence));
    const cameraPose: CameraPose = metricProjectionPose
      ? {
          position: [...metricProjectionPose.position],
          rotation: [...metricProjectionPose.rotation],
          confidence: metricProjectionPose.confidence,
        }
      : {
          position: derivedPosition,
          rotation: HoloMapRuntimeImpl.estimatePrincipalAxisRotation([positions], derivedPosition),
          confidence: poseConfidence,
        };
    const curPose: [number, number, number] = [
      cameraPose.position[0],
      cameraPose.position[1],
      cameraPose.position[2],
    ];

    let interFrameDeltaMeters = 0;
    let interFrameRotationRadians = 0;
    if (this.prevCameraPose) {
      interFrameDeltaMeters = HoloMapRuntimeImpl.poseDistanceMeters(
        cameraPose,
        this.prevCameraPose
      );
      interFrameRotationRadians = HoloMapRuntimeImpl.poseRotationDeltaRadians(
        cameraPose,
        this.prevCameraPose
      );
      const uncertaintyWeight = Math.max(
        0.05,
        1 - Math.min(cameraPose.confidence, this.prevCameraPose.confidence)
      );
      this.cumulativeDriftMeters +=
        interFrameDeltaMeters * uncertaintyWeight + interFrameRotationRadians * 0.05;
    }

    if (this.prevPose) {
      const velocity: [number, number, number] = [
        curPose[0] - this.prevPose[0],
        curPose[1] - this.prevPose[1],
        curPose[2] - this.prevPose[2],
      ];
      if (this.prevVelocity) {
        const predX = this.prevPose[0] + this.prevVelocity[0];
        const predY = this.prevPose[1] + this.prevVelocity[1];
        const predZ = this.prevPose[2] + this.prevVelocity[2];
        const rx = curPose[0] - predX;
        const ry = curPose[1] - predY;
        const rz = curPose[2] - predZ;
        this.cumulativeDriftMeters += Math.sqrt(rx * rx + ry * ry + rz * rz);
      }
      this.prevVelocity = velocity;
    }
    this.prevPose = curPose;
    this.prevCameraPose = cameraPose;

    // ── Loop closure: revisit of a prior keyframe position ──────────────────
    if (this.lastLoopClosureFrameIdx !== frame.index) {
      for (const kf of this.poseHistory) {
        if (frame.index - kf.frameIndex < HoloMapRuntimeImpl.LOOP_CLOSURE_MIN_GAP) continue;
        const dx = curPose[0] - kf.position[0];
        const dy = curPose[1] - kf.position[1];
        const dz = curPose[2] - kf.position[2];
        if (Math.sqrt(dx * dx + dy * dy + dz * dz) < HoloMapRuntimeImpl.LOOP_CLOSURE_RADIUS) {
          this.lastLoopClosureFrameIdx = frame.index;
          break;
        }
      }
    }
    this.poseHistory.push({
      frameIndex: frame.index,
      position: curPose,
      descriptor: loopDescriptor,
    });
    if (this.poseHistory.length > HoloMapRuntimeImpl.POSE_HISTORY_CAP) this.poseHistory.shift();

    // ── Scan-derived anchor ─────────────────────────────────────────────────
    // Anchor pose = centroid of EVERY observed point (sum/count). The centroid
    // moves whenever any point moves, so a single tampered point shifts the
    // anchor — unlike a bounds center, which only moves when an extremum moves.
    // Descriptor = observed-volume extent + GLOBAL mean confidence (also moves
    // with any point's confidence). Update bounds first so extent is current.
    this.updateBounds(positions);
    this.globalPosSum[0] += centroidX;
    this.globalPosSum[1] += centroidY;
    this.globalPosSum[2] += centroidZ;
    this.globalConfSum += confidenceSum;
    const totalPoints = this.totalPointCount + numPoints;
    const ginv = 1 / Math.max(1, totalPoints);
    const anchorCenter: [number, number, number] = [
      this.globalPosSum[0] * ginv,
      this.globalPosSum[1] * ginv,
      this.globalPosSum[2] * ginv,
    ];
    const globalMeanConfidence = this.globalConfSum * ginv;
    const b = this.getBounds();
    const extentX = b.max[0] - b.min[0];
    const extentY = b.max[1] - b.min[1];
    const extentZ = b.max[2] - b.min[2];
    const anchorRotation = HoloMapRuntimeImpl.estimatePrincipalAxisRotation(
      HoloMapRuntimeImpl.retainedPositionChunks(this.steps, positions),
      anchorCenter
    );
    const anchorDescriptor = new Float32Array([extentX, extentY, extentZ, globalMeanConfidence]);
    this.pushTrajectoryKeyframe({
      frameIndex: frame.index,
      timestampMs: frame.timestampMs,
      pose: cameraPose,
      embedding: HoloMapRuntimeImpl.buildTrajectoryEmbedding(
        cameraPose,
        anchorDescriptor,
        interFrameDeltaMeters,
        interFrameRotationRadians
      ),
    });
    const trajectoryKeyframes = HoloMapRuntimeImpl.cloneTrajectoryKeyframes(
      this.trajectoryKeyframes
    );

    const step: ReconstructionStep = {
      frame,
      pose: cameraPose,
      points: {
        positions,
        colors,
        confidence,
      },
      trajectory: {
        keyframes: trajectoryKeyframes,
        estimatedDriftMeters: this.cumulativeDriftMeters,
        lastLoopClosureFrame: this.lastLoopClosureFrameIdx,
        revision: frame.index + 1,
      },
      anchor: {
        anchorFrameIndex: trajectoryKeyframes[0]?.frameIndex ?? frame.index,
        anchorPose: {
          position: anchorCenter,
          rotation: anchorRotation,
          confidence: Math.max(0, Math.min(1, globalMeanConfidence)),
        },
        anchorDescriptor,
        revision: frame.index + 1,
      },
      ...(depthAlignment ? { depthAlignment } : {}),
    };

    this.steps.push({
      frameIndex: frame.index,
      points: {
        positions,
        confidence,
      },
    });
    this.totalPointCount += numPoints;

    // Sprint-3: performance metrics
    const stepMs = performance.now() - stepStartMs;
    this.perfMetrics.stepCount += 1;
    this.perfMetrics.totalStepMs += stepMs;
    if (stepMs > this.perfMetrics.maxStepMs) this.perfMetrics.maxStepMs = stepMs;
    if (stepMs < this.perfMetrics.minStepMs) this.perfMetrics.minStepMs = stepMs;

    logHoloMapEvent(this.runId, 'step', {
      frameIndex: frame.index,
      pointCount: numPoints,
      stepMs: Math.round(stepMs),
      avgStepMs: Math.round(this.perfMetrics.totalStepMs / this.perfMetrics.stepCount),
      throttledSoFar: this.perfMetrics.throttledCount,
    });
    return step;
  }

  async finalize(): Promise<ReconstructionManifest> {
    if (!this.initialized) {
      throw new Error('HoloMapRuntime not initialized. Call init(config) before finalize().');
    }

    const frameCount = this.steps.length;
    const pointCount = this.totalPointCount;
    const bounds = this.getBounds();

    // Sprint-3: include performance summary in finalize telemetry
    const avgStepMs =
      this.perfMetrics.stepCount > 0
        ? this.perfMetrics.totalStepMs / this.perfMetrics.stepCount
        : 0;
    logHoloMapEvent(this.runId, 'finalize', {
      frameCount,
      pointCount,
      avgStepMs: Math.round(avgStepMs),
      maxStepMs: Math.round(this.perfMetrics.maxStepMs),
      minStepMs: Math.round(this.perfMetrics.minStepMs),
      throttledCount: this.perfMetrics.throttledCount,
      sessionDurationMs: Math.round(performance.now() - this.sessionStartMs),
    });

    const manifest: ReconstructionManifest = {
      version: '1.0.0',
      worldId: `holomap-${this.replayKey}`,
      displayName: 'HoloMap Reconstruction',
      pointCount,
      frameCount,
      bounds,
      replayHash: this.replayKey,
      simulationContract: {
        kind: HOLOMAP_SIMULATION_CONTRACT_KIND,
        replayFingerprint: this.replayKey,
        holoScriptBuild: getVersionString(),
      },
      provenance: {
        anchorHash: `self-attested:${this.replayKey}`,
        capturedAtIso: new Date().toISOString(),
      },
      assets: {
        points: 'reconstruction.points.bin',
        trajectory: 'reconstruction.trajectory.json',
        anchors: 'reconstruction.anchors.json',
      },
      weightStrategy: this.config.weightStrategy ?? 'distill',
    };

    try {
      return await anchorReconstructionManifest(manifest, this.config.provenanceAnchorProvider);
    } catch (error) {
      logHoloMapEvent(this.runId, 'anchor_failed', {
        reason: error instanceof Error ? error.message : String(error),
      });
      return selfAttestReconstructionManifest(manifest);
    }
  }

  replayHash(): string {
    return this.replayKey;
  }

  async dispose(): Promise<void> {
    logHoloMapEvent(this.runId, 'dispose', {
      stepsRetained: this.steps.length,
      totalPointCount: this.totalPointCount,
      throttledCount: this.perfMetrics.throttledCount,
    });
    this.initialized = false;
    this.steps.length = 0;
    this.microEncoder = null;
    this.encoderDevice = null;
    this.weightBytes = null;
    this.totalPointCount = 0;
    this.cumulativeDriftMeters = 0;
    this.prevPose = null;
    this.prevCameraPose = null;
    this.prevVelocity = null;
    this.lastLoopClosureFrameIdx = -1;
    this.poseHistory.length = 0;
    this.trajectoryKeyframes.length = 0;
    this.globalPosSum = [0, 0, 0];
    this.globalConfSum = 0;
    this.boundsValid = false;
    this.lastAcceptedFrameTimestampMs = null;
    this.perfMetrics = {
      stepCount: 0,
      throttledCount: 0,
      totalStepMs: 0,
      maxStepMs: 0,
      minStepMs: Infinity,
    };
  }
}

export function createHoloMapRuntime(_config?: Partial<HoloMapConfig>): HoloMapRuntime {
  const runtime = new HoloMapRuntimeImpl();
  if (_config) {
    void runtime.init({ ...HOLOMAP_DEFAULTS, ..._config });
  }
  return runtime;
}
