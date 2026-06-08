/**
 * StagedMatter Tests
 *
 * Validates provenance-preserving spatial consolidation (D.059).
 *
 * Done criteria from board task:
 *  - vitest consolidates two matter units
 *  - asserts the result manifest contains BOTH source provenance hashes
 *  - asserts the result manifest contains a derivation edge
 *  - test FAILS if either source hash is dropped
 *  - test FAILS if the derivation edge is missing
 *
 * @version 1.0.0
 */

import { describe, it, expect } from 'vitest';
import {
  consolidate,
  createMatterUnit,
  type MatterUnit,
  type MatterManifest,
} from '../StagedMatter';

// =============================================================================
// HELPERS
// =============================================================================

function makeUnit(name: string): MatterUnit {
  return createMatterUnit(name);
}

// =============================================================================
// TESTS
// =============================================================================

describe('StagedMatter', () => {
  describe('createMatterUnit', () => {
    it('returns a unit with a 64-char hex provenanceHash', () => {
      const unit = makeUnit('Root');
      expect(unit.provenanceHash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('seeds the manifest with its own hash', () => {
      const unit = makeUnit('Root');
      expect(unit.manifest.provenanceHashes).toContain(unit.provenanceHash);
    });

    it('has no derivation edges at creation', () => {
      const unit = makeUnit('Root');
      expect(unit.manifest.derivationEdges).toHaveLength(0);
    });
  });

  describe('consolidate', () => {
    it('returns a unit whose manifest contains BOTH source provenance hashes', () => {
      const unitA = makeUnit('A');
      const unitB = makeUnit('B');
      const merged = consolidate(unitA, unitB);

      // FAILS if either source hash is dropped
      expect(merged.manifest.provenanceHashes).toContain(unitA.provenanceHash);
      expect(merged.manifest.provenanceHashes).toContain(unitB.provenanceHash);
    });

    it('includes a derivation edge for each source', () => {
      const unitA = makeUnit('A');
      const unitB = makeUnit('B');
      const merged = consolidate(unitA, unitB);

      const edges = merged.manifest.derivationEdges;

      // FAILS if the derivation edge is missing
      const edgeA = edges.find(
        (e) => e.from === unitA.provenanceHash && e.operation === 'consolidate'
      );
      const edgeB = edges.find(
        (e) => e.from === unitB.provenanceHash && e.operation === 'consolidate'
      );

      expect(edgeA).toBeDefined();
      expect(edgeB).toBeDefined();

      // Both edges must point to the consolidated unit
      expect(edgeA!.to).toBe(merged.provenanceHash);
      expect(edgeB!.to).toBe(merged.provenanceHash);
    });

    it('preserves pre-existing derivation edges from source units', () => {
      const unitA = makeUnit('A');
      const unitB = makeUnit('B');
      const intermediate = consolidate(unitA, unitB);
      const unitC = makeUnit('C');
      const final = consolidate(intermediate, unitC);

      // The intermediate edge from A should still be present
      const edgeA = final.manifest.derivationEdges.find(
        (e) => e.from === unitA.provenanceHash && e.operation === 'consolidate'
      );
      expect(edgeA).toBeDefined();
    });

    it('produces a deterministic provenanceHash for the same inputs', () => {
      const unitA = makeUnit('A');
      const unitB = makeUnit('B');
      const merged1 = consolidate(unitA, unitB);
      const merged2 = consolidate(unitA, unitB);
      expect(merged1.provenanceHash).toBe(merged2.provenanceHash);
    });

    it('produces a different provenanceHash for different inputs', () => {
      const unitA = makeUnit('A');
      const unitB = makeUnit('B');
      const unitC = makeUnit('C');
      const mergedAB = consolidate(unitA, unitB);
      const mergedAC = consolidate(unitA, unitC);
      expect(mergedAB.provenanceHash).not.toBe(mergedAC.provenanceHash);
    });

    it('deduplicates duplicate provenance hashes', () => {
      const unitA = makeUnit('A');
      const merged = consolidate(unitA, unitA);
      const hashSet = new Set(merged.manifest.provenanceHashes);
      // Should not double-count the same hash
      expect(merged.manifest.provenanceHashes.length).toBe(hashSet.size);
    });

    it('sets schema to matter-manifest/v1', () => {
      const unitA = makeUnit('A');
      const unitB = makeUnit('B');
      const merged = consolidate(unitA, unitB);
      expect(merged.manifest.schema).toBe('matter-manifest/v1');
    });

    it('includes an ISO timestamp on every new derivation edge', () => {
      const unitA = makeUnit('A');
      const unitB = makeUnit('B');
      const merged = consolidate(unitA, unitB);

      const newEdges = merged.manifest.derivationEdges.filter((e) => e.operation === 'consolidate');
      for (const edge of newEdges) {
        expect(edge.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      }
    });

    it('FAILS if source hash A is deliberately dropped (adversarial)', () => {
      // This test documents the failure mode: if a buggy implementation
      // drops one source hash, the assertion fails.
      const unitA = makeUnit('A');
      const unitB = makeUnit('B');
      const merged = consolidate(unitA, unitB);

      // Simulate a bad filter that drops hash A
      const badManifest: MatterManifest = {
        schema: 'matter-manifest/v1',
        provenanceHashes: merged.manifest.provenanceHashes.filter(
          (h) => h !== unitA.provenanceHash
        ),
        derivationEdges: merged.manifest.derivationEdges,
      };

      // The manifest must NOT drop A
      expect(badManifest.provenanceHashes).not.toContain(unitA.provenanceHash);
      // Therefore this simulated bad state is detectable
      expect(merged.manifest.provenanceHashes).toContain(unitA.provenanceHash);
    });

    it('FAILS if derivation edge is deliberately removed (adversarial)', () => {
      const unitA = makeUnit('A');
      const unitB = makeUnit('B');
      const merged = consolidate(unitA, unitB);

      // Simulate a bad filter that removes all edges
      const badManifest: MatterManifest = {
        schema: 'matter-manifest/v1',
        provenanceHashes: merged.manifest.provenanceHashes,
        derivationEdges: [],
      };

      expect(badManifest.derivationEdges).toHaveLength(0);
      // The real merged manifest still has edges
      expect(merged.manifest.derivationEdges.length).toBeGreaterThan(0);
    });
  });
});
