/**
 * WebGPU Sparse Linear Solver — Conjugate Gradient on GPU
 *
 * Solves Ax = b for sparse symmetric positive-definite matrices using
 * the Conjugate Gradient method entirely on the GPU.
 *
 * Architecture:
 *   - CSR matrix and all CG vectors live in GPU storage buffers
 *   - CSR-Vector SpMV for irregular TET10 row lengths (multi-thread per row)
 *   - Fused p-update kernel (p = r + beta*p in one dispatch)
 *   - Two-phase dot product reduction with async staging buffer readback
 *   - Correct r = b - A*x₀ initialization for non-zero initial guesses
 *
 * Bind group layout (matches cg_kernels.wgsl):
 *   group(0): CSR matrix [val, col_ind, row_ptr]  — SpMV only
 *   group(1): Vectors [vec_in (read), vec_out (rw)]
 *   group(2): SolverArgs uniform
 *   group(3): Reduction [partial_sums, scalar_result] — dot/reduce only
 *
 * @module gpu/SparseLinearSolver
 */

import type { WebGPUContext } from './WebGPUContext.ts';

// @ts-ignore — Vite raw import for WGSL shader source
import cgKernelsWGSL from './shaders/cg_kernels.wgsl?raw';

/** Compressed Sparse Row matrix on the CPU side */
export interface CSRMatrix {
  /** Non-zero values */
  val: Float32Array;
  /** Column indices for each non-zero */
  col_ind: Uint32Array;
  /** Row pointer array (length = num_rows + 1) */
  row_ptr: Uint32Array;
  /** Number of rows (and columns, for square matrices) */
  num_rows: number;
}

/** Result from a CG solve */
export interface CGSolveResult {
  /** Solution vector x */
  x: Float32Array;
  /** Number of iterations actually executed */
  iterations: number;
  /** Final residual norm squared (r . r) */
  residualNormSq: number;
  /** Whether the solver converged within tolerance */
  converged: boolean;
}
 
/** Result from a CG solve that returns a live GPU buffer */
export interface DirectSolverResult {
  /** Solution vector x on the GPU */
  xBuffer: GPUBuffer;
  /** Number of iterations actually executed */
  iterations: number;
  /** Final residual norm squared (r . r) */
  residualNormSq: number;
  /** Whether the solver converged within tolerance */
  converged: boolean;
}

/** Options for the CG solver */
export interface CGSolveOptions {
  /** Maximum number of CG iterations (default: 1000) */
  maxIterations?: number;
  /** Convergence tolerance on ||r||^2 (default: 1e-10) */
  toleranceSq?: number;
  /**
   * Check convergence every N iterations (default: 50).
   * Lower = more GPU→CPU readbacks (slower per iteration, faster convergence detection).
   * Higher = fewer readbacks (faster per iteration, may overshoot).
   */
  convergenceCheckInterval?: number;
  /** Progress callback: (iteration, residualNormSq) => void */
  onProgress?: (iteration: number, residualNormSq: number) => void;
}

const WG_SIZE = 256;
const SPMV_SCALAR_WG = 64;

export class SparseLinearSolver {
  private device: GPUDevice;
  private shaderModule!: GPUShaderModule;

  private spmvPipeline!: GPUComputePipeline;
  private spmvVectorPipeline!: GPUComputePipeline;
  private saxpyPipeline!: GPUComputePipeline;
  private dotPipeline!: GPUComputePipeline;
  private finalReducePipeline!: GPUComputePipeline;
  private vecCopyPipeline!: GPUComputePipeline;
  private vecZeroPipeline!: GPUComputePipeline;
  private pUpdatePipeline!: GPUComputePipeline;

  private initialized = false;

  constructor(private context: WebGPUContext) {
    this.device = context.getDevice();
  }

  /** Compile shaders and create all compute pipelines */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.shaderModule = this.device.createShaderModule({
      label: 'CG Kernels',
      code: cgKernelsWGSL,
    });

    const [spmv, spmvVec, saxpy, dot, finalReduce, vecCopy, vecZero, pUpdate] = await Promise.all([
      this.device.createComputePipelineAsync({
        label: 'SpMV Scalar', layout: 'auto',
        compute: { module: this.shaderModule, entryPoint: 'spmv' },
      }),
      this.device.createComputePipelineAsync({
        label: 'SpMV Vector', layout: 'auto',
        compute: { module: this.shaderModule, entryPoint: 'spmv_vector' },
      }),
      this.device.createComputePipelineAsync({
        label: 'SAXPY', layout: 'auto',
        compute: { module: this.shaderModule, entryPoint: 'saxpy' },
      }),
      this.device.createComputePipelineAsync({
        label: 'Dot Product', layout: 'auto',
        compute: { module: this.shaderModule, entryPoint: 'dot_product' },
      }),
      this.device.createComputePipelineAsync({
        label: 'Final Reduce', layout: 'auto',
        compute: { module: this.shaderModule, entryPoint: 'final_reduce' },
      }),
      this.device.createComputePipelineAsync({
        label: 'Vec Copy', layout: 'auto',
        compute: { module: this.shaderModule, entryPoint: 'vec_copy' },
      }),
      this.device.createComputePipelineAsync({
        label: 'Vec Zero', layout: 'auto',
        compute: { module: this.shaderModule, entryPoint: 'vec_zero' },
      }),
      this.device.createComputePipelineAsync({
        label: 'P-Update', layout: 'auto',
        compute: { module: this.shaderModule, entryPoint: 'p_update' },
      }),
    ]);

    this.spmvPipeline = spmv;
    this.spmvVectorPipeline = spmvVec;
    this.saxpyPipeline = saxpy;
    this.dotPipeline = dot;
    this.finalReducePipeline = finalReduce;
    this.vecCopyPipeline = vecCopy;
    this.vecZeroPipeline = vecZero;
    this.pUpdatePipeline = pUpdate;
    this.initialized = true;
  }

  /**
   * Solve Ax = b using Conjugate Gradient on the GPU.
   *
   * Algorithm (Hestenes-Stiefel):
   *   r₀ = b - A·x₀
   *   p₀ = r₀
   *   for k = 0, 1, 2, ...
   *     Ap = A·p
   *     α = (r·r) / (p·Ap)
   *     x = x + α·p
   *     r = r - α·Ap
   *     if ||r||² < tol: break
   *     β = (r_new·r_new) / (r·r)
   *     p = r + β·p           ← fused kernel
   */
  async solveCG(
    A: CSRMatrix,
    b: Float32Array,
    xGuess: Float32Array,
    options: CGSolveOptions = {},
  ): Promise<CGSolveResult> {
    if (!this.initialized) {
      throw new Error('SparseLinearSolver not initialized. Call initialize() first.');
    }

    const {
      maxIterations = 1000,
      toleranceSq = 1e-10,
      convergenceCheckInterval = 50,
      onProgress,
    } = options;

    const n = A.num_rows;
    const vectorWidth = 16;
    const numWgSpmvVec = Math.ceil((n * vectorWidth) / WG_SIZE);
    const numWgVec = Math.ceil(n / WG_SIZE);
    const numWgDot = Math.ceil(n / WG_SIZE);

    // ── Upload buffers ─────────────────────────────────────────────
    const csrVal = this.uploadStorage(A.val, 'csr-val');
    const csrCol = this.uploadStorage(A.col_ind, 'csr-col');
    const csrRow = this.uploadStorage(A.row_ptr, 'csr-row');

    const bufB = this.uploadStorage(b, 'vec-b');
    const bufX = this.uploadStorage(xGuess, 'vec-x');
    const bufR = this.emptyVec(n, 'vec-r');
    const bufP = this.emptyVec(n, 'vec-p');
    const bufAp = this.emptyVec(n, 'vec-Ap');

    const bufPartials = this.emptyVec(numWgDot, 'partial-sums');
    const bufScalar = this.emptyVec(1, 'scalar-result');
    const bufStaging = this.device.createBuffer({
      label: 'staging', size: 4,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
    const bufArgs = this.device.createBuffer({
      label: 'solver-args', size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const allBuffers = [csrVal, csrCol, csrRow, bufB, bufX, bufR, bufP, bufAp, bufPartials, bufScalar, bufStaging, bufArgs];

    // ── r = b - A·x₀, p = r ───────────────────────────────────────
    // Step 1: Ap = A·x (use bufAp as temp)
    {
      this.writeArgs(bufArgs, n, vectorWidth, n, 0);
      const enc = this.device.createCommandEncoder({ label: 'init-spmv' });
      this.dispatchSpmv(enc, csrVal, csrCol, csrRow, bufX, bufAp, bufArgs, numWgSpmvVec, true);
      this.device.queue.submit([enc.finish()]);
      await this.device.queue.onSubmittedWorkDone();
    }

    // Step 2: r = b, then r = r + (-1)·Ap = b - Ax
    {
      const enc = this.device.createCommandEncoder({ label: 'init-residual' });
      enc.copyBufferToBuffer(bufB, 0, bufR, 0, n * 4);
      this.device.queue.submit([enc.finish()]);
      await this.device.queue.onSubmittedWorkDone();
    }
    {
      this.writeArgs(bufArgs, n, vectorWidth, n, -1.0);
      const enc = this.device.createCommandEncoder({ label: 'init-saxpy' });
      this.dispatchSaxpy(enc, bufAp, bufR, bufArgs, numWgVec);
      this.device.queue.submit([enc.finish()]);
      await this.device.queue.onSubmittedWorkDone();
    }

    // Step 3: p = r
    {
      this.writeArgs(bufArgs, n, vectorWidth, n, 0);
      const enc = this.device.createCommandEncoder({ label: 'init-copy-p' });
      this.dispatchVecCopy(enc, bufR, bufP, bufArgs, numWgVec);
      this.device.queue.submit([enc.finish()]);
      await this.device.queue.onSubmittedWorkDone();
    }

    // Initial rDotR
    let rDotR = await this.dotProduct(bufR, bufR, bufPartials, bufScalar, bufStaging, bufArgs, n, numWgDot);

    if (rDotR < toleranceSq) {
      const x = await this.readback(bufX, n);
      this.cleanup(allBuffers);
      return { x, iterations: 0, residualNormSq: rDotR, converged: true };
    }

    // ── Main CG Loop ───────────────────────────────────────────────
    let iteration = 0;
    let converged = false;

    for (iteration = 0; iteration < maxIterations; iteration++) {
      // Ap = A·p
      {
        this.writeArgs(bufArgs, n, vectorWidth, n, 0);
        const enc = this.device.createCommandEncoder();
        this.dispatchSpmv(enc, csrVal, csrCol, csrRow, bufP, bufAp, bufArgs, numWgSpmvVec, true);
        this.device.queue.submit([enc.finish()]);
      }

      // pAp = p·Ap
      const pAp = await this.dotProduct(bufP, bufAp, bufPartials, bufScalar, bufStaging, bufArgs, n, numWgDot);

      if (Math.abs(pAp) < 1e-30) {
        converged = rDotR < toleranceSq;
        break;
      }

      const alpha = rDotR / pAp;

      // x = x + α·p
      {
        this.writeArgs(bufArgs, n, vectorWidth, n, alpha);
        const enc = this.device.createCommandEncoder();
        this.dispatchSaxpy(enc, bufP, bufX, bufArgs, numWgVec);
        this.device.queue.submit([enc.finish()]);
        await this.device.queue.onSubmittedWorkDone();
      }

      // r = r - α·Ap
      {
        this.writeArgs(bufArgs, n, vectorWidth, n, -alpha);
        const enc = this.device.createCommandEncoder();
        this.dispatchSaxpy(enc, bufAp, bufR, bufArgs, numWgVec);
        this.device.queue.submit([enc.finish()]);
        await this.device.queue.onSubmittedWorkDone();
      }

      // rNewDotRNew = r·r (single computation — no double-dot bug)
      const rNewDotRNew = await this.dotProduct(bufR, bufR, bufPartials, bufScalar, bufStaging, bufArgs, n, numWgDot);

      if (rNewDotRNew < toleranceSq) {
        rDotR = rNewDotRNew;
        converged = true;
        iteration++;
        onProgress?.(iteration, rNewDotRNew);
        break;
      }

      if (onProgress && (iteration % convergenceCheckInterval === 0)) {
        onProgress(iteration, rNewDotRNew);
      }

      const beta = rNewDotRNew / rDotR;

      // p = r + β·p (fused — 1 dispatch instead of 3)
      {
        this.writeArgs(bufArgs, n, vectorWidth, n, beta);
        const enc = this.device.createCommandEncoder();
        this.dispatchPUpdate(enc, bufR, bufP, bufArgs, numWgVec);
        this.device.queue.submit([enc.finish()]);
        await this.device.queue.onSubmittedWorkDone();
      }

      rDotR = rNewDotRNew;
    }

    const solution = await this.readback(bufX, n);
    this.cleanup(allBuffers);
    return { x: solution, iterations: iteration, residualNormSq: rDotR, converged };
  }

  /**
   * solveCGDirect — Direct GPU-to-GPU Conjugate Gradient solve.
   *
   * Same as solveCG but avoids CPU readback of the solution vector.
   * Returns the live GPUBuffer containing the result.
   *
   * @warning Caller is responsible for destroying the returned xBuffer.
   */
  async solveCGDirect(
    A: CSRMatrix,
    b: Float32Array,
    x0: Float32Array,
    options: { maxIterations?: number; toleranceSq?: number; xExtraUsage?: GPUBufferUsageFlags } = {}
  ): Promise<DirectSolverResult> {
    const n = A.num_rows;
    const maxIterations = options.maxIterations ?? 1000;
    const toleranceSq = options.toleranceSq ?? 1e-10;
    const xExtraUsage = options.xExtraUsage ?? 0;

    // 1. Create buffers
    const valBuffer = this.uploadStorage(A.val, 'val');
    const colIndBuffer = this.uploadStorage(new Uint32Array(A.col_ind), 'col_ind');
    const rowPtrBuffer = this.uploadStorage(new Uint32Array(A.row_ptr), 'row_ptr');
    const bBuffer = this.uploadStorage(b, 'b');
    const xBuffer = this.uploadStorage(x0, 'x', xExtraUsage);

    const rBuffer = this.emptyVec(n, 'r');
    const pBuffer = this.emptyVec(n, 'p');
    const ApBuffer = this.emptyVec(n, 'Ap');
    const rDotRBuffer = this.emptyVec(1, 'rDotR');
    const rDotRStagingBuffer = this.device.createBuffer({
      size: 4, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
    const numWgVec = Math.ceil(n / WG_SIZE);
    const numWgDot = Math.ceil(n / WG_SIZE);
    const bufArgs = this.device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const partials = this.emptyVec(numWgDot, 'partials');

    // 2. Initial residual: r = b - A*x
    {
      const enc = this.device.createCommandEncoder();
      this.dispatchVecCopy(enc, bBuffer, rBuffer, bufArgs, numWgVec);
      this.dispatchSpmv(enc, valBuffer, colIndBuffer, rowPtrBuffer, xBuffer, ApBuffer, bufArgs, numWgVec, true);
      this.device.queue.submit([enc.finish()]);
    }
    {
      this.writeArgs(bufArgs, n, 0, n, -1.0);
      const enc = this.device.createCommandEncoder();
      this.dispatchSaxpy(enc, ApBuffer, rBuffer, bufArgs, numWgVec);
      this.device.queue.submit([enc.finish()]);
    }

    // p = r
    {
      const enc = this.device.createCommandEncoder();
      this.dispatchVecCopy(enc, rBuffer, pBuffer, bufArgs, numWgVec);
      this.device.queue.submit([enc.finish()]);
    }

    let iteration = 0;
    let converged = false;
    let rDotR = await this.dotProduct(rBuffer, rBuffer, partials, rDotRBuffer, rDotRStagingBuffer, bufArgs, n, numWgDot);

    // 3. Iteration loop
    for (iteration = 0; iteration < maxIterations; iteration++) {
      if (rDotR < toleranceSq) {
        converged = true;
        break;
      }

      // Ap = A * p
      {
        const enc = this.device.createCommandEncoder();
        this.dispatchSpmv(enc, valBuffer, colIndBuffer, rowPtrBuffer, pBuffer, ApBuffer, bufArgs, numWgVec, true);
        this.device.queue.submit([enc.finish()]);
      }

      // alpha = rDotR / (p . Ap)
      const pAp = await this.dotProduct(pBuffer, ApBuffer, partials, rDotRBuffer, rDotRStagingBuffer, bufArgs, n, numWgDot);
      const alpha = rDotR / (pAp + 1e-20);

      // x = x + alpha * p
      {
        this.writeArgs(bufArgs, n, 0, n, alpha);
        const enc = this.device.createCommandEncoder();
        this.dispatchSaxpy(enc, pBuffer, xBuffer, bufArgs, numWgVec);
        this.device.queue.submit([enc.finish()]);
      }

      // r = r - alpha * Ap
      {
        this.writeArgs(bufArgs, n, 0, n, -alpha);
        const enc = this.device.createCommandEncoder();
        this.dispatchSaxpy(enc, ApBuffer, rBuffer, bufArgs, numWgVec);
        this.device.queue.submit([enc.finish()]);
      }

      const oldRDotR = rDotR;
      rDotR = await this.dotProduct(rBuffer, rBuffer, partials, rDotRBuffer, rDotRStagingBuffer, bufArgs, n, numWgDot);
      const beta = rDotR / (oldRDotR + 1e-20);

      // p = r + beta * p
      {
        this.writeArgs(bufArgs, n, 0, n, beta);
        const enc = this.device.createCommandEncoder();
        this.dispatchPUpdate(enc, rBuffer, pBuffer, bufArgs, numWgVec);
        this.device.queue.submit([enc.finish()]);
      }
    }

    // Cleanup ephemeral buffers
    this.cleanup([
      valBuffer, colIndBuffer, rowPtrBuffer, bBuffer,
      rBuffer, pBuffer, ApBuffer, rDotRBuffer, rDotRStagingBuffer
    ]);

    return { xBuffer, iterations: iteration, residualNormSq: rDotR, converged };
  }

  // ═══════════════════════════════════════════════════════════════════
  // Dispatch helpers — each sets the bind groups its entry point needs
  // ═══════════════════════════════════════════════════════════════════

  /** SpMV: groups 0 (CSR), 1 (vecs), 2 (args) */
  private dispatchSpmv(
    enc: GPUCommandEncoder,
    val: GPUBuffer, col: GPUBuffer, row: GPUBuffer,
    x: GPUBuffer, y: GPUBuffer,
    args: GPUBuffer, numWgs: number, useVector: boolean,
  ): void {
    const pipeline = useVector ? this.spmvVectorPipeline : this.spmvPipeline;
    const pass = enc.beginComputePass({ label: 'spmv' });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, this.device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: val } },
        { binding: 1, resource: { buffer: col } },
        { binding: 2, resource: { buffer: row } },
      ],
    }));
    pass.setBindGroup(1, this.device.createBindGroup({
      layout: pipeline.getBindGroupLayout(1),
      entries: [
        { binding: 0, resource: { buffer: x } },
        { binding: 1, resource: { buffer: y } },
      ],
    }));
    pass.setBindGroup(2, this.device.createBindGroup({
      layout: pipeline.getBindGroupLayout(2),
      entries: [{ binding: 0, resource: { buffer: args } }],
    }));
    pass.dispatchWorkgroups(numWgs);
    pass.end();
  }

  /** SAXPY: groups 1 (vecs), 2 (args) */
  private dispatchSaxpy(
    enc: GPUCommandEncoder,
    x: GPUBuffer, y: GPUBuffer,
    args: GPUBuffer, numWgs: number,
  ): void {
    const pass = enc.beginComputePass({ label: 'saxpy' });
    pass.setPipeline(this.saxpyPipeline);
    pass.setBindGroup(1, this.device.createBindGroup({
      layout: this.saxpyPipeline.getBindGroupLayout(1),
      entries: [
        { binding: 0, resource: { buffer: x } },
        { binding: 1, resource: { buffer: y } },
      ],
    }));
    pass.setBindGroup(2, this.device.createBindGroup({
      layout: this.saxpyPipeline.getBindGroupLayout(2),
      entries: [{ binding: 0, resource: { buffer: args } }],
    }));
    pass.dispatchWorkgroups(numWgs);
    pass.end();
  }

  /** Fused p = r + beta*p: groups 1 (vecs), 2 (args) */
  private dispatchPUpdate(
    enc: GPUCommandEncoder,
    r: GPUBuffer, p: GPUBuffer,
    args: GPUBuffer, numWgs: number,
  ): void {
    const pass = enc.beginComputePass({ label: 'p-update' });
    pass.setPipeline(this.pUpdatePipeline);
    pass.setBindGroup(1, this.device.createBindGroup({
      layout: this.pUpdatePipeline.getBindGroupLayout(1),
      entries: [
        { binding: 0, resource: { buffer: r } },
        { binding: 1, resource: { buffer: p } },
      ],
    }));
    pass.setBindGroup(2, this.device.createBindGroup({
      layout: this.pUpdatePipeline.getBindGroupLayout(2),
      entries: [{ binding: 0, resource: { buffer: args } }],
    }));
    pass.dispatchWorkgroups(numWgs);
    pass.end();
  }

  /** Vec copy: groups 1 (vecs), 2 (args) */
  private dispatchVecCopy(
    enc: GPUCommandEncoder,
    src: GPUBuffer, dst: GPUBuffer,
    args: GPUBuffer, numWgs: number,
  ): void {
    const pass = enc.beginComputePass({ label: 'vec-copy' });
    pass.setPipeline(this.vecCopyPipeline);
    pass.setBindGroup(1, this.device.createBindGroup({
      layout: this.vecCopyPipeline.getBindGroupLayout(1),
      entries: [
        { binding: 0, resource: { buffer: src } },
        { binding: 1, resource: { buffer: dst } },
      ],
    }));
    pass.setBindGroup(2, this.device.createBindGroup({
      layout: this.vecCopyPipeline.getBindGroupLayout(2),
      entries: [{ binding: 0, resource: { buffer: args } }],
    }));
    pass.dispatchWorkgroups(numWgs);
    pass.end();
  }

  /**
   * Full dot product: v1·v2
   *   Phase 1: dot_product kernel → partial_sums (per-workgroup)
   *   Phase 2: final_reduce → scalar_result[0]
   *   Readback: staging mapAsync → CPU f32
   */
  private async dotProduct(
    v1: GPUBuffer, v2: GPUBuffer,
    partials: GPUBuffer, scalar: GPUBuffer, staging: GPUBuffer,
    args: GPUBuffer, n: number, numWgDot: number,
  ): Promise<number> {
    // Phase 1: per-workgroup partial sums
    {
      this.writeArgs(args, n, 0, n, 0);
      const enc = this.device.createCommandEncoder({ label: 'dot-phase1' });
      const pass = enc.beginComputePass();
      pass.setPipeline(this.dotPipeline);
      pass.setBindGroup(1, this.device.createBindGroup({
        layout: this.dotPipeline.getBindGroupLayout(1),
        entries: [
          { binding: 0, resource: { buffer: v1 } },
          { binding: 1, resource: { buffer: v2 } },
        ],
      }));
      pass.setBindGroup(2, this.device.createBindGroup({
        layout: this.dotPipeline.getBindGroupLayout(2),
        entries: [{ binding: 0, resource: { buffer: args } }],
      }));
      pass.setBindGroup(3, this.device.createBindGroup({
        layout: this.dotPipeline.getBindGroupLayout(3),
        entries: [{ binding: 0, resource: { buffer: partials } }],
      }));
      pass.dispatchWorkgroups(numWgDot);
      pass.end();
      this.device.queue.submit([enc.finish()]);
    }

    // Phase 2: final reduce
    {
      this.writeArgs(args, numWgDot, 0, numWgDot, 0);
      const enc = this.device.createCommandEncoder({ label: 'dot-phase2' });
      const pass = enc.beginComputePass();
      pass.setPipeline(this.finalReducePipeline);
      pass.setBindGroup(2, this.device.createBindGroup({
        layout: this.finalReducePipeline.getBindGroupLayout(2),
        entries: [{ binding: 0, resource: { buffer: args } }],
      }));
      pass.setBindGroup(3, this.device.createBindGroup({
        layout: this.finalReducePipeline.getBindGroupLayout(3),
        entries: [
          { binding: 0, resource: { buffer: partials } },
          { binding: 1, resource: { buffer: scalar } },
        ],
      }));
      pass.dispatchWorkgroups(1);
      pass.end();
      enc.copyBufferToBuffer(scalar, 0, staging, 0, 4);
      this.device.queue.submit([enc.finish()]);
    }

    await staging.mapAsync(GPUMapMode.READ);
    const value = new Float32Array(staging.getMappedRange())[0];
    staging.unmap();
    return value;
  }

  // ═══════════════════════════════════════════════════════════════════
  // Buffer helpers
  // ═══════════════════════════════════════════════════════════════════

  private writeArgs(buf: GPUBuffer, numRows: number, vectorWidth: number, n: number, alpha: number): void {
    const data = new ArrayBuffer(16);
    new Uint32Array(data, 0, 3).set([numRows, vectorWidth, n]);
    new Float32Array(data, 12, 1).set([alpha]);
    this.device.queue.writeBuffer(buf, 0, data);
  }

  public uploadStorage(data: Float32Array | Uint32Array, label: string, extraUsage: GPUBufferUsageFlags = 0): GPUBuffer {
    const buf = this.device.createBuffer({
      label, size: data.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST | extraUsage,
      mappedAtCreation: true,
    });
    if (data instanceof Float32Array) new Float32Array(buf.getMappedRange()).set(data);
    else new Uint32Array(buf.getMappedRange()).set(data);
    buf.unmap();
    return buf;
  }

  public emptyVec(n: number, label: string, extraUsage: GPUBufferUsageFlags = 0): GPUBuffer {
    return this.device.createBuffer({
      label, size: Math.max(4, n * 4),
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST | extraUsage,
    });
  }

  public async readback(buf: GPUBuffer, n: number): Promise<Float32Array> {
    const staging = this.device.createBuffer({
      size: n * 4, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
    const enc = this.device.createCommandEncoder();
    enc.copyBufferToBuffer(buf, 0, staging, 0, n * 4);
    this.device.queue.submit([enc.finish()]);
    await staging.mapAsync(GPUMapMode.READ);
    const result = new Float32Array(staging.getMappedRange()).slice();
    staging.unmap();
    staging.destroy();
    return result;
  }

  public cleanup(buffers: GPUBuffer[]): void {
    for (const b of buffers) b.destroy();
  }

  destroy(): void {
    this.initialized = false;
  }
}
