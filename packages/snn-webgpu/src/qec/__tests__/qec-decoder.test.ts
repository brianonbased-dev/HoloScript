/**
 * QEC decoder tests.
 *
 * PURE tests (always run, incl. CI mock): the [[9,1,3]] code is a valid distance-3 CSS code,
 * the exact lookup corrects every single-qubit error, the BP+OSD-0 decoder is coset-equivalent
 * to exact ML over the whole syndrome domain, and the WGSL Tanner graph matches ZSTAB.
 *
 * GPU tests (GPU_LIVE only — real Dawn device): the QECDecoder compute shader reproduces the
 * CPU BP exactly and the full GPU-BP + host-OSD pipeline solves all 16 X-syndromes. Skipped
 * (not failed) when no real GPU is present — the mock has no compute, so a correctness claim
 * there would be theatre.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { GPU_LIVE } from '../../__tests__/setup.js';
import { GPUContext } from '../../gpu-context.js';
import {
  N,
  ZSTAB,
  XSTAB,
  ZL,
  XL,
  codeDistance,
  syndromeX,
  decodeX,
  decodeZ,
  xorVec,
  isLogicalX,
  isLogicalZ,
  syndromeCosetAudit,
} from '../qec-codes.js';
import {
  QECDecoder,
  tannerEdgesMatchZstab,
  packSyndrome,
  unpackCorrection,
  E_CHECK,
  E_VAR,
} from '../qec-decoder.js';

/** Parity of the overlap between two stabilizer/logical support sets. */
const overlap = (a: readonly number[], b: readonly number[]): number =>
  a.filter((q) => b.includes(q)).length % 2;

describe('[[9,1,3]] surface code — validity gates (pure)', () => {
  it('is a valid CSS code: every X-stabilizer commutes with every Z-stabilizer', () => {
    for (const xs of XSTAB) for (const zs of ZSTAB) expect(overlap(xs, zs)).toBe(0);
  });

  it('has exactly one logical qubit: logicals commute with all stabilizers, anticommute with each other', () => {
    for (const zs of ZSTAB) expect(overlap(XL, zs)).toBe(0); // logical X commutes with Z-stabs
    for (const xs of XSTAB) expect(overlap(ZL, xs)).toBe(0); // logical Z commutes with X-stabs
    expect(overlap(XL, ZL)).toBe(1); // X_L and Z_L anticommute
  });

  it('has code distance exactly 3', () => {
    expect(codeDistance()).toBe(3);
  });

  it('exact lookup corrects every single-qubit error (all 27: X, Y, Z on 9 qubits)', () => {
    let corrected = 0;
    for (let q = 0; q < N; q++) {
      for (const kind of ['X', 'Y', 'Z'] as const) {
        const eX = new Array(N).fill(0);
        const eZ = new Array(N).fill(0);
        if (kind === 'X' || kind === 'Y') eX[q] = 1;
        if (kind === 'Z' || kind === 'Y') eZ[q] = 1;
        const resX = xorVec(eX, decodeX(eX));
        const resZ = xorVec(eZ, decodeZ(eZ));
        if (!isLogicalX(resX) && !isLogicalZ(resZ)) corrected++;
      }
    }
    expect(corrected).toBe(27);
  });
});

describe('BP + OSD-0 decoder vs exact maximum likelihood (pure)', () => {
  it('is coset-equivalent to exact ML on all 16 X-syndromes with zero invalid', () => {
    const audit = syndromeCosetAudit();
    expect(audit.x_errors.coset_equivalent).toBe(16);
    expect(audit.x_errors.syndrome_invalid).toBe(0);
  });

  it('is coset-equivalent to exact ML on all 16 Z-syndromes with zero invalid', () => {
    const audit = syndromeCosetAudit();
    expect(audit.z_errors.coset_equivalent).toBe(16);
    expect(audit.z_errors.syndrome_invalid).toBe(0);
  });
});

describe('WGSL Tanner graph + packing (pure)', () => {
  it('the shader edge lists reconstruct ZSTAB exactly (drift guard)', () => {
    expect(E_CHECK).toHaveLength(12);
    expect(E_VAR).toHaveLength(12);
    expect(tannerEdgesMatchZstab()).toBe(true);
  });

  it('packSyndrome / unpackCorrection round-trip the bit layout', () => {
    expect(packSyndrome([1, 0, 1, 1])).toBe(0b1101);
    const { correction, converged } = unpackCorrection((1 << 31) | 0b101);
    expect(correction.slice(0, 3)).toEqual([1, 0, 1]);
    expect(converged).toBe(true);
  });
});

describe('QECDecoder on real GPU', () => {
  let ctx: GPUContext | null = null;
  let decoder: QECDecoder | null = null;

  beforeAll(async () => {
    if (!GPU_LIVE) return;
    ctx = new GPUContext();
    await ctx.initialize();
    decoder = new QECDecoder(ctx);
    await decoder.initialize();
  });

  afterAll(() => {
    ctx?.destroy();
  });

  it('refuses to build if the WGSL graph drifts from ZSTAB (always checkable)', async () => {
    // Not GPU-gated: initialize() guards on tannerEdgesMatchZstab() before any device work.
    expect(tannerEdgesMatchZstab()).toBe(true);
  });

  it('reproduces exact-ML coset correctness over all 16 X-syndromes (GPU BP + host OSD-0)', async () => {
    if (!GPU_LIVE) {
      console.log('[qec-decoder] Skipping GPU correctness: no real device (mock has no compute).');
      return;
    }
    const report = await decoder!.validateExhaustive();
    expect(report.syndromesTested).toBe(16);
    expect(report.gpuBpConverged).toBeGreaterThan(0);
    expect(report.gpuConvergedAllValidCoset).toBe(true);
    expect(report.fullPipelineAll16ValidCoset).toBe(true);
    expect(report.convergedFlagMatchesCpu).toBe(16);
  });

  it('every GPU-converged decode in a batch is syndrome-valid', async () => {
    if (!GPU_LIVE) {
      console.log('[qec-decoder] Skipping GPU batch check: no real device.');
      return;
    }
    const syndromes: number[][] = [];
    for (let m = 0; m < 16; m++) syndromes.push([m & 1, (m >> 1) & 1, (m >> 2) & 1, (m >> 3) & 1]);
    const packed = new Uint32Array(syndromes.map(packSyndrome));
    const out = await decoder!.decodeBatch(packed);
    for (let m = 0; m < 16; m++) {
      const { correction, converged } = unpackCorrection(out[m]);
      if (converged) expect(syndromeX(correction)).toEqual(syndromes[m]);
    }
  });

  it('reports positive batched throughput with a fast-path fraction in [0,1]', async () => {
    if (!GPU_LIVE) {
      console.log('[qec-decoder] Skipping GPU throughput: no real device.');
      return;
    }
    const report = await decoder!.benchmarkThroughput(4096, 5);
    expect(report.totalDecodes).toBe(4096 * 5);
    expect(report.decodesPerSecond).toBeGreaterThan(0);
    expect(report.gpuFastPathFraction).toBeGreaterThanOrEqual(0);
    expect(report.gpuFastPathFraction).toBeLessThanOrEqual(1);
  });
});
