/**
 * @holoscript/snn-webgpu/poc
 *
 * CPU reference utilities preserved from @holoscript/snn-poc (RFC-0042).
 * Useful for validation, testing, and deterministic input generation.
 *
 * @packageDocumentation
 */

export {
  CPUReferenceSimulator,
  generateSynapticInput,
  generateWeightMatrix,
} from './cpu-reference.js';

export type { CPUNeuronState, StepResult } from './cpu-reference.js';
