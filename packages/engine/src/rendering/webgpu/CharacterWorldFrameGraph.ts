/**
 * Four-resident native WebGPU world-frame graph.
 *
 * Each resident records color, motion/depth, and temporal resolve into one
 * caller-owned encoder. Their persistent output textures feed a zero-copy 2x2
 * composite pass before one command-buffer submission.
 */

import type { CharacterDrawSpec } from '../../native-render/draw-spec';
import type { PixelGrid } from '../../native-render/gpu-verify';
import {
  CharacterTemporalFrameGraph,
  type CharacterTemporalFrameGraphInput,
  type CharacterTemporalFrameGraphReceipt,
  type CharacterTemporalStageDurations,
  type EncodedCharacterTemporalFrame,
} from './CharacterTemporalFrameGraph';

const BUFFER_COPY_SRC = 0x0004;
const BUFFER_COPY_DST = 0x0008;
const BUFFER_MAP_READ = 0x0001;
const BUFFER_QUERY_RESOLVE = 0x0200;
const MAP_READ = 0x0001;
const TEXTURE_COPY_SRC = 0x01;
const TEXTURE_BINDING = 0x04;
const TEXTURE_STORAGE_BINDING = 0x08;
const RESIDENT_COUNT = 4;
const QUERIES_PER_RESIDENT = 6;
const COMPOSITE_QUERY_BEGIN = RESIDENT_COUNT * QUERIES_PER_RESIDENT;
const COMPOSITE_QUERY_END = COMPOSITE_QUERY_BEGIN + 1;
const QUERY_COUNT = COMPOSITE_QUERY_END + 1;

const COMPOSITE_WGSL = /* wgsl */ `
@group(0) @binding(0) var resident0: texture_2d<f32>;
@group(0) @binding(1) var resident1: texture_2d<f32>;
@group(0) @binding(2) var resident2: texture_2d<f32>;
@group(0) @binding(3) var resident3: texture_2d<f32>;
@group(0) @binding(4) var composite: texture_storage_2d<rgba8unorm, write>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let outputDimensions = textureDimensions(composite);
  if (gid.x >= outputDimensions.x || gid.y >= outputDimensions.y) {
    return;
  }

  let tileDimensions = textureDimensions(resident0);
  let local = vec2i(i32(gid.x % tileDimensions.x), i32(gid.y % tileDimensions.y));
  var color: vec4f;
  if (gid.y < tileDimensions.y) {
    if (gid.x < tileDimensions.x) {
      color = textureLoad(resident0, local, 0);
    } else {
      color = textureLoad(resident1, local, 0);
    }
  } else {
    if (gid.x < tileDimensions.x) {
      color = textureLoad(resident2, local, 0);
    } else {
      color = textureLoad(resident3, local, 0);
    }
  }
  textureStore(composite, vec2i(gid.xy), color);
}
`;

export interface CharacterWorldResidentDefinition {
  id: string;
  initialSpec: CharacterDrawSpec;
}

export interface CharacterWorldFrameGraphOptions {
  tileWidth: number;
  tileHeight: number;
  enableGpuTimestamps?: boolean;
  label?: string;
}

export interface CharacterWorldResidentFrameInput {
  id: string;
  input: Omit<CharacterTemporalFrameGraphInput, 'capturePixels'>;
}

export interface CharacterWorldFrameGraphInput {
  residents: readonly CharacterWorldResidentFrameInput[];
  capturePixels?: boolean;
}

export interface CharacterWorldResidentDurations extends CharacterTemporalStageDurations {
  id: string;
}

export interface CharacterWorldFrameDurations {
  residents: CharacterWorldResidentDurations[];
  compositeNanoseconds: number | null;
  aggregateNanoseconds: number | null;
}

export interface CharacterWorldCompositeReceipt {
  schemaVersion: 'holoscript.webgpu-character-world-composite.v1';
  backend: 'webgpu';
  layout: 'two-by-two';
  inputTextureCount: 4;
  zeroCopyResidentTextureInputs: true;
  persistentPipeline: true;
  persistentBindGroup: true;
  persistentOutputTexture: true;
  gpuTimestampWritesEncoded: boolean;
  workgroupSize: [8, 8, 1];
  dispatch: [number, number, 1];
}

export interface CharacterWorldResidentReceipt {
  id: string;
  temporalFrame: CharacterTemporalFrameGraphReceipt;
}

export interface CharacterWorldFrameGraphReceipt {
  schemaVersion: 'holoscript.webgpu-character-world-frame-graph.v1';
  backend: 'webgpu';
  deviceExecutionMeasured: true;
  frameIndex: number;
  residentCount: 4;
  tileWidth: number;
  tileHeight: number;
  outputWidth: number;
  outputHeight: number;
  layout: 'two-by-two';
  fixedTopology: true;
  persistentGpuResources: true;
  residentReceiptsShareCommandBuffer: true;
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
  timedScope:
    | 'four-character-color-motion-depth-temporal-through-composite-gpu-scope'
    | 'not-measured';
  cpuMotionDerivationExcludedFromTimedScope: true;
  cpuToGpuUploadsExcludedFromTimedScope: true;
  historyCopiesExcludedFromTimedScope: true;
  evidenceAndTimestampReadbackExcludedFromTimedScope: true;
  durations: CharacterWorldFrameDurations;
  residents: CharacterWorldResidentReceipt[];
  composite: CharacterWorldCompositeReceipt;
}

export interface CharacterWorldFrameGraphResult {
  outputTexture: GPUTexture;
  pixels: PixelGrid | null;
  receipt: CharacterWorldFrameGraphReceipt;
}

function assertDimension(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive integer`);
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

/** Fixed four-resident, single-submission character world frame. */
export class CharacterWorldFrameGraph {
  readonly tileWidth: number;
  readonly tileHeight: number;
  readonly outputWidth: number;
  readonly outputHeight: number;
  readonly timestampQuerySupported: boolean;
  readonly timestampQueryRequested: boolean;
  readonly timestampQueryEnabled: boolean;

  private readonly device: GPUDevice;
  private readonly label: string;
  private readonly residentIds: string[];
  private readonly residents: CharacterTemporalFrameGraph[];
  private readonly output: GPUTexture;
  private readonly compositePipeline: GPUComputePipeline;
  private readonly compositeBindGroup: GPUBindGroup;
  private readonly timestampQuerySet: GPUQuerySet | null;
  private readonly timestampResolveBuffer: GPUBuffer | null;
  private readonly timestampReadbackBuffer: GPUBuffer | null;
  private frameIndex = 0;
  private executing = false;
  private destroyed = false;

  constructor(
    device: GPUDevice,
    initialResidents: readonly CharacterWorldResidentDefinition[],
    options: CharacterWorldFrameGraphOptions
  ) {
    assertDimension(options.tileWidth, 'character world tileWidth');
    assertDimension(options.tileHeight, 'character world tileHeight');
    if (initialResidents.length !== RESIDENT_COUNT) {
      throw new Error('character world frame graph requires exactly four residents');
    }
    const ids = initialResidents.map((resident) => resident.id);
    if (ids.some((id) => !id) || new Set(ids).size !== RESIDENT_COUNT) {
      throw new Error('character world frame graph resident ids must be non-empty and unique');
    }

    this.device = device;
    this.tileWidth = options.tileWidth;
    this.tileHeight = options.tileHeight;
    this.outputWidth = this.tileWidth * 2;
    this.outputHeight = this.tileHeight * 2;
    this.label = options.label ?? 'holoscript-character-world-frame-graph';
    this.residentIds = ids;
    this.timestampQuerySupported = device.features.has('timestamp-query');
    this.timestampQueryRequested = options.enableGpuTimestamps ?? true;
    this.timestampQueryEnabled = this.timestampQueryRequested && this.timestampQuerySupported;
    this.residents = initialResidents.map(
      (resident, index) =>
        new CharacterTemporalFrameGraph(device, resident.initialSpec, {
          width: this.tileWidth,
          height: this.tileHeight,
          enableGpuTimestamps: false,
          label: `${this.label}-resident-${index}-${resident.id}`,
        })
    );
    this.output = device.createTexture({
      label: `${this.label}-composite-output`,
      size: [this.outputWidth, this.outputHeight],
      format: 'rgba8unorm',
      usage: TEXTURE_STORAGE_BINDING | TEXTURE_BINDING | TEXTURE_COPY_SRC,
    });
    const module = device.createShaderModule({
      label: `${this.label}-composite-shader`,
      code: COMPOSITE_WGSL,
    });
    this.compositePipeline = device.createComputePipeline({
      label: `${this.label}-composite-pipeline`,
      layout: 'auto',
      compute: { module, entryPoint: 'main' },
    });
    this.compositeBindGroup = device.createBindGroup({
      label: `${this.label}-composite-bind-group`,
      layout: this.compositePipeline.getBindGroupLayout(0),
      entries: [
        ...this.residents.map((resident, binding) => ({
          binding,
          resource: resident.outputTexture.createView(),
        })),
        { binding: 4, resource: this.output.createView() },
      ],
    });

    if (this.timestampQueryEnabled) {
      const timestampBytes = QUERY_COUNT * 8;
      this.timestampQuerySet = device.createQuerySet({
        label: `${this.label}-timestamps`,
        type: 'timestamp',
        count: QUERY_COUNT,
      });
      this.timestampResolveBuffer = device.createBuffer({
        label: `${this.label}-timestamp-resolve`,
        size: timestampBytes,
        usage: BUFFER_QUERY_RESOLVE | BUFFER_COPY_SRC,
      });
      this.timestampReadbackBuffer = device.createBuffer({
        label: `${this.label}-timestamp-readback`,
        size: timestampBytes,
        usage: BUFFER_COPY_DST | BUFFER_MAP_READ,
      });
    } else {
      this.timestampQuerySet = null;
      this.timestampResolveBuffer = null;
      this.timestampReadbackBuffer = null;
    }
  }

  get outputTexture(): GPUTexture {
    return this.output;
  }

  resetHistory(): void {
    for (const resident of this.residents) resident.resetHistory();
  }

  async execute(input: CharacterWorldFrameGraphInput): Promise<CharacterWorldFrameGraphResult> {
    if (this.destroyed) throw new Error('character world frame graph is destroyed');
    if (this.executing)
      throw new Error('character world frame graph execute calls must be serialized');
    if (input.residents.length !== RESIDENT_COUNT) {
      throw new Error('character world frame input requires exactly four residents');
    }
    input.residents.forEach((resident, index) => {
      if (resident.id !== this.residentIds[index]) {
        throw new Error('character world frame resident order must match fixed topology');
      }
    });

    this.executing = true;
    const encodedResidents: EncodedCharacterTemporalFrame[] = [];
    let evidenceReadback: GPUBuffer | null = null;
    try {
      const encoder = this.device.createCommandEncoder({
        label: `${this.label}-frame-${this.frameIndex}`,
      });
      for (let index = 0; index < RESIDENT_COUNT; index += 1) {
        const queryBase = index * QUERIES_PER_RESIDENT;
        const timestampWrites = this.timestampQuerySet
          ? {
              color: {
                querySet: this.timestampQuerySet,
                beginningOfPassWriteIndex: queryBase,
                endOfPassWriteIndex: queryBase + 1,
              },
              motionDepth: {
                querySet: this.timestampQuerySet,
                beginningOfPassWriteIndex: queryBase + 2,
                endOfPassWriteIndex: queryBase + 3,
              },
              temporalResolve: {
                querySet: this.timestampQuerySet,
                beginningOfPassWriteIndex: queryBase + 4,
                endOfPassWriteIndex: queryBase + 5,
              },
            }
          : undefined;
        encodedResidents.push(
          this.residents[index].encodeInto(encoder, input.residents[index].input, timestampWrites)
        );
      }

      const compositeTimestampWrites = this.timestampQuerySet
        ? {
            querySet: this.timestampQuerySet,
            beginningOfPassWriteIndex: COMPOSITE_QUERY_BEGIN,
            endOfPassWriteIndex: COMPOSITE_QUERY_END,
          }
        : undefined;
      const compositePass = encoder.beginComputePass({
        label: `${this.label}-composite-pass`,
        timestampWrites: compositeTimestampWrites,
      });
      compositePass.setPipeline(this.compositePipeline);
      compositePass.setBindGroup(0, this.compositeBindGroup);
      const dispatch: [number, number, 1] = [
        Math.ceil(this.outputWidth / 8),
        Math.ceil(this.outputHeight / 8),
        1,
      ];
      compositePass.dispatchWorkgroups(...dispatch);
      compositePass.end();

      // History copies occur after the shared aggregate timestamp endpoint.
      for (const resident of encodedResidents) resident.encodeHistoryCommit(encoder);

      const evidenceBytesPerRow = alignedBytesPerRow(this.outputWidth);
      evidenceReadback = input.capturePixels
        ? this.device.createBuffer({
            label: `${this.label}-frame-${this.frameIndex}-evidence`,
            size: evidenceBytesPerRow * this.outputHeight,
            usage: BUFFER_COPY_DST | BUFFER_MAP_READ,
          })
        : null;
      if (evidenceReadback) {
        encoder.copyTextureToBuffer(
          { texture: this.output },
          {
            buffer: evidenceReadback,
            bytesPerRow: evidenceBytesPerRow,
            rowsPerImage: this.outputHeight,
          },
          [this.outputWidth, this.outputHeight]
        );
      }
      if (this.timestampQuerySet && this.timestampResolveBuffer && this.timestampReadbackBuffer) {
        encoder.resolveQuerySet(
          this.timestampQuerySet,
          0,
          QUERY_COUNT,
          this.timestampResolveBuffer,
          0
        );
        encoder.copyBufferToBuffer(
          this.timestampResolveBuffer,
          0,
          this.timestampReadbackBuffer,
          0,
          QUERY_COUNT * 8
        );
      }

      this.device.queue.submit([encoder.finish()]);
      const waits: Promise<void>[] = [];
      if (evidenceReadback) waits.push(evidenceReadback.mapAsync(MAP_READ));
      if (this.timestampReadbackBuffer) waits.push(this.timestampReadbackBuffer.mapAsync(MAP_READ));
      if (waits.length > 0) await Promise.all(waits);
      else await this.device.queue.onSubmittedWorkDone();

      const durations: CharacterWorldFrameDurations = {
        residents: this.residentIds.map((id) => ({
          id,
          characterColorNanoseconds: null,
          motionDepthNanoseconds: null,
          temporalResolveNanoseconds: null,
          aggregateNanoseconds: null,
        })),
        compositeNanoseconds: null,
        aggregateNanoseconds: null,
      };
      if (this.timestampReadbackBuffer) {
        const timestamps = new BigUint64Array(
          this.timestampReadbackBuffer.getMappedRange().slice(0)
        ) as BigUint64Array<ArrayBuffer>;
        for (let index = 0; index < RESIDENT_COUNT; index += 1) {
          const queryBase = index * QUERIES_PER_RESIDENT;
          durations.residents[index].characterColorNanoseconds = timestampDuration(
            timestamps,
            queryBase,
            queryBase + 1
          );
          durations.residents[index].motionDepthNanoseconds = timestampDuration(
            timestamps,
            queryBase + 2,
            queryBase + 3
          );
          durations.residents[index].temporalResolveNanoseconds = timestampDuration(
            timestamps,
            queryBase + 4,
            queryBase + 5
          );
          durations.residents[index].aggregateNanoseconds = timestampDuration(
            timestamps,
            queryBase,
            queryBase + 5
          );
        }
        durations.compositeNanoseconds = timestampDuration(
          timestamps,
          COMPOSITE_QUERY_BEGIN,
          COMPOSITE_QUERY_END
        );
        durations.aggregateNanoseconds = timestampDuration(timestamps, 0, COMPOSITE_QUERY_END);
        this.timestampReadbackBuffer.unmap();
      }

      let pixels: PixelGrid | null = null;
      if (evidenceReadback) {
        const mapped = new Uint8Array(evidenceReadback.getMappedRange());
        const data = new Uint8Array(this.outputWidth * this.outputHeight * 4);
        const unpaddedBytesPerRow = this.outputWidth * 4;
        for (let row = 0; row < this.outputHeight; row += 1) {
          data.set(
            mapped.subarray(
              row * evidenceBytesPerRow,
              row * evidenceBytesPerRow + unpaddedBytesPerRow
            ),
            row * unpaddedBytesPerRow
          );
        }
        evidenceReadback.unmap();
        pixels = { width: this.outputWidth, height: this.outputHeight, data };
      }

      const residentReceipts = encodedResidents.map((resident, index) => ({
        id: this.residentIds[index],
        temporalFrame: resident.complete(durations.residents[index], {
          evidenceFrameReadbackCount: 0,
          timestampMetadataReadbackCount: 0,
          gpuTimestampQueryRequested: this.timestampQueryRequested,
          gpuTimestampQueryEnabled: this.timestampQueryEnabled,
        }),
      }));
      encodedResidents.length = 0;

      const gpuTimestampMeasured =
        durations.aggregateNanoseconds !== null &&
        durations.compositeNanoseconds !== null &&
        durations.residents.every((resident) =>
          [
            resident.characterColorNanoseconds,
            resident.motionDepthNanoseconds,
            resident.temporalResolveNanoseconds,
            resident.aggregateNanoseconds,
          ].every((duration) => duration !== null)
        );
      const receipt: CharacterWorldFrameGraphReceipt = {
        schemaVersion: 'holoscript.webgpu-character-world-frame-graph.v1',
        backend: 'webgpu',
        deviceExecutionMeasured: true,
        frameIndex: this.frameIndex,
        residentCount: 4,
        tileWidth: this.tileWidth,
        tileHeight: this.tileHeight,
        outputWidth: this.outputWidth,
        outputHeight: this.outputHeight,
        layout: 'two-by-two',
        fixedTopology: true,
        persistentGpuResources: true,
        residentReceiptsShareCommandBuffer: true,
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
          ? 'four-character-color-motion-depth-temporal-through-composite-gpu-scope'
          : 'not-measured',
        cpuMotionDerivationExcludedFromTimedScope: true,
        cpuToGpuUploadsExcludedFromTimedScope: true,
        historyCopiesExcludedFromTimedScope: true,
        evidenceAndTimestampReadbackExcludedFromTimedScope: true,
        durations,
        residents: residentReceipts,
        composite: {
          schemaVersion: 'holoscript.webgpu-character-world-composite.v1',
          backend: 'webgpu',
          layout: 'two-by-two',
          inputTextureCount: 4,
          zeroCopyResidentTextureInputs: true,
          persistentPipeline: true,
          persistentBindGroup: true,
          persistentOutputTexture: true,
          gpuTimestampWritesEncoded: this.timestampQueryEnabled,
          workgroupSize: [8, 8, 1],
          dispatch,
        },
      };
      this.frameIndex += 1;
      return { outputTexture: this.output, pixels, receipt };
    } finally {
      evidenceReadback?.destroy();
      for (const resident of encodedResidents) resident.cancel();
      this.executing = false;
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    if (this.executing)
      throw new Error('cannot destroy character world frame graph while executing');
    this.destroyed = true;
    this.timestampReadbackBuffer?.destroy();
    this.timestampResolveBuffer?.destroy();
    this.timestampQuerySet?.destroy();
    this.output.destroy();
    for (const resident of this.residents) resident.destroy();
  }
}
