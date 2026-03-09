/**
 * @holoscript/snn-webgpu - LIF Neuron Simulator
 *
 * High-level API for simulating a population of Leaky Integrate-and-Fire neurons
 * on the GPU. Manages buffer allocation, parameter upload, and dispatch.
 */

import type { GPUContext } from './gpu-context.js';
import { BufferManager } from './buffer-manager.js';
import { PipelineFactory } from './pipeline-factory.js';
import type { LIFParams, GPUBufferHandle, ReadbackResult } from './types.js';
import { DEFAULT_LIF_PARAMS, computeDispatchSize } from './types.js';

/** Internal uniform buffer layout (must match WGSL struct). */
const LIF_PARAMS_BYTE_SIZE = 32; // 8 x f32/u32 = 32 bytes

/**
 * Pack LIF parameters into a Float32Array matching the WGSL struct layout.
 *
 * struct LIFParams {
 *   tau: f32,
 *   v_threshold: f32,
 *   v_reset: f32,
 *   v_rest: f32,
 *   dt: f32,
 *   neuron_count: u32,
 *   _pad0: u32,
 *   _pad1: u32,
 * }
 */
function packLIFParams(params: LIFParams, neuronCount: number): ArrayBuffer {
  const buffer = new ArrayBuffer(LIF_PARAMS_BYTE_SIZE);
  const f32 = new Float32Array(buffer);
  const u32 = new Uint32Array(buffer);

  f32[0] = params.tau;
  f32[1] = params.vThreshold;
  f32[2] = params.vReset;
  f32[3] = params.vRest;
  f32[4] = params.dt;
  u32[5] = neuronCount;
  u32[6] = 0; // pad
  u32[7] = 0; // pad

  return buffer;
}

/**
 * Simulates a population of LIF neurons using WebGPU compute shaders.
 *
 * @example
 * ```ts
 * const ctx = new GPUContext();
 * await ctx.initialize();
 *
 * const sim = new LIFSimulator(ctx, 10000);
 * await sim.initialize();
 *
 * // Inject synaptic currents
 * sim.setSynapticInput(currentArray);
 *
 * // Step simulation
 * await sim.step();
 *
 * // Read spike output
 * const spikes = await sim.readSpikes();
 * ```
 */
export class LIFSimulator {
  private ctx: GPUContext;
  private bufferManager: BufferManager;
  private pipelineFactory: PipelineFactory;
  private neuronCount: number;
  private params: LIFParams;
  private initialized = false;

  // GPU buffers
  private paramsBuffer!: GPUBufferHandle;
  private membraneBuffer!: GPUBufferHandle;
  private synapticInputBuffer!: GPUBufferHandle;
  private spikesBuffer!: GPUBufferHandle;
  private refractoryBuffer!: GPUBufferHandle;

  // Bind group
  private bindGroup!: GPUBindGroup;

  // Simulation state
  private stepCount = 0;

  /**
   * @param ctx - Initialized GPUContext
   * @param neuronCount - Number of neurons to simulate
   * @param params - LIF parameters (optional, uses defaults)
   */
  constructor(ctx: GPUContext, neuronCount: number, params?: Partial<LIFParams>) {
    this.ctx = ctx;
    this.neuronCount = ctx.validateNeuronCapacity(neuronCount);
    this.params = { ...DEFAULT_LIF_PARAMS, ...params };
    this.bufferManager = new BufferManager(ctx.device);
    this.pipelineFactory = new PipelineFactory(ctx);
  }

  /**
   * Initialize GPU buffers and compute pipeline.
   * Must be called before step().
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    const n = this.neuronCount;

    // Create uniform params buffer
    const paramsData = packLIFParams(this.params, n);
    this.paramsBuffer = this.bufferManager.createBuffer({
      size: LIF_PARAMS_BYTE_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      label: 'lif-params',
      initialData: new Float32Array(paramsData),
      mappedAtCreation: true,
    });

    // Initialize membrane potentials to resting potential
    const initMembrane = new Float32Array(n).fill(this.params.vRest);
    this.membraneBuffer = this.bufferManager.createStorageBuffer(initMembrane, 'membrane-v');

    // Synaptic input (zeros initially)
    this.synapticInputBuffer = this.bufferManager.createZeroBuffer(n, 'synaptic-input');

    // Spikes output (zeros)
    this.spikesBuffer = this.bufferManager.createZeroBuffer(n, 'spikes');

    // Refractory counters (zeros)
    this.refractoryBuffer = this.bufferManager.createZeroBuffer(n, 'refractory');

    // Create bind group
    this.bindGroup = this.pipelineFactory.createBindGroup(
      'lif_step',
      [
        this.paramsBuffer.buffer,
        this.membraneBuffer.buffer,
        this.synapticInputBuffer.buffer,
        this.spikesBuffer.buffer,
        this.refractoryBuffer.buffer,
      ],
      'lif-bind-group'
    );

    this.initialized = true;
  }

  /**
   * Run one simulation timestep.
   * Dispatches the LIF compute shader across all neurons.
   */
  async step(): Promise<void> {
    this.ensureInitialized();

    const workgroups = computeDispatchSize(this.neuronCount);
    const encoder = this.ctx.device.createCommandEncoder({
      label: `lif-step-${this.stepCount}`,
    });

    this.pipelineFactory.encodeDispatch(encoder, 'lif_step', this.bindGroup, workgroups);

    await this.ctx.submitAndWait(encoder.finish());
    this.stepCount++;
  }

  /**
   * Run multiple simulation timesteps.
   */
  async stepN(count: number): Promise<void> {
    for (let i = 0; i < count; i++) {
      await this.step();
    }
  }

  /**
   * Set synaptic input currents for all neurons.
   */
  setSynapticInput(currents: Float32Array): void {
    this.ensureInitialized();
    if (currents.length !== this.neuronCount) {
      throw new Error(
        `Current array length (${currents.length}) must match neuron count (${this.neuronCount})`
      );
    }
    this.bufferManager.writeBuffer(this.synapticInputBuffer, currents);
  }

  /**
   * Update LIF parameters.
   */
  updateParams(params: Partial<LIFParams>): void {
    this.ensureInitialized();
    this.params = { ...this.params, ...params };
    const packed = packLIFParams(this.params, this.neuronCount);
    this.bufferManager.writeBuffer(this.paramsBuffer, new Float32Array(packed));
  }

  /**
   * Read spike output from the GPU.
   * Returns a Float32Array where 1.0 = spike, 0.0 = no spike.
   */
  async readSpikes(): Promise<ReadbackResult> {
    this.ensureInitialized();
    return this.bufferManager.readBuffer(this.spikesBuffer);
  }

  /**
   * Read membrane potentials from the GPU.
   */
  async readMembranePotentials(): Promise<ReadbackResult> {
    this.ensureInitialized();
    return this.bufferManager.readBuffer(this.membraneBuffer);
  }

  /**
   * Reset all neurons to resting state.
   */
  resetState(): void {
    this.ensureInitialized();
    const n = this.neuronCount;
    const rest = new Float32Array(n).fill(this.params.vRest);
    const zeros = new Float32Array(n);

    this.bufferManager.writeBuffer(this.membraneBuffer, rest);
    this.bufferManager.writeBuffer(this.synapticInputBuffer, zeros);
    this.bufferManager.writeBuffer(this.spikesBuffer, zeros);
    this.bufferManager.writeBuffer(this.refractoryBuffer, zeros);

    this.stepCount = 0;
  }

  /** Get the current simulation step count. */
  get currentStep(): number {
    return this.stepCount;
  }

  /** Get the number of neurons. */
  get count(): number {
    return this.neuronCount;
  }

  /** Get current LIF parameters. */
  get currentParams(): Readonly<LIFParams> {
    return { ...this.params };
  }

  /** Get total GPU memory used in bytes. */
  get gpuMemoryBytes(): number {
    return this.bufferManager.getTotalAllocatedBytes();
  }

  /**
   * Destroy all GPU resources.
   */
  destroy(): void {
    this.pipelineFactory.clearCache();
    this.bufferManager.destroyAll();
    this.initialized = false;
    this.stepCount = 0;
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('LIFSimulator not initialized. Call initialize() first.');
    }
  }
}
