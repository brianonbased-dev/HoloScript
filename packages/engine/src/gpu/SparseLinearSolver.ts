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
import { cgKernelsWGSL } from './shaders/cg_kernels';

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
  // Jacobi preconditioner + on-device scalar pipelines
  private extractInvDiagPipeline!: GPUComputePipeline;
  private applyPrecondPipeline!: GPUComputePipeline;
  private divideScalarPipeline!: GPUComputePipeline;
  private saxpyBufPipeline!: GPUComputePipeline;
  private saxpyNegBufPipeline!: GPUComputePipeline;
  private pUpdateBufPipeline!: GPUComputePipeline;

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

    // Jacobi preconditioner + on-device scalar kernels
    const [extractInvDiag, applyPrecond, divideScalar, saxpyBuf, saxpyNegBuf, pUpdateBuf] = await Promise.all([
      this.device.createComputePipelineAsync({
        label: 'Extract Inv Diagonal', layout: 'auto',
        compute: { module: this.shaderModule, entryPoint: 'extract_inv_diagonal' },
      }),
      this.device.createComputePipelineAsync({
        label: 'Apply Precond', layout: 'auto',
        compute: { module: this.shaderModule, entryPoint: 'apply_precond' },
      }),
      this.device.createComputePipelineAsync({
        label: 'Divide Scalar', layout: 'auto',
        compute: { module: this.shaderModule, entryPoint: 'divide_scalar' },
      }),
      this.device.createComputePipelineAsync({
        label: 'SAXPY (buf)', layout: 'auto',
        compute: { module: this.shaderModule, entryPoint: 'saxpy_buf' },
      }),
      this.device.createComputePipelineAsync({
        label: 'SAXPY-neg (buf)', layout: 'auto',
        compute: { module: this.shaderModule, entryPoint: 'saxpy_neg_buf' },
      }),
      this.device.createComputePipelineAsync({
        label: 'P-Update (buf)', layout: 'auto',
        compute: { module: this.shaderModule, entryPoint: 'p_update_buf' },
      }),
    ]);

    this.extractInvDiagPipeline = extractInvDiag;
    this.applyPrecondPipeline = applyPrecond;
    this.divideScalarPipeline = divideScalar;
    this.saxpyBufPipeline = saxpyBuf;
    this.saxpyNegBufPipeline = saxpyNegBuf;
    this.pUpdateBufPipeline = pUpdateBuf;
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
    options: {
      maxIterations?: number;
      toleranceSq?: number;
      xExtraUsage?: GPUBufferUsageFlags;
      convergenceCheckInterval?: number;
      /** When true (default), converge on the RELATIVE residual ‖r‖² < tol²·‖b‖²
       *  (standard CG; matches the CPU PCG path). Set false for absolute ‖r‖² < tol². */
      relativeTolerance?: boolean;
    } = {}
  ): Promise<DirectSolverResult> {
    const n = A.num_rows;
    const vectorWidth = 16;
    const numWgSpmvVec = Math.ceil((n * vectorWidth) / WG_SIZE);
    const maxIterations = options.maxIterations ?? 1000;
    const toleranceSq = options.toleranceSq ?? 1e-10;
    const xExtraUsage = options.xExtraUsage ?? 0;

    // Relative convergence threshold = tol²·‖b‖² (matches CPU CG: ‖r‖ < tol·‖b‖).
    // ‖b‖² is computed once on the CPU from the input RHS — no extra GPU work.
    // The old absolute ‖r‖²<tol² over-iterates when ‖b‖>1 (the W.GPU-04 follow-up).
    const useRelative = options.relativeTolerance ?? true;
    let bNormSq = 0;
    if (useRelative) {
      for (let i = 0; i < b.length; i++) bNormSq += b[i] * b[i];
    }
    const effectiveTol = useRelative ? toleranceSq * Math.max(bNormSq, 1e-30) : toleranceSq;

    // On-device Jacobi-preconditioned CG (PCG).
    //   - alpha/beta computed on the GPU (divide_scalar) — no per-iteration CPU readback
    //   - every per-iteration op is batched into ONE command submit
    //   - residual ||r||² read back only every `checkInterval` iterations
    // This removes the latency-bound stalls that made the naive readback loop
    // ~5 ms/iteration at small DOF. See research/2026-05-21_gpu-underrepresentation-holoscript.md (W.GPU-04).
    const checkInterval = Math.max(1, options.convergenceCheckInterval ?? 25);
    const numWgVec = Math.ceil(n / WG_SIZE);
    const numWgDot = Math.ceil(n / WG_SIZE);

    // 1. Buffers
    const valBuffer = this.uploadStorage(A.val, 'val');
    const colIndBuffer = this.uploadStorage(new Uint32Array(A.col_ind), 'col_ind');
    const rowPtrBuffer = this.uploadStorage(new Uint32Array(A.row_ptr), 'row_ptr');
    const bBuffer = this.uploadStorage(b, 'b');
    const xBuffer = this.uploadStorage(x0, 'x', xExtraUsage);

    const rBuffer = this.emptyVec(n, 'r');
    const pBuffer = this.emptyVec(n, 'p');
    const ApBuffer = this.emptyVec(n, 'Ap');
    const zBuffer = this.emptyVec(n, 'z');
    const invDiagBuffer = this.emptyVec(n, 'invDiag');
    const partials = this.emptyVec(numWgDot, 'partials');

    // Scalar workspace (stay on GPU between iterations)
    const sPAp = this.emptyVec(1, 'sPAp');
    const sRR = this.emptyVec(1, 'sRR');
    const sRZ = this.emptyVec(1, 'sRZ');
    const sRZold = this.emptyVec(1, 'sRZold');
    const sAlpha = this.emptyVec(1, 'sAlpha');
    const sBeta = this.emptyVec(1, 'sBeta');
    const rrStaging = this.device.createBuffer({
      size: 4, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });

    // Fixed-purpose uniforms (written once, never per-iteration)
    const mkArgs = (numRows: number, vw: number, nn: number, alpha: number): GPUBuffer => {
      const buf = this.device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
      this.writeArgs(buf, numRows, vw, nn, alpha);
      return buf;
    };
    const argsSpmv = mkArgs(n, vectorWidth, n, 0);      // spmv_vector: num_rows + vector_width
    const argsVec = mkArgs(n, 0, n, 0);                 // saxpy/copy/apply/p_update/dot-phase1: .n = n
    const argsReduce = mkArgs(numWgDot, 0, numWgDot, 0); // final_reduce: .n = partial count
    const argsNegOne = mkArgs(n, 0, n, -1.0);           // init saxpy with constant -1

    // 2. Init: invDiag = 1/diag(A); r = b - A·x; z = M⁻¹r; p = z; sRZold = r·z; sRR = r·r
    {
      const enc = this.device.createCommandEncoder({ label: 'pcg-init' });
      this.dispatchExtractInvDiag(enc, valBuffer, colIndBuffer, rowPtrBuffer, invDiagBuffer, argsSpmv, numWgVec);
      this.dispatchVecCopy(enc, bBuffer, rBuffer, argsVec, numWgVec);
      this.dispatchSpmv(enc, valBuffer, colIndBuffer, rowPtrBuffer, xBuffer, ApBuffer, argsSpmv, numWgSpmvVec, true);
      this.dispatchSaxpy(enc, ApBuffer, rBuffer, argsNegOne, numWgVec); // r += -1·Ap
      this.dispatchApplyPrecond(enc, rBuffer, zBuffer, invDiagBuffer, argsVec, numWgVec);
      this.dispatchVecCopy(enc, zBuffer, pBuffer, argsVec, numWgVec);
      this.encodeDot(enc, rBuffer, zBuffer, partials, sRZold, argsVec, argsReduce, numWgDot);
      this.encodeDot(enc, rBuffer, rBuffer, partials, sRR, argsVec, argsReduce, numWgDot);
      enc.copyBufferToBuffer(sRR, 0, rrStaging, 0, 4);
      this.device.queue.submit([enc.finish()]);
    }

    let rDotR = await this.readMappedScalar(rrStaging);
    let iteration = 0;
    let converged = rDotR < effectiveTol;

    // 3. Iteration loop — fully on-device. `checkInterval` iterations are recorded
    //    into a SINGLE command encoder and submitted once, so the GPU runs the whole
    //    batch without a CPU round-trip; we read ‖r‖² back only once per batch.
    //    Compute passes within an encoder execute in recorded order with implicit
    //    storage barriers, so the per-iteration buffer reuse (p, r, z, scalars,
    //    partials) is safe across the batch.
    while (!converged && iteration < maxIterations) {
      const batch = Math.min(checkInterval, maxIterations - iteration);
      const enc = this.device.createCommandEncoder({ label: 'pcg-batch' });
      for (let j = 0; j < batch; j++) {
        // Ap = A·p
        this.dispatchSpmv(enc, valBuffer, colIndBuffer, rowPtrBuffer, pBuffer, ApBuffer, argsSpmv, numWgSpmvVec, true);
        // pAp = p·Ap
        this.encodeDot(enc, pBuffer, ApBuffer, partials, sPAp, argsVec, argsReduce, numWgDot);
        // alpha = (r·z) / (p·Ap)
        this.dispatchDivide(enc, sRZold, sPAp, sAlpha);
        // x += alpha·p ; r -= alpha·Ap
        this.dispatchSaxpyBuf(enc, pBuffer, xBuffer, sAlpha, argsVec, numWgVec, false);
        this.dispatchSaxpyBuf(enc, ApBuffer, rBuffer, sAlpha, argsVec, numWgVec, true);
        // rr = r·r (convergence)
        this.encodeDot(enc, rBuffer, rBuffer, partials, sRR, argsVec, argsReduce, numWgDot);
        // z = M⁻¹·r ; rzNew = r·z
        this.dispatchApplyPrecond(enc, rBuffer, zBuffer, invDiagBuffer, argsVec, numWgVec);
        this.encodeDot(enc, rBuffer, zBuffer, partials, sRZ, argsVec, argsReduce, numWgDot);
        // beta = rzNew / rzOld ; p = z + beta·p
        this.dispatchDivide(enc, sRZ, sRZold, sBeta);
        this.dispatchPUpdateBuf(enc, zBuffer, pBuffer, sBeta, argsVec, numWgVec);
        // rzOld = rzNew (recorded after the beta divide has read sRZold)
        enc.copyBufferToBuffer(sRZ, 0, sRZold, 0, 4);
        iteration++;
      }
      enc.copyBufferToBuffer(sRR, 0, rrStaging, 0, 4);
      this.device.queue.submit([enc.finish()]);

      rDotR = await this.readMappedScalar(rrStaging);
      if (rDotR < effectiveTol) {
        converged = true;
        break;
      }
    }

    this.cleanup([
      valBuffer, colIndBuffer, rowPtrBuffer, bBuffer,
      rBuffer, pBuffer, ApBuffer, zBuffer, invDiagBuffer, partials,
      sPAp, sRR, sRZ, sRZold, sAlpha, sBeta, rrStaging,
      argsSpmv, argsVec, argsReduce, argsNegOne,
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

  /** Extract inverse diagonal (Jacobi M⁻¹): groups 0 (CSR), 1 (binding 1 = out), 2 (binding 0 = args) */
  private dispatchExtractInvDiag(
    enc: GPUCommandEncoder,
    val: GPUBuffer, col: GPUBuffer, row: GPUBuffer,
    out: GPUBuffer, args: GPUBuffer, numWgs: number,
  ): void {
    const p = this.extractInvDiagPipeline;
    const pass = enc.beginComputePass({ label: 'extract-inv-diag' });
    pass.setPipeline(p);
    pass.setBindGroup(0, this.device.createBindGroup({
      layout: p.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: val } },
        { binding: 1, resource: { buffer: col } },
        { binding: 2, resource: { buffer: row } },
      ],
    }));
    pass.setBindGroup(1, this.device.createBindGroup({
      layout: p.getBindGroupLayout(1),
      entries: [{ binding: 1, resource: { buffer: out } }],
    }));
    pass.setBindGroup(2, this.device.createBindGroup({
      layout: p.getBindGroupLayout(2),
      entries: [{ binding: 0, resource: { buffer: args } }],
    }));
    pass.dispatchWorkgroups(numWgs);
    pass.end();
  }

  /** Apply preconditioner z = invDiag ∘ r: group1 {r, z}, group2 {args, invDiag} */
  private dispatchApplyPrecond(
    enc: GPUCommandEncoder,
    r: GPUBuffer, z: GPUBuffer, invDiag: GPUBuffer,
    args: GPUBuffer, numWgs: number,
  ): void {
    const p = this.applyPrecondPipeline;
    const pass = enc.beginComputePass({ label: 'apply-precond' });
    pass.setPipeline(p);
    pass.setBindGroup(1, this.device.createBindGroup({
      layout: p.getBindGroupLayout(1),
      entries: [
        { binding: 0, resource: { buffer: r } },
        { binding: 1, resource: { buffer: z } },
      ],
    }));
    pass.setBindGroup(2, this.device.createBindGroup({
      layout: p.getBindGroupLayout(2),
      entries: [
        { binding: 0, resource: { buffer: args } },
        { binding: 1, resource: { buffer: invDiag } },
      ],
    }));
    pass.dispatchWorkgroups(numWgs);
    pass.end();
  }

  /** Scalar divide out = num/(den+eps): group2 {b2=num, b3=den, b4=out} */
  private dispatchDivide(
    enc: GPUCommandEncoder,
    num: GPUBuffer, den: GPUBuffer, out: GPUBuffer,
  ): void {
    const p = this.divideScalarPipeline;
    const pass = enc.beginComputePass({ label: 'divide-scalar' });
    pass.setPipeline(p);
    pass.setBindGroup(2, this.device.createBindGroup({
      layout: p.getBindGroupLayout(2),
      entries: [
        { binding: 2, resource: { buffer: num } },
        { binding: 3, resource: { buffer: den } },
        { binding: 4, resource: { buffer: out } },
      ],
    }));
    pass.dispatchWorkgroups(1);
    pass.end();
  }

  /** SAXPY with scalar from buffer: vec_out = (±)s·vec_in + vec_out. group1 {in,out}, group2 {args, scalar@b2} */
  private dispatchSaxpyBuf(
    enc: GPUCommandEncoder,
    x: GPUBuffer, y: GPUBuffer, scalar: GPUBuffer,
    args: GPUBuffer, numWgs: number, negate: boolean,
  ): void {
    const p = negate ? this.saxpyNegBufPipeline : this.saxpyBufPipeline;
    const pass = enc.beginComputePass({ label: negate ? 'saxpy-neg-buf' : 'saxpy-buf' });
    pass.setPipeline(p);
    pass.setBindGroup(1, this.device.createBindGroup({
      layout: p.getBindGroupLayout(1),
      entries: [
        { binding: 0, resource: { buffer: x } },
        { binding: 1, resource: { buffer: y } },
      ],
    }));
    pass.setBindGroup(2, this.device.createBindGroup({
      layout: p.getBindGroupLayout(2),
      entries: [
        { binding: 0, resource: { buffer: args } },
        { binding: 2, resource: { buffer: scalar } },
      ],
    }));
    pass.dispatchWorkgroups(numWgs);
    pass.end();
  }

  /** p = vec_in + s·p with scalar from buffer: group1 {in, p}, group2 {args, scalar@b2} */
  private dispatchPUpdateBuf(
    enc: GPUCommandEncoder,
    vin: GPUBuffer, p: GPUBuffer, scalar: GPUBuffer,
    args: GPUBuffer, numWgs: number,
  ): void {
    const pl = this.pUpdateBufPipeline;
    const pass = enc.beginComputePass({ label: 'p-update-buf' });
    pass.setPipeline(pl);
    pass.setBindGroup(1, this.device.createBindGroup({
      layout: pl.getBindGroupLayout(1),
      entries: [
        { binding: 0, resource: { buffer: vin } },
        { binding: 1, resource: { buffer: p } },
      ],
    }));
    pass.setBindGroup(2, this.device.createBindGroup({
      layout: pl.getBindGroupLayout(2),
      entries: [
        { binding: 0, resource: { buffer: args } },
        { binding: 2, resource: { buffer: scalar } },
      ],
    }));
    pass.dispatchWorkgroups(numWgs);
    pass.end();
  }

  /**
   * Encode a dot product v1·v2 → targetScalar into an existing encoder (NO submit, NO readback).
   * Phase 1 writes per-workgroup partials; phase 2 reduces into targetScalar[0].
   * argsVec must encode n in .n; argsReduce must encode numWgDot in .n.
   */
  private encodeDot(
    enc: GPUCommandEncoder,
    v1: GPUBuffer, v2: GPUBuffer,
    partials: GPUBuffer, targetScalar: GPUBuffer,
    argsVec: GPUBuffer, argsReduce: GPUBuffer, numWgDot: number,
  ): void {
    // Phase 1: per-workgroup partial sums
    {
      const pass = enc.beginComputePass({ label: 'dot-p1' });
      pass.setPipeline(this.dotPipeline);
      pass.setBindGroup(1, this.device.createBindGroup({
        layout: this.dotPipeline.getBindGroupLayout(1),
        entries: [{ binding: 0, resource: { buffer: v1 } }],
      }));
      pass.setBindGroup(2, this.device.createBindGroup({
        layout: this.dotPipeline.getBindGroupLayout(2),
        entries: [
          { binding: 0, resource: { buffer: argsVec } },
          { binding: 1, resource: { buffer: v2 } },
        ],
      }));
      pass.setBindGroup(3, this.device.createBindGroup({
        layout: this.dotPipeline.getBindGroupLayout(3),
        entries: [{ binding: 0, resource: { buffer: partials } }],
      }));
      pass.dispatchWorkgroups(numWgDot);
      pass.end();
    }
    // Phase 2: final reduce → targetScalar
    {
      const pass = enc.beginComputePass({ label: 'dot-p2' });
      pass.setPipeline(this.finalReducePipeline);
      pass.setBindGroup(2, this.device.createBindGroup({
        layout: this.finalReducePipeline.getBindGroupLayout(2),
        entries: [{ binding: 0, resource: { buffer: argsReduce } }],
      }));
      pass.setBindGroup(3, this.device.createBindGroup({
        layout: this.finalReducePipeline.getBindGroupLayout(3),
        entries: [
          { binding: 0, resource: { buffer: partials } },
          { binding: 1, resource: { buffer: targetScalar } },
        ],
      }));
      pass.dispatchWorkgroups(1);
      pass.end();
    }
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
        entries: [{ binding: 0, resource: { buffer: v1 } }],
      }));
      pass.setBindGroup(2, this.device.createBindGroup({
        layout: this.dotPipeline.getBindGroupLayout(2),
        entries: [
          { binding: 0, resource: { buffer: args } },
          { binding: 1, resource: { buffer: v2 } },
        ],
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

  /** Map an already-COPY_DST-populated 4-byte staging buffer and read one f32. */
  private async readMappedScalar(staging: GPUBuffer): Promise<number> {
    await staging.mapAsync(GPUMapMode.READ);
    const value = new Float32Array(staging.getMappedRange())[0];
    staging.unmap();
    return value;
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
