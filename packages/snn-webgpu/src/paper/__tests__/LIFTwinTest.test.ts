/**
 * LIFTwinTest — Paper #2 twin-test equivalence substrate.
 *
 * Compares the CPU numerical reference against a live WebGPU LIFSimulator on
 * identical deterministic input. The scoped assertions are membrane agreement
 * within the declared tolerances and equality of the final spike masks for the
 * tested live adapter. This is not cross-vendor byte-identity evidence.
 *
 * Fallback runs return before parity assertions and are not GPU evidence.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { GPUContext } from '../../gpu-context.js';
import { LIFSimulator } from '../../lif-simulator.js';
import { CPUReferenceSimulator, generateSynapticInput } from '../../poc/cpu-reference.js';
import { DEFAULT_LIF_PARAMS } from '../../types.js';
import { GPU_LIVE } from '../../__tests__/setup.js';

const ABSOLUTE_TOLERANCE = 5e-5;
const RELATIVE_TOLERANCE = 1e-4;

interface LifTwinDelta {
  maxAbsDiff: number;
  maxRelDiff: number;
  spikeMismatches: number;
}

function measureLifTwinDelta(
  cpuMembrane: Float32Array,
  gpuMembrane: Float32Array,
  cpuSpikes: Uint32Array,
  gpuSpikes: Float32Array | Uint32Array
): LifTwinDelta {
  let maxAbsDiff = 0;
  let maxRelDiff = 0;
  let spikeMismatches = 0;

  for (let i = 0; i < cpuMembrane.length; i++) {
    const cpuVal = cpuMembrane[i]!;
    const gpuVal = gpuMembrane[i]!;
    const absDiff = Math.abs(cpuVal - gpuVal);
    const relDiff = absDiff / (Math.abs(cpuVal) + 1e-6);
    if (absDiff > maxAbsDiff) maxAbsDiff = absDiff;
    if (relDiff > maxRelDiff) maxRelDiff = relDiff;
    if (gpuSpikes[i] !== cpuSpikes[i]) spikeMismatches++;
  }

  return { maxAbsDiff, maxRelDiff, spikeMismatches };
}

function expectLifTwinParity(delta: LifTwinDelta): void {
  // Tolerance covers f32 exp() differences between TS Math.exp and WGSL exp.
  expect(delta.maxRelDiff).toBeLessThan(RELATIVE_TOLERANCE);
  expect(delta.maxAbsDiff).toBeLessThan(ABSOLUTE_TOLERANCE);
  expect(delta.spikeMismatches).toBe(0);
}

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

    expectLifTwinParity(measureLifTwinDelta(cpuV, gpuMembrane.data, cpuS, gpuSpikes.data));

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

    expectLifTwinParity({
      maxAbsDiff,
      maxRelDiff,
      spikeMismatches: N - spikeMatch,
    });

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

    expectLifTwinParity(measureLifTwinDelta(cpuV, gpuMembrane.data, cpuS, gpuSpikes.data));

    gpuSim.destroy();
  });

  it('failure guard detects a deliberately divergent twin output', () => {
    const N = 64;
    const T = 4;
    const cpuSim = new CPUReferenceSimulator(N, DEFAULT_LIF_PARAMS);
    const stimulus = generateSynapticInput(N, 31415, 0, 15);
    for (let t = 0; t < T; t++) {
      cpuSim.step(stimulus);
    }

    const cpuMembrane = cpuSim.getMembraneV();
    const divergentMembrane = new Float32Array(cpuMembrane);
    divergentMembrane[17] += ABSOLUTE_TOLERANCE * 4;

    const cpuSpikes = cpuSim.getSpikes();
    const divergentSpikes = new Uint32Array(cpuSpikes);
    divergentSpikes[23] = cpuSpikes[23] === 0 ? 1 : 0;

    const delta = measureLifTwinDelta(cpuMembrane, divergentMembrane, cpuSpikes, divergentSpikes);

    expect(delta.maxAbsDiff).toBeGreaterThan(ABSOLUTE_TOLERANCE);
    expect(delta.spikeMismatches).toBe(1);
  });
});
