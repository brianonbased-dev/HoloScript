/**
 * qec-d5.test.ts — distance-parameterized codes + GPU decoder.
 *
 * Pure sections run everywhere (CI-safe, no device). GPU sections follow the same
 * GPU_LIVE skip pattern as qec-decoder.test.ts: they exercise a real device when one
 * exists and skip gracefully otherwise.
 *
 * The d5 CPU audit numbers asserted here are MEASURED constants (BP is deterministic):
 * 904/4096 BP-converged, 4096/4096 syndrome-valid, 4078/4096 ML-coset agreement. If an
 * algorithm change shifts them, the test forces the receipt story to be retold, which is
 * the point.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { GPUContext } from '../../gpu-context.js';
import {
  ZSTAB,
  XSTAB,
  ZL,
  XL,
  bpOsdDecode,
  stabsToMatrix,
  overlapParity,
} from '../qec-codes.js';
import {
  buildRotatedSurfaceCode,
  validateSurfaceCode,
  codeDistanceBounded,
  buildMinWeightLookup,
  auditSyndromeSpace,
  gf2Rank,
  xorSupportParity,
} from '../qec-codes-d.js';
import { E_CHECK, E_VAR } from '../qec-decoder.js';
import {
  tannerEdgesOf,
  generateBpWgsl,
  QECDecoderD,
} from '../qec-decoder-d.js';

import { GPU_LIVE } from '../../__tests__/setup.js';

const normSets = (rows: readonly number[][]) =>
  JSON.stringify(rows.map((r) => [...r].sort((a, b) => a - b)).sort());

describe('rotated surface code generator — validity gates (pure)', () => {
  it('reproduces the graduated [[9,1,3]] layout exactly (as stabilizer sets + logicals)', () => {
    const c = buildRotatedSurfaceCode(3);
    expect(normSets(c.zStabs)).toBe(normSets(ZSTAB));
    expect(normSets(c.xStabs)).toBe(normSets(XSTAB));
    expect(c.zLogical).toEqual([...ZL]);
    expect(c.xLogical).toEqual([...XL]);
  });

  it('d=3 and d=5 pass every gate: counts, commutation, k=1, distance exactly d', () => {
    for (const d of [3, 5]) {
      const rep = validateSurfaceCode(buildRotatedSurfaceCode(d));
      expect(rep.stabilizerCounts.z).toBe((d * d - 1) / 2);
      expect(rep.stabilizerCounts.x).toBe((d * d - 1) / 2);
      expect(rep.allStabilizersCommute).toBe(true);
      expect(rep.logicalsCommuteWithStabilizers).toBe(true);
      expect(rep.logicalsAnticommute).toBe(true);
      expect(rep.logicalQubits).toBe(1);
      expect(rep.distance).toBe(d);
    }
  });

  it('rejects even or too-small distances', () => {
    expect(() => buildRotatedSurfaceCode(4)).toThrow(/odd d/);
    expect(() => buildRotatedSurfaceCode(1)).toThrow(/odd d/);
  });

  it('gf2Rank matches the d3 CSS accounting: n − rankHX − rankHZ = 1', () => {
    expect(9 - gf2Rank(stabsToMatrix(ZSTAB, 9)) - gf2Rank(stabsToMatrix(XSTAB, 9))).toBe(1);
  });
});

describe('d5 exact ML reference + CPU audit (pure)', () => {
  const d5 = buildRotatedSurfaceCode(5);

  it('weight-ordered lookup covers all 4096 X-syndromes by weight 6', () => {
    const { table, maxWeightUsed } = buildMinWeightLookup(d5.zStabs, d5.n);
    expect(table.size).toBe(4096);
    expect(maxWeightUsed).toBe(6);
  });

  it('lookup entries are true min-weight coset representatives (spot-check vs BP+OSD validity)', () => {
    const { table } = buildMinWeightLookup(d5.zStabs, d5.n);
    const H = stabsToMatrix(d5.zStabs, d5.n);
    // deterministic sample of syndromes
    for (const sm of [1, 7, 100, 1234, 4095]) {
      const s = Array.from({ length: 12 }, (_, a) => (sm >> a) & 1);
      const ml = table.get(s.join(''))!;
      // the representative reproduces the syndrome…
      d5.zStabs.forEach((st, a) => expect(overlapParity(ml.correction, st)).toBe(s[a]));
      // …and no decoder output can beat its weight (min-weight property)
      const dec = bpOsdDecode(H, s, 0.05);
      const w = dec.correction.reduce((x: number, y: number) => x + y, 0);
      expect(w).toBeGreaterThanOrEqual(ml.w);
    }
  });

  it('pins the measured d5 CPU audit: 100% valid, 904 BP-converged, 4078/4080 ML-coset', () => {
    const ax = auditSyndromeSpace(d5, 'x-errors');
    expect(ax).toEqual({
      syndromes: 4096,
      bpConverged: 904,
      syndromeValid: 4096,
      mlCosetAgreement: 4078,
      minWeightAgreement: 4064,
    });
    const az = auditSyndromeSpace(d5, 'z-errors');
    expect(az.syndromeValid).toBe(4096);
    expect(az.mlCosetAgreement).toBe(4080);
  });

  it('d3 audit stays perfect (16/16 everything) — the old receipt story still holds', () => {
    const d3 = buildRotatedSurfaceCode(3);
    const ax = auditSyndromeSpace(d3, 'x-errors');
    expect(ax.syndromes).toBe(16);
    expect(ax.syndromeValid).toBe(16);
    expect(ax.mlCosetAgreement).toBe(16);
  });
});

describe('WGSL generation (pure)', () => {
  it('generated d3 Tanner edges equal the hand-written shader arrays', () => {
    const edges = tannerEdgesOf(buildRotatedSurfaceCode(3));
    // Same (check, var) multiset — orderings may differ, so compare sorted pairs.
    const pairs = (ec: readonly number[], ev: readonly number[]) =>
      JSON.stringify(ec.map((c, i) => [c, ev[i]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]));
    // hand-written arrays index checks in ZSTAB order; the generated ones in generator
    // order — normalize by rebuilding supports before comparing
    const rebuild = (ec: readonly number[], ev: readonly number[], n: number) => {
      const rows: number[][] = Array.from({ length: n }, () => []);
      ec.forEach((c, i) => rows[c].push(ev[i]));
      return normSets(rows);
    };
    expect(rebuild(edges.eCheck, edges.eVar, 4)).toBe(rebuild([...E_CHECK], [...E_VAR], 4));
    expect(pairs(edges.eCheck, edges.eVar).length).toBeGreaterThan(0);
  });

  it('emits well-formed d5 WGSL with the right constants and packed-format guards', () => {
    const edges = tannerEdgesOf(buildRotatedSurfaceCode(5));
    expect(edges.nVar).toBe(25);
    expect(edges.nCheck).toBe(12);
    expect(edges.eCheck.length).toBe(8 * 4 + 4 * 2); // 8 bulk weight-4 + 4 boundary weight-2
    const wgsl = generateBpWgsl(edges);
    expect(wgsl).toContain('const NVAR: u32 = 25u;');
    expect(wgsl).toContain('const NCHECK: u32 = 12u;');
    expect(wgsl).toContain('const NEDGE: u32 = 40u;');
    expect(() =>
      generateBpWgsl({ nVar: 31, nCheck: 4, eCheck: [0], eVar: [0] })
    ).toThrow(/≤30 data qubits/);
  });

  it('xorSupportParity separates cosets', () => {
    const d3 = buildRotatedSurfaceCode(3);
    const a = new Array(9).fill(0);
    const b = new Array(9).fill(0);
    b[0] = b[3] = b[6] = 1; // the Z-logical string itself
    expect(xorSupportParity(a, b, d3.xLogical)).toBe(1); // differs by a logical
    expect(xorSupportParity(b, b, d3.xLogical)).toBe(0);
  });

  it('distance search is exact, not truncated: d5 has no logical below weight 5', () => {
    const d5 = buildRotatedSurfaceCode(5);
    expect(codeDistanceBounded(d5, 6)).toBe(5);
  });
});

describe('QECDecoderD on real GPU', () => {
  let ctx: GPUContext | null = null;

  beforeAll(async () => {
    if (!GPU_LIVE) return;
    ctx = new GPUContext();
    await ctx.initialize();
  });

  afterAll(() => {
    ctx?.destroy();
  });

  it('d5: full pipeline syndrome-valid on all 4096, flags match CPU, ML agreement = 4078', { timeout: 120_000 }, async () => {
    if (!GPU_LIVE) {
      console.log('[qec-d5] Skipping GPU exhaustive: no real device.');
      return;
    }
    const dec = new QECDecoderD(ctx!, buildRotatedSurfaceCode(5));
    await dec.initialize();
    const rep = await dec.validateExhaustive();
    expect(rep.syndromesTested).toBe(4096);
    expect(rep.gpuConvergedAllValid).toBe(true);
    expect(rep.fullPipelineAllValid).toBe(true);
    expect(rep.convergedFlagMatchesCpu).toBe(4096);
    expect(rep.gpuBpConverged).toBe(rep.cpuAudit.bpConverged);
    expect(rep.fullPipelineMlCosetAgreement).toBe(4078);
  });

  it('d3 through the parameterized class matches the graduated decoder story (16/16)', { timeout: 60_000 }, async () => {
    if (!GPU_LIVE) {
      console.log('[qec-d5] Skipping GPU d3 cross-check: no real device.');
      return;
    }
    const dec = new QECDecoderD(ctx!, buildRotatedSurfaceCode(3));
    await dec.initialize();
    const rep = await dec.validateExhaustive();
    expect(rep.syndromesTested).toBe(16);
    expect(rep.fullPipelineAllValid).toBe(true);
    expect(rep.fullPipelineMlCosetAgreement).toBe(16);
  });

  it(
    'latency + throughput benchmarks run and return sane shapes',
    // shape smoke, not a perf test — sized small and given headroom so a slow
    // software adapter (llvmpipe) under full-suite contention cannot flake it
    { timeout: 60_000 },
    async () => {
      if (!GPU_LIVE) {
        console.log('[qec-d5] Skipping GPU benchmarks: no real device.');
        return;
      }
      const dec = new QECDecoderD(ctx!, buildRotatedSurfaceCode(5));
      await dec.initialize();
      const lat = await dec.benchmarkLatency(20, 5);
      expect(lat.p50Us).toBeGreaterThan(0);
      expect(lat.p95Us).toBeGreaterThanOrEqual(lat.p50Us);
      const thr = await dec.benchmarkThroughput(1 << 12, 2);
      expect(thr.decodesPerSecond).toBeGreaterThan(0);
      expect(thr.gpuFastPathFraction).toBeGreaterThan(0);
      expect(thr.gpuFastPathFraction).toBeLessThan(1);
    }
  );
});
