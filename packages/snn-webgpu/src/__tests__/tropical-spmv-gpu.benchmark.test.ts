/**
 * GPU CSR tropical min-plus SpMV throughput benchmark (Paper #2).
 *
 * Measures tropicalSpmv() on live WebGPU (Dawn) and validates correctness
 * against the CPU reference from @holoscript/core.
 *
 * CI-friendly: skips GPU timing when no live adapter is present (mocks
 * produce no-op compute passes). CPU reference always runs.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GPUContext } from '../gpu-context.js';
import { TropicalShortestPaths, type TropicalCSRGraph } from '../graph/TropicalShortestPaths.js';
import {
  erdosRenyiCsr,
  barabasiAlbertCsr,
  layeredNeuralCsr,
  mulberry32,
  tropicalMinPlusSpmv,
  maxAbsDiff,
  TROPICAL_INF,
} from '@holoscript/core/math/tropical-spmv';
import { GPU_LIVE } from './setup.js';

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  return n % 2 === 0 ? (sorted[n / 2 - 1]! + sorted[n / 2]!) / 2 : sorted[Math.floor(n / 2)]!;
}

function p99Sorted(sorted: number[]): number {
  const n = sorted.length;
  if (n === 0) return 0;
  return sorted[Math.min(n - 1, Math.floor(n * 0.99))]!;
}

interface SpmvResult {
  name: string;
  nnz: number;
  gpuMedianMs: number;
  gpuP99Ms: number;
  cpuMedianMs: number;
  nzPerSecGpu: number;
  nzPerSecCpu: number;
  maxDiff: number;
}

describe('Tropical CSR SpMV GPU benchmark', () => {
  let ctx: GPUContext;
  let tropical: TropicalShortestPaths;

  beforeEach(async () => {
    ctx = new GPUContext();
    await ctx.initialize();
    tropical = new TropicalShortestPaths(ctx, {
      preferGPU: true,
      sparseCpuThreshold: 1,
    });
  });

  afterEach(() => {
    tropical.destroy();
    ctx.destroy();
  });

  it('GPU tropicalSpmv vs CPU reference: throughput + correctness', async () => {
    // In CI without a live GPU the mock compute pass is a no-op; timings
    // would be meaningless and correctness would fail. Skip GPU portion.
    if (!GPU_LIVE) {
      console.log('[tropical-spmv-gpu] Skipping GPU benchmark: no live GPU');
      return;
    }

    const n = 512;
    const rng = mulberry32(42);
    const graphs: { name: string; graph: TropicalCSRGraph }[] = [
      { name: 'ER p=0.02', graph: erdosRenyiCsr(n, 0.02, rng) },
      { name: 'ER p=0.05', graph: erdosRenyiCsr(n, 0.05, rng) },
      { name: 'BA m=4', graph: barabasiAlbertCsr(n, 4, rng) },
      { name: 'Layered skips p=0.12', graph: layeredNeuralCsr(n, 8, 0.12, rng) },
    ];

    const results: SpmvResult[] = [];

    for (const { name, graph } of graphs) {
      const dist = new Float32Array(n).fill(TROPICAL_INF);
      dist[0] = 0; // typical SSSP source vector

      // CPU reference timing
      const cpuOut = new Float32Array(n);
      const cpuSamples: number[] = [];
      const cpuRuns = 100;
      for (let r = 0; r < cpuRuns; r++) {
        const start = performance.now();
        tropicalMinPlusSpmv(graph, dist, cpuOut);
        cpuSamples.push(performance.now() - start);
      }
      const cpuSorted = [...cpuSamples].sort((a, b) => a - b);
      const cpuMedian = median(cpuSamples);

      // GPU timing
      const gpuSamples: number[] = [];
      const gpuRuns = GPU_LIVE ? 100 : 10;
      let gpuOutForDiff = new Float32Array(n);
      for (let r = 0; r < gpuRuns; r++) {
        const start = performance.now();
        const gpuOut = await tropical.tropicalSpmv(graph, dist);
        gpuSamples.push(performance.now() - start);

        if (r === 0) {
          gpuOutForDiff = gpuOut;
        }
      }
      const gpuSorted = [...gpuSamples].sort((a, b) => a - b);
      const gpuMedian = median(gpuSamples);
      const gpuP99 = p99Sorted(gpuSorted);

      const nnz = graph.values.length;
      const diff = maxAbsDiff(gpuOutForDiff, cpuOut);

      results.push({
        name,
        nnz,
        gpuMedianMs: gpuMedian,
        gpuP99Ms: gpuP99,
        cpuMedianMs: cpuMedian,
        nzPerSecGpu: (nnz / gpuMedian) * 1000,
        nzPerSecCpu: (nnz / cpuMedian) * 1000,
        maxDiff: diff,
      });

      // Per-topology correctness assertion
      expect(diff).toBeLessThan(1e-3);
    }

    // Print publishable table
    console.log('\n[tropical-spmv-gpu] === CSR Tropical SpMV Benchmark ===');
    console.log(
      '[tropical-spmv-gpu] Topology | nnz | GPU med/p99 (ms) | CPU med (ms) | nz/s GPU | nz/s CPU | maxDiff'
    );
    for (const r of results) {
      console.log(
        `[tropical-spmv-gpu] ${r.name} | ${r.nnz} | ${r.gpuMedianMs.toFixed(3)}/${r.gpuP99Ms.toFixed(3)} | ${r.cpuMedianMs.toFixed(3)} | ${(r.nzPerSecGpu / 1e6).toFixed(1)}M | ${(r.nzPerSecCpu / 1e6).toFixed(1)}M | ${r.maxDiff.toExponential(2)}`
      );
    }

    // Sanity: all timings positive, all diffs small
    expect(results.every((r) => r.gpuMedianMs > 0 && r.cpuMedianMs > 0)).toBe(true);
    expect(results.every((r) => r.maxDiff < 1e-3)).toBe(true);
  }, 120_000);
});
