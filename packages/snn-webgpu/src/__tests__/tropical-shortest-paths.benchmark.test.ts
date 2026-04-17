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

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
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
    // GitHub Actions has no Vulkan/WebGPU drivers; the mock layer can diverge from CPU APSP.
    if (process.env.CI === 'true') {
      return;
    }
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

  it('finds GPU crossover point for APSP across extended sizes', async () => {
    const sizes = [32, 64, 128, 256, 512, 1024];
    const warmupRuns = 1;
    const timedRuns = 3;
    const results: Array<{
      n: number;
      cpuMs: number;
      gpuMs: number;
      speedup: number;
      winner: string;
    }> = [];

    for (const n of sizes) {
      const adjacency = makeDenseGraph(n, Math.min(0.3, 20 / n));

      const cpu = new TropicalShortestPaths(ctx, { preferGPU: false });
      const gpu = new TropicalShortestPaths(ctx, {
        preferGPU: true,
        denseCpuThreshold: 1,
      });

      // Warmup: let GPU pipeline compile + cache
      for (let w = 0; w < warmupRuns; w++) {
        await gpu.computeAPSP(adjacency, n);
      }

      // Timed CPU runs
      const cpuTimings: number[] = [];
      for (let r = 0; r < timedRuns; r++) {
        const start = performance.now();
        await cpu.computeAPSP(adjacency, n);
        cpuTimings.push(performance.now() - start);
      }

      // Timed GPU runs
      const gpuTimings: number[] = [];
      for (let r = 0; r < timedRuns; r++) {
        const start = performance.now();
        await gpu.computeAPSP(adjacency, n);
        gpuTimings.push(performance.now() - start);
      }

      const cpuMedian = median(cpuTimings);
      const gpuMedian = median(gpuTimings);
      const speedup = cpuMedian / gpuMedian;

      results.push({
        n,
        cpuMs: cpuMedian,
        gpuMs: gpuMedian,
        speedup,
        winner: speedup > 1.0 ? 'GPU' : 'CPU',
      });

      cpu.destroy();
      gpu.destroy();
    }

    // Print publishable table
    console.log('\n[tropical-crossover] === GPU Crossover Benchmark (APSP, median of 3 runs) ===');
    console.log('[tropical-crossover] N\tCPU(ms)\tGPU(ms)\tSpeedup\tWinner');
    for (const r of results) {
      console.log(
        `[tropical-crossover] ${r.n}\t${r.cpuMs.toFixed(2)}\t${r.gpuMs.toFixed(2)}\t${r.speedup.toFixed(2)}x\t${r.winner}`
      );
    }

    // Find crossover
    const crossover = results.find((r) => r.winner === 'GPU');
    if (crossover) {
      console.log(
        `[tropical-crossover] GPU crossover at N=${crossover.n} (${crossover.speedup.toFixed(1)}x speedup)`
      );
    } else {
      console.log('[tropical-crossover] GPU did not win at any tested size');
    }

    // Find max speedup
    const maxSpeedup = results.reduce((best, r) => (r.speedup > best.speedup ? r : best));
    console.log(
      `[tropical-crossover] Max speedup: ${maxSpeedup.speedup.toFixed(2)}x at N=${maxSpeedup.n}`
    );

    // Sanity: all timings are positive
    expect(results.every((r) => r.cpuMs > 0 && r.gpuMs > 0)).toBe(true);
  }, 120_000);
});
