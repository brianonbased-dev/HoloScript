import { describe, it, expect, beforeEach } from 'vitest';
import { ShaderGraph, SHADER_NODES } from '../rendering/ShaderGraph';

// =============================================================================
// C285 — Shader Graph
// =============================================================================

describe('ShaderGraph', () => {
  let graph: ShaderGraph;
  beforeEach(() => {
    graph = new ShaderGraph('test_shader');
  });

  it('constructor initializes built-in node defs', () => {
    expect(Object.keys(SHADER_NODES).length).toBeGreaterThanOrEqual(6);
  });

  it('addNode creates node of known type', () => {
    const node = graph.addNode('Color', 10, 20);
    expect(node).not.toBeNull();
    expect(node!.type).toBe('Color');
    expect(node!.position).toEqual({ x: 10, y: 20 });
  });

  it('addNode returns null for unknown type', () => {
    expect(graph.addNode('UnknownNode')).toBeNull();
  });

  it('removeNode removes node and its connections', () => {
    const color = graph.addNode('Color')!;
    const output = graph.addNode('Output')!;
    graph.connect(color.id, 'rgba', output.id, 'albedo');
    graph.removeNode(color.id);
    expect(graph.getNode(color.id)).toBeUndefined();
    expect(graph.getConnections()).toHaveLength(0);
  });

  it('connect creates connection between nodes', () => {
    const color = graph.addNode('Color')!;
    const output = graph.addNode('Output')!;
    const conn = graph.connect(color.id, 'rgba', output.id, 'albedo');
    expect(conn).not.toBeNull();
    expect(graph.getConnections()).toHaveLength(1);
  });

  it('connect rejects self-loop', () => {
    const color = graph.addNode('Color')!;
    expect(graph.connect(color.id, 'rgba', color.id, 'color')).toBeNull();
  });

  it('connect rejects non-existent nodes', () => {
    expect(graph.connect('fake1', 'out', 'fake2', 'in')).toBeNull();
  });

  it('compile produces vertex and fragment code', () => {
    const color = graph.addNode('Color')!;
    const output = graph.addNode('Output')!;
    graph.connect(color.id, 'rgba', output.id, 'albedo');
    const compiled = graph.compile();
    expect(compiled.vertexCode).toContain('gl_Position');
    expect(compiled.fragmentCode).toContain('gl_FragColor');
    expect(compiled.nodeCount).toBe(2);
    expect(compiled.connectionCount).toBe(1);
  });

  it('compile generates uniforms for unconnected inputs', () => {
    const output = graph.addNode('Output')!;
    const compiled = graph.compile();
    // Output has 5 inputs (albedo, normal, metallic, roughness, emission) → all become uniforms
    expect(compiled.uniforms.length).toBeGreaterThanOrEqual(5);
  });

  it('compile with Multiply chain generates correct code', () => {
    const colorA = graph.addNode('Color')!;
    const colorB = graph.addNode('Color')!;
    const mul = graph.addNode('Multiply')!;
    const output = graph.addNode('Output')!;
    graph.connect(colorA.id, 'rgba', mul.id, 'a');
    graph.connect(colorB.id, 'rgba', mul.id, 'b');
    graph.connect(mul.id, 'result', output.id, 'albedo');
    const compiled = graph.compile();
    expect(compiled.fragmentCode).toContain('gl_FragColor');
    expect(compiled.nodeCount).toBe(4);
  });

  it('overrides are used for uniform values', () => {
    const color = graph.addNode('Color', 0, 0, { color: [1, 0, 0, 1] })!;
    const output = graph.addNode('Output')!;
    graph.connect(color.id, 'rgba', output.id, 'albedo');
    const compiled = graph.compile();
    const colorUniform = compiled.uniforms.find((u) => u.name.includes('color'));
    expect(colorUniform).toBeDefined();
    expect(colorUniform!.value).toEqual([1, 0, 0, 1]);
  });
});
