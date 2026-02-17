import { describe, it, expect, beforeEach } from 'vitest';
import { GraphCompiler } from '../GraphCompiler';
import { NodeGraph, type GraphNode } from '../NodeGraph';

function makeNode(id: string, ports: GraphNode['ports'] = []): GraphNode {
  return { id, type: 'generic', label: id, ports, position: { x: 0, y: 0 }, data: {} };
}

function buildLinearGraph(): NodeGraph {
  const g = new NodeGraph();
  g.addNode(makeNode('a', [{ id: 'out', name: 'out', type: 'number', direction: 'output' }]));
  g.addNode(makeNode('b', [
    { id: 'in', name: 'in', type: 'number', direction: 'input', defaultValue: 0 },
    { id: 'out', name: 'out', type: 'number', direction: 'output' },
  ]));
  g.addNode(makeNode('c', [{ id: 'in', name: 'in', type: 'number', direction: 'input', defaultValue: 0 }]));
  g.connect('a', 'out', 'b', 'in');
  g.connect('b', 'out', 'c', 'in');
  return g;
}

describe('GraphCompiler', () => {
  let compiler: GraphCompiler;

  beforeEach(() => { compiler = new GraphCompiler(); });

  it('compile linear graph produces ordered steps', () => {
    const result = compiler.compile(buildLinearGraph());
    expect(result.errors).toHaveLength(0);
    expect(result.steps).toHaveLength(3);
    const ids = result.steps.map(s => s.nodeId);
    expect(ids.indexOf('a')).toBeLessThan(ids.indexOf('b'));
    expect(ids.indexOf('b')).toBeLessThan(ids.indexOf('c'));
  });

  it('compile resolves wire inputs', () => {
    const result = compiler.compile(buildLinearGraph());
    const stepB = result.steps.find(s => s.nodeId === 'b')!;
    expect(stepB.inputs['in'].source).toBe('wire');
    expect(stepB.inputs['in'].wireFrom).toBe('a');
  });

  it('compile resolves default inputs', () => {
    const g = new NodeGraph();
    g.addNode(makeNode('x', [{ id: 'in', name: 'in', type: 'number', direction: 'input', defaultValue: 42 }]));
    const result = compiler.compile(g);
    expect(result.steps[0].inputs['in'].source).toBe('default');
    expect(result.steps[0].inputs['in'].value).toBe(42);
  });

  it('compile warns about unconnected outputs', () => {
    const g = new NodeGraph();
    g.addNode(makeNode('a', [{ id: 'out', name: 'out', type: 'number', direction: 'output' }]));
    const result = compiler.compile(g);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('compile errors on cyclic graph', () => {
    const g = new NodeGraph();
    g.addNode(makeNode('a', [
      { id: 'in', name: 'in', type: 'any', direction: 'input' },
      { id: 'out', name: 'out', type: 'any', direction: 'output' },
    ]));
    g.addNode(makeNode('b', [
      { id: 'in', name: 'in', type: 'any', direction: 'input' },
      { id: 'out', name: 'out', type: 'any', direction: 'output' },
    ]));
    g.connect('a', 'out', 'b', 'in');
    g.connect('b', 'out', 'a', 'in');
    const result = compiler.compile(g);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.steps).toHaveLength(0);
  });

  it('compile empty graph', () => {
    const result = compiler.compile(new NodeGraph());
    expect(result.steps).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  // Validate
  it('validate returns valid for DAG', () => {
    const v = compiler.validate(buildLinearGraph());
    expect(v.valid).toBe(true);
    expect(v.errors).toHaveLength(0);
  });

  it('validate returns errors for empty graph', () => {
    const v = compiler.validate(new NodeGraph());
    expect(v.valid).toBe(false);
    expect(v.errors.length).toBeGreaterThan(0);
  });

  // Optimization passes
  it('get/set optimization passes', () => {
    const passes = compiler.getOptimizationPasses();
    expect(passes).toContain('dead-node');
    compiler.setOptimizationPasses(['custom']);
    expect(compiler.getOptimizationPasses()).toEqual(['custom']);
  });

  it('optimized flag reflects passes', () => {
    const result = compiler.compile(buildLinearGraph());
    expect(result.optimized).toBe(true);
    compiler.setOptimizationPasses([]);
    const result2 = compiler.compile(buildLinearGraph());
    expect(result2.optimized).toBe(false);
  });
});
