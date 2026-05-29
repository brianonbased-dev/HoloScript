/**
 * RenderManifold — the RENDER leg of the Conjecture Engine.
 *
 * A render manifold is the deterministic, receipt-carrying visible geometry
 * surface derived from a conjecture run's proof-carrying receipts. The runner
 * emits discover/prove/RENDER as the full triple under one deterministic
 * receipt (the paper's core novelty thesis: vs LeanConjecturer / AlphaEvolve /
 * FunSearch covering one leg each).
 *
 * The render-manifold artifact carries:
 *   - The vertex and element data from each surviving candidate
 *   - A deterministic SHA-256 invariant-probe hash over the manifold geometry
 *   - Replay guarantee: same input -> identical hash (F.069)
 *
 * @module RenderManifold
 */

import { hashGeometry, type HashMode } from './hashes';
import { sha256Bytes } from './sha256';
import { stableStringify } from './equivalenceRecord';
import type {
  ConjectureReceipt,
  GeometryConjectureCandidate,
  ConjectureStatus,
} from './ConjectureEngine';

export const RENDER_MANIFOLD_V1 = 'conjecture.render-manifold.v1' as const;
export type RenderManifoldSolverType = typeof RENDER_MANIFOLD_V1;

/** A single rendered surface derived from one receipt's geometry. */
export interface RenderedSurface {
  candidateId: string;
  family: string;
  status: ConjectureStatus;
  /** Deterministic geometry hash (via hashGeometry). */
  geometryHash: string;
  vertexCount: number;
  elementCount: number;
  elementArity: 3 | 4 | null;
  /** SHA-256 of the canonical (vertices, elements) pair — replay-deterministic. */
  surfaceDigest: string;
}

/** The RENDER leg output: a receipt-carrying render manifold. */
export interface RenderManifoldArtifact {
  solverType: RenderManifoldSolverType;
  specVersion: 1;
  /** Which runner receipt key this manifold was derived from. */
  sourceReceiptKey: string;
  /** The rendered surfaces, one per surviving/falsified candidate. */
  surfaces: ReadonlyArray<RenderedSurface>;
  /** Deterministic SHA-256 invariant-probe hash over the entire manifold. */
  invariantProbeHash: string;
  /** The hash mode used (mirrors the runner's hashMode). */
  hashMode: HashMode;
  /** Deterministic receipt key for the manifold artifact itself. */
  receiptKey: string;
}

/**
 * Derive a render-manifold artifact from a set of conjecture receipts.
 *
 * Each receipt's candidate geometry is rendered into a surface with a
 * deterministic SHA-256 surface digest. The overall manifold gets an
 * invariant-probe hash that is replay-deterministic: same inputs always
 * produce the same hash (F.069).
 */
export function renderManifoldFromReceipts(
  receipts: ReadonlyArray<ConjectureReceipt>,
  candidates: ReadonlyArray<ReadonlyArray<GeometryConjectureCandidate>>,
  hashMode: HashMode = 'sha256',
): RenderManifoldArtifact {
  const surfaces: RenderedSurface[] = [];

  for (let r = 0; r < receipts.length; r++) {
    const receipt = receipts[r];
    const receiptCandidates = candidates[r] ?? [];

    for (const evaluation of receipt.evaluations) {
      // Find the matching candidate for geometry data
      const candidate = receiptCandidates.find(
        (c) => c.id === evaluation.candidateId,
      );

      // For surviving/falsified candidates with geometry, build a rendered surface
      if (
        evaluation.status === 'survived' ||
        evaluation.status === 'falsified' ||
        evaluation.status === 'rediscovered' ||
        evaluation.status === 'undecided'
      ) {
        const geometryHash = evaluation.facts.geometryHash;
        const vertexCount = evaluation.facts.vertexCount;
        const elementCount = evaluation.facts.elementCount;
        const elementArity = evaluation.facts.elementArity;

        // Compute surface digest from candidate geometry (deterministic)
        let surfaceDigest: string;
        if (candidate) {
          surfaceDigest = hashGeometry(candidate.vertices, candidate.elements, hashMode);
        } else {
          // Fallback: use the geometry hash from facts as the surface digest
          surfaceDigest = geometryHash;
        }

        surfaces.push({
          candidateId: evaluation.candidateId,
          family: evaluation.family,
          status: evaluation.status,
          geometryHash,
          vertexCount,
          elementCount,
          elementArity,
          surfaceDigest,
        });
      }
    }
  }

  // Sort surfaces deterministically by candidateId for replay determinism
  surfaces.sort((a, b) => a.candidateId.localeCompare(b.candidateId));

  // Compute the invariant-probe hash over the entire manifold
  const manifoldSnapshot = {
    solverType: RENDER_MANIFOLD_V1,
    specVersion: 1,
    surfaces: surfaces.map((s) => ({
      id: s.candidateId,
      family: s.family,
      status: s.status,
      geometryHash: s.geometryHash,
      surfaceDigest: s.surfaceDigest,
      vertexCount: s.vertexCount,
      elementCount: s.elementCount,
      elementArity: s.elementArity,
    })),
  };

  const invariantProbeHash = `sha-${sha256Bytes(new TextEncoder().encode(stableStringify(manifoldSnapshot)))}`;
  const sourceReceiptKey = receipts.length > 0 ? receipts[0].receiptKey : 'no-receipt';

  const withoutKey = {
    solverType: RENDER_MANIFOLD_V1,
    specVersion: 1 as const,
    sourceReceiptKey,
    surfaces,
    invariantProbeHash,
    hashMode,
  };

  return {
    ...withoutKey,
    receiptKey: `conjecture.render-manifold.v1-${invariantProbeHash}`,
  };
}

/**
 * Replay-determinism check: run the manifold twice with the same inputs and
 * verify the invariant-probe hash is identical.
 *
 * Returns true if the manifold is replay-deterministic (F.069 guarantee).
 */
export function verifyRenderManifoldReplay(
  receipts: ReadonlyArray<ConjectureReceipt>,
  candidates: ReadonlyArray<ReadonlyArray<GeometryConjectureCandidate>>,
  hashMode: HashMode = 'sha256',
): { passed: boolean; firstHash: string; secondHash: string } {
  const first = renderManifoldFromReceipts(receipts, candidates, hashMode);
  const second = renderManifoldFromReceipts(receipts, candidates, hashMode);

  return {
    passed: first.invariantProbeHash === second.invariantProbeHash && first.receiptKey === second.receiptKey,
    firstHash: first.invariantProbeHash,
    secondHash: second.invariantProbeHash,
  };
}