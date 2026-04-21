/**
 * WGSLTranslator.test.ts
 *
 * Comprehensive tests for the WGSLTranslator class and translateGraphToWGSL helper.
 * Absorbed via holo_absorb_repo (graph JSON) — WGSLTranslator.ts: 630 LOC, 25+ node types.
 *
 * Coverage:
 *   1. Basic compilation structure (header, entry point, return)
 *   2. No-output-node error path
 *   3. Constant value nodes (float, vec2, vec3, vec4)
 *   4. Input nodes (UV, Time, Position, Normal)
 *   5. Math nodes (Add, Multiply, Sin, Pow, mathNode ops)
 *   6. Vector nodes (DotProduct, Normalize, Mix)
 *   7. Color nodes (ColorConstant, HsvToRgb)
 *   8. Texture nodes (Texture2D / texture) — uniform bindings
 *   9. Procedural nodes (NoiseNode, VoronoiNode, GradientNode)
 *  10. Utility nodes (Clamp, Remap, FogNode, AmbientOcclusion)
 *  11. PBR output — full Cook-Torrance lighting code
 *  12. Type inference — widest-type propagation
 *  13. Topological resolution (chain, DAG, duplicate suppression)
 *  14. Time uniform injection (needsTimeUniform → struct Uniforms)
 *  15. Noise helper function injection (snoise)
 *  16. translateGraphToWGSL convenience wrapper
 *  17. Edge cases (empty graph, missing node, unknown node type)
 */

import { describe, it, expect } from 'vitest';
import { WGSLTranslator, translateGraphToWGSL } from '../core/rendering/WGSLTranslator';
import type { GNode, GEdge } from '../lib/nodeGraphStore';

// ── Test helpers ─────────────────────────────────────────────────────────────

function node(id: string, type: string, data: Record<string, unknown> = {}): GNode {
  return { id, type, data, position: { x: 0, y: 0 } } as unknown as GNode;
}

function edge(source: string, target: string, targetHandle?: string): GEdge {
  return { id: `${source}→${target}`, source, target, targetHandle } as GEdge;
}

function compile(nodes: GNode[], edges: GEdge[] = []) {
  return new WGSLTranslator(nodes, edges).compile();
}

// ── 1. Basic structure ────────────────────────────────────────────────────────

describe('WGSLTranslator — basic structure', () => {
  it('emits Auto-Generated header comment', () => {
    const result = compile([node('out', 'output')]);
    expect(result.ok).toBe(true);
    expect(result.wgsl).toContain('Auto-Generated WGSL by HoloScript Studio');
  });

  it('emits VertexInput struct', () => {
    const result = compile([node('out', 'output')]);
    expect(result.wgsl).toContain('struct VertexInput');
    expect(result.wgsl).toContain('@location(0) position: vec3f');
    expect(result.wgsl).toContain('@location(1) uv: vec2f');
    expect(result.wgsl).toContain('@location(2) normal: vec3f');
  });

  it('emits VertexOutput struct', () => {
    const result = compile([node('out', 'output')]);
    expect(result.wgsl).toContain('struct VertexOutput');
    expect(result.wgsl).toContain('@builtin(position) position: vec4f');
    expect(result.wgsl).toContain('@location(0) vUv: vec2f');
    expect(result.wgsl).toContain('@location(1) vNormal: vec3f');
  });

  it('emits @fragment entry point', () => {
    const result = compile([node('out', 'output')]);
    expect(result.wgsl).toContain('@fragment');
    expect(result.wgsl).toContain('fn main(in: VertexOutput)');
    expect(result.wgsl).toContain('-> @location(0) vec4f');
  });

  it('basic output node returns white', () => {
    const result = compile([node('out', 'output')]);
    expect(result.wgsl).toContain('return vec4f(1.0, 1.0, 1.0, 1.0)');
  });

  it('translateGraphToWGSL wrapper produces identical result', () => {
    const nodes = [node('out', 'output')];
    const direct = new WGSLTranslator(nodes, []).compile();
    const wrapped = translateGraphToWGSL(nodes, []);
    expect(wrapped).toEqual(direct);
  });
});

// ── 2. Error paths ────────────────────────────────────────────────────────────

describe('WGSLTranslator — error paths', () => {
  it('returns ok:false when no output node exists', () => {
    const result = compile([node('n1', 'float', { value: 1.0 })]);
    expect(result.ok).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors![0]).toContain('No valid PBROutput or Output node');
  });

  it('returns ok:false for empty graph', () => {
    const result = compile([]);
    expect(result.ok).toBe(false);
  });

  it('handles unreachable node (unknown source ID in edge)', () => {
    // Edge points to a non-existent source — should compile without throwing
    const nodes = [node('out', 'output')];
    const edges = [edge('ghost_id', 'out')];
    const result = compile(nodes, edges);
    expect(result.ok).toBe(true);
  });
});

// ── 3. Constant value nodes ───────────────────────────────────────────────────

describe('WGSLTranslator — constant nodes', () => {
  it('float node emits f32 literal', () => {
    const nodes = [node('f', 'float', { value: 0.75 }), node('out', 'output')];
    const edges_ = [edge('f', 'out')];
    const result = compile(nodes, edges_);
    expect(result.ok).toBe(true);
    expect(result.wgsl).toContain('0.75');
  });

  it('constant node alias emits f32 literal', () => {
    const nodes = [node('c', 'constant', { value: 3.14 }), node('out', 'output')];
    const edges_ = [edge('c', 'out')];
    const result = compile(nodes, edges_);
    expect(result.ok).toBe(true);
    expect(result.wgsl).toContain('3.14');
  });

  it('float node with integer value appends .0', () => {
    const nodes = [node('c', 'float', { value: 2 }), node('out', 'output')];
    const result = compile(nodes, [edge('c', 'out')]);
    expect(result.wgsl).toContain('2.0');
  });

  it('vec3 node emits vec3f(r, g, b) literal', () => {
    const nodes = [node('v', 'vec3', { value: [0.1, 0.2, 0.3] }), node('out', 'output')];
    const result = compile(nodes, [edge('v', 'out')]);
    expect(result.wgsl).toContain('vec3f(0.1, 0.2, 0.3)');
  });

  it('vec3 node without value falls back to white', () => {
    const nodes = [node('v', 'vec3', {}), node('out', 'output')];
    const result = compile(nodes, [edge('v', 'out')]);
    expect(result.wgsl).toContain('vec3f(1.0, 1.0, 1.0)');
  });

  it('vec4 node emits vec4f(r, g, b, a) literal', () => {
    const nodes = [node('v', 'vec4', { value: [1.0, 0.5, 0.25, 1.0] }), node('out', 'output')];
    const result = compile(nodes, [edge('v', 'out')]);
    expect(result.wgsl).toContain('vec4f(1.0, 0.5, 0.25, 1.0)');
  });

  it('vec2 node emits vec2f(u, v) literal', () => {
    const nodes = [node('v', 'vec2', { value: [0.5, 0.5] }), node('out', 'output')];
    const result = compile(nodes, [edge('v', 'out')]);
    expect(result.wgsl).toContain('vec2f(0.5, 0.5)');
  });
});

// ── 4. Input nodes ────────────────────────────────────────────────────────────

describe('WGSLTranslator — input nodes', () => {
  it('UVInput node emits in.vUv', () => {
    const nodes = [node('uv', 'UVInput'), node('out', 'output')];
    const result = compile(nodes, [edge('uv', 'out')]);
    expect(result.wgsl).toContain('in.vUv');
  });

  it('uvNode alias emits in.vUv', () => {
    const nodes = [node('uv', 'uvNode'), node('out', 'output')];
    const result = compile(nodes, [edge('uv', 'out')]);
    expect(result.wgsl).toContain('in.vUv');
  });

  it('TimeInput node sets needsTimeUniform and emits uTime', () => {
    const nodes = [node('t', 'TimeInput'), node('out', 'output')];
    const result = compile(nodes, [edge('t', 'out')]);
    expect(result.ok).toBe(true);
    // Should emit uniform buffer struct
    expect(result.wgsl).toContain('struct Uniforms');
    expect(result.wgsl).toContain('time: f32');
    expect(result.wgsl).toContain('@group(0) @binding(0) var<uniform> uniforms: Uniforms');
    // uTime alias in main body
    expect(result.wgsl).toContain('let uTime = uniforms.time');
  });

  it('time alias also triggers time uniform', () => {
    const nodes = [node('t', 'time'), node('out', 'output')];
    const result = compile(nodes, [edge('t', 'out')]);
    expect(result.wgsl).toContain('struct Uniforms');
  });

  it('PositionInput node emits in.position.xyz', () => {
    const nodes = [node('p', 'PositionInput'), node('out', 'output')];
    const result = compile(nodes, [edge('p', 'out')]);
    expect(result.wgsl).toContain('in.position.xyz');
  });

  it('NormalInput node emits in.vNormal', () => {
    const nodes = [node('n', 'NormalInput'), node('out', 'output')];
    const result = compile(nodes, [edge('n', 'out')]);
    expect(result.wgsl).toContain('in.vNormal');
  });

  it('Normal alias also emits in.vNormal', () => {
    const nodes = [node('n', 'Normal'), node('out', 'output')];
    const result = compile(nodes, [edge('n', 'out')]);
    expect(result.wgsl).toContain('in.vNormal');
  });
});

// ── 5. Math nodes ─────────────────────────────────────────────────────────────

describe('WGSLTranslator — math nodes', () => {
  it('AddNode emits (a + b)', () => {
    const nodes = [
      node('a', 'float', { value: 1.0 }),
      node('b', 'float', { value: 2.0 }),
      node('add', 'AddNode'),
      node('out', 'output'),
    ];
    const edges_ = [edge('a', 'add', 'a'), edge('b', 'add', 'b'), edge('add', 'out')];
    const result = compile(nodes, edges_);
    expect(result.wgsl).toMatch(/\(.*\+.*\)/);
  });

  it('MultiplyNode emits (a * b)', () => {
    const nodes = [
      node('a', 'float', { value: 2.0 }),
      node('b', 'float', { value: 3.0 }),
      node('mul', 'MultiplyNode'),
      node('out', 'output'),
    ];
    const result = compile(nodes, [
      edge('a', 'mul', 'a'),
      edge('b', 'mul', 'b'),
      edge('mul', 'out'),
    ]);
    expect(result.wgsl).toMatch(/\(.*\*.*\)/);
  });

  it('SinNode emits sin(...)', () => {
    const nodes = [node('uv', 'UVInput'), node('sin', 'SinNode'), node('out', 'output')];
    const result = compile(nodes, [edge('uv', 'sin', 'x'), edge('sin', 'out')]);
    expect(result.wgsl).toContain('sin(');
  });

  it('PowNode emits pow(base, exp)', () => {
    const nodes = [
      node('base', 'float', { value: 2.0 }),
      node('exp', 'float', { value: 3.0 }),
      node('pow', 'PowNode'),
      node('out', 'output'),
    ];
    const result = compile(nodes, [
      edge('base', 'pow', 'base'),
      edge('exp', 'pow', 'exp'),
      edge('pow', 'out'),
    ]);
    expect(result.wgsl).toContain('pow(');
  });

  it('mathNode add emits addition', () => {
    const nodes = [node('m', 'mathNode', { op: 'add' }), node('out', 'output')];
    const result = compile(nodes, [edge('m', 'out')]);
    expect(result.wgsl).toContain('+ 0.0)');
  });

  it('mathNode sub emits subtraction', () => {
    const nodes = [node('m', 'mathNode', { op: 'sub' }), node('out', 'output')];
    const result = compile(nodes, [edge('m', 'out')]);
    expect(result.wgsl).toContain('- 0.0)');
  });

  it('mathNode div guards against divide-by-zero with max(b, 0.0001)', () => {
    const nodes = [node('m', 'mathNode', { op: 'div' }), node('out', 'output')];
    const result = compile(nodes, [edge('m', 'out')]);
    expect(result.wgsl).toContain('max(');
    expect(result.wgsl).toContain('0.0001');
  });

  it('mathNode sin emits sin(a)', () => {
    const nodes = [node('m', 'mathNode', { op: 'sin' }), node('out', 'output')];
    const result = compile(nodes, [edge('m', 'out')]);
    expect(result.wgsl).toContain('sin(');
  });

  it('mathNode dot emits dot product', () => {
    const nodes = [node('m', 'mathNode', { op: 'dot' }), node('out', 'output')];
    const result = compile(nodes, [edge('m', 'out')]);
    expect(result.wgsl).toContain('dot(');
  });

  it('mathNode smoothstep emits smoothstep', () => {
    const nodes = [node('m', 'mathNode', { op: 'smoothstep' }), node('out', 'output')];
    const result = compile(nodes, [edge('m', 'out')]);
    expect(result.wgsl).toContain('smoothstep(');
  });

  it('mathNode fract emits fract', () => {
    const nodes = [node('m', 'mathNode', { op: 'fract' }), node('out', 'output')];
    const result = compile(nodes, [edge('m', 'out')]);
    expect(result.wgsl).toContain('fract(');
  });

  it('unknown mathNode op falls back to add', () => {
    const nodes = [node('m', 'mathNode', { op: 'unknown_op_xyz' }), node('out', 'output')];
    const result = compile(nodes, [edge('m', 'out')]);
    expect(result.ok).toBe(true);
    expect(result.wgsl).toContain('+');
  });
});

// ── 6. Vector nodes ───────────────────────────────────────────────────────────

describe('WGSLTranslator — vector nodes', () => {
  it('DotProduct node emits dot(a, b)', () => {
    const nodes = [node('dp', 'DotProduct'), node('out', 'output')];
    const result = compile(nodes, [edge('dp', 'out')]);
    expect(result.wgsl).toContain('dot(');
  });

  it('Normalize node emits normalize(...)', () => {
    const nodes = [node('norm', 'Normalize'), node('out', 'output')];
    const result = compile(nodes, [edge('norm', 'out')]);
    expect(result.wgsl).toContain('normalize(');
  });

  it('Mix node emits mix(a, b, t)', () => {
    const nodes = [node('mix', 'Mix'), node('out', 'output')];
    const result = compile(nodes, [edge('mix', 'out')]);
    expect(result.wgsl).toContain('mix(');
  });
});

// ── 7. Color nodes ────────────────────────────────────────────────────────────

describe('WGSLTranslator — color nodes', () => {
  it('ColorConstant node emits vec4f literal', () => {
    const nodes = [
      node('c', 'ColorConstant', { value: [0.8, 0.4, 0.2, 1.0] }),
      node('out', 'output'),
    ];
    const result = compile(nodes, [edge('c', 'out')]);
    expect(result.wgsl).toContain('vec4f(0.8, 0.4, 0.2, 1.0)');
  });

  it('ColorConstant without value emits white', () => {
    const nodes = [node('c', 'ColorConstant', {}), node('out', 'output')];
    const result = compile(nodes, [edge('c', 'out')]);
    expect(result.wgsl).toContain('vec4f(1.0, 1.0, 1.0, 1.0)');
  });

  it('HsvToRgb node emits HSV→RGB conversion expression', () => {
    const nodes = [node('hsv', 'HsvToRgb'), node('out', 'output')];
    const result = compile(nodes, [edge('hsv', 'out')]);
    expect(result.wgsl).toContain('fract(');
    expect(result.wgsl).toContain('clamp(');
  });
});

// ── 8. Texture nodes ──────────────────────────────────────────────────────────

describe('WGSLTranslator — texture nodes', () => {
  it('Texture2D node emits textureSample call', () => {
    const nodes = [node('tex', 'Texture2D'), node('out', 'output')];
    const result = compile(nodes, [edge('tex', 'out')]);
    expect(result.ok).toBe(true);
    expect(result.wgsl).toContain('textureSample(');
  });

  it('Texture2D node registers uniform binding', () => {
    const nodes = [node('tex', 'Texture2D'), node('out', 'output')];
    const result = compile(nodes, [edge('tex', 'out')]);
    expect(result.wgsl).toContain('@group(0) @binding(');
    expect(result.wgsl).toContain('texture_2d<f32>');
    expect(result.wgsl).toContain('var uTexture_');
    expect(result.wgsl).toContain('_sampler: sampler');
  });

  it('texture alias node also registers binding', () => {
    const nodes = [node('tex', 'texture'), node('out', 'output')];
    const result = compile(nodes, [edge('tex', 'out')]);
    expect(result.wgsl).toContain('texture_2d<f32>');
  });

  it('multiple texture nodes emit sequential binding indices', () => {
    const nodes = [node('t1', 'Texture2D'), node('t2', 'Texture2D'), node('out', 'output')];
    const result = compile(nodes, [edge('t1', 'out'), edge('t2', 'out')]);
    expect(result.ok).toBe(true);
    // Should have at least binding(0) and binding(2)
    expect(result.wgsl).toContain('@binding(0)');
    expect(result.wgsl).toContain('@binding(2)');
  });

  it('time uniform gets binding(0), texture gets binding(1) when both present', () => {
    const nodes = [node('t', 'TimeInput'), node('tex', 'Texture2D'), node('out', 'output')];
    const result = compile(nodes, [edge('t', 'out'), edge('tex', 'out')]);
    expect(result.wgsl).toContain('@binding(0)'); // Uniforms struct
    expect(result.wgsl).toContain('@binding(1)'); // texture_2d
    expect(result.wgsl).toContain('@binding(2)'); // sampler
  });
});

// ── 9. Procedural nodes ───────────────────────────────────────────────────────

describe('WGSLTranslator — procedural nodes', () => {
  it('NoiseNode emits snoise(...) call', () => {
    const nodes = [node('noise', 'NoiseNode'), node('out', 'output')];
    const result = compile(nodes, [edge('noise', 'out')]);
    expect(result.wgsl).toContain('snoise(');
  });

  it('NoiseNode triggers simplex noise helper function injection', () => {
    const nodes = [node('noise', 'NoiseNode'), node('out', 'output')];
    const result = compile(nodes, [edge('noise', 'out')]);
    expect(result.wgsl).toContain('fn snoise(v: vec2f)');
    expect(result.wgsl).toContain('fn permute(x: vec3f)');
  });

  it('VoronoiNode emits voronoi expression', () => {
    const nodes = [node('vor', 'VoronoiNode'), node('out', 'output')];
    const result = compile(nodes, [edge('vor', 'out')]);
    expect(result.wgsl).toContain('43758.5453');
  });

  it('GradientNode emits mix(colorA, colorB, uv.y)', () => {
    const nodes = [node('grad', 'GradientNode'), node('out', 'output')];
    const result = compile(nodes, [edge('grad', 'out')]);
    expect(result.wgsl).toContain('mix(');
    expect(result.wgsl).toContain('.y)');
  });
});

// ── 10. Utility nodes ─────────────────────────────────────────────────────────

describe('WGSLTranslator — utility nodes', () => {
  it('Clamp node emits clamp(x, min, max)', () => {
    const nodes = [node('cl', 'Clamp'), node('out', 'output')];
    const result = compile(nodes, [edge('cl', 'out')]);
    expect(result.wgsl).toContain('clamp(');
  });

  it('Remap node emits x * 2.0 - 1.0', () => {
    const nodes = [node('r', 'Remap'), node('out', 'output')];
    const result = compile(nodes, [edge('r', 'out')]);
    expect(result.wgsl).toContain('2.0 - 1.0');
  });

  it('FogNode emits exp(-density)', () => {
    const nodes = [node('fog', 'FogNode'), node('out', 'output')];
    const result = compile(nodes, [edge('fog', 'out')]);
    expect(result.wgsl).toContain('exp(-');
  });

  it('AmbientOcclusion emits curvature-based AO using normal derivatives', () => {
    const nodes = [node('ao', 'AmbientOcclusion'), node('out', 'output')];
    const result = compile(nodes, [edge('ao', 'out')]);
    expect(result.ok).toBe(true);
    // New geometric AO uses fwidth() of the normal to approximate crevice
    // darkening (replacement for the old `1.0` placeholder).
    expect(result.wgsl).toContain('fwidth');
    expect(result.wgsl).toContain('in.vNormal');
    // Output type must remain scalar f32 (the AO node contract).
    // The declaration should be `let var_ao: f32 = (...)`.
    expect(result.wgsl).toMatch(/let var_ao: f32 =/);
    // Inverted form so 1=lit, 0=fully occluded.
    expect(result.wgsl).toContain('1.0 - saturate(');
  });

  it('AmbientOcclusion output is deterministic across invocations', () => {
    const nodes = [node('ao', 'AmbientOcclusion'), node('out', 'output')];
    const edges = [edge('ao', 'out')];
    const a = compile(nodes, edges);
    const b = compile(nodes, edges);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    expect(a.wgsl).toBe(b.wgsl);
  });

  it('AmbientOcclusion accepts radius and strength via upstream edges', () => {
    const nodes = [
      node('r', 'float', { value: 2.5 }),
      node('s', 'float', { value: 0.75 }),
      node('ao', 'AmbientOcclusion'),
      node('out', 'output'),
    ];
    const result = compile(nodes, [
      edge('r', 'ao', 'radius'),
      edge('s', 'ao', 'strength'),
      edge('ao', 'out'),
    ]);
    expect(result.ok).toBe(true);
    // Upstream values should be wired into the AO expression.
    expect(result.wgsl).toContain('2.5');
    expect(result.wgsl).toContain('0.75');
  });

  it('CustomGLSL passthrough node emits upstream value', () => {
    const nodes = [
      node('f', 'float', { value: 0.42 }),
      node('glsl', 'CustomGLSL'),
      node('out', 'output'),
    ];
    const result = compile(nodes, [edge('f', 'glsl', 'input'), edge('glsl', 'out')]);
    expect(result.ok).toBe(true);
    // The result should propagate the float value
    expect(result.wgsl).toContain('0.42');
  });

  it('unknown node type falls back to 0.0', () => {
    const nodes = [node('unk', 'SomeUnknownNodeXYZ123'), node('out', 'output')];
    const result = compile(nodes, [edge('unk', 'out')]);
    expect(result.ok).toBe(true);
  });
});

// ── 11. PBR output ────────────────────────────────────────────────────────────

describe('WGSLTranslator — PBROutput node', () => {
  it('PBROutput emits full Cook-Torrance lighting model', () => {
    const nodes = [node('pbr', 'PBROutput')];
    const result = compile(nodes);
    expect(result.ok).toBe(true);
    expect(result.wgsl).toContain('let albedo =');
    expect(result.wgsl).toContain('let roughness =');
    expect(result.wgsl).toContain('let metallic =');
    expect(result.wgsl).toContain('let N = normalize(');
    expect(result.wgsl).toContain('let emission =');
  });

  it('PBROutput emits PBR lighting terms', () => {
    const result = compile([node('pbr', 'PBROutput')]);
    expect(result.wgsl).toContain('let lightDir =');
    expect(result.wgsl).toContain('let NdotL =');
    expect(result.wgsl).toContain('let NdotH =');
    expect(result.wgsl).toContain('let F0 = mix(');
    expect(result.wgsl).toContain('let fresnel =');
    expect(result.wgsl).toContain('let diffuse =');
    expect(result.wgsl).toContain('let specular =');
    expect(result.wgsl).toContain('let ambient =');
    expect(result.wgsl).toContain('let color =');
  });

  it('PBROutput returns vec4f(color, alpha)', () => {
    const result = compile([node('pbr', 'PBROutput')]);
    expect(result.wgsl).toContain('return vec4f(color,');
  });

  it('PBROutput falls back to PBR_DEFAULTS when no edges connected', () => {
    const result = compile([node('pbr', 'PBROutput')]);
    // Default albedo is vec3f(1.0, 1.0, 1.0)
    expect(result.wgsl).toContain('let albedo = vec3f(1.0, 1.0, 1.0)');
    // Default roughness is 0.5
    expect(result.wgsl).toContain('let roughness = 0.5');
    // Default metallic is 0.0
    expect(result.wgsl).toContain('let metallic = 0.0');
  });

  it('PBROutput uses connected albedo node when edge present', () => {
    const nodes = [node('color', 'vec3', { value: [1.0, 0.0, 0.0] }), node('pbr', 'PBROutput')];
    const edges_ = [edge('color', 'pbr', 'albedo')];
    const result = compile(nodes, edges_);
    expect(result.ok).toBe(true);
    // The resolved variable should replace the default albedo
    expect(result.wgsl).toContain('vec3f(1.0, 0.0, 0.0)');
    expect(result.wgsl).not.toContain('let albedo = vec3f(1.0, 1.0, 1.0)');
  });

  it('PBROutput uses connected roughness node when edge present', () => {
    const nodes = [node('rough', 'float', { value: 0.1 }), node('pbr', 'PBROutput')];
    const result = compile(nodes, [edge('rough', 'pbr', 'roughness')]);
    expect(result.ok).toBe(true);
    expect(result.wgsl).toContain('0.1');
    expect(result.wgsl).not.toContain('let roughness = 0.5');
  });

  it('PBROutput recognizes fallback output node type', () => {
    // 'output' type should also be found as output node
    const result = compile([node('out', 'output')]);
    expect(result.ok).toBe(true);
    expect(result.wgsl).toContain('return vec4f(1.0, 1.0, 1.0, 1.0)');
  });
});

// ── 12. Type inference ────────────────────────────────────────────────────────

describe('WGSLTranslator — type inference', () => {
  it('float node infers f32 type', () => {
    const nodes = [node('f', 'float', { value: 0.5 }), node('out', 'output')];
    const result = compile(nodes, [edge('f', 'out')]);
    expect(result.wgsl).toContain('let var_f: f32 =');
  });

  it('vec3 node infers vec3f type', () => {
    const nodes = [node('v', 'vec3', { value: [1, 0, 0] }), node('out', 'output')];
    const result = compile(nodes, [edge('v', 'out')]);
    expect(result.wgsl).toContain('let var_v: vec3f =');
  });

  it('vec4 node infers vec4f type', () => {
    const nodes = [node('v', 'vec4', { value: [1, 1, 1, 1] }), node('out', 'output')];
    const result = compile(nodes, [edge('v', 'out')]);
    expect(result.wgsl).toContain('let var_v: vec4f =');
  });

  it('UVInput node infers vec2f type', () => {
    const nodes = [node('uv', 'UVInput'), node('out', 'output')];
    const result = compile(nodes, [edge('uv', 'out')]);
    expect(result.wgsl).toContain('let var_uv: vec2f =');
  });

  it('NoiseNode infers f32 type', () => {
    const nodes = [node('noise', 'NoiseNode'), node('out', 'output')];
    const result = compile(nodes, [edge('noise', 'out')]);
    expect(result.wgsl).toContain('let var_noise: f32 =');
  });

  it('AddNode propagates widest upstream type (vec3 + vec3 = vec3f)', () => {
    const nodes = [
      node('a', 'vec3', { value: [1, 0, 0] }),
      node('b', 'vec3', { value: [0, 1, 0] }),
      node('add', 'AddNode'),
      node('out', 'output'),
    ];
    const result = compile(nodes, [
      edge('a', 'add', 'a'),
      edge('b', 'add', 'b'),
      edge('add', 'out'),
    ]);
    expect(result.wgsl).toContain('let var_add: vec3f =');
  });

  it('mathNode dot op always returns f32 regardless of vec inputs', () => {
    const nodes = [
      node('a', 'vec3', { value: [1, 0, 0] }),
      node('b', 'vec3', { value: [0, 1, 0] }),
      node('m', 'mathNode', { op: 'dot' }),
      node('out', 'output'),
    ];
    const result = compile(nodes, [edge('a', 'm', 'a'), edge('b', 'm', 'b'), edge('m', 'out')]);
    expect(result.wgsl).toContain('let var_m: f32 =');
  });
});

// ── 13. Topological resolution ────────────────────────────────────────────────

describe('WGSLTranslator — topological resolution', () => {
  it('resolves a chain of three nodes in order', () => {
    // float → sin → add → output
    const nodes = [
      node('f', 'float', { value: 1.0 }),
      node('sin', 'SinNode'),
      node('add', 'AddNode'),
      node('out', 'output'),
    ];
    const edges_ = [edge('f', 'sin', 'x'), edge('sin', 'add', 'a'), edge('add', 'out')];
    const result = compile(nodes, edges_);
    expect(result.ok).toBe(true);
    // All three variables should appear in body
    expect(result.wgsl).toContain('var_f');
    expect(result.wgsl).toContain('var_sin');
    expect(result.wgsl).toContain('var_add');
  });

  it('does not emit a node variable more than once (deduplication)', () => {
    // A diamond DAG: f → add.a AND f → add.b (same source)
    const nodes = [
      node('f', 'float', { value: 0.5 }),
      node('add', 'AddNode'),
      node('out', 'output'),
    ];
    const edges_ = [edge('f', 'add', 'a'), edge('f', 'add', 'b'), edge('add', 'out')];
    const result = compile(nodes, edges_);
    expect(result.ok).toBe(true);
    // var_f should appear exactly once as a let declaration
    const matches = result.wgsl!.match(/let var_f:/g);
    expect(matches).toHaveLength(1);
  });

  it('sanitizes node IDs with special characters in variable names', () => {
    const nodes = [node('node-with.special/chars', 'float', { value: 1.0 }), node('out', 'output')];
    const result = compile(nodes, [edge('node-with.special/chars', 'out')]);
    expect(result.ok).toBe(true);
    // Variable name should have special chars replaced with _
    expect(result.wgsl).toContain('var_node_with_special_chars');
  });
});

// ── 14. Compile idempotency ───────────────────────────────────────────────────

describe('WGSLTranslator — compile idempotency', () => {
  it('calling compile() twice on the same translator produces identical output', () => {
    const nodes = [node('v', 'vec3', { value: [0.5, 0.5, 0.5] }), node('pbr', 'PBROutput')];
    const edges_ = [edge('v', 'pbr', 'albedo')];
    const translator = new WGSLTranslator(nodes, edges_);
    const result1 = translator.compile();
    const result2 = translator.compile();
    expect(result1.wgsl).toEqual(result2.wgsl);
  });
});

// ── 15. Complex real-world graph ──────────────────────────────────────────────

describe('WGSLTranslator — complete PBR material graph', () => {
  it('compiles a full PBR graph: texture → albedo, noise → roughness, time → animated', () => {
    const nodes = [
      node('uv', 'UVInput'),
      node('time', 'TimeInput'),
      node('tex', 'Texture2D'),
      node('noise', 'NoiseNode'),
      node('albedo_color', 'vec3', { value: [0.8, 0.3, 0.1] }),
      node('mix_albedo', 'Mix'),
      node('pbr', 'PBROutput'),
    ];
    const edges_ = [
      edge('uv', 'tex', 'uv'),
      edge('uv', 'noise', 'uv'),
      edge('time', 'noise', 'scale'),
      edge('tex', 'mix_albedo', 'a'),
      edge('albedo_color', 'mix_albedo', 'b'),
      edge('mix_albedo', 'pbr', 'albedo'),
      edge('noise', 'pbr', 'roughness'),
    ];
    const result = compile(nodes, edges_);
    expect(result.ok).toBe(true);
    // Texture binding present
    expect(result.wgsl).toContain('texture_2d<f32>');
    // Time uniform present
    expect(result.wgsl).toContain('struct Uniforms');
    // Noise helper injected
    expect(result.wgsl).toContain('fn snoise');
    // PBR lighting present
    expect(result.wgsl).toContain('let lightDir =');
    expect(result.wgsl).toContain('return vec4f(color,');
  });
});
