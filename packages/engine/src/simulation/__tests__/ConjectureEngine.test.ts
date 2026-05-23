import { describe, expect, it } from 'vitest';
import {
  CONJECTURE_NOVELTY_THRESHOLD,
  CONJECTURE_V1,
  buildConjectureV1Receipt,
  computeMeshFacts,
  createDegenerateTriangleCandidate,
  createSquareSheetCandidate,
  createTetrahedronSurfaceCandidate,
  eulerCharacteristicProbe,
  geometryHashOrderInvariantProbe,
  nonDegenerateGeometryProbe,
  type ConjectureClaim,
} from '../ConjectureEngine';

const CLAIM: ConjectureClaim = {
  id: 'C.GEOM.001',
  kind: 'geometry.invariant',
  statement:
    'Proof-carrying triangle surfaces preserve Euler characteristic and geometry hash under primitive reordering.',
  assumptions: [
    'triangle primitives are same-arity',
    'geometry hash canonicalizes primitive order',
  ],
  evidenceRefs: [
    'docs/architecture/TROPICAL_ALGEBRA_COVERAGE.md',
    'research/papers-22-23-mechanization/README.md',
  ],
  proposedBy: 'codex-hardware',
};

describe('ConjectureEngine (conjecture.v1)', () => {
  it('computes mesh facts for a proof-carrying tetrahedron surface', () => {
    const facts = computeMeshFacts(createTetrahedronSurfaceCandidate(), 'sha256');

    expect(facts.vertexCount).toBe(4);
    expect(facts.elementCount).toBe(4);
    expect(facts.elementArity).toBe(3);
    expect(facts.eulerCharacteristic).toBe(2);
    expect(facts.minTriangleArea).toBeGreaterThan(0);
    expect(facts.geometryHash).toMatch(/^geo-sha-/);
  });

  it('builds a survivor receipt when every candidate passes every probe', () => {
    const receipt = buildConjectureV1Receipt({
      claim: CLAIM,
      candidates: [createSquareSheetCandidate()],
      probes: [
        nonDegenerateGeometryProbe(),
        geometryHashOrderInvariantProbe('sha256'),
        eulerCharacteristicProbe(1),
      ],
      hashMode: 'sha256',
    });

    expect(receipt.solverType).toBe(CONJECTURE_V1);
    expect(receipt.status).toBe('survived');
    expect(receipt.counterexamples).toEqual([]);
    expect(receipt.evaluations[0].status).toBe('survived');
    expect(receipt.evaluations[0].novelty.provider).toBe('holoembed');
    expect(receipt.evaluations[0].novelty.status).toBe('novel');
    expect(receipt.evaluations[0].probeResults[0].predicate).toMatchObject({
      id: 'geometry.non_degenerate',
      statement: 'Every primitive has non-zero area or volume under the configured tolerance.',
      measurementKeys: ['minTriangleArea', 'minArea', 'minTetVolume', 'minVolume'],
    });
    expect(receipt.evaluations[0].probeResults[1].predicate).toMatchObject({
      id: 'geometry.hash_order_invariant',
      statement: 'Reordering same-arity primitives preserves the geometry hash.',
      measurementKeys: ['originalHash', 'reorderedHash'],
    });
    expect(receipt.evaluations[0].probeResults[2].predicate).toMatchObject({
      id: 'geometry.euler_characteristic',
      statement: 'Triangle-surface Euler characteristic equals 1.',
      measurementKeys: ['expected', 'actual'],
    });
    expect(receipt.receiptKey).toMatch(/^conjecture\.v1-sha-[0-9a-f]{64}$/);
  });

  it('reclassifies probe survivors as rediscovered when HoloEmbed matches prior art', () => {
    const statement = 'Every generated square sheet is non-degenerate.';
    const receipt = buildConjectureV1Receipt({
      claim: {
        ...CLAIM,
        id: 'C.GEOM.REDISCOVERED',
        statement,
      },
      candidates: [createSquareSheetCandidate()],
      probes: [nonDegenerateGeometryProbe()],
      hashMode: 'sha256',
      priorArtCorpus: [
        {
          id: 'prior.square-sheet.non-degenerate',
          title: 'Square sheet non-degeneracy',
          source: 'research/prior-art/square-sheet.md',
          statement,
        },
      ],
      noveltyThreshold: CONJECTURE_NOVELTY_THRESHOLD,
    });

    expect(receipt.status).toBe('rediscovered');
    expect(receipt.counterexamples).toEqual([]);
    expect(receipt.evaluations[0].status).toBe('rediscovered');
    expect(receipt.evaluations[0].novelty.status).toBe('near-duplicate');
    expect(receipt.evaluations[0].novelty.nearest?.priorArtId).toBe(
      'prior.square-sheet.non-degenerate',
    );
    expect(receipt.evaluations[0].novelty.nearest?.similarity).toBeGreaterThanOrEqual(
      CONJECTURE_NOVELTY_THRESHOLD,
    );
  });

  it('keeps HoloEmbed-novel probe survivors as survived', () => {
    const receipt = buildConjectureV1Receipt({
      claim: {
        ...CLAIM,
        id: 'C.GEOM.NOVEL',
        statement: 'A square sheet receipt can preserve a local hash-order invariant.',
      },
      candidates: [createSquareSheetCandidate()],
      probes: [nonDegenerateGeometryProbe(), geometryHashOrderInvariantProbe('sha256')],
      hashMode: 'sha256',
      priorArtCorpus: [
        {
          id: 'prior.collision-proxy',
          source: 'research/prior-art/collision-proxy.md',
          statement:
            'An axis-aligned generated quad has equivalent convex-hull and AABB collision proxies.',
        },
      ],
      noveltyThreshold: CONJECTURE_NOVELTY_THRESHOLD,
    });

    expect(receipt.status).toBe('survived');
    expect(receipt.evaluations[0].status).toBe('survived');
    expect(receipt.evaluations[0].novelty.status).toBe('novel');
    expect(receipt.evaluations[0].novelty.nearest?.similarity).toBeLessThan(
      CONJECTURE_NOVELTY_THRESHOLD,
    );
  });

  it('preserves hash-arity ambiguity as a counterexample', () => {
    const receipt = buildConjectureV1Receipt({
      claim: {
        ...CLAIM,
        id: 'C.GEOM.001A',
        statement:
          'Four-triangle closed surfaces preserve geometry hash under primitive reordering.',
      },
      candidates: [createTetrahedronSurfaceCandidate()],
      probes: [geometryHashOrderInvariantProbe('sha256')],
      hashMode: 'sha256',
    });

    expect(receipt.status).toBe('falsified');
    expect(receipt.counterexamples[0].candidateId).toBe('tetrahedron-surface');
    expect(receipt.counterexamples[0].failedProbes[0].probeId).toBe(
      'geometry.hash_order_invariant',
    );
  });

  it('emits a counterexample when a candidate falsifies the claim', () => {
    const receipt = buildConjectureV1Receipt({
      claim: {
        ...CLAIM,
        id: 'C.GEOM.002',
        statement: 'Every generated triangle candidate is non-degenerate.',
      },
      candidates: [
        createTetrahedronSurfaceCandidate(),
        createDegenerateTriangleCandidate(),
      ],
      probes: [nonDegenerateGeometryProbe()],
      hashMode: 'sha256',
    });

    expect(receipt.status).toBe('falsified');
    expect(receipt.counterexamples).toHaveLength(1);
    expect(receipt.counterexamples[0].candidateId).toBe('degenerate-triangle');
    expect(receipt.counterexamples[0].failedProbes[0].probeId).toBe('geometry.non_degenerate');
    expect(receipt.counterexamples[0].failedProbes[0].predicate.failMeaning).toContain(
      'collapsed below tolerance',
    );
  });

  it('treats topology mismatch as a falsifying geometry counterexample', () => {
    const receipt = buildConjectureV1Receipt({
      claim: {
        ...CLAIM,
        id: 'C.GEOM.003',
        statement: 'Every proof-carrying triangle surface in this suite is closed.',
      },
      candidates: [
        createTetrahedronSurfaceCandidate(),
        createSquareSheetCandidate(),
      ],
      probes: [eulerCharacteristicProbe(2)],
      hashMode: 'sha256',
    });

    expect(receipt.status).toBe('falsified');
    expect(receipt.counterexamples[0].family).toBe('square-sheet');
    expect(receipt.counterexamples[0].failedProbes[0].measurements).toEqual({
      expected: 2,
      actual: 1,
    });
  });

  it('receipt keys are deterministic across repeated runs', () => {
    const input = {
      claim: CLAIM,
      candidates: [createTetrahedronSurfaceCandidate()],
      probes: [
        nonDegenerateGeometryProbe(),
        geometryHashOrderInvariantProbe('sha256'),
        eulerCharacteristicProbe(2),
      ],
      hashMode: 'sha256' as const,
    };

    const a = buildConjectureV1Receipt(input);
    const b = buildConjectureV1Receipt(input);

    expect(a.receiptKey).toBe(b.receiptKey);
    expect(a.evaluations[0].facts.geometryHash).toBe(b.evaluations[0].facts.geometryHash);
  });

  it('rejects ungrounded claims before producing a receipt', () => {
    expect(() =>
      buildConjectureV1Receipt({
        claim: {
          ...CLAIM,
          evidenceRefs: [],
        },
        candidates: [createTetrahedronSurfaceCandidate()],
        probes: [nonDegenerateGeometryProbe()],
      }),
    ).toThrow(/evidenceRefs/);
  });

  it('rejects malformed candidates before probe execution', () => {
    expect(() =>
      buildConjectureV1Receipt({
        claim: CLAIM,
        candidates: [
          {
            id: 'bad',
            family: 'bad-index',
            vertices: new Float64Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
            elements: new Uint32Array([0, 1, 3]),
            elementArity: 3,
          },
        ],
        probes: [nonDegenerateGeometryProbe()],
      }),
    ).toThrow(/out-of-range index/);
  });
});
