/**
 * Scenario: Node Graph Editor — Store & Compiler
 *
 * Tests for the visual node graph system:
 * - Store: nodes/edges CRUD, reset, compiled GLSL
 * - Compiler: topological sort, GLSL emission, error handling
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { compileNodeGraph } from '../../lib/nodeGraphCompiler';
import type { GNode, GEdge } from '../../lib/nodeGraphStore';

const { useNodeGraphStore } = await import('@/lib/nodeGraphStore');

// ── Helpers ─────────────────────────────────────────────────────────────────

function resetStore() {
  useNodeGraphStore.getState().reset();
}

function makeNode(id: string, data: GNode['data'], position = { x: 0, y: 0 }): GNode {
  return { id, type: data.type + 'Node', position, data } as GNode;
}

// ── Store Tests ─────────────────────────────────────────────────────────────

describe('Scenario: Node Graph Store', () => {
  beforeEach(resetStore);

  it('default graph has 4 nodes (uv, time, sin, out)', () => {
    const nodes = useNodeGraphStore.getState().nodes;
    expect(nodes.length).toBe(4);
    const ids = nodes.map((n) => n.id);
    expect(ids).toContain('uv');
    expect(ids).toContain('time');
    expect(ids).toContain('sin');
    expect(ids).toContain('out');
  });

  it('default graph has 2 edges', () => {
    expect(useNodeGraphStore.getState().edges.length).toBe(2);
  });

  it('setNodes replaces all nodes', () => {
    const custom: GNode[] = [makeNode('a', { type: 'constant', label: 'A', value: 1 })];
    useNodeGraphStore.getState().setNodes(custom);
    expect(useNodeGraphStore.getState().nodes.length).toBe(1);
    expect(useNodeGraphStore.getState().nodes[0].id).toBe('a');
  });

  it('setNodes accepts a function updater', () => {
    useNodeGraphStore.getState().setNodes((prev) => [
      ...prev,
      makeNode('extra', { type: 'constant', label: 'X', value: 42 }),
    ]);
    expect(useNodeGraphStore.getState().nodes.length).toBe(5);
  });

  it('setEdges replaces all edges', () => {
    useNodeGraphStore.getState().setEdges([]);
    expect(useNodeGraphStore.getState().edges.length).toBe(0);
  });

  it('setCompiledGLSL stores GLSL string', () => {
    useNodeGraphStore.getState().setCompiledGLSL('void main() {}');
    expect(useNodeGraphStore.getState().compiledGLSL).toBe('void main() {}');
  });

  it('reset() restores defaults', () => {
    useNodeGraphStore.getState().setNodes([]);
    useNodeGraphStore.getState().setEdges([]);
    useNodeGraphStore.getState().setCompiledGLSL('test');
    useNodeGraphStore.getState().reset();
    expect(useNodeGraphStore.getState().nodes.length).toBe(4);
    expect(useNodeGraphStore.getState().edges.length).toBe(2);
    expect(useNodeGraphStore.getState().compiledGLSL).toBe('');
  });
});

// ── Compiler Tests ──────────────────────────────────────────────────────────

describe('Scenario: Node Graph Compiler', () => {
  it('empty graph returns error', () => {
    const result = compileNodeGraph([], []);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('empty');
  });

  it('graph without output node returns error', () => {
    const nodes: GNode[] = [makeNode('c', { type: 'constant', label: 'C', value: 0.5 })];
    const result = compileNodeGraph(nodes, []);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('output');
  });

  it('minimal output-only graph compiles OK', () => {
    const nodes: GNode[] = [
      makeNode('out', { type: 'output', label: 'Output', outputType: 'fragColor' }),
    ];
    const result = compileNodeGraph(nodes, []);
    expect(result.ok).toBe(true);
    expect(result.glsl).toContain('gl_FragColor');
  });

  it('constant → output emits correct GLSL', () => {
    const nodes: GNode[] = [
      makeNode('c', { type: 'constant', label: 'C', value: 0.75 }),
      makeNode('out', { type: 'output', label: 'Output', outputType: 'fragColor' }),
    ];
    const edges: GEdge[] = [
      { id: 'e1', source: 'c', target: 'out', sourceHandle: 'out', targetHandle: 'rgb' },
    ];
    const result = compileNodeGraph(nodes, edges);
    expect(result.ok).toBe(true);
    expect(result.glsl).toContain('0.7500');
    expect(result.glsl).toContain('gl_FragColor');
  });

  it('time node emits uTime uniform', () => {
    const nodes: GNode[] = [
      makeNode('t', { type: 'time', label: 'Time' }),
      makeNode('out', { type: 'output', label: 'Output', outputType: 'fragColor' }),
    ];
    const edges: GEdge[] = [
      { id: 'e', source: 't', target: 'out', sourceHandle: 'out', targetHandle: 'rgb' },
    ];
    const result = compileNodeGraph(nodes, edges);
    expect(result.ok).toBe(true);
    expect(result.glsl).toContain('uniform float uTime');
    expect(result.glsl).toContain('v_t = uTime');
  });

  it('math add node emits addition expression', () => {
    const nodes: GNode[] = [
      makeNode('a', { type: 'constant', label: 'A', value: 1 }),
      makeNode('b', { type: 'constant', label: 'B', value: 2 }),
      makeNode('add', { type: 'math', label: 'Add', op: 'add' }),
      makeNode('out', { type: 'output', label: 'Output', outputType: 'fragColor' }),
    ];
    const edges: GEdge[] = [
      { id: 'e1', source: 'a', target: 'add', sourceHandle: 'out', targetHandle: 'a' },
      { id: 'e2', source: 'b', target: 'add', sourceHandle: 'out', targetHandle: 'b' },
      { id: 'e3', source: 'add', target: 'out', sourceHandle: 'out', targetHandle: 'rgb' },
    ];
    const result = compileNodeGraph(nodes, edges);
    expect(result.ok).toBe(true);
    expect(result.glsl).toContain('+');
  });

  it('sin node emits sin() call', () => {
    const nodes: GNode[] = [
      makeNode('t', { type: 'time', label: 'Time' }),
      makeNode('s', { type: 'math', label: 'Sin', op: 'sin' }),
      makeNode('out', { type: 'output', label: 'Output', outputType: 'fragColor' }),
    ];
    const edges: GEdge[] = [
      { id: 'e1', source: 't', target: 's', sourceHandle: 'out', targetHandle: 'a' },
      { id: 'e2', source: 's', target: 'out', sourceHandle: 'out', targetHandle: 'rgb' },
    ];
    const result = compileNodeGraph(nodes, edges);
    expect(result.ok).toBe(true);
    expect(result.glsl).toContain('sin(');
  });

  it('texture node emits sampler2D uniform', () => {
    const nodes: GNode[] = [
      makeNode('tex', { type: 'texture', label: 'Tex', uniformName: 'uTexture0' }),
      makeNode('out', { type: 'output', label: 'Output', outputType: 'fragColor' }),
    ];
    const edges: GEdge[] = [
      { id: 'e', source: 'tex', target: 'out', sourceHandle: 'out', targetHandle: 'rgb' },
    ];
    const result = compileNodeGraph(nodes, edges);
    expect(result.ok).toBe(true);
    expect(result.glsl).toContain('uniform sampler2D uTexture0');
  });

  it('default graph compiles successfully', () => {
    const s = useNodeGraphStore.getState();
    const result = compileNodeGraph(s.nodes, s.edges);
    expect(result.ok).toBe(true);
    expect(result.glsl).toContain('void main()');
  });

  it('compiled GLSL contains generator comment', () => {
    const s = useNodeGraphStore.getState();
    const result = compileNodeGraph(s.nodes, s.edges);
    expect(result.glsl).toContain('HoloScript Node Graph Compiler');
  });
});
