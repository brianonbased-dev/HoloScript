/**
 * @holoscript/snn-webgpu - Spike Encoder/Decoder
 *
 * High-level API for converting between continuous spatial data
 * and spike trains using WebGPU compute shaders.
 */

import type { GPUContext } from './gpu-context.js';
import { BufferManager } from './buffer-manager.js';
import { PipelineFactory, type ShaderEntryPoint } from './pipeline-factory.js';
import type {
  EncodeParams,
  DecodeParams,
  GPUBufferHandle,
  ReadbackResult,
} from './types.js';
import {
  EncodingMode,
  DecodingMode,
  DEFAULT_ENCODE_PARAMS,
  DEFAULT_DECODE_PARAMS,
  computeDispatchSize,
} from './types.js';

/** Encode params uniform layout: 8 fields x 4 bytes = 32 bytes. */
const ENCODE_PARAMS_SIZE = 32;

/** Decode params uniform layout: 8 fields x 4 bytes = 32 bytes. */
const DECODE_PARAMS_SIZE = 32;

/** Map encoding mode to WGSL entry point. */
const ENCODE_ENTRY_POINTS: Record<EncodingMode, ShaderEntryPoint> = {
  [EncodingMode.Rate]: 'encode_rate',
  [EncodingMode.Temporal]: 'encode_temporal',
  [EncodingMode.Delta]: 'encode_delta',
};

/** Map decoding mode to WGSL entry point. */
const DECODE_ENTRY_POINTS: Record<DecodingMode, ShaderEntryPoint> = {
  [DecodingMode.Rate]: 'decode_rate',
  [DecodingMode.Temporal]: 'decode_temporal',
  [DecodingMode.Population]: 'decode_population',
  [DecodingMode.FirstSpike]: 'decode_first_spike',
};

/**
 * Pack EncodeParams into a buffer matching the WGSL struct.
 */
function packEncodeParams(params: EncodeParams): ArrayBuffer {
  const buf = new ArrayBuffer(ENCODE_PARAMS_SIZE);
  const u32 = new Uint32Array(buf);
  const f32 = new Float32Array(buf);

  u32[0] = params.dataCount;
  u32[1] = params.timeWindow;
  u32[2] = params.encodingMode;
  u32[3] = params.seed;
  f32[4] = params.minValue;
  f32[5] = params.maxValue;
  f32[6] = params.deltaThreshold;
  u32[7] = 0; // pad

  return buf;
}

/**
 * Pack DecodeParams into a buffer matching the WGSL struct.
 */
function packDecodeParams(params: DecodeParams): ArrayBuffer {
  const buf = new ArrayBuffer(DECODE_PARAMS_SIZE);
  const u32 = new Uint32Array(buf);
  const f32 = new Float32Array(buf);

  u32[0] = params.neuronCount;
  u32[1] = params.timeWindow;
  u32[2] = params.decodingMode;
  u32[3] = params.populationSize;
  f32[4] = params.outputMin;
  f32[5] = params.outputMax;
  u32[6] = 0; // pad
  u32[7] = 0; // pad

  return buf;
}

/**
 * Encodes continuous data into spike trains on the GPU.
 *
 * @example
 * ```ts
 * const encoder = new SpikeEncoder(ctx, {
 *   dataCount: 1000,
 *   timeWindow: 100,
 *   encodingMode: EncodingMode.Rate,
 * });
 * await encoder.initialize();
 * await encoder.encode(inputData);
 * const spikes = await encoder.readSpikeTrains();
 * ```
 */
export class SpikeEncoder {
  private ctx: GPUContext;
  private bufferManager: BufferManager;
  private pipelineFactory: PipelineFactory;
  private params: EncodeParams;
  private initialized = false;

  private paramsBuffer!: GPUBufferHandle;
  private inputBuffer!: GPUBufferHandle;
  private prevDataBuffer!: GPUBufferHandle;
  private spikeTrainBuffer!: GPUBufferHandle;
  private bindGroup!: GPUBindGroup;

  constructor(ctx: GPUContext, params: Partial<EncodeParams> & { dataCount: number }) {
    this.ctx = ctx;
    this.params = { ...DEFAULT_ENCODE_PARAMS, ...params };
    this.bufferManager = new BufferManager(ctx.device);
    this.pipelineFactory = new PipelineFactory(ctx);
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    const { dataCount, timeWindow } = this.params;

    // Params uniform
    const packedParams = packEncodeParams(this.params);
    this.paramsBuffer = this.bufferManager.createBuffer({
      size: ENCODE_PARAMS_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      label: 'encode-params',
      initialData: new Float32Array(packedParams),
    });

    // Input data buffer
    this.inputBuffer = this.bufferManager.createZeroBuffer(dataCount, 'encode-input');

    // Previous data buffer (for delta coding)
    this.prevDataBuffer = this.bufferManager.createZeroBuffer(dataCount, 'encode-prev');

    // Output spike train: [dataCount * timeWindow]
    const spikeTrainSize = dataCount * timeWindow;
    this.spikeTrainBuffer = this.bufferManager.createZeroBuffer(spikeTrainSize, 'spike-train');

    // Bind group
    const entryPoint = ENCODE_ENTRY_POINTS[this.params.encodingMode];
    this.bindGroup = this.pipelineFactory.createBindGroup(entryPoint, [
      this.paramsBuffer.buffer,
      this.inputBuffer.buffer,
      this.prevDataBuffer.buffer,
      this.spikeTrainBuffer.buffer,
    ], 'encode-bind-group');

    this.initialized = true;
  }

  /**
   * Encode input data into spike trains.
   */
  async encode(data: Float32Array): Promise<void> {
    this.ensureInitialized();
    if (data.length !== this.params.dataCount) {
      throw new Error(
        `Input data length (${data.length}) must match dataCount (${this.params.dataCount})`,
      );
    }

    // Upload input data
    this.bufferManager.writeBuffer(this.inputBuffer, data);

    // Update seed for stochastic encoding
    this.params.seed = (this.params.seed + 1) | 0;
    const packedParams = packEncodeParams(this.params);
    this.bufferManager.writeBuffer(this.paramsBuffer, new Float32Array(packedParams));

    // Dispatch
    const entryPoint = ENCODE_ENTRY_POINTS[this.params.encodingMode];
    const workgroups = computeDispatchSize(this.params.dataCount);
    const encoder = this.ctx.device.createCommandEncoder({ label: 'encode-dispatch' });

    this.pipelineFactory.encodeDispatch(encoder, entryPoint, this.bindGroup, workgroups);
    await this.ctx.submitAndWait(encoder.finish());
  }

  /**
   * Read the generated spike trains back to CPU.
   * Returns [dataCount * timeWindow] float array.
   */
  async readSpikeTrains(): Promise<ReadbackResult> {
    this.ensureInitialized();
    return this.bufferManager.readBuffer(this.spikeTrainBuffer);
  }

  /** Get the spike train GPU buffer handle (for chaining to decoders or networks). */
  get spikeTrainHandle(): GPUBufferHandle {
    this.ensureInitialized();
    return this.spikeTrainBuffer;
  }

  destroy(): void {
    this.pipelineFactory.clearCache();
    this.bufferManager.destroyAll();
    this.initialized = false;
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('SpikeEncoder not initialized. Call initialize() first.');
    }
  }
}

/**
 * Decodes spike trains back into continuous values on the GPU.
 *
 * @example
 * ```ts
 * const decoder = new SpikeDecoder(ctx, {
 *   neuronCount: 1000,
 *   timeWindow: 100,
 *   decodingMode: DecodingMode.Rate,
 * });
 * await decoder.initialize();
 * await decoder.decode(spikeTrainBuffer);
 * const values = await decoder.readOutput();
 * ```
 */
export class SpikeDecoder {
  private ctx: GPUContext;
  private bufferManager: BufferManager;
  private pipelineFactory: PipelineFactory;
  private params: DecodeParams;
  private initialized = false;

  private paramsBuffer!: GPUBufferHandle;
  private spikeTrainBuffer!: GPUBufferHandle;
  private outputBuffer!: GPUBufferHandle;
  private tuningCurveBuffer!: GPUBufferHandle;
  private bindGroup!: GPUBindGroup;
  private ownsSpikeTrain = false;

  constructor(
    ctx: GPUContext,
    params: Partial<DecodeParams> & { neuronCount: number; timeWindow: number },
  ) {
    this.ctx = ctx;
    this.params = { ...DEFAULT_DECODE_PARAMS, ...params };
    this.bufferManager = new BufferManager(ctx.device);
    this.pipelineFactory = new PipelineFactory(ctx);
  }

  async initialize(externalSpikeTrainBuffer?: GPUBufferHandle): Promise<void> {
    if (this.initialized) return;

    const { neuronCount, timeWindow, populationSize, decodingMode } = this.params;

    // Params uniform
    const packedParams = packDecodeParams(this.params);
    this.paramsBuffer = this.bufferManager.createBuffer({
      size: DECODE_PARAMS_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      label: 'decode-params',
      initialData: new Float32Array(packedParams),
    });

    // Spike train input
    if (externalSpikeTrainBuffer) {
      this.spikeTrainBuffer = externalSpikeTrainBuffer;
      this.ownsSpikeTrain = false;
    } else {
      const spikeTrainSize = neuronCount * timeWindow;
      this.spikeTrainBuffer = this.bufferManager.createZeroBuffer(spikeTrainSize, 'decode-spike-train');
      this.ownsSpikeTrain = true;
    }

    // Output
    const outputCount =
      decodingMode === DecodingMode.Population || decodingMode === DecodingMode.FirstSpike
        ? Math.ceil(neuronCount / populationSize)
        : neuronCount;
    this.outputBuffer = this.bufferManager.createZeroBuffer(outputCount, 'decode-output');

    // Tuning curves (for population/first-spike decoding)
    const tuningData = new Float32Array(neuronCount);
    for (let i = 0; i < neuronCount; i++) {
      // Default linear tuning curves within each population
      const popIndex = i % populationSize;
      tuningData[i] = popIndex / (populationSize - 1 || 1);
    }
    this.tuningCurveBuffer = this.bufferManager.createStorageBuffer(
      tuningData,
      'tuning-curves',
    );

    // Bind group
    const entryPoint = DECODE_ENTRY_POINTS[decodingMode];
    this.bindGroup = this.pipelineFactory.createBindGroup(entryPoint, [
      this.paramsBuffer.buffer,
      this.spikeTrainBuffer.buffer,
      this.outputBuffer.buffer,
      this.tuningCurveBuffer.buffer,
    ], 'decode-bind-group');

    this.initialized = true;
  }

  /**
   * Decode spike trains into continuous values.
   * If spikeTrainData is provided, uploads it first; otherwise uses the buffer as-is.
   */
  async decode(spikeTrainData?: Float32Array): Promise<void> {
    this.ensureInitialized();

    if (spikeTrainData) {
      this.bufferManager.writeBuffer(this.spikeTrainBuffer, spikeTrainData);
    }

    const entryPoint = DECODE_ENTRY_POINTS[this.params.decodingMode];
    const dispatchCount =
      this.params.decodingMode === DecodingMode.Population ||
      this.params.decodingMode === DecodingMode.FirstSpike
        ? Math.ceil(this.params.neuronCount / this.params.populationSize)
        : this.params.neuronCount;

    const workgroups = computeDispatchSize(dispatchCount);
    const encoder = this.ctx.device.createCommandEncoder({ label: 'decode-dispatch' });

    this.pipelineFactory.encodeDispatch(encoder, entryPoint, this.bindGroup, workgroups);
    await this.ctx.submitAndWait(encoder.finish());
  }

  /**
   * Read decoded output values from GPU.
   */
  async readOutput(): Promise<ReadbackResult> {
    this.ensureInitialized();
    return this.bufferManager.readBuffer(this.outputBuffer);
  }

  /**
   * Set custom tuning curves for population decoding.
   */
  setTuningCurves(curves: Float32Array): void {
    this.ensureInitialized();
    this.bufferManager.writeBuffer(this.tuningCurveBuffer, curves);
  }

  destroy(): void {
    this.pipelineFactory.clearCache();
    this.bufferManager.destroyAll();
    this.initialized = false;
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('SpikeDecoder not initialized. Call initialize() first.');
    }
  }
}
