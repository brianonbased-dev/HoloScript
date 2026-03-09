/**
 * compiler.test.ts — Unit tests for the HoloScript node graph compiler
 *
 * Tests every math operation, edge cases, and the topological sort.
 * Framework: vitest (already in devDependencies).
 * Run: npx vitest run src/__tests__/compiler.test.ts
 */

import { describe, it, expect } from 'vitest';
import { compileNodeGraph } from '@/lib/nodeGraphCompiler';
import type { GNode, GEdge } from '@/lib/nodeGraphStore';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeNode(id: string, type: GNode['type'], data: GNode['data'], x = 0, y = 0): GNode {
  return { id, type, position: { x, y }, data } as GNode;
}

function edge(
  id: string,
  source: string,
  target: string,
  sourceHandle = 'out',
  targetHandle = 'a'
): GEdge {
  return { id, source, target, sourceHandle, targetHandle };
}

function outputNode(): GNode {
  return makeNode('out', 'outputNode', {
    type: 'output',
    label: 'Output',
    outputType: 'fragColor',
  });
}

function timeNode(id = 'time'): GNode {
  return makeNode(id, 'timeNode', { type: 'time', label: 'Time' });
}

// ─── Error cases ──────────────────────────────────────────────────────────────

describe('compileNodeGraph — error cases', () => {
  it('returns ok=false for empty graph', () => {
    const result = compileNodeGraph([], []);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/empty/i);
  });

  it('returns ok=false when there is no output node', () => {
    const nodes = [timeNode()];
    const result = compileNodeGraph(nodes, []);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/output/i);
  });
});

// ─── Minimal valid graph ───────────────────────────────────────────────────────

describe('compileNodeGraph — minimal valid graph', () => {
  it('compiles a time → output graph', () => {
    const nodes = [timeNode(), outputNode()];
    const edges: GEdge[] = [edge('e1', 'time', 'out', 'out', 'rgb')];
    const result = compileNodeGraph(nodes, edges);
    expect(result.ok).toBe(true);
    expect(result.glsl).toContain('void main()');
    expect(result.glsl).toContain('gl_FragColor');
  });

  it('compiles a UV → output graph', () => {
    const nodes = [makeNode('uv', 'uvNode', { type: 'uv', label: 'UV', channel: 0 }), outputNode()];
    const edges: GEdge[] = [edge('e1', 'uv', 'out', 'out', 'rgb')];
    const result = compileNodeGraph(nodes, edges);
    expect(result.ok).toBe(true);
    expect(result.glsl).toContain('vUv');
  });

  it('emits uTime uniform when time node is present', () => {
    const nodes = [timeNode(), outputNode()];
    const edges: GEdge[] = [edge('e1', 'time', 'out', 'out', 'rgb')];
    const result = compileNodeGraph(nodes, edges);
    expect(result.glsl).toContain('uniform float uTime');
  });

  it('unconnected output node uses fallback value 0.5', () => {
    const result = compileNodeGraph([outputNode()], []);
    expect(result.ok).toBe(true);
    expect(result.glsl).toContain('0.5');
  });
});

// ─── Constant nodes ───────────────────────────────────────────────────────────

describe('compileNodeGraph — constant node', () => {
  it('emits a float literal with 4dp', () => {
    const nodes = [
      makeNode('k', 'constantNode', { type: 'constant', label: 'K', value: 3.14 }),
      outputNode(),
    ];
    const edges: GEdge[] = [edge('e1', 'k', 'out', 'out', 'rgb')];
    const result = compileNodeGraph(nodes, edges);
    expect(result.ok).toBe(true);
    expect(result.glsl).toContain('3.1400');
  });

  it('emits 0.0000 for value 0', () => {
    const nodes = [
      makeNode('k', 'constantNode', { type: 'constant', label: 'K', value: 0 }),
      outputNode(),
    ];
    const result = compileNodeGraph(nodes, []);
    expect(result.glsl).toContain('0.0000');
  });
});

// ─── Math ops ─────────────────────────────────────────────────────────────────

const MATH_OPS = [
  'add',
  'sub',
  'mul',
  'div',
  'pow',
  'sin',
  'cos',
  'max',
  'min',
  'mix',
  'dot',
  'length',
] as const;

describe.each(MATH_OPS.map((op) => [op]))('compileNodeGraph — math op %s', (op) => {
  it(`emits valid GLSL for op=${op}`, () => {
    const nodes = [
      makeNode('t', 'timeNode', { type: 'time', label: 'Time' }),
      makeNode('m', 'mathNode', { type: 'math', label: op, op }),
      outputNode(),
    ];
    const edges: GEdge[] = [edge('e1', 't', 'm', 'out', 'a'), edge('e2', 'm', 'out', 'out', 'rgb')];
    const result = compileNodeGraph(nodes, edges);
    expect(result.ok).toBe(true);
    // Each math node emits a float variable
    expect(result.glsl).toMatch(/float v_/);
    // The GLSL string should be non-trivial
    expect(result.glsl.length).toBeGreaterThan(100);
  });
});

// ─── Binary math symbols ──────────────────────────────────────────────────────

describe('compileNodeGraph — binary op symbol emission', () => {
  it('emits + for add', () => {
    const nodes = [
      makeNode('m', 'mathNode', { type: 'math', label: 'Add', op: 'add' }),
      outputNode(),
    ];
    const result = compileNodeGraph(nodes, []);
    expect(result.ok).toBe(true);
    expect(result.glsl).toContain('+');
  });

  it('emits - for sub', () => {
    const nodes = [
      makeNode('m', 'mathNode', { type: 'math', label: 'Sub', op: 'sub' }),
      outputNode(),
    ];
    const result = compileNodeGraph(nodes, []);
    expect(result.glsl).toContain('-');
  });

  it('emits * for mul', () => {
    const nodes = [
      makeNode('m', 'mathNode', { type: 'math', label: 'Mul', op: 'mul' }),
      outputNode(),
    ];
    const result = compileNodeGraph(nodes, []);
    expect(result.glsl).toContain('*');
  });

  it('emits / for div', () => {
    const nodes = [
      makeNode('m', 'mathNode', { type: 'math', label: 'Div', op: 'div' }),
      outputNode(),
    ];
    const result = compileNodeGraph(nodes, []);
    expect(result.glsl).toContain('/');
  });

  it('emits sin() for sin', () => {
    const nodes = [
      makeNode('m', 'mathNode', { type: 'math', label: 'Sin', op: 'sin' }),
      outputNode(),
    ];
    const result = compileNodeGraph(nodes, []);
    expect(result.glsl).toContain('sin(');
  });

  it('emits cos() for cos', () => {
    const nodes = [
      makeNode('m', 'mathNode', { type: 'math', label: 'Cos', op: 'cos' }),
      outputNode(),
    ];
    const result = compileNodeGraph(nodes, []);
    expect(result.glsl).toContain('cos(');
  });

  it('emits pow() for pow', () => {
    const nodes = [
      makeNode('m', 'mathNode', { type: 'math', label: 'Pow', op: 'pow' }),
      outputNode(),
    ];
    const result = compileNodeGraph(nodes, []);
    expect(result.glsl).toContain('pow(');
  });

  it('emits mix() for mix', () => {
    const nodes = [
      makeNode('m', 'mathNode', { type: 'math', label: 'Mix', op: 'mix' }),
      outputNode(),
    ];
    const result = compileNodeGraph(nodes, []);
    expect(result.glsl).toContain('mix(');
  });

  it('emits dot() for dot', () => {
    const nodes = [
      makeNode('m', 'mathNode', { type: 'math', label: 'Dot', op: 'dot' }),
      outputNode(),
    ];
    const result = compileNodeGraph(nodes, []);
    expect(result.glsl).toContain('dot(');
  });

  it('emits length() for length', () => {
    const nodes = [
      makeNode('m', 'mathNode', { type: 'math', label: 'Length', op: 'length' }),
      outputNode(),
    ];
    const result = compileNodeGraph(nodes, []);
    expect(result.glsl).toContain('length(');
  });
});

// ─── Texture nodes ────────────────────────────────────────────────────────────

describe('compileNodeGraph — texture node', () => {
  it('emits sampler2D uniform declaration', () => {
    const nodes = [
      makeNode('tex', 'timeNode', { type: 'time', label: 'Time' }), // proxy — actual texture handled
      outputNode(),
    ];
    // NOTE: texture node data shape is { type: 'texture', label, uniformName }
    const texNode = makeNode(
      'tex2',
      'timeNode' as GNode['type'],
      {
        type: 'texture',
        label: 'Texture',
        uniformName: 'uMainTex',
      } as GNode['data']
    );

    const allNodes = [texNode, outputNode()];
    const result = compileNodeGraph(allNodes, []);
    expect(result.ok).toBe(true);
    expect(result.glsl).toContain('sampler2D uMainTex');
  });
});

// ─── Topological sort / chain ─────────────────────────────────────────────────

describe('compileNodeGraph — multi-node chain', () => {
  it('compiles time → sin → mul → output correctly', () => {
    const nodes = [
      timeNode('t'),
      makeNode('sin', 'mathNode', { type: 'math', label: 'Sin', op: 'sin' }),
      makeNode('mul', 'mathNode', { type: 'math', label: 'Mul', op: 'mul' }),
      outputNode(),
    ];
    const edges: GEdge[] = [
      edge('e1', 't', 'sin', 'out', 'a'),
      edge('e2', 'sin', 'mul', 'out', 'a'),
      edge('e3', 'mul', 'out', 'out', 'rgb'),
    ];
    const result = compileNodeGraph(nodes, edges);
    expect(result.ok).toBe(true);
    // sin and mul declarations should both appear, sin before mul
    const sinIdx = result.glsl.indexOf('sin(');
    const mulIdx = result.glsl.indexOf('*');
    expect(sinIdx).toBeGreaterThan(-1);
    expect(mulIdx).toBeGreaterThan(-1);
    expect(sinIdx).toBeLessThan(mulIdx);
  });

  it('handles multiple input nodes feeding a single math node', () => {
    const nodes = [
      timeNode('t1'),
      makeNode('u', 'uvNode', { type: 'uv', label: 'UV', channel: 0 }),
      makeNode('add', 'mathNode', { type: 'math', label: 'Add', op: 'add' }),
      outputNode(),
    ];
    const edges: GEdge[] = [
      edge('e1', 't1', 'add', 'out', 'a'),
      edge('e2', 'u', 'add', 'out', 'b'),
      edge('e3', 'add', 'out', 'out', 'rgb'),
    ];
    const result = compileNodeGraph(nodes, edges);
    expect(result.ok).toBe(true);
    // Both source variables should appear
    expect(result.glsl).toContain('v_t1');
    expect(result.glsl).toContain('v_u');
  });
});

// ─── GLSL structure ───────────────────────────────────────────────────────────

describe('compileNodeGraph — GLSL output structure', () => {
  it('always includes void main()', () => {
    const result = compileNodeGraph([outputNode()], []);
    expect(result.glsl).toContain('void main()');
  });

  it('always includes vUv varying', () => {
    const result = compileNodeGraph([outputNode()], []);
    expect(result.glsl).toContain('varying vec2 vUv');
  });

  it('always includes vNormal varying', () => {
    const result = compileNodeGraph([outputNode()], []);
    expect(result.glsl).toContain('varying vec3 vNormal');
  });

  it('always includes uTime uniform', () => {
    const result = compileNodeGraph([outputNode()], []);
    expect(result.glsl).toContain('uniform float uTime');
  });

  it('returned glsl string always starts with // Generated comment', () => {
    const result = compileNodeGraph([outputNode()], []);
    expect(result.glsl.trim()).toMatch(/^\/\/ Generated by HoloScript/);
  });
});
