/**
 * qec-decoder-d.ts — the distance-parameterized GPU min-sum BP decoder.
 *
 * Generalizes {@link ./qec-decoder} (the graduated d3 class, untouched) to any rotated
 * surface code from {@link ./qec-codes-d}: the WGSL is GENERATED from the code's X-graph
 * Tanner edges instead of hand-written, so the shader cannot drift from the CPU-validated
 * layout — the generator and the gates are the drift guard.
 *
 * Two measurements, because they answer different questions (the d3 receipt reported only
 * the first — its known gap):
 *   - {@link benchmarkThroughput}: batched decodes/sec — the honest GPU-win number.
 *   - {@link benchmarkLatency}: SINGLE-SHOT submit→readback wall time (p50/p95/mean) — the
 *     number a real-time decode loop actually lives under. On any discrete GPU this is
 *     dominated by dispatch + readback overhead, which is exactly why it must be published
 *     next to throughput rather than left implied.
 *
 * Packing: one u32 per decode — correction bits 0..n−1, converged flag at bit 31. Guarded to
 * n ≤ 30 (d ≤ 5 rotated surface codes; d7 needs a two-word format this module refuses to
 * fake).
 *
 * @module snn-webgpu/qec/qec-decoder-d
 */

import type { GPUContext } from '../gpu-context.js';
import {
  bpOsdDecode,
  priorLLR,
  stabsToMatrix,
  overlapParity,
  DEFAULT_PRIOR,
  type BitVector,
} from './qec-codes.js';
import {
  buildMinWeightLookup,
  auditSyndromeSpace,
  xorSupportParity,
  type SurfaceCode,
  type SyndromeAudit,
} from './qec-codes-d.js';
import { CONVERGED_BIT } from './qec-decoder.js';

/** The X-graph Tanner edges of a code, flattened for the shader. */
export interface TannerEdges {
  nVar: number;
  nCheck: number;
  eCheck: number[];
  eVar: number[];
}

/** Flatten the Z-stabilizer supports (X-error graph) into shader edge lists. */
export function tannerEdgesOf(code: SurfaceCode): TannerEdges {
  const eCheck: number[] = [];
  const eVar: number[] = [];
  code.zStabs.forEach((support, a) => {
    for (const q of support) {
      eCheck.push(a);
      eVar.push(q);
    }
  });
  return { nVar: code.n, nCheck: code.zStabs.length, eCheck, eVar };
}

/**
 * Generate the min-sum BP compute shader for a code. Same algorithm and constants as the
 * hand-written d3 WGSL in {@link ./qec-decoder} (alpha 0.8125, gamma 0.2, 30 iterations) —
 * for d3 the generated source is structurally identical modulo the edge constants, and the
 * tests pin that the generated d3 edges equal the graduated module's hand-written ones.
 */
export function generateBpWgsl(edges: TannerEdges): string {
  const { nVar, nCheck, eCheck, eVar } = edges;
  const nEdge = eCheck.length;
  if (nVar > 30) throw new Error(`packed u32 format supports ≤30 data qubits, got ${nVar}`);
  if (nCheck > 31) throw new Error(`packed u32 syndrome supports ≤31 checks, got ${nCheck}`);
  const u32list = (xs: number[]) => xs.map((x) => `${x}u`).join(',');
  return /* wgsl */ `
struct Params { lambda: f32, count: u32, pad0: u32, pad1: u32 };
@group(0) @binding(0) var<storage, read> syndromes: array<u32>;
@group(0) @binding(1) var<storage, read_write> corrections: array<u32>;
@group(0) @binding(2) var<uniform> params: Params;

const ALPHA: f32 = 0.8125;
const GAMMA: f32 = 0.2;
const MAXITER: u32 = 30u;
const NVAR: u32 = ${nVar}u;
const NCHECK: u32 = ${nCheck}u;
const NEDGE: u32 = ${nEdge}u;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  if (idx >= params.count) { return; }

  var eCheck = array<u32,${nEdge}>(${u32list(eCheck)});
  var eVar   = array<u32,${nEdge}>(${u32list(eVar)});

  let sPacked = syndromes[idx];
  var s = array<u32,${nCheck}>();
  for (var a = 0u; a < NCHECK; a = a + 1u) { s[a] = (sPacked >> a) & 1u; }

  let lambda = params.lambda;
  var v2c = array<f32,${nEdge}>();
  var c2v = array<f32,${nEdge}>();
  for (var e = 0u; e < NEDGE; e = e + 1u) { v2c[e] = lambda; c2v[e] = 0.0; }
  var ecorr = array<u32,${nVar}>();
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
}

/** Result of the exhaustive GPU correctness sweep over the full syndrome space. */
export interface QecDValidationReport {
  distance: number;
  syndromesTested: number;
  gpuBpConverged: number;
  /** Every GPU-converged correction reproduces its syndrome. */
  gpuConvergedAllValid: boolean;
  /** GPU BP + host OSD-0 is syndrome-valid on the whole space (hard requirement). */
  fullPipelineAllValid: boolean;
  /** Full pipeline lands in the exact-ML logical coset (measured, not required at d ≥ 5). */
  fullPipelineMlCosetAgreement: number;
  /** GPU converged flag matches the CPU BP reference on every syndrome. */
  convergedFlagMatchesCpu: number;
  /** The CPU-side reference audit, for the receipt. */
  cpuAudit: SyndromeAudit;
}

export interface QecDThroughputReport {
  batchSize: number;
  reps: number;
  totalDecodes: number;
  wallSeconds: number;
  decodesPerSecond: number;
  nsPerDecodeAmortized: number;
  gpuFastPathFraction: number;
}

/** Single-shot latency: one syndrome per submit, full submit→readback wall time. */
export interface QecDLatencyReport {
  reps: number;
  warmup: number;
  p50Us: number;
  p95Us: number;
  meanUs: number;
  minUs: number;
  maxUs: number;
  note: string;
}

/** Distance-parameterized GPU BP decoder with host OSD-0 fallback. */
export class QECDecoderD {
  private _pipeline: GPUComputePipeline | null = null;
  readonly edges: TannerEdges;
  private readonly HX: number[][];

  constructor(
    private readonly ctx: GPUContext,
    readonly code: SurfaceCode
  ) {
    this.edges = tannerEdgesOf(code);
    this.HX = stabsToMatrix(code.zStabs, code.n);
  }

  async initialize(): Promise<void> {
    if (this._pipeline) return;
    const module = this.ctx.createShaderModule(
      generateBpWgsl(this.edges),
      `qec-bp-decoder-d${this.code.d}`
    );
    this._pipeline = await this.ctx.createComputePipelineAsync(
      module,
      'main',
      'auto',
      `qec-bp-d${this.code.d}`
    );
  }

  private pipeline(): GPUComputePipeline {
    if (!this._pipeline) throw new Error('QECDecoderD not initialized. Call initialize() first.');
    return this._pipeline;
  }

  packSyndrome(s: readonly number[]): number {
    let packed = 0;
    for (let a = 0; a < this.edges.nCheck; a++) packed |= (s[a] & 1) << a;
    return packed >>> 0;
  }

  unpackCorrection(word: number): { correction: BitVector; converged: boolean } {
    const correction = new Array(this.edges.nVar).fill(0);
    for (let i = 0; i < this.edges.nVar; i++) correction[i] = (word >>> i) & 1;
    return { correction, converged: ((word >>> CONVERGED_BIT) & 1) === 1 };
  }

  /** Decode a batch of packed syndromes with pure GPU BP. */
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
    const paramBuf = device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const params = new ArrayBuffer(16);
    new Float32Array(params, 0, 1)[0] = priorLLR(p);
    new Uint32Array(params, 4, 1)[0] = B;
    device.queue.writeBuffer(paramBuf, 0, params);

    const bind = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: inBuf } },
        { binding: 1, resource: { buffer: outBuf } },
        { binding: 2, resource: { buffer: paramBuf } },
      ],
    });
    const readBuf = device.createBuffer({
      size: B * 4,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
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
    paramBuf.destroy();
    readBuf.destroy();
    return out;
  }

  /** GPU BP with host OSD-0 fallback for the syndromes BP alone cannot satisfy. */
  async decodeWithFallback(
    s: readonly number[],
    p: number = DEFAULT_PRIOR
  ): Promise<{ correction: BitVector; gpuConverged: boolean; method: 'gpu-bp' | 'host-osd0' }> {
    const packed = await this.decodeBatch(new Uint32Array([this.packSyndrome(s)]), p);
    const { correction, converged } = this.unpackCorrection(packed[0]);
    if (converged) return { correction, gpuConverged: true, method: 'gpu-bp' };
    const host = bpOsdDecode(this.HX, [...s], p);
    return { correction: host.correction, gpuConverged: false, method: 'host-osd0' };
  }

  /**
   * Exhaustive correctness sweep over the WHOLE X-syndrome space (d3: 16, d5: 4096) against
   * the exact min-weight reference. Syndrome-validity is required; ML-coset agreement is
   * measured and reported.
   */
  async validateExhaustive(p: number = DEFAULT_PRIOR): Promise<QecDValidationReport> {
    const { nCheck } = this.edges;
    const total = 1 << nCheck;
    const packed = new Uint32Array(total);
    for (let sm = 0; sm < total; sm++) packed[sm] = sm >>> 0;
    const words = await this.decodeBatch(packed, p);

    const { table } = buildMinWeightLookup(this.code.zStabs, this.code.n);
    const cpuAudit = auditSyndromeSpace(this.code, 'x-errors', p);

    let gpuBpConverged = 0;
    let gpuConvergedAllValid = true;
    let fullValid = 0;
    let mlAgree = 0;
    let flagMatches = 0;
    for (let sm = 0; sm < total; sm++) {
      const s = Array.from({ length: nCheck }, (_, a) => (sm >> a) & 1);
      const { correction, converged } = this.unpackCorrection(words[sm]);
      const cpu = bpOsdDecode(this.HX, s, p);
      const cpuBpConverged = cpu.method === 'bp';
      if (converged === cpuBpConverged) flagMatches++;

      let final = correction;
      if (converged) {
        gpuBpConverged++;
        const valid = this.code.zStabs.every((st, a) => overlapParity(correction, st) === s[a]);
        if (!valid) gpuConvergedAllValid = false;
      } else {
        final = cpu.correction;
      }
      const valid = this.code.zStabs.every((st, a) => overlapParity(final, st) === s[a]);
      if (valid) fullValid++;
      const ml = table.get(s.join(''))!;
      if (valid && xorSupportParity(final, ml.correction, this.code.zLogical) === 0) mlAgree++;
    }
    return {
      distance: this.code.d,
      syndromesTested: total,
      gpuBpConverged,
      gpuConvergedAllValid,
      fullPipelineAllValid: fullValid === total,
      fullPipelineMlCosetAgreement: mlAgree,
      convergedFlagMatchesCpu: flagMatches,
      cpuAudit,
    };
  }

  /** Batched throughput on the device: `reps` dispatches of `batchSize` random syndromes. */
  async benchmarkThroughput(
    batchSize: number = 1 << 20,
    reps: number = 30,
    p: number = DEFAULT_PRIOR
  ): Promise<QecDThroughputReport> {
    const total = 1 << this.edges.nCheck;
    const packed = new Uint32Array(batchSize);
    let seed = 0x9e3779b9;
    for (let i = 0; i < batchSize; i++) {
      seed ^= seed << 13;
      seed >>>= 0;
      seed ^= seed >> 17;
      seed ^= seed << 5;
      seed >>>= 0;
      packed[i] = seed % total;
    }
    // warmup
    await this.decodeBatch(packed, p);
    let converged = 0;
    const t0 = process.hrtime.bigint();
    for (let r = 0; r < reps; r++) {
      const words = await this.decodeBatch(packed, p);
      if (r === 0) {
        for (const w of words) if ((w >>> CONVERGED_BIT) & 1) converged++;
      }
    }
    const wallSeconds = Number(process.hrtime.bigint() - t0) / 1e9;
    const totalDecodes = batchSize * reps;
    return {
      batchSize,
      reps,
      totalDecodes,
      wallSeconds,
      decodesPerSecond: totalDecodes / wallSeconds,
      nsPerDecodeAmortized: (wallSeconds * 1e9) / totalDecodes,
      gpuFastPathFraction: converged / batchSize,
    };
  }

  /**
   * SINGLE-SHOT latency: one syndrome per full submit→readback round trip. This is the
   * number a real-time decode loop lives under; it is dominated by dispatch + readback
   * overhead, not BP arithmetic, and that is precisely the honest point of publishing it.
   */
  async benchmarkLatency(reps: number = 200, warmup: number = 20): Promise<QecDLatencyReport> {
    const total = 1 << this.edges.nCheck;
    const samplesUs: number[] = [];
    let seed = 0xc0ffee;
    const next = () => {
      seed ^= seed << 13;
      seed >>>= 0;
      seed ^= seed >> 17;
      seed ^= seed << 5;
      seed >>>= 0;
      return seed % total;
    };
    for (let i = 0; i < warmup; i++) await this.decodeBatch(new Uint32Array([next()]));
    for (let i = 0; i < reps; i++) {
      const one = new Uint32Array([next()]);
      const t0 = process.hrtime.bigint();
      await this.decodeBatch(one);
      samplesUs.push(Number(process.hrtime.bigint() - t0) / 1e3);
    }
    samplesUs.sort((a, b) => a - b);
    const pick = (q: number) => samplesUs[Math.min(samplesUs.length - 1, Math.floor(q * samplesUs.length))];
    const mean = samplesUs.reduce((a, b) => a + b, 0) / samplesUs.length;
    return {
      reps,
      warmup,
      p50Us: pick(0.5),
      p95Us: pick(0.95),
      meanUs: mean,
      minUs: samplesUs[0],
      maxUs: samplesUs[samplesUs.length - 1],
      note: 'full submit→readback round trip per single decode, incl. buffer create/upload/map — the real-time-loop number, NOT amortized throughput',
    };
  }
}
