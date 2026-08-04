/**
 * Native WebGPU temporal convergence primitives.
 *
 * This module deliberately separates three concerns:
 * - deterministic camera jitter and history admission;
 * - explicit invalidation for camera motion and LOD changes;
 * - resident-motion admission only when matching motion vectors are available;
 * - motion-reprojected, depth-rejected, neighborhood-clamped WebGPU resolve.
 */

import type { PixelGrid } from '../../native-render/gpu-verify';
import type { Mat4 } from '../../character-render/skin-math';
import type {
  DepthGrid,
  MotionVectorGrid,
  ReactiveMaskGrid,
} from './TemporalInputs';

const BUFFER_COPY_DST = 0x0008;
const BUFFER_MAP_READ = 0x0001;
const BUFFER_UNIFORM = 0x0040;
const MAP_READ = 0x0001;
const TEXTURE_COPY_SRC = 0x01;
const TEXTURE_COPY_DST = 0x02;
const TEXTURE_BINDING = 0x04;
const TEXTURE_STORAGE_BINDING = 0x08;

export type TemporalInvalidationReason =
  | 'initial'
  | 'camera-motion'
  | 'resident-motion'
  | 'lod-change'
  | 'manual';

export interface TemporalConvergenceConfig {
  /** Number of jittered stable frames required for an admitted convergence window. */
  sampleCount: number;
  /** Maximum history contribution after the convergence window fills. */
  feedbackCeiling: number;
  /** Halton jitter amplitude in pixels. */
  jitterScalePixels: number;
}

export const TEMPORAL_CONVERGENCE_PROFILES = {
  'browser-balanced': {
    sampleCount: 8,
    feedbackCeiling: 0.875,
    jitterScalePixels: 0.5,
  },
  'quest-90hz-budget': {
    sampleCount: 4,
    feedbackCeiling: 0.75,
    jitterScalePixels: 0.42,
  },
} as const satisfies Record<string, TemporalConvergenceConfig>;

export type TemporalConvergenceProfile = keyof typeof TEMPORAL_CONVERGENCE_PROFILES;

export interface TemporalFrameSignals {
  /** Stable caller-owned identity for the camera transform used by this frame. */
  cameraStateId: string;
  /** Stable caller-owned identity for pose / resident transform state. */
  residentStateId: string;
  lodLevel: number;
  /** True only when this frame will provide matching current-to-previous velocity. */
  motionVectorsAvailable?: boolean;
  forceReset?: boolean;
}

export interface TemporalFramePlan {
  schemaVersion: 'holoscript.temporal-frame-plan.v1';
  frameIndex: number;
  historyGeneration: number;
  invalidated: boolean;
  invalidationReason: TemporalInvalidationReason | null;
  historyValid: boolean;
  sampleIndex: number;
  stableFrameCount: number;
  converged: boolean;
  feedback: number;
  jitterPixels: [number, number];
}

export interface TemporalConvergenceReceipt {
  schemaVersion: 'holoscript.temporal-convergence.v2';
  config: TemporalConvergenceConfig;
  frameCount: number;
  historyGeneration: number;
  invalidationCounts: Record<TemporalInvalidationReason, number>;
  stableFrameCount: number;
  converged: boolean;
  motionVectorResidentFramesAdmitted: number;
  reactiveMaskConsumed: false;
  requiredHistoryPolicy: 'reproject-resident-motion-invalidate-camera-or-lod-v2';
}

function validateConfig(config: TemporalConvergenceConfig): TemporalConvergenceConfig {
  const sampleCount = Math.trunc(config.sampleCount);
  if (sampleCount < 2 || sampleCount > 64) {
    throw new RangeError('temporal sampleCount must be an integer in [2, 64]');
  }
  if (
    !Number.isFinite(config.feedbackCeiling) ||
    config.feedbackCeiling < 0 ||
    config.feedbackCeiling >= 1
  ) {
    throw new RangeError('temporal feedbackCeiling must be in [0, 1)');
  }
  if (
    !Number.isFinite(config.jitterScalePixels) ||
    config.jitterScalePixels < 0 ||
    config.jitterScalePixels > 2
  ) {
    throw new RangeError('temporal jitterScalePixels must be in [0, 2]');
  }
  return {
    sampleCount,
    feedbackCeiling: config.feedbackCeiling,
    jitterScalePixels: config.jitterScalePixels,
  };
}

function halton(index: number, base: number): number {
  let result = 0;
  let fraction = 1 / base;
  let value = index;
  while (value > 0) {
    result += fraction * (value % base);
    value = Math.floor(value / base);
    fraction /= base;
  }
  return result;
}

/** Deterministic centred base-2/base-3 Halton jitter. */
export function temporalHaltonJitter(
  sampleIndex: number,
  scalePixels = 0.5
): [number, number] {
  const index = Math.max(0, Math.trunc(sampleIndex)) + 1;
  return [
    (halton(index, 2) - 0.5) * scalePixels,
    (halton(index, 3) - 0.5) * scalePixels,
  ];
}

/**
 * Return a jittered copy of a column-major projection/view-projection matrix.
 * The input matrix is never mutated.
 */
export function jitterProjectionMatrix(
  matrix: Mat4,
  jitterPixels: readonly [number, number],
  viewportWidth: number,
  viewportHeight: number
): Mat4 {
  if (viewportWidth <= 0 || viewportHeight <= 0) {
    throw new RangeError('temporal jitter viewport dimensions must be positive');
  }
  const jittered = new Float32Array(matrix) as Mat4;
  jittered[12] += (jitterPixels[0] * 2) / viewportWidth;
  jittered[13] += (jitterPixels[1] * 2) / viewportHeight;
  return jittered;
}

/**
 * Deterministic history controller. The caller supplies stable state ids rather
 * than relying on wall-clock thresholds or approximate matrix comparisons.
 */
export class TemporalConvergenceController {
  private readonly config: TemporalConvergenceConfig;
  private frameCount = 0;
  private historyGeneration = 0;
  private stableFrameCount = 0;
  private motionVectorResidentFramesAdmitted = 0;
  private previous: TemporalFrameSignals | null = null;
  private readonly invalidationCounts: Record<TemporalInvalidationReason, number> = {
    initial: 0,
    'camera-motion': 0,
    'resident-motion': 0,
    'lod-change': 0,
    manual: 0,
  };

  constructor(config: TemporalConvergenceConfig) {
    this.config = validateConfig(config);
  }

  static fromProfile(profile: TemporalConvergenceProfile): TemporalConvergenceController {
    return new TemporalConvergenceController(TEMPORAL_CONVERGENCE_PROFILES[profile]);
  }

  beginFrame(signals: TemporalFrameSignals): TemporalFramePlan {
    if (!signals.cameraStateId || !signals.residentStateId) {
      throw new Error('temporal frame signals require cameraStateId and residentStateId');
    }
    if (!Number.isInteger(signals.lodLevel) || signals.lodLevel < 0) {
      throw new RangeError('temporal lodLevel must be a non-negative integer');
    }

    let reason: TemporalInvalidationReason | null = null;
    if (!this.previous) reason = 'initial';
    else if (signals.forceReset) reason = 'manual';
    else if (signals.lodLevel !== this.previous.lodLevel) reason = 'lod-change';
    else if (signals.cameraStateId !== this.previous.cameraStateId) reason = 'camera-motion';
    else if (signals.residentStateId !== this.previous.residentStateId) {
      if (signals.motionVectorsAvailable) this.motionVectorResidentFramesAdmitted += 1;
      else reason = 'resident-motion';
    }

    const invalidated = reason !== null;
    if (reason !== null) {
      this.historyGeneration += 1;
      this.stableFrameCount = 0;
      this.invalidationCounts[reason] += 1;
    }

    const sampleIndex = this.stableFrameCount % this.config.sampleCount;
    const feedback = invalidated
      ? 0
      : Math.min(
          this.config.feedbackCeiling,
          this.stableFrameCount / (this.stableFrameCount + 1)
        );
    this.stableFrameCount += 1;
    this.frameCount += 1;
    this.previous = { ...signals, forceReset: false };

    return {
      schemaVersion: 'holoscript.temporal-frame-plan.v1',
      frameIndex: this.frameCount - 1,
      historyGeneration: this.historyGeneration,
      invalidated,
      invalidationReason: reason,
      historyValid: !invalidated,
      sampleIndex,
      stableFrameCount: this.stableFrameCount,
      converged: this.stableFrameCount >= this.config.sampleCount,
      feedback,
      jitterPixels: temporalHaltonJitter(sampleIndex, this.config.jitterScalePixels),
    };
  }

  getReceipt(): TemporalConvergenceReceipt {
    return {
      schemaVersion: 'holoscript.temporal-convergence.v2',
      config: { ...this.config },
      frameCount: this.frameCount,
      historyGeneration: this.historyGeneration,
      invalidationCounts: { ...this.invalidationCounts },
      stableFrameCount: this.stableFrameCount,
      converged: this.stableFrameCount >= this.config.sampleCount,
      motionVectorResidentFramesAdmitted: this.motionVectorResidentFramesAdmitted,
      reactiveMaskConsumed: false,
      requiredHistoryPolicy: 'reproject-resident-motion-invalidate-camera-or-lod-v2',
    };
  }
}

export interface TemporalResolveOptions {
  feedback: number;
  historyValid: boolean;
  /** Current-minus-previous motion in pixel units. */
  motionVectors?: MotionVectorGrid;
  currentDepth?: DepthGrid;
  historyDepth?: DepthGrid;
  reactiveMask?: ReactiveMaskGrid;
  /** Absolute NDC-depth delta above which history is rejected. Default 0.01. */
  disocclusionDepthThreshold?: number;
}

export interface TemporalResolveReceipt {
  schemaVersion: 'holoscript.webgpu-temporal-resolve.v2';
  backend: 'webgpu';
  deviceExecutionMeasured: true;
  width: number;
  height: number;
  feedback: number;
  historyValid: boolean;
  neighborhoodClamping: true;
  motionVectorsConsumed: boolean;
  motionVectorSpace: 'current-minus-previous-pixels' | 'none';
  reactiveMaskConsumed: boolean;
  disocclusionInputConsumed: boolean;
  disocclusionDepthThreshold: number;
  outOfBoundsHistoryPixelCount: number;
  disocclusionRejectedPixelCount: number;
  fullyReactivePixelCount: number;
  gpuTimestampMeasured: false;
  timingClassification: 'not-measured';
  workgroupSize: [8, 8, 1];
  dispatch: [number, number, 1];
}

export interface TemporalResolveResult {
  pixels: PixelGrid;
  receipt: TemporalResolveReceipt;
}

/**
 * GPU-resident inputs for a temporal resolve pass. Every texture stays owned
 * by the caller; the encoder never maps or reads back an intermediate frame.
 */
export interface TemporalTextureResolveInputs {
  currentColor: GPUTexture;
  historyColor: GPUTexture;
  motionVectors: GPUTexture;
  currentDepth: GPUTexture;
  historyDepth: GPUTexture;
  reactiveMask: GPUTexture;
}

export interface TemporalTextureResolveOptions {
  width: number;
  height: number;
  feedback: number;
  historyValid: boolean;
  motionVectorsAvailable: boolean;
  depthHistoryAvailable: boolean;
  reactiveMaskAvailable: boolean;
  /** Absolute NDC-depth delta above which history is rejected. Default 0.01. */
  disocclusionDepthThreshold?: number;
  /** Optional pass timestamps supplied by a caller-owned query set. */
  timestampWrites?: GPUComputePassTimestampWrites;
  /** Persistent pipeline supplied by a frame graph to avoid per-frame compilation. */
  pipeline?: GPUComputePipeline;
  /** Optional persistent target. When omitted the caller must destroy the returned target. */
  outputTexture?: GPUTexture;
}

export interface TemporalTextureResolveReceipt {
  schemaVersion: 'holoscript.webgpu-temporal-texture-resolve.v1';
  backend: 'webgpu';
  width: number;
  height: number;
  feedback: number;
  historyValid: boolean;
  neighborhoodClamping: true;
  motionVectorsConsumed: boolean;
  reactiveMaskConsumed: boolean;
  disocclusionInputConsumed: boolean;
  disocclusionDepthThreshold: number;
  zeroCopyTextureInputs: true;
  intermediateCpuReadbackCount: 0;
  gpuTimestampWritesEncoded: boolean;
  persistentPipelineConsumed: boolean;
  timingClassification: 'caller-query-set' | 'not-requested';
  workgroupSize: [8, 8, 1];
  dispatch: [number, number, 1];
}

export interface EncodedTemporalTextureResolve {
  outputTexture: GPUTexture;
  outputTextureOwnedByCaller: boolean;
  receipt: TemporalTextureResolveReceipt;
  /** Release the uniform buffer and an internally-created output texture. */
  destroy(): void;
}

function assertPixelGrid(grid: PixelGrid, label: string): void {
  if (!Number.isInteger(grid.width) || !Number.isInteger(grid.height)) {
    throw new RangeError(`${label} dimensions must be integers`);
  }
  if (grid.width <= 0 || grid.height <= 0) {
    throw new RangeError(`${label} dimensions must be positive`);
  }
  if (grid.data.byteLength !== grid.width * grid.height * 4) {
    throw new RangeError(`${label} RGBA byte length does not match its dimensions`);
  }
}

function assertFloatGrid(
  grid: MotionVectorGrid | DepthGrid | ReactiveMaskGrid,
  label: string,
  components: number,
  width: number,
  height: number
): void {
  if (grid.width !== width || grid.height !== height) {
    throw new RangeError(`${label} dimensions must match the current frame`);
  }
  if (grid.data.length !== width * height * components) {
    throw new RangeError(`${label} float length does not match its dimensions`);
  }
}

function alignedBytesPerRow(width: number, bytesPerPixel: number): number {
  return Math.ceil((width * bytesPerPixel) / 256) * 256;
}

function createRgba8Texture(device: GPUDevice, grid: PixelGrid): GPUTexture {
  const texture = device.createTexture({
    size: [grid.width, grid.height],
    format: 'rgba8unorm',
    usage: TEXTURE_COPY_DST | TEXTURE_BINDING,
  });
  const bytesPerRow = alignedBytesPerRow(grid.width, 4);
  const upload = new Uint8Array(bytesPerRow * grid.height);
  for (let row = 0; row < grid.height; row += 1) {
    upload.set(
      grid.data.subarray(row * grid.width * 4, (row + 1) * grid.width * 4),
      row * bytesPerRow
    );
  }
  device.queue.writeTexture(
    { texture },
    upload,
    { bytesPerRow, rowsPerImage: grid.height },
    [grid.width, grid.height]
  );
  return texture;
}

function createFloatTexture(
  device: GPUDevice,
  width: number,
  height: number,
  format: 'rgba32float' | 'r32float',
  components: 1 | 4,
  data: Float32Array
): GPUTexture {
  const texture = device.createTexture({
    size: [width, height],
    format,
    usage: TEXTURE_COPY_DST | TEXTURE_BINDING,
  });
  const bytesPerPixel = components * 4;
  const bytesPerRow = alignedBytesPerRow(width, bytesPerPixel);
  const floatsPerRow = bytesPerRow / 4;
  const upload = new Float32Array(floatsPerRow * height);
  for (let row = 0; row < height; row += 1) {
    upload.set(
      data.subarray(row * width * components, (row + 1) * width * components),
      row * floatsPerRow
    );
  }
  device.queue.writeTexture(
    { texture },
    upload,
    { bytesPerRow, rowsPerImage: height },
    [width, height]
  );
  return texture;
}

function expandMotionVectors(
  motionVectors: MotionVectorGrid | undefined,
  width: number,
  height: number
): Float32Array<ArrayBuffer> {
  const expanded = new Float32Array(width * height * 4);
  if (!motionVectors) return expanded;
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    expanded[pixel * 4] = motionVectors.data[pixel * 2];
    expanded[pixel * 4 + 1] = motionVectors.data[pixel * 2 + 1];
  }
  return expanded;
}

function analyzeHistoryRejection(
  width: number,
  height: number,
  historyValid: boolean,
  motionVectors: MotionVectorGrid | undefined,
  currentDepth: DepthGrid | undefined,
  historyDepth: DepthGrid | undefined,
  reactiveMask: ReactiveMaskGrid | undefined,
  depthThreshold: number
): {
  outOfBoundsHistoryPixelCount: number;
  disocclusionRejectedPixelCount: number;
  fullyReactivePixelCount: number;
} {
  let outOfBoundsHistoryPixelCount = 0;
  let disocclusionRejectedPixelCount = 0;
  let fullyReactivePixelCount = 0;
  if (!historyValid) {
    return {
      outOfBoundsHistoryPixelCount,
      disocclusionRejectedPixelCount,
      fullyReactivePixelCount,
    };
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x;
      const motionX = motionVectors?.data[pixel * 2] ?? 0;
      const motionY = motionVectors?.data[pixel * 2 + 1] ?? 0;
      const previousX = Math.round(x - motionX);
      const previousY = Math.round(y - motionY);
      if (previousX < 0 || previousY < 0 || previousX >= width || previousY >= height) {
        outOfBoundsHistoryPixelCount += 1;
        continue;
      }
      if (
        currentDepth &&
        historyDepth &&
        Math.abs(
          currentDepth.data[pixel] -
            historyDepth.data[previousY * width + previousX]
        ) > depthThreshold
      ) {
        disocclusionRejectedPixelCount += 1;
      }
      if ((reactiveMask?.data[pixel] ?? 0) >= 0.999999) fullyReactivePixelCount += 1;
    }
  }
  return {
    outOfBoundsHistoryPixelCount,
    disocclusionRejectedPixelCount,
    fullyReactivePixelCount,
  };
}

const TEMPORAL_RESOLVE_WGSL = /* wgsl */ `
struct ResolveParams {
  history: vec4f,
  rejection: vec4f,
}

@group(0) @binding(0) var currentFrame: texture_2d<f32>;
@group(0) @binding(1) var historyFrame: texture_2d<f32>;
@group(0) @binding(2) var resolvedFrame: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(3) var<uniform> params: ResolveParams;
@group(0) @binding(4) var motionFrame: texture_2d<f32>;
@group(0) @binding(5) var currentDepthFrame: texture_2d<f32>;
@group(0) @binding(6) var historyDepthFrame: texture_2d<f32>;
@group(0) @binding(7) var reactiveMaskFrame: texture_2d<f32>;

@compute @workgroup_size(8, 8, 1)
fn resolve(@builtin(global_invocation_id) id: vec3u) {
  let dimensions = textureDimensions(currentFrame);
  if (id.x >= dimensions.x || id.y >= dimensions.y) {
    return;
  }

  let pixel = vec2i(id.xy);
  let current = textureLoad(currentFrame, pixel, 0);
  var neighborhoodMin = current;
  var neighborhoodMax = current;
  for (var offsetY = -1; offsetY <= 1; offsetY = offsetY + 1) {
    for (var offsetX = -1; offsetX <= 1; offsetX = offsetX + 1) {
      let samplePixel = clamp(
        pixel + vec2i(offsetX, offsetY),
        vec2i(0, 0),
        vec2i(dimensions) - vec2i(1, 1)
      );
      let sampleValue = textureLoad(currentFrame, samplePixel, 0);
      neighborhoodMin = min(neighborhoodMin, sampleValue);
      neighborhoodMax = max(neighborhoodMax, sampleValue);
    }
  }

  let motion = select(
    vec2f(0.0),
    textureLoad(motionFrame, pixel, 0).xy,
    params.history.z > 0.5
  );
  let previousPixel = vec2i(round(vec2f(pixel) - motion));
  let inside =
    all(previousPixel >= vec2i(0, 0)) &&
    all(previousPixel < vec2i(dimensions));
  let safePreviousPixel = clamp(
    previousPixel,
    vec2i(0, 0),
    vec2i(dimensions) - vec2i(1, 1)
  );
  let history = clamp(
    textureLoad(historyFrame, safePreviousPixel, 0),
    neighborhoodMin,
    neighborhoodMax
  );
  let depthRejected =
    params.history.w > 0.5 &&
    abs(
      textureLoad(currentDepthFrame, pixel, 0).x -
      textureLoad(historyDepthFrame, safePreviousPixel, 0).x
    ) > params.rejection.y;
  let reactive = select(
    0.0,
    clamp(textureLoad(reactiveMaskFrame, pixel, 0).x, 0.0, 1.0),
    params.rejection.x > 0.5
  );
  let historyAllowed =
    params.history.y > 0.5 &&
    inside &&
    !depthRejected;
  let weight = select(
    0.0,
    params.history.x * (1.0 - reactive),
    historyAllowed
  );
  textureStore(resolvedFrame, pixel, mix(current, history, weight));
}
`;

function assertTextureResolveOptions(options: TemporalTextureResolveOptions): number {
  if (
    !Number.isInteger(options.width) ||
    !Number.isInteger(options.height) ||
    options.width <= 0 ||
    options.height <= 0
  ) {
    throw new RangeError('temporal texture resolve dimensions must be positive integers');
  }
  if (!Number.isFinite(options.feedback) || options.feedback < 0 || options.feedback >= 1) {
    throw new RangeError('temporal resolve feedback must be in [0, 1)');
  }
  const threshold = options.disocclusionDepthThreshold ?? 0.01;
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    throw new RangeError('temporal disocclusionDepthThreshold must be in [0, 1]');
  }
  return threshold;
}

/** Create the reusable compute pipeline used by texture-native temporal graphs. */
export function createTemporalTextureResolvePipelineGPU(
  device: GPUDevice
): GPUComputePipeline {
  const module = device.createShaderModule({ code: TEMPORAL_RESOLVE_WGSL });
  return device.createComputePipeline({
    layout: 'auto',
    compute: { module, entryPoint: 'resolve' },
  });
}

/**
 * Encode a texture-native temporal resolve into a caller-owned command encoder.
 *
 * This is the zero-copy integration seam: current color, history, velocity,
 * depth, mask, and output remain GPU textures for the entire pass. Timestamp
 * writes are accepted but resolved by the caller so timing and readback policy
 * remain explicit at the frame-graph boundary.
 */
export function encodeTemporalTextureResolveGPU(
  device: GPUDevice,
  encoder: GPUCommandEncoder,
  inputs: TemporalTextureResolveInputs,
  options: TemporalTextureResolveOptions
): EncodedTemporalTextureResolve {
  const disocclusionDepthThreshold = assertTextureResolveOptions(options);
  const historyValid = options.historyValid;
  const motionVectorsConsumed = historyValid && options.motionVectorsAvailable;
  const disocclusionInputConsumed = historyValid && options.depthHistoryAvailable;
  const reactiveMaskConsumed = historyValid && options.reactiveMaskAvailable;
  const outputTextureOwnedByCaller = !!options.outputTexture;
  const outputTexture =
    options.outputTexture ??
    device.createTexture({
      size: [options.width, options.height],
      format: 'rgba8unorm',
      usage: TEXTURE_STORAGE_BINDING | TEXTURE_COPY_SRC,
    });
  const params = new Float32Array([
    options.feedback,
    historyValid ? 1 : 0,
    motionVectorsConsumed ? 1 : 0,
    disocclusionInputConsumed ? 1 : 0,
    reactiveMaskConsumed ? 1 : 0,
    disocclusionDepthThreshold,
    0,
    0,
  ]);
  const paramsBuffer = device.createBuffer({
    size: params.byteLength,
    usage: BUFFER_UNIFORM | BUFFER_COPY_DST,
  });
  device.queue.writeBuffer(paramsBuffer, 0, params);

  const pipeline = options.pipeline ?? createTemporalTextureResolvePipelineGPU(device);
  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: inputs.currentColor.createView() },
      { binding: 1, resource: inputs.historyColor.createView() },
      { binding: 2, resource: outputTexture.createView() },
      { binding: 3, resource: { buffer: paramsBuffer } },
      { binding: 4, resource: inputs.motionVectors.createView() },
      { binding: 5, resource: inputs.currentDepth.createView() },
      { binding: 6, resource: inputs.historyDepth.createView() },
      { binding: 7, resource: inputs.reactiveMask.createView() },
    ],
  });
  const dispatch: [number, number, 1] = [
    Math.ceil(options.width / 8),
    Math.ceil(options.height / 8),
    1,
  ];
  const pass = encoder.beginComputePass(
    options.timestampWrites ? { timestampWrites: options.timestampWrites } : undefined
  );
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.dispatchWorkgroups(...dispatch);
  pass.end();

  return {
    outputTexture,
    outputTextureOwnedByCaller,
    receipt: {
      schemaVersion: 'holoscript.webgpu-temporal-texture-resolve.v1',
      backend: 'webgpu',
      width: options.width,
      height: options.height,
      feedback: options.feedback,
      historyValid,
      neighborhoodClamping: true,
      motionVectorsConsumed,
      reactiveMaskConsumed,
      disocclusionInputConsumed,
      disocclusionDepthThreshold,
      zeroCopyTextureInputs: true,
      intermediateCpuReadbackCount: 0,
      gpuTimestampWritesEncoded: !!options.timestampWrites,
      persistentPipelineConsumed: !!options.pipeline,
      timingClassification: options.timestampWrites ? 'caller-query-set' : 'not-requested',
      workgroupSize: [8, 8, 1],
      dispatch,
    },
    destroy(): void {
      paramsBuffer.destroy();
      if (!outputTextureOwnedByCaller) outputTexture.destroy();
    },
  };
}

/**
 * Execute one neighborhood-clamped temporal resolve on a live GPUDevice.
 *
 * Pixel grids are caller-owned so the primitive works in Dawn, browsers, and
 * capture tooling without coupling to a presentation engine. The readback is
 * evidence of execution, not a GPU timing result.
 */
export async function resolveTemporalFrameGPU(
  device: GPUDevice,
  current: PixelGrid,
  history: PixelGrid | null,
  options: TemporalResolveOptions
): Promise<TemporalResolveResult> {
  assertPixelGrid(current, 'current frame');
  if (history) {
    assertPixelGrid(history, 'history frame');
    if (history.width !== current.width || history.height !== current.height) {
      throw new RangeError('temporal current and history dimensions must match');
    }
  }
  if (!Number.isFinite(options.feedback) || options.feedback < 0 || options.feedback >= 1) {
    throw new RangeError('temporal resolve feedback must be in [0, 1)');
  }
  if (options.motionVectors) {
    assertFloatGrid(
      options.motionVectors,
      'motion vectors',
      2,
      current.width,
      current.height
    );
    if (options.motionVectors.space !== 'current-minus-previous-pixels') {
      throw new Error('temporal resolve motion-vector space is unsupported');
    }
  }
  if (!!options.currentDepth !== !!options.historyDepth) {
    throw new Error('temporal resolve requires currentDepth and historyDepth together');
  }
  if (options.currentDepth && options.historyDepth) {
    assertFloatGrid(options.currentDepth, 'current depth', 1, current.width, current.height);
    assertFloatGrid(options.historyDepth, 'history depth', 1, current.width, current.height);
  }
  if (options.reactiveMask) {
    assertFloatGrid(options.reactiveMask, 'reactive mask', 1, current.width, current.height);
  }
  const disocclusionDepthThreshold = options.disocclusionDepthThreshold ?? 0.01;
  if (
    !Number.isFinite(disocclusionDepthThreshold) ||
    disocclusionDepthThreshold < 0 ||
    disocclusionDepthThreshold > 1
  ) {
    throw new RangeError('temporal disocclusionDepthThreshold must be in [0, 1]');
  }
  const signalsConsumed = !!history && options.historyValid;
  const motionVectorsConsumed = signalsConsumed && !!options.motionVectors;
  const disocclusionInputConsumed =
    signalsConsumed && !!options.currentDepth && !!options.historyDepth;
  const reactiveMaskConsumed = signalsConsumed && !!options.reactiveMask;
  const rejection = analyzeHistoryRejection(
    current.width,
    current.height,
    signalsConsumed,
    options.motionVectors,
    options.currentDepth,
    options.historyDepth,
    options.reactiveMask,
    disocclusionDepthThreshold
  );

  const format: GPUTextureFormat = 'rgba8unorm';
  const textureSize = [current.width, current.height] as [number, number];
  const currentTexture = createRgba8Texture(device, current);
  const historyTexture = createRgba8Texture(device, history ?? current);
  const motionTexture = createFloatTexture(
    device,
    current.width,
    current.height,
    'rgba32float',
    4,
    expandMotionVectors(options.motionVectors, current.width, current.height)
  );
  const currentDepthTexture = createFloatTexture(
    device,
    current.width,
    current.height,
    'r32float',
    1,
    options.currentDepth?.data ?? new Float32Array(current.width * current.height)
  );
  const historyDepthTexture = createFloatTexture(
    device,
    current.width,
    current.height,
    'r32float',
    1,
    options.historyDepth?.data ?? new Float32Array(current.width * current.height)
  );
  const reactiveMaskTexture = createFloatTexture(
    device,
    current.width,
    current.height,
    'r32float',
    1,
    options.reactiveMask?.data ?? new Float32Array(current.width * current.height)
  );
  const outputTexture = device.createTexture({
    size: textureSize,
    format,
    usage: TEXTURE_STORAGE_BINDING | TEXTURE_COPY_SRC,
  });
  const params = new Float32Array([
    options.feedback,
    signalsConsumed ? 1 : 0,
    motionVectorsConsumed ? 1 : 0,
    disocclusionInputConsumed ? 1 : 0,
    reactiveMaskConsumed ? 1 : 0,
    disocclusionDepthThreshold,
    0,
    0,
  ]);
  const paramsBuffer = device.createBuffer({
    size: params.byteLength,
    usage: BUFFER_UNIFORM | BUFFER_COPY_DST,
  });

  device.queue.writeBuffer(paramsBuffer, 0, params);

  const module = device.createShaderModule({ code: TEMPORAL_RESOLVE_WGSL });
  const pipeline = device.createComputePipeline({
    layout: 'auto',
    compute: { module, entryPoint: 'resolve' },
  });
  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: currentTexture.createView() },
      { binding: 1, resource: historyTexture.createView() },
      { binding: 2, resource: outputTexture.createView() },
      { binding: 3, resource: { buffer: paramsBuffer } },
      { binding: 4, resource: motionTexture.createView() },
      { binding: 5, resource: currentDepthTexture.createView() },
      { binding: 6, resource: historyDepthTexture.createView() },
      { binding: 7, resource: reactiveMaskTexture.createView() },
    ],
  });

  const paddedBytesPerRow = Math.ceil((current.width * 4) / 256) * 256;
  const readback = device.createBuffer({
    size: paddedBytesPerRow * current.height,
    usage: BUFFER_COPY_DST | BUFFER_MAP_READ,
  });
  const dispatch: [number, number, 1] = [
    Math.ceil(current.width / 8),
    Math.ceil(current.height / 8),
    1,
  ];
  const encoder = device.createCommandEncoder();
  const pass = encoder.beginComputePass();
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.dispatchWorkgroups(...dispatch);
  pass.end();
  encoder.copyTextureToBuffer(
    { texture: outputTexture },
    { buffer: readback, bytesPerRow: paddedBytesPerRow, rowsPerImage: current.height },
    { width: current.width, height: current.height, depthOrArrayLayers: 1 }
  );
  device.queue.submit([encoder.finish()]);

  await readback.mapAsync(MAP_READ);
  const mapped = new Uint8Array(readback.getMappedRange());
  const data = new Uint8Array(current.width * current.height * 4);
  const unpaddedBytesPerRow = current.width * 4;
  for (let row = 0; row < current.height; row += 1) {
    data.set(
      mapped.subarray(
        row * paddedBytesPerRow,
        row * paddedBytesPerRow + unpaddedBytesPerRow
      ),
      row * unpaddedBytesPerRow
    );
  }
  readback.unmap();

  readback.destroy();
  paramsBuffer.destroy();
  outputTexture.destroy();
  reactiveMaskTexture.destroy();
  historyDepthTexture.destroy();
  currentDepthTexture.destroy();
  motionTexture.destroy();
  historyTexture.destroy();
  currentTexture.destroy();

  return {
    pixels: { width: current.width, height: current.height, data },
    receipt: {
      schemaVersion: 'holoscript.webgpu-temporal-resolve.v2',
      backend: 'webgpu',
      deviceExecutionMeasured: true,
      width: current.width,
      height: current.height,
      feedback: options.feedback,
      historyValid: signalsConsumed,
      neighborhoodClamping: true,
      motionVectorsConsumed,
      motionVectorSpace: motionVectorsConsumed
        ? 'current-minus-previous-pixels'
        : 'none',
      reactiveMaskConsumed,
      disocclusionInputConsumed,
      disocclusionDepthThreshold,
      ...rejection,
      gpuTimestampMeasured: false,
      timingClassification: 'not-measured',
      workgroupSize: [8, 8, 1],
      dispatch,
    },
  };
}
