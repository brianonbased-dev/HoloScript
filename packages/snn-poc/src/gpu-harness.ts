/**
 * GPU Harness for LIF Neuron PoC
 *
 * Minimal TypeScript harness that:
 * 1. Initializes a WebGPU device
 * 2. Creates storage buffers for 1000 LIF neurons
 * 3. Dispatches the LIF compute shader
 * 4. Reads back spike data
 *
 * This is the standalone $1 validation PoC from RFC-0042.
 *
 * @module @holoscript/snn-poc
 */

import lifShaderSource from './shaders/lif-neuron-poc.wgsl';
import _propagationShaderSource from './shaders/spike-propagation.wgsl';
import type { LIFParams, PocConfig } from './types.js';
import { _DEFAULT_LIF_PARAMS, DEFAULT_POC_CONFIG } from './types.js';

/** Byte size of the LIF params uniform struct (8 x 4 bytes) */
const LIF_PARAMS_SIZE = 32;

/** Byte size of the propagation params uniform struct (4 x 4 bytes) */
const PROPAGATION_PARAMS_SIZE = 16;

/**
 * Pack LIF parameters into an ArrayBuffer matching the WGSL struct layout.
 */
function packLIFParams(params: LIFParams, neuronCount: number): ArrayBuffer {
  const buf = new ArrayBuffer(LIF_PARAMS_SIZE);
  const f32 = new Float32Array(buf);
  const u32 = new Uint32Array(buf);
  f32[0] = params.tau;
  f32[1] = params.vThreshold;
  f32[2] = params.vReset;
  f32[3] = params.vRest;
  f32[4] = params.dt;
  u32[5] = neuronCount;
  u32[6] = 0; // pad
  u32[7] = 0; // pad
  return buf;
}

/**
 * Pack propagation parameters into an ArrayBuffer.
 */
function _packPropagationParams(
  preCount: number,
  postCount: number,
  fixedScale: number
): ArrayBuffer {
  const buf = new ArrayBuffer(PROPAGATION_PARAMS_SIZE);
  const u32 = new Uint32Array(buf);
  const f32 = new Float32Array(buf);
  u32[0] = preCount;
  u32[1] = postCount;
  f32[2] = fixedScale;
  u32[3] = 0; // pad
  return buf;
}

/**
 * GPU LIF Neuron Harness
 *
 * Manages WebGPU resources and dispatch for the LIF neuron PoC.
 */
export class GPUHarness {
  private device: GPUDevice | null = null;
  private config: PocConfig;

  // LIF pipeline resources
  private lifPipeline: GPUComputePipeline | null = null;
  private lifBindGroup: GPUBindGroup | null = null;
  private paramsBuffer: GPUBuffer | null = null;
  private membraneBuffer: GPUBuffer | null = null;
  private synapticInputBuffer: GPUBuffer | null = null;
  private spikesBuffer: GPUBuffer | null = null;
  private refractoryBuffer: GPUBuffer | null = null;

  // Readback staging buffers
  private spikeReadbackBuffer: GPUBuffer | null = null;
  private membraneReadbackBuffer: GPUBuffer | null = null;

  // Propagation pipeline resources
  private propagationPipeline: GPUComputePipeline | null = null;
  private convertPipeline: GPUComputePipeline | null = null;

  private initialized = false;
  private stepCount = 0;

  constructor(config?: Partial<PocConfig>) {
    this.config = { ...DEFAULT_POC_CONFIG, ...config };
  }

  /**
   * Initialize WebGPU device and create all GPU resources.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // 1. Request adapter and device
    if (typeof navigator === 'undefined' || !navigator.gpu) {
      throw new Error(
        'WebGPU is not available. Run in a WebGPU-capable browser or Node.js with WebGPU bindings.'
      );
    }

    const adapter = await navigator.gpu.requestAdapter({
      powerPreference: 'high-performance',
    });
    if (!adapter) {
      throw new Error('Failed to obtain WebGPU adapter.');
    }

    this.device = await adapter.requestDevice({
      label: 'snn-poc-device',
    });

    this.device.lost.then((info) => {
      console.error(`[snn-poc] GPU device lost: ${info.message}`);
      this.initialized = false;
    });

    const n = this.config.neuronCount;
    const dev = this.device;

    // 2. Create LIF shader module and pipeline
    const lifModule = dev.createShaderModule({
      label: 'lif-neuron-poc',
      code: lifShaderSource,
    });

    this.lifPipeline = dev.createComputePipeline({
      label: 'lif-pipeline',
      layout: 'auto',
      compute: { module: lifModule, entryPoint: 'lif_update' },
    });

    // 3. Create storage buffers for N neurons
    const paramsData = packLIFParams(this.config.lifParams, n);

    this.paramsBuffer = dev.createBuffer({
      label: 'lif-params',
      size: LIF_PARAMS_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    dev.queue.writeBuffer(this.paramsBuffer, 0, paramsData);

    // Initialize membrane potentials to resting potential
    const initMembrane = new Float32Array(n).fill(this.config.lifParams.vRest);
    this.membraneBuffer = dev.createBuffer({
      label: 'membrane-v',
      size: n * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
    });
    dev.queue.writeBuffer(this.membraneBuffer, 0, initMembrane);

    // Synaptic input (zeroed, will be written before each step)
    this.synapticInputBuffer = dev.createBuffer({
      label: 'synaptic-input',
      size: n * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    // Spikes output (u32)
    this.spikesBuffer = dev.createBuffer({
      label: 'spikes',
      size: n * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
    });

    // Refractory counters
    this.refractoryBuffer = dev.createBuffer({
      label: 'refractory',
      size: n * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
    });

    // Readback staging buffers
    this.spikeReadbackBuffer = dev.createBuffer({
      label: 'spike-readback',
      size: n * 4,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });

    this.membraneReadbackBuffer = dev.createBuffer({
      label: 'membrane-readback',
      size: n * 4,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });

    // 4. Create bind group
    this.lifBindGroup = dev.createBindGroup({
      label: 'lif-bind-group',
      layout: this.lifPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.paramsBuffer } },
        { binding: 1, resource: { buffer: this.membraneBuffer } },
        { binding: 2, resource: { buffer: this.synapticInputBuffer } },
        { binding: 3, resource: { buffer: this.spikesBuffer } },
        { binding: 4, resource: { buffer: this.refractoryBuffer } },
      ],
    });

    this.initialized = true;
  }

  /**
   * Write synaptic input currents to the GPU buffer.
   */
  writeSynapticInput(input: Float32Array): void {
    this.ensureInitialized();
    if (input.length !== this.config.neuronCount) {
      throw new Error(`Input length ${input.length} !== neuron count ${this.config.neuronCount}`);
    }
    this.device!.queue.writeBuffer(this.synapticInputBuffer!, 0, input.buffer);
  }

  /**
   * Run one simulation timestep.
   */
  async step(): Promise<void> {
    this.ensureInitialized();

    const workgroups = Math.ceil(this.config.neuronCount / this.config.workgroupSize);
    const encoder = this.device!.createCommandEncoder({ label: `lif-step-${this.stepCount}` });

    const pass = encoder.beginComputePass({ label: 'lif-update' });
    pass.setPipeline(this.lifPipeline!);
    pass.setBindGroup(0, this.lifBindGroup!);
    pass.dispatchWorkgroups(workgroups);
    pass.end();

    this.device!.queue.submit([encoder.finish()]);
    await this.device!.queue.onSubmittedWorkDone();
    this.stepCount++;
  }

  /**
   * Run N timesteps with the same synaptic input.
   */
  async stepN(count: number): Promise<void> {
    for (let i = 0; i < count; i++) {
      await this.step();
    }
  }

  /**
   * Read spike output from the GPU.
   * Returns Uint32Array where 1 = spiked, 0 = no spike.
   */
  async readSpikes(): Promise<Uint32Array> {
    this.ensureInitialized();

    const n = this.config.neuronCount;
    const encoder = this.device!.createCommandEncoder({ label: 'spike-readback' });
    encoder.copyBufferToBuffer(this.spikesBuffer!, 0, this.spikeReadbackBuffer!, 0, n * 4);
    this.device!.queue.submit([encoder.finish()]);

    await this.spikeReadbackBuffer!.mapAsync(GPUMapMode.READ);
    const data = new Uint32Array(this.spikeReadbackBuffer!.getMappedRange().slice(0));
    this.spikeReadbackBuffer!.unmap();

    return data;
  }

  /**
   * Read membrane potentials from the GPU.
   */
  async readMembrane(): Promise<Float32Array> {
    this.ensureInitialized();

    const n = this.config.neuronCount;
    const encoder = this.device!.createCommandEncoder({ label: 'membrane-readback' });
    encoder.copyBufferToBuffer(this.membraneBuffer!, 0, this.membraneReadbackBuffer!, 0, n * 4);
    this.device!.queue.submit([encoder.finish()]);

    await this.membraneReadbackBuffer!.mapAsync(GPUMapMode.READ);
    const data = new Float32Array(this.membraneReadbackBuffer!.getMappedRange().slice(0));
    this.membraneReadbackBuffer!.unmap();

    return data;
  }

  /**
   * Reset all neurons to resting state.
   */
  resetState(): void {
    this.ensureInitialized();
    const n = this.config.neuronCount;
    const dev = this.device!;

    dev.queue.writeBuffer(
      this.membraneBuffer!,
      0,
      new Float32Array(n).fill(this.config.lifParams.vRest)
    );
    dev.queue.writeBuffer(this.spikesBuffer!, 0, new Uint32Array(n));
    dev.queue.writeBuffer(this.refractoryBuffer!, 0, new Float32Array(n));
    dev.queue.writeBuffer(this.synapticInputBuffer!, 0, new Float32Array(n));

    this.stepCount = 0;
  }

  /** Get current step count */
  get currentStep(): number {
    return this.stepCount;
  }

  /** Get neuron count */
  get neuronCount(): number {
    return this.config.neuronCount;
  }

  /**
   * Destroy all GPU resources.
   */
  destroy(): void {
    this.paramsBuffer?.destroy();
    this.membraneBuffer?.destroy();
    this.synapticInputBuffer?.destroy();
    this.spikesBuffer?.destroy();
    this.refractoryBuffer?.destroy();
    this.spikeReadbackBuffer?.destroy();
    this.membraneReadbackBuffer?.destroy();
    this.device?.destroy();

    this.initialized = false;
    this.stepCount = 0;
  }

  private ensureInitialized(): void {
    if (!this.initialized || !this.device) {
      throw new Error('GPUHarness not initialized. Call initialize() first.');
    }
  }
}
