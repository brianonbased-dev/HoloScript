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
import type { TrajectoryMemoryState } from './TrajectoryMemory';
import {
  createHoloMapMicroEncoder,
  runHoloMapMicroEncoderCpu,
  tryCreateHoloMapEncoderDevice,
  type HoloMapMicroEncoder,
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
  /** Optional content-addressed weights reference (changes replay fingerprint when set) */
  weightCid?: string;
  /** URL for weight blob fetch (pair with weightCid for digest verify). See RFC §5.1. */
  weightUrl?: string;
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
}

export const HOLOMAP_DEFAULTS: HoloMapConfig = {
  inputResolution: { width: 518, height: 378 },
  targetFPS: 15,
  maxSequenceLength: 10_000,
  seed: 0,
  modelHash: 'unset',
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

  async init(config: HoloMapConfig): Promise<void> {
    this.config = { ...config };
    const allowCpu = this.config.allowCpuFallback !== false;
    if (!allowCpu && !isWebGpuEnvironmentPresent()) {
      const err =
        'HoloMap: native reconstruction requires WebGPU (allowCpuFallback=false). ' +
        'Run in a WebGPU-capable browser, or set allowCpuFallback=true for CPU fallback, ' +
        'or use compatibility scene ingest (Marble) for headless benchmarks.';
      logHoloMapEvent(this.runId, 'error', { message: err });
      throw new Error(err);
    }
    this.steps.length = 0;
    this.replayKey = computeHoloMapReplayFingerprint({
      modelHash: this.config.modelHash,
      seed: this.config.seed,
      weightStrategy: this.config.weightStrategy ?? 'distill',
      videoHash: this.config.videoHash,
      weightCid: this.config.weightCid,
      verticalProfile: this.config.verticalProfile,
    });
    this.weightBytes = null;
    if (this.config.weightUrl) {
      this.weightBytes = await loadHoloMapWeightBlob({
        weightUrl: this.config.weightUrl,
        weightCid: this.config.weightCid,
      });
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
      weightLoadedBytes: this.weightBytes?.byteLength ?? 0,
      replayFingerprint: this.replayKey,
    });
  }

  /**
   * Number of tiles per axis used to fan the encoder across the frame.
   * Total points emitted = HOLOMAP_GRID_N * HOLOMAP_GRID_N (one per tile).
   * Each tile runs the full 8-kernel transformer chain via the micro encoder
   * (imagePatchEmbed → layerNorm → gemm Q/K/V → rope → fusedMHA →
   * layerNorm → gelu → gemm xyz). pagedKV append/lookup remains available
   * for future streaming kLen>1 paths.
   */
  private static readonly GRID_N = 4;

  /**
   * Carve `frame` into GRID_N×GRID_N tiles. Each tile carries its own
   * (rgb, width, height, stride, index) and the mean RGB color over its
   * pixels (used to color the corresponding output point).
   *
   * Tiles inherit `frame.index` shifted by tile id so micro-encoder
   * per-frame seeds remain deterministic and distinct across tiles.
   */
  private static tileFrame(
    frame: ReconstructionFrame,
    gridN: number,
  ): Array<{ tile: HoloMapMicroFrame; meanColor: [number, number, number] }> {
    const out: Array<{ tile: HoloMapMicroFrame; meanColor: [number, number, number] }> = [];
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
            count += 1;
          }
        }
        const denom = Math.max(1, count);
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

  async step(frame: ReconstructionFrame): Promise<ReconstructionStep> {
    if (!this.initialized) {
      throw new Error('HoloMapRuntime not initialized. Call init(config) before step(frame).');
    }

    const expectedBytes = frame.width * frame.height * frame.stride;
    if (frame.rgb.byteLength !== expectedBytes) {
      throw new Error(
        `HoloMapRuntime.step invalid frame byte length: got ${frame.rgb.byteLength}, expected ${expectedBytes} (w=${frame.width}, h=${frame.height}, stride=${frame.stride})`
      );
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
    const gridN = Math.max(1, Math.min(HoloMapRuntimeImpl.GRID_N, frame.width, frame.height));
    const tiles = HoloMapRuntimeImpl.tileFrame(frame, gridN);
    const numPoints = tiles.length;

    const positions = new Float32Array(numPoints * 3);
    const colors = new Uint8Array(numPoints * 3);
    const confidence = new Float32Array(numPoints);

    let centroidX = 0;
    let centroidY = 0;
    let centroidZ = 0;

    for (let t = 0; t < numPoints; t += 1) {
      const { tile, meanColor } = tiles[t]!;
      const xyz = this.microEncoder
        ? await this.microEncoder.run(tile, microCfg)
        : await runHoloMapMicroEncoderCpu(tile, microCfg);

      const px = xyz[0] ?? 0;
      const py = xyz[1] ?? 0;
      const pz = xyz[2] ?? 0;

      positions[t * 3] = px;
      positions[t * 3 + 1] = py;
      positions[t * 3 + 2] = pz;
      colors[t * 3] = meanColor[0];
      colors[t * 3 + 1] = meanColor[1];
      colors[t * 3 + 2] = meanColor[2];
      // Per-tile confidence: bounded function of magnitude. The xyz vector
      // is the output of a normalised transformer pass with small init scale,
      // so |xyz| stays small. Map to (0.5, 1.0).
      const mag = Math.sqrt(px * px + py * py + pz * pz);
      confidence[t] = 0.5 + 0.5 / (1 + mag);

      centroidX += px;
      centroidY += py;
      centroidZ += pz;
    }

    const inv = 1 / Math.max(1, numPoints);
    const poseX = centroidX * inv;
    const poseY = centroidY * inv;
    const poseZ = centroidZ * inv;

    const step: ReconstructionStep = {
      frame,
      pose: {
        position: [poseX, poseY, poseZ],
        rotation: [0, 0, 0, 1],
        confidence: 0.8,
      },
      points: {
        positions,
        colors,
        confidence,
      },
      trajectory: {
        keyframes: [],
        estimatedDriftMeters: 0,
        lastLoopClosureFrame: -1,
        revision: frame.index + 1,
      },
      anchor: {
        anchorFrameIndex: 0,
        anchorPose: {
          position: [0, 0, 0],
          rotation: [0, 0, 0, 1],
          confidence: 1,
        },
        anchorDescriptor: new Float32Array([1, 0, 0, 1]),
        revision: frame.index + 1,
      },
    };

    this.steps.push(step);
    logHoloMapEvent(this.runId, 'step', {
      frameIndex: frame.index,
      pointCount: step.points.positions.length / 3,
    });
    return step;
  }

  async finalize(): Promise<ReconstructionManifest> {
    if (!this.initialized) {
      throw new Error('HoloMapRuntime not initialized. Call init(config) before finalize().');
    }

    const frameCount = this.steps.length;
    const pointCount = this.steps.reduce((acc, s) => acc + s.points.positions.length / 3, 0);
    const bounds = HoloMapRuntimeImpl.computeBounds(this.steps);

    logHoloMapEvent(this.runId, 'finalize', { frameCount, pointCount });

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
    logHoloMapEvent(this.runId, 'dispose', { stepsRetained: this.steps.length });
    this.initialized = false;
    this.steps.length = 0;
    this.microEncoder = null;
    this.encoderDevice = null;
    this.weightBytes = null;
  }
}

export function createHoloMapRuntime(_config?: Partial<HoloMapConfig>): HoloMapRuntime {
  const runtime = new HoloMapRuntimeImpl();
  if (_config) {
    void runtime.init({ ...HOLOMAP_DEFAULTS, ..._config });
  }
  return runtime;
}
