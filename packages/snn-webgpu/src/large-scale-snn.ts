/**
 * @holoscript/snn-webgpu — Hierarchical Large-Scale SNN
 *
 * Paper-2 (SNN NeurIPS) §5.4: "Scaling to 10^6 neurons via hierarchical
 * workgroup decomposition and shared memory tiling."
 *
 * This module provides `HierarchicalSNN`, a single-layer spiking neural
 * network that uses two optimised WGSL compute pipelines from
 * `lif-large-scale.wgsl`:
 *
 *   1. `lif_step_partitioned`
 *      Each GPU thread handles NEURONS_PER_THREAD=4 neurons, reducing the
 *      LIF dispatch count by 4× compared to the baseline (one neuron/thread).
 *      For N=10^6: 977 workgroups vs 3,907.
 *
 *   2. `synaptic_current_shared_tiled`
 *      Uses `var<workgroup>` shared memory to cache tiles of pre-synaptic
 *      spikes. All 256 threads in a workgroup cooperate to fill a 256-element
 *      tile, then each thread accumulates from the cache for its own post
 *      neuron. Reduces global memory traffic by a factor of ~TILE_SIZE.
 *
 * Usage:
 * ```ts
 * const snn = new HierarchicalSNN(ctx, {
 *   neuronCount: 1_000_000,
 *   synapticInputCount: 4096,
 * });
 * await snn.initialize();
 *
 * snn.setPreSpikes(preSpikes);   // inject from upstream layer
 * await snn.step();
 * const spikes = await snn.readSpikes();
 * ```
 */

import type { GPUContext } from './gpu-context.js';
import { BufferManager } from './buffer-manager.js';
import { PipelineFactory } from './pipeline-factory.js';
import { DEFAULT_LIF_PARAMS, computeDispatchSize } from './types.js';
import type { LIFParams, GPUBufferHandle } from './types.js';

// ── Types ─────────────────────────────────────────────────────────────────

/** Configuration for a hierarchical large-scale SNN layer. */
export interface HierarchicalConfig {
  /** Number of LIF neurons in this layer. Target: up to 10^6. */
  neuronCount: number;
  /**
   * Number of pre-synaptic input neurons feeding into this layer.
   * A weight matrix of size `synapticInputCount × neuronCount` is allocated.
   * Set to 0 to disable synaptic pathway (inject currents via setSynapticInput).
   */
  synapticInputCount: number;
  /**
   * Coarsening factor: each thread handles this many neurons in lif_step_partitioned.
   * Default: 4. Higher values reduce dispatch count at the cost of instruction-level
   * parallelism per thread.
   */
  neuronsPerThread?: number;
  /** LIF parameters. Defaults to standard cortical parameters. */
  lifParams?: Partial<LIFParams>;
}

/** Runtime statistics for the hierarchical dispatcher. */
export interface HierarchicalStats {
  /** Total neurons in the layer. */
  neuronCount: number;
  /** Number of pre-synaptic inputs (0 = direct current injection). */
  synapticInputCount: number;
  /** Workgroups dispatched for lif_step_partitioned. */
  partitionDispatch: number;
  /** Workgroups dispatched for synaptic_current_shared_tiled (0 if no synapses). */
  synapticDispatch: number;
  /**
   * Number of pre-spike tiles in synaptic_current_shared_tiled.
   * = ceil(synapticInputCount / 256)
   */
  preTileCount: number;
  /** The effective neurons-per-thread value in use. */
  neuronsPerThread: number;
  /** Estimated peak workgroup reduction vs baseline single-thread dispatch. */
  workgroupReductionFactor: number;
}

// ── Constants ─────────────────────────────────────────────────────────────

/** Must match NEURONS_PER_THREAD in lif-large-scale.wgsl */
const DEFAULT_NEURONS_PER_THREAD = 4;
/** Workgroup size in lif-large-scale.wgsl. */
const WORKGROUP_SIZE = 256;
/** Pre-spike tile size in lif-large-scale.wgsl. */
const PRE_TILE_SIZE = 256;
/** Byte size of the LIF params uniform. */
const LIF_PARAMS_BYTES = 32;
/** Byte size of the SynapticParams uniform. */
const SYNAPTIC_PARAMS_BYTES = 16;

// ── Parameter packing ─────────────────────────────────────────────────────

function packLIFParams(params: LIFParams, neuronCount: number): ArrayBuffer {
  const buf = new ArrayBuffer(LIF_PARAMS_BYTES);
  const f32 = new Float32Array(buf);
  const u32 = new Uint32Array(buf);
  f32[0] = params.tau;
  f32[1] = params.vThreshold;
  f32[2] = params.vReset;
  f32[3] = params.vRest;
  f32[4] = params.dt;
  u32[5] = neuronCount;
  return buf;
}

function packSynapticParams(preCount: number, postCount: number): ArrayBuffer {
  const buf = new ArrayBuffer(SYNAPTIC_PARAMS_BYTES);
  const u32 = new Uint32Array(buf);
  u32[0] = preCount;
  u32[1] = postCount;
  return buf;
}

// ── HierarchicalSNN ───────────────────────────────────────────────────────

/**
 * A single LIF layer using hierarchical workgroup decomposition and
 * shared-memory synaptic current tiling.
 *
 * Supports layers up to 10^6 neurons with optional weight-based synaptic
 * pathway (`synapticInputCount > 0`) or direct current injection
 * (`setSynapticInput`).
 */
export class HierarchicalSNN {
  private ctx: GPUContext;
  private cfg: Required<HierarchicalConfig>;
  private bufMgr: BufferManager;
  private factory: PipelineFactory;

  // LIF buffers
  private paramsBuffer!: GPUBufferHandle;
  private membraneBuffer!: GPUBufferHandle;
  private synapticInputBuffer!: GPUBufferHandle;
  private spikesBuffer!: GPUBufferHandle;
  private refractoryBuffer!: GPUBufferHandle;

  // Synaptic buffers (only when synapticInputCount > 0)
  private weightsBuffer: GPUBufferHandle | null = null;
  private synParamsBuffer: GPUBufferHandle | null = null;
  private preSpikesBuffer: GPUBufferHandle | null = null;

  // Bind groups
  private lifBindGroup!: GPUBindGroup;
  private synapticBindGroup: GPUBindGroup | null = null;

  private initialized = false;
  private lifParams: LIFParams;

  constructor(ctx: GPUContext, config: HierarchicalConfig) {
    this.ctx = ctx;
    this.lifParams = { ...DEFAULT_LIF_PARAMS, ...(config.lifParams ?? {}) };
    this.cfg = {
      neuronCount: config.neuronCount,
      synapticInputCount: config.synapticInputCount,
      neuronsPerThread: config.neuronsPerThread ?? DEFAULT_NEURONS_PER_THREAD,
      lifParams: this.lifParams,
    };
    this.bufMgr = new BufferManager(ctx.device);
    this.factory = new PipelineFactory(ctx);
  }

  /** Initialize GPU buffers and bind groups. Must be called before step(). */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    const { neuronCount, synapticInputCount } = this.cfg;
    const device = this.ctx.device;

    // ── LIF buffers ───────────────────────────────────────────────────────

    const lifParamData = packLIFParams(this.lifParams, neuronCount);
    this.paramsBuffer = this.bufMgr.createUniformBuffer(lifParamData, 'lif-params');

    const initialMembrane = new Float32Array(neuronCount).fill(this.lifParams.vRest);
    this.membraneBuffer = this.bufMgr.createStorageBuffer(initialMembrane, 'membrane-v');

    this.synapticInputBuffer = this.bufMgr.createZeroBuffer(neuronCount, 'synaptic-input');
    this.spikesBuffer = this.bufMgr.createZeroBuffer(neuronCount, 'spikes');
    this.refractoryBuffer = this.bufMgr.createZeroBuffer(neuronCount, 'refractory');

    // ── LIF bind group (lif_step_partitioned) ─────────────────────────────
    // Bindings: 0=params 1=membrane 2=synapticInput 3=spikes 4=refractory

    const lifPipeline = this.factory.getPipeline('lif_step_partitioned');
    this.lifBindGroup = device.createBindGroup({
      label: 'hierarchical-lif-bind-group',
      layout: lifPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.paramsBuffer.buffer } },
        { binding: 1, resource: { buffer: this.membraneBuffer.buffer } },
        { binding: 2, resource: { buffer: this.synapticInputBuffer.buffer } },
        { binding: 3, resource: { buffer: this.spikesBuffer.buffer } },
        { binding: 4, resource: { buffer: this.refractoryBuffer.buffer } },
      ],
    });

    // ── Synaptic buffers (if pre-synaptic pathway is active) ──────────────

    if (synapticInputCount > 0) {
      const synParamData = packSynapticParams(synapticInputCount, neuronCount);
      this.synParamsBuffer = this.bufMgr.createUniformBuffer(synParamData, 'syn-params');

      // Initialise weights uniformly in [0, 0.1] for a sparse input regime.
      const w = new Float32Array(neuronCount * synapticInputCount);
      for (let i = 0; i < w.length; i++) w[i] = Math.random() * 0.1;
      this.weightsBuffer = this.bufMgr.createStorageBuffer(w, 'weights');

      this.preSpikesBuffer = this.bufMgr.createZeroBuffer(synapticInputCount, 'pre-spikes');

      // Synaptic bind group (synaptic_current_shared_tiled)
      // Bindings: 0=synParams 1=weights 2=preSpikes 3=postCurrents
      const synPipeline = this.factory.getPipeline('synaptic_current_shared_tiled');
      this.synapticBindGroup = device.createBindGroup({
        label: 'hierarchical-synaptic-bind-group',
        layout: synPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.synParamsBuffer!.buffer } },
          { binding: 1, resource: { buffer: this.weightsBuffer!.buffer } },
          { binding: 2, resource: { buffer: this.preSpikesBuffer!.buffer } },
          { binding: 3, resource: { buffer: this.synapticInputBuffer.buffer } },
        ],
      });
    }

    this.initialized = true;
  }

  /**
   * Inject pre-synaptic spikes directly into the synaptic pathway.
   * Requires `synapticInputCount > 0`.
   */
  setPreSpikes(spikes: Float32Array): void {
    if (!this.preSpikesBuffer) {
      throw new Error(
        'HierarchicalSNN: synapticInputCount=0. Use setSynapticInput() for direct current injection.'
      );
    }
    this.bufMgr.writeBuffer(this.preSpikesBuffer, spikes);
  }

  /**
   * Inject synaptic input currents directly (bypass weight matrix).
   * Used when synapticInputCount=0 or for external current sources.
   */
  setSynapticInput(currents: Float32Array): void {
    this.bufMgr.writeBuffer(this.synapticInputBuffer, currents);
  }

  /**
   * Run one simulation timestep.
   * Order:
   *   1. synaptic_current_shared_tiled (if synapticInputCount > 0)
   *   2. lif_step_partitioned
   */
  async step(): Promise<void> {
    if (!this.initialized) {
      throw new Error('HierarchicalSNN: call initialize() before step().');
    }

    const { neuronCount, synapticInputCount, neuronsPerThread } = this.cfg;
    const encoder = this.ctx.device.createCommandEncoder({
      label: 'hierarchical-snn-step',
    });

    // Phase 1: synaptic current (shared-memory tiled)
    if (synapticInputCount > 0 && this.synapticBindGroup) {
      const synapticDispatch = computeDispatchSize(neuronCount);
      this.factory.encodeDispatch(
        encoder,
        'synaptic_current_shared_tiled',
        this.synapticBindGroup,
        synapticDispatch
      );
    }

    // Phase 2: LIF update (partitioned — ceil(N / (WG * neuronsPerThread)))
    const partitionDispatch = Math.ceil(
      neuronCount / (WORKGROUP_SIZE * neuronsPerThread)
    );
    this.factory.encodeDispatch(
      encoder,
      'lif_step_partitioned',
      this.lifBindGroup,
      partitionDispatch
    );

    await this.ctx.submitAndWait(encoder.finish());
  }

  /**
   * Read the current spike output array from the GPU.
   * Returns a Float32Array of length `neuronCount` (1.0 = spiked, 0.0 = silent).
   */
  async readSpikes(): Promise<Float32Array> {
    const result = await this.bufMgr.readBuffer(this.spikesBuffer);
    return result.data;
  }

  /**
   * Read the current membrane potential array from the GPU.
   * Returns a Float32Array of length `neuronCount`.
   */
  async readMembrane(): Promise<Float32Array> {
    const result = await this.bufMgr.readBuffer(this.membraneBuffer);
    return result.data;
  }

  /** Return dispatch and tile-count statistics for documentation and benchmarking. */
  getStats(): HierarchicalStats {
    const { neuronCount, synapticInputCount, neuronsPerThread } = this.cfg;
    const partitionDispatch = Math.ceil(neuronCount / (WORKGROUP_SIZE * neuronsPerThread));
    const baselineDispatch = computeDispatchSize(neuronCount);
    const synapticDispatch = synapticInputCount > 0 ? computeDispatchSize(neuronCount) : 0;
    const preTileCount = synapticInputCount > 0
      ? Math.ceil(synapticInputCount / PRE_TILE_SIZE)
      : 0;
    return {
      neuronCount,
      synapticInputCount,
      partitionDispatch,
      synapticDispatch,
      preTileCount,
      neuronsPerThread,
      workgroupReductionFactor: baselineDispatch / Math.max(partitionDispatch, 1),
    };
  }

  /** Release all GPU resources. */
  destroy(): void {
    this.bufMgr.destroyAll();
    this.initialized = false;
  }
}
