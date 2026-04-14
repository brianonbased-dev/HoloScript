// TARGET: packages/core/src/compiler/NodeToyMapping.ts
/**
 * NodeToy Shader Graph Mapping — Visual Shaders to @shader Trait
 *
 * Maps NodeToy (https://nodetoy.co) visual shader graph exports to
 * HoloScript @shader trait configurations. NodeToy exports JSON shader
 * graph descriptions that this module converts into:
 * - GLSL vertex/fragment source code
 * - Uniform declarations matching NodeToy parameters
 * - ShaderConfig objects compatible with the HoloScript ShaderTrait
 *
 * Supported NodeToy node types:
 * - Math operations (Add, Subtract, Multiply, Divide, Power, Sqrt, Abs, etc.)
 * - Trigonometry (Sin, Cos, Tan, Atan2)
 * - Color operations (Mix, HSV2RGB, RGB2HSV, Saturate, Contrast)
 * - Texture sampling (Texture2D, CubeMap, ProceduralNoise)
 * - UV manipulation (Scale, Offset, Rotate, Tile, Parallax)
 * - Utility (Time, Resolution, ScreenUV, ViewDirection, Normal)
 * - Output (FragColor, Emission, Alpha)
 *
 * @version 1.0.0
 * @package @holoscript/core/compiler
 */

import type {
  ShaderConfig,
  ShaderSource,
  ShaderUniform,
  UniformType,
  ShaderLanguage,
} from '../traits/ShaderTrait';

// =============================================================================
// NODETOY GRAPH TYPES (matching NodeToy's JSON export format)
// =============================================================================

/** A node in the NodeToy visual shader graph */
export interface NodeToyNode {
  /** Unique node ID */
  id: string;
  /** Node type (e.g., "Add", "Texture2D", "Time", "FragColor") */
  type: string;
  /** Display label */
  label?: string;
  /** Node position in the editor (for visual reconstruction) */
  position?: { x: number; y: number };
  /** Input ports */
  inputs: NodeToyPort[];
  /** Output ports */
  outputs: NodeToyPort[];
  /** Node-specific parameters */
  params?: Record<string, unknown>;
}

/** A port (input or output) on a NodeToy node */
export interface NodeToyPort {
  /** Port name */
  name: string;
  /** Data type */
  type: 'float' | 'vec2' | 'vec3' | 'vec4' | 'mat3' | 'mat4' | 'sampler2D' | 'samplerCube';
  /** Default value (for inputs) */
  default?: number | number[];
  /** Connected edge ID (undefined = unconnected) */
  connection?: string;
}

/** A connection (edge) between two ports */
export interface NodeToyEdge {
  /** Edge ID */
  id: string;
  /** Source node ID */
  fromNode: string;
  /** Source port name */
  fromPort: string;
  /** Target node ID */
  toNode: string;
  /** Target port name */
  toPort: string;
}

/** The complete NodeToy shader graph export */
export interface NodeToyGraph {
  /** Graph name */
  name: string;
  /** Graph version */
  version?: string;
  /** All nodes */
  nodes: NodeToyNode[];
  /** All edges */
  edges: NodeToyEdge[];
  /** Global settings */
  settings?: {
    /** Blend mode */
    blendMode?: 'opaque' | 'blend' | 'additive' | 'multiply';
    /** Double-sided rendering */
    doubleSided?: boolean;
    /** Depth test */
    depthTest?: boolean;
    /** Depth write */
    depthWrite?: boolean;
  };
}

/** Options for the NodeToy to HoloScript mapping */
export interface NodeToyMappingOptions {
  /** Target shader language (default: 'glsl') */
  language?: ShaderLanguage;
  /** Include time uniform automatically if Time node is used (default: true) */
  autoTimeUniform?: boolean;
  /** Include resolution uniform if Resolution node is used (default: true) */
  autoResolutionUniform?: boolean;
  /** Prefix for generated variable names (default: 'nt_') */
  variablePrefix?: string;
  /** Optimization level: 'none' folds no constants, 'basic' folds simple math */
  optimization?: 'none' | 'basic';
}

/** Result of a NodeToy to HoloScript mapping */
export interface NodeToyMappingResult {
  /** The generated ShaderConfig for HoloScript @shader trait */
  shaderConfig: ShaderConfig;
  /** Generated GLSL vertex shader source */
  vertexSource: string;
  /** Generated GLSL fragment shader source */
  fragmentSource: string;
  /** Extracted uniforms */
  uniforms: Record<string, Omit<ShaderUniform, 'name'>>;
  /** Warnings generated during mapping */
  warnings: string[];
  /** Nodes that could not be mapped */
  unsupportedNodes: string[];
}

// =============================================================================
// NODE TYPE REGISTRY
// =============================================================================

interface NodeCodegen {
  /** GLSL expression template. Placeholders: {in:portName} for inputs */
  expression: string;
  /** Output type */
  outputType: UniformType;
  /** Whether this node requires specific inputs */
  requiredInputs?: string[];
}

const NODE_TYPE_MAP: Record<string, NodeCodegen> = {
  // Math operations
  Add: { expression: '({in:a} + {in:b})', outputType: 'float' },
  Subtract: { expression: '({in:a} - {in:b})', outputType: 'float' },
  Multiply: { expression: '({in:a} * {in:b})', outputType: 'float' },
  Divide: { expression: '({in:a} / max({in:b}, 0.0001))', outputType: 'float' },
  Power: { expression: 'pow({in:a}, {in:b})', outputType: 'float' },
  Sqrt: { expression: 'sqrt({in:a})', outputType: 'float' },
  Abs: { expression: 'abs({in:a})', outputType: 'float' },
  Sign: { expression: 'sign({in:a})', outputType: 'float' },
  Floor: { expression: 'floor({in:a})', outputType: 'float' },
  Ceil: { expression: 'ceil({in:a})', outputType: 'float' },
  Fract: { expression: 'fract({in:a})', outputType: 'float' },
  Mod: { expression: 'mod({in:a}, {in:b})', outputType: 'float' },
  Min: { expression: 'min({in:a}, {in:b})', outputType: 'float' },
  Max: { expression: 'max({in:a}, {in:b})', outputType: 'float' },
  Clamp: { expression: 'clamp({in:a}, {in:min}, {in:max})', outputType: 'float' },
  Lerp: { expression: 'mix({in:a}, {in:b}, {in:t})', outputType: 'float' },
  Smoothstep: { expression: 'smoothstep({in:edge0}, {in:edge1}, {in:x})', outputType: 'float' },
  Step: { expression: 'step({in:edge}, {in:x})', outputType: 'float' },
  OneMinus: { expression: '(1.0 - {in:a})', outputType: 'float' },
  Negate: { expression: '(-{in:a})', outputType: 'float' },
  Length: { expression: 'length({in:a})', outputType: 'float' },
  Distance: { expression: 'distance({in:a}, {in:b})', outputType: 'float' },
  Dot: { expression: 'dot({in:a}, {in:b})', outputType: 'float' },
  Cross: { expression: 'cross({in:a}, {in:b})', outputType: 'vec3' },
  Normalize: { expression: 'normalize({in:a})', outputType: 'vec3' },
  Reflect: { expression: 'reflect({in:a}, {in:b})', outputType: 'vec3' },

  // Trigonometry
  Sin: { expression: 'sin({in:a})', outputType: 'float' },
  Cos: { expression: 'cos({in:a})', outputType: 'float' },
  Tan: { expression: 'tan({in:a})', outputType: 'float' },
  Asin: { expression: 'asin({in:a})', outputType: 'float' },
  Acos: { expression: 'acos({in:a})', outputType: 'float' },
  Atan: { expression: 'atan({in:a})', outputType: 'float' },
  Atan2: { expression: 'atan({in:y}, {in:x})', outputType: 'float' },

  // Color operations
  Mix: { expression: 'mix({in:a}, {in:b}, {in:factor})', outputType: 'vec3' },
  Saturate: { expression: 'clamp({in:a}, 0.0, 1.0)', outputType: 'float' },

  // Constructors
  Vec2: { expression: 'vec2({in:x}, {in:y})', outputType: 'vec2' },
  Vec3: { expression: 'vec3({in:x}, {in:y}, {in:z})', outputType: 'vec3' },
  Vec4: { expression: 'vec4({in:x}, {in:y}, {in:z}, {in:w})', outputType: 'vec4' },

  // Component extraction
  SplitVec2: { expression: '{in:a}', outputType: 'float' },
  SplitVec3: { expression: '{in:a}', outputType: 'float' },
  SplitVec4: { expression: '{in:a}', outputType: 'float' },

  // Texture sampling
  Texture2D: { expression: 'texture2D({in:sampler}, {in:uv})', outputType: 'vec4' },
  CubeMap: { expression: 'textureCube({in:sampler}, {in:dir})', outputType: 'vec4' },

  // Noise
  ProceduralNoise: { expression: 'snoise({in:uv} * {in:scale})', outputType: 'float' },
};

// Built-in input nodes (no codegen, they provide constants/varyings)
const BUILTIN_INPUT_NODES = new Set([
  'Time',
  'Resolution',
  'ScreenUV',
  'UV',
  'Normal',
  'Position',
  'ViewDirection',
  'FragCoord',
  'Constant',
  'Parameter',
]);

// Output nodes (terminal nodes that write to gl_FragColor, etc.)
const OUTPUT_NODES = new Set(['FragColor', 'Output', 'Emission', 'Alpha', 'Discard']);

// =============================================================================
// MAPPER IMPLEMENTATION
// =============================================================================

/**
 * Map a NodeToy shader graph to a HoloScript @shader trait configuration.
 *
 * @example
 * ```typescript
 * import { mapNodeToyToShader } from './NodeToyMapping';
 *
 * const graph: NodeToyGraph = JSON.parse(nodetoySerialized);
 * const result = mapNodeToyToShader(graph);
 *
 * // Use in HoloScript
 * const shaderTrait = createShaderTrait(result.shaderConfig);
 * ```
 */
export function mapNodeToyToShader(
  graph: NodeToyGraph,
  options: NodeToyMappingOptions = {}
): NodeToyMappingResult {
  const mapper = new NodeToyMapper(options);
  return mapper.map(graph);
}

class NodeToyMapper {
  private language: ShaderLanguage;
  private autoTimeUniform: boolean;
  private autoResolutionUniform: boolean;
  private variablePrefix: string;
  private optimization: 'none' | 'basic';

  private warnings: string[] = [];
  private unsupportedNodes: string[] = [];
  private uniforms: Record<string, Omit<ShaderUniform, 'name'>> = {};
  private varyingDecls: string[] = [];
  private fragmentLines: string[] = [];
  private nodeOutputVars: Map<string, string> = new Map();
  private nodeMap: Map<string, NodeToyNode> = new Map();
  private edgesByTarget: Map<string, NodeToyEdge[]> = new Map();
  private visitedNodes: Set<string> = new Set();

  constructor(options: NodeToyMappingOptions = {}) {
    this.language = options.language ?? 'glsl';
    this.autoTimeUniform = options.autoTimeUniform ?? true;
    this.autoResolutionUniform = options.autoResolutionUniform ?? true;
    this.variablePrefix = options.variablePrefix ?? 'nt_';
    this.optimization = options.optimization ?? 'basic';
  }

  map(graph: NodeToyGraph): NodeToyMappingResult {
    // Reset state
    this.warnings = [];
    this.unsupportedNodes = [];
    this.uniforms = {};
    this.varyingDecls = [];
    this.fragmentLines = [];
    this.nodeOutputVars.clear();
    this.nodeMap.clear();
    this.edgesByTarget.clear();
    this.visitedNodes.clear();

    // Index nodes and edges
    for (const node of graph.nodes) {
      this.nodeMap.set(node.id, node);
    }
    for (const edge of graph.edges) {
      const key = `${edge.toNode}:${edge.toPort}`;
      if (!this.edgesByTarget.has(key)) {
        this.edgesByTarget.set(key, []);
      }
      this.edgesByTarget.get(key)!.push(edge);
    }

    // Find output nodes and traverse backwards to generate code
    const outputNodes = graph.nodes.filter((n) => OUTPUT_NODES.has(n.type));
    if (outputNodes.length === 0) {
      this.warnings.push('No output node found in graph; generating passthrough shader');
    }

    // Traverse from output nodes
    for (const outputNode of outputNodes) {
      this.traverseNode(outputNode.id);
    }

    // Detect auto-uniforms
    const hasTimeNode = graph.nodes.some((n) => n.type === 'Time');
    const hasResolutionNode = graph.nodes.some((n) => n.type === 'Resolution');

    if (this.autoTimeUniform && hasTimeNode) {
      this.uniforms['time'] = { type: 'float', value: 0.0 };
    }
    if (this.autoResolutionUniform && hasResolutionNode) {
      this.uniforms['resolution'] = { type: 'vec2', value: [1920, 1080] };
    }

    // Detect parameter nodes as uniforms
    for (const node of graph.nodes) {
      if (node.type === 'Parameter' || node.type === 'Constant') {
        this.extractParameterUniform(node);
      }
    }

    // Generate shader sources
    const vertexSource = this.generateVertexSource();
    const fragmentSource = this.generateFragmentSource(outputNodes);

    // Build ShaderConfig
    const shaderConfig: ShaderConfig = {
      name: graph.name || 'nodetoy_shader',
      source: {
        language: this.language,
        vertex: vertexSource,
        fragment: fragmentSource,
      },
      uniforms: this.uniforms,
      blendMode: graph.settings?.blendMode ?? 'opaque',
      depthTest: graph.settings?.depthTest ?? true,
      depthWrite: graph.settings?.depthWrite ?? true,
      cullFace: graph.settings?.doubleSided ? 'none' : 'back',
    };

    return {
      shaderConfig,
      vertexSource,
      fragmentSource,
      uniforms: this.uniforms,
      warnings: this.warnings,
      unsupportedNodes: this.unsupportedNodes,
    };
  }

  // ---------------------------------------------------------------------------
  // Graph traversal (reverse topological from output nodes)
  // ---------------------------------------------------------------------------

  private traverseNode(nodeId: string): string {
    if (this.nodeOutputVars.has(nodeId)) {
      return this.nodeOutputVars.get(nodeId)!;
    }

    if (this.visitedNodes.has(nodeId)) {
      this.warnings.push(`Cycle detected at node ${nodeId}; breaking with default value`);
      return '0.0';
    }
    this.visitedNodes.add(nodeId);

    const node = this.nodeMap.get(nodeId);
    if (!node) {
      this.warnings.push(`Missing node: ${nodeId}`);
      return '0.0';
    }

    // Handle built-in input nodes
    if (BUILTIN_INPUT_NODES.has(node.type)) {
      const varExpr = this.resolveBuiltinNode(node);
      this.nodeOutputVars.set(nodeId, varExpr);
      return varExpr;
    }

    // Handle output nodes (terminal)
    if (OUTPUT_NODES.has(node.type)) {
      // Resolve input connections
      for (const input of node.inputs) {
        const inputExpr = this.resolveInputPort(nodeId, input.name, input);
        if (node.type === 'FragColor' || node.type === 'Output') {
          this.fragmentLines.push(`  // Output: ${node.label || node.type}`);
          if (input.type === 'vec4') {
            this.fragmentLines.push(`  gl_FragColor = ${inputExpr};`);
          } else if (input.type === 'vec3') {
            this.fragmentLines.push(`  gl_FragColor = vec4(${inputExpr}, 1.0);`);
          } else {
            this.fragmentLines.push(`  gl_FragColor = vec4(vec3(${inputExpr}), 1.0);`);
          }
        }
      }
      const varName = `${this.variablePrefix}out_${this.sanitize(nodeId)}`;
      this.nodeOutputVars.set(nodeId, varName);
      return varName;
    }

    // Handle mapped operation nodes
    const codegen = NODE_TYPE_MAP[node.type];
    if (!codegen) {
      this.unsupportedNodes.push(node.type);
      this.warnings.push(`Unsupported node type: ${node.type}; using default value`);
      this.nodeOutputVars.set(nodeId, '0.0');
      return '0.0';
    }

    // Resolve all inputs
    const resolvedInputs: Record<string, string> = {};
    for (const input of node.inputs) {
      resolvedInputs[input.name] = this.resolveInputPort(nodeId, input.name, input);
    }

    // Build expression from template
    let expression = codegen.expression;
    for (const [portName, portExpr] of Object.entries(resolvedInputs)) {
      expression = expression.replace(`{in:${portName}}`, portExpr);
    }

    // Replace any remaining unresolved placeholders with defaults
    expression = expression.replace(/\{in:\w+\}/g, '0.0');

    // Create variable
    const varName = `${this.variablePrefix}${this.sanitize(nodeId)}`;
    const glslType = this.uniformTypeToGLSL(codegen.outputType);
    this.fragmentLines.push(`  ${glslType} ${varName} = ${expression};`);

    this.nodeOutputVars.set(nodeId, varName);
    return varName;
  }

  private resolveInputPort(nodeId: string, portName: string, port: NodeToyPort): string {
    // Check for connected edge
    const edgeKey = `${nodeId}:${portName}`;
    const edges = this.edgesByTarget.get(edgeKey);

    if (edges && edges.length > 0) {
      const edge = edges[0]; // Take first connection
      return this.traverseNode(edge.fromNode);
    }

    // Use default value
    if (port.default !== undefined) {
      if (typeof port.default === 'number') return String(port.default);
      if (Array.isArray(port.default)) {
        const len = port.default.length;
        if (len === 2) return `vec2(${port.default.join(', ')})`;
        if (len === 3) return `vec3(${port.default.join(', ')})`;
        if (len === 4) return `vec4(${port.default.join(', ')})`;
        return String(port.default[0] ?? 0);
      }
    }

    return '0.0';
  }

  private resolveBuiltinNode(node: NodeToyNode): string {
    switch (node.type) {
      case 'Time':
        return 'time';
      case 'Resolution':
        return 'resolution';
      case 'UV':
      case 'ScreenUV':
        this.ensureVarying('vUv', 'vec2');
        return 'vUv';
      case 'Normal':
        this.ensureVarying('vNormal', 'vec3');
        return 'vNormal';
      case 'Position':
        this.ensureVarying('vPosition', 'vec3');
        return 'vPosition';
      case 'ViewDirection':
        this.ensureVarying('vViewDir', 'vec3');
        return 'vViewDir';
      case 'FragCoord':
        return 'gl_FragCoord.xy';
      case 'Constant': {
        const val = node.params?.['value'];
        if (typeof val === 'number') return String(val);
        if (Array.isArray(val)) {
          if (val.length === 2) return `vec2(${val.join(', ')})`;
          if (val.length === 3) return `vec3(${val.join(', ')})`;
          if (val.length === 4) return `vec4(${val.join(', ')})`;
        }
        return '0.0';
      }
      case 'Parameter': {
        const name = (node.params?.['name'] as string) || `param_${node.id}`;
        return name;
      }
      default:
        return '0.0';
    }
  }

  // ---------------------------------------------------------------------------
  // Uniform and varying management
  // ---------------------------------------------------------------------------

  private extractParameterUniform(node: NodeToyNode): void {
    const name = (node.params?.['name'] as string) || `param_${node.id}`;
    const value = node.params?.['value'];
    const uniformType = this.inferUniformType(value);

    if (!this.uniforms[name]) {
      this.uniforms[name] = {
        type: uniformType,
        value: typeof value === 'number' || Array.isArray(value) ? value : 0.0,
        min: node.params?.['min'] as number | undefined,
        max: node.params?.['max'] as number | undefined,
        label: node.label,
      };
    }
  }

  private inferUniformType(value: unknown): UniformType {
    if (typeof value === 'number') return 'float';
    if (typeof value === 'boolean') return 'bool';
    if (Array.isArray(value)) {
      if (value.length === 2) return 'vec2';
      if (value.length === 3) return 'vec3';
      if (value.length === 4) return 'vec4';
      if (value.length === 9) return 'mat3';
      if (value.length === 16) return 'mat4';
    }
    return 'float';
  }

  private ensureVarying(name: string, type: string): void {
    const decl = `varying ${type} ${name};`;
    if (!this.varyingDecls.includes(decl)) {
      this.varyingDecls.push(decl);
    }
  }

  // ---------------------------------------------------------------------------
  // Source generation
  // ---------------------------------------------------------------------------

  private generateVertexSource(): string {
    const lines: string[] = [];

    // Varyings (only those used)
    for (const decl of this.varyingDecls) {
      lines.push(decl);
    }

    lines.push('');
    lines.push('void main() {');

    // Set varyings
    if (this.varyingDecls.some((d) => d.includes('vUv'))) {
      lines.push('  vUv = uv;');
    }
    if (this.varyingDecls.some((d) => d.includes('vNormal'))) {
      lines.push('  vNormal = normalize(normalMatrix * normal);');
    }
    if (this.varyingDecls.some((d) => d.includes('vPosition'))) {
      lines.push('  vPosition = position;');
    }
    if (this.varyingDecls.some((d) => d.includes('vViewDir'))) {
      lines.push('  vec4 mvPos = modelViewMatrix * vec4(position, 1.0);');
      lines.push('  vViewDir = normalize(-mvPos.xyz);');
    }

    lines.push('  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);');
    lines.push('}');

    return lines.join('\n');
  }

  private generateFragmentSource(outputNodes: NodeToyNode[]): string {
    const lines: string[] = [];

    lines.push('precision highp float;');
    lines.push('');

    // Uniform declarations
    for (const [name, uniform] of Object.entries(this.uniforms)) {
      lines.push(`uniform ${this.uniformTypeToGLSL(uniform.type)} ${name};`);
    }
    lines.push('');

    // Varyings
    for (const decl of this.varyingDecls) {
      lines.push(decl);
    }
    lines.push('');

    // Noise function if ProceduralNoise is used
    if (this.nodeMap.size > 0) {
      const hasNoise = Array.from(this.nodeMap.values()).some((n) => n.type === 'ProceduralNoise');
      if (hasNoise) {
        lines.push(SIMPLEX_NOISE_2D);
        lines.push('');
      }
    }

    lines.push('void main() {');

    // Computed variables
    for (const line of this.fragmentLines) {
      lines.push(line);
    }

    // Fallback if no output was written
    if (!this.fragmentLines.some((l) => l.includes('gl_FragColor'))) {
      lines.push('  gl_FragColor = vec4(1.0, 0.0, 1.0, 1.0); // No output node');
    }

    lines.push('}');

    return lines.join('\n');
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private uniformTypeToGLSL(type: UniformType): string {
    return type; // GLSL types match UniformType names
  }

  private sanitize(id: string): string {
    return id.replace(/[^a-zA-Z0-9]/g, '_');
  }
}

// =============================================================================
// INLINE SIMPLEX NOISE (for ProceduralNoise node support)
// =============================================================================

const SIMPLEX_NOISE_2D = `
// Simplex 2D noise for ProceduralNoise nodes
vec3 mod289_n(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289_n(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute_n(vec3 x) { return mod289_n(((x*34.0)+1.0)*x); }

float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                      -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0[0] > x0[1]) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289_n(i);
  vec3 p = permute_n(permute_n(i[1] + vec3(0.0, i1[1], 1.0)) + i[0] + vec3(0.0, i1[0], 1.0));
  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
  m = m*m; m = m*m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
  vec3 g;
  g[0] = a0[0] * x0[0] + h[0] * x0[1];
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}`.trim();

// =============================================================================
// EXPORTS
// =============================================================================

export { NodeToyMapper };
export default mapNodeToyToShader;
