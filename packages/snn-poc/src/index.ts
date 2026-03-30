/**
 * @holoscript/snn-poc
 *
 * Standalone WebGPU compute shader proof-of-concept for LIF spiking
 * neural network simulation. Validates RFC-0042 feasibility by running
 * 1000 LIF neurons on the GPU and comparing against a CPU reference.
 *
 * @packageDocumentation
 */

// Core types
export type {
  LIFParams,
  PropagationParams,
  StepResult,
  ValidationResult,
  ValidationDetail,
  PocConfig,
} from './types.js';

export { DEFAULT_LIF_PARAMS, DEFAULT_PROPAGATION_PARAMS, DEFAULT_POC_CONFIG } from './types.js';

// GPU harness
export { GPUHarness } from './gpu-harness.js';

// CPU reference implementation
export {
  CPUReferenceSimulator,
  generateSynapticInput,
  generateWeightMatrix,
} from './cpu-reference.js';
export type { CPUNeuronState } from './cpu-reference.js';

// Validation runner
export { runValidation } from './validate.js';
