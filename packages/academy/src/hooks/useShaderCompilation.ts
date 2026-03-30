/**
 * Shader Compilation Hook
 *
 * Live graph→GLSL compilation with debouncing, error handling,
 * and export helpers for GLSL / WGSL / HLSL.
 *
 * The compiler does a real topological traversal of the node graph:
 *  1. Find the Output node.
 *  2. Walk backwards through connections, collecting needed nodes.
 *  3. Emit one GLSL function per node type.
 *  4. Stitch uniforms + functions + main() together.
 */

import { useState, useEffect, useCallback } from 'react';
import { useShaderGraph } from './useShaderGraph';
import type { ShaderNode, ShaderConnection } from './useShaderGraph';

// ── Output types ──────────────────────────────────────────────────────────────

interface ShaderUniform {
  name: string;
  type: string;
  value?: unknown;
}

export interface ICompiledShader {
  vertexCode: string;
  fragmentCode: string;
  uniforms: ShaderUniform[];
  textures: string[];
  warnings: string[];
  errors: string[];
}

// ── Topological compiler ──────────────────────────────────────────────────────

/** Returns a snake_case variable name for a node output. */
function varName(nodeId: string, portName = 'result') {
  return `v_${nodeId.replace(/-/g, '_')}_${portName}`;
}

/** Returns the GLSL type for a shader data type string. */
function glslType(t: string): string {
  const map: Record<string, string> = {
    float: 'float',
    int: 'int',
    bool: 'bool',
    vec2: 'vec2',
    vec3: 'vec3',
    vec4: 'vec4',
    mat2: 'mat2',
    mat3: 'mat3',
    mat4: 'mat4',
    sampler2D: 'sampler2D',
    samplerCube: 'samplerCube',
    ivec2: 'ivec2',
    ivec3: 'ivec3',
    ivec4: 'ivec4',
  };
  return map[t] ?? 'float';
}

/** Tracks unknown node types so we don't emit duplicate warnings. */
const _warnedNodeTypes = new Set<string>();

/** Emit a GLSL expression for a single node. */
function emitNodeExpr(
  node: ShaderNode,
  connections: ShaderConnection[],
  resolvedPorts: Map<string, string> // portId → GLSL expression
): string {
  const getInput = (portId?: string, fallback = '0.0') =>
    portId ? (resolvedPorts.get(portId) ?? fallback) : fallback;

  switch (node.type) {
    // ── Inputs ──────────────────────────────────────────────────────────────
    case 'UVInput':
      return 'vUv';
    case 'TimeInput':
      return 'uTime';
    case 'PositionInput':
      return 'vPosition';
    case 'NormalInput':
      return 'vNormal';

    // ── Constants ──────────────────────────────────────────────────────────
    case 'ColorConstant': {
      const r = node.properties['r'] ?? 1.0;
      const g = node.properties['g'] ?? 0.0;
      const b = node.properties['b'] ?? 1.0;
      const a = node.properties['a'] ?? 1.0;
      return `vec4(${r}, ${g}, ${b}, ${a})`;
    }

    // ── Math ────────────────────────────────────────────────────────────────
    case 'AddNode': {
      const a = getInput(node.inputs[0]?.id, '0.0');
      const b = getInput(node.inputs[1]?.id, '0.0');
      return `(${a} + ${b})`;
    }
    case 'MultiplyNode': {
      const a = getInput(node.inputs[0]?.id, '1.0');
      const b = getInput(node.inputs[1]?.id, '1.0');
      return `(${a} * ${b})`;
    }
    case 'SinNode': {
      const x = getInput(node.inputs[0]?.id, 'uTime');
      return `sin(${x})`;
    }
    case 'PowNode': {
      const base = getInput(node.inputs[0]?.id, '1.0');
      const exp = getInput(node.inputs[1]?.id, '2.0');
      return `pow(${base}, ${exp})`;
    }

    // ── Vector ──────────────────────────────────────────────────────────────
    case 'DotProduct': {
      const a = getInput(node.inputs[0]?.id, 'vec3(0.0)');
      const b = getInput(node.inputs[1]?.id, 'vec3(0.0)');
      return `dot(${a}, ${b})`;
    }
    case 'Normalize': {
      const v = getInput(node.inputs[0]?.id, 'vec3(0.0, 1.0, 0.0)');
      return `normalize(${v})`;
    }
    case 'Mix': {
      const a = getInput(node.inputs[0]?.id, 'vec4(0.0)');
      const b = getInput(node.inputs[1]?.id, 'vec4(1.0)');
      const t = getInput(node.inputs[2]?.id, '0.5');
      return `mix(${a}, ${b}, ${t})`;
    }

    // ── Utility ─────────────────────────────────────────────────────────────
    case 'Clamp': {
      const x = getInput(node.inputs[0]?.id, '0.5');
      const min = getInput(node.inputs[1]?.id, '0.0');
      const max = getInput(node.inputs[2]?.id, '1.0');
      return `clamp(${x}, ${min}, ${max})`;
    }
    case 'Remap': {
      const x = getInput(node.inputs[0]?.id, '0.5');
      return `(${x} * 2.0 - 1.0)`;
    }

    // ── Color ───────────────────────────────────────────────────────────────
    case 'HsvToRgb': {
      const hsv = getInput(node.inputs[0]?.id, 'vec3(0.5, 1.0, 1.0)');
      // Inline HSV→RGB
      return `(vec4(clamp(abs(fract(${hsv}.x + vec3(1.0,2.0/3.0,1.0/3.0)) * 6.0 - 3.0) - 1.0, 0.0, 1.0) * ${hsv}.z, 1.0))`;
    }

    // ── Texture ─────────────────────────────────────────────────────────────
    case 'Texture2D': {
      const uv = getInput(node.inputs[0]?.id, 'vUv');
      const samplerName = `uTexture_${node.id.replace(/-/g, '_')}`;
      return `texture2D(${samplerName}, ${uv})`;
    }

    // ── Output (handled outside emitNodeExpr) ──────────────────────────────
    case 'FragOutput':
    case 'VertOutput':
    case 'PBROutput':
      return 'vec4(1.0)';

    // ── Extended Math ───────────────────────────────────────────────────────
    case 'SubtractNode': {
      const a = getInput(node.inputs[0]?.id, '0.0');
      const b = getInput(node.inputs[1]?.id, '0.0');
      return `(${a} - ${b})`;
    }
    case 'DivideNode': {
      const a = getInput(node.inputs[0]?.id, '1.0');
      const b = getInput(node.inputs[1]?.id, '1.0');
      return `(${a} / max(${b}, 0.0001))`;
    }
    case 'AbsNode': {
      const x = getInput(node.inputs[0]?.id, '0.0');
      return `abs(${x})`;
    }
    case 'FloorNode': {
      const x = getInput(node.inputs[0]?.id, '0.0');
      return `floor(${x})`;
    }
    case 'CeilNode': {
      const x = getInput(node.inputs[0]?.id, '0.0');
      return `ceil(${x})`;
    }
    case 'FractNode': {
      const x = getInput(node.inputs[0]?.id, '0.0');
      return `fract(${x})`;
    }
    case 'SqrtNode': {
      const x = getInput(node.inputs[0]?.id, '1.0');
      return `sqrt(max(${x}, 0.0))`;
    }
    case 'ExpNode': {
      const x = getInput(node.inputs[0]?.id, '0.0');
      return `exp(${x})`;
    }
    case 'LogNode': {
      const x = getInput(node.inputs[0]?.id, '1.0');
      return `log(max(${x}, 0.0001))`;
    }
    case 'CosNode': {
      const x = getInput(node.inputs[0]?.id, 'uTime');
      return `cos(${x})`;
    }
    case 'TanNode': {
      const x = getInput(node.inputs[0]?.id, '0.0');
      return `tan(${x})`;
    }
    case 'AtanNode': {
      const x = getInput(node.inputs[0]?.id, '0.0');
      return `atan(${x})`;
    }
    case 'ModNode': {
      const a = getInput(node.inputs[0]?.id, '1.0');
      const b = getInput(node.inputs[1]?.id, '1.0');
      return `mod(${a}, ${b})`;
    }
    case 'MaxNode': {
      const a = getInput(node.inputs[0]?.id, '0.0');
      const b = getInput(node.inputs[1]?.id, '0.0');
      return `max(${a}, ${b})`;
    }
    case 'MinNode': {
      const a = getInput(node.inputs[0]?.id, '0.0');
      const b = getInput(node.inputs[1]?.id, '0.0');
      return `min(${a}, ${b})`;
    }
    case 'StepNode': {
      const edge = getInput(node.inputs[0]?.id, '0.5');
      const x = getInput(node.inputs[1]?.id, '0.0');
      return `step(${edge}, ${x})`;
    }
    case 'SmoothstepNode': {
      const e0 = getInput(node.inputs[0]?.id, '0.0');
      const e1 = getInput(node.inputs[1]?.id, '1.0');
      const x = getInput(node.inputs[2]?.id, '0.5');
      return `smoothstep(${e0}, ${e1}, ${x})`;
    }

    // ── Extended Vector ──────────────────────────────────────────────────────
    case 'LengthNode': {
      const v = getInput(node.inputs[0]?.id, 'vec3(0.0)');
      return `length(${v})`;
    }
    case 'CrossProduct': {
      const a = getInput(node.inputs[0]?.id, 'vec3(1.0, 0.0, 0.0)');
      const b = getInput(node.inputs[1]?.id, 'vec3(0.0, 0.0, 1.0)');
      return `cross(${a}, ${b})`;
    }
    case 'ReflectNode': {
      const i = getInput(node.inputs[0]?.id, 'vNormal');
      const n = getInput(node.inputs[1]?.id, 'vec3(0.0, 1.0, 0.0)');
      return `reflect(${i}, ${n})`;
    }
    case 'FresnelNode': {
      const power = getInput(node.inputs[1]?.id, '2.0');
      return `pow(1.0 - abs(dot(normalize(vNormal), vec3(0.0, 0.0, 1.0))), ${power})`;
    }

    // ── Procedural ──────────────────────────────────────────────────────────
    case 'NoiseNode': {
      const uv = getInput(node.inputs[0]?.id, 'vUv');
      const scale = getInput(node.inputs[1]?.id, '10.0');
      return `fract(sin(dot(${uv} * ${scale}, vec2(127.1, 311.7))) * 43758.5453)`;
    }
    case 'VoronoiNode': {
      const uv = getInput(node.inputs[0]?.id, 'vUv');
      const scale = getInput(node.inputs[1]?.id, '5.0');
      return `(1.0 - fract(sin(dot(floor(${uv} * ${scale}), vec2(127.1, 311.7))) * 43758.5453))`;
    }
    case 'GradientNode': {
      const uv = getInput(node.inputs[0]?.id, 'vUv');
      const c1 = getInput(node.inputs[1]?.id, 'vec4(0.0, 0.0, 0.0, 1.0)');
      const c2 = getInput(node.inputs[2]?.id, 'vec4(1.0, 1.0, 1.0, 1.0)');
      return `mix(${c1}, ${c2}, ${uv}.y)`;
    }

    default: {
      _warnedNodeTypes.add(node.type);
      return `/* unknown: ${node.type} */ 0.0`;
    }
  }
}

/** Topological sort: returns nodes in dependency order (deepest first). */
function topoSort(
  outputNodeId: string,
  nodes: Map<string, ShaderNode>,
  connections: ShaderConnection[]
): ShaderNode[] {
  const visited = new Set<string>();
  const order: ShaderNode[] = [];

  const visit = (nodeId: string) => {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    // Find all upstream nodes (nodes whose output feeds into this node's inputs)
    const incomingConns = connections.filter((c) => c.toNodeId === nodeId);
    for (const conn of incomingConns) {
      visit(conn.fromNodeId);
    }
    const node = nodes.get(nodeId);
    if (node) order.push(node);
  };

  visit(outputNodeId);
  return order;
}

/** Main compiler: produces ICompiledShader from the graph. */
function compileGraph(
  nodes: Map<string, ShaderNode>,
  connections: ShaderConnection[]
): ICompiledShader {
  const warnings: string[] = [];

  // 1. Find output node
  const outputNode = [...nodes.values()].find(
    (n) => n.category === 'output' || n.type === 'FragOutput' || n.type === 'PBROutput'
  );
  if (!outputNode) {
    return {
      vertexCode: '',
      fragmentCode: '',
      uniforms: [],
      textures: [],
      warnings: ['No output node found — add a Fragment Output node.'],
      errors: [],
    };
  }

  // 2. Topological sort
  const sorted = topoSort(outputNode.id, nodes, connections);

  // 3. Build resolved port expressions via traversal
  const resolvedPorts = new Map<string, string>(); // portId → GLSL expr
  const lines: string[] = [];
  const usedUniforms = new Set<string>();
  const usedTextures: string[] = [];

  for (const node of sorted) {
    if (node.id === outputNode.id) continue; // output handled separately

    // Resolve input port expressions
    for (const inPort of node.inputs) {
      const conn = connections.find((c) => c.toNodeId === node.id && c.toPort === inPort.id);
      if (conn) {
        const fromNode = nodes.get(conn.fromNodeId);
        if (fromNode) {
          const fromPort = fromNode.outputs.find(
            (p: { id?: string; name: string }) => p.id === conn.fromPort
          );
          if (fromPort?.id && inPort.id) {
            resolvedPorts.set(inPort.id, varName(conn.fromNodeId, fromPort.name));
          }
        }
      } else if (inPort.defaultValue !== undefined) {
        const dv = inPort.defaultValue;
        if (inPort.id) {
          resolvedPorts.set(
            inPort.id,
            Array.isArray(dv) ? `vec${dv.length}(${dv.join(',')})` : String(dv)
          );
        }
      }
    }

    // Detect texture nodes
    if (node.type === 'Texture2D') {
      const samplerName = `uTexture_${node.id.replace(/-/g, '_')}`;
      usedTextures.push(samplerName);
    }

    // Emit variable assignment for each output port
    for (const outPort of node.outputs) {
      const expr = emitNodeExpr(node, connections, resolvedPorts);
      const type = glslType(outPort.type);
      const vName = varName(node.id, outPort.name);
      lines.push(`  ${type} ${vName} = ${type}(${expr});`);
      if (outPort.id) {
        resolvedPorts.set(outPort.id, vName);
      }
    }

    if (node.type === 'TimeInput') usedUniforms.add('uTime');
  }

  // 4. Resolve output expression
  const outputInputPort = outputNode.inputs[0];
  let outputExpr = 'vec4(vUv, 0.5 + 0.5 * sin(uTime), 1.0)';
  usedUniforms.add('uTime');

  if (outputInputPort) {
    const conn = connections.find(
      (c) => c.toNodeId === outputNode.id && c.toPort === outputInputPort.id
    );
    if (conn) {
      const fromNode = nodes.get(conn.fromNodeId);
      if (fromNode) {
        const fromPort = fromNode.outputs.find(
          (p: { id?: string; name: string }) => p.id === conn.fromPort
        );
        if (fromPort?.id) {
          outputExpr = resolvedPorts.get(fromPort.id) ?? outputExpr;
        }
      }
    }
  }

  // 5. Assemble fragment shader
  const uniformLines = [
    'uniform float uTime;',
    ...usedTextures.map((t) => `uniform sampler2D ${t};`),
  ].join('\n');

  const fragmentCode = [
    'precision highp float;',
    'varying vec2 vUv;',
    'varying vec3 vPosition;',
    'varying vec3 vNormal;',
    uniformLines,
    '',
    'void main() {',
    ...lines,
    `  gl_FragColor = vec4(${outputExpr});`,
    '}',
  ].join('\n');

  // 6. Vertex shader (pass-through with varyings)
  const vertexCode = [
    'precision highp float;',
    'varying vec2 vUv;',
    'varying vec3 vPosition;',
    'varying vec3 vNormal;',
    '',
    'void main() {',
    '  vUv = uv;',
    '  vPosition = position;',
    '  vNormal = normal;',
    '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
    '}',
  ].join('\n');

  const uniforms: ShaderUniform[] = [{ name: 'uTime', type: 'float', value: 0 }];
  for (const tex of usedTextures) {
    uniforms.push({ name: tex, type: 'sampler2D', value: null });
  }

  return { vertexCode, fragmentCode, uniforms, textures: usedTextures, warnings, errors: [] };
}

// ── GLSL → WGSL minimal transpiler ─────────────────────────────────────────

/** Very basic GLSL → WGSL conversion for the export feature. */
function glslToWgsl(glsl: string): string {
  return glsl
    .replace(/precision\s+\w+\s+float;/g, '')
    .replace(/varying\s+/g, '// varying ')
    .replace(/uniform\s+float\s+(\w+);/g, '@group(0) @binding(0) var<uniform> $1: f32;')
    .replace(/uniform\s+sampler2D\s+(\w+);/g, '@group(0) @binding(1) var $1: texture_2d<f32>;')
    .replace(/void main\(\)/g, '@fragment fn main()')
    .replace(/gl_FragColor/g, 'return')
    .replace(/vec2\(/g, 'vec2f(')
    .replace(/vec3\(/g, 'vec3f(')
    .replace(/vec4\(/g, 'vec4f(')
    .replace(/float\(/g, 'f32(')
    .replace(/\bfloat\b/g, 'f32')
    .replace(/texture2D\((\w+),\s*(\w+)\)/g, 'textureSample($1, $1_sampler, $2)')
    .trim();
}

/** Very basic GLSL → HLSL conversion for the export feature. */
function glslToHlsl(glsl: string): string {
  return glsl
    .replace(/precision\s+\w+\s+float;/g, '')
    .replace(/varying\s+vec2\s+(\w+);/g, 'struct PS_Input { float2 $1 : TEXCOORD0; };')
    .replace(/uniform\s+float\s+(\w+);/g, 'cbuffer Constants : register(b0) { float $1; };')
    .replace(/void main\(\)/g, 'float4 main(PS_Input input) : SV_Target')
    .replace(/gl_FragColor\s*=/g, 'return')
    .replace(/vec2\(/g, 'float2(')
    .replace(/vec3\(/g, 'float3(')
    .replace(/vec4\(/g, 'float4(')
    .replace(/texture2D\((\w+),\s*(\w+)\)/g, '$1.Sample($1_sampler, $2)')
    .replace(/\bvUv\b/g, 'input.vUv')
    .trim();
}

// ── Hook ──────────────────────────────────────────────────────────────────────

interface CompilationState {
  compiled: ICompiledShader | null;
  isCompiling: boolean;
  lastCompileTime: number;
}

export function useShaderCompilation(debounceMs = 300) {
  const graph = useShaderGraph((state) => state.graph);
  const [state, setState] = useState<CompilationState>({
    compiled: null,
    isCompiling: false,
    lastCompileTime: 0,
  });

  const compile = useCallback(() => {
    setState((prev) => ({ ...prev, isCompiling: true }));
    try {
      const start = performance.now();
      const compiled = compileGraph(graph.nodes, graph.connections);
      setState({ compiled, isCompiling: false, lastCompileTime: performance.now() - start });
    } catch (err) {
      setState((prev) => ({
        ...prev,
        isCompiling: false,
        compiled: {
          vertexCode: '',
          fragmentCode: '',
          uniforms: [],
          textures: [],
          warnings: [],
          errors: [err instanceof Error ? err.message : 'Unknown compilation error'],
        },
      }));
    }
  }, [graph]);

  useEffect(() => {
    const timer = setTimeout(compile, debounceMs);
    return () => clearTimeout(timer);
  }, [graph, debounceMs, compile]);

  /** Download compiled GLSL as a .glsl file. */
  const exportGLSL = useCallback(() => {
    if (!state.compiled) return;
    const content = [
      '// === Vertex Shader ===',
      state.compiled.vertexCode,
      '',
      '// === Fragment Shader ===',
      state.compiled.fragmentCode,
    ].join('\n');
    _download(content, 'shader.glsl', 'text/plain');
  }, [state.compiled]);

  /** Download as WGSL (WebGPU). */
  const exportWGSL = useCallback(() => {
    if (!state.compiled) return;
    const content = [
      '// === Vertex Shader (WGSL) ===',
      glslToWgsl(state.compiled.vertexCode),
      '',
      '// === Fragment Shader (WGSL) ===',
      glslToWgsl(state.compiled.fragmentCode),
    ].join('\n');
    _download(content, 'shader.wgsl', 'text/plain');
  }, [state.compiled]);

  /** Download as HLSL (DirectX). */
  const exportHLSL = useCallback(() => {
    if (!state.compiled) return;
    const content = [
      '// === Vertex Shader (HLSL) ===',
      glslToHlsl(state.compiled.vertexCode),
      '',
      '// === Pixel Shader (HLSL) ===',
      glslToHlsl(state.compiled.fragmentCode),
    ].join('\n');
    _download(content, 'shader.hlsl', 'text/plain');
  }, [state.compiled]);

  return { ...state, recompile: compile, exportGLSL, exportWGSL, exportHLSL };
}

function _download(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
