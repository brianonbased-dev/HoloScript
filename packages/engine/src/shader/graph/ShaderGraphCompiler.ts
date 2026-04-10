/**
 * Shader Graph Compiler
 *
 * Compiles shader graphs to WGSL shader code
 */

import { ShaderGraph } from './ShaderGraph';
import type {
  IShaderNode,
  IShaderConnection,
  ICompiledShader,
  ICompileOptions,
  IShaderUniform,
  IShaderTexture,
  ShaderDataType,
} from './ShaderGraphTypes';
import { getNodeTemplate, getTypeConversion } from './ShaderGraphTypes';

// ============================================================================
// Shader Compiler
// ============================================================================

/**
 * Compiles shader graphs to WGSL code
 */
export class ShaderGraphCompiler {
  private graph: ShaderGraph;
  private options: Required<ICompileOptions>;
  private variableCounter = 0;
  private nodeVariables: Map<string, Map<string, string>> = new Map();
  private uniforms: IShaderUniform[] = [];
  private textures: IShaderTexture[] = [];
  private warnings: string[] = [];
  private errors: string[] = [];

  constructor(graph: ShaderGraph, options?: Partial<ICompileOptions>) {
    this.graph = graph;
    this.options = {
      target: options?.target ?? 'wgsl',
      optimize: options?.optimize ?? true,
      debug: options?.debug ?? false,
      defines: options?.defines ?? {},
    };
  }

  /**
   * Compile the shader graph
   */
  compile(): ICompiledShader {
    this.reset();

    // Validate graph
    const validation = this.graph.validate();
    if (!validation.valid) {
      return {
        vertexCode: '',
        fragmentCode: '',
        uniforms: [],
        textures: [],
        warnings: validation.warnings,
        errors: validation.errors,
      };
    }

    this.warnings = validation.warnings;

    // Get sorted nodes
    const sortedNodes = this.graph.getTopologicalOrder();

    // Generate code for each node
    const fragmentBody = this.generateFragmentBody(sortedNodes);
    const vertexBody = this.generateVertexBody(sortedNodes);

    // Generate complete shader code
    const vertexCode = this.generateVertexShader(vertexBody);
    const fragmentCode = this.generateFragmentShader(fragmentBody);

    return {
      vertexCode,
      fragmentCode,
      uniforms: this.uniforms,
      textures: this.textures,
      warnings: this.warnings,
      errors: this.errors,
    };
  }

  /**
   * Reset compilation state
   */
  private reset(): void {
    this.variableCounter = 0;
    this.nodeVariables.clear();
    this.uniforms = [];
    this.textures = [];
    this.warnings = [];
    this.errors = [];
  }

  /**
   * Generate a unique variable name
   */
  private generateVariable(): string {
    return `v_${this.variableCounter++}`;
  }

  /**
   * Get or create variable for a node output
   */
  private getOutputVariable(nodeId: string, portId: string): string {
    if (!this.nodeVariables.has(nodeId)) {
      this.nodeVariables.set(nodeId, new Map());
    }
    const nodeVars = this.nodeVariables.get(nodeId)!;

    if (!nodeVars.has(portId)) {
      nodeVars.set(portId, this.generateVariable());
    }

    return nodeVars.get(portId)!;
  }

  /**
   * Get input expression for a node input
   */
  private getInputExpression(
    node: IShaderNode,
    portId: string,
    connections: IShaderConnection[]
  ): string {
    const port = node.inputs.find((p) => p.id === portId);
    if (!port) {
      return '0.0';
    }

    // Check for connection
    const connection = connections.find((c) => c.toNode === node.id && c.toPort === portId);

    if (connection) {
      const sourceNode = this.graph.getNode(connection.fromNode);
      const sourcePort = sourceNode?.outputs.find((p) => p.id === connection.fromPort);

      if (sourceNode && sourcePort) {
        const varName = this.getOutputVariable(connection.fromNode, connection.fromPort);

        // Add type conversion if needed
        if (sourcePort.type !== port.type) {
          return getTypeConversion(sourcePort.type, port.type, varName);
        }

        return varName;
      }
    }

    // Use default value
    return this.getDefaultValueCode(port.type, port.defaultValue);
  }

  /**
   * Get WGSL code for default value
   */
  private getDefaultValueCode(type: ShaderDataType, value?: number | number[]): string {
    if (value === undefined) {
      return this.getZeroValue(type);
    }

    if (typeof value === 'number') {
      if (type === 'float') return `${value}`;
      if (type === 'int') return `${Math.floor(value)}i`;
      return `${value}`;
    }

    if (Array.isArray(value)) {
      switch (type) {
        case 'vec2':
          return `vec2<f32>(${value[0] ?? 0}, ${value[1] ?? 0})`;
        case 'vec3':
          return `vec3<f32>(${value[0] ?? 0}, ${value[1] ?? 0}, ${value[2] ?? 0})`;
        case 'vec4':
          return `vec4<f32>(${value[0] ?? 0}, ${value[1] ?? 0}, ${value[2] ?? 0}, ${value[3] ?? 1})`;
        default:
          return this.getZeroValue(type);
      }
    }

    return this.getZeroValue(type);
  }

  /**
   * Get zero value for a type
   */
  private getZeroValue(type: ShaderDataType): string {
    switch (type) {
      case 'float':
        return '0.0';
      case 'vec2':
        return 'vec2<f32>(0.0)';
      case 'vec3':
        return 'vec3<f32>(0.0)';
      case 'vec4':
        return 'vec4<f32>(0.0, 0.0, 0.0, 1.0)';
      case 'int':
        return '0i';
      case 'ivec2':
        return 'vec2<i32>(0)';
      case 'ivec3':
        return 'vec3<i32>(0)';
      case 'ivec4':
        return 'vec4<i32>(0)';
      case 'bool':
        return 'false';
      case 'mat2':
        return 'mat2x2<f32>(1.0, 0.0, 0.0, 1.0)';
      case 'mat3':
        return 'mat3x3<f32>(1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0)';
      case 'mat4':
        return 'mat4x4<f32>(1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0)';
      default:
        return '0.0';
    }
  }

  /**
   * Get WGSL type name
   */
  private getWGSLType(type: ShaderDataType): string {
    switch (type) {
      case 'float':
        return 'f32';
      case 'vec2':
        return 'vec2<f32>';
      case 'vec3':
        return 'vec3<f32>';
      case 'vec4':
        return 'vec4<f32>';
      case 'int':
        return 'i32';
      case 'ivec2':
        return 'vec2<i32>';
      case 'ivec3':
        return 'vec3<i32>';
      case 'ivec4':
        return 'vec4<i32>';
      case 'bool':
        return 'bool';
      case 'mat2':
        return 'mat2x2<f32>';
      case 'mat3':
        return 'mat3x3<f32>';
      case 'mat4':
        return 'mat4x4<f32>';
      default:
        return 'f32';
    }
  }

  /**
   * Generate fragment shader body
   */
  private generateFragmentBody(nodes: IShaderNode[]): string {
    const lines: string[] = [];
    const connections = this.graph.connections;

    for (const node of nodes) {
      if (
        node.category === 'output' &&
        node.type !== 'output_surface' &&
        node.type !== 'output_unlit' &&
        node.type !== 'output_volume'
      ) {
        continue; // Skip non-relevant outputs in fragment shader
      }

      const template = getNodeTemplate(node.type);
      if (!template) {
        this.warnings.push(`No template found for node type: ${node.type}`);
        continue;
      }

      // Build input expressions
      const inputs: Record<string, string> = {};
      for (const port of node.inputs) {
        inputs[port.id] = this.getInputExpression(node, port.id, connections);
      }

      // Generate code
      const code = template.generateCode(node, inputs);

      // Handle different node types
      if (node.type === 'output_surface') {
        lines.push(`// Surface output`);
        lines.push(`let baseColor = ${inputs.baseColor};`);
        lines.push(`let metallic = ${inputs.metallic};`);
        lines.push(`let roughness = ${inputs.roughness};`);
        lines.push(`let normal = ${inputs.normal};`);
        lines.push(`let emission = ${inputs.emission};`);
        lines.push(`let alpha = ${inputs.alpha};`);
        lines.push(`let ao = ${inputs.ao};`);
        // Extended PBR inputs
        lines.push(`let sheenColor = ${inputs.sheenColor ?? 'vec3<f32>(0.0)'};`);
        lines.push(`let sheenRoughness = ${inputs.sheenRoughness ?? '0.0'};`);
        lines.push(`let subsurfaceThickness = ${inputs.subsurfaceThickness ?? '0.0'};`);
        lines.push(`let subsurfaceColor = ${inputs.subsurfaceColor ?? 'vec3<f32>(0.0)'};`);
        lines.push(`let anisotropyVal = ${inputs.anisotropy ?? '0.0'};`);
        lines.push(`let anisotropyRotation = ${inputs.anisotropyRotation ?? '0.0'};`);
        lines.push(`let clearcoatVal = ${inputs.clearcoat ?? '0.0'};`);
        lines.push(`let clearcoatRoughnessVal = ${inputs.clearcoatRoughness ?? '0.0'};`);
        lines.push(`let iridescenceVal = ${inputs.iridescence ?? '0.0'};`);
        // Exotic optics inputs
        lines.push(`let sparkleIntensity = ${inputs.sparkleIntensity ?? '0.0'};`);
        lines.push(`let sparkleDensity = ${inputs.sparkleDensity ?? '0.0'};`);
        lines.push(`let fluorescenceColor = ${inputs.fluorescenceColor ?? 'vec3<f32>(0.0)'};`);
        lines.push(`let fluorescenceIntensity = ${inputs.fluorescenceIntensity ?? '0.0'};`);
        lines.push(`let blackbodyTemp = ${inputs.blackbodyTemp ?? '0.0'};`);
        lines.push(`let retroreflectionVal = ${inputs.retroreflection ?? '0.0'};`);
      } else if (node.type === 'output_volume') {
        lines.push(`// Volumetric output — ray march`);
        lines.push(`let volDensity = ${inputs.density ?? '0.5'};`);
        lines.push(`let volColor = ${inputs.color ?? 'vec3<f32>(1.0)'};`);
        lines.push(`let volEmission = ${inputs.emission ?? 'vec3<f32>(0.0)'};`);
        lines.push(`let volScattering = ${inputs.scattering ?? '0.5'};`);
        lines.push(`let volAbsorption = ${inputs.absorption ?? '0.1'};`);
        lines.push(`let volSteps = ${inputs.steps ?? '64.0'};`);
        lines.push(`let volMaxDist = ${inputs.maxDistance ?? '10.0'};`);
      } else if (node.type === 'output_unlit') {
        lines.push(`// Unlit output`);
        lines.push(`let finalColor = ${inputs.color};`);
      } else if (node.outputs.length > 0) {
        // Regular node with outputs
        if (this.options.debug) {
          lines.push(`// ${node.name} (${node.id})`);
        }

        // Handle nodes with multiple outputs
        if (node.outputs.length === 1) {
          const varName = this.getOutputVariable(node.id, node.outputs[0].id);
          const wgslType = this.getWGSLType(node.outputs[0].type);
          lines.push(`let ${varName}: ${wgslType} = ${code};`);
        } else {
          // Multiple outputs - need to generate intermediate
          this.generateMultiOutputCode(node, inputs, lines);
        }
      }
    }

    return lines.join('\n  ');
  }

  /**
   * Generate code for nodes with multiple outputs
   */
  private generateMultiOutputCode(
    node: IShaderNode,
    inputs: Record<string, string>,
    lines: string[]
  ): void {
    const template = getNodeTemplate(node.type);
    if (!template) return;

    // Handle split nodes specially
    if (node.type.startsWith('vector_split_')) {
      const inputExpr = inputs.vector;
      for (const output of node.outputs) {
        const varName = this.getOutputVariable(node.id, output.id);
        const wgslType = this.getWGSLType(output.type);
        lines.push(`let ${varName}: ${wgslType} = (${inputExpr}).${output.id};`);
      }
      return;
    }

    // Generic multi-output handling
    const baseCode = template.generateCode(node, inputs);
    const tempVar = this.generateVariable();
    lines.push(`let ${tempVar} = ${baseCode};`);

    for (const output of node.outputs) {
      const varName = this.getOutputVariable(node.id, output.id);
      lines.push(`let ${varName} = ${tempVar}.${output.id};`);
    }
  }

  /**
   * Generate vertex shader body
   */
  private generateVertexBody(nodes: IShaderNode[]): string {
    const lines: string[] = [];
    const connections = this.graph.connections;

    // Find vertex offset output
    const vertexOffsetNode = nodes.find((n) => n.type === 'output_vertex_offset');

    if (vertexOffsetNode) {
      const template = getNodeTemplate(vertexOffsetNode.type);
      if (template) {
        const inputs: Record<string, string> = {};
        for (const port of vertexOffsetNode.inputs) {
          inputs[port.id] = this.getInputExpression(vertexOffsetNode, port.id, connections);
        }

        lines.push(`// Vertex offset`);
        lines.push(`let vertexOffset = ${inputs.offset};`);
        lines.push(`let worldPos = in.position + vertexOffset;`);
      }
    } else {
      lines.push(`let worldPos = in.position;`);
    }

    return lines.join('\n  ');
  }

  /**
   * Generate complete vertex shader
   */
  private generateVertexShader(body: string): string {
    return `// Generated by HoloScript Shader Graph Compiler
// Graph: ${this.graph.name}

struct VertexInput {
  @location(0) position: vec3<f32>,
  @location(1) normal: vec3<f32>,
  @location(2) uv: vec2<f32>,
  @location(3) tangent: vec4<f32>,
};

struct VertexOutput {
  @builtin(position) clipPosition: vec4<f32>,
  @location(0) worldPosition: vec3<f32>,
  @location(1) worldNormal: vec3<f32>,
  @location(2) uv: vec2<f32>,
};

struct CameraUniforms {
  viewProjection: mat4x4<f32>,
  view: mat4x4<f32>,
  projection: mat4x4<f32>,
  position: vec3<f32>,
};

struct ModelUniforms {
  model: mat4x4<f32>,
  normalMatrix: mat3x3<f32>,
};

@group(0) @binding(0) var<uniform> camera: CameraUniforms;
@group(1) @binding(0) var<uniform> model: ModelUniforms;

@vertex
fn main(in: VertexInput) -> VertexOutput {
  var out: VertexOutput;

  ${body}

  let worldPosition = (model.model * vec4<f32>(worldPos, 1.0)).xyz;
  let worldNormal = normalize(model.normalMatrix * in.normal);

  out.worldPosition = worldPosition;
  out.worldNormal = worldNormal;
  out.uv = in.uv;
  out.clipPosition = camera.viewProjection * vec4<f32>(worldPosition, 1.0);

  return out;
}
`;
  }

  /**
   * Generate complete fragment shader
   */
  private generateFragmentShader(body: string): string {
    const textureBindings = this.generateTextureBindings();
    const uniformBindings = this.generateUniformBindings();
    const helperFunctions = this.generateHelperFunctions();

    return `// Generated by HoloScript Shader Graph Compiler
// Graph: ${this.graph.name}

struct FragmentInput {
  @location(0) worldPosition: vec3<f32>,
  @location(1) worldNormal: vec3<f32>,
  @location(2) uv: vec2<f32>,
};

struct CameraUniforms {
  viewProjection: mat4x4<f32>,
  view: mat4x4<f32>,
  projection: mat4x4<f32>,
  position: vec3<f32>,
};

struct SceneUniforms {
  ambientColor: vec3<f32>,
  time: f32,
  deltaTime: f32,
};

struct LightData {
  position: vec3<f32>,
  color: vec3<f32>,
  intensity: f32,
};

@group(0) @binding(0) var<uniform> camera: CameraUniforms;
@group(0) @binding(1) var<uniform> scene: SceneUniforms;
@group(0) @binding(2) var<uniform> light: LightData;
${textureBindings}
${uniformBindings}

const PI: f32 = 3.14159265359;

${helperFunctions}

@fragment
fn main(in: FragmentInput) -> @location(0) vec4<f32> {
  ${body}

  // PBR lighting calculation
  let N = normalize(normal);
  let V = normalize(camera.position - in.worldPosition);
  let L = normalize(light.position - in.worldPosition);
  let H = normalize(V + L);
  let NdotV = max(dot(N, V), 0.0);
  let NdotL = max(dot(N, L), 0.0);
  let NdotH = max(dot(N, H), 0.0);
  let VdotH = max(dot(V, H), 0.0);

  let F0 = mix(vec3<f32>(0.04), baseColor, metallic);

  // Cook-Torrance BRDF
  let NDF = distributionGGX(N, H, roughness);
  let G = geometrySmith(N, V, L, roughness);
  let F = fresnelSchlick(VdotH, F0);

  let numerator = NDF * G * F;
  let denominator = 4.0 * NdotV * NdotL + 0.0001;
  let specular = numerator / denominator;

  let kS = F;
  let kD = (vec3<f32>(1.0) - kS) * (1.0 - metallic);

  var Lo = (kD * baseColor / PI + specular) * light.color * light.intensity * NdotL;

  // Sheen — soft fuzzy reflection layer (fabrics, velvet)
  if (sheenRoughness > 0.0 || length(sheenColor) > 0.0) {
    let sheenD = distributionGGX(N, H, sheenRoughness);
    let sheenTerm = sheenColor * sheenD * NdotL;
    Lo = Lo + sheenTerm * light.color * light.intensity;
  }

  // Clearcoat — protective clear layer (car paint, varnish)
  if (clearcoatVal > 0.0) {
    let ccNDF = distributionGGX(N, H, clearcoatRoughnessVal);
    let ccG = geometrySmith(N, V, L, clearcoatRoughnessVal);
    let ccF = fresnelSchlick(VdotH, vec3<f32>(0.04));
    let ccSpec = (ccNDF * ccG * ccF) / (4.0 * NdotV * NdotL + 0.0001);
    Lo = Lo + ccSpec * clearcoatVal * light.color * light.intensity * NdotL;
  }

  // Subsurface scattering approximation (skin, wax, leaves, jade)
  var sssContrib = vec3<f32>(0.0);
  if (subsurfaceThickness > 0.0) {
    let scatterVec = normalize(L + N * 0.5);
    let sssNdotL = max(dot(V, -scatterVec), 0.0);
    let sssFalloff = pow(sssNdotL, 3.0) * subsurfaceThickness;
    sssContrib = subsurfaceColor * sssFalloff * light.color * light.intensity;
    Lo = Lo + sssContrib;
  }

  // Iridescence — thin-film interference (soap bubbles, oil slicks, beetles)
  if (iridescenceVal > 0.0) {
    let thinFilmPhase = VdotH * 6.28318;
    let iriColor = vec3<f32>(
      0.5 + 0.5 * cos(thinFilmPhase),
      0.5 + 0.5 * cos(thinFilmPhase + 2.094),
      0.5 + 0.5 * cos(thinFilmPhase + 4.189)
    );
    Lo = mix(Lo, Lo * iriColor, iridescenceVal * 0.5);
  }

  // Sparkle/glitter — stochastic micro-facet flashing
  if (sparkleIntensity > 0.0) {
    let sparkleUV = in.uv * sparkleDensity;
    let sparkleCell = floor(sparkleUV);
    let sparkleRand = simpleNoise(sparkleCell);
    let sparkleAngle = sparkleRand * 6.28318;
    let sparkleNormal = vec3<f32>(cos(sparkleAngle) * 0.3, sin(sparkleAngle) * 0.3, 0.9);
    let sparkleReflect = max(dot(reflect(-V, normalize(sparkleNormal)), L), 0.0);
    let sparkleFlash = pow(sparkleReflect, 64.0) * step(0.85, sparkleRand) * sparkleIntensity;
    Lo = Lo + vec3<f32>(sparkleFlash) * light.color * light.intensity;
  }

  // Blackbody radiation — temperature-driven emission color (Planck approximation)
  if (blackbodyTemp > 0.0) {
    let bbColor = blackbodyColor(blackbodyTemp, 1.0);
    Lo = Lo + bbColor;
  }

  // Fluorescence — absorb short λ, re-emit longer λ
  if (fluorescenceIntensity > 0.0) {
    let excitationMatch = dot(normalize(light.color), normalize(fluorescenceColor));
    let fluorEmit = fluorescenceColor * max(excitationMatch, 0.3) * fluorescenceIntensity;
    Lo = Lo + fluorEmit;
  }

  // Retroreflection — light bounces back toward source
  if (retroreflectionVal > 0.0) {
    let retroDot = max(dot(V, L), 0.0);
    let retroTerm = pow(retroDot, 8.0) * retroreflectionVal;
    Lo = Lo + baseColor * retroTerm * light.color * light.intensity;
  }

  var color = scene.ambientColor * baseColor * ao + Lo + emission;

  // Volumetric contribution (if output_volume is connected)
  // The volDensity variable is set by output_volume node; if absent the default is 0
  // which makes the rayMarchVolume return transparent, so the surface pass dominates.

  // Tone mapping (Reinhard)
  color = color / (color + vec3<f32>(1.0));

  // Gamma correction
  color = pow(color, vec3<f32>(1.0 / 2.2));

  return vec4<f32>(color, alpha);
}
`;
  }

  /**
   * Generate texture bindings
   */
  private generateTextureBindings(): string {
    if (this.textures.length === 0) return '';

    const lines: string[] = [];
    for (const tex of this.textures) {
      const binding = tex.binding;
      lines.push(`@group(2) @binding(${binding}) var ${tex.name}: texture_2d<f32>;`);
      lines.push(`@group(2) @binding(${binding + 1}) var ${tex.name}Sampler: sampler;`);
    }
    return lines.join('\n');
  }

  /**
   * Generate uniform bindings
   */
  private generateUniformBindings(): string {
    if (this.uniforms.length === 0) return '';

    const lines: string[] = ['struct MaterialUniforms {'];
    for (const uniform of this.uniforms) {
      const wgslType = this.getWGSLType(uniform.type);
      lines.push(`  ${uniform.name}: ${wgslType},`);
    }
    lines.push('};');
    lines.push('@group(2) @binding(100) var<uniform> material: MaterialUniforms;');
    return lines.join('\n');
  }

  /**
   * Generate helper functions
   */
  private generateHelperFunctions(): string {
    return `
// PBR helper functions
fn distributionGGX(N: vec3<f32>, H: vec3<f32>, roughness: f32) -> f32 {
  let a = roughness * roughness;
  let a2 = a * a;
  let NdotH = max(dot(N, H), 0.0);
  let NdotH2 = NdotH * NdotH;

  let num = a2;
  let denom = (NdotH2 * (a2 - 1.0) + 1.0);
  let denom2 = PI * denom * denom;

  return num / denom2;
}

fn geometrySchlickGGX(NdotV: f32, roughness: f32) -> f32 {
  let r = roughness + 1.0;
  let k = (r * r) / 8.0;

  let num = NdotV;
  let denom = NdotV * (1.0 - k) + k;

  return num / denom;
}

fn geometrySmith(N: vec3<f32>, V: vec3<f32>, L: vec3<f32>, roughness: f32) -> f32 {
  let NdotV = max(dot(N, V), 0.0);
  let NdotL = max(dot(N, L), 0.0);
  let ggx2 = geometrySchlickGGX(NdotV, roughness);
  let ggx1 = geometrySchlickGGX(NdotL, roughness);

  return ggx1 * ggx2;
}

fn fresnelSchlick(cosTheta: f32, F0: vec3<f32>) -> vec3<f32> {
  return F0 + (vec3<f32>(1.0) - F0) * pow(saturate(1.0 - cosTheta), 5.0);
}

fn hueShift(color: vec3<f32>, shift: f32) -> vec3<f32> {
  let k = vec3<f32>(0.57735);
  let cosAngle = cos(shift);
  return color * cosAngle + cross(k, color) * sin(shift) + k * dot(k, color) * (1.0 - cosAngle);
}

fn simpleNoise(uv: vec2<f32>) -> f32 {
  return fract(sin(dot(uv, vec2<f32>(12.9898, 78.233))) * 43758.5453);
}

fn gradientNoise(uv: vec2<f32>) -> f32 {
  let i = floor(uv);
  let f = fract(uv);
  let u = f * f * (3.0 - 2.0 * f);

  let n00 = simpleNoise(i);
  let n10 = simpleNoise(i + vec2<f32>(1.0, 0.0));
  let n01 = simpleNoise(i + vec2<f32>(0.0, 1.0));
  let n11 = simpleNoise(i + vec2<f32>(1.0, 1.0));

  return mix(mix(n00, n10, u.x), mix(n01, n11, u.x), u.y);
}

fn voronoi(uv: vec2<f32>) -> vec2<f32> {
  let n = floor(uv);
  let f = fract(uv);

  var minDist = 1.0;
  var cellId = 0.0;

  for (var j = -1; j <= 1; j++) {
    for (var i = -1; i <= 1; i++) {
      let neighbor = vec2<f32>(f32(i), f32(j));
      let point = simpleNoise(n + neighbor);
      let diff = neighbor + point - f;
      let dist = length(diff);
      if (dist < minDist) {
        minDist = dist;
        cellId = simpleNoise(n + neighbor);
      }
    }
  }

  return vec2<f32>(cellId, minDist);
}

// =========================================================================
// Advanced Material Functions
// =========================================================================

// Blackbody radiation — Planck approximation: temperature (Kelvin) → RGB color
fn blackbodyColor(tempK: f32, intensity: f32) -> vec3<f32> {
  // CIE 1931 approximation for blackbody emission
  let t = clamp(tempK, 1000.0, 40000.0) / 100.0;
  var r: f32; var g: f32; var b: f32;

  // Red channel
  if (t <= 66.0) {
    r = 1.0;
  } else {
    r = pow((t - 60.0) / 40.0, -0.1332);
    r = clamp(r, 0.0, 1.0);
  }

  // Green channel
  if (t <= 66.0) {
    g = 0.39 * log(t) - 0.63;
  } else {
    g = 1.29 * pow((t - 60.0) / 40.0, -0.0755);
  }
  g = clamp(g, 0.0, 1.0);

  // Blue channel
  if (t >= 66.0) {
    b = 1.0;
  } else if (t <= 19.0) {
    b = 0.0;
  } else {
    b = 0.543 * log(t - 10.0) - 1.19;
    b = clamp(b, 0.0, 1.0);
  }

  return vec3<f32>(r, g, b) * intensity;
}

// Sparkle / Glitter — stochastic micro-facet flash
fn sparkleFlash(uv: vec2<f32>, density: f32, size: f32, intensity: f32, viewDir: vec3<f32>, normal: vec3<f32>) -> vec2<f32> {
  let cell = floor(uv * density);
  let rand = simpleNoise(cell);
  let threshold = 1.0 - size;
  let flash = step(threshold, rand) * intensity;
  return vec2<f32>(flash, rand);
}

// Animated pattern — time-varying surface effects
fn animatedPattern(uv: vec2<f32>, time: f32, patternType: f32, speed: f32, amplitude: f32, scale: f32) -> vec2<f32> {
  let t = time * speed;
  let suv = uv * scale;
  var value: f32 = 0.0;
  var uvOffset = vec2<f32>(0.0);

  let pType = i32(patternType);

  // 0: ripple — concentric rings from center
  if (pType == 0) {
    let dist = length(suv - vec2<f32>(0.5));
    value = sin(dist * 20.0 - t * 4.0) * 0.5 + 0.5;
  }
  // 1: flicker — random temporal noise
  else if (pType == 1) {
    value = simpleNoise(vec2<f32>(t * 3.0, 0.0));
  }
  // 2: pulse — breathing sine wave
  else if (pType == 2) {
    value = sin(t * 2.0) * 0.5 + 0.5;
  }
  // 3: flow — directional scroll
  else if (pType == 3) {
    uvOffset = vec2<f32>(t * 0.1, 0.0);
    value = simpleNoise(suv + uvOffset);
  }
  // 4: breathe — slow amplitude modulation
  else if (pType == 4) {
    value = sin(t * 0.5) * 0.5 + 0.5;
    value = value * value; // ease-in
  }
  // 5: scroll — vertical scroll
  else if (pType == 5) {
    uvOffset = vec2<f32>(0.0, t * 0.1);
    value = gradientNoise(suv + uvOffset);
  }
  // 6: wave — sinusoidal displacement
  else if (pType == 6) {
    value = sin(suv.x * 10.0 + t * 3.0) * sin(suv.y * 10.0 + t * 2.0) * 0.5 + 0.5;
  }
  // 7: noise — animated Perlin
  else {
    value = gradientNoise(suv + vec2<f32>(t * 0.2));
  }

  return vec2<f32>(value * amplitude, 0.0);
}

// Weathering — procedural surface degradation
fn weatheringSurface(uv: vec2<f32>, progress: f32, weatherType: f32, seed: f32, baseColor: vec3<f32>) -> vec3<f32> {
  let noise1 = gradientNoise(uv * 8.0 + vec2<f32>(seed));
  let noise2 = simpleNoise(uv * 16.0 + vec2<f32>(seed * 2.0));
  let mask = smoothstep(1.0 - progress, 1.0 - progress + 0.2, noise1);

  let wType = i32(weatherType);
  var weatherColor = vec3<f32>(0.5);

  // 0: rust
  if (wType == 0) { weatherColor = vec3<f32>(0.55, 0.22, 0.08); }
  // 1: moss
  else if (wType == 1) { weatherColor = vec3<f32>(0.29, 0.49, 0.25); }
  // 2: crack — darken along cracks
  else if (wType == 2) { weatherColor = baseColor * 0.3; }
  // 3: peel — reveal underlayer
  else if (wType == 3) { weatherColor = vec3<f32>(0.85, 0.82, 0.78); }
  // 4: patina
  else if (wType == 4) { weatherColor = vec3<f32>(0.29, 0.55, 0.49); }
  // 5: frost
  else if (wType == 5) { weatherColor = vec3<f32>(0.9, 0.95, 1.0); }
  // 6: burn
  else if (wType == 6) { weatherColor = vec3<f32>(0.1, 0.08, 0.05); }
  // 7: erosion
  else if (wType == 7) { weatherColor = baseColor * (0.5 + noise2 * 0.3); }
  // 8: stain
  else if (wType == 8) { weatherColor = mix(baseColor, vec3<f32>(0.4, 0.35, 0.25), 0.6); }
  // 9: dust
  else { weatherColor = mix(baseColor, vec3<f32>(0.75, 0.7, 0.65), 0.4); }

  return mix(baseColor, weatherColor, mask);
}

// Dual-layer material blend
fn dualLayerBlend(
  baseCol: vec3<f32>, baseRough: f32, baseMetal: f32,
  topCol: vec3<f32>, topRough: f32, topMetal: f32,
  blend: f32, mode: f32, normal: vec3<f32>, uv: vec2<f32>
) -> vec3<f32> {
  var factor = blend;

  let modeInt = i32(mode);
  // 0: linear
  // 1: height-based (top appears on upward-facing surfaces)
  if (modeInt == 1) {
    factor = factor * max(normal.y, 0.0);
  }
  // 2: noise-based
  else if (modeInt == 2) {
    let n = gradientNoise(uv * 8.0);
    factor = smoothstep(0.5 - blend * 0.5, 0.5 + blend * 0.5, n);
  }
  // 3: fresnel-based (top appears at grazing angles)
  else if (modeInt == 3) {
    factor = factor; // fresnel computed in main lighting — blend is direct here
  }

  return mix(baseCol, topCol, factor);
}

// Fluorescence — absorb excitation wavelengths, emit shifted color
fn fluorescenceEmit(lightColor: vec3<f32>, excitationColor: vec3<f32>, emissionColor: vec3<f32>, intensity: f32) -> vec3<f32> {
  let match = dot(normalize(lightColor), normalize(excitationColor));
  return emissionColor * max(match, 0.0) * intensity;
}

// Retroreflection — light reflects back toward its source
fn retroReflect(viewDir: vec3<f32>, lightDir: vec3<f32>, normal: vec3<f32>, intensity: f32) -> f32 {
  let retroDot = max(dot(viewDir, lightDir), 0.0);
  return pow(retroDot, 8.0) * intensity;
}

// =========================================================================
// Volumetric Material Functions — Ray Marching, 3D Noise, Scattering
// =========================================================================

// 3D noise — hash-based, for volumetric density
fn noise3D(p: vec3<f32>) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);

  let n000 = simpleNoise(i.xy + vec2<f32>(0.0, i.z * 37.0));
  let n100 = simpleNoise(i.xy + vec2<f32>(1.0, i.z * 37.0));
  let n010 = simpleNoise(i.xy + vec2<f32>(0.0, (i.z + 1.0) * 37.0 + 17.0));
  let n110 = simpleNoise(i.xy + vec2<f32>(1.0, (i.z + 1.0) * 37.0 + 17.0));
  let n001 = simpleNoise(i.xy + vec2<f32>(i.z * 37.0 + 59.0, 0.0));
  let n101 = simpleNoise(i.xy + vec2<f32>(i.z * 37.0 + 60.0, 0.0));
  let n011 = simpleNoise(i.xy + vec2<f32>((i.z + 1.0) * 37.0 + 59.0, 17.0));
  let n111 = simpleNoise(i.xy + vec2<f32>((i.z + 1.0) * 37.0 + 60.0, 17.0));

  let x0 = mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y);
  let x1 = mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y);
  return mix(x0, x1, u.z);
}

// Fractal Brownian Motion in 3D — layered noise octaves
fn fbmNoise3D(p: vec3<f32>, octaves: i32, lacunarity: f32, gain: f32) -> f32 {
  var value = 0.0;
  var amplitude = 1.0;
  var frequency = 1.0;
  var pos = p;

  for (var i = 0; i < octaves; i++) {
    value = value + amplitude * noise3D(pos * frequency);
    amplitude = amplitude * gain;
    frequency = frequency * lacunarity;
  }

  return value;
}

// Curl noise 3D — divergence-free noise for smoke/fire turbulence
fn curlNoise3D(p: vec3<f32>) -> vec3<f32> {
  let eps = 0.01;
  let dx = vec3<f32>(eps, 0.0, 0.0);
  let dy = vec3<f32>(0.0, eps, 0.0);
  let dz = vec3<f32>(0.0, 0.0, eps);

  let dFzdy = noise3D(p + dy) - noise3D(p - dy);
  let dFydz = noise3D(p + dz) - noise3D(p - dz);
  let dFxdz = noise3D(p + dz + dx) - noise3D(p - dz + dx);
  let dFzdx = noise3D(p + dx) - noise3D(p - dx);
  let dFydx = noise3D(p + dx + dy) - noise3D(p - dx + dy);
  let dFxdy = noise3D(p + dy + dx) - noise3D(p - dy + dx);

  return vec3<f32>(
    dFzdy - dFydz,
    dFxdz - dFzdx,
    dFydx - dFxdy
  ) / (2.0 * eps);
}

// Volume density at a 3D position with FBM noise
fn volumeDensity(pos: vec3<f32>, baseDensity: f32, noiseScale: f32, noiseOctaves: f32, time: f32) -> f32 {
  let animatedPos = pos + vec3<f32>(0.0, time * 0.1, 0.0);
  let n = fbmNoise3D(animatedPos * noiseScale, i32(noiseOctaves), 2.0, 0.5);
  return clamp(baseDensity * n, 0.0, 1.0);
}

// Height fog density — exponential falloff with height
fn heightFogDensity(pos: vec3<f32>, groundLevel: f32, density: f32, falloff: f32) -> f32 {
  let height = pos.y - groundLevel;
  return density * exp(-max(height, 0.0) * falloff);
}

// Fire density — buoyant rising, turbulent, temperature-driven
fn fireDensity(pos: vec3<f32>, time: f32, turbulence: f32, riseSpeed: f32, scale: f32) -> vec2<f32> {
  // Rising motion
  let risingPos = pos - vec3<f32>(0.0, time * riseSpeed, 0.0);
  // Turbulence via curl noise
  let curl = curlNoise3D(risingPos * scale * 0.5) * turbulence;
  let distortedPos = risingPos + curl;
  // Base density from FBM
  let d = fbmNoise3D(distortedPos * scale, 4, 2.0, 0.5);
  // Height falloff — fire thins out as it rises
  let heightFade = exp(-max(pos.y, 0.0) * 0.5);
  let density = clamp(d * heightFade, 0.0, 1.0);
  // Temperature — hotter at base, cooler at top
  let temperature = clamp(density * (1.0 - pos.y * 0.3) * 3000.0 + 800.0, 800.0, 3000.0);
  return vec2<f32>(density, temperature);
}

// Henyey-Greenstein phase function — anisotropic light scattering
fn henyeyGreenstein(cosTheta: f32, g: f32) -> f32 {
  let g2 = g * g;
  let denom = 1.0 + g2 - 2.0 * g * cosTheta;
  return (1.0 - g2) / (4.0 * PI * pow(denom, 1.5));
}

// Beer-Lambert transmittance — light attenuation through absorbing medium
fn beerLambert(density: f32, stepLen: f32, absorption: f32) -> f32 {
  return exp(-density * absorption * stepLen);
}

// Volume scattering — transmittance + in-scattering at a sample point
fn volumeScatter(density: f32, scattering: f32, absorption: f32, stepLen: f32, lightDir: vec3<f32>, viewDir: vec3<f32>, phaseAniso: f32) -> vec2<f32> {
  let cosTheta = dot(normalize(lightDir), normalize(viewDir));
  let phase = henyeyGreenstein(cosTheta, phaseAniso);
  let transmittance = beerLambert(density, stepLen, absorption + scattering);
  let inScatter = density * scattering * phase * stepLen;
  return vec2<f32>(transmittance, inScatter);
}

// Volume emission — self-luminous contribution (fire, neon, aurora)
fn volumeEmission(density: f32, emissionColor: vec3<f32>, intensity: f32, temperature: f32) -> vec3<f32> {
  var emCol = emissionColor * intensity * density;
  // If temperature > 0, blend with blackbody color
  if (temperature > 0.0) {
    let bbCol = blackbodyColor(temperature, 1.0);
    emCol = emCol * bbCol;
  }
  return emCol;
}

// Ray-box intersection — returns (tNear, tFar) for axis-aligned bounding box
fn rayBoxIntersect(rayOrigin: vec3<f32>, rayDir: vec3<f32>, boxMin: vec3<f32>, boxMax: vec3<f32>) -> vec2<f32> {
  let invDir = 1.0 / rayDir;
  let t1 = (boxMin - rayOrigin) * invDir;
  let t2 = (boxMax - rayOrigin) * invDir;
  let tMin = min(t1, t2);
  let tMax = max(t1, t2);
  let tNear = max(max(tMin.x, tMin.y), tMin.z);
  let tFar = min(min(tMax.x, tMax.y), tMax.z);
  return vec2<f32>(max(tNear, 0.0), tFar);
}

// Main ray march loop — integrates density, color, emission along a ray
fn rayMarchVolume(
  rayOrigin: vec3<f32>, rayDir: vec3<f32>,
  volDensity: f32, volColor: vec3<f32>, volEmission: vec3<f32>,
  scattering: f32, absorption: f32,
  steps: f32, maxDist: f32
) -> vec4<f32> {
  // Intersect unit cube [-1,1]^3
  let hit = rayBoxIntersect(rayOrigin, rayDir, vec3<f32>(-1.0), vec3<f32>(1.0));
  if (hit.x > hit.y) {
    return vec4<f32>(0.0); // Miss
  }

  let stepCount = i32(steps);
  let tStart = hit.x;
  let tEnd = min(hit.y, maxDist);
  let stepLen = (tEnd - tStart) / f32(stepCount);

  var accColor = vec3<f32>(0.0);
  var accTransmittance = 1.0;

  for (var i = 0; i < stepCount; i++) {
    if (accTransmittance < 0.01) { break; } // Early exit

    let t = tStart + (f32(i) + 0.5) * stepLen;
    let samplePos = rayOrigin + rayDir * t;

    // Sample density with noise
    let d = volumeDensity(samplePos, volDensity, 4.0, 4.0, scene.time);
    if (d < 0.001) { continue; } // Skip empty space

    // Transmittance for this step (Beer-Lambert)
    let stepTransmittance = beerLambert(d, stepLen, absorption + scattering);

    // In-scattering from light
    let lightDir = normalize(light.position - samplePos);
    let cosTheta = dot(lightDir, rayDir);
    let phase = henyeyGreenstein(cosTheta, 0.3);
    let inScatter = d * scattering * phase * stepLen * light.intensity;

    // Emission
    let emissionContrib = volEmission * d * stepLen;

    // Accumulate
    let sampleColor = volColor * inScatter * light.color + emissionContrib;
    accColor = accColor + sampleColor * accTransmittance;
    accTransmittance = accTransmittance * stepTransmittance;
  }

  return vec4<f32>(accColor, 1.0 - accTransmittance);
}

// =========================================================================
// Caustics — underwater refracted light patterns
// =========================================================================

// Voronoi-based caustic pattern (dual-layer for temporal stability)
fn causticVoronoi(p: vec2<f32>) -> f32 {
  let i = floor(p);
  let f = fract(p);
  var minDist = 1.0;
  for (var y = -1; y <= 1; y++) {
    for (var x = -1; x <= 1; x++) {
      let neighbor = vec2<f32>(f32(x), f32(y));
      let cellHash = fract(sin(dot(i + neighbor, vec2<f32>(127.1, 311.7))) * 43758.5453);
      let cellHash2 = fract(sin(dot(i + neighbor, vec2<f32>(269.5, 183.3))) * 43758.5453);
      let point = neighbor + vec2<f32>(cellHash, cellHash2) - f;
      let dist = dot(point, point);
      minDist = min(minDist, dist);
    }
  }
  return sqrt(minDist);
}

fn causticPattern(
  pos: vec3<f32>, time: f32, scale: f32, speed: f32,
  intensity: f32, color: vec3<f32>
) -> vec3<f32> {
  // Dual-layer caustics for interference pattern
  let uv1 = pos.xz * scale + vec2<f32>(time * speed * 0.3, time * speed * 0.7);
  let uv2 = pos.xz * scale * 1.3 + vec2<f32>(-time * speed * 0.5, time * speed * 0.4);
  let c1 = causticVoronoi(uv1);
  let c2 = causticVoronoi(uv2);
  // Combine layers — bright where both layers converge
  let caustic = pow(1.0 - c1, 3.0) * pow(1.0 - c2, 3.0) * intensity;
  return color * caustic;
}

// Chromatic refractive caustics: separate R/G/B with different IoR for prismatic effect
fn causticChromatic(
  pos: vec3<f32>, time: f32, scale: f32, speed: f32,
  intensity: f32, dispersion: f32
) -> vec3<f32> {
  let baseUV = pos.xz * scale;
  let t = time * speed;
  // Offset UV per channel based on dispersion
  let uvR = baseUV + vec2<f32>(t * 0.3 + dispersion, t * 0.7);
  let uvG = baseUV + vec2<f32>(t * 0.3, t * 0.7);
  let uvB = baseUV + vec2<f32>(t * 0.3 - dispersion, t * 0.7);
  // Dual-layer per channel
  let r = pow(1.0 - causticVoronoi(uvR), 3.0) * pow(1.0 - causticVoronoi(uvR * 1.3 + vec2<f32>(-t * 0.5, t * 0.4)), 3.0);
  let g = pow(1.0 - causticVoronoi(uvG), 3.0) * pow(1.0 - causticVoronoi(uvG * 1.3 + vec2<f32>(-t * 0.5, t * 0.4)), 3.0);
  let b = pow(1.0 - causticVoronoi(uvB), 3.0) * pow(1.0 - causticVoronoi(uvB * 1.3 + vec2<f32>(-t * 0.5, t * 0.4)), 3.0);
  return vec3<f32>(r, g, b) * intensity;
}

// Turbulence-driven underwater foam patches
fn underwaterFoam(
  pos: vec3<f32>, time: f32, scale: f32, threshold: f32
) -> f32 {
  let uv = pos.xz * scale;
  // Multi-octave turbulence
  var turb = 0.0;
  turb += abs(simpleNoise(uv * 2.0 + vec2<f32>(time * 0.1, 0.0)) - 0.5) * 2.0;
  turb += abs(simpleNoise(uv * 4.0 + vec2<f32>(0.0, time * 0.15)) - 0.5) * 1.0;
  turb += abs(simpleNoise(uv * 8.0 + vec2<f32>(time * 0.2, time * 0.1)) - 0.5) * 0.5;
  turb /= 3.5;
  return smoothstep(threshold, threshold + 0.15, turb);
}

// =========================================================================
// Displacement Mapping — vertex offset along normal
// =========================================================================

fn displacementMap(
  position: vec3<f32>, normal: vec3<f32>,
  height: f32, strength: f32, midLevel: f32
) -> vec3<f32> {
  let offset = (height - midLevel) * strength;
  return position + normal * offset;
}

// Reconstruct normal from height field via finite differences
fn displacementNormal(
  uv: vec2<f32>, texelSize: f32, strength: f32
) -> vec3<f32> {
  let hL = simpleNoise(uv - vec2<f32>(texelSize, 0.0)) * strength;
  let hR = simpleNoise(uv + vec2<f32>(texelSize, 0.0)) * strength;
  let hD = simpleNoise(uv - vec2<f32>(0.0, texelSize)) * strength;
  let hU = simpleNoise(uv + vec2<f32>(0.0, texelSize)) * strength;
  return normalize(vec3<f32>(hL - hR, 2.0 * texelSize, hD - hU));
}

// Anisotropic displacement along normal with tangent-space weighting
fn anisotropicDisplacement(
  position: vec3<f32>, normal: vec3<f32>, tangent: vec3<f32>,
  height: f32, strength: f32, anisotropy: f32, midLevel: f32
) -> vec3<f32> {
  let offset = (height - midLevel) * strength;
  let bitangent = cross(normal, tangent);
  // Blend between isotropic (normal) and anisotropic (tangent-weighted) displacement
  let isoDisp = normal * offset;
  let anisoDisp = (tangent * anisotropy + normal * (1.0 - abs(anisotropy))) * offset;
  return position + mix(isoDisp, anisoDisp, abs(anisotropy));
}

// =========================================================================
// Parallax Occlusion Mapping — steep parallax with occlusion
// =========================================================================

fn parallaxOcclusionMap(
  uv: vec2<f32>, viewDir: vec3<f32>,
  heightScale: f32, numLayers: f32
) -> vec2<f32> {
  let layerCount = i32(numLayers);
  let layerDepth = 1.0 / numLayers;
  var currentLayerDepth = 0.0;
  let deltaUV = viewDir.xy / viewDir.z * heightScale / numLayers;

  var currentUV = uv;
  var currentDepthMapValue = simpleNoise(currentUV); // Use noise as height

  // Step through layers from front to back
  for (var i = 0; i < layerCount; i++) {
    if (currentLayerDepth >= currentDepthMapValue) { break; }
    currentUV -= deltaUV;
    currentDepthMapValue = simpleNoise(currentUV);
    currentLayerDepth += layerDepth;
  }

  // Binary refinement for smoother result
  let prevUV = currentUV + deltaUV;
  let afterDepth = currentDepthMapValue - currentLayerDepth;
  let beforeDepth = simpleNoise(prevUV) - currentLayerDepth + layerDepth;
  let weight = afterDepth / (afterDepth - beforeDepth);
  return mix(currentUV, prevUV, weight);
}

// =========================================================================
// Screen-Space Reflections (SSR) — ray march in screen space
// =========================================================================

fn screenSpaceReflect(
  uv: vec2<f32>, normal: vec3<f32>, viewDir: vec3<f32>,
  roughness: f32, maxSteps: f32, stepSize: f32
) -> vec3<f32> {
  // Reflect view direction around surface normal
  let reflectDir = reflect(viewDir, normal);

  // Convert reflection to screen-space step direction
  let screenStep = reflectDir.xy * stepSize;

  var hitColor = vec3<f32>(0.0);
  var hitMask = 0.0;
  var sampleUV = uv;
  var currentDepth = 0.0;
  let steps = i32(maxSteps);

  for (var i = 0; i < steps; i++) {
    sampleUV += screenStep;

    // Bounds check
    if (sampleUV.x < 0.0 || sampleUV.x > 1.0 || sampleUV.y < 0.0 || sampleUV.y > 1.0) {
      break;
    }

    // In a real implementation, we'd sample the depth buffer here
    // For the shader graph, we approximate with noise-based depth
    let sampleDepth = simpleNoise(sampleUV * 10.0);
    currentDepth += stepSize;

    if (currentDepth > sampleDepth) {
      // Hit — sample color at hit point
      hitColor = vec3<f32>(sampleUV, 0.5); // Placeholder: real impl samples color buffer
      hitMask = 1.0;

      // Fade with roughness (rough surfaces → less clear reflection)
      hitMask *= 1.0 - roughness;

      // Fade at screen edges
      let edgeFade = 1.0 - pow(max(abs(sampleUV.x - 0.5), abs(sampleUV.y - 0.5)) * 2.0, 4.0);
      hitMask *= max(edgeFade, 0.0);
      break;
    }
  }

  return hitColor * hitMask;
}

// =========================================================================
// Screen-Space Global Illumination (SSGI) — approximate indirect lighting
// =========================================================================

fn screenSpaceGI(
  uv: vec2<f32>, normal: vec3<f32>,
  radius: f32, samples: f32, bounceIntensity: f32
) -> vec3<f32> {
  var indirect = vec3<f32>(0.0);
  let sampleCount = i32(samples);
  let goldenAngle = 2.399963; // Golden angle in radians

  for (var i = 0; i < sampleCount; i++) {
    let fi = f32(i);
    // Fibonacci spiral sampling pattern
    let r = sqrt(fi / samples) * radius;
    let theta = fi * goldenAngle;
    let offset = vec2<f32>(cos(theta), sin(theta)) * r;
    let sampleUV = uv + offset * 0.01; // Scale to UV space

    // Sample nearby color (in real impl, from color buffer)
    let sampleColor = vec3<f32>(
      simpleNoise(sampleUV * 20.0),
      simpleNoise(sampleUV * 20.0 + vec2<f32>(37.0, 0.0)),
      simpleNoise(sampleUV * 20.0 + vec2<f32>(0.0, 53.0))
    );

    // Weight by cosine of angle between sample direction and normal
    let sampleDir = normalize(vec3<f32>(offset, 0.1));
    let cosWeight = max(dot(sampleDir, normal), 0.0);

    indirect += sampleColor * cosWeight;
  }

  indirect /= samples;
  return indirect * bounceIntensity;
}

// =========================================================================
// Water Surface — combined waves, normals, foam, caustics
// =========================================================================

struct WaterSurfaceResult {
  displacement: vec3<f32>,
  normal: vec3<f32>,
  foam: f32,
  caustic: f32,
}

fn gerstnerWave(pos: vec2<f32>, time: f32, dir: vec2<f32>, steepness: f32, wavelength: f32) -> vec3<f32> {
  let k = 6.28318 / wavelength;
  let c = sqrt(9.81 / k);
  let d = normalize(dir);
  let f = k * (dot(d, pos) - c * time);
  let a = steepness / k;
  return vec3<f32>(d.x * a * cos(f), a * sin(f), d.y * a * cos(f));
}

fn waterSurface(
  pos: vec3<f32>, time: f32,
  waveScale: f32, waveSpeed: f32,
  waterDepth: f32, foamThreshold: f32
) -> WaterSurfaceResult {
  let scaledTime = time * waveSpeed;
  let p = pos.xz * waveScale;

  // Sum of Gerstner waves at different frequencies and directions
  var displacement = vec3<f32>(0.0);
  displacement += gerstnerWave(p, scaledTime, vec2<f32>(1.0, 0.3), 0.25, 4.0);
  displacement += gerstnerWave(p, scaledTime, vec2<f32>(-0.5, 0.8), 0.15, 2.5);
  displacement += gerstnerWave(p, scaledTime, vec2<f32>(0.3, -0.7), 0.1, 1.5);
  displacement += gerstnerWave(p, scaledTime, vec2<f32>(-0.8, -0.3), 0.08, 0.8);

  // Compute normal via finite differences on all 4 wave layers
  let eps = 0.01;
  let px = p + vec2<f32>(eps, 0.0);
  let pz = p + vec2<f32>(0.0, eps);
  var dx = vec3<f32>(0.0);
  dx += gerstnerWave(px, scaledTime, vec2<f32>(1.0, 0.3), 0.25, 4.0);
  dx += gerstnerWave(px, scaledTime, vec2<f32>(-0.5, 0.8), 0.15, 2.5);
  dx += gerstnerWave(px, scaledTime, vec2<f32>(0.3, -0.7), 0.1, 1.5);
  dx += gerstnerWave(px, scaledTime, vec2<f32>(-0.8, -0.3), 0.08, 0.8);
  var dz = vec3<f32>(0.0);
  dz += gerstnerWave(pz, scaledTime, vec2<f32>(1.0, 0.3), 0.25, 4.0);
  dz += gerstnerWave(pz, scaledTime, vec2<f32>(-0.5, 0.8), 0.15, 2.5);
  dz += gerstnerWave(pz, scaledTime, vec2<f32>(0.3, -0.7), 0.1, 1.5);
  dz += gerstnerWave(pz, scaledTime, vec2<f32>(-0.8, -0.3), 0.08, 0.8);
  let waterNormal = normalize(vec3<f32>(
    -(dx.y - displacement.y) / eps,
    1.0,
    -(dz.y - displacement.y) / eps
  ));

  // Foam: where wave crests converge (Jacobian < threshold)
  let jacobian = 1.0 - abs(displacement.x) * waveScale;
  let foam = smoothstep(foamThreshold, foamThreshold + 0.1, 1.0 - jacobian);

  // Caustics (project through water depth)
  let causticsUV = p + displacement.xz * 0.5;
  let c1 = causticVoronoi(causticsUV * 3.0 + vec2<f32>(scaledTime * 0.3, 0.0));
  let caustic = pow(1.0 - c1, 4.0) * exp(-waterDepth * 0.3);

  return WaterSurfaceResult(displacement, waterNormal, foam, caustic);
}
`;
  }
}

/**
 * Compile a shader graph
 */
export function compileShaderGraph(
  graph: ShaderGraph,
  options?: Partial<ICompileOptions>
): ICompiledShader {
  const compiler = new ShaderGraphCompiler(graph, options);
  return compiler.compile();
}
