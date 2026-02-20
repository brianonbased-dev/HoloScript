/**
 * AssetDependencyGraph — production test suite
 *
 * Tests: addDependency/getDependencies/getDependents (no asset required),
 * getTransitiveDependencies/Dependents, hasDependency (direct + transitive),
 * detectCycles (acyclic + cyclic), topologicalSort (load order),
 * resolve (ResolutionResult stats), getParallelLoadGroups,
 * removeAsset + removeDependency, getStats.
 * Also tests addAsset via createAssetMetadata factory.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AssetDependencyGraph } from '../AssetDependencyGraph';
import { createAssetMetadata } from '../AssetMetadata';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeAsset(id: string) {
  return createAssetMetadata({
    id,
    name: id,
    format: 'png',
    assetType: 'texture',
    sourcePath: `/assets/${id}.png`,
  });
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('AssetDependencyGraph: production', () => {
  let graph: AssetDependencyGraph;

  beforeEach(() => {
    graph = new AssetDependencyGraph();
  });

  // ─── addAsset ─────────────────────────────────────────────────────────────
  describe('addAsset via createAssetMetadata', () => {
    it('addAsset does not throw for minimal asset', () => {
      expect(() => graph.addAsset(makeAsset('a'))).not.toThrow();
    });

    it('addAssets handles multiple assets', () => {
      graph.addAssets([makeAsset('a'), makeAsset('b')]);
      expect(graph.getStats().nodeCount).toBeGreaterThanOrEqual(2);
    });
  });

  // ─── addDependency / getDependencies / getDependents ─────────────────────
  describe('addDependency / getDependencies / getDependents', () => {
    it('getDependencies returns direct deps', () => {
      graph.addDependency('a', 'b', true);
      expect(graph.getDependencies('a')).toContain('b');
    });

    it('getDependents returns reverse deps', () => {
      graph.addDependency('a', 'b', true);
      expect(graph.getDependents('b')).toContain('a');
    });

    it('returns empty array for asset with no dependencies', () => {
      graph.addDependency('solo', 'x', false);
      expect(graph.getDependencies('x')).toHaveLength(0);
    });
  });

  // ─── transitive deps ──────────────────────────────────────────────────────
  describe('getTransitiveDependencies / Dependents', () => {
    beforeEach(() => {
      graph.addDependency('a', 'b', true);
      graph.addDependency('b', 'c', true);
    });

    it('returns transitive deps for chain a→b→c', () => {
      const deps = graph.getTransitiveDependencies('a');
      expect(deps).toContain('b');
      expect(deps).toContain('c');
    });

    it('returns transitive dependents for chain a→b→c (from c)', () => {
      const deps = graph.getTransitiveDependents('c');
      expect(deps).toContain('b');
      expect(deps).toContain('a');
    });
  });

  // ─── hasDependency ────────────────────────────────────────────────────────
  describe('hasDependency', () => {
    it('true for direct dependency', () => {
      graph.addDependency('a', 'b', true);
      expect(graph.hasDependency('a', 'b')).toBe(true);
    });

    it('false for no dependency', () => {
      graph.addDependency('a', 'c', true);
      expect(graph.hasDependency('a', 'b')).toBe(false);
    });

    it('true for transitive dependency when transitive=true', () => {
      graph.addDependency('a', 'b', true);
      graph.addDependency('b', 'c', true);
      expect(graph.hasDependency('a', 'c', true)).toBe(true);
    });

    it('false for transitive dep when transitive=false', () => {
      graph.addDependency('a', 'b', true);
      graph.addDependency('b', 'c', true);
      expect(graph.hasDependency('a', 'c', false)).toBe(false);
    });
  });

  // ─── detectCycles ─────────────────────────────────────────────────────────
  describe('detectCycles', () => {
    it('returns empty array for acyclic graph', () => {
      graph.addDependency('a', 'b', true);
      expect(graph.detectCycles()).toHaveLength(0);
    });

    it('detects a direct cycle a→b→a', () => {
      graph.addDependency('a', 'b', true);
      graph.addDependency('b', 'a', true);
      expect(graph.detectCycles().length).toBeGreaterThan(0);
    });

    it('isAcyclic returns true for acyclic graph', () => {
      graph.addDependency('x', 'y', false);
      expect(graph.isAcyclic()).toBe(true);
    });

    it('isAcyclic returns false when cycle exists', () => {
      graph.addDependency('x', 'y', true);
      graph.addDependency('y', 'x', true);
      expect(graph.isAcyclic()).toBe(false);
    });
  });

  // ─── topologicalSort ──────────────────────────────────────────────────────
  describe('topologicalSort', () => {
    it('returns c before b before a in chain a→b→c', () => {
      graph.addDependency('a', 'b', true);
      graph.addDependency('b', 'c', true);
      const order = graph.topologicalSort();
      expect(order.indexOf('c')).toBeLessThan(order.indexOf('b'));
      expect(order.indexOf('b')).toBeLessThan(order.indexOf('a'));
    });

    it('includes all nodes', () => {
      graph.addDependency('x', 'y', true);
      const order = graph.topologicalSort();
      expect(order).toContain('x');
      expect(order).toContain('y');
    });
  });

  // ─── resolve ──────────────────────────────────────────────────────────────
  describe('resolve', () => {
    it('returns ResolutionResult with loadOrder array', () => {
      graph.addDependency('a', 'b', true);
      const result = graph.resolve();
      expect(Array.isArray(result.loadOrder)).toBe(true);
    });

    it('stats.totalAssets reflects node count', () => {
      graph.addDependency('a', 'b', true);
      const result = graph.resolve();
      expect(result.stats.totalAssets).toBeGreaterThanOrEqual(2);
    });

    it('hasCycles is false for acyclic graph', () => {
      graph.addDependency('a', 'b', false);
      expect(graph.resolve().stats.hasCycles).toBe(false);
    });

    it('hasCycles is true for cyclic graph', () => {
      graph.addDependency('a', 'b', true);
      graph.addDependency('b', 'a', true);
      expect(graph.resolve().stats.hasCycles).toBe(true);
    });
  });

  // ─── removeAsset / removeDependency ───────────────────────────────────────
  describe('removeAsset / removeDependency', () => {
    it('removeAsset removes it from deps of others', () => {
      graph.addDependency('a', 'b', true);
      graph.removeAsset('b');
      expect(graph.getDependencies('a')).not.toContain('b');
    });

    it('removeDependency removes only that edge', () => {
      graph.addDependency('a', 'b', true);
      graph.addDependency('a', 'c', true);
      graph.removeDependency('a', 'b');
      expect(graph.getDependencies('a')).not.toContain('b');
      expect(graph.getDependencies('a')).toContain('c');
    });
  });

  // ─── getParallelLoadGroups + getLoadOrderFor ──────────────────────────────
  describe('getParallelLoadGroups / getLoadOrderFor', () => {
    it('getParallelLoadGroups returns array of groups', () => {
      graph.addDependency('a', 'b', true);
      const groups = graph.getParallelLoadGroups();
      expect(Array.isArray(groups)).toBe(true);
    });

    it('getLoadOrderFor returns subset of assets', () => {
      graph.addDependency('a', 'b', true);
      const order = graph.getLoadOrderFor('a');
      expect(order).toContain('a');
      expect(order).toContain('b');
    });
  });

  // ─── getLeafNodes / getRootNodes ──────────────────────────────────────────
  describe('getLeafNodes / getRootNodes', () => {
    it('getLeafNodes returns assets with no dependencies', () => {
      graph.addDependency('a', 'b', true);
      expect(graph.getLeafNodes()).toContain('b'); // b has no deps
    });

    it('getRootNodes returns assets with no dependents', () => {
      graph.addDependency('a', 'b', true);
      expect(graph.getRootNodes()).toContain('a'); // a has no dependents
    });
  });

  // ─── getStats ─────────────────────────────────────────────────────────────
  describe('getStats', () => {
    it('nodeCount increases with added deps', () => {
      graph.addDependency('a', 'b', true);
      expect(graph.getStats().nodeCount).toBeGreaterThanOrEqual(2);
    });

    it('edgeCount reflects dependency count', () => {
      graph.addDependency('a', 'b', true);
      graph.addDependency('a', 'c', true);
      expect(graph.getStats().edgeCount).toBeGreaterThanOrEqual(2);
    });
  });
});
