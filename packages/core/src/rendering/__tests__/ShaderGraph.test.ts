import { describe, it, expect, beforeEach } from 'vitest';
import { ShaderGraph, SHADER_NODES } from '../ShaderGraph';

describe('ShaderGraph', () => {
  let graph: ShaderGraph;

  beforeEach(() => {
    graph = new ShaderGraph('test');
  });

  it('constructor assigns id', () => {
    expect(graph.id).toBe('test');
  });

  // Nodes
  it('addNode creates shader node', () => {
    const node = graph.addNode('Color');
    expect(node).not.toBeNull();
    expect(node!.type).toBe('Color');
    expect(graph.getNodeCount()).toBe(1);
  });

  it('addNode returns null for unknown type', () => {
    expect(graph.addNode('NonExistentType')).toBeNull();
  });

  it('addNode with position and overrides', () => {
    const node = graph.addNode('Color', 10, 20, { color: [1, 0, 0, 1] });
    expect(node!.position).toEqual({ x: 10, y: 20 });
    expect(node!.overrides.color).toEqual([1, 0, 0, 1]);
  });

  it('removeNode returns true', () => {
    const node = graph.addNode('Color')!;
    expect(graph.removeNode(node.id)).toBe(true);
    expect(graph.getNodeCount()).toBe(0);
  });

  it('removeNode returns false for missing', () => {
    expect(graph.removeNode('nope')).toBe(false);
  });

  it('removeNode also removes connections', () => {
    const a = graph.addNode('Color')!;
    const b = graph.addNode('Multiply')!;
    graph.connect(a.id, 'rgba', b.id, 'a');
    graph.removeNode(a.id);
    expect(graph.getConnections()).toHaveLength(0);
  });

  it('getNode retrieves by id', () => {
    const node = graph.addNode('Color')!;
    expect(graph.getNode(node.id)).toBeDefined();
  });

  it('getNodes returns all', () => {
    graph.addNode('Color');
    graph.addNode('Multiply');
    expect(graph.getNodes()).toHaveLength(2);
  });

  // Connections
  it('connect creates connection', () => {
    const a = graph.addNode('Color')!;
    const b = graph.addNode('Multiply')!;
    const conn = graph.connect(a.id, 'rgba', b.id, 'a');
    expect(conn).not.toBeNull();
    expect(graph.getConnections()).toHaveLength(1);
  });

  it('connect returns null for missing node', () => {
    expect(graph.connect('nope', 'out', 'nah', 'in')).toBeNull();
  });

  // Compile
  it('compile returns CompiledShader', () => {
    const color = graph.addNode('Color')!;
    const output = graph.addNode('Output')!;
    graph.connect(color.id, 'rgba', output.id, 'albedo');
    const compiled = graph.compile();
    expect(compiled.nodeCount).toBe(2);
    expect(compiled.connectionCount).toBe(1);
    expect(compiled.fragmentCode.length).toBeGreaterThan(0);
    expect(compiled.vertexCode.length).toBeGreaterThan(0);
  });

  it('compile empty graph', () => {
    const compiled = graph.compile();
    expect(compiled.nodeCount).toBe(0);
    expect(compiled.connectionCount).toBe(0);
  });

  it('compile generates uniforms', () => {
    graph.addNode('Color');
    const compiled = graph.compile();
    expect(compiled.uniforms).toBeDefined();
  });

  // Vertex shader
  it('generateVertexShader produces code', () => {
    const code = graph.generateVertexShader();
    expect(code).toContain('gl_Position');
  });

  // topoSort
  it('topoSort returns ordered node IDs', () => {
    const a = graph.addNode('Color')!;
    const b = graph.addNode('Multiply')!;
    graph.connect(a.id, 'rgba', b.id, 'a');
    const order = graph.topoSort();
    expect(order.indexOf(a.id)).toBeLessThan(order.indexOf(b.id));
  });

  // SHADER_NODES built-ins
  it('SHADER_NODES has expected built-ins', () => {
    expect(SHADER_NODES).toHaveProperty('Color');
    expect(SHADER_NODES).toHaveProperty('Multiply');
    expect(SHADER_NODES).toHaveProperty('Output');
    expect(SHADER_NODES).toHaveProperty('Fresnel');
  });

  it('built-in nodes have code templates', () => {
    for (const def of Object.values(SHADER_NODES)) {
      expect(def.code.length).toBeGreaterThan(0);
    }
  });
});
