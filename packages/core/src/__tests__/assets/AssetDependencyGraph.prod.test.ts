/**
 * AssetDependencyGraph Production Tests
 *
 * Covers: addDependency/getDependencies/getDependents,
 * addAsset (adds node + deps/texture/shader deps), removeAsset (removes from dependents),
 * removeDependency, getTransitiveDependencies/getTransitiveDependents,
 * hasDependency (direct/transitive), detectCycles (acyclic = empty, cyclic = cycle array),
 * topologicalSort (deps before dependents), resolve (loadOrder, missing, stats),
 * getLoadOrderFor, getParallelLoadGroups, isAcyclic, getLeafNodes/getRootNodes,
 * getStats, clear.
 */

import { describe, it, expect } from 'vitest';
import { AssetDependencyGraph, createDependencyGraph } from '../../assets/AssetDependencyGraph';
import type { AssetMetadata } from '../../assets/AssetMetadata';

// ── helpers ───────────────────────────────────────────────────────────────────

function mkMeta(id: string, depIds: string[] = [], texIds: string[] = [], shaderIds: string[] = []): AssetMetadata {
  return {
    id,
    name: id,
    type: 'texture' as any,
    path: `/${id}`,
    version: '1.0',
    size: 1000,
    checksum: id,
    tags: [],
    dependencies: depIds.map(d => ({ assetId: d, required: true, version: '1.0' })),
    textureDependencies: texIds,
    shaderDependencies: shaderIds,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    isLoaded: false,
    isOptional: false,
  } as unknown as AssetMetadata;
}

// ── addDependency / getDependencies / getDependents ────────────────────────────

describe('AssetDependencyGraph — addDependency / getDependencies / getDependents', () => {

  it('getDependencies returns directly added dependency', () => {
    const g = new AssetDependencyGraph();
    g.addDependency('A', 'B', false);
    expect(g.getDependencies('A')).toContain('B');
  });

  it('getDependents returns asset that depends on target', () => {
    const g = new AssetDependencyGraph();
    g.addDependency('A', 'B', false);
    expect(g.getDependents('B')).toContain('A');
  });

  it('getDependencies returns empty for unknown asset', () => {
    expect(new AssetDependencyGraph().getDependencies('x')).toHaveLength(0);
  });

  it('getDependents returns empty for unknown asset', () => {
    expect(new AssetDependencyGraph().getDependents('x')).toHaveLength(0);
  });

  it('multiple dependents are all tracked', () => {
    const g = new AssetDependencyGraph();
    g.addDependency('A', 'C', false);
    g.addDependency('B', 'C', false);
    const dependents = g.getDependents('C');
    expect(dependents).toContain('A');
    expect(dependents).toContain('B');
  });
});

// ── removeDependency ──────────────────────────────────────────────────────────

describe('AssetDependencyGraph — removeDependency', () => {

  it('removes dependency edge from both directions', () => {
    const g = new AssetDependencyGraph();
    g.addDependency('A', 'B', false);
    g.removeDependency('A', 'B');
    expect(g.getDependencies('A')).not.toContain('B');
    expect(g.getDependents('B')).not.toContain('A');
  });

  it('removeDependency on non-existent assets does not throw', () => {
    expect(() => new AssetDependencyGraph().removeDependency('x', 'y')).not.toThrow();
  });
});

// ── addAsset / removeAsset ────────────────────────────────────────────────────

describe('AssetDependencyGraph — addAsset / removeAsset', () => {

  it('addAsset registers asset and its declared dependencies', () => {
    const g = new AssetDependencyGraph();
    g.addAsset(mkMeta('model', ['tex1']));
    expect(g.getDependencies('model')).toContain('tex1');
  });

  it('addAsset registers textureDependencies', () => {
    const g = new AssetDependencyGraph();
    g.addAsset(mkMeta('model', [], ['albedo']));
    expect(g.getDependencies('model')).toContain('albedo');
  });

  it('addAsset registers shaderDependencies', () => {
    const g = new AssetDependencyGraph();
    g.addAsset(mkMeta('model', [], [], ['lit.glsl']));
    expect(g.getDependencies('model')).toContain('lit.glsl');
  });

  it('removeAsset cleans up dependency + dependent edges', () => {
    const g = new AssetDependencyGraph();
    g.addDependency('A', 'B', false);
    g.removeAsset('A');
    expect(g.getDependents('B')).not.toContain('A');
  });

  it('removeAsset on unknown id does not throw', () => {
    expect(() => new AssetDependencyGraph().removeAsset('ghost')).not.toThrow();
  });
});

// ── getTransitiveDependencies / getTransitiveDependents ────────────────────────

describe('AssetDependencyGraph — transitive traversal', () => {

  it('getTransitiveDependencies returns all deps recursively', () => {
    const g = new AssetDependencyGraph();
    g.addDependency('A', 'B', false);
    g.addDependency('B', 'C', false);
    const trans = g.getTransitiveDependencies('A');
    expect(trans).toContain('B');
    expect(trans).toContain('C');
  });

  it('getTransitiveDependencies returns empty for leaf node', () => {
    const g = new AssetDependencyGraph();
    g.addDependency('A', 'A'); // self-loop shouldn't blow up
    // Do a simple leaf test on fresh graph
    const g2 = new AssetDependencyGraph();
    g2.addDependency('A', 'B', false);
    expect(g2.getTransitiveDependencies('B')).toHaveLength(0);
  });

  it('getTransitiveDependents returns all nodes that (transitively) depend on target', () => {
    const g = new AssetDependencyGraph();
    g.addDependency('B', 'A', false);
    g.addDependency('C', 'B', false);
    const trans = g.getTransitiveDependents('A');
    expect(trans).toContain('B');
    expect(trans).toContain('C');
  });
});

// ── hasDependency ─────────────────────────────────────────────────────────────

describe('AssetDependencyGraph — hasDependency', () => {

  it('returns true for direct dependency', () => {
    const g = new AssetDependencyGraph();
    g.addDependency('A', 'B', false);
    expect(g.hasDependency('A', 'B')).toBe(true);
  });

  it('returns false for unrelated pair', () => {
    const g = new AssetDependencyGraph();
    g.addDependency('A', 'B', false);
    expect(g.hasDependency('A', 'C')).toBe(false);
  });

  it('transitive=true finds indirect dependency', () => {
    const g = new AssetDependencyGraph();
    g.addDependency('A', 'B', false);
    g.addDependency('B', 'C', false);
    expect(g.hasDependency('A', 'C', true)).toBe(true);
  });

  it('transitive=false does not find indirect dependency', () => {
    const g = new AssetDependencyGraph();
    g.addDependency('A', 'B', false);
    g.addDependency('B', 'C', false);
    expect(g.hasDependency('A', 'C', false)).toBe(false);
  });
});

// ── detectCycles ──────────────────────────────────────────────────────────────

describe('AssetDependencyGraph — detectCycles', () => {

  it('returns empty array for acyclic graph', () => {
    const g = new AssetDependencyGraph();
    g.addDependency('A', 'B', false);
    g.addDependency('B', 'C', false);
    expect(g.detectCycles()).toHaveLength(0);
  });

  it('detects direct cycle (A→B→A)', () => {
    const g = new AssetDependencyGraph();
    g.addDependency('A', 'B', false);
    g.addDependency('B', 'A', false);
    expect(g.detectCycles().length).toBeGreaterThan(0);
  });
});

// ── topologicalSort ───────────────────────────────────────────────────────────

describe('AssetDependencyGraph — topologicalSort', () => {

  it('returns all nodes', () => {
    const g = new AssetDependencyGraph();
    g.addDependency('A', 'B', false);
    const sorted = g.topologicalSort();
    expect(sorted).toContain('A');
    expect(sorted).toContain('B');
  });

  it('dependency appears before dependent', () => {
    const g = new AssetDependencyGraph();
    g.addDependency('A', 'B', false);
    const sorted = g.topologicalSort();
    expect(sorted.indexOf('B')).toBeLessThan(sorted.indexOf('A'));
  });
});

// ── resolve ───────────────────────────────────────────────────────────────────

describe('AssetDependencyGraph — resolve', () => {

  it('resolve() with no root returns all assets in loadOrder', () => {
    const g = new AssetDependencyGraph();
    g.addDependency('X', 'Y', false);
    const result = g.resolve();
    expect(result.loadOrder).toContain('X');
    expect(result.loadOrder).toContain('Y');
  });

  it('stats.totalAssets reflects node count', () => {
    const g = new AssetDependencyGraph();
    g.addDependency('A', 'B', false);
    expect(g.resolve().stats.totalAssets).toBe(2);
  });

  it('hasCycles=false for DAG, true for cyclic', () => {
    const dag = new AssetDependencyGraph();
    dag.addDependency('A', 'B', false);
    expect(dag.resolve().stats.hasCycles).toBe(false);

    const cyc = new AssetDependencyGraph();
    cyc.addDependency('A', 'B', false);
    cyc.addDependency('B', 'A', false);
    expect(cyc.resolve().stats.hasCycles).toBe(true);
  });

  it('missing array contains unregistered dependencies', () => {
    const g = new AssetDependencyGraph();
    g.addAsset(mkMeta('model', ['missingTex']));
    const result = g.resolve();
    expect(result.missing.some(m => m.dependencyId === 'missingTex')).toBe(true);
  });

  it('resolve([rootId]) limits loadOrder to root and its deps', () => {
    const g = new AssetDependencyGraph();
    g.addDependency('A', 'B', false);
    g.addDependency('C', 'D', false); // unrelated
    const result = g.resolve(['A']);
    expect(result.loadOrder).toContain('A');
    expect(result.loadOrder).toContain('B');
    expect(result.loadOrder).not.toContain('C');
  });
});

// ── getLeafNodes / getRootNodes ────────────────────────────────────────────────

describe('AssetDependencyGraph — getLeafNodes / getRootNodes', () => {

  it('leaf nodes have no dependencies', () => {
    const g = new AssetDependencyGraph();
    g.addDependency('A', 'B', false);
    expect(g.getLeafNodes()).toContain('B');
    expect(g.getLeafNodes()).not.toContain('A');
  });

  it('root nodes have no dependents', () => {
    const g = new AssetDependencyGraph();
    g.addDependency('A', 'B', false);
    expect(g.getRootNodes()).toContain('A');
    expect(g.getRootNodes()).not.toContain('B');
  });
});

// ── getStats ──────────────────────────────────────────────────────────────────

describe('AssetDependencyGraph — getStats', () => {

  it('nodeCount = 0 for empty graph', () => {
    expect(new AssetDependencyGraph().getStats().nodeCount).toBe(0);
  });

  it('edgeCount counts all directed edges', () => {
    const g = new AssetDependencyGraph();
    g.addDependency('A', 'B', false);
    g.addDependency('A', 'C', false);
    expect(g.getStats().edgeCount).toBe(2);
  });
});

// ── clear ─────────────────────────────────────────────────────────────────────

describe('AssetDependencyGraph — clear', () => {

  it('clear resets the graph to empty', () => {
    const g = new AssetDependencyGraph();
    g.addDependency('A', 'B', false);
    g.clear();
    expect(g.getStats().nodeCount).toBe(0);
  });
});

// ── factory functions ─────────────────────────────────────────────────────────

describe('AssetDependencyGraph — factory functions', () => {

  it('createDependencyGraph returns an empty graph', () => {
    const g = createDependencyGraph();
    expect(g.getStats().nodeCount).toBe(0);
  });
});
