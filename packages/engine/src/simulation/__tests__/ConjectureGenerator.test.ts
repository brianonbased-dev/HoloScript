import { describe, expect, it } from 'vitest';
import { buildConjectureV1Receipt, eulerCharacteristicProbe, nonDegenerateGeometryProbe } from '../ConjectureEngine';
import {
  collapsingTriangleCandidate,
  generateCollapsingTriangleFamily,
  generateRegularPolygonSheetFamily,
  regularPolygonSheetCandidate,
} from '../ConjectureGenerator';
import {
  GENERATED_GEOMETRY_FAMILY_SUITE,
  runGeneratedGeometryConjectureCycle,
} from '../ConjectureRunner';

describe('ConjectureGenerator — GENERATE leg', () => {
  it('generates regular polygon sheets with Euler characteristic 1 for every member', () => {
    const family = generateRegularPolygonSheetFamily({ minSides: 3, maxSides: 8 });
    expect(family).toHaveLength(6);

    const claim = {
      kind: 'geometry.invariant' as const,
      id: 'C.TEST.POLYGON_FAMILY',
      statement: 'every generated regular polygon sheet has Euler characteristic 1',
      assumptions: ['receipt-carrying geometry is evidence, not a Lean proof'],
      evidenceRefs: ['packages/engine/src/simulation/ConjectureGenerator.ts'],
      proposedBy: 'generator-test',
    };
    const receipt = buildConjectureV1Receipt({
      claim,
      candidates: family,
      probes: [nonDegenerateGeometryProbe(), eulerCharacteristicProbe(1)],
      hashMode: 'sha256',
    });

    expect(receipt.status).toBe('survived');
    expect(receipt.counterexamples).toHaveLength(0);
    expect(receipt.evaluations).toHaveLength(6);
  });

  it('rejects an invalid polygon (sides < 3)', () => {
    expect(() => regularPolygonSheetCandidate(2)).toThrow();
  });

  it('discovers the degenerate apex height in a swept triangle family', () => {
    const family = generateCollapsingTriangleFamily({ steps: 6, startHeight: 1, endHeight: 0 });
    expect(family).toHaveLength(6);

    const claim = {
      kind: 'geometry.invariant' as const,
      id: 'C.TEST.COLLAPSE_SWEEP',
      statement: 'every triangle in the apex-height sweep is non-degenerate',
      assumptions: ['falsifiers must carry the discovered parameter'],
      evidenceRefs: ['packages/engine/src/simulation/ConjectureGenerator.ts'],
      proposedBy: 'generator-test',
    };
    const receipt = buildConjectureV1Receipt({
      claim,
      candidates: family,
      probes: [nonDegenerateGeometryProbe()],
      hashMode: 'sha256',
    });

    // The sweep MUST be falsified, and the counterexample MUST be the apexHeight=0 member.
    expect(receipt.status).toBe('falsified');
    expect(receipt.counterexamples.length).toBeGreaterThanOrEqual(1);
    const degenerateEval = receipt.evaluations.find(
      (evaluation) => evaluation.parameters.apexHeight === 0,
    );
    expect(degenerateEval?.status).toBe('falsified');
  });

  it('collapsingTriangleCandidate at height 0 is the discovered counterexample', () => {
    const candidate = collapsingTriangleCandidate(0);
    expect(candidate.parameters?.apexHeight).toBe(0);
    expect(candidate.semanticTags).toContain('counterexample');
  });
});

describe('runGeneratedGeometryConjectureCycle — generated-family suite', () => {
  it('passes the MVP gate over machine-generated families', () => {
    const result = runGeneratedGeometryConjectureCycle({ proposedBy: 'generator-test' });

    expect(result.suite).toBe(GENERATED_GEOMETRY_FAMILY_SUITE);
    expect(result.status).toBe('completed');
    expect(result.gate.passed).toBe(true);
    expect(result.gate.survivorReceiptKey).toBeTruthy();
    expect(result.gate.falsifiedReceiptKey).toBeTruthy();
    expect(result.gate.replayCounterexampleMatched).toBe(true);
    expect(result.graduation).toContain('receipt-carrying.geometry');
  });

  it('is deterministic — identical receipt key across runs', () => {
    const a = runGeneratedGeometryConjectureCycle({ proposedBy: 'generator-test' });
    const b = runGeneratedGeometryConjectureCycle({ proposedBy: 'generator-test' });
    expect(a.receiptKey).toBe(b.receiptKey);
  });
});
