/**
 * `conjecture.v1` turns mathematical or geometric claims into executable
 * witnesses: candidate geometry, invariant probes, counterexamples, and a
 * deterministic receipt. It is intentionally small; the value is the loop:
 * propose -> test -> preserve survivors and failures as evidence.
 */

import { stableStringify } from './equivalenceRecord';
import {
  HASH_MODE_DEFAULT,
  hashGeometry,
  type HashMode,
} from './hashes';
import { sha256Bytes } from './sha256';

export const CONJECTURE_V1 = 'conjecture.v1' as const;

export type ConjectureV1SolverType = typeof CONJECTURE_V1;

export type ConjectureKind =
  | 'geometry.invariant'
  | 'algebraic.trait'
  | 'impossibility.boundary';

export type ConjectureStatus = 'survived' | 'falsified' | 'inconclusive';

export type ProbeStatus = 'pass' | 'fail' | 'inconclusive';

export type ConjectureParameterValue = string | number | boolean | null;

export interface ConjectureClaim {
  id: string;
  kind: ConjectureKind;
  statement: string;
  assumptions: ReadonlyArray<string>;
  evidenceRefs: ReadonlyArray<string>;
  proposedBy: string;
}

export interface GeometryConjectureCandidate {
  id: string;
  family: string;
  vertices: Float32Array | Float64Array;
  elements: Uint32Array;
  elementArity?: 3 | 4;
  semanticTags?: ReadonlyArray<string>;
  parameters?: Readonly<Record<string, ConjectureParameterValue>>;
}

export interface MeshFacts {
  geometryHash: string;
  vertexCount: number;
  elementCount: number;
  elementArity: 3 | 4 | null;
  hasNonFiniteVertex: boolean;
  minEdgeLength: number | null;
  maxEdgeLength: number | null;
  minTriangleArea: number | null;
  totalTriangleArea: number | null;
  minTetVolume: number | null;
  eulerCharacteristic: number | null;
}

export interface ProbeResult {
  probeId: string;
  status: ProbeStatus;
  message: string;
  measurements?: Readonly<Record<string, ConjectureParameterValue>>;
}

export interface ConjectureProbe {
  id: string;
  description: string;
  evaluate(candidate: GeometryConjectureCandidate, facts: MeshFacts): ProbeResult;
}

export interface CandidateEvaluation {
  candidateId: string;
  family: string;
  semanticTags: ReadonlyArray<string>;
  parameters: Readonly<Record<string, ConjectureParameterValue>>;
  facts: MeshFacts;
  probeResults: ReadonlyArray<ProbeResult>;
  status: ConjectureStatus;
}

export interface ConjectureCounterexample {
  candidateId: string;
  family: string;
  failedProbes: ReadonlyArray<ProbeResult>;
  geometryHash: string;
}

export interface ConjectureReceipt {
  solverType: ConjectureV1SolverType;
  specVersion: 1;
  claim: ConjectureClaim;
  status: ConjectureStatus;
  receiptKey: string;
  hashMode: HashMode;
  evaluations: ReadonlyArray<CandidateEvaluation>;
  counterexamples: ReadonlyArray<ConjectureCounterexample>;
}

const TEXT_ENCODER = new TextEncoder();

export function buildConjectureStableKey(prefix: string, snapshot: unknown): string {
  if (!/^[a-z0-9][a-z0-9.-]*$/u.test(prefix)) {
    throw new Error('conjecture.v1: receipt key prefix must be lowercase dotted text');
  }
  return `${prefix}-sha-${sha256Bytes(TEXT_ENCODER.encode(stableStringify(snapshot)))}`;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function inferElementArity(elements: Uint32Array, explicit?: 3 | 4): 3 | 4 | null {
  if (explicit !== undefined) return explicit;
  if (elements.length > 0 && elements.length % 4 === 0) return 4;
  if (elements.length > 0 && elements.length % 3 === 0) return 3;
  return null;
}

function assertClaim(claim: ConjectureClaim): void {
  if (!nonEmptyString(claim.id)) throw new Error('conjecture.v1: claim.id must be non-empty');
  if (!nonEmptyString(claim.statement)) {
    throw new Error('conjecture.v1: claim.statement must be non-empty');
  }
  if (!nonEmptyString(claim.proposedBy)) {
    throw new Error('conjecture.v1: claim.proposedBy must be non-empty');
  }
  if (!['geometry.invariant', 'algebraic.trait', 'impossibility.boundary'].includes(claim.kind)) {
    throw new Error('conjecture.v1: claim.kind is not supported');
  }
  if (!Array.isArray(claim.assumptions)) {
    throw new Error('conjecture.v1: claim.assumptions must be an array');
  }
  if (!Array.isArray(claim.evidenceRefs) || claim.evidenceRefs.length === 0) {
    throw new Error('conjecture.v1: claim.evidenceRefs must be non-empty');
  }
  for (const ref of claim.evidenceRefs) {
    if (!nonEmptyString(ref)) {
      throw new Error('conjecture.v1: claim.evidenceRefs entries must be non-empty strings');
    }
  }
}

function assertCandidate(candidate: GeometryConjectureCandidate): void {
  if (!nonEmptyString(candidate.id)) {
    throw new Error('conjecture.v1: candidate.id must be non-empty');
  }
  if (!nonEmptyString(candidate.family)) {
    throw new Error('conjecture.v1: candidate.family must be non-empty');
  }
  if (candidate.vertices.length === 0 || candidate.vertices.length % 3 !== 0) {
    throw new Error('conjecture.v1: candidate.vertices must contain complete xyz triples');
  }
  const arity = inferElementArity(candidate.elements, candidate.elementArity);
  if (arity === null || candidate.elements.length % arity !== 0) {
    throw new Error('conjecture.v1: candidate.elements must contain complete primitives');
  }
  const vertexCount = candidate.vertices.length / 3;
  for (const index of candidate.elements) {
    if (index >= vertexCount) {
      throw new Error(`conjecture.v1: candidate.elements contains out-of-range index ${index}`);
    }
  }
}

function xyz(vertices: Float32Array | Float64Array, index: number): readonly [number, number, number] {
  const offset = index * 3;
  return [vertices[offset], vertices[offset + 1], vertices[offset + 2]];
}

function edgeLength(
  vertices: Float32Array | Float64Array,
  a: number,
  b: number,
): number {
  const av = xyz(vertices, a);
  const bv = xyz(vertices, b);
  return Math.hypot(av[0] - bv[0], av[1] - bv[1], av[2] - bv[2]);
}

function triangleArea(
  vertices: Float32Array | Float64Array,
  a: number,
  b: number,
  c: number,
): number {
  const av = xyz(vertices, a);
  const bv = xyz(vertices, b);
  const cv = xyz(vertices, c);
  const abx = bv[0] - av[0];
  const aby = bv[1] - av[1];
  const abz = bv[2] - av[2];
  const acx = cv[0] - av[0];
  const acy = cv[1] - av[1];
  const acz = cv[2] - av[2];
  const cx = aby * acz - abz * acy;
  const cy = abz * acx - abx * acz;
  const cz = abx * acy - aby * acx;
  return 0.5 * Math.hypot(cx, cy, cz);
}

function tetVolume(
  vertices: Float32Array | Float64Array,
  a: number,
  b: number,
  c: number,
  d: number,
): number {
  const av = xyz(vertices, a);
  const bv = xyz(vertices, b);
  const cv = xyz(vertices, c);
  const dv = xyz(vertices, d);
  const bax = bv[0] - av[0];
  const bay = bv[1] - av[1];
  const baz = bv[2] - av[2];
  const cax = cv[0] - av[0];
  const cay = cv[1] - av[1];
  const caz = cv[2] - av[2];
  const dax = dv[0] - av[0];
  const day = dv[1] - av[1];
  const daz = dv[2] - av[2];
  const crossX = cay * daz - caz * day;
  const crossY = caz * dax - cax * daz;
  const crossZ = cax * day - cay * dax;
  return Math.abs(bax * crossX + bay * crossY + baz * crossZ) / 6;
}

function edgeKey(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

function addTriEdges(edges: Set<string>, a: number, b: number, c: number): void {
  edges.add(edgeKey(a, b));
  edges.add(edgeKey(b, c));
  edges.add(edgeKey(c, a));
}

export function computeMeshFacts(
  candidate: GeometryConjectureCandidate,
  hashMode: HashMode = HASH_MODE_DEFAULT,
): MeshFacts {
  assertCandidate(candidate);

  const vertices = candidate.vertices;
  const elements = candidate.elements;
  const arity = inferElementArity(elements, candidate.elementArity);
  const vertexCount = vertices.length / 3;
  const elementCount = arity === null ? 0 : elements.length / arity;
  const edges = new Set<string>();

  let hasNonFiniteVertex = false;
  let minEdgeLength = Number.POSITIVE_INFINITY;
  let maxEdgeLength = 0;
  let minTriangleArea = arity === 3 ? Number.POSITIVE_INFINITY : null;
  let totalTriangleArea = arity === 3 ? 0 : null;
  let minTetVolume = arity === 4 ? Number.POSITIVE_INFINITY : null;

  for (const value of vertices) {
    if (!Number.isFinite(value)) hasNonFiniteVertex = true;
  }

  if (arity === 3) {
    for (let i = 0; i < elements.length; i += 3) {
      const a = elements[i];
      const b = elements[i + 1];
      const c = elements[i + 2];
      addTriEdges(edges, a, b, c);
      const ab = edgeLength(vertices, a, b);
      const bc = edgeLength(vertices, b, c);
      const ca = edgeLength(vertices, c, a);
      minEdgeLength = Math.min(minEdgeLength, ab, bc, ca);
      maxEdgeLength = Math.max(maxEdgeLength, ab, bc, ca);
      const area = triangleArea(vertices, a, b, c);
      minTriangleArea = Math.min(minTriangleArea ?? area, area);
      totalTriangleArea = (totalTriangleArea ?? 0) + area;
    }
  }

  if (arity === 4) {
    for (let i = 0; i < elements.length; i += 4) {
      const a = elements[i];
      const b = elements[i + 1];
      const c = elements[i + 2];
      const d = elements[i + 3];
      for (const [u, v] of [[a, b], [a, c], [a, d], [b, c], [b, d], [c, d]] as const) {
        edges.add(edgeKey(u, v));
        const len = edgeLength(vertices, u, v);
        minEdgeLength = Math.min(minEdgeLength, len);
        maxEdgeLength = Math.max(maxEdgeLength, len);
      }
      const volume = tetVolume(vertices, a, b, c, d);
      minTetVolume = Math.min(minTetVolume ?? volume, volume);
    }
  }

  const finiteMinEdge = Number.isFinite(minEdgeLength) ? minEdgeLength : null;
  const finiteMaxEdge = maxEdgeLength > 0 ? maxEdgeLength : null;
  const eulerCharacteristic = arity === 3
    ? vertexCount - edges.size + elementCount
    : null;

  return {
    geometryHash: hashGeometry(vertices, elements, hashMode),
    vertexCount,
    elementCount,
    elementArity: arity,
    hasNonFiniteVertex,
    minEdgeLength: finiteMinEdge,
    maxEdgeLength: finiteMaxEdge,
    minTriangleArea: minTriangleArea === Number.POSITIVE_INFINITY ? null : minTriangleArea,
    totalTriangleArea,
    minTetVolume: minTetVolume === Number.POSITIVE_INFINITY ? null : minTetVolume,
    eulerCharacteristic,
  };
}

export function nonDegenerateGeometryProbe(
  options: { minArea?: number; minVolume?: number } = {},
): ConjectureProbe {
  const minArea = options.minArea ?? 1e-12;
  const minVolume = options.minVolume ?? 1e-12;
  return {
    id: 'geometry.non_degenerate',
    description: 'Every primitive has non-zero area or volume under the configured tolerance.',
    evaluate(_candidate, facts): ProbeResult {
      if (facts.hasNonFiniteVertex) {
        return {
          probeId: 'geometry.non_degenerate',
          status: 'fail',
          message: 'candidate contains non-finite vertex coordinates',
        };
      }
      if (facts.elementArity === 3) {
        const area = facts.minTriangleArea;
        const pass = area !== null && area >= minArea;
        return {
          probeId: 'geometry.non_degenerate',
          status: pass ? 'pass' : 'fail',
          message: pass
            ? 'all triangles exceed the minimum area'
            : 'at least one triangle collapsed below the minimum area',
          measurements: { minTriangleArea: area, minArea },
        };
      }
      if (facts.elementArity === 4) {
        const volume = facts.minTetVolume;
        const pass = volume !== null && volume >= minVolume;
        return {
          probeId: 'geometry.non_degenerate',
          status: pass ? 'pass' : 'fail',
          message: pass
            ? 'all tetrahedra exceed the minimum volume'
            : 'at least one tetrahedron collapsed below the minimum volume',
          measurements: { minTetVolume: volume, minVolume },
        };
      }
      return {
        probeId: 'geometry.non_degenerate',
        status: 'inconclusive',
        message: 'unsupported element arity',
      };
    },
  };
}

export function geometryHashOrderInvariantProbe(
  hashMode: HashMode = HASH_MODE_DEFAULT,
): ConjectureProbe {
  return {
    id: 'geometry.hash_order_invariant',
    description: 'Reordering same-arity primitives preserves the geometry hash.',
    evaluate(candidate, facts): ProbeResult {
      const arity = facts.elementArity;
      if (arity === null) {
        return {
          probeId: 'geometry.hash_order_invariant',
          status: 'inconclusive',
          message: 'unsupported element arity',
        };
      }
      const reversed = new Uint32Array(candidate.elements.length);
      let write = 0;
      for (let start = candidate.elements.length - arity; start >= 0; start -= arity) {
        for (let j = 0; j < arity; j++) reversed[write++] = candidate.elements[start + j];
      }
      const reversedHash = hashGeometry(candidate.vertices, reversed, hashMode);
      const pass = reversedHash === facts.geometryHash;
      return {
        probeId: 'geometry.hash_order_invariant',
        status: pass ? 'pass' : 'fail',
        message: pass
          ? 'primitive order does not affect geometry hash'
          : 'primitive order changed the geometry hash',
        measurements: {
          originalHash: facts.geometryHash,
          reorderedHash: reversedHash,
        },
      };
    },
  };
}

export function eulerCharacteristicProbe(expected: number): ConjectureProbe {
  return {
    id: 'geometry.euler_characteristic',
    description: 'Triangle-surface Euler characteristic matches the expected invariant.',
    evaluate(_candidate, facts): ProbeResult {
      if (facts.eulerCharacteristic === null) {
        return {
          probeId: 'geometry.euler_characteristic',
          status: 'inconclusive',
          message: 'Euler characteristic is only computed for triangle surfaces',
        };
      }
      const pass = facts.eulerCharacteristic === expected;
      return {
        probeId: 'geometry.euler_characteristic',
        status: pass ? 'pass' : 'fail',
        message: pass
          ? 'Euler characteristic matched'
          : 'Euler characteristic falsified the expected invariant',
        measurements: { expected, actual: facts.eulerCharacteristic },
      };
    },
  };
}

function statusFromProbeResults(results: ReadonlyArray<ProbeResult>): ConjectureStatus {
  if (results.some((r) => r.status === 'fail')) return 'falsified';
  if (results.some((r) => r.status === 'inconclusive')) return 'inconclusive';
  return 'survived';
}

function overallStatus(evaluations: ReadonlyArray<CandidateEvaluation>): ConjectureStatus {
  if (evaluations.some((e) => e.status === 'falsified')) return 'falsified';
  if (evaluations.some((e) => e.status === 'inconclusive')) return 'inconclusive';
  return 'survived';
}

function candidateParameters(
  candidate: GeometryConjectureCandidate,
): Readonly<Record<string, ConjectureParameterValue>> {
  return candidate.parameters ?? {};
}

function receiptSnapshot(receipt: Omit<ConjectureReceipt, 'receiptKey'>): Record<string, unknown> {
  return {
    solverType: receipt.solverType,
    specVersion: receipt.specVersion,
    claim: {
      ...receipt.claim,
      assumptions: [...receipt.claim.assumptions].sort(),
      evidenceRefs: [...receipt.claim.evidenceRefs].sort(),
    },
    status: receipt.status,
    hashMode: receipt.hashMode,
    evaluations: receipt.evaluations,
    counterexamples: receipt.counterexamples,
  };
}

export function buildConjectureV1Receipt(input: {
  claim: ConjectureClaim;
  candidates: ReadonlyArray<GeometryConjectureCandidate>;
  probes: ReadonlyArray<ConjectureProbe>;
  hashMode?: HashMode;
}): ConjectureReceipt {
  assertClaim(input.claim);
  if (input.candidates.length === 0) {
    throw new Error('conjecture.v1: candidates must be non-empty');
  }
  if (input.probes.length === 0) {
    throw new Error('conjecture.v1: probes must be non-empty');
  }

  const hashMode = input.hashMode ?? HASH_MODE_DEFAULT;
  const evaluations = input.candidates.map((candidate): CandidateEvaluation => {
    assertCandidate(candidate);
    const facts = computeMeshFacts(candidate, hashMode);
    const probeResults = input.probes.map((probe) => probe.evaluate(candidate, facts));
    return {
      candidateId: candidate.id,
      family: candidate.family,
      semanticTags: [...(candidate.semanticTags ?? [])].sort(),
      parameters: candidateParameters(candidate),
      facts,
      probeResults,
      status: statusFromProbeResults(probeResults),
    };
  });

  const counterexamples = evaluations
    .filter((evaluation) => evaluation.status === 'falsified')
    .map((evaluation): ConjectureCounterexample => ({
      candidateId: evaluation.candidateId,
      family: evaluation.family,
      failedProbes: evaluation.probeResults.filter((result) => result.status === 'fail'),
      geometryHash: evaluation.facts.geometryHash,
    }));

  const withoutKey: Omit<ConjectureReceipt, 'receiptKey'> = {
    solverType: CONJECTURE_V1,
    specVersion: 1,
    claim: {
      ...input.claim,
      assumptions: [...input.claim.assumptions],
      evidenceRefs: [...input.claim.evidenceRefs],
    },
    status: overallStatus(evaluations),
    hashMode,
    evaluations,
    counterexamples,
  };

  return {
    ...withoutKey,
    receiptKey: buildConjectureStableKey(CONJECTURE_V1, receiptSnapshot(withoutKey)),
  };
}

export function createTetrahedronSurfaceCandidate(id = 'tetrahedron-surface'): GeometryConjectureCandidate {
  return {
    id,
    family: 'tetrahedron-surface',
    elementArity: 3,
    semanticTags: ['geometry', 'proof-carrying', 'closed-surface'],
    parameters: { expectedEulerCharacteristic: 2 },
    vertices: new Float64Array([
      0, 0, 0,
      1, 0, 0,
      0, 1, 0,
      0, 0, 1,
    ]),
    elements: new Uint32Array([
      0, 2, 1,
      0, 1, 3,
      1, 2, 3,
      2, 0, 3,
    ]),
  };
}

export function createSquareSheetCandidate(id = 'square-sheet'): GeometryConjectureCandidate {
  return {
    id,
    family: 'square-sheet',
    elementArity: 3,
    semanticTags: ['geometry', 'proof-carrying', 'open-surface'],
    parameters: { expectedEulerCharacteristic: 1 },
    vertices: new Float64Array([
      0, 0, 0,
      1, 0, 0,
      1, 1, 0,
      0, 1, 0,
    ]),
    elements: new Uint32Array([
      0, 1, 2,
      0, 2, 3,
    ]),
  };
}

export function createDegenerateTriangleCandidate(id = 'degenerate-triangle'): GeometryConjectureCandidate {
  return {
    id,
    family: 'degenerate-triangle',
    elementArity: 3,
    semanticTags: ['geometry', 'counterexample'],
    parameters: { collapse: 'collinear' },
    vertices: new Float64Array([
      0, 0, 0,
      1, 0, 0,
      2, 0, 0,
    ]),
    elements: new Uint32Array([0, 1, 2]),
  };
}
