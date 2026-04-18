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
  const n = sorted.length;
  return n % 2 === 0 ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : sorted[Math.floor(n / 2)];
}

function p99Sorted(sorted: number[]): number {
  const n = sorted.length;
  if (n === 0) return 0;
  return sorted[Math.min(n - 1, Math.floor(n * 0.99))];
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
    const runsPerSize = Number.parseInt(process.env.BENCH_SNAPSHOT_N ?? '30', 10);

    console.log('[tropical-benchmark] sizes=', sizes, `runsPerSize=${runsPerSize}`);

    for (const n of sizes) {
      const cpuSamples: number[] = [];
      const autoSamples: number[] = [];

      for (let r = 0; r < runsPerSize; r++) {
        const adjacency = makeDenseGraph(n, 0.2);

        const cpu = new TropicalShortestPaths(ctx, { preferGPU: false });
        const auto = new TropicalShortestPaths(ctx, {
          preferGPU: true,
          denseCpuThreshold: 8,
        });

        const cpuStart = performance.now();
        await cpu.computeAPSP(adjacency, n);
        cpuSamples.push(performance.now() - cpuStart);

        const autoStart = performance.now();
        await auto.computeAPSP(adjacency, n);
        autoSamples.push(performance.now() - autoStart);

        cpu.destroy();
        auto.destroy();
      }

      const cpuSorted = [...cpuSamples].sort((a, b) => a - b);
      const autoSorted = [...autoSamples].sort((a, b) => a - b);
      const cpuMed = median(cpuSamples);
      const autoMed = median(autoSamples);
      const cpuP = p99Sorted(cpuSorted);
      const autoP = p99Sorted(autoSorted);

      console.log(
        `[tropical-benchmark] N=${n} CPU med/p99=${cpuMed.toFixed(3)}/${cpuP.toFixed(3)}ms AUTO med/p99=${autoMed.toFixed(3)}/${autoP.toFixed(3)}ms (mean cpu=${mean(cpuSamples).toFixed(3)} auto=${mean(autoSamples).toFixed(3)}ms)`
      );

      expect(cpuSamples.every((v) => v > 0)).toBe(true);
      expect(autoSamples.every((v) => v > 0)).toBe(true);
    }
  });

  it('finds GPU crossover point for APSP across extended sizes', async () => {
    const sizes = [32, 64, 128, 256, 512, 1024];
    const warmupRuns = 1;
    const timedRuns = 100; // Increased to get meaningful p99
    const results: Array<{
      n: number;
      cpuMedian: number;
      cpuP99: number;
      gpuMedian: number;
      gpuP99: number;
      speedup: number;
      winner: string;
    }> = [];

    for (const n of sizes) {
      // For large graphs, reduce timed runs to avoid timeout but keep enough samples for p99.
      // Override via BENCH_N_LARGE env var for revision-grade runs.
      const largeRuns = Number.parseInt(process.env.BENCH_N_LARGE ?? '10', 10);
      const runs = n >= 512 ? largeRuns : timedRuns;
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
      for (let r = 0; r < runs; r++) {
        const start = performance.now();
        await cpu.computeAPSP(adjacency, n);
        cpuTimings.push(performance.now() - start);
      }

      // Timed GPU runs
      const gpuTimings: number[] = [];
      for (let r = 0; r < runs; r++) {
        const start = performance.now();
        await gpu.computeAPSP(adjacency, n);
        gpuTimings.push(performance.now() - start);
      }

      const cpuSorted = [...cpuTimings].sort((a, b) => a - b);
      const gpuSorted = [...gpuTimings].sort((a, b) => a - b);

      const cpuMedian = median(cpuTimings);
      const cpuP99 = p99Sorted(cpuSorted);
      const gpuMedian = median(gpuTimings);
      const gpuP99 = p99Sorted(gpuSorted);
      const speedup = cpuMedian / gpuMedian;

      results.push({
        n,
        cpuMedian,
        cpuP99,
        gpuMedian,
        gpuP99,
        speedup,
        winner: speedup > 1.0 ? 'GPU' : 'CPU',
      });

      cpu.destroy();
      gpu.destroy();
    }

    // Print publishable table
    console.log('\n[tropical-crossover] === GPU Crossover Benchmark (APSP) ===');
    console.log('[tropical-crossover] N\tCPU(med/p99)\tGPU(med/p99)\tSpeedup\tWinner');
    for (const r of results) {
      console.log(
        `[tropical-crossover] ${r.n}\t${r.cpuMedian.toFixed(2)}/${r.cpuP99.toFixed(2)}\t${r.gpuMedian.toFixed(2)}/${r.gpuP99.toFixed(2)}\t${r.speedup.toFixed(2)}x\t${r.winner}`
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
    expect(results.every((r) => r.cpuMedian > 0 && r.gpuMedian > 0)).toBe(true);
    // Paper-grade sweep: N=1024 × many samples can exceed several minutes; per-test
    // timeout must exceed Vitest default and match bench-paper-rigorous harness budget.
  }, 1_200_000);
});
