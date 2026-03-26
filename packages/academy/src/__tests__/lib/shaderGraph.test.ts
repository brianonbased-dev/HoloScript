/**
 * shaderGraph.test.ts — Tests for the visual shader graph engine
 *
 * Covers: createShaderGraph, addNode, connectPorts, removeNode,
 * hasCycles, connectionCount, and unconnectedInputs.
 * All pure functions — no mocking needed.
 */

import { describe, it, expect } from 'vitest';
import {
  createShaderGraph,
  addNode,
  connectPorts,
  removeNode,
  hasCycles,
  connectionCount,
  unconnectedInputs,
  type ShaderNode,
  type ShaderGraphData,
} from '../../lib/shaderGraph';

// ── Helper ───────────────────────────────────────────────────────────────────

function makeNode(id: string, type: 'color' | 'multiply' | 'add' | 'texture-sample' = 'color'): ShaderNode {
  return {
    id,
    type,
    label: `Node ${id}`,
    position: { x: 0, y: 0 },
    inputs: [
      { name: 'in1', dataType: 'vec3', connected: false },
      { name: 'in2', dataType: 'vec3', connected: false },
    ],
    outputs: [
      { name: 'out', dataType: 'vec3', connected: false },
    ],
    params: {},
  };
}

// ── createShaderGraph ────────────────────────────────────────────────────────

describe('shaderGraph — createShaderGraph', () => {
  it('creates a graph with the given name', () => {
    const g = createShaderGraph('TestMaterial');
    expect(g.name).toBe('TestMaterial');
  });

  it('includes a default output node', () => {
    const g = createShaderGraph('Mat');
    expect(g.nodes).toHaveLength(1);
    expect(g.nodes[0].type).toBe('output');
    expect(g.outputNodeId).toBe(g.nodes[0].id);
  });

  it('output node has standard PBR inputs', () => {
    const g = createShaderGraph('PBR');
    const out = g.nodes[0];
    const inputNames = out.inputs.map((i) => i.name);
    expect(inputNames).toContain('albedo');
    expect(inputNames).toContain('normal');
    expect(inputNames).toContain('metallic');
    expect(inputNames).toContain('roughness');
    expect(inputNames).toContain('emission');
    expect(inputNames).toContain('alpha');
  });

  it('starts with no edges', () => {
    const g = createShaderGraph('Empty');
    expect(g.edges).toHaveLength(0);
  });

  it('generates a unique id', () => {
    const g1 = createShaderGraph('A');
    const g2 = createShaderGraph('B');
    expect(g1.id).not.toBe(g2.id);
  });
});

// ── addNode ──────────────────────────────────────────────────────────────────

describe('shaderGraph — addNode', () => {
  it('adds a node to the graph', () => {
    let g = createShaderGraph('Test');
    const node = makeNode('color-1');
    g = addNode(g, node);
    expect(g.nodes).toHaveLength(2); // output + color-1
    expect(g.nodes.find((n) => n.id === 'color-1')).toBeDefined();
  });

  it('does not mutate the original graph', () => {
    const original = createShaderGraph('Immutable');
    const _ = addNode(original, makeNode('n1'));
    expect(original.nodes).toHaveLength(1); // still just output
  });
});

// ── connectPorts ─────────────────────────────────────────────────────────────

describe('shaderGraph — connectPorts', () => {
  it('creates an edge between two ports', () => {
    let g = createShaderGraph('Connect');
    g = addNode(g, makeNode('c1', 'color'));
    g = connectPorts(g, 'c1', 'out', g.outputNodeId, 'albedo');
    expect(g.edges).toHaveLength(1);
    expect(g.edges[0].from.nodeId).toBe('c1');
    expect(g.edges[0].from.port).toBe('out');
    expect(g.edges[0].to.nodeId).toBe(g.outputNodeId);
    expect(g.edges[0].to.port).toBe('albedo');
  });

  it('generates unique edge ids across calls', async () => {
    let g = createShaderGraph('Edges');
    g = addNode(g, makeNode('n1'));
    g = addNode(g, makeNode('n2'));
    g = connectPorts(g, 'n1', 'out', g.outputNodeId, 'albedo');
    // Small delay to ensure Date.now() ticks over
    await new Promise((r) => setTimeout(r, 2));
    g = connectPorts(g, 'n2', 'out', g.outputNodeId, 'normal');
    expect(g.edges[0].id).not.toBe(g.edges[1].id);
  });

  it('does not mutate the original graph', () => {
    let g = createShaderGraph('Immutable');
    g = addNode(g, makeNode('n1'));
    const before = g.edges.length;
    const _ = connectPorts(g, 'n1', 'out', g.outputNodeId, 'albedo');
    expect(g.edges.length).toBe(before);
  });
});

// ── removeNode ───────────────────────────────────────────────────────────────

describe('shaderGraph — removeNode', () => {
  it('removes the node from the graph', () => {
    let g = createShaderGraph('Remove');
    g = addNode(g, makeNode('doomed'));
    g = removeNode(g, 'doomed');
    expect(g.nodes.find((n) => n.id === 'doomed')).toBeUndefined();
  });

  it('removes edges connected to the removed node', () => {
    let g = createShaderGraph('Remove');
    g = addNode(g, makeNode('src'));
    g = connectPorts(g, 'src', 'out', g.outputNodeId, 'albedo');
    expect(g.edges).toHaveLength(1);
    g = removeNode(g, 'src');
    expect(g.edges).toHaveLength(0);
  });

  it('preserves other nodes and edges', () => {
    let g = createShaderGraph('Keep');
    g = addNode(g, makeNode('keep'));
    g = addNode(g, makeNode('remove'));
    g = connectPorts(g, 'keep', 'out', g.outputNodeId, 'albedo');
    g = connectPorts(g, 'remove', 'out', g.outputNodeId, 'normal');
    g = removeNode(g, 'remove');
    expect(g.nodes.find((n) => n.id === 'keep')).toBeDefined();
    expect(g.edges).toHaveLength(1);
    expect(g.edges[0].from.nodeId).toBe('keep');
  });
});

// ── hasCycles ────────────────────────────────────────────────────────────────

describe('shaderGraph — hasCycles', () => {
  it('returns false for an acyclic graph', () => {
    let g = createShaderGraph('Acyclic');
    g = addNode(g, makeNode('a'));
    g = addNode(g, makeNode('b'));
    g = connectPorts(g, 'a', 'out', 'b', 'in1');
    g = connectPorts(g, 'b', 'out', g.outputNodeId, 'albedo');
    expect(hasCycles(g)).toBe(false);
  });

  it('returns true for a cyclic graph', () => {
    let g = createShaderGraph('Cyclic');
    g = addNode(g, makeNode('a'));
    g = addNode(g, makeNode('b'));
    g = connectPorts(g, 'a', 'out', 'b', 'in1');
    g = connectPorts(g, 'b', 'out', 'a', 'in1'); // cycle!
    expect(hasCycles(g)).toBe(true);
  });

  it('returns false for an empty graph', () => {
    const g = createShaderGraph('Empty');
    expect(hasCycles(g)).toBe(false);
  });
});

// ── connectionCount ──────────────────────────────────────────────────────────

describe('shaderGraph — connectionCount', () => {
  it('returns 0 for no edges', () => {
    const g = createShaderGraph('No edges');
    expect(connectionCount(g)).toBe(0);
  });

  it('counts edges correctly', () => {
    let g = createShaderGraph('Count');
    g = addNode(g, makeNode('a'));
    g = addNode(g, makeNode('b'));
    g = connectPorts(g, 'a', 'out', g.outputNodeId, 'albedo');
    g = connectPorts(g, 'b', 'out', g.outputNodeId, 'normal');
    expect(connectionCount(g)).toBe(2);
  });
});

// ── unconnectedInputs ────────────────────────────────────────────────────────

describe('shaderGraph — unconnectedInputs', () => {
  it('lists all inputs when nothing is connected', () => {
    const g = createShaderGraph('Unconnected');
    const inputs = unconnectedInputs(g);
    // Output node has 6 PBR inputs
    expect(inputs.length).toBe(6);
  });

  it('excludes connected inputs', () => {
    let g = createShaderGraph('Partially');
    g = addNode(g, makeNode('c'));
    g = connectPorts(g, 'c', 'out', g.outputNodeId, 'albedo');
    const inputs = unconnectedInputs(g);
    const albedoEntry = inputs.find((i) => i.nodeId === g.outputNodeId && i.port === 'albedo');
    expect(albedoEntry).toBeUndefined(); // albedo is connected
  });

  it('includes unconnected inputs from added nodes', () => {
    let g = createShaderGraph('Added');
    g = addNode(g, makeNode('n1'));
    const inputs = unconnectedInputs(g);
    const n1Inputs = inputs.filter((i) => i.nodeId === 'n1');
    expect(n1Inputs.length).toBe(2); // in1, in2
  });
});
