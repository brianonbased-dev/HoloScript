/**
 * Persistent, texture-native temporal frame graph.
 *
 * The graph keeps resolved color and depth history on the GPU, records the
 * resolve and history copies in one command buffer, and optionally reads back
 * only the final resolved image as an evidence artifact. GPU timestamp queries
 * measure the compute pass itself; evidence and query-buffer mapping occur
 * after that timestamp scope.
 */

import type { PixelGrid } from '../../native-render/gpu-verify';
import {
  createTemporalTextureResolvePipelineGPU,
  encodeTemporalTextureResolveGPU,
  type TemporalTextureResolveReceipt,
} from './TemporalConvergence';

const BUFFER_COPY_SRC = 0x0004;
const BUFFER_COPY_DST = 0x0008;
const BUFFER_MAP_READ = 0x0001;
const BUFFER_QUERY_RESOLVE = 0x0200;
const MAP_READ = 0x0001;
const TEXTURE_COPY_SRC = 0x01;
const TEXTURE_COPY_DST = 0x02;
const TEXTURE_BINDING = 0x04;
const TEXTURE_STORAGE_BINDING = 0x08;

export interface TemporalFrameGraphOptions {
  width: number;
  height: number;
  /** Request timestamps when the device was created with timestamp-query. */
  enableGpuTimestamps?: boolean;
  label?: string;
}

export interface TemporalFrameGraphInput {
  currentColor: GPUTexture;
  currentDepth: GPUTexture;
  motionVectors?: GPUTexture;
  reactiveMask?: GPUTexture;
  feedback: number;
  /** Admission decision from TemporalConvergenceController. */
  historyValid: boolean;
  disocclusionDepthThreshold?: number;
  /** Copy the final color texture to CPU after the GPU work completes. */
  capturePixels?: boolean;
}

export interface TemporalFrameGraphReceipt {
  schemaVersion: 'holoscript.webgpu-temporal-frame-graph.v1';
  backend: 'webgpu';
  width: number;
  height: number;
  frameIndex: number;
  historyInitializedBeforeFrame: boolean;
  historyConsumed: boolean;
  historyCommitted: true;
  zeroCopyTextureInputs: true;
  zeroCopyHistory: true;
  intermediateFrameReadbackCount: 0;
  evidenceFrameReadbackCount: 0 | 1;
  timestampMetadataReadbackCount: 0 | 1;
  commandBufferCount: 1;
  queueSubmissionCount: 1;
  gpuTimestampQuerySupported: boolean;
  gpuTimestampQueryRequested: boolean;
  gpuTimestampQueryEnabled: boolean;
  gpuTimestampMeasured: boolean;
  resolveDurationNanoseconds: number | null;
  timingClassification: 'gpu-timestamp-query' | 'feature-not-enabled' | 'not-requested';
  timedScope: 'temporal-resolve-compute-pass' | 'not-measured';
  readbackExcludedFromTimedScope: true;
  resolve: TemporalTextureResolveReceipt;
}

export interface TemporalFrameGraphResult {
  outputTexture: GPUTexture;
  pixels: PixelGrid | null;
  receipt: TemporalFrameGraphReceipt;
}

function alignedBytesPerRow(width: number): number {
  return Math.ceil((width * 4) / 256) * 256;
}

function assertDimensions(width: number, height: number): void {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new RangeError('temporal frame graph dimensions must be positive integers');
  }
}

/**
 * One-device temporal graph. Calls are deliberately serialized because the
 * persistent query/readback buffers and history textures are frame resources.
 */
export class TemporalFrameGraph {
  readonly width: number;
  readonly height: number;
  readonly timestampQuerySupported: boolean;
  readonly timestampQueryRequested: boolean;
  readonly timestampQueryEnabled: boolean;

  private readonly device: GPUDevice;
  private readonly outputColor: GPUTexture;
  private readonly historyColor: GPUTexture;
  private readonly historyDepth: GPUTexture;
  private readonly neutralMotion: GPUTexture;
  private readonly neutralReactiveMask: GPUTexture;
  private readonly resolvePipeline: GPUComputePipeline;
  private readonly timestampQuerySet: GPUQuerySet | null;
  private readonly timestampResolveBuffer: GPUBuffer | null;
  private readonly timestampReadbackBuffer: GPUBuffer | null;
  private historyInitialized = false;
  private frameIndex = 0;
  private executing = false;
  private destroyed = false;

  constructor(device: GPUDevice, options: TemporalFrameGraphOptions) {
    assertDimensions(options.width, options.height);
    this.device = device;
    this.width = options.width;
    this.height = options.height;
    this.timestampQuerySupported = device.features.has('timestamp-query');
    this.timestampQueryRequested = options.enableGpuTimestamps ?? true;
    this.timestampQueryEnabled =
      this.timestampQueryRequested && this.timestampQuerySupported;
    const label = options.label ?? 'holoscript-temporal-frame-graph';

    this.outputColor = device.createTexture({
      label: `${label}-output-color`,
      size: [this.width, this.height],
      format: 'rgba8unorm',
      usage: TEXTURE_STORAGE_BINDING | TEXTURE_COPY_SRC,
    });
    this.historyColor = device.createTexture({
      label: `${label}-history-color`,
      size: [this.width, this.height],
      format: 'rgba8unorm',
      usage: TEXTURE_BINDING | TEXTURE_COPY_DST,
    });
    this.historyDepth = device.createTexture({
      label: `${label}-history-depth`,
      size: [this.width, this.height],
      format: 'r32float',
      usage: TEXTURE_BINDING | TEXTURE_COPY_DST,
    });
    this.neutralMotion = device.createTexture({
      label: `${label}-neutral-motion`,
      size: [this.width, this.height],
      format: 'rgba32float',
      usage: TEXTURE_BINDING | TEXTURE_COPY_DST,
    });
    this.neutralReactiveMask = device.createTexture({
      label: `${label}-neutral-reactive-mask`,
      size: [this.width, this.height],
      format: 'r32float',
      usage: TEXTURE_BINDING | TEXTURE_COPY_DST,
    });
    this.resolvePipeline = createTemporalTextureResolvePipelineGPU(device);

    if (this.timestampQueryEnabled) {
      this.timestampQuerySet = device.createQuerySet({
        label: `${label}-timestamps`,
        type: 'timestamp',
        count: 2,
      });
      this.timestampResolveBuffer = device.createBuffer({
        label: `${label}-timestamp-resolve`,
        size: 16,
        usage: BUFFER_QUERY_RESOLVE | BUFFER_COPY_SRC,
      });
      this.timestampReadbackBuffer = device.createBuffer({
        label: `${label}-timestamp-readback`,
        size: 16,
        usage: BUFFER_COPY_DST | BUFFER_MAP_READ,
      });
    } else {
      this.timestampQuerySet = null;
      this.timestampResolveBuffer = null;
      this.timestampReadbackBuffer = null;
    }
  }

  resetHistory(): void {
    this.historyInitialized = false;
  }

  async execute(input: TemporalFrameGraphInput): Promise<TemporalFrameGraphResult> {
    if (this.destroyed) throw new Error('temporal frame graph is destroyed');
    if (this.executing) throw new Error('temporal frame graph execute calls must be serialized');
    this.executing = true;
    try {
      const historyInitializedBeforeFrame = this.historyInitialized;
      const historyConsumed = input.historyValid && historyInitializedBeforeFrame;
      const encoder = this.device.createCommandEncoder({
        label: `holoscript-temporal-frame-${this.frameIndex}`,
      });
      const timestampWrites =
        this.timestampQuerySet === null
          ? undefined
          : {
              querySet: this.timestampQuerySet,
              beginningOfPassWriteIndex: 0,
              endOfPassWriteIndex: 1,
            };
      const encoded = encodeTemporalTextureResolveGPU(
        this.device,
        encoder,
        {
          currentColor: input.currentColor,
          historyColor: this.historyColor,
          motionVectors: input.motionVectors ?? this.neutralMotion,
          currentDepth: input.currentDepth,
          historyDepth: this.historyDepth,
          reactiveMask: input.reactiveMask ?? this.neutralReactiveMask,
        },
        {
          width: this.width,
          height: this.height,
          feedback: input.feedback,
          historyValid: historyConsumed,
          motionVectorsAvailable: !!input.motionVectors,
          depthHistoryAvailable: historyConsumed,
          reactiveMaskAvailable: !!input.reactiveMask,
          disocclusionDepthThreshold: input.disocclusionDepthThreshold,
          timestampWrites,
          pipeline: this.resolvePipeline,
          outputTexture: this.outputColor,
        }
      );

      encoder.copyTextureToTexture(
        { texture: this.outputColor },
        { texture: this.historyColor },
        [this.width, this.height]
      );
      encoder.copyTextureToTexture(
        { texture: input.currentDepth },
        { texture: this.historyDepth },
        [this.width, this.height]
      );

      const evidenceBytesPerRow = alignedBytesPerRow(this.width);
      const evidenceReadback = input.capturePixels
        ? this.device.createBuffer({
            label: `holoscript-temporal-frame-${this.frameIndex}-evidence`,
            size: evidenceBytesPerRow * this.height,
            usage: BUFFER_COPY_DST | BUFFER_MAP_READ,
          })
        : null;
      if (evidenceReadback) {
        encoder.copyTextureToBuffer(
          { texture: this.outputColor },
          {
            buffer: evidenceReadback,
            bytesPerRow: evidenceBytesPerRow,
            rowsPerImage: this.height,
          },
          [this.width, this.height]
        );
      }
      if (
        this.timestampQuerySet &&
        this.timestampResolveBuffer &&
        this.timestampReadbackBuffer
      ) {
        encoder.resolveQuerySet(this.timestampQuerySet, 0, 2, this.timestampResolveBuffer, 0);
        encoder.copyBufferToBuffer(
          this.timestampResolveBuffer,
          0,
          this.timestampReadbackBuffer,
          0,
          16
        );
      }

      this.device.queue.submit([encoder.finish()]);
      const waits: Promise<void>[] = [];
      if (evidenceReadback) waits.push(evidenceReadback.mapAsync(MAP_READ));
      if (this.timestampReadbackBuffer) {
        waits.push(this.timestampReadbackBuffer.mapAsync(MAP_READ));
      }
      if (waits.length > 0) await Promise.all(waits);
      else await this.device.queue.onSubmittedWorkDone();

      let resolveDurationNanoseconds: number | null = null;
      if (this.timestampReadbackBuffer) {
        const timestamps = new BigUint64Array(this.timestampReadbackBuffer.getMappedRange());
        if (timestamps.length >= 2 && timestamps[1] >= timestamps[0]) {
          resolveDurationNanoseconds = Number(timestamps[1] - timestamps[0]);
        }
        this.timestampReadbackBuffer.unmap();
      }

      let pixels: PixelGrid | null = null;
      if (evidenceReadback) {
        const mapped = new Uint8Array(evidenceReadback.getMappedRange());
        const data = new Uint8Array(this.width * this.height * 4);
        const unpaddedBytesPerRow = this.width * 4;
        for (let row = 0; row < this.height; row += 1) {
          data.set(
            mapped.subarray(
              row * evidenceBytesPerRow,
              row * evidenceBytesPerRow + unpaddedBytesPerRow
            ),
            row * unpaddedBytesPerRow
          );
        }
        evidenceReadback.unmap();
        evidenceReadback.destroy();
        pixels = { width: this.width, height: this.height, data };
      }

      encoded.destroy();
      this.historyInitialized = true;
      const gpuTimestampMeasured = resolveDurationNanoseconds !== null;
      const receipt: TemporalFrameGraphReceipt = {
        schemaVersion: 'holoscript.webgpu-temporal-frame-graph.v1',
        backend: 'webgpu',
        width: this.width,
        height: this.height,
        frameIndex: this.frameIndex,
        historyInitializedBeforeFrame,
        historyConsumed,
        historyCommitted: true,
        zeroCopyTextureInputs: true,
        zeroCopyHistory: true,
        intermediateFrameReadbackCount: 0,
        evidenceFrameReadbackCount: input.capturePixels ? 1 : 0,
        timestampMetadataReadbackCount: this.timestampQueryEnabled ? 1 : 0,
        commandBufferCount: 1,
        queueSubmissionCount: 1,
        gpuTimestampQuerySupported: this.timestampQuerySupported,
        gpuTimestampQueryRequested: this.timestampQueryRequested,
        gpuTimestampQueryEnabled: this.timestampQueryEnabled,
        gpuTimestampMeasured,
        resolveDurationNanoseconds,
        timingClassification: gpuTimestampMeasured
          ? 'gpu-timestamp-query'
          : this.timestampQueryRequested
            ? 'feature-not-enabled'
            : 'not-requested',
        timedScope: gpuTimestampMeasured ? 'temporal-resolve-compute-pass' : 'not-measured',
        readbackExcludedFromTimedScope: true,
        resolve: encoded.receipt,
      };
      this.frameIndex += 1;
      return { outputTexture: this.outputColor, pixels, receipt };
    } finally {
      this.executing = false;
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.timestampReadbackBuffer?.destroy();
    this.timestampResolveBuffer?.destroy();
    this.timestampQuerySet?.destroy();
    this.neutralReactiveMask.destroy();
    this.neutralMotion.destroy();
    this.historyDepth.destroy();
    this.historyColor.destroy();
    this.outputColor.destroy();
  }
}
