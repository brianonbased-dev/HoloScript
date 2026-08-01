/**
 * End-to-end native WebGPU character frame graph.
 *
 * Character color, character motion/depth, and temporal resolve are encoded in
 * one command buffer and submitted once. Only final evidence pixels and compact
 * timestamp metadata may cross back to the CPU.
 */

import {
  CharacterMotionTextureRasterizer,
  type CharacterMotionTextureRasterReceipt,
} from '../../character-render/CharacterMotionTextureRasterizer';
import {
  deriveCharacterMotionVectorFrame,
  type CharacterMotionVectorReceipt,
} from '../../character-render/CharacterMotionVectors';
import {
  CharacterTextureRenderer,
  type CharacterTextureRenderReceipt,
} from '../../character-render/CharacterTextureRenderer';
import {
  framingMatrix,
  type CharacterRenderOptions,
} from '../../character-render/character-render';
import type { CharacterDrawSpec } from '../../native-render/draw-spec';
import type { PixelGrid } from '../../native-render/gpu-verify';
import type { Mat4 } from '../../character-render/skin-math';
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
const TEXTURE_RENDER_ATTACHMENT = 0x10;

export interface CharacterTemporalFrameGraphOptions {
  width: number;
  height: number;
  enableGpuTimestamps?: boolean;
  label?: string;
}

export interface CharacterTemporalFrameGraphInput {
  currentSpec: CharacterDrawSpec;
  previousSpec: CharacterDrawSpec;
  currentViewProjection?: Mat4;
  previousViewProjection?: Mat4;
  renderOptions?: Omit<CharacterRenderOptions, 'size' | 'viewProj'>;
  feedback: number;
  historyValid: boolean;
  disocclusionDepthThreshold?: number;
  capturePixels?: boolean;
}

export interface CharacterTemporalStageDurations {
  characterColorNanoseconds: number | null;
  motionDepthNanoseconds: number | null;
  temporalResolveNanoseconds: number | null;
  aggregateNanoseconds: number | null;
}

export interface CharacterTemporalFrameGraphReceipt {
  schemaVersion: 'holoscript.webgpu-character-temporal-frame-graph.v1';
  backend: 'webgpu';
  deviceExecutionMeasured: true;
  width: number;
  height: number;
  frameIndex: number;
  historyInitializedBeforeFrame: boolean;
  historyConsumed: boolean;
  historyCommitted: true;
  fixedTopology: true;
  persistentGpuResources: true;
  zeroCopyColorToTemporalResolve: true;
  zeroCopyMotionDepthToTemporalResolve: true;
  zeroCopyResolveToHistory: true;
  intermediateFrameReadbackCount: 0;
  evidenceFrameReadbackCount: 0 | 1;
  timestampMetadataReadbackCount: 0 | 1;
  commandBufferCount: 1;
  queueSubmissionCount: 1;
  gpuTimestampQuerySupported: boolean;
  gpuTimestampQueryRequested: boolean;
  gpuTimestampQueryEnabled: boolean;
  gpuTimestampMeasured: boolean;
  timingClassification: 'gpu-timestamp-query' | 'feature-not-enabled' | 'not-requested';
  timedScope: 'character-color-through-temporal-resolve-gpu-scope' | 'not-measured';
  cpuMotionDerivationExcludedFromTimedScope: true;
  cpuToGpuUploadsExcludedFromTimedScope: true;
  historyCopiesExcludedFromTimedScope: true;
  evidenceAndTimestampReadbackExcludedFromTimedScope: true;
  durations: CharacterTemporalStageDurations;
  motionDerivation: CharacterMotionVectorReceipt;
  color: CharacterTextureRenderReceipt;
  motionDepth: CharacterMotionTextureRasterReceipt;
  resolve: TemporalTextureResolveReceipt;
}

export interface CharacterTemporalFrameGraphResult {
  outputTexture: GPUTexture;
  pixels: PixelGrid | null;
  receipt: CharacterTemporalFrameGraphReceipt;
}

function assertDimensions(width: number, height: number): void {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new RangeError('character temporal frame graph dimensions must be positive integers');
  }
}

function alignedBytesPerRow(width: number): number {
  return Math.ceil((width * 4) / 256) * 256;
}

function timestampDuration(
  timestamps: BigUint64Array<ArrayBuffer>,
  beginning: number,
  end: number
): number | null {
  if (timestamps.length <= end || timestamps[end] < timestamps[beginning]) return null;
  return Number(timestamps[end] - timestamps[beginning]);
}

/** One-device, fixed-topology character render graph. Execute calls are serialized. */
export class CharacterTemporalFrameGraph {
  readonly width: number;
  readonly height: number;
  readonly timestampQuerySupported: boolean;
  readonly timestampQueryRequested: boolean;
  readonly timestampQueryEnabled: boolean;

  private readonly device: GPUDevice;
  private readonly label: string;
  private readonly characterRenderer: CharacterTextureRenderer;
  private readonly motionRasterizer: CharacterMotionTextureRasterizer;
  private readonly currentColor: GPUTexture;
  private readonly outputColor: GPUTexture;
  private readonly historyColor: GPUTexture;
  private readonly historyDepth: GPUTexture;
  private readonly neutralReactiveMask: GPUTexture;
  private readonly resolvePipeline: GPUComputePipeline;
  private readonly timestampQuerySet: GPUQuerySet | null;
  private readonly timestampResolveBuffer: GPUBuffer | null;
  private readonly timestampReadbackBuffer: GPUBuffer | null;
  private historyInitialized = false;
  private frameIndex = 0;
  private executing = false;
  private destroyed = false;

  constructor(
    device: GPUDevice,
    initialSpec: CharacterDrawSpec,
    options: CharacterTemporalFrameGraphOptions
  ) {
    assertDimensions(options.width, options.height);
    this.device = device;
    this.width = options.width;
    this.height = options.height;
    this.label = options.label ?? 'holoscript-character-temporal-frame-graph';
    this.timestampQuerySupported = device.features.has('timestamp-query');
    this.timestampQueryRequested = options.enableGpuTimestamps ?? true;
    this.timestampQueryEnabled = this.timestampQueryRequested && this.timestampQuerySupported;
    this.characterRenderer = new CharacterTextureRenderer(device, initialSpec, {
      width: this.width,
      height: this.height,
      label: `${this.label}-color`,
    });
    this.motionRasterizer = new CharacterMotionTextureRasterizer(device, {
      width: this.width,
      height: this.height,
      vertexCount: initialSpec.mesh.vertexCount,
      indices: initialSpec.mesh.indices,
      label: `${this.label}-motion-depth`,
    });
    this.currentColor = device.createTexture({
      label: `${this.label}-current-color`,
      size: [this.width, this.height],
      format: 'rgba8unorm',
      usage: TEXTURE_RENDER_ATTACHMENT | TEXTURE_BINDING,
    });
    this.outputColor = device.createTexture({
      label: `${this.label}-output-color`,
      size: [this.width, this.height],
      format: 'rgba8unorm',
      usage: TEXTURE_STORAGE_BINDING | TEXTURE_COPY_SRC,
    });
    this.historyColor = device.createTexture({
      label: `${this.label}-history-color`,
      size: [this.width, this.height],
      format: 'rgba8unorm',
      usage: TEXTURE_BINDING | TEXTURE_COPY_DST,
    });
    this.historyDepth = device.createTexture({
      label: `${this.label}-history-depth`,
      size: [this.width, this.height],
      format: 'r32float',
      usage: TEXTURE_BINDING | TEXTURE_COPY_DST,
    });
    this.neutralReactiveMask = device.createTexture({
      label: `${this.label}-neutral-reactive-mask`,
      size: [this.width, this.height],
      format: 'r32float',
      usage: TEXTURE_BINDING | TEXTURE_COPY_DST,
    });
    this.resolvePipeline = createTemporalTextureResolvePipelineGPU(device);

    if (this.timestampQueryEnabled) {
      this.timestampQuerySet = device.createQuerySet({
        label: `${this.label}-timestamps`,
        type: 'timestamp',
        count: 6,
      });
      this.timestampResolveBuffer = device.createBuffer({
        label: `${this.label}-timestamp-resolve`,
        size: 48,
        usage: BUFFER_QUERY_RESOLVE | BUFFER_COPY_SRC,
      });
      this.timestampReadbackBuffer = device.createBuffer({
        label: `${this.label}-timestamp-readback`,
        size: 48,
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

  async execute(
    input: CharacterTemporalFrameGraphInput
  ): Promise<CharacterTemporalFrameGraphResult> {
    if (this.destroyed) throw new Error('character temporal frame graph is destroyed');
    if (this.executing)
      throw new Error('character temporal frame graph execute calls must be serialized');
    this.executing = true;
    try {
      const currentViewProjection = input.currentViewProjection ?? framingMatrix();
      const previousViewProjection = input.previousViewProjection ?? currentViewProjection;
      // Explicitly outside the GPU timestamp scope: dual-palette CPU skin evaluation.
      const motionFrame = deriveCharacterMotionVectorFrame(input.currentSpec, input.previousSpec, {
        width: this.width,
        height: this.height,
        currentViewProjection,
        previousViewProjection,
      });
      const historyInitializedBeforeFrame = this.historyInitialized;
      const historyConsumed = input.historyValid && historyInitializedBeforeFrame;
      const encoder = this.device.createCommandEncoder({
        label: `${this.label}-frame-${this.frameIndex}`,
      });
      const renderTimestampWrites = this.timestampQuerySet
        ? { querySet: this.timestampQuerySet, beginningOfPassWriteIndex: 0, endOfPassWriteIndex: 1 }
        : undefined;
      const motionTimestampWrites = this.timestampQuerySet
        ? { querySet: this.timestampQuerySet, beginningOfPassWriteIndex: 2, endOfPassWriteIndex: 3 }
        : undefined;
      const resolveTimestampWrites = this.timestampQuerySet
        ? { querySet: this.timestampQuerySet, beginningOfPassWriteIndex: 4, endOfPassWriteIndex: 5 }
        : undefined;

      const color = this.characterRenderer.encode(encoder, this.currentColor, input.currentSpec, {
        ...input.renderOptions,
        viewProj: currentViewProjection,
        timestampWrites: renderTimestampWrites,
      });
      const motionDepth = this.motionRasterizer.encode(encoder, motionFrame, motionTimestampWrites);
      const encodedResolve = encodeTemporalTextureResolveGPU(
        this.device,
        encoder,
        {
          currentColor: this.currentColor,
          historyColor: this.historyColor,
          motionVectors: this.motionRasterizer.motionTexture,
          currentDepth: this.motionRasterizer.depthTexture,
          historyDepth: this.historyDepth,
          reactiveMask: this.neutralReactiveMask,
        },
        {
          width: this.width,
          height: this.height,
          feedback: input.feedback,
          historyValid: historyConsumed,
          motionVectorsAvailable: true,
          depthHistoryAvailable: historyConsumed,
          reactiveMaskAvailable: false,
          disocclusionDepthThreshold: input.disocclusionDepthThreshold,
          timestampWrites: resolveTimestampWrites,
          pipeline: this.resolvePipeline,
          outputTexture: this.outputColor,
        }
      );

      // These history copies are deliberately after the aggregate timestamp endpoint.
      encoder.copyTextureToTexture({ texture: this.outputColor }, { texture: this.historyColor }, [
        this.width,
        this.height,
      ]);
      encoder.copyTextureToTexture(
        { texture: this.motionRasterizer.depthTexture },
        { texture: this.historyDepth },
        [this.width, this.height]
      );

      const evidenceBytesPerRow = alignedBytesPerRow(this.width);
      const evidenceReadback = input.capturePixels
        ? this.device.createBuffer({
            label: `${this.label}-frame-${this.frameIndex}-evidence`,
            size: evidenceBytesPerRow * this.height,
            usage: BUFFER_COPY_DST | BUFFER_MAP_READ,
          })
        : null;
      if (evidenceReadback) {
        encoder.copyTextureToBuffer(
          { texture: this.outputColor },
          { buffer: evidenceReadback, bytesPerRow: evidenceBytesPerRow, rowsPerImage: this.height },
          [this.width, this.height]
        );
      }
      if (this.timestampQuerySet && this.timestampResolveBuffer && this.timestampReadbackBuffer) {
        encoder.resolveQuerySet(this.timestampQuerySet, 0, 6, this.timestampResolveBuffer, 0);
        encoder.copyBufferToBuffer(
          this.timestampResolveBuffer,
          0,
          this.timestampReadbackBuffer,
          0,
          48
        );
      }

      this.device.queue.submit([encoder.finish()]);
      const waits: Promise<void>[] = [];
      if (evidenceReadback) waits.push(evidenceReadback.mapAsync(MAP_READ));
      if (this.timestampReadbackBuffer) waits.push(this.timestampReadbackBuffer.mapAsync(MAP_READ));
      if (waits.length > 0) await Promise.all(waits);
      else await this.device.queue.onSubmittedWorkDone();

      const durations: CharacterTemporalStageDurations = {
        characterColorNanoseconds: null,
        motionDepthNanoseconds: null,
        temporalResolveNanoseconds: null,
        aggregateNanoseconds: null,
      };
      if (this.timestampReadbackBuffer) {
        const timestamps = new BigUint64Array(
          this.timestampReadbackBuffer.getMappedRange().slice(0)
        ) as BigUint64Array<ArrayBuffer>;
        durations.characterColorNanoseconds = timestampDuration(timestamps, 0, 1);
        durations.motionDepthNanoseconds = timestampDuration(timestamps, 2, 3);
        durations.temporalResolveNanoseconds = timestampDuration(timestamps, 4, 5);
        durations.aggregateNanoseconds = timestampDuration(timestamps, 0, 5);
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

      encodedResolve.destroy();
      this.historyInitialized = true;
      const gpuTimestampMeasured = Object.values(durations).every((duration) => duration !== null);
      const receipt: CharacterTemporalFrameGraphReceipt = {
        schemaVersion: 'holoscript.webgpu-character-temporal-frame-graph.v1',
        backend: 'webgpu',
        deviceExecutionMeasured: true,
        width: this.width,
        height: this.height,
        frameIndex: this.frameIndex,
        historyInitializedBeforeFrame,
        historyConsumed,
        historyCommitted: true,
        fixedTopology: true,
        persistentGpuResources: true,
        zeroCopyColorToTemporalResolve: true,
        zeroCopyMotionDepthToTemporalResolve: true,
        zeroCopyResolveToHistory: true,
        intermediateFrameReadbackCount: 0,
        evidenceFrameReadbackCount: input.capturePixels ? 1 : 0,
        timestampMetadataReadbackCount: this.timestampQueryEnabled ? 1 : 0,
        commandBufferCount: 1,
        queueSubmissionCount: 1,
        gpuTimestampQuerySupported: this.timestampQuerySupported,
        gpuTimestampQueryRequested: this.timestampQueryRequested,
        gpuTimestampQueryEnabled: this.timestampQueryEnabled,
        gpuTimestampMeasured,
        timingClassification: gpuTimestampMeasured
          ? 'gpu-timestamp-query'
          : this.timestampQueryRequested
            ? 'feature-not-enabled'
            : 'not-requested',
        timedScope: gpuTimestampMeasured
          ? 'character-color-through-temporal-resolve-gpu-scope'
          : 'not-measured',
        cpuMotionDerivationExcludedFromTimedScope: true,
        cpuToGpuUploadsExcludedFromTimedScope: true,
        historyCopiesExcludedFromTimedScope: true,
        evidenceAndTimestampReadbackExcludedFromTimedScope: true,
        durations,
        motionDerivation: motionFrame.receipt,
        color,
        motionDepth,
        resolve: encodedResolve.receipt,
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
    this.historyDepth.destroy();
    this.historyColor.destroy();
    this.outputColor.destroy();
    this.currentColor.destroy();
    this.motionRasterizer.destroy();
    this.characterRenderer.destroy();
  }
}
