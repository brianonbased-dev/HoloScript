/**
 * @holoscript/snn-webgpu - SNN Network Orchestrator
 *
 * Assembles multi-layer spiking neural networks from LayerConfig and
 * ConnectionConfig. Manages the full simulation loop: synaptic current
 * computation, LIF neuron updates, and optional STDP learning.
 */

import type { GPUContext } from './gpu-context.js';
import { BufferManager } from './buffer-manager.js';
import { PipelineFactory } from './pipeline-factory.js';
import type {
  NetworkConfig,
  LayerConfig,
  ConnectionConfig,
  SimulationStats,
  LIFParams,
  GPUBufferHandle,
  ReadbackResult,
} from './types.js';
import { DEFAULT_LIF_PARAMS, computeDispatchSize } from './types.js';

/** Internal representation of an instantiated layer. */
interface LayerState {
  config: LayerConfig;
  params: LIFParams;
  paramsBuffer: GPUBufferHandle;
  membraneBuffer: GPUBufferHandle;
  synapticInputBuffer: GPUBufferHandle;
  spikesBuffer: GPUBufferHandle;
  refractoryBuffer: GPUBufferHandle;
  lifBindGroup: GPUBindGroup;
}

/** Internal representation of an instantiated connection. */
interface ConnectionState {
  config: ConnectionConfig;
  fromLayer: LayerState;
  toLayer: LayerState;
  weightsBuffer: GPUBufferHandle;
  synapticParamsBuffer: GPUBufferHandle;
  currentBindGroup: GPUBindGroup;
  stdpBindGroup?: GPUBindGroup;
}

/** LIF params uniform byte size. */
const LIF_PARAMS_SIZE = 32;
/** Synaptic params uniform byte size. */
const SYNAPTIC_PARAMS_SIZE = 16;

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
  u32[6] = 0;
  u32[7] = 0;
  return buf;
}

function packSynapticParams(
  preCount: number,
  postCount: number,
  learningRate: number,
): ArrayBuffer {
  const buf = new ArrayBuffer(SYNAPTIC_PARAMS_SIZE);
  const u32 = new Uint32Array(buf);
  const f32 = new Float32Array(buf);
  u32[0] = preCount;
  u32[1] = postCount;
  f32[2] = learningRate;
  u32[3] = 0;
  return buf;
}

/**
 * Full Spiking Neural Network simulation orchestrator.
 *
 * @example
 * ```ts
 * const network = new SNNNetwork(ctx, {
 *   layers: [
 *     { name: 'input', neuronCount: 1000 },
 *     { name: 'hidden', neuronCount: 500 },
 *     { name: 'output', neuronCount: 100 },
 *   ],
 *   connections: [
 *     { from: 'input', to: 'hidden', weightInit: 'random', stdpEnabled: true },
 *     { from: 'hidden', to: 'output', weightInit: 'random', stdpEnabled: false },
 *   ],
 *   dt: 1.0,
 * });
 *
 * await network.initialize();
 *
 * // Set input spikes
 * network.setInputSpikes('input', spikeData);
 *
 * // Step simulation
 * const stats = await network.step();
 *
 * // Read output
 * const outputSpikes = await network.readLayerSpikes('output');
 * ```
 */
export class SNNNetwork {
  private ctx: GPUContext;
  private bufferManager: BufferManager;
  private pipelineFactory: PipelineFactory;
  private config: NetworkConfig;
  private layers: Map<string, LayerState> = new Map();
  private connections: ConnectionState[] = [];
  private initialized = false;
  private simTimeMs = 0;
  private dt: number;

  constructor(ctx: GPUContext, config: NetworkConfig) {
    this.ctx = ctx;
    this.config = config;
    this.dt = config.dt ?? 1.0;
    this.bufferManager = new BufferManager(ctx.device);
    this.pipelineFactory = new PipelineFactory(ctx);
  }

  /**
   * Initialize all layers and connections.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Validate configuration
    this.validateConfig();

    // Create layers
    for (const layerConfig of this.config.layers) {
      const layer = this.createLayer(layerConfig);
      this.layers.set(layerConfig.name, layer);
    }

    // Create connections
    for (const connConfig of this.config.connections) {
      const conn = this.createConnection(connConfig);
      this.connections.push(conn);
    }

    this.initialized = true;
  }

  /**
   * Step the simulation by one timestep.
   * Order: synaptic currents -> LIF updates -> STDP (if enabled)
   */
  async step(): Promise<SimulationStats> {
    this.ensureInitialized();
    const stepStart = performance.now();

    const encoder = this.ctx.device.createCommandEncoder({
      label: `snn-step-${Math.floor(this.simTimeMs)}`,
    });

    // Phase 1: Compute synaptic currents for each connection
    for (const conn of this.connections) {
      const workgroups = computeDispatchSize(conn.toLayer.config.neuronCount);
      this.pipelineFactory.encodeDispatch(
        encoder,
        'compute_synaptic_current',
        conn.currentBindGroup,
        workgroups,
      );
    }

    // Phase 2: LIF neuron update for each layer
    for (const layer of this.layers.values()) {
      const workgroups = computeDispatchSize(layer.config.neuronCount);
      this.pipelineFactory.encodeDispatch(
        encoder,
        'lif_step',
        layer.lifBindGroup,
        workgroups,
      );
    }

    // Phase 3: STDP weight updates for learning connections
    for (const conn of this.connections) {
      if (conn.config.stdpEnabled && conn.stdpBindGroup) {
        const workgroups = computeDispatchSize(conn.toLayer.config.neuronCount);
        this.pipelineFactory.encodeDispatch(
          encoder,
          'stdp_weight_update',
          conn.stdpBindGroup,
          workgroups,
        );
      }
    }

    await this.ctx.submitAndWait(encoder.finish());

    this.simTimeMs += this.dt;
    const stepTimeMs = performance.now() - stepStart;

    // Collect statistics
    return this.collectStats(stepTimeMs);
  }

  /**
   * Run N simulation timesteps.
   */
  async stepN(count: number): Promise<SimulationStats> {
    let lastStats: SimulationStats | null = null;
    for (let i = 0; i < count; i++) {
      lastStats = await this.step();
    }
    return lastStats!;
  }

  /**
   * Set external spike input for a layer (typically the input layer).
   */
  setInputSpikes(layerName: string, spikes: Float32Array): void {
    this.ensureInitialized();
    const layer = this.getLayer(layerName);
    if (spikes.length !== layer.config.neuronCount) {
      throw new Error(
        `Spike data length (${spikes.length}) must match layer '${layerName}' neuron count (${layer.config.neuronCount})`,
      );
    }
    this.bufferManager.writeBuffer(layer.spikesBuffer, spikes);
  }

  /**
   * Set external synaptic input for a layer.
   */
  setSynapticInput(layerName: string, currents: Float32Array): void {
    this.ensureInitialized();
    const layer = this.getLayer(layerName);
    this.bufferManager.writeBuffer(layer.synapticInputBuffer, currents);
  }

  /**
   * Read spike output for a specific layer.
   */
  async readLayerSpikes(layerName: string): Promise<ReadbackResult> {
    this.ensureInitialized();
    const layer = this.getLayer(layerName);
    return this.bufferManager.readBuffer(layer.spikesBuffer);
  }

  /**
   * Read membrane potentials for a specific layer.
   */
  async readLayerMembrane(layerName: string): Promise<ReadbackResult> {
    this.ensureInitialized();
    const layer = this.getLayer(layerName);
    return this.bufferManager.readBuffer(layer.membraneBuffer);
  }

  /**
   * Read connection weights.
   */
  async readConnectionWeights(fromLayer: string, toLayer: string): Promise<ReadbackResult> {
    this.ensureInitialized();
    const conn = this.connections.find(
      (c) => c.config.from === fromLayer && c.config.to === toLayer,
    );
    if (!conn) {
      throw new Error(`No connection found from '${fromLayer}' to '${toLayer}'`);
    }
    return this.bufferManager.readBuffer(conn.weightsBuffer);
  }

  /**
   * Reset the entire network state.
   */
  resetState(): void {
    this.ensureInitialized();
    for (const layer of this.layers.values()) {
      const n = layer.config.neuronCount;
      const rest = new Float32Array(n).fill(layer.params.vRest);
      const zeros = new Float32Array(n);
      this.bufferManager.writeBuffer(layer.membraneBuffer, rest);
      this.bufferManager.writeBuffer(layer.synapticInputBuffer, zeros);
      this.bufferManager.writeBuffer(layer.spikesBuffer, zeros);
      this.bufferManager.writeBuffer(layer.refractoryBuffer, zeros);
    }
    this.simTimeMs = 0;
  }

  /** Get total neuron count across all layers. */
  get totalNeurons(): number {
    let total = 0;
    for (const layer of this.layers.values()) {
      total += layer.config.neuronCount;
    }
    return total;
  }

  /** Get layer names. */
  get layerNames(): string[] {
    return Array.from(this.layers.keys());
  }

  /** Get current simulation time in ms. */
  get currentSimTimeMs(): number {
    return this.simTimeMs;
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
    this.layers.clear();
    this.connections = [];
    this.initialized = false;
    this.simTimeMs = 0;
  }

  // --- Private methods ---

  private validateConfig(): void {
    const layerNames = new Set(this.config.layers.map((l) => l.name));

    // Check for duplicate layer names
    if (layerNames.size !== this.config.layers.length) {
      throw new Error('Duplicate layer names in network configuration');
    }

    // Validate connections reference existing layers
    for (const conn of this.config.connections) {
      if (!layerNames.has(conn.from)) {
        throw new Error(`Connection references unknown source layer: '${conn.from}'`);
      }
      if (!layerNames.has(conn.to)) {
        throw new Error(`Connection references unknown target layer: '${conn.to}'`);
      }
    }
  }

  private createLayer(config: LayerConfig): LayerState {
    const n = this.ctx.validateNeuronCapacity(config.neuronCount);
    const params: LIFParams = {
      ...DEFAULT_LIF_PARAMS,
      dt: this.dt,
      ...config.lifParams,
    };

    // Params buffer
    const packedParams = packLIFParams(params, n);
    const paramsBuffer = this.bufferManager.createBuffer({
      size: LIF_PARAMS_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      label: `${config.name}-lif-params`,
      initialData: new Float32Array(packedParams),
    });

    // Membrane potential (initialized to resting)
    const initMembrane = new Float32Array(n).fill(params.vRest);
    const membraneBuffer = this.bufferManager.createStorageBuffer(initMembrane, `${config.name}-membrane`);

    // Synaptic input
    const synapticInputBuffer = this.bufferManager.createZeroBuffer(n, `${config.name}-synaptic`);

    // Spikes
    const spikesBuffer = this.bufferManager.createZeroBuffer(n, `${config.name}-spikes`);

    // Refractory
    const refractoryBuffer = this.bufferManager.createZeroBuffer(n, `${config.name}-refractory`);

    // LIF bind group
    const lifBindGroup = this.pipelineFactory.createBindGroup('lif_step', [
      paramsBuffer.buffer,
      membraneBuffer.buffer,
      synapticInputBuffer.buffer,
      spikesBuffer.buffer,
      refractoryBuffer.buffer,
    ], `${config.name}-lif-bind-group`);

    return {
      config: { ...config, neuronCount: n },
      params,
      paramsBuffer,
      membraneBuffer,
      synapticInputBuffer,
      spikesBuffer,
      refractoryBuffer,
      lifBindGroup,
    };
  }

  private createConnection(config: ConnectionConfig): ConnectionState {
    const fromLayer = this.getLayer(config.from);
    const toLayer = this.getLayer(config.to);
    const preCount = fromLayer.config.neuronCount;
    const postCount = toLayer.config.neuronCount;
    const lr = config.learningRate ?? 0.01;

    // Synaptic params buffer
    const packedSynaptic = packSynapticParams(preCount, postCount, lr);
    const synapticParamsBuffer = this.bufferManager.createBuffer({
      size: SYNAPTIC_PARAMS_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      label: `${config.from}-${config.to}-synaptic-params`,
      initialData: new Float32Array(packedSynaptic),
    });

    // Weight matrix
    const weightCount = preCount * postCount;
    const weights = this.initializeWeights(weightCount, config);
    const weightsBuffer = this.bufferManager.createStorageBuffer(
      weights,
      `${config.from}-${config.to}-weights`,
    );

    // Current computation bind group
    const currentBindGroup = this.pipelineFactory.createBindGroup('compute_synaptic_current', [
      synapticParamsBuffer.buffer,
      weightsBuffer.buffer,
      fromLayer.spikesBuffer.buffer,
      toLayer.synapticInputBuffer.buffer,
      toLayer.spikesBuffer.buffer, // post spikes (not used in current compute but needed for layout)
    ], `${config.from}-${config.to}-current-bind-group`);

    // STDP bind group (reuses same layout)
    let stdpBindGroup: GPUBindGroup | undefined;
    if (config.stdpEnabled) {
      stdpBindGroup = this.pipelineFactory.createBindGroup('stdp_weight_update', [
        synapticParamsBuffer.buffer,
        weightsBuffer.buffer,
        fromLayer.spikesBuffer.buffer,
        toLayer.synapticInputBuffer.buffer,
        toLayer.spikesBuffer.buffer,
      ], `${config.from}-${config.to}-stdp-bind-group`);
    }

    return {
      config,
      fromLayer,
      toLayer,
      weightsBuffer,
      synapticParamsBuffer,
      currentBindGroup,
      stdpBindGroup,
    };
  }

  private initializeWeights(count: number, config: ConnectionConfig): Float32Array {
    const weights = new Float32Array(count);

    switch (config.weightInit) {
      case 'random':
        // Xavier-like initialization: uniform [-1/sqrt(n), 1/sqrt(n)]
        const scale = 1.0 / Math.sqrt(count);
        for (let i = 0; i < count; i++) {
          weights[i] = (Math.random() * 2 - 1) * scale;
        }
        break;

      case 'uniform':
        weights.fill(config.uniformValue ?? 0.5);
        break;

      case 'zeros':
        // Already zero-initialized
        break;
    }

    return weights;
  }

  private async collectStats(stepTimeMs: number): Promise<SimulationStats> {
    const layerSpikes = new Map<string, number>();
    const layerAvgVoltage = new Map<string, number>();
    let totalSpikes = 0;

    // Read spike counts from each layer
    for (const [name, layer] of this.layers) {
      const spikeResult = await this.bufferManager.readBuffer(layer.spikesBuffer);
      let spikeCount = 0;
      for (let i = 0; i < spikeResult.data.length; i++) {
        if (spikeResult.data[i] > 0.5) spikeCount++;
      }
      layerSpikes.set(name, spikeCount);
      totalSpikes += spikeCount;

      // Read membrane potentials
      const vResult = await this.bufferManager.readBuffer(layer.membraneBuffer);
      let sum = 0;
      for (let i = 0; i < vResult.data.length; i++) {
        sum += vResult.data[i];
      }
      layerAvgVoltage.set(name, sum / vResult.data.length);
    }

    return {
      totalSpikes,
      layerSpikes,
      layerAvgVoltage,
      stepTimeMs,
      simTimeMs: this.simTimeMs,
    };
  }

  private getLayer(name: string): LayerState {
    const layer = this.layers.get(name);
    if (!layer) {
      throw new Error(`Layer '${name}' not found in network`);
    }
    return layer;
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('SNNNetwork not initialized. Call initialize() first.');
    }
  }
}
