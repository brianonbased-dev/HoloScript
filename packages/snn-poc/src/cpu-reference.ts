/**
 * CPU Reference Implementation for LIF Neuron Simulation
 *
 * Provides a bit-exact (within floating-point precision) reference
 * implementation of the LIF neuron model for validating the WebGPU
 * compute shader output.
 *
 * The same mathematical model is used:
 *   V[t+1] = V_rest + (V[t] - V_rest) * exp(-dt/tau) + I_syn[t]
 *   if V[t+1] >= V_thresh => spike = 1, V = V_reset, refractory = 2ms
 *
 * @module @holoscript/snn-poc
 */

import type { LIFParams, StepResult } from './types.js';
import { DEFAULT_LIF_PARAMS } from './types.js';

/** CPU state for a single neuron */
export interface CPUNeuronState {
  membraneV: number;
  refractory: number;
  spiked: boolean;
}

/**
 * CPU reference LIF simulator.
 *
 * Runs the identical LIF model as the WGSL compute shader, but on the CPU.
 * Used to validate GPU results and establish correctness.
 */
export class CPUReferenceSimulator {
  private params: LIFParams;
  private neuronCount: number;
  private membraneV: Float32Array;
  private refractory: Float32Array;
  private spikes: Uint32Array;
  private stepCount: number = 0;
  private readonly REFRACTORY_PERIOD = 2.0; // ms

  constructor(neuronCount: number, params?: Partial<LIFParams>) {
    this.params = { ...DEFAULT_LIF_PARAMS, ...params };
    this.neuronCount = neuronCount;
    this.membraneV = new Float32Array(neuronCount).fill(this.params.vRest);
    this.refractory = new Float32Array(neuronCount);
    this.spikes = new Uint32Array(neuronCount);
  }

  /**
   * Run one simulation timestep with given synaptic inputs.
   *
   * @param synapticInput - Input current for each neuron [N x f32]
   * @returns Step result with spike data
   */
  step(synapticInput: Float32Array): StepResult {
    const start = performance.now();
    const n = this.neuronCount;
    const decay = Math.exp(-this.params.dt / this.params.tau);
    let totalSpikes = 0;
    const spikeIndices: number[] = [];

    for (let i = 0; i < n; i++) {
      // Refractory check
      if (this.refractory[i] > 0) {
        this.refractory[i] = Math.max(this.refractory[i] - this.params.dt, 0);
        this.membraneV[i] = this.params.vReset;
        this.spikes[i] = 0;
        continue;
      }

      // Leaky integration
      let v = this.params.vRest + (this.membraneV[i] - this.params.vRest) * decay + synapticInput[i];

      // Threshold check
      if (v >= this.params.vThreshold) {
        this.spikes[i] = 1;
        this.membraneV[i] = this.params.vReset;
        this.refractory[i] = this.REFRACTORY_PERIOD;
        totalSpikes++;
        spikeIndices.push(i);
      } else {
        this.spikes[i] = 0;
        this.membraneV[i] = v;
      }
    }

    this.stepCount++;

    return {
      totalSpikes,
      spikeIndices,
      stepTimeMs: performance.now() - start,
      simTimeMs: this.stepCount * this.params.dt,
    };
  }

  /**
   * Run N timesteps with the same input pattern.
   */
  stepN(count: number, synapticInput: Float32Array): StepResult[] {
    const results: StepResult[] = [];
    for (let i = 0; i < count; i++) {
      results.push(this.step(synapticInput));
    }
    return results;
  }

  /** Get membrane potentials snapshot */
  getMembraneV(): Float32Array {
    return new Float32Array(this.membraneV);
  }

  /** Get spike flags snapshot */
  getSpikes(): Uint32Array {
    return new Uint32Array(this.spikes);
  }

  /** Get refractory counters snapshot */
  getRefractory(): Float32Array {
    return new Float32Array(this.refractory);
  }

  /** Get current step count */
  get currentStep(): number {
    return this.stepCount;
  }

  /** Reset all neurons to resting state */
  reset(): void {
    this.membraneV.fill(this.params.vRest);
    this.refractory.fill(0);
    this.spikes.fill(0);
    this.stepCount = 0;
  }
}

/**
 * Generate deterministic pseudo-random synaptic input currents.
 *
 * Uses a simple xorshift32 PRNG for reproducibility across CPU and GPU.
 *
 * @param neuronCount - Number of neurons
 * @param seed - Random seed
 * @param minCurrent - Minimum current (default: 0)
 * @param maxCurrent - Maximum current (default: 15mV - enough to trigger some spikes)
 * @returns Float32Array of synaptic input currents
 */
export function generateSynapticInput(
  neuronCount: number,
  seed: number = 42,
  minCurrent: number = 0,
  maxCurrent: number = 15
): Float32Array {
  const input = new Float32Array(neuronCount);
  let state = seed >>> 0 || 1; // Ensure non-zero

  for (let i = 0; i < neuronCount; i++) {
    // xorshift32
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;

    // Map to [minCurrent, maxCurrent]
    const normalized = (state >>> 0) / 0xffffffff;
    input[i] = minCurrent + normalized * (maxCurrent - minCurrent);
  }

  return input;
}

/**
 * Generate a random weight matrix for spike propagation.
 *
 * @param preCount - Pre-synaptic neuron count
 * @param postCount - Post-synaptic neuron count
 * @param sparsity - Fraction of zero weights (default: 0.8 = 80% sparse)
 * @param seed - Random seed
 * @returns Float32Array weight matrix (row-major, pre x post)
 */
export function generateWeightMatrix(
  preCount: number,
  postCount: number,
  sparsity: number = 0.8,
  seed: number = 123
): Float32Array {
  const weights = new Float32Array(preCount * postCount);
  let state = seed >>> 0 || 1;

  for (let i = 0; i < weights.length; i++) {
    // xorshift32
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;

    const normalized = (state >>> 0) / 0xffffffff;

    if (normalized > sparsity) {
      // Non-zero weight: random in [0.1, 1.0]
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      weights[i] = 0.1 + ((state >>> 0) / 0xffffffff) * 0.9;
    }
    // else: zero (sparse connection)
  }

  return weights;
}
