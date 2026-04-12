import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GPUContext } from '../gpu-context.js';
import { TropicalShortestPaths, type TropicalCSRGraph } from '../graph/TropicalShortestPaths.js';

const INF = 1e30;

describe('TropicalShortestPaths', () => {
  let ctx: GPUContext;
  let tropical: TropicalShortestPaths;

  beforeEach(async () => {
    ctx = new GPUContext();
    await ctx.initialize();
    tropical = new TropicalShortestPaths(ctx);
  });

  afterEach(() => {
    tropical.destroy();
    ctx.destroy();
  });

  it('computes APSP with tropical min-plus GEMM path doubling', async () => {
    const adjacency = new Float32Array([
      0, 3, 10, INF,
      INF, 0, 1, 7,
      INF, INF, 0, 2,
      INF, INF, INF, 0,
    ]);

    const result = await tropical.computeAPSP(adjacency, 4);

    const row0 = Array.from(result.slice(0, 4));
    expect(row0[0]).toBeCloseTo(0);
    expect(row0[1]).toBeCloseTo(3);
    expect(row0[2]).toBeCloseTo(4);
    expect(row0[3]).toBeCloseTo(6);
  });

  it('computes SSSP over a sparse CSR graph with tropical relaxation', async () => {
    const graph: TropicalCSRGraph = {
      rowPtr: new Uint32Array([0, 2, 4, 5, 5]),
      colIdx: new Uint32Array([1, 2, 2, 3, 3]),
      values: new Float32Array([3, 10, 1, 7, 2]),
    };

    const result = await tropical.computeSSSP(graph, 0);

    expect(result[0]).toBeCloseTo(0);
    expect(result[1]).toBeCloseTo(3);
    expect(result[2]).toBeCloseTo(4);
    expect(result[3]).toBeCloseTo(6);
  });
});
