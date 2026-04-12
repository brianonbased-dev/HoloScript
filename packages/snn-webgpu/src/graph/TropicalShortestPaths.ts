import type { GPUContext } from '../gpu-context.js';
import { BufferManager } from '../buffer-manager.js';
import { PipelineFactory } from '../pipeline-factory.js';

export interface TropicalCSRGraph {
  rowPtr: Uint32Array;
  colIdx: Uint32Array;
  values: Float32Array;
}

export interface TropicalShortestPathsOptions {
  /** Prefer GPU kernels when practical. Default: true */
  preferGPU?: boolean;
  /** Use CPU path below this APSP matrix size. Default: 128 */
  denseCpuThreshold?: number;
  /** Use CPU path below this sparse row count. Default: 256 */
  sparseCpuThreshold?: number;
}

const INF = 1e30;
const GEMM_WORKGROUP = 16;
const SPMV_WORKGROUP = 256;
const UNIFORM_BYTE_SIZE = 16;

function packDenseDims(m: number, n: number, k: number): ArrayBuffer {
  const buffer = new ArrayBuffer(UNIFORM_BYTE_SIZE);
  const u32 = new Uint32Array(buffer);
  u32[0] = m;
  u32[1] = n;
  u32[2] = k;
  u32[3] = 0;
  return buffer;
}

function packSparseDims(rows: number): ArrayBuffer {
  const buffer = new ArrayBuffer(UNIFORM_BYTE_SIZE);
  const u32 = new Uint32Array(buffer);
  u32[0] = rows;
  u32[1] = 0;
  u32[2] = 0;
  u32[3] = 0;
  return buffer;
}

function arraysEqual(a: Float32Array, b: Float32Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (Math.abs(a[i] - b[i]) > 1e-6) return false;
  }
  return true;
}

function transposeCSR(graph: TropicalCSRGraph): TropicalCSRGraph {
  const rows = graph.rowPtr.length - 1;
  const edgeCount = graph.colIdx.length;
  const incomingCounts = new Uint32Array(rows);

  for (let i = 0; i < edgeCount; i++) {
    incomingCounts[graph.colIdx[i]]++;
  }

  const rowPtr = new Uint32Array(rows + 1);
  for (let row = 0; row < rows; row++) {
    rowPtr[row + 1] = rowPtr[row] + incomingCounts[row];
  }

  const nextWrite = new Uint32Array(rowPtr);
  const colIdx = new Uint32Array(edgeCount);
  const values = new Float32Array(edgeCount);

  for (let row = 0; row < rows; row++) {
    const start = graph.rowPtr[row];
    const finish = graph.rowPtr[row + 1];
    for (let edge = start; edge < finish; edge++) {
      const col = graph.colIdx[edge];
      const dest = nextWrite[col]++;
      colIdx[dest] = row;
      values[dest] = graph.values[edge];
    }
  }

  return { rowPtr, colIdx, values };
}

export class TropicalShortestPaths {
  private readonly ctx: GPUContext;
  private readonly pipelineFactory: PipelineFactory;
  private readonly preferGPU: boolean;
  private readonly denseCpuThreshold: number;
  private readonly sparseCpuThreshold: number;

  constructor(ctx: GPUContext, options: TropicalShortestPathsOptions = {}) {
    this.ctx = ctx;
    this.pipelineFactory = new PipelineFactory(ctx);
    this.preferGPU = options.preferGPU ?? true;
    this.denseCpuThreshold = options.denseCpuThreshold ?? 128;
    this.sparseCpuThreshold = options.sparseCpuThreshold ?? 256;
  }

  static minPlusGemmCPU(
    matA: Float32Array,
    matB: Float32Array,
    m: number,
    n: number,
    k: number
  ): Float32Array {
    if (matA.length !== m * k) {
      throw new Error(`matA length (${matA.length}) must equal m*k (${m * k})`);
    }
    if (matB.length !== k * n) {
      throw new Error(`matB length (${matB.length}) must equal k*n (${k * n})`);
    }

    const out = new Float32Array(m * n).fill(INF);
    for (let row = 0; row < m; row++) {
      for (let col = 0; col < n; col++) {
        let best = INF;
        for (let kk = 0; kk < k; kk++) {
          const a = matA[row * k + kk];
          const b = matB[kk * n + col];
          if (a < INF && b < INF) {
            const candidate = a + b;
            if (candidate < best) best = candidate;
          }
        }
        out[row * n + col] = best;
      }
    }
    return out;
  }

  static computeAPSPCPU(adjacencyMatrix: Float32Array, n: number): Float32Array {
    if (adjacencyMatrix.length !== n * n) {
      throw new Error(`adjacencyMatrix length (${adjacencyMatrix.length}) must equal n*n (${n * n})`);
    }

    const dist = new Float32Array(adjacencyMatrix);
    for (let k = 0; k < n; k++) {
      for (let i = 0; i < n; i++) {
        const ik = dist[i * n + k];
        if (ik >= INF) continue;
        for (let j = 0; j < n; j++) {
          const kj = dist[k * n + j];
          if (kj >= INF) continue;
          const candidate = ik + kj;
          const idx = i * n + j;
          if (candidate < dist[idx]) dist[idx] = candidate;
        }
      }
    }
    return dist;
  }

  static computeSSSPCPU(graph: TropicalCSRGraph, source: number): Float32Array {
    const rows = graph.rowPtr.length - 1;
    if (source < 0 || source >= rows) {
      throw new Error(`source index (${source}) must be in [0, ${rows - 1}]`);
    }

    const dist = new Float32Array(rows).fill(INF);
    dist[source] = 0;

    for (let iter = 0; iter < rows - 1; iter++) {
      let changed = false;
      for (let u = 0; u < rows; u++) {
        const du = dist[u];
        if (du >= INF) continue;
        const start = graph.rowPtr[u];
        const finish = graph.rowPtr[u + 1];
        for (let edge = start; edge < finish; edge++) {
          const v = graph.colIdx[edge];
          const w = graph.values[edge];
          const candidate = du + w;
          if (candidate < dist[v]) {
            dist[v] = candidate;
            changed = true;
          }
        }
      }
      if (!changed) break;
    }

    return dist;
  }

  async tropicalGemm(
    matA: Float32Array,
    matB: Float32Array,
    m: number,
    n: number,
    k: number
  ): Promise<Float32Array> {
    if (matA.length !== m * k) {
      throw new Error(`matA length (${matA.length}) must equal m*k (${m * k})`);
    }
    if (matB.length !== k * n) {
      throw new Error(`matB length (${matB.length}) must equal k*n (${k * n})`);
    }

    const buffers = new BufferManager(this.ctx.device);
    try {
      const a = buffers.createStorageBuffer(matA, 'tropical-gemm-a');
      const b = buffers.createStorageBuffer(matB, 'tropical-gemm-b');
      const c = buffers.createZeroBuffer(m * n, 'tropical-gemm-c');
      const dims = buffers.createUniformBuffer(packDenseDims(m, n, k), 'tropical-gemm-dims');

      const bindGroup = this.pipelineFactory.createBindGroup(
        'tropical_min_plus_gemm',
        [a.buffer, b.buffer, c.buffer, dims.buffer],
        'tropical-gemm-bg'
      );

      const encoder = this.ctx.device.createCommandEncoder({ label: 'tropical-gemm-encoder' });
      this.pipelineFactory.encodeDispatch(
        encoder,
        'tropical_min_plus_gemm',
        bindGroup,
        Math.ceil(n / GEMM_WORKGROUP),
        Math.ceil(m / GEMM_WORKGROUP)
      );
      await this.ctx.submitAndWait(encoder.finish());

      const readback = await buffers.readBuffer(c);
      return readback.data;
    } finally {
      buffers.destroyAll();
    }
  }

  async computeAPSP(adjacencyMatrix: Float32Array, n: number): Promise<Float32Array> {
    if (adjacencyMatrix.length !== n * n) {
      throw new Error(`adjacencyMatrix length (${adjacencyMatrix.length}) must equal n*n (${n * n})`);
    }

    if (!this.preferGPU || n < this.denseCpuThreshold) {
      return TropicalShortestPaths.computeAPSPCPU(adjacencyMatrix, n);
    }

    try {
      let current = new Float32Array(adjacencyMatrix);
      const iterations = Math.ceil(Math.log2(Math.max(1, n)));

      for (let i = 0; i < iterations; i++) {
        current = await this.tropicalGemm(current, current, n, n, n);
      }

      return current;
    } catch {
      return TropicalShortestPaths.computeAPSPCPU(adjacencyMatrix, n);
    }
  }

  async tropicalSpmv(graph: TropicalCSRGraph, dist: Float32Array): Promise<Float32Array> {
    const rows = graph.rowPtr.length - 1;
    if (rows <= 0) {
      return new Float32Array();
    }
    if (dist.length !== rows) {
      throw new Error(`dist length (${dist.length}) must equal row count (${rows})`);
    }

    const buffers = new BufferManager(this.ctx.device);
    try {
      const rowPtr = buffers.createBuffer({
        size: graph.rowPtr.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        label: 'tropical-spmv-rowptr',
        initialData: graph.rowPtr,
      });
      const colIdx = buffers.createBuffer({
        size: graph.colIdx.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        label: 'tropical-spmv-colidx',
        initialData: graph.colIdx,
      });
      const values = buffers.createStorageBuffer(graph.values, 'tropical-spmv-values');
      const distIn = buffers.createStorageBuffer(dist, 'tropical-spmv-dist-in');
      const distOut = buffers.createStorageBuffer(new Float32Array(dist), 'tropical-spmv-dist-out');
      const dims = buffers.createUniformBuffer(packSparseDims(rows), 'tropical-spmv-dims');

      const bindGroup = this.pipelineFactory.createBindGroup(
        'tropical_spmv',
        [rowPtr.buffer, colIdx.buffer, values.buffer, distIn.buffer, distOut.buffer, dims.buffer],
        'tropical-spmv-bg'
      );

      const encoder = this.ctx.device.createCommandEncoder({ label: 'tropical-spmv-encoder' });
      this.pipelineFactory.encodeDispatch(
        encoder,
        'tropical_spmv',
        bindGroup,
        Math.ceil(rows / SPMV_WORKGROUP)
      );
      await this.ctx.submitAndWait(encoder.finish());

      const readback = await buffers.readBuffer(distOut);
      return readback.data;
    } finally {
      buffers.destroyAll();
    }
  }

  async computeSSSP(graph: TropicalCSRGraph, source: number): Promise<Float32Array> {
    const rows = graph.rowPtr.length - 1;
    if (source < 0 || source >= rows) {
      throw new Error(`source index (${source}) must be in [0, ${rows - 1}]`);
    }

    if (!this.preferGPU || rows < this.sparseCpuThreshold) {
      return TropicalShortestPaths.computeSSSPCPU(graph, source);
    }

    const incomingGraph = transposeCSR(graph);

    let current = new Float32Array(rows).fill(INF);
    current[source] = 0;

    try {
      for (let i = 0; i < rows - 1; i++) {
        const next = await this.tropicalSpmv(incomingGraph, current);
        if (arraysEqual(current, next)) {
          return next;
        }
        current = next;
      }
      return current;
    } catch {
      return TropicalShortestPaths.computeSSSPCPU(graph, source);
    }
  }

  destroy(): void {
    this.pipelineFactory.clearCache();
  }
}
