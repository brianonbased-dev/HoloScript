import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GPUContext } from '../gpu-context.js';
import { TropicalShortestPaths } from '../graph/TropicalShortestPaths.js';
import { TROPICAL_INF } from '../graph/TropicalGraphUtils.js';

function makeDenseGraph(n: number, edgeProbability = 0.15): Float32Array {
  const out = new Float32Array(n * n).fill(TROPICAL_INF);
  for (let i = 0; i < n; i++) {
    out[i * n + i] = 0;
  }

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      if (Math.random() < edgeProbability) {
        out[i * n + j] = 1 + Math.floor(Math.random() * 9);
      }
    }
  }

  return out;
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);
}

describe('TropicalShortestPaths benchmark harness', () => {
  let ctx: GPUContext;

  beforeEach(async () => {
    ctx = new GPUContext();
    await ctx.initialize();
  });

  afterEach(() => {
    ctx.destroy();
  });

  it('cpu and auto routes agree on APSP result for a medium graph', async () => {
    const n = 32;
    const adjacency = makeDenseGraph(n, 0.2);

    const cpu = new TropicalShortestPaths(ctx, { preferGPU: false });
    const auto = new TropicalShortestPaths(ctx, {
      preferGPU: true,
      denseCpuThreshold: 8,
    });

    const cpuResult = await cpu.computeAPSP(adjacency, n);
    const autoResult = await auto.computeAPSP(adjacency, n);

    for (let i = 0; i < cpuResult.length; i++) {
      expect(Math.abs(cpuResult[i] - autoResult[i])).toBeLessThan(1e-3);
    }

    cpu.destroy();
    auto.destroy();
  });

  it('prints CPU vs AUTO timing snapshot for crossover tuning', async () => {
    const sizes = [16, 32, 64];
    const cpuTimes: number[] = [];
    const autoTimes: number[] = [];

    for (const n of sizes) {
      const adjacency = makeDenseGraph(n, 0.2);

      const cpu = new TropicalShortestPaths(ctx, { preferGPU: false });
      const auto = new TropicalShortestPaths(ctx, {
        preferGPU: true,
        denseCpuThreshold: 8,
      });

      const cpuStart = performance.now();
      await cpu.computeAPSP(adjacency, n);
      cpuTimes.push(performance.now() - cpuStart);

      const autoStart = performance.now();
      await auto.computeAPSP(adjacency, n);
      autoTimes.push(performance.now() - autoStart);

      cpu.destroy();
      auto.destroy();
    }

    console.log('[tropical-benchmark] sizes=', sizes);
    console.log('[tropical-benchmark] cpuTimesMs=', cpuTimes.map((v) => v.toFixed(2)).join(', '));
    console.log(
      '[tropical-benchmark] autoTimesMs=',
      autoTimes.map((v) => v.toFixed(2)).join(', ')
    );
    console.log(
      `[tropical-benchmark] mean cpu=${mean(cpuTimes).toFixed(2)}ms auto=${mean(autoTimes).toFixed(2)}ms`
    );

    expect(cpuTimes.every((v) => v > 0)).toBe(true);
    expect(autoTimes.every((v) => v > 0)).toBe(true);
  });
});
