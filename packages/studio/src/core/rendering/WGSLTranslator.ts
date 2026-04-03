/**
 * WGSLTranslator.ts
 *
 * Handles true compilation of a Shader Graph into a functional WebGPU Shader Language (WGSL) string.
 * This replaces the basic regex-based translation in `shaderCompilerUtils.ts` with a robust
 * AST-like structural generation for procedural PBR painting and sculpting.
 *
 * Supports full PBR input resolution: albedo, roughness, metallic, normal, emission, alpha
 * are resolved from connected upstream nodes via topological edge traversal.
 */

import type { GNode, GEdge } from '../../lib/nodeGraphStore';
import { NODE_TEMPLATES } from '../../lib/shaderGraph';

// ── Types ──────────────────────────────────────────────────────────────────

export interface WGSLCompileResult {
  ok: boolean;
  wgsl?: string;
  errors?: string[];
}

/** PBR surface inputs resolved from graph edges or defaults. */
interface ResolvedPBRInputs {
  albedo: string; // WGSL expression for vec3f
  roughness: string; // WGSL expression for f32
  metallic: string; // WGSL expression for f32
  normal: string; // WGSL expression for vec3f
  emission: string; // WGSL expression for vec3f
  alpha: string; // WGSL expression for f32
}

// ── Default PBR Values ─────────────────────────────────────────────────────

const PBR_DEFAULTS: ResolvedPBRInputs = {
  albedo: 'vec3f(1.0, 1.0, 1.0)',
  roughness: '0.5',
  metallic: '0.0',
  normal: 'in.vNormal',
  emission: 'vec3f(0.0, 0.0, 0.0)',
  alpha: '1.0',
};

// ── Translator Core ────────────────────────────────────────────────────────

export class WGSLTranslator {
  private nodes: Map<string, GNode> = new Map();
  private edges: GEdge[] = [];
  private generatedCode: string[] = [];
  private uniforms: Set<string> = new Set();
  private variables: Map<string, string> = new Map();
  /** Tracks emitted variable names to avoid duplicates during traversal. */
  private emittedNodes: Set<string> = new Set();
  /** Collects body-level statements emitted inside main(). */
  private bodyLines: string[] = [];
  /** Whether the graph references a time uniform (uTime). */
  private needsTimeUniform: boolean = false;

  constructor(nodes: GNode[], edges: GEdge[]) {
    nodes.forEach((n) => this.nodes.set(n.id, n));
    this.edges = edges;
  }

  /**
   * Main compilation entry point
   */
  public compile(): WGSLCompileResult {
    try {
      this.generatedCode = [];
      this.uniforms.clear();
      this.variables.clear();
      this.emittedNodes.clear();
      this.bodyLines = [];
      this.needsTimeUniform = false;

      this.addHeader();

      const outputNode = this.findOutputNode();
      if (!outputNode) {
        return { ok: false, errors: ['No valid PBROutput or Output node found in graph.'] };
      }

      this.resolveNodeChain(outputNode);
      this.addUniformBindings();
      this.addEntryPoint(outputNode);

      return {
        ok: true,
        wgsl: this.generatedCode.join('\n'),
      };
    } catch (e: unknown) {
      return { ok: false, errors: [e instanceof Error ? e.message : String(e)] };
    }
  }

  // ── Private Build Steps ─────────────────────────────────────────────────

  private addHeader() {
    this.generatedCode.push(`// Auto-Generated WGSL by HoloScript Studio WebGPU Translator`);
    this.generatedCode.push(`struct VertexInput {`);
    this.generatedCode.push(`  @location(0) position: vec3f,`);
    this.generatedCode.push(`  @location(1) uv: vec2f,`);
    this.generatedCode.push(`  @location(2) normal: vec3f,`);
    this.generatedCode.push(`};`);
    this.generatedCode.push(``);
    this.generatedCode.push(`struct VertexOutput {`);
    this.generatedCode.push(`  @builtin(position) position: vec4f,`);
    this.generatedCode.push(`  @location(0) vUv: vec2f,`);
    this.generatedCode.push(`  @location(1) vNormal: vec3f,`);
    this.generatedCode.push(`};`);
    this.generatedCode.push(``);

    // Add common noise functions early
    if (Array.from(this.nodes.values()).some((n) => n.type === 'NoiseNode')) {
      this.addSimplexNoiseFunction();
    }
  }

  /**
   * Emit @group/@binding declarations for all tracked uniforms.
   * Called after resolveNodeChain() so that `this.uniforms` and
   * `this.needsTimeUniform` are fully populated.
   *
   * Layout convention:
   *   @group(0) @binding(0)  — uniform buffer (time, etc.)
   *   @group(0) @binding(1+) — texture/sampler pairs
   */
  private addUniformBindings() {
    let bindingIndex = 0;
    const lines: string[] = [];

    // ── Uniform buffer (time, future: resolution, mouse, etc.) ──
    if (this.needsTimeUniform) {
      lines.push(`// Uniform buffer`);
      lines.push(`struct Uniforms {`);
      lines.push(`  time: f32,`);
      lines.push(`};`);
      lines.push(`@group(0) @binding(${bindingIndex}) var<uniform> uniforms: Uniforms;`);
      // Alias so existing body code can reference uTime directly
      // (alias emitted as a let inside main, but we keep the global binding clean)
      bindingIndex++;
      lines.push(``);
    }

    // ── Texture + sampler pairs ──
    if (this.uniforms.size > 0) {
      lines.push(`// Texture bindings`);
      for (const samplerName of this.uniforms) {
        lines.push(`@group(0) @binding(${bindingIndex}) var ${samplerName}: texture_2d<f32>;`);
        bindingIndex++;
        lines.push(`@group(0) @binding(${bindingIndex}) var ${samplerName}_sampler: sampler;`);
        bindingIndex++;
      }
      lines.push(``);
    }

    if (lines.length > 0) {
      this.generatedCode.push(...lines);
    }
  }

  private findOutputNode(): GNode | null {
    // Check for standard material output first
    let out = Array.from(this.nodes.values()).find((n) => n.type === 'PBROutput');
    if (!out) {
      // Fallback to older pure-color output
      out = Array.from(this.nodes.values()).find((n) => n.type === 'output');
    }
    return out || null;
  }

  // ── Topological Resolution ────────────────────────────────────────────

  /**
   * Performs a depth-first topological traversal from the output node back
   * through the edge graph, resolving each upstream node into a named WGSL
   * variable. Results are stored in `this.variables` keyed by node ID.
   */
  private resolveNodeChain(outputNode: GNode) {
    // Find all edges targeting the output node
    const incomingEdges = this.edges.filter((e) => e.target === outputNode.id);

    for (const edge of incomingEdges) {
      this.resolveNode(edge.source);
    }
  }

  /**
   * Recursively resolve a node: first resolve its upstream dependencies,
   * then emit a variable declaration for this node.
   */
  private resolveNode(nodeId: string): string {
    // Already resolved — return variable name
    if (this.variables.has(nodeId)) {
      return this.variables.get(nodeId)!;
    }

    const node = this.nodes.get(nodeId);
    if (!node) {
      return '0.0'; // Unreachable node
    }

    // Resolve upstream dependencies first (edges where this node is the target)
    const upstreamEdges = this.edges.filter((e) => e.target === nodeId);
    const upstreamVars: Map<string, string> = new Map();
    for (const edge of upstreamEdges) {
      const varName = this.resolveNode(edge.source);
      upstreamVars.set(edge.targetHandle ?? 'a', varName);
    }

    // Emit WGSL expression for this node
    const expr = this.emitNodeExpression(node, upstreamVars);
    const safeName = `var_${nodeId.replace(/[^a-zA-Z0-9_]/g, '_')}`;
    this.variables.set(nodeId, safeName);

    // Determine WGSL type from node type (with upstream type propagation)
    const wgslType = this.inferWGSLType(node, upstreamVars);
    this.bodyLines.push(`  let ${safeName}: ${wgslType} = ${expr};`);

    return safeName;
  }

  /**
   * Emit a WGSL expression for a given node type, using resolved upstream
   * inputs where available.
   */
  private emitNodeExpression(node: GNode, inputs: Map<string, string>): string {
    const nodeData = node.data as Record<string, unknown> | undefined;
    const nodeType = node.type ?? (nodeData?.type as string) ?? '';
    const data = nodeData ?? {};

    switch (nodeType) {
      // ── Constant value nodes ───────────────────────────────────────────
      case 'vec3': {
        const v = data?.value;
        if (Array.isArray(v) && v.length >= 3) {
          return `vec3f(${this.toF32(v[0])}, ${this.toF32(v[1])}, ${this.toF32(v[2])})`;
        }
        return 'vec3f(1.0, 1.0, 1.0)';
      }
      case 'vec4': {
        const v = data?.value;
        if (Array.isArray(v) && v.length >= 4) {
          return `vec4f(${this.toF32(v[0])}, ${this.toF32(v[1])}, ${this.toF32(v[2])}, ${this.toF32(v[3])})`;
        }
        return 'vec4f(1.0, 1.0, 1.0, 1.0)';
      }
      case 'float':
      case 'constant': {
        const v = data?.value ?? 0.0;
        return this.toF32(v);
      }
      case 'vec2': {
        const v = data?.value;
        if (Array.isArray(v) && v.length >= 2) {
          return `vec2f(${this.toF32(v[0])}, ${this.toF32(v[1])})`;
        }
        return 'vec2f(0.0, 0.0)';
      }

      // ── Input nodes ────────────────────────────────────────────────────
      case 'UVInput':
      case 'uvNode':
      case 'uv':
        return 'in.vUv';

      case 'TimeInput':
      case 'timeNode':
      case 'time':
        this.needsTimeUniform = true;
        return 'uTime';

      case 'PositionInput':
        return 'in.position.xyz';

      case 'NormalInput':
      case 'Normal':
        return 'in.vNormal';

      // ── Math nodes ─────────────────────────────────────────────────────
      case 'AddNode': {
        const a = inputs.get('a') ?? '0.0';
        const b = inputs.get('b') ?? '0.0';
        return `(${a} + ${b})`;
      }
      case 'MultiplyNode': {
        const a = inputs.get('a') ?? '1.0';
        const b = inputs.get('b') ?? '1.0';
        return `(${a} * ${b})`;
      }
      case 'SinNode': {
        const x = inputs.get('x') ?? inputs.get('a') ?? '0.0';
        return `sin(${x})`;
      }
      case 'PowNode': {
        const base = inputs.get('base') ?? inputs.get('a') ?? '1.0';
        const exp = inputs.get('exp') ?? inputs.get('b') ?? '1.0';
        return `pow(${base}, ${exp})`;
      }
      case 'mathNode':
      case 'math': {
        const op = data?.op ?? 'add';
        const a = inputs.get('a') ?? '0.0';
        const b = inputs.get('b') ?? '0.0';
        switch (op) {
          case 'add':
            return `(${a} + ${b})`;
          case 'sub':
            return `(${a} - ${b})`;
          case 'mul':
            return `(${a} * ${b})`;
          case 'div':
            return `(${a} / max(${b}, 0.0001))`;
          case 'sin':
            return `sin(${a})`;
          case 'cos':
            return `cos(${a})`;
          case 'pow':
            return `pow(${a}, ${b})`;
          case 'max':
            return `max(${a}, ${b})`;
          case 'min':
            return `min(${a}, ${b})`;
          case 'mix':
            return `mix(${a}, ${b}, 0.5)`;
          case 'dot':
            return `dot(${a}, ${b})`;
          case 'length':
            return `length(${a})`;
          case 'fract':
            return `fract(${a})`;
          case 'smoothstep':
            return `smoothstep(0.0, 1.0, ${a})`;
          default:
            return `(${a} + ${b})`;
        }
      }

      // ── Vector nodes ───────────────────────────────────────────────────
      case 'DotProduct': {
        const a = inputs.get('a') ?? 'vec3f(0.0)';
        const b = inputs.get('b') ?? 'vec3f(0.0)';
        return `dot(${a}, ${b})`;
      }
      case 'Normalize': {
        const v = inputs.get('v') ?? inputs.get('a') ?? 'vec3f(0.0, 0.0, 1.0)';
        return `normalize(${v})`;
      }
      case 'Mix': {
        const a = inputs.get('a') ?? 'vec4f(0.0)';
        const b = inputs.get('b') ?? 'vec4f(1.0)';
        const t = inputs.get('t') ?? '0.5';
        return `mix(${a}, ${b}, ${t})`;
      }

      // ── Color nodes ────────────────────────────────────────────────────
      case 'ColorConstant': {
        const v = data?.value;
        if (Array.isArray(v) && v.length >= 4) {
          return `vec4f(${this.toF32(v[0])}, ${this.toF32(v[1])}, ${this.toF32(v[2])}, ${this.toF32(v[3])})`;
        }
        return 'vec4f(1.0, 1.0, 1.0, 1.0)';
      }
      case 'HsvToRgb': {
        const hsv = inputs.get('hsv') ?? inputs.get('a') ?? 'vec3f(0.5, 1.0, 1.0)';
        return `(vec3f(clamp(abs(fract(${hsv}.x + vec3f(1.0, 0.6667, 0.3333)) * 6.0 - 3.0) - 1.0, vec3f(0.0), vec3f(1.0))) * ${hsv}.z)`;
      }

      // ── Texture nodes ──────────────────────────────────────────────────
      case 'Texture2D':
      case 'texture': {
        const uv = inputs.get('uv') ?? inputs.get('a') ?? 'in.vUv';
        const samplerName = `uTexture_${node.id.replace(/[^a-zA-Z0-9_]/g, '_')}`;
        this.uniforms.add(samplerName);
        return `textureSample(${samplerName}, ${samplerName}_sampler, ${uv})`;
      }

      // ── Procedural nodes ───────────────────────────────────────────────
      case 'NoiseNode': {
        const uv = inputs.get('uv') ?? inputs.get('a') ?? 'in.vUv';
        const scale = inputs.get('scale') ?? inputs.get('b') ?? '10.0';
        return `snoise(${uv} * ${scale})`;
      }
      case 'VoronoiNode': {
        const uv = inputs.get('uv') ?? inputs.get('a') ?? 'in.vUv';
        const scale = inputs.get('scale') ?? inputs.get('b') ?? '5.0';
        return `(1.0 - fract(sin(dot(floor(${uv} * ${scale}), vec2f(127.1, 311.7))) * 43758.5453))`;
      }
      case 'GradientNode': {
        const uv = inputs.get('uv') ?? inputs.get('a') ?? 'in.vUv';
        const colorA = inputs.get('colorA') ?? 'vec4f(0.0, 0.0, 0.0, 1.0)';
        const colorB = inputs.get('colorB') ?? 'vec4f(1.0, 1.0, 1.0, 1.0)';
        return `mix(${colorA}, ${colorB}, ${uv}.y)`;
      }

      // ── Utility nodes ──────────────────────────────────────────────────
      case 'Clamp': {
        const x = inputs.get('x') ?? inputs.get('a') ?? '0.0';
        const lo = inputs.get('min') ?? '0.0';
        const hi = inputs.get('max') ?? '1.0';
        return `clamp(${x}, ${lo}, ${hi})`;
      }
      case 'Remap': {
        const x = inputs.get('x') ?? inputs.get('a') ?? '0.0';
        return `(${x} * 2.0 - 1.0)`;
      }

      // ── Volumetric nodes ───────────────────────────────────────────────
      case 'FogNode': {
        const density = inputs.get('density') ?? inputs.get('a') ?? '0.1';
        return `exp(-${density})`;
      }

      // ── Bake-specific nodes ────────────────────────────────────────────
      case 'AmbientOcclusion': {
        return '1.0'; // Placeholder: AO bake requires ray-casting pass
      }

      // ── Custom GLSL (passthrough) ──────────────────────────────────────
      case 'CustomGLSL': {
        const input = inputs.get('input') ?? inputs.get('a') ?? 'vec4f(0.0)';
        return input;
      }

      // ── Output nodes (should not reach here, handled at entry point) ──
      case 'PBROutput':
      case 'FragOutput':
      case 'VertOutput':
      case 'output':
      case 'outputNode':
        return 'vec4f(1.0)';

      default:
        return '0.0';
    }
  }

  /**
   * Infer the WGSL type for a node's output based on its type.
   * For math/vector operations (AddNode, MultiplyNode, mathNode, Normalize),
   * propagates type from upstream inputs — e.g. vec3 + vec3 = vec3f, not f32.
   */
  private inferWGSLType(node: GNode, upstreamVars?: Map<string, string>): string {
    const inferData = node.data as Record<string, unknown> | undefined;
    const nodeType = node.type ?? (inferData?.type as string) ?? '';

    switch (nodeType) {
      case 'vec2':
      case 'UVInput':
      case 'uvNode':
      case 'uv':
        return 'vec2f';

      case 'vec3':
      case 'PositionInput':
      case 'NormalInput':
      case 'Normal':
      case 'HsvToRgb':
        return 'vec3f';

      case 'vec4':
      case 'ColorConstant':
      case 'Texture2D':
      case 'texture':
      case 'GradientNode':
      case 'Mix':
        return 'vec4f';

      case 'float':
      case 'constant':
      case 'SinNode':
      case 'PowNode':
      case 'DotProduct':
      case 'NoiseNode':
      case 'VoronoiNode':
      case 'Clamp':
      case 'Remap':
      case 'FogNode':
      case 'AmbientOcclusion':
      case 'TimeInput':
      case 'timeNode':
      case 'time':
        return 'f32';

      case 'AddNode':
      case 'MultiplyNode':
      case 'mathNode':
      case 'math':
      case 'Normalize':
        // Math/vector ops inherit type from upstream inputs.
        // Use the widest upstream type (vec4 > vec3 > vec2 > f32).
        return this.inferMathOutputType(node.id, nodeType, upstreamVars);

      // Custom GLSL passthrough inherits from upstream
      case 'CustomGLSL':
        return this.inferMathOutputType(node.id, nodeType, upstreamVars);

      default:
        return 'f32';
    }
  }

  /**
   * Determine output type for math/vector operations by inspecting upstream
   * node types. Uses "widest type wins" promotion: vec4f > vec3f > vec2f > f32.
   *
   * Special cases:
   * - DotProduct always returns f32 (scalar) regardless of input vectors
   * - Normalize preserves the vector dimension of its input
   * - Some mathNode operations (dot, length, fract, smoothstep) collapse to f32
   */
  private inferMathOutputType(
    nodeId: string,
    nodeType: string,
    upstreamVars?: Map<string, string>
  ): string {
    // For mathNode with scalar-output operations, always return f32
    if (nodeType === 'mathNode' || nodeType === 'math') {
      const node = this.nodes.get(nodeId);
      const op = (node?.data as Record<string, unknown> | undefined)?.op;
      if (op === 'dot' || op === 'length') {
        return 'f32';
      }
    }

    // Collect types from all upstream nodes connected to this node
    const incomingEdges = this.edges.filter((e) => e.target === nodeId);
    if (incomingEdges.length === 0) {
      return 'f32';
    }

    const TYPE_RANK: Record<string, number> = {
      f32: 0,
      vec2f: 1,
      vec3f: 2,
      vec4f: 3,
    };

    let widestType = 'f32';
    let widestRank = 0;

    for (const edge of incomingEdges) {
      const sourceNode = this.nodes.get(edge.source);
      if (!sourceNode) continue;

      // Recursively infer the type of the upstream node (without upstreamVars
      // to avoid infinite recursion — upstream nodes should already be resolved
      // or have intrinsic types)
      const sourceType = this.inferWGSLType(sourceNode);
      const rank = TYPE_RANK[sourceType] ?? 0;
      if (rank > widestRank) {
        widestRank = rank;
        widestType = sourceType;
      }
    }

    return widestType;
  }

  /**
   * Find the edge connecting an upstream node to a specific target handle
   * (input port) on the output node.
   */
  private findInputEdge(outputNodeId: string, targetHandle: string): GEdge | undefined {
    return this.edges.find((e) => e.target === outputNodeId && e.targetHandle === targetHandle);
  }

  /**
   * Resolve a single PBR input: if an edge connects an upstream node to
   * the given handle, return the variable name; otherwise return the default.
   */
  private resolvePBRInput(outputNodeId: string, handle: string, fallback: string): string {
    const edge = this.findInputEdge(outputNodeId, handle);
    if (edge) {
      const varName = this.variables.get(edge.source);
      if (varName) {
        return varName;
      }
    }
    return fallback;
  }

  // ── Entry Point Assembly ─────────────────────────────────────────────

  private addEntryPoint(outputNode: GNode) {
    this.generatedCode.push(`@fragment`);
    this.generatedCode.push(`fn main(in: VertexOutput) -> @location(0) vec4f {`);

    // Alias uniform buffer fields for convenient access in body code
    if (this.needsTimeUniform) {
      this.generatedCode.push(`  let uTime = uniforms.time;`);
    }

    // Emit all resolved upstream variable declarations
    for (const line of this.bodyLines) {
      this.generatedCode.push(line);
    }

    if (outputNode.type === 'PBROutput') {
      // Resolve each PBR input from connected edges or use defaults
      const albedoExpr = this.resolvePBRInput(outputNode.id, 'albedo', PBR_DEFAULTS.albedo);
      const roughnessExpr = this.resolvePBRInput(
        outputNode.id,
        'roughness',
        PBR_DEFAULTS.roughness
      );
      const metallicExpr = this.resolvePBRInput(outputNode.id, 'metallic', PBR_DEFAULTS.metallic);
      const normalExpr = this.resolvePBRInput(outputNode.id, 'normal', PBR_DEFAULTS.normal);
      const emissionExpr = this.resolvePBRInput(outputNode.id, 'emission', PBR_DEFAULTS.emission);
      const alphaExpr = this.resolvePBRInput(outputNode.id, 'alpha', PBR_DEFAULTS.alpha);

      this.generatedCode.push(`  let albedo = ${albedoExpr};`);
      this.generatedCode.push(`  let roughness = ${roughnessExpr};`);
      this.generatedCode.push(`  let metallic = ${metallicExpr};`);
      this.generatedCode.push(`  let N = normalize(${normalExpr});`);
      this.generatedCode.push(`  let emission = ${emissionExpr};`);

      // Simplified PBR lighting: Lambertian diffuse + Schlick Fresnel
      this.generatedCode.push(``);
      this.generatedCode.push(`  // PBR lighting (simplified Cook-Torrance)`);
      this.generatedCode.push(`  let lightDir = normalize(vec3f(1.0, 1.0, 0.5));`);
      this.generatedCode.push(`  let viewDir = normalize(vec3f(0.0, 0.0, 1.0));`);
      this.generatedCode.push(`  let halfVec = normalize(lightDir + viewDir);`);
      this.generatedCode.push(`  let NdotL = max(dot(N, lightDir), 0.0);`);
      this.generatedCode.push(`  let NdotH = max(dot(N, halfVec), 0.0);`);
      this.generatedCode.push(``);
      this.generatedCode.push(`  // Roughness-based specular (GGX approximation)`);
      this.generatedCode.push(`  let alpha2 = roughness * roughness;`);
      this.generatedCode.push(`  let spec = pow(NdotH, 2.0 / max(alpha2, 0.001));`);
      this.generatedCode.push(``);
      this.generatedCode.push(`  // Fresnel-Schlick (F0 from metallic)`);
      this.generatedCode.push(`  let F0 = mix(vec3f(0.04), albedo, metallic);`);
      this.generatedCode.push(
        `  let fresnel = F0 + (vec3f(1.0) - F0) * pow(1.0 - max(dot(halfVec, viewDir), 0.0), 5.0);`
      );
      this.generatedCode.push(``);
      this.generatedCode.push(`  // Combine diffuse + specular + emission`);
      this.generatedCode.push(
        `  let diffuse = albedo * (vec3f(1.0) - fresnel) * (1.0 - metallic) * NdotL;`
      );
      this.generatedCode.push(`  let specular = fresnel * spec * NdotL;`);
      this.generatedCode.push(`  let ambient = albedo * 0.03;`);
      this.generatedCode.push(`  let color = ambient + diffuse + specular + emission;`);
      this.generatedCode.push(``);
      this.generatedCode.push(`  return vec4f(color, ${alphaExpr});`);
    } else {
      // Basic Fragment Output
      this.generatedCode.push(`  return vec4f(1.0, 1.0, 1.0, 1.0);`);
    }

    this.generatedCode.push(`}`);
  }

  // ── Utility ──────────────────────────────────────────────────────────

  /**
   * Format a numeric value as a WGSL f32 literal.
   */
  private toF32(v: unknown): string {
    const num = typeof v === 'number' ? v : parseFloat(String(v));
    if (isNaN(num)) return '0.0';
    const s = num.toString();
    return s.includes('.') ? s : s + '.0';
  }

  private addSimplexNoiseFunction() {
    this.generatedCode.push(`// Simplex Noise (WGSL)`);
    this.generatedCode.push(
      `fn permute(x: vec3f) -> vec3f { return ((x * 34.0) + 1.0) * x % 289.0; }`
    );
    this.generatedCode.push(`fn snoise(v: vec2f) -> f32 {`);
    this.generatedCode.push(`  // Minimal noise stub for compilation validity`);
    this.generatedCode.push(`  return sin(v.x * 10.0) * cos(v.y * 10.0);`);
    this.generatedCode.push(`}`);
    this.generatedCode.push(``);
  }
}

/**
 * Convenience wrapper for direct graph array compilation.
 */
export function translateGraphToWGSL(nodes: GNode[], edges: GEdge[]): WGSLCompileResult {
  const translator = new WGSLTranslator(nodes, edges);
  return translator.compile();
}
