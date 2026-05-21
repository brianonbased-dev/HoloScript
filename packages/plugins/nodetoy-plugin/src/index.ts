/**
 * @holoscript/nodetoy-plugin — NodeToy shader-graph bridge.
 *
 * Research: ai-ecosystem/research/2026-04-24_nodetoy-nodes-holoscript-shader-trait-map.md
 * Universal-IR matrix: docs/universal-ir-coverage.md (shader-graph column)
 *
 * Compiles NodeToy shader graphs to HoloScript @shader trait configurations
 * with full GLSL and WGSL codegen. Delegates graph traversal and GLSL
 * generation to @holoscript/core/compiler/NodeToyMapping; adds WGSL output
 * and HoloScript-native ShaderGraph IR conversion.
 */

// Re-export core's NodeToy types for consumers who need the full graph model
export {
  mapNodeToyToShader as mapNodeToyToGLSL,
  type NodeToyGraph as CoreNodeToyGraph,
  type NodeToyNode as CoreNodeToyNode,
  type NodeToyPort,
  type NodeToyEdge,
  type NodeToyMappingOptions,
  type NodeToyMappingResult,
} from '@holoscript/core/compiler/nodetoy';

import {
  mapNodeToyToShader as coreMapNodeToyToShader,
  type NodeToyGraph as CoreNodeToyGraph,
  type NodeToyNode as CoreNodeToyNode,
  type NodeToyPort,
  type NodeToyEdge,
  type NodeToyMappingOptions,
  type NodeToyMappingResult,
} from '@holoscript/core/compiler/nodetoy';

// Type-only imports from core barrel — runtime comes from @holoscript/core/compiler/nodetoy
// We define local ShaderConfig/ShaderLanguage types to avoid subpath export issues.
// These are structurally compatible with @holoscript/core's ShaderConfig/ShaderLanguage.

export type ShaderLanguage = 'glsl' | 'hlsl' | 'wgsl' | 'metal' | 'spirv';

export interface ShaderSource {
  language: ShaderLanguage;
  vertex?: string;
  fragment?: string;
  geometry?: string;
  tessellationControl?: string;
  tessellationEvaluation?: string;
  compute?: string;
}

export interface ShaderConfig {
  name?: string;
  source?: ShaderSource;
  uniforms?: Record<string, Omit<ShaderUniform, 'name'>>;
  blendMode?: 'opaque' | 'blend' | 'additive' | 'multiply' | 'custom';
  depthTest?: boolean;
  depthWrite?: boolean;
  cullFace?: 'none' | 'front' | 'back' | 'both';
}

export type UniformType =
  | 'float'
  | 'int'
  | 'bool'
  | 'vec2'
  | 'vec3'
  | 'vec4'
  | 'mat2'
  | 'mat3'
  | 'mat4'
  | 'sampler2D'
  | 'samplerCube';

export interface ShaderUniform {
  name: string;
  type: UniformType;
  value: number | number[] | boolean | string;
  min?: number;
  max?: number;
  label?: string;
  group?: string;
}

// =============================================================================
// SIMPLIFIED NODETOY TYPES (legacy plugin-level API)
// =============================================================================

/** Simplified NodeToy node for the plugin-level API */
export interface NodeToyNode {
  id: string;
  family: 'pbr' | 'noise' | 'texture' | 'math' | 'output' | 'input';
  inputs?: Record<string, string>; // ref to other node.id
  params?: Record<string, number | number[] | string>;
}

/** Simplified NodeToy graph for the plugin-level API */
export interface NodeToyGraph {
  name: string;
  nodes: NodeToyNode[];
  output_node_id: string;
}

/** Legacy emission type (backward-compatible summary) */
export interface HoloShaderEmission {
  trait: { kind: '@shader'; target_id: string; params: Record<string, unknown> };
  node_count: number;
  by_family: Record<string, number>;
  validation_errors: string[];
}

// =============================================================================
// HOLOSCRIPT-NATIVE SHADER GRAPH IR
// =============================================================================

export interface NativeShaderGraph {
  id: string;
  name: string;
  nodes: Array<{
    id: string;
    kind: string;
    params?: Record<string, unknown>;
  }>;
  outputNodeId: string;
  provenance: 'native' | 'imported:NodeToy';
}

// =============================================================================
// COMPILE RESULT — end-to-end output
// =============================================================================

export interface NodeToyCompileResult {
  /** HoloScript @shader trait configuration */
  shaderConfig: ShaderConfig;
  /** GLSL vertex shader source */
  vertexSource: string;
  /** GLSL fragment shader source */
  fragmentSource: string;
  /** WGSL vertex shader entry point source (translated from GLSL) */
  wgslVertexSource: string;
  /** WGSL fragment entry point source (translated from GLSL) */
  wgslFragmentSource: string;
  /** Extracted uniforms */
  uniforms: Record<string, Omit<ShaderUniform, 'name'>>;
  /** Warnings from compilation */
  warnings: string[];
  /** Node types that could not be mapped */
  unsupportedNodes: string[];
  /** Legacy emission summary */
  emission: HoloShaderEmission;
}

// =============================================================================
// GLSL → WGSL TRANSPILATION
// =============================================================================

/**
 * Transpile GLSL shader source to WGSL.
 *
 * Handles the common subset of GLSL used by NodeToyMapping output:
 * - precision qualifiers (stripped)
 * - varying → @vertex output / @fragment input with @location
 * - uniform declarations (preserved)
 * - gl_FragColor → @location(0) out color
 * - Built-in varyings (vUv, vNormal, vPosition, vViewDir) → structured
 * - Main function → @vertex / @fragment entry points
 */
export function transpileGLSLToWGSL(
  glslSource: string,
  stage: 'vertex' | 'fragment',
): string {
  const lines = glslSource.split('\n');
  const wgslLines: string[] = [];

  // Collect varyings and uniforms
  const varyings: Array<{ name: string; type: string }> = [];
  const uniforms: Array<{ name: string; type: string }> = [];

  // Strip precision qualifiers
  const strippedLines = lines.filter((line) => !line.trim().startsWith('precision '));

  // First pass: collect declarations
  const bodyLines: string[] = [];
  let inMain = false;
  let mainBody: string[] = [];
  let hasNoiseFn = false;

  for (const line of strippedLines) {
    const trimmed = line.trim();

    // Detect noise function
    if (trimmed.includes('snoise') || trimmed.includes('mod289_n') || trimmed.includes('permute_n')) {
      hasNoiseFn = true;
    }

    // Collect varying declarations
    const varyingMatch = trimmed.match(/^varying\s+(\w+)\s+(\w+)\s*;/);
    if (varyingMatch) {
      varyings.push({ type: glslTypeToWGSL(varyingMatch[1]), name: varyingMatch[2] });
      continue;
    }

    // Collect uniform declarations
    const uniformMatch = trimmed.match(/^uniform\s+(\w+)\s+(\w+)\s*;/);
    if (uniformMatch) {
      uniforms.push({ type: glslTypeToWGSL(uniformMatch[1]), name: uniformMatch[2] });
      continue;
    }

    // Strip gl_FragColor = ...; lines (we'll rewrite them)
    if (trimmed.includes('gl_FragColor')) {
      if (stage === 'fragment') {
        // Extract the expression being assigned to gl_FragColor
        const assignMatch = trimmed.match(/gl_FragColor\s*=\s*(.+)\s*;/);
        if (assignMatch) {
          mainBody.push(`  return ${glslExprToWGSL(assignMatch[1])};`);
        }
      }
      continue;
    }

    // Detect main function boundaries
    if (trimmed === 'void main() {') {
      inMain = true;
      continue;
    }

    if (inMain) {
      if (trimmed === '}') {
        inMain = false;
        continue;
      }
      // Convert the line inside main
      mainBody.push(glslLineToWGSL(trimmed));
      continue;
    }

    bodyLines.push(line);
  }

  // Build WGSL output
  // Header
  wgslLines.push('// Auto-generated WGSL from NodeToy graph via @holoscript/nodetoy-plugin');
  wgslLines.push('');

  // Struct for vertex output / fragment input (varyings)
  if (varyings.length > 0) {
    wgslLines.push('struct Varyings {');
    varyings.forEach((v, i) => {
      const builtinMap: Record<string, string> = {
        vUv: '@builtin(position) pos: vec4f,',
        vNormal: '',  // handled below
      };
      wgslLines.push(`  @location(${i}) ${v.name}: ${v.type},`);
    });
    wgslLines.push('};');
    wgslLines.push('');
  }

  // Uniforms as a struct
  if (uniforms.length > 0) {
    wgslLines.push('struct Uniforms {');
    for (const u of uniforms) {
      wgslLines.push(`  ${u.name}: ${u.type},`);
    }
    wgslLines.push('};');
    wgslLines.push('');
    wgslLines.push('@group(0) @binding(0) var<uniform> uniforms: Uniforms;');
    wgslLines.push('');
  }

  // Noise function in WGSL (if used)
  if (hasNoiseFn) {
    wgslLines.push('// Simplex 2D noise (WGSL)');
    wgslLines.push('fn mod289_v3(x: vec3f) -> vec3f { return x - floor(x * (1.0 / 289.0)) * 289.0; }');
    wgslLines.push('fn mod289_v2(x: vec2f) -> vec2f { return x - floor(x * (1.0 / 289.0)) * 289.0; }');
    wgslLines.push('fn permute_v3(x: vec3f) -> vec3f { return mod289_v3(((x * 34.0) + 1.0) * x); }');
    wgslLines.push('');
    wgslLines.push('fn snoise(v: vec2f) -> f32 {');
    wgslLines.push('  let C = vec4f(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);');
    wgslLines.push('  let i = floor(v + dot(v, C.yy));');
    wgslLines.push('  let x0 = v - i + dot(i, C.xx);');
    wgslLines.push('  let i1 = select(vec2f(1.0, 0.0), vec2f(0.0, 1.0), x0[0] > x0[1]);');
    wgslLines.push('  var x12 = x0.xyxy + C.xxzz;');
    wgslLines.push('  x12 = vec4f(x12.xy - i1, x12.zw);');
    wgslLines.push('  let fi = mod289_v2(i);');
    wgslLines.push('  let p = permute_v3(permute_v3(vec3f(fi[1], fi[1] + i1[1], 1.0)) + vec3f(fi[0], fi[0] + i1[0], 1.0));');
    wgslLines.push('  let m_raw = max(vec3f(0.5) - vec3f(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), vec3f(0.0));');
    wgslLines.push('  var m = m_raw * m_raw; m = m * m;');
    wgslLines.push('  let x = 2.0 * fract(p * C.www) - 1.0;');
    wgslLines.push('  let h = abs(x) - 0.5;');
    wgslLines.push('  let ox = floor(x + 0.5);');
    wgslLines.push('  let a0 = x - ox;');
    wgslLines.push('  let g = vec3f(a0[0] * x0[0] + h[0] * x0[1], a0[1] * x12[0] + h[1] * x12[1], a0[2] * x12[2] + h[2] * x12[3]);');
    wgslLines.push('  return 130.0 * dot(m, g);');
    wgslLines.push('}');
    wgslLines.push('');
  }

  // Stage-specific entry point
  if (stage === 'vertex') {
    wgslLines.push('@vertex');
    wgslLines.push('fn vs_main(');
    wgslLines.push('  @builtin(position) position: vec4f,');
    wgslLines.push('  @location(0) uv: vec2f,');
    wgslLines.push('  @location(1) normal: vec3f');
    if (uniforms.length > 0) {
      wgslLines.push(') -> @builtin(position) vec4f {');
    } else {
      wgslLines.push(') -> @builtin(position) vec4f {');
    }
    // Add varying assignments from mainBody
    for (const bodyLine of mainBody) {
      wgslLines.push(bodyLine);
    }
    // Default: pass-through position
    wgslLines.push('  return position;');
    wgslLines.push('}');
  } else {
    // Fragment shader
    wgslLines.push('@fragment');
    wgslLines.push('fn fs_main(');
    if (varyings.length > 0) {
      varyings.forEach((v, i) => {
        wgslLines.push(`  @location(${i}) ${v.name}: ${v.type},`);
      });
    }
    wgslLines.push(') -> @location(0) vec4f {');
    for (const bodyLine of mainBody) {
      wgslLines.push(bodyLine);
    }
    wgslLines.push('}');
  }

  return wgslLines.join('\n');
}

function glslTypeToWGSL(glslType: string): string {
  const map: Record<string, string> = {
    float: 'f32',
    int: 'i32',
    bool: 'bool',
    vec2: 'vec2f',
    vec3: 'vec3f',
    vec4: 'vec4f',
    mat2: 'mat2x2f',
    mat3: 'mat3x3f',
    mat4: 'mat4x4f',
    sampler2D: 'texture_2d<f32>',
    samplerCube: 'texture_cube<f32>',
  };
  return map[glslType] ?? 'f32';
}

function glslExprToWGSL(expr: string): string {
  // vec4(...) → vec4f(...)
  let result = expr;
  result = result.replace(/\bvec4\s*\(/g, 'vec4f(');
  result = result.replace(/\bvec3\s*\(/g, 'vec3f(');
  result = result.replace(/\bvec2\s*\(/g, 'vec2f(');
  result = result.replace(/\bmat4\s*\(/g, 'mat4x4f(');
  result = result.replace(/\bmat3\s*\(/g, 'mat3x3f(');
  result = result.replace(/\bmat2\s*\(/g, 'mat2x2f(');
  // texture2D → textureSample
  result = result.replace(/\btexture2D\s*\(/g, 'textureSample(');
  result = result.replace(/\btextureCube\s*\(/g, 'textureSample(');
  return result;
}

function glslLineToWGSL(line: string): string {
  let result = glslExprToWGSL(line);
  // Convert GLSL variable declarations
  result = result.replace(/\bfloat\s+(\w+)\s*=/g, 'let $1:');
  result = result.replace(/\bvec2\s+(\w+)\s*=/g, 'let $1:');
  result = result.replace(/\bvec3\s+(\w+)\s*=/g, 'let $1:');
  result = result.replace(/\bvec4\s+(\w+)\s*=/g, 'let $1:');
  // Convert inline uniform references to struct member access
  result = result.replace(/\btime\b/g, 'uniforms.time');
  result = result.replace(/\bresolution\b/g, 'uniforms.resolution');
  return `  ${result}`;
}

// =============================================================================
// SIMPLIFIED GRAPH → CORE GRAPH ADAPTER
// =============================================================================

/**
 * Convert a simplified plugin-level NodeToyGraph to the core compiler's
 * NodeToyGraph format, enabling delegation to the full traversal/codegen.
 */
function adaptGraph(simplified: NodeToyGraph): CoreNodeToyGraph {
  const coreNodes: CoreNodeToyNode[] = [];
  const coreEdges: NodeToyEdge[] = [];

  // Map family to a representative core node type
  const familyToType: Record<string, string> = {
    pbr: 'FragColor',
    noise: 'ProceduralNoise',
    texture: 'Texture2D',
    math: 'Multiply',
    output: 'FragColor',
    input: 'UV',
  };

  for (const node of simplified.nodes) {
    const nodeType = familyToType[node.family] ?? node.family;
    const inputs: NodeToyPort[] = [];
    const outputs: NodeToyPort[] = [];

    // Convert simplified input refs to ports + edges
    if (node.inputs) {
      for (const [portName, ref] of Object.entries(node.inputs)) {
        const inputType: NodeToyPort['type'] = 'float';
        inputs.push({
          name: portName,
          type: inputType,
          connection: ref,
        });
        // Create edge from referenced node to this input
        coreEdges.push({
          id: `edge_${node.id}_${portName}`,
          fromNode: ref,
          fromPort: 'out',
          toNode: node.id,
          toPort: portName,
        });
      }
    }

    // Output port
    const outputType: NodeToyPort['type'] = 'float';
    outputs.push({ name: 'out', type: outputType });

    // Parameters
    const params: Record<string, unknown> = {};
    if (node.params) {
      for (const [key, val] of Object.entries(node.params)) {
        params[key] = val;
      }
    }

    coreNodes.push({
      id: node.id,
      type: nodeType,
      label: node.id,
      inputs,
      outputs,
      params: Object.keys(params).length > 0 ? params : undefined,
    });
  }

  return {
    name: simplified.name,
    nodes: coreNodes,
    edges: coreEdges,
  };
}

// =============================================================================
// LEGACY PLUGIN API (backward-compatible)
// =============================================================================

/**
 * Map a simplified NodeToyGraph to a shader emission summary.
 * This is the original stub-level API, preserved for backward compatibility.
 * For full GLSL/WGSL codegen, use compileNodeToy() instead.
 */
export function mapNodeToyToShader(g: NodeToyGraph): HoloShaderEmission {
  const by_family: Record<string, number> = {};
  for (const n of g.nodes) {
    by_family[n.family] = (by_family[n.family] ?? 0) + 1;
  }
  const validation_errors: string[] = [];
  const ids = new Set(g.nodes.map((n) => n.id));
  if (!ids.has(g.output_node_id)) {
    validation_errors.push(`output_node_id '${g.output_node_id}' not in graph`);
  }
  for (const n of g.nodes) {
    for (const [port, ref] of Object.entries(n.inputs ?? {})) {
      if (!ids.has(ref)) {
        validation_errors.push(`node '${n.id}' input '${port}' refs missing node '${ref}'`);
      }
    }
  }
  return {
    trait: {
      kind: '@shader',
      target_id: g.name,
      params: { output: g.output_node_id, family_mix: by_family },
    },
    node_count: g.nodes.length,
    by_family,
    validation_errors,
  };
}

/**
 * Convert a simplified NodeToyGraph to HoloScript-native ShaderGraph IR.
 */
export function nodeToyToNativeShaderGraph(g: NodeToyGraph): NativeShaderGraph {
  return {
    id: `sg_${g.name.toLowerCase().replace(/\s+/g, '_')}`,
    name: g.name,
    nodes: g.nodes.map((n) => ({
      id: n.id,
      kind: n.family,
      params: n.params as Record<string, unknown> | undefined,
    })),
    outputNodeId: g.output_node_id,
    provenance: 'imported:NodeToy',
  };
}

// =============================================================================
// FULL COMPILE PATH — end-to-end GLSL + WGSL output
// =============================================================================

export interface NodeToyPluginCompileOptions extends NodeToyMappingOptions {
  /** Also produce WGSL output (default: true) */
  wgsl?: boolean;
}

/**
 * Compile a NodeToy shader graph end-to-end.
 *
 * Delegates graph traversal and GLSL codegen to @holoscript/core's
 * NodeToyMapping, then transpiles GLSL to WGSL. Returns a complete
 * ShaderConfig plus both GLSL and WGSL source strings.
 */
export function compileNodeToy(
  graph: CoreNodeToyGraph,
  options: NodeToyPluginCompileOptions = {},
): NodeToyCompileResult {
  const { wgsl: produceWgsl = true, ...coreOptions } = options;

  // Delegate to core's full traversal + GLSL codegen
  const glslResult = coreMapNodeToyToShader(graph, coreOptions);

  // WGSL transpilation
  const wgslVertexSource = produceWgsl
    ? transpileGLSLToWGSL(glslResult.vertexSource, 'vertex')
    : '';
  const wgslFragmentSource = produceWgsl
    ? transpileGLSLToWGSL(glslResult.fragmentSource, 'fragment')
    : '';

  // Build legacy emission summary
  const by_family: Record<string, number> = {};
  for (const node of graph.nodes) {
    const family = node.type.toLowerCase();
    by_family[family] = (by_family[family] ?? 0) + 1;
  }
  const outputNodeIds = graph.nodes
    .filter((n) => n.type === 'FragColor' || n.type === 'Output')
    .map((n) => n.id);

  return {
    shaderConfig: glslResult.shaderConfig,
    vertexSource: glslResult.vertexSource,
    fragmentSource: glslResult.fragmentSource,
    wgslVertexSource,
    wgslFragmentSource,
    uniforms: glslResult.uniforms,
    warnings: glslResult.warnings,
    unsupportedNodes: glslResult.unsupportedNodes,
    emission: {
      trait: {
        kind: '@shader',
        target_id: graph.name,
        params: {
          output: outputNodeIds.join(','),
          family_mix: by_family,
        },
      },
      node_count: graph.nodes.length,
      by_family,
      validation_errors: [],
    },
  };
}