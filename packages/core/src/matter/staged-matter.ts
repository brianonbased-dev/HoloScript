/**
 * Staged Matter Assembly — Stage 1: Provenance-preserving spatial consolidation
 * D.059 (PRODUCE -> SOLIDIFY -> RECURSE)
 *
 * Pure functions for combining produced matter units into consolidated units
 * without losing either source's provenance.
 */

export interface DerivationEdge {
  from: string;
  relation: 'consolidated' | 'produced' | 'transformed';
  timestamp: number;
}

export interface MatterManifest {
  /** Human-readable name of the unit */
  name: string;
  /** Tags describing the unit's role */
  tags: string[];
  /** All provenance hashes that contributed to this unit, including merged sources */
  provenanceHashes: string[];
  /** Derivation graph edges showing how this unit was constructed */
  derivationEdges: DerivationEdge[];
  /** Optional spatial bounds or coordinates */
  spatialBounds?: {
    min: [number, number, number];
    max: [number, number, number];
  };
  /** Optional payload — opaque to the consolidation layer */
  payload?: unknown;
}

export interface MatterUnit {
  /** Unique identifier for this unit */
  id: string;
  /** SHA-256 hash of this unit's canonical representation */
  provenanceHash: string;
  /** Manifest carrying merged provenance and derivation history */
  manifest: MatterManifest;
}

/**
 * Deterministic hash helper for unit identity.
 * In production this would use a real cryptographic hash; here we use
 * a stable string-hash so tests remain deterministic and fast.
 */
function stableHash(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function canonicalizeManifest(manifest: MatterManifest): string {
  return JSON.stringify({
    name: manifest.name,
    tags: [...manifest.tags].sort(),
    provenanceHashes: [...manifest.provenanceHashes].sort(),
    derivationEdges: [...manifest.derivationEdges].sort((a, b) => a.from.localeCompare(b.from)),
    spatialBounds: manifest.spatialBounds,
    payload: manifest.payload,
  });
}

function computeUnitHash(unit: MatterUnit): string {
  const canonical = JSON.stringify({
    id: unit.id,
    manifest: canonicalizeManifest(unit.manifest),
  });
  return stableHash(canonical);
}

function generateConsolidatedId(a: MatterUnit, b: MatterUnit): string {
  return `consolidated-${a.id}-${b.id}-${Date.now()}`;
}

/**
 * Consolidate two matter units into a single unit that preserves both
 * source provenance hashes and records derivation edges.
 *
 * @param unitA — first source unit
 * @param unitB — second source unit
 * @returns a new MatterUnit whose manifest contains both source hashes
 *          and whose derivationEdges link back to both inputs.
 */
export function consolidate(unitA: MatterUnit, unitB: MatterUnit): MatterUnit {
  const now = Date.now();
  const mergedProvenance = [
    unitA.provenanceHash,
    unitB.provenanceHash,
    ...unitA.manifest.provenanceHashes,
    ...unitB.manifest.provenanceHashes,
  ];
  // Deduplicate while preserving order of first appearance
  const provenanceHashes = Array.from(new Set(mergedProvenance));

  const derivationEdges: DerivationEdge[] = [
    ...unitA.manifest.derivationEdges,
    ...unitB.manifest.derivationEdges,
    { from: unitA.id, relation: 'consolidated', timestamp: now },
    { from: unitB.id, relation: 'consolidated', timestamp: now },
  ];

  const manifest: MatterManifest = {
    name: `consolidated(${unitA.manifest.name}, ${unitB.manifest.name})`,
    tags: Array.from(new Set([...unitA.manifest.tags, ...unitB.manifest.tags, 'consolidated'])),
    provenanceHashes,
    derivationEdges,
  };

  const consolidated: MatterUnit = {
    id: generateConsolidatedId(unitA, unitB),
    provenanceHash: '', // set after manifest is fixed
    manifest,
  };

  consolidated.provenanceHash = computeUnitHash(consolidated);
  return consolidated;
}
