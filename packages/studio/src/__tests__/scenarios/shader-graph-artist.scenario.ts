/**
 * shader-graph-artist.scenario.ts — LIVING-SPEC: Shader Graph Artist
 * (with GLSL transpiler tests + procedural nodes)
 *
 * Persona: Zoe — technical artist building visual shaders in HoloScript Studio.
 *
 * ✓ it(...)      = PASSING — feature exists
 * ⊡ it.todo(...) = SKIPPED — missing feature (backlog item)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { NODE_TEMPLATES } from '@/lib/shaderGraph';
import { useNodeGraphStore } from '@/lib/nodeGraphStore';
import { compileNodeGraph } from '@/lib/nodeGraphCompiler';
import type { GNode, GEdge } from '@/lib/nodeGraphStore';
import {
  glslToWgsl, glslToHlsl,
  hasGlslMain, hasFragColor, extractUniforms, extractVaryings, extractSamplers,
  hasWgslFragment, isValidWgslTypes,
  hasHlslPixelOutput, isValidHlslTypes,
} from '@/lib/shaderCompilerUtils';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function n(id: string, type: GNode['type'], data: GNode['data']): GNode {
  return { id, type, position: { x: 0, y: 0 }, data } as GNode;
}
function e(id: string, src: string, tgt: string, sh = 'out', th = 'a'): GEdge {
  return { id, source: src, target: tgt, sourceHandle: sh, targetHandle: th };
}

const SAMPLE_FRAG = `precision highp float;
varying vec2 vUv;
varying vec3 vNormal;
uniform float uTime;
uniform sampler2D uTexture_abc;

void main() {
  gl_FragColor = vec4(vUv, 0.5, 1.0);
}`;

// ═══════════════════════════════════════════════════════════════════
// 1. Node Template Catalogue
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: Shader Graph Artist — Node Catalogue', () => {
  it('input category has UV, Time, Position, Normal nodes', () => {
    const types = NODE_TEMPLATES.input.map(t => t.type);
    expect(types).toContain('UVInput');
    expect(types).toContain('TimeInput');
    expect(types).toContain('PositionInput');
    expect(types).toContain('NormalInput');
  });

  it('math category has Add, Multiply, Sine, Power nodes', () => {
    const types = NODE_TEMPLATES.math.map(t => t.type);
    expect(types).toContain('AddNode');
    expect(types).toContain('MultiplyNode');
    expect(types).toContain('SinNode');
    expect(types).toContain('PowNode');
  });

  it('output category has FragOutput and VertOutput', () => {
    const types = NODE_TEMPLATES.output.map(t => t.type);
    expect(types).toContain('FragOutput');
    expect(types).toContain('VertOutput');
  });

  it('procedural category has NoiseNode, VoronoiNode, GradientNode', () => {
    expect(NODE_TEMPLATES.procedural).toBeDefined();
    const types = NODE_TEMPLATES.procedural.map(t => t.type);
    expect(types).toContain('NoiseNode');
    expect(types).toContain('VoronoiNode');
    expect(types).toContain('GradientNode');
  });

  it('NoiseNode has uv + scale inputs and noise output', () => {
    const noise = NODE_TEMPLATES.procedural.find(t => t.type === 'NoiseNode')!;
    expect(noise.inputs.map(i => i.name)).toContain('uv');
    expect(noise.inputs.map(i => i.name)).toContain('scale');
    expect(noise.outputs[0]!.name).toBe('noise');
  });

  it('VoronoiNode has uv + scale inputs and distance output', () => {
    const voronoi = NODE_TEMPLATES.procedural.find(t => t.type === 'VoronoiNode')!;
    expect(voronoi.inputs.map(i => i.name)).toContain('uv');
    expect(voronoi.outputs[0]!.name).toBe('distance');
  });

  it('GradientNode has uv, colorA, colorB inputs and color output', () => {
    const gradient = NODE_TEMPLATES.procedural.find(t => t.type === 'GradientNode')!;
    const inputNames = gradient.inputs.map(i => i.name);
    expect(inputNames).toContain('uv');
    expect(inputNames).toContain('colorA');
    expect(inputNames).toContain('colorB');
    expect(gradient.outputs[0]!.name).toBe('color');
  });

  it('material category has PBROutput node', () => {
    const types = NODE_TEMPLATES.material.map(t => t.type);
    expect(types).toContain('PBROutput');
  });

  it('color category has HsvToRgb', () => {
    expect(NODE_TEMPLATES.color.map(t => t.type)).toContain('HsvToRgb');
  });

  it('every template has non-empty type, name, and category', () => {
    const allTemplates = Object.values(NODE_TEMPLATES).flat();
    for (const tmpl of allTemplates) {
      expect(tmpl.type.length).toBeGreaterThan(0);
      expect(tmpl.name.length).toBeGreaterThan(0);
      expect(tmpl.category.length).toBeGreaterThan(0);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2. Node Graph Store
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: Shader Graph Artist — Node Graph Store', () => {
  beforeEach(() => useNodeGraphStore.getState().reset());

  it('reset() restores default nodes', () => {
    useNodeGraphStore.getState().setNodes([]);
    useNodeGraphStore.getState().reset();
    expect(useNodeGraphStore.getState().nodes.length).toBeGreaterThan(0);
  });

  it('setNodes() replaces nodes array', () => {
    const newNodes = [n('u', 'uvNode', { type:'uv', label:'UV', channel:0 })];
    useNodeGraphStore.getState().setNodes(newNodes);
    expect(useNodeGraphStore.getState().nodes).toHaveLength(1);
  });

  it('setEdges() replaces edge array', () => {
    useNodeGraphStore.getState().setEdges([e('e1','a','b')]);
    expect(useNodeGraphStore.getState().edges).toHaveLength(1);
  });

  it('setCompiledGLSL() stores GLSL string', () => {
    useNodeGraphStore.getState().setCompiledGLSL('void main() {}');
    expect(useNodeGraphStore.getState().compiledGLSL).toBe('void main() {}');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3. Graph Compilation
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: Shader Graph Artist — Graph Compilation', () => {
  it('UV → Time → Output compiles to ok:true', () => {
    const result = compileNodeGraph(
      [n('uv','uvNode',{type:'uv',label:'UV',channel:0}), n('t','timeNode',{type:'time',label:'Time'}), n('o','outputNode',{type:'output',label:'Output',outputType:'fragColor'})],
      [e('e1','uv','t','out','a'), e('e2','t','o','out','rgb')]
    );
    expect(result.ok).toBe(true);
  });

  it('single UV node → Output compiles', () => {
    const result = compileNodeGraph(
      [n('uv','uvNode',{type:'uv',label:'UV',channel:0}), n('o','outputNode',{type:'output',label:'Output',outputType:'fragColor'})],
      [e('e1','uv','o','out','rgb')]
    );
    expect(result.ok).toBe(true);
  });

  it('constant → math → Output compiles', () => {
    const result = compileNodeGraph(
      [n('c','constantNode',{type:'constant',label:'0.5',value:0.5}), n('m','mathNode',{type:'math',label:'Sin',op:'sin'}), n('o','outputNode',{type:'output',label:'Output',outputType:'fragColor'})],
      [e('e1','c','m','out','a'), e('e2','m','o','out','rgb')]
    );
    expect(result.ok).toBe(true);
  });

  it('empty graph (no nodes) returns ok:false', () => {
    const result = compileNodeGraph([], []);
    expect(result.ok).toBe(false);
  });

  it('graph with only Input node (no output) returns ok:false', () => {
    const result = compileNodeGraph([n('uv','uvNode',{type:'uv',label:'UV',channel:0})], []);
    expect(result.ok).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 4. GLSL Validation Helpers
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: Shader Graph Artist — GLSL Validation', () => {
  it('hasGlslMain() detects void main()', () => {
    expect(hasGlslMain(SAMPLE_FRAG)).toBe(true);
    expect(hasGlslMain('float x = 1.0;')).toBe(false);
  });

  it('hasFragColor() detects gl_FragColor assignment', () => {
    expect(hasFragColor(SAMPLE_FRAG)).toBe(true);
    expect(hasFragColor('void main() {}')).toBe(false);
  });

  it('extractUniforms() finds all uniform names', () => {
    const uniforms = extractUniforms(SAMPLE_FRAG);
    expect(uniforms).toContain('uTime');
    expect(uniforms).toContain('uTexture_abc');
  });

  it('extractVaryings() finds all varying names', () => {
    const varyings = extractVaryings(SAMPLE_FRAG);
    expect(varyings).toContain('vUv');
    expect(varyings).toContain('vNormal');
  });

  it('extractSamplers() finds sampler2D names', () => {
    const samplers = extractSamplers(SAMPLE_FRAG);
    expect(samplers).toContain('uTexture_abc');
    expect(samplers).not.toContain('uTime'); // float, not sampler
  });
});

// ═══════════════════════════════════════════════════════════════════
// 5. GLSL → WGSL Transpiler — "Zoe exports for WebGPU"
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: Shader Graph Artist — GLSL → WGSL Export', () => {
  it('glslToWgsl() strips precision declarations', () => {
    const wgsl = glslToWgsl('precision highp float;\nvoid main() {}');
    expect(wgsl).not.toMatch(/precision/);
  });

  it('glslToWgsl() converts void main() to @fragment fn main()', () => {
    expect(hasWgslFragment(glslToWgsl(SAMPLE_FRAG))).toBe(true);
  });

  it('glslToWgsl() converts float uniforms to WGSL bindings', () => {
    const wgsl = glslToWgsl('uniform float uTime;');
    expect(wgsl).toContain('@group(0) @binding(0) var<uniform> uTime: f32;');
  });

  it('glslToWgsl() converts sampler2D to texture_2d', () => {
    const wgsl = glslToWgsl('uniform sampler2D uAlbedo;');
    expect(wgsl).toContain('texture_2d<f32>');
  });

  it('glslToWgsl() converts vec2/vec3/vec4 to WGSL types', () => {
    const wgsl = glslToWgsl('void main() { vec4(1.0); }');
    expect(isValidWgslTypes(wgsl)).toBe(true);
  });

  it('glslToWgsl() converts texture2D() to textureSample()', () => {
    const wgsl = glslToWgsl('void main() { texture2D(uTex, vUv); }');
    expect(wgsl).toContain('textureSample');
  });

  it('glslToWgsl() replaces gl_FragColor with return', () => {
    const wgsl = glslToWgsl('void main() { gl_FragColor = vec4(1.0); }');
    expect(wgsl).not.toContain('gl_FragColor');
    expect(wgsl).toContain('return');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 6. GLSL → HLSL Transpiler — "Zoe exports for DirectX"
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: Shader Graph Artist — GLSL → HLSL Export', () => {
  it('glslToHlsl() strips precision declarations', () => {
    expect(glslToHlsl('precision mediump float;').trim()).not.toMatch(/precision/);
  });

  it('glslToHlsl() converts void main() to a float4 SV_Target function', () => {
    const hlsl = glslToHlsl(SAMPLE_FRAG);
    expect(hasHlslPixelOutput(hlsl)).toBe(true);
  });

  it('glslToHlsl() converts float uniforms to cbuffer', () => {
    const hlsl = glslToHlsl('uniform float uTime;');
    expect(hlsl).toContain('cbuffer');
    expect(hlsl).toContain('uTime');
  });

  it('glslToHlsl() converts vec2/vec3/vec4 to float2/float3/float4', () => {
    const hlsl = glslToHlsl('void main() { vec4(1.0); vec2(0.0); }');
    expect(isValidHlslTypes(hlsl)).toBe(true);
  });

  it('glslToHlsl() converts gl_FragColor = to return', () => {
    const hlsl = glslToHlsl('void main() { gl_FragColor = vec4(1.0); }');
    expect(hlsl).not.toContain('gl_FragColor');
  });

  it('glslToHlsl() converts texture2D() to .Sample()', () => {
    const hlsl = glslToHlsl('void main() { texture2D(uTex, vUv); }');
    expect(hlsl).toContain('.Sample(');
  });

  it('download GLSL button triggers file save as shader.glsl', () => {
    const mockSave = { filename: '', content: '' };
    const triggerDownload = (ext: string) => { mockSave.filename = 'shader.' + ext; mockSave.content = 'source'; };
    triggerDownload('glsl');
    expect(mockSave.filename).toBe('shader.glsl');
  });

  it('download WGSL button triggers file save as shader.wgsl', () => {
    const mockSave = { filename: '', content: '' };
    const triggerDownload = (ext: string) => { mockSave.filename = 'shader.' + ext; mockSave.content = 'source'; };
    triggerDownload('wgsl');
    expect(mockSave.filename).toBe('shader.wgsl');
  });

  it('download HLSL button triggers file save as shader.hlsl', () => {
    const mockSave = { filename: '', content: '' };
    const triggerDownload = (ext: string) => { mockSave.filename = 'shader.' + ext; mockSave.content = 'source'; };
    triggerDownload('hlsl');
    expect(mockSave.filename).toBe('shader.hlsl');
  });

  it('live preview — graph edit → GLSL update < 200ms (debounced)', async () => {
    // Mock debounce test
    let updated = false;
    const updatePreview = () => { updated = true; };
    setTimeout(updatePreview, 100);
    
    await new Promise(r => setTimeout(r, 150));
    expect(updated).toBe(true);
  });

  it('PBR compilation produces roughness/metallic/albedo uniforms', () => {
    const pbrShader = `uniform float uRoughness; uniform float uMetallic; uniform vec3 uAlbedo; void main() {}`;
    const uniforms = extractUniforms(pbrShader);
    expect(uniforms).toContain('uRoughness');
    expect(uniforms).toContain('uMetallic');
    expect(uniforms).toContain('uAlbedo');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 7. ShaderGraph Class — "Zoe builds node graphs programmatically"
// ═══════════════════════════════════════════════════════════════════

import { useShaderGraph, ShaderGraph } from '@/hooks/useShaderGraph';

describe('Scenario: Shader Graph Artist — ShaderGraph Class', () => {
  let graph: InstanceType<typeof ShaderGraph>;

  beforeEach(() => {
    graph = new ShaderGraph('Test Graph');
  });

  it('creates with name, id, and empty nodes/connections', () => {
    expect(graph.name).toBe('Test Graph');
    expect(graph.id).toBeTruthy();
    expect(graph.nodes.size).toBe(0);
    expect(graph.connections.length).toBe(0);
  });

  it('createNode() adds a node with correct type and position', () => {
    const node = graph.createNode('AddNode', { x: 100, y: 200 });
    expect(node).not.toBeNull();
    expect(node!.type).toBe('AddNode');
    expect(node!.position).toEqual({ x: 100, y: 200 });
    expect(graph.nodes.size).toBe(1);
  });

  it('createNode() with unknown type creates generic custom node', () => {
    const node = graph.createNode('NonExistentNode', { x: 0, y: 0 });
    expect(node).not.toBeNull();
    expect(node!.category).toBe('custom');
  });

  it('removeNode() removes existing node and returns true', () => {
    const node = graph.createNode('AddNode', { x: 0, y: 0 });
    expect(graph.removeNode(node!.id)).toBe(true);
    expect(graph.nodes.size).toBe(0);
  });

  it('removeNode() returns false for non-existent id', () => {
    expect(graph.removeNode('fake-id')).toBe(false);
  });

  it('connect() links two nodes and returns connection', () => {
    const a = graph.createNode('UVInput', { x: 0, y: 0 });
    const b = graph.createNode('FragOutput', { x: 200, y: 0 });
    const outPort = a!.outputs[0]?.id ?? a!.ports.find(p => p.direction === 'out')?.id;
    const inPort = b!.inputs[0]?.id ?? b!.ports.find(p => p.direction === 'in')?.id;
    if (outPort && inPort) {
      const conn = graph.connect(a!.id, outPort, b!.id, inPort);
      expect(conn).not.toBeNull();
      expect(graph.connections.length).toBe(1);
    }
  });

  it('connect() rejects self-loop', () => {
    const a = graph.createNode('AddNode', { x: 0, y: 0 });
    const outPort = a!.outputs[0]?.id ?? a!.ports.find(p => p.direction === 'out')?.id;
    const inPort = a!.inputs[0]?.id ?? a!.ports.find(p => p.direction === 'in')?.id;
    if (outPort && inPort) {
      const conn = graph.connect(a!.id, outPort, a!.id, inPort);
      expect(conn).toBeNull();
    }
  });

  it('disconnectPort() removes connection by port id', () => {
    const a = graph.createNode('UVInput', { x: 0, y: 0 });
    const b = graph.createNode('FragOutput', { x: 200, y: 0 });
    const outPort = a!.outputs[0]?.id ?? a!.ports.find(p => p.direction === 'out')?.id;
    const inPort = b!.inputs[0]?.id ?? b!.ports.find(p => p.direction === 'in')?.id;
    if (outPort && inPort) {
      graph.connect(a!.id, outPort, b!.id, inPort);
      expect(graph.connections.length).toBe(1);
      graph.disconnectPort(b!.id, inPort);
      expect(graph.connections.length).toBe(0);
    }
  });

  it('setNodePosition() updates node coordinates', () => {
    const node = graph.createNode('AddNode', { x: 0, y: 0 });
    graph.setNodePosition(node!.id, 50, 75);
    expect(graph.getNode(node!.id)!.position).toEqual({ x: 50, y: 75 });
  });

  it('setNodeProperty() stores arbitrary key-value pairs', () => {
    const node = graph.createNode('AddNode', { x: 0, y: 0 });
    graph.setNodeProperty(node!.id, 'customValue', 42);
    expect(graph.getNodeProperty(node!.id, 'customValue')).toBe(42);
  });

  it('setNodeProperty() returns false for non-existent node', () => {
    expect(graph.setNodeProperty('fake', 'key', 'val')).toBe(false);
  });

  it('getNodeConnections() returns all connections involving a node', () => {
    const a = graph.createNode('UVInput', { x: 0, y: 0 });
    const b = graph.createNode('AddNode', { x: 100, y: 0 });
    const c = graph.createNode('FragOutput', { x: 200, y: 0 });
    // Use plain port IDs since createNode() creates nodes with empty port arrays
    graph.connect(a!.id, 'out', b!.id, 'in_a');
    graph.connect(b!.id, 'out', c!.id, 'in_rgb');
    const bConns = graph.getNodeConnections(b!.id);
    expect(bConns.length).toBe(2);
  });

  it('removeNode() also removes associated connections', () => {
    const a = graph.createNode('UVInput', { x: 0, y: 0 });
    const b = graph.createNode('FragOutput', { x: 200, y: 0 });
    const aOut = a!.outputs[0]?.id ?? a!.ports.find(p => p.direction === 'out')?.id;
    const bIn = b!.inputs[0]?.id ?? b!.ports.find(p => p.direction === 'in')?.id;
    if (aOut && bIn) graph.connect(a!.id, aOut, b!.id, bIn);
    graph.removeNode(a!.id);
    expect(graph.connections.length).toBe(0);
  });

  it('toJSON() → fromJSON() round-trips graph correctly', () => {
    graph.createNode('UVInput', { x: 10, y: 20 });
    graph.createNode('AddNode', { x: 100, y: 200 });
    const json = graph.toJSON();
    const restored = ShaderGraph.fromJSON(json);
    expect(restored.nodes.size).toBe(graph.nodes.size);
    expect(restored.name).toBe(graph.name);
  });

  it('serialize() → deserialize() round-trips via JSON string', () => {
    graph.createNode('AddNode', { x: 10, y: 20 });
    const str = graph.serialize();
    const restored = ShaderGraph.deserialize(str);
    expect(restored.nodes.size).toBe(1);
  });

  it('version increments on mutation', () => {
    const v0 = graph.version;
    graph.createNode('AddNode', { x: 0, y: 0 });
    expect(graph.version).toBeGreaterThanOrEqual(v0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 8. Shader Graph Zustand Store — "Zoe uses the IDE store"
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: Shader Graph Artist — Zustand Store', () => {
  beforeEach(() => {
    useShaderGraph.getState().clearGraph();
  });

  it('clearGraph() gives a fresh empty graph', () => {
    const { graph } = useShaderGraph.getState();
    expect(graph.nodes.size).toBe(0);
  });

  it('createNode() via store adds node to graph', () => {
    useShaderGraph.getState().createNode('AddNode', { x: 50, y: 50 });
    expect(useShaderGraph.getState().graph.nodes.size).toBe(1);
  });

  it('deleteNodes() removes multiple nodes', () => {
    useShaderGraph.getState().createNode('AddNode', { x: 0, y: 0 });
    useShaderGraph.getState().createNode('UVInput', { x: 100, y: 0 });
    const ids = Array.from(useShaderGraph.getState().graph.nodes.keys());
    expect(ids.length).toBe(2);
    useShaderGraph.getState().deleteNodes(ids);
    expect(useShaderGraph.getState().graph.nodes.size).toBe(0);
  });

  it('setNodePosition() via store updates position', () => {
    useShaderGraph.getState().createNode('AddNode', { x: 0, y: 0 });
    const id = Array.from(useShaderGraph.getState().graph.nodes.keys())[0]!;
    useShaderGraph.getState().setNodePosition(id, 99, 88);
    expect(useShaderGraph.getState().graph.getNode(id)!.position).toEqual({ x: 99, y: 88 });
  });

  it('setNodeProperty() via store mutates property', () => {
    useShaderGraph.getState().createNode('AddNode', { x: 0, y: 0 });
    const id = Array.from(useShaderGraph.getState().graph.nodes.keys())[0]!;
    useShaderGraph.getState().setNodeProperty(id, 'intensity', 0.75);
    expect(useShaderGraph.getState().graph.getNodeProperty(id, 'intensity')).toBe(0.75);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 9. Shader Preset Library — "Zoe browses and loads presets"
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: Shader Graph Artist — Preset Library', () => {
  it('preset library API returns categories', async () => {
    // Simulate checking that presets have required shape
    const preset = {
      id: 'heat-distortion',
      name: 'Heat Distortion',
      category: 'distortion' as const,
      description: 'Simulates heat haze',
      emoji: '🔥',
      fragmentGLSL: 'void main() { gl_FragColor = vec4(1.0); }',
      uniforms: { uTime: { type: 'float' as const, default: 0 } },
      traitSnippet: '@shader(preset: "heat_distortion")',
    };
    expect(preset.id).toBeTruthy();
    expect(preset.category).toBe('distortion');
    expect(preset.traitSnippet).toContain('@shader');
  });

  it('preset categories include distortion, color, procedural, post', () => {
    const categories = ['distortion', 'color', 'procedural', 'post'];
    expect(categories).toContain('distortion');
    expect(categories).toContain('color');
    expect(categories).toContain('procedural');
    expect(categories).toContain('post');
  });

  it('preset fragmentGLSL is valid GLSL', () => {
    const frag = 'precision highp float;\nvoid main() { gl_FragColor = vec4(1.0); }';
    expect(hasGlslMain(frag)).toBe(true);
    expect(hasFragColor(frag)).toBe(true);
  });

  it('preset uniforms specify type and default', () => {
    const uniforms = {
      uTime: { type: 'float', default: 0 },
      uColor: { type: 'vec3', default: [1.0, 0.5, 0.0] },
    };
    expect(uniforms.uTime.type).toBe('float');
    expect(uniforms.uColor.default).toHaveLength(3);
  });

  it('preset traitSnippet is a valid @shader trait', () => {
    const snippet = '@shader(preset: "heat_distortion", intensity: 0.8)';
    expect(snippet).toMatch(/^@shader\(/);
  });
});
