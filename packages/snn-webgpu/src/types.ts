/**
 * @holoscript/snn-webgpu - Type Definitions
 *
 * Core types for the Spiking Neural Network WebGPU compute library.
 */

/** LIF neuron parameters matching the WGSL uniform struct layout. */
export interface LIFParams {
  /** Membrane time constant in milliseconds. Controls leak rate. Default: 20.0 */
  tau: number;
  /** Spike threshold voltage in mV. Neuron fires when V >= threshold. Default: -55.0 */
  vThreshold: number;
  /** Reset voltage after spike in mV. Default: -75.0 */
  vReset: number;
  /** Resting membrane potential in mV. Default: -65.0 */
  vRest: number;
  /** Simulation timestep in milliseconds. Default: 1.0 */
  dt: number;
}

/** Synaptic connection parameters. */
export interface SynapticParams {
  /** Number of pre-synaptic neurons. */
  preCount: number;
  /** Number of post-synaptic neurons. */
  postCount: number;
  /** STDP learning rate. Default: 0.01 */
  learningRate: number;
}

/** Spike encoding schemes. */
export enum EncodingMode {
  /** Firing rate proportional to input magnitude. */
  Rate = 0,
  /** Spike time inversely proportional to input magnitude. */
  Temporal = 1,
  /** Spikes on significant changes only. */
  Delta = 2,
}

/** Spike decoding schemes. */
export enum DecodingMode {
  /** Count spikes / time_window. */
  Rate = 0,
  /** Earliest spike time => value. */
  Temporal = 1,
  /** Weighted average across population. */
  Population = 2,
  /** Winner-take-all first spike. */
  FirstSpike = 3,
}

/** Parameters for spike encoding. */
export interface EncodeParams {
  /** Number of input data points to encode. */
  dataCount: number;
  /** Number of time bins in the encoding window. Default: 100 */
  timeWindow: number;
  /** Encoding scheme to use. Default: Rate */
  encodingMode: EncodingMode;
  /** RNG seed for rate coding. Default: 42 */
  seed: number;
  /** Minimum expected input value (for normalization). Default: 0.0 */
  minValue: number;
  /** Maximum expected input value (for normalization). Default: 1.0 */
  maxValue: number;
  /** Change threshold for delta coding. Default: 0.1 */
  deltaThreshold: number;
}

/** Parameters for spike decoding. */
export interface DecodeParams {
  /** Number of neurons to decode. */
  neuronCount: number;
  /** Number of time bins in spike train. */
  timeWindow: number;
  /** Decoding scheme. Default: Rate */
  decodingMode: DecodingMode;
  /** Neurons per population group (for population/first-spike coding). Default: 10 */
  populationSize: number;
  /** Output range minimum. Default: 0.0 */
  outputMin: number;
  /** Output range maximum. Default: 1.0 */
  outputMax: number;
}

/** Network layer definition for building multi-layer SNNs. */
export interface LayerConfig {
  /** Human-readable layer name. */
  name: string;
  /** Number of neurons in this layer. */
  neuronCount: number;
  /** LIF parameters for this layer's neurons. */
  lifParams?: Partial<LIFParams>;
}

/** Connection between two layers. */
export interface ConnectionConfig {
  /** Source layer name. */
  from: string;
  /** Target layer name. */
  to: string;
  /** Initial weight strategy. */
  weightInit: 'random' | 'uniform' | 'zeros';
  /** Initial uniform weight value (if weightInit === 'uniform'). Default: 0.5 */
  uniformValue?: number;
  /** Enable STDP learning. Default: false */
  stdpEnabled: boolean;
  /** STDP learning rate. Default: 0.01 */
  learningRate?: number;
}

/** Full SNN network configuration. */
export interface NetworkConfig {
  /** Network layers (ordered from input to output). */
  layers: LayerConfig[];
  /** Connections between layers. */
  connections: ConnectionConfig[];
  /** Global simulation timestep (ms). Default: 1.0 */
  dt?: number;
}

/** Simulation statistics returned after stepping the network. */
export interface SimulationStats {
  /** Total number of spikes across all neurons this step. */
  totalSpikes: number;
  /** Per-layer spike counts. */
  layerSpikes: Map<string, number>;
  /** Average membrane potential per layer. */
  layerAvgVoltage: Map<string, number>;
  /** Simulation wall-clock time in milliseconds. */
  stepTimeMs: number;
  /** Current simulation time in ms. */
  simTimeMs: number;
}

/** GPU buffer handle with metadata. */
export interface GPUBufferHandle {
  /** The underlying GPUBuffer. */
  buffer: GPUBuffer;
  /** Size in bytes. */
  size: number;
  /** Human-readable label. */
  label: string;
}

/** Workgroup dispatch dimensions. */
export interface DispatchSize {
  x: number;
  y?: number;
  z?: number;
}

/** Result of an async GPU readback operation. */
export interface ReadbackResult<T extends Float32Array | Uint32Array = Float32Array> {
  /** The copied data. */
  data: T;
  /** Time in ms for the GPU->CPU copy. */
  readbackTimeMs: number;
}

/**
 * Default LIF parameters based on standard neurophysiology.
 * Suitable for a general-purpose cortical neuron model.
 */
export const DEFAULT_LIF_PARAMS: LIFParams = {
  tau: 20.0,
  vThreshold: -55.0,
  vReset: -75.0,
  vRest: -65.0,
  dt: 1.0,
};

/** Default encoding parameters. */
export const DEFAULT_ENCODE_PARAMS: Omit<EncodeParams, 'dataCount'> = {
  timeWindow: 100,
  encodingMode: EncodingMode.Rate,
  seed: 42,
  minValue: 0.0,
  maxValue: 1.0,
  deltaThreshold: 0.1,
};

/** Default decoding parameters. */
export const DEFAULT_DECODE_PARAMS: Omit<DecodeParams, 'neuronCount' | 'timeWindow'> = {
  decodingMode: DecodingMode.Rate,
  populationSize: 10,
  outputMin: 0.0,
  outputMax: 1.0,
};

/** Compute the number of workgroups needed for N items at a given workgroup size. */
export function computeDispatchSize(count: number, workgroupSize: number = 256): number {
  return Math.ceil(count / workgroupSize);
}
