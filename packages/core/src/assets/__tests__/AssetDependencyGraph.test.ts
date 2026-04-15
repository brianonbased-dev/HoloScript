import { describe, it, expect, beforeEach } from 'vitest';
import { AssetDependencyGraph, createDependencyGraph } from '../AssetDependencyGraph';

// Minimal mock for AssetMetadata — only fields used by AssetDependencyGraph
function makeAsset(
  id: string,
  deps: Array<{ assetId: string; required: boolean }> = [],
  textures: string[] = [],
  shaders: string[] = []
) {
  return {
    id,
    dependencies: deps,
    textureDependencies: textures,
    shaderDependencies: shaders,
  } as any;
}

describe('AssetDependencyGraph', () => {
  let graph: AssetDependencyGraph;

  beforeEach(() => {
    graph = new AssetDependencyGraph();
  });

  it('addDependency and getDependencies', () => {
    graph.addDependency('A', 'B', true);
    expect(graph.getDependencies('A')).toContain('B');
    expect(graph.getDependents('B')).toContain('A');
  });

  it('removeDependency', () => {
    graph.addDependency('A', 'B', false);
    graph.removeDependency('A', 'B');
    expect(graph.getDependencies('A')).not.toContain('B');
  });

  it('addAsset registers asset and its deps', () => {
    graph.addAsset(makeAsset('model1', [{ assetId: 'texture1', required: true }]));
    expect(graph.getDependencies('model1')).toContain('texture1');
  });

  it('addAsset registers texture and shader deps', () => {
    graph.addAsset(makeAsset('model1', [], ['tex1', 'tex2'], ['shader1']));
    const deps = graph.getDependencies('model1');
    expect(deps).toContain('tex1');
    expect(deps).toContain('tex2');
    expect(deps).toContain('shader1');
  });

  it('removeAsset cleans up all edges', () => {
    graph.addDependency('A', 'B', true);
    graph.addDependency('C', 'B', true);
    graph.removeAsset('B');
    expect(graph.getDependencies('A')).not.toContain('B');
  });

  it('getTransitiveDependencies traverses deep', () => {
    graph.addDependency('A', 'B', true);
    graph.addDependency('B', 'C', true);
    graph.addDependency('C', 'D', true);
    const trans = graph.getTransitiveDependencies('A');
    expect(trans).toContain('B');
    expect(trans).toContain('C');
    expect(trans).toContain('D');
  });

  it('hasDependency works for direct and transitive', () => {
    graph.addDependency('A', 'B', true);
    graph.addDependency('B', 'C', true);
    expect(graph.hasDependency('A', 'B')).toBe(true);
    expect(graph.hasDependency('A', 'C')).toBe(false); // not direct
    expect(graph.hasDependency('A', 'C', true)).toBe(true); // transitive
  });

  it('detectCycles finds circular deps', () => {
    graph.addDependency('A', 'B', true);
    graph.addDependency('B', 'C', true);
    graph.addDependency('C', 'A', true);
    const cycles = graph.detectCycles();
    expect(cycles.length).toBeGreaterThan(0);
    expect(graph.isAcyclic()).toBe(false);
  });

  it('isAcyclic returns true for DAG', () => {
    graph.addDependency('A', 'B', true);
    graph.addDependency('B', 'C', true);
    expect(graph.isAcyclic()).toBe(true);
  });

  it('topologicalSort puts deps before dependents', () => {
    graph.addDependency('A', 'B', true);
    graph.addDependency('B', 'C', true);
    const order = graph.topologicalSort();
    expect(order.indexOf('C')).toBeLessThan(order.indexOf('B'));
    expect(order.indexOf('B')).toBeLessThan(order.indexOf('A'));
  });

  it('getLeafNodes and getRootNodes', () => {
    graph.addDependency('A', 'B', true);
    graph.addDependency('B', 'C', true);
    expect(graph.getLeafNodes()).toContain('C');
    expect(graph.getRootNodes()).toContain('A');
  });

  it('resolve returns loadOrder with stats', () => {
    graph.addAsset(makeAsset('A', [{ assetId: 'B', required: true }]));
    graph.addAsset(makeAsset('B', []));
    const result = graph.resolve();
    expect(result.loadOrder.indexOf('B')).toBeLessThan(result.loadOrder.indexOf('A'));
    expect(result.stats.totalAssets).toBe(2);
    expect(result.stats.hasCycles).toBe(false);
  });

  it('clear empties the graph', () => {
    graph.addDependency('A', 'B', true);
    graph.clear();
    expect(graph.getDependencies('A')).toEqual([]);
  });

  it('exportDot outputs valid DOT format', () => {
    graph.addDependency('A', 'B', true);
    const dot = graph.exportDot();
    expect(dot).toContain('digraph');
    expect(dot).toContain('->');
  });

  it('createDependencyGraph factory', () => {
    const g = createDependencyGraph();
    expect(g).toBeInstanceOf(AssetDependencyGraph);
  });

  it('getParallelLoadGroups groups by depth', () => {
    graph.addDependency('A', 'B', true);
    graph.addDependency('A', 'C', true);
    const groups = graph.getParallelLoadGroups();
    expect(groups.length).toBeGreaterThan(0);
  });
});
