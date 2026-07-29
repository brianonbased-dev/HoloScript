/**
 * Native WebGPU temporal convergence primitives.
 *
 * This module deliberately separates three concerns:
 * - deterministic camera jitter and history admission;
 * - explicit invalidation for camera motion, resident motion, and LOD changes;
 * - a neighborhood-clamped WebGPU resolve over caller-owned pixel grids.
 *
 * The resolve is useful for bounded native-render witnesses and offline capture.
 * It is not motion-reprojected TAA: no velocity, reactive-mask, or disocclusion
 * input is consumed. Callers must invalidate history whenever those signals can
 * no longer be assumed stable.
 */

import type { PixelGrid } from '../../native-render/gpu-verify';
import type { Mat4 } from '../../character-render/skin-math';

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
  schemaVersion: 'holoscript.temporal-convergence.v1';
  config: TemporalConvergenceConfig;
  frameCount: number;
  historyGeneration: number;
  invalidationCounts: Record<TemporalInvalidationReason, number>;
  stableFrameCount: number;
  converged: boolean;
  motionVectorsConsumed: false;
  reactiveMaskConsumed: false;
  disocclusionInputConsumed: false;
  requiredHistoryPolicy: 'invalidate-on-camera-resident-or-lod-change-v1';
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
    else if (signals.residentStateId !== this.previous.residentStateId) reason = 'resident-motion';

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
      schemaVersion: 'holoscript.temporal-convergence.v1',
      config: { ...this.config },
      frameCount: this.frameCount,
      historyGeneration: this.historyGeneration,
      invalidationCounts: { ...this.invalidationCounts },
      stableFrameCount: this.stableFrameCount,
      converged: this.stableFrameCount >= this.config.sampleCount,
      motionVectorsConsumed: false,
      reactiveMaskConsumed: false,
      disocclusionInputConsumed: false,
      requiredHistoryPolicy: 'invalidate-on-camera-resident-or-lod-change-v1',
    };
  }
}

export interface TemporalResolveOptions {
  feedback: number;
  historyValid: boolean;
}

export interface TemporalResolveReceipt {
  schemaVersion: 'holoscript.webgpu-temporal-resolve.v1';
  backend: 'webgpu';
  deviceExecutionMeasured: true;
  width: number;
  height: number;
  feedback: number;
  historyValid: boolean;
  neighborhoodClamping: true;
  motionVectorsConsumed: false;
  reactiveMaskConsumed: false;
  disocclusionInputConsumed: false;
  gpuTimestampMeasured: false;
  timingClassification: 'not-measured';
  workgroupSize: [8, 8, 1];
  dispatch: [number, number, 1];
}

export interface TemporalResolveResult {
  pixels: PixelGrid;
  receipt: TemporalResolveReceipt;
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

const TEMPORAL_RESOLVE_WGSL = /* wgsl */ `
struct ResolveParams {
  feedback: f32,
  historyValid: f32,
  _padding: vec2f,
}

@group(0) @binding(0) var currentFrame: texture_2d<f32>;
@group(0) @binding(1) var historyFrame: texture_2d<f32>;
@group(0) @binding(2) var resolvedFrame: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(3) var<uniform> params: ResolveParams;

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

  let history = clamp(textureLoad(historyFrame, pixel, 0), neighborhoodMin, neighborhoodMax);
  let weight = select(0.0, params.feedback, params.historyValid > 0.5);
  textureStore(resolvedFrame, pixel, mix(current, history, weight));
}
`;

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

  const format: GPUTextureFormat = 'rgba8unorm';
  const textureSize = [current.width, current.height] as [number, number];
  const sourceUsage = TEXTURE_COPY_DST | TEXTURE_BINDING;
  const currentTexture = device.createTexture({ size: textureSize, format, usage: sourceUsage });
  const historyTexture = device.createTexture({ size: textureSize, format, usage: sourceUsage });
  const outputTexture = device.createTexture({
    size: textureSize,
    format,
    usage: TEXTURE_STORAGE_BINDING | TEXTURE_COPY_SRC,
  });
  const params = new Float32Array([
    options.feedback,
    history && options.historyValid ? 1 : 0,
    0,
    0,
  ]);
  const paramsBuffer = device.createBuffer({
    size: params.byteLength,
    usage: BUFFER_UNIFORM | BUFFER_COPY_DST,
  });

  // Copy into ArrayBuffer-backed views: PixelGrid permits ArrayBufferLike while
  // WebGPU intentionally rejects SharedArrayBuffer-backed upload sources.
  const currentData: Uint8Array<ArrayBuffer> = new Uint8Array(current.data);
  const historyData: Uint8Array<ArrayBuffer> = new Uint8Array(history?.data ?? current.data);
  device.queue.writeTexture(
    { texture: currentTexture },
    currentData,
    { bytesPerRow: current.width * 4, rowsPerImage: current.height },
    textureSize
  );
  device.queue.writeTexture(
    { texture: historyTexture },
    historyData,
    { bytesPerRow: current.width * 4, rowsPerImage: current.height },
    textureSize
  );
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
  historyTexture.destroy();
  currentTexture.destroy();

  return {
    pixels: { width: current.width, height: current.height, data },
    receipt: {
      schemaVersion: 'holoscript.webgpu-temporal-resolve.v1',
      backend: 'webgpu',
      deviceExecutionMeasured: true,
      width: current.width,
      height: current.height,
      feedback: options.feedback,
      historyValid: !!history && options.historyValid,
      neighborhoodClamping: true,
      motionVectorsConsumed: false,
      reactiveMaskConsumed: false,
      disocclusionInputConsumed: false,
      gpuTimestampMeasured: false,
      timingClassification: 'not-measured',
      workgroupSize: [8, 8, 1],
      dispatch,
    },
  };
}
