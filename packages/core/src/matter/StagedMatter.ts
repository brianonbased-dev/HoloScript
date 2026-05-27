/**
 * StagedMatter — Provenance-preserving spatial consolidation (D.059)
 *
 * Stage 0 (H2) DONE. This module implements the next step:
 * provenance-preserving spatial consolidation — combining two produced
 * matter units into one consolidated unit WITHOUT losing either source's
 * provenance.
 *
 * Design:
 *  - Pure functions only (no side effects, deterministic output).
 *  - Every consolidated unit carries a merged manifest with ALL source
 *    provenance hashes and explicit derivation edges.
 *  - The consolidated provenance hash is a deterministic function of the
 *    merged manifest, making the unit content-addressable and verifiable.
 *
 * @module StagedMatter
 * @version 1.0.0
 */

// =============================================================================
// TYPES
// =============================================================================

/**
 * A derivation edge records that a unit was produced from one or more
 * source units via a named operation.
 */
export interface DerivationEdge {
  /** Provenance hash of the source unit. */
  from: string;
  /** Provenance hash of the resulting unit. */
  to: string;
  /** Operation that produced the derivation (e.g. 'consolidate'). */
  operation: string;
  /** ISO 8601 timestamp of when the edge was created. */
  timestamp: string;
}

/**
 * Manifest attached to every matter unit. The manifest is the
 * provenance-bearing payload: it lists all source hashes and every
 * derivation edge that contributed to this unit's existence.
 */
export interface MatterManifest {
  /** Ordered list of source provenance hashes (deduplicated, sorted). */
  provenanceHashes: string[];
  /** Complete derivation graph for this unit. */
  derivationEdges: DerivationEdge[];
  /** Schema version for forward-compatibility. */
  schema: 'matter-manifest/v1';
}

/**
 * A matter unit is the atom of staged matter assembly. It has a stable
 * provenance hash (content-addressable) and a manifest that explains
 * exactly how it was produced or consolidated.
 */
export interface MatterUnit {
  /** Stable deterministic ID. */
  id: string;
  /** SHA-256 hex provenance hash of this unit's manifest + payload. */
  provenanceHash: string;
  /** Provenance manifest carrying source hashes and derivation edges. */
  manifest: MatterManifest;
  /** Optional spatial payload — can be empty for abstract units. */
  payload?: unknown;
}

// =============================================================================
// CONSOLIDATION
// =============================================================================

/**
 * Consolidate two matter units into a single unit whose manifest
 * preserves BOTH source provenance hashes and records explicit
 * derivation edges.
 *
 * The returned unit is content-addressable: its provenanceHash is a
 * deterministic function of the merged manifest, so re-consolidating
 * the same pair always yields the same hash.
 *
 * @param unitA — First source matter unit.
 * @param unitB — Second source matter unit.
 * @returns A new matter unit representing the spatial consolidation of A and B.
 */
export function consolidate(unitA: MatterUnit, unitB: MatterUnit): MatterUnit {
  const now = new Date().toISOString();

  // ── Merge provenance hashes (deduplicated, sorted, stable order) ──
  const mergedHashes = Array.from(
    new Set([...unitA.manifest.provenanceHashes, ...unitB.manifest.provenanceHashes])
  ).sort();

  // Ensure the direct source hashes of A and B are present even if they
  // were not recorded in their own manifests (defensive for root units).
  if (!mergedHashes.includes(unitA.provenanceHash)) {
    mergedHashes.push(unitA.provenanceHash);
  }
  if (!mergedHashes.includes(unitB.provenanceHash)) {
    mergedHashes.push(unitB.provenanceHash);
  }
  mergedHashes.sort();

  // ── Build new derivation edges for this consolidation step ──
  // Use empty strings for `to` and `timestamp` during hash computation so the
  // hash is a pure function of (unitA, unitB) and does not change across calls.
  // Both fields are filled in after the result hash is known.
  const newEdgeA: DerivationEdge = {
    from: unitA.provenanceHash,
    to: '',
    operation: 'consolidate',
    timestamp: '',
  };
  const newEdgeB: DerivationEdge = {
    from: unitB.provenanceHash,
    to: '',
    operation: 'consolidate',
    timestamp: '',
  };

  // ── Compute content-addressable provenance hash ──
  // Hash is computed from a canonical manifest with stable (empty) to/timestamp
  // fields so that consolidate(A, B) always yields the same provenanceHash.
  const hashManifest: MatterManifest = {
    schema: 'matter-manifest/v1',
    provenanceHashes: mergedHashes,
    derivationEdges: [
      ...unitA.manifest.derivationEdges,
      ...unitB.manifest.derivationEdges,
      newEdgeA,
      newEdgeB,
    ],
  };
  const resultHash = computeProvenanceHash(hashManifest);

  // Fill in the non-deterministic fields after the hash is fixed.
  newEdgeA.to = resultHash;
  newEdgeA.timestamp = now;
  newEdgeB.to = resultHash;
  newEdgeB.timestamp = now;

  const finalManifest: MatterManifest = {
    schema: 'matter-manifest/v1',
    provenanceHashes: mergedHashes,
    derivationEdges: [
      ...unitA.manifest.derivationEdges,
      ...unitB.manifest.derivationEdges,
      newEdgeA,
      newEdgeB,
    ],
  };

  return {
    id: `cons_${resultHash.slice(0, 16)}`,
    provenanceHash: resultHash,
    manifest: finalManifest,
    payload: undefined,
  };
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Deterministic content hash of a MatterManifest.
 *
 * Uses the same FNV-1a-inspired rolling hash as SpatialPartitionPass
 * so the ecosystem has a single lightweight hash convention for
 * non-cryptographic provenance addressing.
 */
function computeProvenanceHash(manifest: MatterManifest, salt?: string): string {
  const input = (salt ?? '') + JSON.stringify(manifest, Object.keys(manifest).sort());
  let h0 = 0x811c9dc5;
  let h1 = 0xd1e4a9f3;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h0 = Math.imul(h0 ^ c, 0x01000193) >>> 0;
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
  }
  const hex0 = h0.toString(16).padStart(8, '0');
  const hex1 = h1.toString(16).padStart(8, '0');
  return (hex0 + hex1).repeat(4).slice(0, 64);
}

// =============================================================================
// FACTORY
// =============================================================================

/**
 * Create a root matter unit (no prior derivation edges).
 *
 * @param id — Human-readable identifier.
 * @param payload — Optional spatial or semantic payload.
 * @returns A matter unit whose provenance hash is self-referential.
 */
export function createMatterUnit(id: string, payload?: unknown): MatterUnit {
  const manifest: MatterManifest = {
    schema: 'matter-manifest/v1',
    provenanceHashes: [],
    derivationEdges: [],
  };
  const hash = computeProvenanceHash(manifest, id);
  return {
    id,
    provenanceHash: hash,
    manifest: {
      ...manifest,
      provenanceHashes: [hash],
    },
    payload,
  };
}
