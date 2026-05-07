/**
 * LIFTwinTest — Paper #2 twin-test equivalence substrate.
 *
 * Compares the CPU reference implementation (bit-exact ground truth)
 * against the WebGPU LIFSimulator on identical deterministic input.
 * The twin-test assertion is: membrane potentials match within
 * IEEE-754 f32 tolerance and spike masks are exact.
 *
 * This test is the empirical substrate for the paper's
 * §Twin Test Equivalence subsection (W.315 / P.312).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { GPUContext } from '../../gpu-context.js';
import { LIFSimulator } from '../../lif-simulator.js';
import { CPUReferenceSimulator, generateSynapticInput } from '../../poc/cpu-reference.js';
import { DEFAULT_LIF_PARAMS } from '../../types.js';
import { GPU_LIVE } from '../../__tests__/setup.js';

describe('LIFTwinTest (Paper #2 CPU↔GPU parity)', () => {
  let ctx: GPUContext;

  beforeAll(async () => {
    ctx = new GPUContext();
    await ctx.initialize();
  });

  afterAll(() => {
    ctx.destroy();
  });

  it('produces parity at N=1,000 neurons / 100 ticks (canonical config)', async () => {
    if (!GPU_LIVE) {
      console.log('[lif-twin] Skipping CPU/GPU parity assertion: mock compute is no-op');
      return;
    }
    const N = 1000;
    const T = 100;
    const seed = 42;

    // CPU reference
    const cpuSim = new CPUReferenceSimulator(N, DEFAULT_LIF_PARAMS);
    const stimulus = generateSynapticInput(N, seed, 0, 15);
    const cpuResults: ReturnType<typeof cpuSim.step>[] = [];
    for (let t = 0; t < T; t++) {
      cpuResults.push(cpuSim.step(stimulus));
    }

    // GPU simulator
    const gpuSim = new LIFSimulator(ctx, N, DEFAULT_LIF_PARAMS);
    await gpuSim.initialize();
    gpuSim.resetState();
    gpuSim.setSynapticInput(stimulus);
    await gpuSim.stepN(T);

    // Readback
    const gpuMembrane = await gpuSim.readMembranePotentials();
    const gpuSpikes = await gpuSim.readSpikes();

    // Parity assertions
    const cpuV = cpuSim.getMembraneV();
    const cpuS = cpuSim.getSpikes();

    for (let i = 0; i < N; i++) {
      const cpuVal = cpuV[i];
      const gpuVal = gpuMembrane.data[i];
      const absDiff = Math.abs(cpuVal - gpuVal);
      const relDiff = absDiff / (Math.abs(cpuVal) + 1e-6);

      // Tolerance: 1e-4 relative or 5e-5 absolute covers f32 exp() differences
      expect(relDiff).toBeLessThan(1e-4);
      expect(absDiff).toBeLessThan(5e-5);

      // Spike masks must be exact (0 or 1)
      expect(gpuSpikes.data[i]).toBe(cpuS[i]);
    }

    gpuSim.destroy();
  });

  it('produces parity at N=65,536 neurons / 10 ticks (large-population smoke)', async () => {
    if (!GPU_LIVE) {
      console.log('[lif-twin] Skipping CPU/GPU parity assertion: mock compute is no-op');
      return;
    }
    const N = 65536;
    const T = 10;
    const seed = 2026;

    const cpuSim = new CPUReferenceSimulator(N, DEFAULT_LIF_PARAMS);
    const stimulus = generateSynapticInput(N, seed, 0, 15);
    for (let t = 0; t < T; t++) {
      cpuSim.step(stimulus);
    }

    const gpuSim = new LIFSimulator(ctx, N, DEFAULT_LIF_PARAMS);
    await gpuSim.initialize();
    gpuSim.resetState();
    gpuSim.setSynapticInput(stimulus);
    await gpuSim.stepN(T);

    const gpuMembrane = await gpuSim.readMembranePotentials();
    const gpuSpikes = await gpuSim.readSpikes();
    const cpuV = cpuSim.getMembraneV();
    const cpuS = cpuSim.getSpikes();

    let spikeMatch = 0;
    let spikeTotal = 0;
    let maxAbsDiff = 0;
    let maxRelDiff = 0;

    for (let i = 0; i < N; i++) {
      const cpuVal = cpuV[i];
      const gpuVal = gpuMembrane.data[i];
      const absDiff = Math.abs(cpuVal - gpuVal);
      const relDiff = absDiff / (Math.abs(cpuVal) + 1e-6);
      if (absDiff > maxAbsDiff) maxAbsDiff = absDiff;
      if (relDiff > maxRelDiff) maxRelDiff = relDiff;

      if (cpuS[i] > 0) spikeTotal++;
      if (gpuSpikes.data[i] === cpuS[i]) spikeMatch++;
    }

    expect(maxRelDiff).toBeLessThan(1e-4);
    expect(maxAbsDiff).toBeLessThan(5e-5);
    expect(spikeMatch).toBe(N); // exact spike mask parity

    gpuSim.destroy();
  });

  it('produces parity across different parameter overrides', async () => {
    if (!GPU_LIVE) {
      console.log('[lif-twin] Skipping CPU/GPU parity assertion: mock compute is no-op');
      return;
    }
    const N = 2048;
    const T = 20;
    const seed = 7;
    const params = { tau: 10.0, vThreshold: -50.0, vReset: -70.0, vRest: -65.0, dt: 0.5 };

    const cpuSim = new CPUReferenceSimulator(N, params);
    const stimulus = generateSynapticInput(N, seed, 0, 10);
    for (let t = 0; t < T; t++) {
      cpuSim.step(stimulus);
    }

    const gpuSim = new LIFSimulator(ctx, N, params);
    await gpuSim.initialize();
    gpuSim.resetState();
    gpuSim.setSynapticInput(stimulus);
    await gpuSim.stepN(T);

    const gpuMembrane = await gpuSim.readMembranePotentials();
    const gpuSpikes = await gpuSim.readSpikes();
    const cpuV = cpuSim.getMembraneV();
    const cpuS = cpuSim.getSpikes();

    for (let i = 0; i < N; i++) {
      expect(Math.abs(cpuV[i] - gpuMembrane.data[i])).toBeLessThan(5e-5);
      expect(gpuSpikes.data[i]).toBe(cpuS[i]);
    }

    gpuSim.destroy();
  });
});
