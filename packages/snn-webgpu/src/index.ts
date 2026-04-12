/**
 * @holoscript/snn-webgpu
 *
 * WebGPU Spiking Neural Network compute library for HoloScript.
 * Provides GPU-accelerated Leaky Integrate-and-Fire (LIF) neuron simulation
 * targeting 10K+ neurons per frame at 60Hz.
 *
 * @packageDocumentation
 */

// Core types and constants
export type {
  LIFParams,
  SynapticParams,
  EncodeParams,
  DecodeParams,
  LayerConfig,
  ConnectionConfig,
  NetworkConfig,
  SimulationStats,
  GPUBufferHandle,
  DispatchSize,
  ReadbackResult,
} from './types.js';

export {
  EncodingMode,
  DecodingMode,
  DEFAULT_LIF_PARAMS,
  DEFAULT_ENCODE_PARAMS,
  DEFAULT_DECODE_PARAMS,
  computeDispatchSize,
} from './types.js';

// GPU context management
export { GPUContext } from './gpu-context.js';
export type { GPUContextOptions, GPUCapabilities } from './gpu-context.js';

// Buffer management
export { BufferManager } from './buffer-manager.js';
export type { BufferCreateOptions } from './buffer-manager.js';

// Pipeline factory
export { PipelineFactory } from './pipeline-factory.js';
export type { ShaderEntryPoint, ShaderCategory } from './pipeline-factory.js';

// LIF neuron simulation
export { LIFSimulator } from './lif-simulator.js';

// Spike encoding/decoding
export { SpikeEncoder, SpikeDecoder } from './spike-codec.js';

// Tropical / ReLU bridge
export { TropicalActivationTrait } from './traits/TropicalActivationTrait.js';
export type { TropicalActivationConfig } from './traits/TropicalActivationTrait.js';

// Full network orchestration
export { SNNNetwork } from './snn-network.js';

// Tropical graph algebra
export { TropicalShortestPaths } from './graph/TropicalShortestPaths.js';
export type { TropicalCSRGraph } from './graph/TropicalShortestPaths.js';

// PoC utilities (preserved from @holoscript/snn-poc RFC-0042)
export { CPUReferenceSimulator, generateSynapticInput, generateWeightMatrix } from './poc/index.js';
export type { CPUNeuronState, StepResult } from './poc/index.js';
