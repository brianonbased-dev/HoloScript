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

type Vec3 = [number, number, number];

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

class HoloMapRuntimeImpl implements HoloMapRuntime {
  private config: HoloMapConfig = { ...HOLOMAP_DEFAULTS };
  private initialized = false;
  private readonly steps: ReconstructionStep[] = [];
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
  /** Session-lifetime translation drift, independent of retained step eviction. */
  private accumulatedDriftMeters = 0;
  private previousDriftPose: CameraPose | null = null;
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

  private static computeBounds(steps: ReconstructionStep[]): {
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

  private static estimatePoseFromPositionSets(
    positionSets: readonly Float32Array[],
    confidence: number
  ): CameraPose {
    let count = 0;
    let sumX = 0;
    let sumY = 0;
    let sumZ = 0;

    for (const positions of positionSets) {
      for (let i = 0; i < positions.length; i += 3) {
        sumX += positions[i] ?? 0;
        sumY += positions[i + 1] ?? 0;
        sumZ += positions[i + 2] ?? 0;
        count += 1;
      }
    }

    if (count === 0) {
      return {
        position: [0, 0, 0],
        rotation: [0, 0, 0, 1],
        confidence: 0,
      };
    }

    const inv = 1 / count;
    const centroid: Vec3 = [sumX * inv, sumY * inv, sumZ * inv];
    let cxx = 0;
    let cxy = 0;
    let cxz = 0;
    let cyy = 0;
    let cyz = 0;
    let czz = 0;

    for (const positions of positionSets) {
      for (let i = 0; i < positions.length; i += 3) {
        const dx = (positions[i] ?? 0) - centroid[0];
        const dy = (positions[i + 1] ?? 0) - centroid[1];
        const dz = (positions[i + 2] ?? 0) - centroid[2];
        cxx += dx * dx;
        cxy += dx * dy;
        cxz += dx * dz;
        cyy += dy * dy;
        cyz += dy * dz;
        czz += dz * dz;
      }
    }

    const primary = HoloMapRuntimeImpl.dominantAxisFromCovariance([
      cxx * inv,
      cxy * inv,
      cxz * inv,
      cyy * inv,
      cyz * inv,
      czz * inv,
    ]);
    const referenceUp: Vec3 =
      Math.abs(HoloMapRuntimeImpl.dot(primary, [0, 1, 0])) > 0.92
        ? [0, 0, 1]
        : [0, 1, 0];
    const tertiary = HoloMapRuntimeImpl.normalize(
      HoloMapRuntimeImpl.cross(primary, referenceUp),
      [0, 0, 1]
    );
    const secondary = HoloMapRuntimeImpl.normalize(
      HoloMapRuntimeImpl.cross(tertiary, primary),
      [0, 1, 0]
    );

    return {
      position: centroid,
      rotation: HoloMapRuntimeImpl.quaternionFromBasis(primary, secondary, tertiary),
      confidence: Math.max(0, Math.min(1, confidence)),
    };
  }

  private static dominantAxisFromCovariance(cov: [number, number, number, number, number, number]): Vec3 {
    const [cxx, cxy, cxz, cyy, cyz, czz] = cov;
    let v: Vec3 = HoloMapRuntimeImpl.normalize([1, 0.37, 0.19], [1, 0, 0]);

    for (let i = 0; i < 10; i += 1) {
      v = HoloMapRuntimeImpl.normalize(
        [
          cxx * v[0] + cxy * v[1] + cxz * v[2],
          cxy * v[0] + cyy * v[1] + cyz * v[2],
          cxz * v[0] + cyz * v[1] + czz * v[2],
        ],
        [1, 0, 0]
      );
    }

    const dominantIndex =
      Math.abs(v[0]) >= Math.abs(v[1]) && Math.abs(v[0]) >= Math.abs(v[2])
        ? 0
        : Math.abs(v[1]) >= Math.abs(v[2])
          ? 1
          : 2;
    return v[dominantIndex] < 0 ? [-v[0], -v[1], -v[2]] : v;
  }

  private static dot(a: Vec3, b: Vec3): number {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  }

  private static cross(a: Vec3, b: Vec3): Vec3 {
    return [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0],
    ];
  }

  private static normalize(v: Vec3, fallback: Vec3): Vec3 {
    const len = Math.hypot(v[0], v[1], v[2]);
    if (!Number.isFinite(len) || len < 1e-9) return fallback;
    return [v[0] / len, v[1] / len, v[2] / len];
  }

  private static quaternionFromBasis(xAxis: Vec3, yAxis: Vec3, zAxis: Vec3): [number, number, number, number] {
    const m00 = xAxis[0];
    const m01 = yAxis[0];
    const m02 = zAxis[0];
    const m10 = xAxis[1];
    const m11 = yAxis[1];
    const m12 = zAxis[1];
    const m20 = xAxis[2];
    const m21 = yAxis[2];
    const m22 = zAxis[2];
    const trace = m00 + m11 + m22;
    let q: [number, number, number, number];

    if (trace > 0) {
      const s = Math.sqrt(trace + 1) * 2;
      q = [(m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, 0.25 * s];
    } else if (m00 > m11 && m00 > m22) {
      const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
      q = [0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s];
    } else if (m11 > m22) {
      const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
      q = [(m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s];
    } else {
      const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
      q = [(m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s];
    }

    const normalized = HoloMapRuntimeImpl.normalizeQuaternion(q);
    return normalized[3] < 0
      ? [-normalized[0], -normalized[1], -normalized[2], -normalized[3]]
      : normalized;
  }

  private static normalizeQuaternion(q: [number, number, number, number]): [number, number, number, number] {
    const len = Math.hypot(q[0], q[1], q[2], q[3]);
    if (!Number.isFinite(len) || len < 1e-9) return [0, 0, 0, 1];
    return [q[0] / len, q[1] / len, q[2] / len, q[3] / len];
  }

  private static copyPose(pose: CameraPose): CameraPose {
    return {
      position: [pose.position[0], pose.position[1], pose.position[2]],
      rotation: [pose.rotation[0], pose.rotation[1], pose.rotation[2], pose.rotation[3]],
      confidence: pose.confidence,
    };
  }

  private static computeBoundsFromPositionSets(positionSets: readonly Float32Array[]): {
    min: [number, number, number];
    max: [number, number, number];
  } {
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let minZ = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    let maxZ = Number.NEGATIVE_INFINITY;

    for (const positions of positionSets) {
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
      return { min: [0, 0, 0], max: [0, 0, 0] };
    }
    return { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] };
  }

  private static buildTrajectoryEmbedding(pose: CameraPose, positions: Float32Array): Float32Array {
    const bounds = HoloMapRuntimeImpl.computeBoundsFromPositionSets([positions]);
    return new Float32Array([
      ...pose.position,
      ...pose.rotation,
      pose.confidence,
      bounds.max[0] - bounds.min[0],
      bounds.max[1] - bounds.min[1],
      bounds.max[2] - bounds.min[2],
    ]);
  }

  private static poseDeltaMeters(previous: CameraPose | null, next: CameraPose): number {
    if (!previous) return 0;
    return Math.hypot(
      next.position[0] - previous.position[0],
      next.position[1] - previous.position[1],
      next.position[2] - previous.position[2]
    );
  }

  /** Update running bounds with new point positions. */
  private updateBounds(positions: Float32Array): void {
    if (positions.length === 0) return;
    if (!this.boundsValid) {
      this.boundsMin = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
      this.boundsMax = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
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
    this.accumulatedDriftMeters = 0;
    this.previousDriftPose = null;
    this.boundsValid = false;
    this.boundsMin = [0, 0, 0];
    this.boundsMax = [0, 0, 0];
    this.lastAcceptedFrameTimestampMs = null;
    this.sessionStartMs = performance.now();
    this.perfMetrics = { stepCount: 0, throttledCount: 0, totalStepMs: 0, maxStepMs: 0, minStepMs: Infinity };

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
  private static tileFrame(
    frame: ReconstructionFrame,
    gridN: number,
  ): HoloMapTileSample[] {
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
          meanColor: [
            Math.round(rSum / denom),
            Math.round(gSum / denom),
            Math.round(bSum / denom),
          ],
        });
      }
    }
    return out;
  }

  private async encodeTile(tile: HoloMapMicroFrame, microCfg: HoloMapMicroConfig): Promise<Float32Array> {
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
      // Recompute bounds from all remaining retained steps so the subsequent
      // updateBounds(positions) call starts from the correct baseline rather
      // than reinitializing to ±Infinity from just the incoming frame.
      // (Without this, bounds after eviction reflected only the newest frame.)
      this.boundsValid = false;
      for (const s of this.steps) {
        this.updateBounds(s.points.positions);
      }
      logHoloMapEvent(this.runId, 'step_evict', {
        frameIndex: evicted.frame.index,
        evictedPoints,
        retainedSteps: this.steps.length,
      });
    }

    const microCfg = { seed: this.config.seed, modelHash: this.config.modelHash };

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

    for (let t = 0; t < numPoints; t += 1) {
      const { tile, meanColor, centerUv, luminance, texture } = tiles[t]!;
      const xyz = await this.encodeTile(tile, microCfg);

      const latentX = xyz[0] ?? 0;
      const latentY = xyz[1] ?? 0;
      const latentZ = xyz[2] ?? 0;
      const planeX = (centerUv[0] - 0.5) * 2 * aspect;
      const planeY = (0.5 - centerUv[1]) * 2;
      const depthHint = (luminance - 0.5) * 0.34 + texture * 0.24;
      const px = planeX + latentX * 0.08;
      const py = planeY + latentY * 0.08;
      const pz = depthHint + latentZ * 0.12;

      positions[t * 3] = px;
      positions[t * 3 + 1] = py;
      positions[t * 3 + 2] = pz;
      colors[t * 3] = meanColor[0];
      colors[t * 3 + 1] = meanColor[1];
      colors[t * 3 + 2] = meanColor[2];
      const latentMag = Math.sqrt(latentX * latentX + latentY * latentY + latentZ * latentZ);
      confidence[t] = Math.min(1, 0.45 + 0.35 / (1 + latentMag) + Math.min(0.2, texture * 1.5));
    }

    const pose = HoloMapRuntimeImpl.estimatePoseFromPositionSets([positions], 0.8);
    this.accumulatedDriftMeters += HoloMapRuntimeImpl.poseDeltaMeters(this.previousDriftPose, pose);
    this.previousDriftPose = HoloMapRuntimeImpl.copyPose(pose);
    const keyframes: TrajectoryKeyframe[] = this.steps.map((s) => ({
      frameIndex: s.frame.index,
      timestampMs: s.frame.timestampMs,
      pose: HoloMapRuntimeImpl.copyPose(s.pose),
      embedding: HoloMapRuntimeImpl.buildTrajectoryEmbedding(s.pose, s.points.positions),
    }));
    keyframes.push({
      frameIndex: frame.index,
      timestampMs: frame.timestampMs,
      pose: HoloMapRuntimeImpl.copyPose(pose),
      embedding: HoloMapRuntimeImpl.buildTrajectoryEmbedding(pose, positions),
    });
    const estimatedDriftMeters = this.accumulatedDriftMeters;
    const anchorPose = HoloMapRuntimeImpl.estimatePoseFromPositionSets(
      [...this.steps.map((s) => s.points.positions), positions],
      Math.min(1, 0.75 + keyframes.length * 0.02)
    );

    const step: ReconstructionStep = {
      frame,
      pose,
      points: {
        positions,
        colors,
        confidence,
      },
      trajectory: {
        keyframes,
        estimatedDriftMeters,
        lastLoopClosureFrame: -1,
        revision: frame.index + 1,
      },
      anchor: {
        anchorFrameIndex: this.steps[0]?.frame.index ?? frame.index,
        anchorPose,
        anchorDescriptor: new Float32Array([
          ...anchorPose.position,
          ...anchorPose.rotation,
          anchorPose.confidence,
          this.totalPointCount + numPoints,
          estimatedDriftMeters,
        ]),
        revision: frame.index + 1,
      },
    };

    this.steps.push(step);
    this.totalPointCount += numPoints;
    this.updateBounds(positions);

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

    return {
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
    this.boundsValid = false;
    this.lastAcceptedFrameTimestampMs = null;
    this.perfMetrics = { stepCount: 0, throttledCount: 0, totalStepMs: 0, maxStepMs: 0, minStepMs: Infinity };
  }
}

export function createHoloMapRuntime(_config?: Partial<HoloMapConfig>): HoloMapRuntime {
  const runtime = new HoloMapRuntimeImpl();
  if (_config) {
    void runtime.init({ ...HOLOMAP_DEFAULTS, ..._config });
  }
  return runtime;
}
