/**
 * @holoscript/snn-poc - Type Definitions
 *
 * Types for the standalone WebGPU LIF neuron proof-of-concept.
 */

/** LIF neuron parameters (must match WGSL struct layout) */
export interface LIFParams {
  /** Membrane time constant (ms). Default: 20.0 */
  tau: number;
  /** Spike threshold voltage (mV). Default: -55.0 */
  vThreshold: number;
  /** Reset voltage after spike (mV). Default: -75.0 */
  vReset: number;
  /** Resting membrane potential (mV). Default: -65.0 */
  vRest: number;
  /** Simulation timestep (ms). Default: 1.0 */
  dt: number;
}

/** Default LIF parameters matching standard neurophysiology */
export const DEFAULT_LIF_PARAMS: LIFParams = {
  tau: 20.0,
  vThreshold: -55.0,
  vReset: -75.0,
  vRest: -65.0,
  dt: 1.0,
};

/** Spike propagation parameters */
export interface PropagationParams {
  /** Number of pre-synaptic neurons */
  preCount: number;
  /** Number of post-synaptic neurons */
  postCount: number;
  /** Fixed-point scale factor. Default: 1000.0 */
  fixedScale: number;
}

/** Default propagation parameters */
export const DEFAULT_PROPAGATION_PARAMS: Omit<PropagationParams, 'preCount' | 'postCount'> = {
  fixedScale: 1000.0,
};

/** Result of a single simulation step */
export interface StepResult {
  /** Total spikes this step */
  totalSpikes: number;
  /** Spike indices (neuron IDs that fired) */
  spikeIndices: number[];
  /** Step execution time in ms */
  stepTimeMs: number;
  /** Current simulation time in ms */
  simTimeMs: number;
}

/** Validation result comparing GPU vs CPU */
export interface ValidationResult {
  /** Whether the validation passed */
  passed: boolean;
  /** Number of neurons tested */
  neuronCount: number;
  /** Number of timesteps tested */
  timesteps: number;
  /** Maximum absolute error in membrane potential */
  maxVoltageError: number;
  /** Number of spike mismatches */
  spikeMismatches: number;
  /** GPU execution time in ms */
  gpuTimeMs: number;
  /** CPU execution time in ms */
  cpuTimeMs: number;
  /** Speedup factor (CPU time / GPU time) */
  speedup: number;
  /** Tolerance used for comparison */
  tolerance: number;
  /** Detailed per-neuron results (first 10 mismatches) */
  details: ValidationDetail[];
}

/** Per-neuron validation detail */
export interface ValidationDetail {
  neuronIndex: number;
  timestep: number;
  gpuVoltage: number;
  cpuVoltage: number;
  gpuSpiked: boolean;
  cpuSpiked: boolean;
  error: number;
}

/** PoC configuration */
export interface PocConfig {
  /** Number of neurons to simulate. Default: 1000 */
  neuronCount: number;
  /** Number of timesteps to run. Default: 100 */
  timesteps: number;
  /** LIF parameters */
  lifParams: LIFParams;
  /** Synaptic input generator seed. Default: 42 */
  seed: number;
  /** Tolerance for GPU vs CPU comparison. Default: 1e-3 */
  tolerance: number;
  /** Workgroup size for GPU dispatch. Default: 256 */
  workgroupSize: number;
}

/** Default PoC configuration */
export const DEFAULT_POC_CONFIG: PocConfig = {
  neuronCount: 1000,
  timesteps: 100,
  lifParams: { ...DEFAULT_LIF_PARAMS },
  seed: 42,
  tolerance: 1e-3,
  workgroupSize: 256,
};
