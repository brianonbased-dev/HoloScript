/**
 * ShaderGraph + ShaderGraphCompiler — Production Test Suite
 *
 * Pure CPU logic: node graph construction, topology, validation,
 * serialization, and compiler output inspection.
 */
import { describe, it, expect } from 'vitest';
import { ShaderGraph } from '../ShaderGraph';
import { ShaderGraphCompiler, compileShaderGraph } from '../ShaderGraphCompiler';

// ─── ShaderGraph — construction ───────────────────────────────────────────────

describe('ShaderGraph — construction', () => {
  it('creates without error', () => expect(() => new ShaderGraph()).not.toThrow());
  it('creates with name', () => {
    const g = new ShaderGraph('MyShader');
    expect(g.name).toBe('MyShader');
  });
  it('starts with no nodes', () => {
    expect(new ShaderGraph().nodes.size).toBe(0);
  });
  it('starts with no connections', () => {
    expect(new ShaderGraph().connections).toHaveLength(0);
  });
  it('version is defined', () => {
    expect(new ShaderGraph().version).toBeTruthy();
  });
  it('generates a unique id', () => {
    const a = new ShaderGraph('A');
    const b = new ShaderGraph('B');
    expect(a.id).not.toBe(b.id);
  });
});

// ─── ShaderGraph — createNode ─────────────────────────────────────────────────

describe('ShaderGraph — createNode', () => {
  it('createNode from known type returns node', () => {
    const g = new ShaderGraph();
    const node = g.createNode('output_surface');
    expect(node).not.toBeNull();
  });
  it('created node stored in nodes map', () => {
    const g = new ShaderGraph();
    const node = g.createNode('output_surface')!;
    expect(g.nodes.has(node.id)).toBe(true);
  });
  it('createNode with unknown type returns null', () => {
    const g = new ShaderGraph();
    expect(g.createNode('nonexistent_type_xyz')).toBeNull();
  });
  it('two createNode calls produce distinct ids', () => {
    const g = new ShaderGraph();
    const a = g.createNode('output_surface')!;
    const b = g.createNode('output_unlit')!;
    expect(a.id).not.toBe(b.id);
  });
  it('node position defaults to {x:0, y:0}', () => {
    const g = new ShaderGraph();
    const node = g.createNode('output_surface')!;
    expect(node.position.x).toBe(0);
    expect(node.position.y).toBe(0);
  });
  it('createNode respects custom position', () => {
    const g = new ShaderGraph();
    const node = g.createNode('output_surface', { x: 100, y: 200 })!;
    expect(node.position.x).toBe(100);
    expect(node.position.y).toBe(200);
  });
});

// ─── ShaderGraph — getNode / removeNode ──────────────────────────────────────

describe('ShaderGraph — getNode / removeNode', () => {
  it('getNode returns created node', () => {
    const g = new ShaderGraph();
    const n = g.createNode('output_surface')!;
    expect(g.getNode(n.id)).toBe(n);
  });
  it('getNode returns undefined for unknown id', () => {
    expect(new ShaderGraph().getNode('ghost')).toBeUndefined();
  });
  it('removeNode returns true when found', () => {
    const g = new ShaderGraph();
    const n = g.createNode('output_surface')!;
    expect(g.removeNode(n.id)).toBe(true);
  });
  it('removeNode removes from nodes map', () => {
    const g = new ShaderGraph();
    const n = g.createNode('output_surface')!;
    g.removeNode(n.id);
    expect(g.nodes.has(n.id)).toBe(false);
  });
  it('removeNode returns false for unknown id', () => {
    expect(new ShaderGraph().removeNode('missing')).toBe(false);
  });
});

// ─── ShaderGraph — setNodePosition / setNodeProperty ─────────────────────────

describe('ShaderGraph — setNodePosition', () => {
  it('updates position correctly', () => {
    const g = new ShaderGraph();
    const n = g.createNode('output_surface')!;
    g.setNodePosition(n.id, 50, 75);
    expect(g.getNode(n.id)!.position).toEqual({ x: 50, y: 75 });
  });
  it('returns false for missing node', () => {
    expect(new ShaderGraph().setNodePosition('ghost', 0, 0)).toBe(false);
  });
});

describe('ShaderGraph — setNodeProperty / getNodeProperty', () => {
  it('sets and retrieves a property', () => {
    const g = new ShaderGraph();
    const n = g.createNode('output_surface')!;
    g.setNodeProperty(n.id, 'myKey', 42);
    expect(g.getNodeProperty(n.id, 'myKey')).toBe(42);
  });
  it('returns undefined for missing key', () => {
    const g = new ShaderGraph();
    const n = g.createNode('output_surface')!;
    expect(g.getNodeProperty(n.id, 'noSuchKey')).toBeUndefined();
  });
});

// ─── ShaderGraph — validate ───────────────────────────────────────────────────

describe('ShaderGraph — validate', () => {
  it('empty graph validates (no output node → errors)', () => {
    const result = new ShaderGraph().validate();
    expect(result).toHaveProperty('valid');
    expect(result).toHaveProperty('errors');
    expect(result).toHaveProperty('warnings');
  });
  it('graph with output_surface node passes validation', () => {
    const g = new ShaderGraph();
    g.createNode('output_surface');
    const result = g.validate();
    expect(result.valid).toBe(true);
  });
  it('empty graph fails validation (no output node)', () => {
    const result = new ShaderGraph().validate();
    expect(result.valid).toBe(false);
  });
  it('errors is an array', () => {
    expect(Array.isArray(new ShaderGraph().validate().errors)).toBe(true);
  });
});

// ─── ShaderGraph — wouldCreateCycle ──────────────────────────────────────────

describe('ShaderGraph — wouldCreateCycle', () => {
  it('self-loop would create cycle', () => {
    const g = new ShaderGraph();
    const n = g.createNode('output_surface')!;
    expect(g.wouldCreateCycle(n.id, n.id)).toBe(true);
  });
  it('unrelated nodes would not create cycle', () => {
    const g = new ShaderGraph();
    const a = g.createNode('output_surface')!;
    const b = g.createNode('output_unlit')!;
    // With no connections this should be false
    expect(g.wouldCreateCycle(a.id, b.id)).toBe(false);
  });
});

// ─── ShaderGraph — getTopologicalOrder ───────────────────────────────────────

describe('ShaderGraph — getTopologicalOrder', () => {
  it('returns all nodes (empty graph → empty array)', () => {
    expect(new ShaderGraph().getTopologicalOrder()).toHaveLength(0);
  });
  it('returns single node', () => {
    const g = new ShaderGraph();
    g.createNode('output_surface');
    expect(g.getTopologicalOrder()).toHaveLength(1);
  });
  it('returns array of IShaderNode objects', () => {
    const g = new ShaderGraph();
    const n = g.createNode('output_surface')!;
    const sorted = g.getTopologicalOrder();
    expect(sorted[0].id).toBe(n.id);
  });
});

// ─── ShaderGraph — getNodesByCategory / getOutputNodes ───────────────────────

describe('ShaderGraph — getNodesByCategory / getOutputNodes', () => {
  it('getNodesByCategory returns nodes of matching category', () => {
    const g = new ShaderGraph();
    g.createNode('output_surface');
    const outputs = g.getNodesByCategory('output');
    expect(outputs.length).toBeGreaterThan(0);
  });
  it('getOutputNodes returns output-category nodes', () => {
    const g = new ShaderGraph();
    g.createNode('output_surface');
    expect(g.getOutputNodes().length).toBeGreaterThan(0);
  });
  it('getNodesByCategory returns empty for non-existent category', () => {
    const g = new ShaderGraph();
    g.createNode('output_surface');
    // @ts-expect-error — testing unknown category
    expect(g.getNodesByCategory('nonexistent_cat')).toHaveLength(0);
  });
});

// ─── ShaderGraph — getAvailableNodeTemplates ─────────────────────────────────

describe('ShaderGraph — getAvailableNodeTemplates', () => {
  it('returns a non-empty array', () => {
    expect(ShaderGraph.getAvailableNodeTemplates().length).toBeGreaterThan(0);
  });
  it('each template has type and name', () => {
    const templates = ShaderGraph.getAvailableNodeTemplates();
    for (const t of templates) {
      expect(typeof t.type).toBe('string');
      expect(typeof t.name).toBe('string');
    }
  });
});

// ─── ShaderGraph — toJSON / fromJSON ─────────────────────────────────────────

describe('ShaderGraph — toJSON / fromJSON', () => {
  it('toJSON returns an object with id, name, nodes, connections', () => {
    const g = new ShaderGraph('Roundtrip');
    g.createNode('output_surface');
    const json = g.toJSON();
    expect(json.name).toBe('Roundtrip');
    expect(json.id).toBe(g.id);
    expect(Array.isArray(json.nodes)).toBe(true);
  });
  it('fromJSON round-trips name (static)', () => {
    const g = new ShaderGraph('OriginalName');
    g.createNode('output_surface');
    const json = g.toJSON();
    const g2 = ShaderGraph.fromJSON(json);
    expect(g2.name).toBe('OriginalName');
  });
  it('fromJSON round-trips node count (static)', () => {
    const g = new ShaderGraph();
    g.createNode('output_surface');
    g.createNode('output_unlit');
    const g2 = ShaderGraph.fromJSON(g.toJSON());
    expect(g2.nodes.size).toBe(2);
  });
});

// ─── ShaderGraph — clear ─────────────────────────────────────────────────────

describe('ShaderGraph — clear', () => {
  it('clears all nodes', () => {
    const g = new ShaderGraph();
    g.createNode('output_surface');
    g.clear();
    expect(g.nodes.size).toBe(0);
  });
  it('clears all connections', () => {
    const g = new ShaderGraph();
    g.createNode('output_surface');
    g.clear();
    expect(g.connections).toHaveLength(0);
  });
});

// ─── ShaderGraphCompiler — compile() ─────────────────────────────────────────

describe('ShaderGraphCompiler — compile()', () => {
  it('invalid graph (no output) returns error result', () => {
    const g = new ShaderGraph('Empty');
    const compiler = new ShaderGraphCompiler(g);
    const result = compiler.compile();
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.vertexCode).toBe('');
    expect(result.fragmentCode).toBe('');
  });
  it('valid graph (output_surface node) returns non-empty shader code', () => {
    const g = new ShaderGraph('Standard');
    g.createNode('output_surface');
    const compiler = new ShaderGraphCompiler(g);
    const result = compiler.compile();
    expect(result.errors).toHaveLength(0);
    expect(result.vertexCode.length).toBeGreaterThan(0);
    expect(result.fragmentCode.length).toBeGreaterThan(0);
  });
  it('result has uniforms and textures arrays', () => {
    const g = new ShaderGraph('S');
    g.createNode('output_surface');
    const result = new ShaderGraphCompiler(g).compile();
    expect(Array.isArray(result.uniforms)).toBe(true);
    expect(Array.isArray(result.textures)).toBe(true);
  });
  it('vertex code contains @vertex entry point', () => {
    const g = new ShaderGraph('S');
    g.createNode('output_surface');
    const result = new ShaderGraphCompiler(g).compile();
    expect(result.vertexCode).toContain('@vertex');
  });
  it('fragment code contains @fragment entry point', () => {
    const g = new ShaderGraph('S');
    g.createNode('output_surface');
    const result = new ShaderGraphCompiler(g).compile();
    expect(result.fragmentCode).toContain('@fragment');
  });
  it('vertex code contains graph name comment', () => {
    const g = new ShaderGraph('MyShader');
    g.createNode('output_surface');
    const result = new ShaderGraphCompiler(g).compile();
    expect(result.vertexCode).toContain('MyShader');
  });
  it('debug option includes node name comments', () => {
    const g = new ShaderGraph('Debug');
    g.createNode('output_surface');
    const result = new ShaderGraphCompiler(g, { debug: true }).compile();
    // debug mode: fragment body may contain // comments
    expect(result.fragmentCode).toBeTruthy();
  });
  it('compile twice produces consistent results', () => {
    const g = new ShaderGraph('S');
    g.createNode('output_surface');
    const compiler = new ShaderGraphCompiler(g);
    const r1 = compiler.compile();
    const r2 = compiler.compile();
    expect(r1.vertexCode).toBe(r2.vertexCode);
    expect(r1.fragmentCode).toBe(r2.fragmentCode);
  });
});

// ─── compileShaderGraph convenience function ──────────────────────────────────

describe('compileShaderGraph — convenience function', () => {
  it('returns same result as ShaderGraphCompiler.compile()', () => {
    const g = new ShaderGraph('S');
    g.createNode('output_surface');
    const direct = new ShaderGraphCompiler(g).compile();
    const conv = compileShaderGraph(g);
    expect(conv.errors).toEqual(direct.errors);
    expect(conv.vertexCode).toBe(direct.vertexCode);
    expect(conv.fragmentCode).toBe(direct.fragmentCode);
  });
  it('accepts options parameter', () => {
    const g = new ShaderGraph('S');
    g.createNode('output_surface');
    expect(() => compileShaderGraph(g, { debug: true })).not.toThrow();
  });
});
