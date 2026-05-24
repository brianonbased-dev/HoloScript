import { beforeAll, describe, expect, it } from 'vitest';
import {
  DETERMINISM_DEFAULT_PRECISION,
  DETERMINISM_MANIFEST_VERSION,
  assessDeterminismGate,
  buildDeterminismManifest,
  compareDeterminismManifests,
  quantizeToken,
  vectorFingerprint,
  compareRawWithinTolerance,
  assessRawToleranceGate,
  type DeterminismManifest,
  type RawVectorManifest,
} from '../SemanticDeterminismGate';
import { SEMANTIC_NOVELTY_MODEL, embedSemantic } from '../SemanticNoveltyEncoder';

// ── A tiny manifest factory for the pure-logic tests (no model needed). ──────────
function manifest(
  machineLabel: string,
  fingerprints: ReadonlyArray<[string, string]>,
  overrides: Partial<DeterminismManifest> = {},
): DeterminismManifest {
  return {
    manifestVersion: DETERMINISM_MANIFEST_VERSION,
    modelId: SEMANTIC_NOVELTY_MODEL,
    machineLabel,
    precision: DETERMINISM_DEFAULT_PRECISION,
    dim: 384,
    repeats: 3,
    sameMachineStable: true,
    entries: fingerprints.map(([text, fingerprint]) => ({ text, fingerprint, sameMachineStable: true })),
    ...overrides,
  };
}

describe('SemanticDeterminismGate — pure helpers (always run)', () => {
  it('quantizeToken rounds to precision and normalizes negative zero', () => {
    expect(quantizeToken(0.123456789, 6)).toBe('0.123457');
    expect(quantizeToken(-0.0000004, 6)).toBe('0.000000'); // -0 → 0, sub-precision jitter absorbed
    expect(quantizeToken(0.0000001, 6)).toBe('0.000000');
    expect(quantizeToken(-1.5, 6)).toBe('-1.500000');
  });

  it('quantizeToken rejects non-finite components and bad precision', () => {
    expect(() => quantizeToken(Number.NaN, 6)).toThrow();
    expect(() => quantizeToken(Infinity, 6)).toThrow();
    expect(() => quantizeToken(0.5, -1)).toThrow();
    expect(() => quantizeToken(0.5, 13)).toThrow();
  });

  it('vectorFingerprint is deterministic and precision-collapses sub-epsilon jitter', () => {
    const a = [0.6, 0.8, -0.0000004];
    const b = [0.6, 0.8, 0.0000001]; // differs only below 6-decimal precision
    expect(vectorFingerprint(a, 6)).toBe(vectorFingerprint(a, 6));
    expect(vectorFingerprint(a, 6)).toBe(vectorFingerprint(b, 6)); // jitter collapsed → same fingerprint
    expect(vectorFingerprint([0.6, 0.8], 6)).not.toBe(vectorFingerprint([0.6, 0.81], 6)); // real diff
    expect(() => vectorFingerprint([], 6)).toThrow();
  });

  it('compareDeterminismManifests matches identical fingerprints and flags real divergence', () => {
    const a = manifest('m1', [['t1', 'sha-aaa'], ['t2', 'sha-bbb']]);
    const b = manifest('m2', [['t1', 'sha-aaa'], ['t2', 'sha-bbb']]);
    const c = manifest('m3', [['t1', 'sha-aaa'], ['t2', 'sha-XXX']]);
    expect(compareDeterminismManifests(a, b).identical).toBe(true);
    const diff = compareDeterminismManifests(a, c);
    expect(diff.comparable).toBe(true);
    expect(diff.identical).toBe(false);
    expect(diff.mismatchedTexts).toEqual(['t2']);
  });

  it('compareDeterminismManifests refuses to compare misaligned manifests', () => {
    const a = manifest('m1', [['t1', 'sha-aaa']]);
    const b = manifest('m2', [['t1', 'sha-aaa']], { precision: 8 });
    const d = manifest('m3', [['t1', 'sha-aaa']], { dim: 768 });
    const e = manifest('m4', [['other', 'sha-aaa']]);
    expect(compareDeterminismManifests(a, b).comparable).toBe(false);
    expect(compareDeterminismManifests(a, d).comparable).toBe(false);
    expect(compareDeterminismManifests(a, e).comparable).toBe(false);
  });

  it('a single machine is insufficient evidence — NEVER receipt-binding eligible (the honest fallback)', () => {
    const one = assessDeterminismGate([manifest('only', [['t1', 'sha-aaa']])]);
    expect(one.verdict).toBe('insufficient-evidence');
    expect(one.receiptBindingEligible).toBe(false);
    expect(one.machineCount).toBe(1);
    // duplicate labels do not count as distinct machines
    const dup = assessDeterminismGate([
      manifest('same', [['t1', 'sha-aaa']]),
      manifest('same', [['t1', 'sha-aaa']]),
    ]);
    expect(dup.verdict).toBe('insufficient-evidence');
    expect(dup.machineCount).toBe(1);
  });

  it('≥2 distinct machines with identical fingerprints → byte-identical → eligible', () => {
    const a = assessDeterminismGate([
      manifest('linux-x64', [['t1', 'sha-aaa'], ['t2', 'sha-bbb']]),
      manifest('win-arm64', [['t1', 'sha-aaa'], ['t2', 'sha-bbb']]),
      manifest('ci-runner', [['t1', 'sha-aaa'], ['t2', 'sha-bbb']]),
    ]);
    expect(a.verdict).toBe('byte-identical');
    expect(a.receiptBindingEligible).toBe(true);
    expect(a.machineCount).toBe(3);
  });

  it('any cross-machine divergence → divergent → stays advisory', () => {
    const a = assessDeterminismGate([
      manifest('m1', [['t1', 'sha-aaa'], ['t2', 'sha-bbb']]),
      manifest('m2', [['t1', 'sha-aaa'], ['t2', 'sha-ZZZ']]),
    ]);
    expect(a.verdict).toBe('divergent');
    expect(a.receiptBindingEligible).toBe(false);
    expect(a.divergentTexts).toEqual(['t2']);
  });

  it('same-machine instability → unstable → stays advisory', () => {
    const shaky = manifest('m2', [['t1', 'sha-aaa']], { sameMachineStable: false });
    const a = assessDeterminismGate([manifest('m1', [['t1', 'sha-aaa']]), shaky]);
    expect(a.verdict).toBe('unstable');
    expect(a.receiptBindingEligible).toBe(false);
  });

  it('misaligned fleet manifests → incomparable → stays advisory', () => {
    const a = assessDeterminismGate([
      manifest('m1', [['t1', 'sha-aaa']]),
      manifest('m2', [['t1', 'sha-aaa']], { precision: 8 }),
    ]);
    expect(a.verdict).toBe('incomparable');
    expect(a.receiptBindingEligible).toBe(false);
  });
});

describe('SemanticDeterminismGate — tolerance comparator (robust receipt primitive, pure)', () => {
  function raw(label: string, vectors: Record<string, number[]>): RawVectorManifest {
    return { machineLabel: label, modelId: SEMANTIC_NOVELTY_MODEL, dim: 2, vectors };
  }

  it('agrees within tolerance despite sub-epsilon (ULP-scale) jitter', () => {
    const a = raw('m1', { t1: [0.5, 0.5], t2: [0.1, 0.2] });
    const b = raw('m2', { t1: [0.5 + 1e-7, 0.5 - 9e-8], t2: [0.1, 0.2 + 4e-8] });
    const cmp = compareRawWithinTolerance(a, b, 1e-5);
    expect(cmp.comparable).toBe(true);
    expect(cmp.withinTolerance).toBe(true);
    expect(cmp.maxAbsDelta).toBeLessThan(1e-5);
  });

  it('flags a real divergence above tolerance', () => {
    const a = raw('m1', { t1: [0.5, 0.5] });
    const b = raw('m2', { t1: [0.5, 0.51] }); // 1e-2 delta
    const cmp = compareRawWithinTolerance(a, b, 1e-5);
    expect(cmp.withinTolerance).toBe(false);
    expect(cmp.exceedingTexts).toEqual(['t1']);
  });

  it('a single machine is insufficient evidence; ≥2 agreeing → within-tolerance → eligible', () => {
    const single = assessRawToleranceGate([raw('only', { t1: [0.5, 0.5] })]);
    expect(single.verdict).toBe('insufficient-evidence');
    expect(single.receiptBindingEligible).toBe(false);

    const ok = assessRawToleranceGate([
      raw('linux-x64', { t1: [0.5, 0.5], t2: [0.1, 0.2] }),
      raw('win-arm64', { t1: [0.5 + 2e-7, 0.5], t2: [0.1, 0.2 - 1e-7] }),
    ], 1e-5);
    expect(ok.verdict).toBe('within-tolerance');
    expect(ok.receiptBindingEligible).toBe(true);

    const bad = assessRawToleranceGate([
      raw('m1', { t1: [0.5, 0.5] }),
      raw('m2', { t1: [0.6, 0.5] }),
    ], 1e-5);
    expect(bad.verdict).toBe('divergent');
    expect(bad.receiptBindingEligible).toBe(false);
  });
});

// Model-gated: builds a REAL manifest on this machine if the model is available.
describe(`SemanticDeterminismGate — learned model (${SEMANTIC_NOVELTY_MODEL})`, () => {
  let available = false;
  beforeAll(async () => {
    try {
      await embedSemantic('warmup');
      available = true;
    } catch {
      available = false;
    }
  }, 120_000);

  it('this machine is same-machine stable, and a manifest compared to itself is identical', async (ctx) => {
    if (!available) return ctx.skip();
    const m = await buildDeterminismManifest({ machineLabel: 'test-local', repeats: 3 });
    expect(m.dim).toBeGreaterThan(0);
    expect(m.entries.length).toBeGreaterThan(0);
    expect(m.sameMachineStable).toBe(true); // same text → byte-identical across repeats
    expect(compareDeterminismManifests(m, m).identical).toBe(true);
    // one real machine alone is still insufficient evidence — the gate refuses to promote
    const single = assessDeterminismGate([m]);
    expect(single.verdict).toBe('insufficient-evidence');
    expect(single.receiptBindingEligible).toBe(false);
  }, 120_000);
}, 120_000);
