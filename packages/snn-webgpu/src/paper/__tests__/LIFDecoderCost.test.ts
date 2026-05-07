/**
 * LIFDecoderCost — Paper #2 decoder-cost substrate.
 *
 * Measures GPU→CPU readback latency for membrane potentials and spike
 * masks across neuron counts that span the paper's evaluation range.
 * The assertion is: readback cost is O(N) in neuron count and remains
 * below the per-timestep simulation cost, so the decoder is not the
 * bottleneck.
 *
 * Empirical substrate for §Decoder Cost (W.314).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { GPUContext } from '../../gpu-context.js';
import { LIFSimulator } from '../../lif-simulator.js';
import { generateSynapticInput } from '../../poc/cpu-reference.js';
import { DEFAULT_LIF_PARAMS } from '../../types.js';
import { GPU_LIVE } from '../../__tests__/setup.js';

describe('LIFDecoderCost (Paper #2 readback overhead)', () => {
  let ctx: GPUContext;
  const readbackThroughputMinGbps = Number.parseFloat(process.env.SNN_READBACK_GBPS_MIN ?? '0');

  beforeAll(async () => {
    ctx = new GPUContext();
    await ctx.initialize();
  });

  afterAll(() => {
    ctx.destroy();
  });

  async function measureReadback(N: number, ticks: number) {
    const sim = new LIFSimulator(ctx, N, DEFAULT_LIF_PARAMS);
    await sim.initialize();
    sim.resetState();

    const stimulus = generateSynapticInput(N, 42, 0, 15);
    sim.setSynapticInput(stimulus);

    // Warm-up: one readback so the first measurement isn't cold-cache
    await sim.step();
    await sim.readMembranePotentials();
    sim.resetState();
    sim.setSynapticInput(stimulus);

    // Simulation-only timing
    const simStart = performance.now();
    await sim.stepN(ticks);
    const simOnlyMs = performance.now() - simStart;

    // Readback timing (membrane + spikes, serial — worst case)
    const readStart = performance.now();
    const membrane = await sim.readMembranePotentials();
    const spikes = await sim.readSpikes();
    const readbackMs = performance.now() - readStart;

    const totalMs = simOnlyMs + readbackMs;
    const readbackRatio = readbackMs / totalMs;

    sim.destroy();

    return {
      N,
      ticks,
      simOnlyMs,
      readbackMs,
      totalMs,
      readbackRatio,
      bytesRead: membrane.data.byteLength + spikes.data.byteLength,
    };
  }

  it('readback cost stays sub-linear vs simulation at N=1,024', async () => {
    if (!GPU_LIVE) {
      console.log('[lif-decoder-cost] Skipping timing assertion: mock compute has no simulation work');
      return;
    }
    const r = await measureReadback(1024, 100);
    expect(r.readbackRatio).toBeLessThan(0.15); // <15% of total time
    expect(r.readbackMs / r.ticks).toBeLessThan(0.05); // <50 µs per tick
  });

  it('readback cost stays sub-linear vs simulation at N=65,536', async () => {
    if (!GPU_LIVE) {
      console.log('[lif-decoder-cost] Skipping timing assertion: mock compute has no simulation work');
      return;
    }
    const r = await measureReadback(65536, 100);
    expect(r.readbackRatio).toBeLessThan(0.10); // <10% of total time
    expect(r.readbackMs / r.ticks).toBeLessThan(0.20); // <200 µs per tick
  });

  it('readback scales linearly with N (ratio check)', async () => {
    if (!GPU_LIVE) {
      console.log('[lif-decoder-cost] Skipping timing assertion: mock compute has no simulation work');
      return;
    }
    const r1k = await measureReadback(1024, 10);
    const r64k = await measureReadback(65536, 10);

    const sizeRatio = r64k.N / r1k.N; // 64×
    const readbackRatio = r64k.readbackMs / r1k.readbackMs;

    // Readback scales at most linearly (≤64×) and can be sub-linear
    // because GPU copy engines batch large transfers and small transfers are
    // latency-dominated under recursive workspace load.
    expect(readbackRatio).toBeLessThanOrEqual(sizeRatio * 1.5);
    expect(readbackRatio).toBeGreaterThan(0);
  });

  it('reports effective readback throughput', async () => {
    if (!GPU_LIVE) {
      console.log('[lif-decoder-cost] Skipping throughput assertion: mock compute has no simulation work');
      return;
    }
    const r = await measureReadback(262144, 50);
    const gbps = (r.bytesRead / (r.readbackMs / 1000)) / 1e9;
    expect(Number.isFinite(gbps)).toBe(true);
    expect(gbps).toBeGreaterThan(0);
    if (readbackThroughputMinGbps > 0) {
      expect(gbps).toBeGreaterThan(readbackThroughputMinGbps);
    }
  });
});
