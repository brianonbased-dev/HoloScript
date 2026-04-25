/**
 * Tests for holoMapReplayVerification — Sprint-3 Foundations Phase 2 slice
 * (board task task_1776664517766_qg8y).
 *
 * Coverage:
 * - Trust-tier classification across all 4 tiers (untrusted / self-attested /
 *   ots-anchored / fully-anchored) plus boundary cases (empty strings, partial
 *   anchor coverage)
 * - Match check including whitespace tolerance, case-sensitivity, edge cases
 * - Notes accumulation discipline
 * - Trust-tier ranking comparator
 *
 * Pattern: pure-function unit tests against a synthesized
 * {@link ReconstructionManifest} fixture; no GPU device dependency.
 */

import { describe, it, expect } from 'vitest';
import type { ReconstructionManifest } from '../HoloMapRuntime';
import {
  classifyTrustTier,
  trustTierRank,
  verifyReplay,
  type HoloMapTrustTier,
} from '../holoMapReplayVerification';

// ---------------------------------------------------------------------------
// Fixture: a minimal but valid ReconstructionManifest builder
// ---------------------------------------------------------------------------

function makeManifest(
  overrides: Partial<ReconstructionManifest> = {},
  provenanceOverrides: Partial<ReconstructionManifest['provenance']> = {}
): ReconstructionManifest {
  const base: ReconstructionManifest = {
    version: '1.0.0',
    worldId: 'holomap-test',
    displayName: 'Test Reconstruction',
    pointCount: 100,
    frameCount: 10,
    bounds: { min: [0, 0, 0], max: [1, 1, 1] },
    replayHash: 'abc123def456',
    simulationContract: {
      kind: 'native-holomap-reconstruction',
      replayFingerprint: 'abc123def456',
      holoScriptBuild: 'test-build-1.0.0',
    },
    provenance: {
      anchorHash: undefined,
      opentimestampsProof: undefined,
      baseCalldataTx: undefined,
      capturedAtIso: '2026-04-25T12:00:00.000Z',
      ...provenanceOverrides,
    },
    assets: {
      points: 'points.bin',
      trajectory: 'trajectory.json',
      anchors: 'anchors.json',
    },
    weightStrategy: 'distill',
    ...overrides,
  };
  return base;
}

// ---------------------------------------------------------------------------
// classifyTrustTier
// ---------------------------------------------------------------------------

describe('classifyTrustTier — provenance-field-based tiering', () => {
  it('returns "untrusted" when no anchor fields are populated', () => {
    const m = makeManifest({}, {
      anchorHash: undefined,
      opentimestampsProof: undefined,
      baseCalldataTx: undefined,
    });
    expect(classifyTrustTier(m)).toBe('untrusted');
  });

  it('returns "untrusted" when all anchor fields are empty strings', () => {
    const m = makeManifest({}, {
      anchorHash: '',
      opentimestampsProof: '',
      baseCalldataTx: '',
    });
    expect(classifyTrustTier(m)).toBe('untrusted');
  });

  it('returns "self-attested" when only anchorHash is populated', () => {
    const m = makeManifest({}, {
      anchorHash: 'self-attested:abc123def456',
    });
    expect(classifyTrustTier(m)).toBe('self-attested');
  });

  it('returns "self-attested" for any non-empty anchorHash without OTS', () => {
    const m = makeManifest({}, { anchorHash: 'some-other-marker:xyz' });
    expect(classifyTrustTier(m)).toBe('self-attested');
  });

  it('returns "ots-anchored" when OTS proof is populated', () => {
    const m = makeManifest({}, {
      anchorHash: 'sha256:abc',
      opentimestampsProof: 'https://example.com/proof.ots',
    });
    expect(classifyTrustTier(m)).toBe('ots-anchored');
  });

  it('returns "ots-anchored" even without anchorHash if OTS is set', () => {
    const m = makeManifest({}, {
      opentimestampsProof: 'https://example.com/proof.ots',
    });
    expect(classifyTrustTier(m)).toBe('ots-anchored');
  });

  it('returns "fully-anchored" when BOTH OTS and Base calldata are populated', () => {
    const m = makeManifest({}, {
      anchorHash: 'sha256:abc',
      opentimestampsProof: 'https://example.com/proof.ots',
      baseCalldataTx: '0xdeadbeef',
    });
    expect(classifyTrustTier(m)).toBe('fully-anchored');
  });

  it('does NOT return "fully-anchored" if only Base calldata is set (no OTS)', () => {
    // OTS is required; Base alone is treated as "self-attested" since the
    // OTS gate isn't crossed.
    const m = makeManifest({}, {
      anchorHash: 'sha256:abc',
      baseCalldataTx: '0xdeadbeef',
    });
    expect(classifyTrustTier(m)).toBe('self-attested');
  });

  // Regression: bug-fix 2026-04-25. Previously returned 'untrusted' here
  // because the implementation only checked anchorHash and OTS for the
  // self-attested tier. Base calldata alone IS evidentiary and should
  // qualify as self-attested per S.ANC dual-anchor pattern.
  it('returns "self-attested" when ONLY Base calldata is set (no OTS, no anchorHash)', () => {
    const m = makeManifest({}, {
      anchorHash: undefined,
      opentimestampsProof: undefined,
      baseCalldataTx: '0xdeadbeef',
    });
    expect(classifyTrustTier(m)).toBe('self-attested');
  });

  it('returns "self-attested" when ONLY Base calldata is set with empty anchorHash', () => {
    const m = makeManifest({}, {
      anchorHash: '',
      opentimestampsProof: '',
      baseCalldataTx: '0xdeadbeef',
    });
    expect(classifyTrustTier(m)).toBe('self-attested');
  });
});

// ---------------------------------------------------------------------------
// trustTierRank
// ---------------------------------------------------------------------------

describe('trustTierRank — ordering comparator', () => {
  it('returns increasing ranks for increasing trust', () => {
    expect(trustTierRank('untrusted')).toBe(0);
    expect(trustTierRank('self-attested')).toBe(1);
    expect(trustTierRank('ots-anchored')).toBe(2);
    expect(trustTierRank('fully-anchored')).toBe(3);
  });

  it('strictly orders all four tiers (no ties)', () => {
    const tiers: HoloMapTrustTier[] = [
      'untrusted',
      'self-attested',
      'ots-anchored',
      'fully-anchored',
    ];
    const ranks = tiers.map(trustTierRank);
    const sorted = [...ranks].sort((a, b) => a - b);
    expect(ranks).toEqual(sorted);
    expect(new Set(ranks).size).toBe(tiers.length);
  });
});

// ---------------------------------------------------------------------------
// verifyReplay — match check
// ---------------------------------------------------------------------------

describe('verifyReplay — byte-identical match check', () => {
  it('reports match=true when hashes are exactly equal', () => {
    const m = makeManifest({ replayHash: 'abc123def456' });
    const result = verifyReplay(m, 'abc123def456');
    expect(result.match).toBe(true);
    expect(result.expectedReplayHash).toBe('abc123def456');
    expect(result.actualReplayHash).toBe('abc123def456');
  });

  it('reports match=false when hashes differ', () => {
    const m = makeManifest({ replayHash: 'abc123def456' });
    const result = verifyReplay(m, 'different-hash-xyz');
    expect(result.match).toBe(false);
    expect(result.notes).toContain('hash-mismatch');
  });

  it('trims whitespace before comparison (tolerates trailing newline / leading space)', () => {
    const m = makeManifest({ replayHash: 'abc123def456' });
    const result = verifyReplay(m, '  abc123def456\n');
    expect(result.match).toBe(true);
  });

  it('does NOT normalise case (hex case mismatch is a real divergence)', () => {
    const m = makeManifest({ replayHash: 'abc123def456' });
    const result = verifyReplay(m, 'ABC123DEF456');
    expect(result.match).toBe(false);
    expect(result.notes).toContain('hash-mismatch');
  });

  it('reports both expected and actual hash in result for telemetry', () => {
    const m = makeManifest({ replayHash: 'expected-hash' });
    const result = verifyReplay(m, 'actual-hash-different');
    expect(result.expectedReplayHash).toBe('expected-hash');
    expect(result.actualReplayHash).toBe('actual-hash-different');
  });
});

// ---------------------------------------------------------------------------
// verifyReplay — trust tier propagation
// ---------------------------------------------------------------------------

describe('verifyReplay — trust tier flows through from classifyTrustTier', () => {
  it('flows untrusted tier through', () => {
    const m = makeManifest();
    expect(verifyReplay(m, m.replayHash).trustTier).toBe('untrusted');
  });

  it('flows self-attested tier through', () => {
    const m = makeManifest({}, { anchorHash: 'self-attested:abc' });
    expect(verifyReplay(m, m.replayHash).trustTier).toBe('self-attested');
  });

  it('flows ots-anchored tier through', () => {
    const m = makeManifest({}, {
      opentimestampsProof: 'proof.ots',
    });
    expect(verifyReplay(m, m.replayHash).trustTier).toBe('ots-anchored');
  });

  it('flows fully-anchored tier through', () => {
    const m = makeManifest({}, {
      opentimestampsProof: 'proof.ots',
      baseCalldataTx: '0xdeadbeef',
    });
    expect(verifyReplay(m, m.replayHash).trustTier).toBe('fully-anchored');
  });
});

// ---------------------------------------------------------------------------
// verifyReplay — notes accumulation discipline
// ---------------------------------------------------------------------------

describe('verifyReplay — notes accumulation', () => {
  it('emits empty notes for matched + fully-anchored manifest', () => {
    const m = makeManifest({}, {
      opentimestampsProof: 'proof.ots',
      baseCalldataTx: '0xdeadbeef',
    });
    const result = verifyReplay(m, m.replayHash);
    expect(result.notes).toEqual([]);
  });

  it('emits "untrusted-manifest-no-anchor-fields" for untrusted manifest', () => {
    const m = makeManifest();
    const result = verifyReplay(m, m.replayHash);
    expect(result.notes).toContain('untrusted-manifest-no-anchor-fields');
  });

  it('emits "self-attested-marker-only-no-external-proof" for default self-attested marker', () => {
    const m = makeManifest({}, { anchorHash: 'self-attested:abc123def456' });
    const result = verifyReplay(m, m.replayHash);
    expect(result.notes).toContain('self-attested-marker-only-no-external-proof');
  });

  it('does NOT emit self-attested-marker note when anchorHash is a different format', () => {
    const m = makeManifest({}, { anchorHash: 'sha256:realanchor' });
    const result = verifyReplay(m, m.replayHash);
    expect(result.notes).not.toContain('self-attested-marker-only-no-external-proof');
  });

  it('always emits "hash-mismatch" when match is false', () => {
    const m = makeManifest({ replayHash: 'expected' });
    const result = verifyReplay(m, 'actual-different');
    expect(result.match).toBe(false);
    expect(result.notes).toContain('hash-mismatch');
  });

  it('combines mismatch + tier notes when both apply', () => {
    const m = makeManifest({ replayHash: 'expected' });
    const result = verifyReplay(m, 'actual-different');
    // untrusted tier + mismatch → both notes
    expect(result.notes).toContain('hash-mismatch');
    expect(result.notes).toContain('untrusted-manifest-no-anchor-fields');
  });

  it('notes is always a non-null array', () => {
    const m = makeManifest({}, {
      opentimestampsProof: 'proof.ots',
      baseCalldataTx: '0xdeadbeef',
    });
    const result = verifyReplay(m, m.replayHash);
    expect(Array.isArray(result.notes)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Integration: manifest → tier → ranking
// ---------------------------------------------------------------------------

describe('integration: manifest sort order via trustTierRank', () => {
  it('sorts mixed-tier manifests highest-trust first', () => {
    const manifests: ReconstructionManifest[] = [
      makeManifest({ replayHash: 'm-untrusted' }),
      makeManifest(
        { replayHash: 'm-fully-anchored' },
        { opentimestampsProof: 'p.ots', baseCalldataTx: '0xdb' }
      ),
      makeManifest({ replayHash: 'm-self-attested' }, { anchorHash: 'self-attested:x' }),
      makeManifest({ replayHash: 'm-ots-anchored' }, { opentimestampsProof: 'p.ots' }),
    ];

    const sorted = [...manifests].sort(
      (a, b) => trustTierRank(classifyTrustTier(b)) - trustTierRank(classifyTrustTier(a))
    );

    expect(sorted[0].replayHash).toBe('m-fully-anchored');
    expect(sorted[1].replayHash).toBe('m-ots-anchored');
    expect(sorted[2].replayHash).toBe('m-self-attested');
    expect(sorted[3].replayHash).toBe('m-untrusted');
  });
});
