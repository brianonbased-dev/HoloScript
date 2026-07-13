/**
 * qec-decoder.ts — the [[9,1,3]] surface-code min-sum BP decoder as a real GPU compute class.
 *
 * Graduated from research/qec-decoder-probe/gpu-bp-decoder.mjs: the normalized min-sum belief
 * propagation that {@link ./qec-codes}.bpMinSum runs on the CPU, compiled into a WGSL compute
 * shader where ONE GPU thread decodes ONE syndrome instance. This is exactly how a batched
 * hardware decoder runs — thousands of independent decodes in parallel — so the honest GPU win
 * is THROUGHPUT (decodes/sec), not single-shot latency (a d3 decode is tiny and readback-bound).
 *
 * Pure BP runs on the GPU (the fast path); the OSD-0 validity guard for the ~4/9 syndromes BP
 * alone cannot satisfy stays on the host (the standard BP-on-accelerator / OSD-on-host split),
 * reusing {@link ./qec-codes}.bpOsdDecode so the full pipeline is provably coset-correct.
 *
 * Correctness is not asserted here — it is GATED by the tests and the bench receipt, which
 * validate exhaustively over all 16 X-syndromes (the entire input domain) against the exact
 * maximum-likelihood lookup, and refuse to report a number unless the adapter is a real GPU.
 *
 * @module snn-webgpu/qec/qec-decoder
 */

import type { GPUContext } from '../gpu-context.js';
import {
  ZSTAB,
  HX,
  priorLLR,
  bpOsdDecode,
  DEFAULT_PRIOR,
  type BitVector,
} from './qec-codes.js';

/** Number of data qubits in the [[9,1,3]] code. */
export const NVAR = 9;
/** Number of Z-stabilizer checks (X-error syndrome bits). */
export const NCHECK = 4;
/** Bit position of the "converged" flag in a packed correction word. */
export const CONVERGED_BIT = 31;

/**
 * The X-graph Tanner edges (check, var) compiled into the shader — Z-stabilizers detect X
 * errors. These MUST reconstruct {@link ZSTAB} exactly; {@link tannerEdgesMatchZstab} is the
 * drift guard the tests enforce so the GPU shader can never silently diverge from the
 * CPU-validated graph.
 */
export const E_CHECK: readonly number[] = [0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 3, 3];
export const E_VAR: readonly number[] = [0, 1, 3, 4, 4, 5, 7, 8, 1, 2, 6, 7];

/**
 * Reconstruct the stabilizer supports from the shader's (E_CHECK, E_VAR) edge lists and check
 * that they equal {@link ZSTAB}. Returns true iff the WGSL Tanner graph matches the CPU code.
 */
export function tannerEdgesMatchZstab(): boolean {
  const rebuilt: number[][] = Array.from({ length: NCHECK }, () => []);
  for (let e = 0; e < E_CHECK.length; e++) rebuilt[E_CHECK[e]].push(E_VAR[e]);
  const norm = (rows: readonly number[][]) =>
    JSON.stringify(rows.map((r) => [...r].sort((a, b) => a - b)));
  return norm(rebuilt) === norm(ZSTAB);
}

/** The min-sum BP compute shader. One invocation = one decode; alpha/gamma match the CPU ref. */
export const QEC_BP_WGSL = /* wgsl */ `
struct Params { lambda: f32, count: u32, pad0: u32, pad1: u32 };
@group(0) @binding(0) var<storage, read> syndromes: array<u32>;
@group(0) @binding(1) var<storage, read_write> corrections: array<u32>;
@group(0) @binding(2) var<uniform> params: Params;

const ALPHA: f32 = 0.8125;
const GAMMA: f32 = 0.2;
const MAXITER: u32 = 30u;
const NVAR: u32 = 9u;
const NCHECK: u32 = 4u;
const NEDGE: u32 = 12u;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  if (idx >= params.count) { return; }

  var eCheck = array<u32,12>(0u,0u,0u,0u,1u,1u,1u,1u,2u,2u,3u,3u);
  var eVar   = array<u32,12>(0u,1u,3u,4u,4u,5u,7u,8u,1u,2u,6u,7u);

  let sPacked = syndromes[idx];
  var s = array<u32,4>(0u,0u,0u,0u);
  for (var a = 0u; a < NCHECK; a = a + 1u) { s[a] = (sPacked >> a) & 1u; }

  let lambda = params.lambda;
  var v2c = array<f32,12>(lambda,lambda,lambda,lambda,lambda,lambda,lambda,lambda,lambda,lambda,lambda,lambda);
  var c2v = array<f32,12>(0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0);
  var ecorr = array<u32,9>(0u,0u,0u,0u,0u,0u,0u,0u,0u);
  var converged = false;

  for (var it = 0u; it < MAXITER; it = it + 1u) {
    // check-node update (syndrome-signed normalized min-sum)
    for (var e = 0u; e < NEDGE; e = e + 1u) {
      let a = eCheck[e];
      var signProd = 1.0;
      var minMag = 1e30;
      for (var f = 0u; f < NEDGE; f = f + 1u) {
        if (eCheck[f] != a || f == e) { continue; }
        let msg = v2c[f];
        if (msg < 0.0) { signProd = -signProd; }
        let mag = abs(msg);
        if (mag < minMag) { minMag = mag; }
      }
      var sgn = 1.0;
      if (s[a] == 1u) { sgn = -1.0; }
      c2v[e] = ALPHA * sgn * signProd * minMag;
    }
    // variable-node update + posterior + hard decision (with damping)
    for (var i = 0u; i < NVAR; i = i + 1u) {
      var total = lambda;
      for (var e = 0u; e < NEDGE; e = e + 1u) { if (eVar[e] == i) { total = total + c2v[e]; } }
      for (var e = 0u; e < NEDGE; e = e + 1u) { if (eVar[e] == i) { let newMsg = total - c2v[e]; v2c[e] = (1.0 - GAMMA) * newMsg + GAMMA * v2c[e]; } }
      if (total < 0.0) { ecorr[i] = 1u; } else { ecorr[i] = 0u; }
    }
    // convergence: parity of ecorr over each check == s
    var ok = true;
    for (var a = 0u; a < NCHECK; a = a + 1u) {
      var par = 0u;
      for (var e = 0u; e < NEDGE; e = e + 1u) { if (eCheck[e] == a) { par = par ^ ecorr[eVar[e]]; } }
      if (par != s[a]) { ok = false; }
    }
    if (ok) { converged = true; break; }
  }

  var packed = 0u;
  for (var i = 0u; i < NVAR; i = i + 1u) { packed = packed | (ecorr[i] << i); }
  if (converged) { packed = packed | (1u << 31u); }
  corrections[idx] = packed;
}
`;

/** A decoded correction with its provenance. */
export interface QecDecodeResult {
  /** The X-error correction as a 9-bit support vector. */
  correction: BitVector;
  /** Whether pure GPU BP converged (false → the host OSD-0 fallback produced the correction). */
  gpuConverged: boolean;
  /** Which stage produced the final correction. */
  method: 'gpu-bp' | 'host-osd0';
}

/** Result of the exhaustive correctness sweep over all 16 X-syndromes. */
export interface QecValidationReport {
  syndromesTested: number;
  gpuBpConverged: number;
  /** Every syndrome the GPU CONVERGED is syndrome-valid + coset-equivalent to exact ML. */
  gpuConvergedAllValidCoset: boolean;
  /** GPU BP + host OSD-0 fallback solves all 16 correctly. */
  fullPipelineAll16ValidCoset: boolean;
  /** GPU converged flag matches the CPU BP reference on all 16. */
  convergedFlagMatchesCpu: number;
}

/** Result of a batched throughput benchmark. */
export interface QecThroughputReport {
  batchSize: number;
  reps: number;
  totalDecodes: number;
  wallSeconds: number;
  decodesPerSecond: number;
  nsPerDecodeAmortized: number;
  /** Share of the batch fully handled on-GPU (converged, needing no host OSD-0). */
  gpuFastPathFraction: number;
}

/** Unpack a packed correction word: bits 0..8 = qubit corrections, bit 31 = converged. */
export function unpackCorrection(word: number): { correction: BitVector; converged: boolean } {
  const correction = new Array(NVAR).fill(0);
  for (let i = 0; i < NVAR; i++) correction[i] = (word >>> i) & 1;
  const converged = ((word >>> CONVERGED_BIT) & 1) === 1;
  return { correction, converged };
}

/** Pack a 4-bit X-syndrome (bit a = check a) into a u32 for the shader. */
export function packSyndrome(s: readonly number[]): number {
  let packed = 0;
  for (let a = 0; a < NCHECK; a++) packed |= (s[a] & 1) << a;
  return packed >>> 0;
}

/**
 * GPU belief-propagation decoder for the [[9,1,3]] rotated surface code (X-error graph).
 *
 * Construct it over an initialized {@link GPUContext}, call {@link initialize} once to build
 * the compute pipeline, then {@link decodeBatch} (raw GPU BP) or {@link decodeWithFallback}
 * (GPU BP + host OSD-0 for the syndromes BP cannot satisfy). {@link benchmarkThroughput}
 * measures batched decodes/sec on the real device.
 */
export class QECDecoder {
  private _pipeline: GPUComputePipeline | null = null;

  constructor(private readonly ctx: GPUContext) {}

  /** Build the compute pipeline. Idempotent. Throws if the WGSL Tanner graph drifted from ZSTAB. */
  async initialize(): Promise<void> {
    if (this._pipeline) return;
    if (!tannerEdgesMatchZstab()) {
      throw new Error(
        'QECDecoder: WGSL Tanner edges (E_CHECK/E_VAR) do not reconstruct ZSTAB — refusing to build a decoder that diverges from the CPU-validated code.'
      );
    }
    const module = this.ctx.createShaderModule(QEC_BP_WGSL, 'qec-bp-decoder');
    this._pipeline = await this.ctx.createComputePipelineAsync(module, 'main', 'auto', 'qec-bp');
  }

  private pipeline(): GPUComputePipeline {
    if (!this._pipeline) {
      throw new Error('QECDecoder not initialized. Call initialize() first.');
    }
    return this._pipeline;
  }

  /**
   * Decode a batch of packed syndromes on the GPU with pure BP. Returns packed correction words
   * (bits 0..8 = qubit corrections, bit 31 = converged) — one per input, in order.
   */
  async decodeBatch(packedSyndromes: Uint32Array, p: number = DEFAULT_PRIOR): Promise<Uint32Array> {
    const pipeline = this.pipeline();
    const device = this.ctx.device;
    const B = packedSyndromes.length;
    if (B === 0) return new Uint32Array(0);

    const inBuf = device.createBuffer({
      size: B * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(
      inBuf,
      0,
      packedSyndromes.buffer as ArrayBuffer,
      packedSyndromes.byteOffset,
      packedSyndromes.byteLength
    );
    const outBuf = device.createBuffer({
      size: B * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });
    const readBuf = device.createBuffer({
      size: B * 4,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
    const params = new ArrayBuffer(16);
    new Float32Array(params, 0, 1)[0] = priorLLR(p);
    new Uint32Array(params, 4, 1)[0] = B;
    const paramBuf = device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(paramBuf, 0, params);

    const bind = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: inBuf } },
        { binding: 1, resource: { buffer: outBuf } },
        { binding: 2, resource: { buffer: paramBuf } },
      ],
    });

    const enc = device.createCommandEncoder();
    const pass = enc.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bind);
    pass.dispatchWorkgroups(Math.ceil(B / 64));
    pass.end();
    enc.copyBufferToBuffer(outBuf, 0, readBuf, 0, B * 4);
    device.queue.submit([enc.finish()]);

    await readBuf.mapAsync(GPUMapMode.READ);
    const out = new Uint32Array(readBuf.getMappedRange().slice(0));
    readBuf.unmap();
    inBuf.destroy();
    outBuf.destroy();
    readBuf.destroy();
    paramBuf.destroy();
    return out;
  }

  /**
   * Full-pipeline decode: run GPU BP over the batch, then fall to the host OSD-0 guard for any
   * syndrome BP did not converge on — the standard BP-on-accelerator / OSD-on-host split. Each
   * result carries whether the GPU fast path succeeded.
   */
  async decodeWithFallback(
    syndromes: readonly number[][],
    p: number = DEFAULT_PRIOR
  ): Promise<QecDecodeResult[]> {
    const packed = new Uint32Array(syndromes.map((s) => packSyndrome(s)));
    const out = await this.decodeBatch(packed, p);
    return syndromes.map((s, i) => {
      const { correction, converged } = unpackCorrection(out[i]);
      if (converged) return { correction, gpuConverged: true, method: 'gpu-bp' };
      return { correction: bpOsdDecode(HX, s, p).correction, gpuConverged: false, method: 'host-osd0' };
    });
  }

  /**
   * Exhaustively validate the GPU decoder over all 16 X-syndromes against the exact ML lookup:
   * every GPU-converged decode must be syndrome-valid + coset-equivalent, the full pipeline must
   * solve all 16, and the GPU converged flag must match the CPU BP reference.
   */
  async validateExhaustive(p: number = DEFAULT_PRIOR): Promise<QecValidationReport> {
    // Imported lazily-at-callsite via qec-codes to keep the hot decode path lean.
    const { LOOKUP_X, syndromeX, xorVec, isLogicalX, bpMinSum } = await import('./qec-codes.js');
    const syndromes: number[][] = [];
    for (let m = 0; m < 16; m++) syndromes.push([m & 1, (m >> 1) & 1, (m >> 2) & 1, (m >> 3) & 1]);
    const results = await this.decodeWithFallback(syndromes, p);

    let gpuConverged = 0;
    let gpuConvergedCorrect = 0;
    let fullValidCoset = 0;
    let convMatch = 0;
    const lambda = priorLLR(p);
    const okOf = (c: BitVector, s: number[]): boolean => {
      const valid = syndromeX(c).every((b, i) => b === s[i]);
      const diff = xorVec(c, LOOKUP_X.get(s.join(''))!.correction);
      return valid && syndromeX(diff).every((b) => b === 0) && !isLogicalX(diff);
    };
    for (let m = 0; m < 16; m++) {
      const s = syndromes[m];
      const r = results[m];
      const cpuConv = bpMinSum(HX, s, lambda).converged;
      if (r.gpuConverged === cpuConv) convMatch++;
      if (r.gpuConverged) {
        gpuConverged++;
        if (okOf(r.correction, s)) gpuConvergedCorrect++;
      }
      if (okOf(r.correction, s)) fullValidCoset++;
    }
    return {
      syndromesTested: 16,
      gpuBpConverged: gpuConverged,
      gpuConvergedAllValidCoset: gpuConvergedCorrect === gpuConverged,
      fullPipelineAll16ValidCoset: fullValidCoset === 16,
      convergedFlagMatchesCpu: convMatch,
    };
  }

  /**
   * Measure batched decode throughput on the real device: warm up, then time `reps` dispatches
   * of a `batchSize` batch (submit → onSubmittedWorkDone) with no per-dispatch readback. The
   * honest GPU metric is throughput, not single-shot latency.
   */
  async benchmarkThroughput(
    batchSize: number,
    reps: number,
    p: number = DEFAULT_PRIOR
  ): Promise<QecThroughputReport> {
    const pipeline = this.pipeline();
    const device = this.ctx.device;
    const B = batchSize;

    // Deterministic mix of the 16 syndromes (no Math.random — reproducible batch).
    const batch = new Uint32Array(B);
    let seed = 12345 >>> 0;
    for (let i = 0; i < B; i++) {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      batch[i] = ((t ^ (t >>> 14)) >>> 0) & 15;
    }

    const inBuf = device.createBuffer({
      size: B * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(inBuf, 0, batch.buffer as ArrayBuffer, batch.byteOffset, batch.byteLength);
    const outBuf = device.createBuffer({ size: B * 4, usage: GPUBufferUsage.STORAGE });
    const params = new ArrayBuffer(16);
    new Float32Array(params, 0, 1)[0] = priorLLR(p);
    new Uint32Array(params, 4, 1)[0] = B;
    const paramBuf = device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(paramBuf, 0, params);
    const bind = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: inBuf } },
        { binding: 1, resource: { buffer: outBuf } },
        { binding: 2, resource: { buffer: paramBuf } },
      ],
    });

    const dispatch = (): void => {
      const enc = device.createCommandEncoder();
      const pass = enc.beginComputePass();
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bind);
      pass.dispatchWorkgroups(Math.ceil(B / 64));
      pass.end();
      device.queue.submit([enc.finish()]);
    };

    // The GPU fast-path fraction: share of the batch that converges (needs no host OSD-0).
    const converged = await this.decodeBatch(batch, p);
    let convergedCount = 0;
    for (let i = 0; i < B; i++) if ((converged[i] >>> CONVERGED_BIT) & 1) convergedCount++;

    for (let r = 0; r < 3; r++) dispatch(); // warm up
    await device.queue.onSubmittedWorkDone();
    const t0 = performance.now();
    for (let r = 0; r < reps; r++) dispatch();
    await device.queue.onSubmittedWorkDone();
    const t1 = performance.now();

    inBuf.destroy();
    outBuf.destroy();
    paramBuf.destroy();

    const totalDecodes = B * reps;
    const wallSeconds = (t1 - t0) / 1000;
    return {
      batchSize: B,
      reps,
      totalDecodes,
      wallSeconds: Number(wallSeconds.toFixed(4)),
      decodesPerSecond: Math.round(totalDecodes / wallSeconds),
      nsPerDecodeAmortized: Number((((t1 - t0) * 1e6) / totalDecodes).toFixed(3)),
      gpuFastPathFraction: Number((convergedCount / B).toFixed(4)),
    };
  }
}
