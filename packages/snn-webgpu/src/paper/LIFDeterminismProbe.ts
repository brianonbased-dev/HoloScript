/**
 * LIFDeterminismProbe — Paper #2 empirical substrate.
 *
 * Runs a fixed-input LIF simulation through the GPU and returns a
 * `ProbeResult` whose `outputHash` identifies this backend's final
 * membrane-potential state after N ticks. Paper #2's core claim is
 * that this hash is bit-identical across backends (Chromium,
 * Firefox, Safari × NVIDIA, AMD, Apple, integrated) for the same
 * input. The probe is the instrument; the cross-backend table is
 * the result.
 *
 * Reusable: this module exports a pure probe function that the paper
 * test suite calls. It never hardcodes a neuron count or tick count —
 * those are probe parameters so the paper can sweep the space.
 *
 * Usage:
 *   import { DeterminismHarness } from '@holoscript/core';
 *   import { runLIFDeterminismProbe } from '@holoscript/snn-webgpu/paper';
 *   import { GPUContext } from '@holoscript/snn-webgpu';
 *
 *   const ctx = new GPUContext();
 *   await ctx.initialize();
 *   const harness = new DeterminismHarness();
 *
 *   const result = await harness.probe('lif-1k-n1000-t100', async () => {
 *     return runLIFDeterminismProbe(ctx, {
 *       neuronCount: 1000,
 *       tickCount: 100,
 *       stimulusSeed: 42,
 *     });
 *   });
 *   console.log(result.outputHash); // sha256:... or fnv1a-64:...
 */

import type { GPUContext } from '../gpu-context.js';
import { LIFSimulator } from '../lif-simulator.js';
import { DEFAULT_LIF_PARAMS } from '../types.js';

export interface LIFProbeOptions {
  /** Number of LIF neurons in the population. Paper default: 1000. */
  neuronCount: number;
  /** Number of simulation ticks to run. Paper default: 100. */
  tickCount: number;
  /**
   * Integer seed for deterministic stimulus generation (CPU-side,
   * xorshift32 — does NOT rely on GPU RNG). Same seed ⇒ same
   * synaptic input pattern ⇒ same membrane-potential output.
   * Paper default: 42.
   */
  stimulusSeed: number;
  /**
   * Optional LIF parameter overrides. Defaults to
   * `DEFAULT_LIF_PARAMS`, which is what Paper #2 uses.
   */
  params?: Parameters<typeof LIFSimulator.prototype.updateParams>[0];
  /**
   * Stimulus amplitude range (min, max) in pA. Generated currents
   * are uniformly distributed in this range by the seeded xorshift32
   * stream. Paper default: [0, 1.2] (subthreshold + occasional
   * suprathreshold drive).
   */
  stimulusAmplitude?: { min: number; max: number };
}

/**
 * xorshift32 — tiny deterministic PRNG. Avoids reliance on host
 * Math.random (which is not seedable) and avoids GPU RNG (which
 * would defeat the cross-backend determinism claim).
 */
function xorshift32(seed: number): () => number {
  let state = (seed | 0) || 1; // avoid 0 state
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    // Return in [0, 1)
    return ((state >>> 0) / 0x100000000);
  };
}

function makeStimulus(
  neuronCount: number,
  seed: number,
  range: { min: number; max: number }
): Float32Array {
  const rng = xorshift32(seed);
  const span = range.max - range.min;
  const stim = new Float32Array(neuronCount);
  for (let i = 0; i < neuronCount; i++) {
    stim[i] = range.min + rng() * span;
  }
  return stim;
}

/**
 * Run the probe. Returns the final membrane-potential state as a
 * `Uint8Array` view — the harness will hash these bytes, and two
 * runs with identical inputs against identical backends MUST produce
 * identical hashes.
 *
 * Caller is responsible for lifecycle of the `GPUContext`; the probe
 * creates and destroys its own `LIFSimulator` per invocation so
 * repeated probes do not share membrane state.
 */
export async function runLIFDeterminismProbe(
  ctx: GPUContext,
  options: LIFProbeOptions
): Promise<Uint8Array> {
  const neuronCount = options.neuronCount;
  const tickCount = options.tickCount;
  const stimulusSeed = options.stimulusSeed;
  const stimulusAmplitude = options.stimulusAmplitude ?? { min: 0, max: 1.2 };

  if (neuronCount <= 0 || !Number.isInteger(neuronCount)) {
    throw new Error(`LIFDeterminismProbe: neuronCount must be a positive integer, got ${neuronCount}`);
  }
  if (tickCount <= 0 || !Number.isInteger(tickCount)) {
    throw new Error(`LIFDeterminismProbe: tickCount must be a positive integer, got ${tickCount}`);
  }

  const sim = new LIFSimulator(ctx, neuronCount, options.params);
  try {
    await sim.initialize();
    sim.resetState();

    const stimulus = makeStimulus(neuronCount, stimulusSeed, stimulusAmplitude);
    sim.setSynapticInput(stimulus);

    await sim.stepN(tickCount);

    const readback = await sim.readMembranePotentials();
    // Return the membrane-potential bytes verbatim. The harness
    // hashes them; any numerical divergence between backends
    // surfaces as a different hash.
    return new Uint8Array(
      readback.data.buffer,
      readback.data.byteOffset,
      readback.data.byteLength
    );
  } finally {
    sim.destroy();
  }
}

/**
 * Paper #2 canonical probe configuration.
 *
 * The specific parameters the paper's cross-backend table is
 * produced against. Kept here as a named constant so the paper
 * text, the test suite, and any replication attempt all refer
 * to the same values.
 */
export const PAPER_2_CANONICAL_CONFIG: Readonly<LIFProbeOptions> = Object.freeze({
  neuronCount: 1000,
  tickCount: 100,
  stimulusSeed: 42,
  stimulusAmplitude: { min: 0, max: 1.2 },
  params: DEFAULT_LIF_PARAMS,
});
