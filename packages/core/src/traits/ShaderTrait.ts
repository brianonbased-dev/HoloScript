/**
 * @holoscript/core Shader Trait
 *
 * Enables custom GLSL/HLSL shader authoring with inline code support.
 * Supports vertex, fragment, geometry, and compute shaders.
 *
 * @example
 * ```hsplus
 * object "Hologram" {
 *   @shader {
 *     vertex: `
 *       void main() {
 *         gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
 *       }
 *     `,
 *     fragment: `
 *       uniform float time;
 *       void main() {
 *         float scanline = sin(gl_FragCoord.y * 0.5 + time * 2.0) * 0.1;
 *         gl_FragColor = vec4(0.0, 1.0, 1.0, 0.5 + scanline);
 *       }
 *     `,
 *     uniforms: {
 *       time: { type: "float", value: 0.0 }
 *     }
 *   }
 * }
 * ```
 */

export type ShaderLanguage = 'glsl' | 'hlsl' | 'wgsl' | 'metal' | 'spirv';
export type ShaderStage = 'vertex' | 'fragment' | 'geometry' | 'tessellation' | 'compute';
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

/**
 * Shader uniform definition
 */
export interface ShaderUniform {
  /** Uniform name */
  name: string;

  /** Data type */
  type: UniformType;

  /** Default value */
  value: number | number[] | boolean | string;

  /** Min value for numeric uniforms (for UI sliders) */
  min?: number;

  /** Max value for numeric uniforms (for UI sliders) */
  max?: number;

  /** Human-readable label */
  label?: string;

  /** Group for UI organization */
  group?: string;
}

/**
 * Shader attribute definition (vertex inputs)
 */
export interface ShaderAttribute {
  /** Attribute name */
  name: string;

  /** Data type */
  type: 'float' | 'vec2' | 'vec3' | 'vec4';

  /** Attribute location (binding) */
  location: number;

  /** Semantic meaning */
  semantic?: 'POSITION' | 'NORMAL' | 'TEXCOORD' | 'COLOR' | 'TANGENT' | 'CUSTOM';
}

/**
 * Shader varying definition (vertex to fragment)
 */
export interface ShaderVarying {
  /** Varying name */
  name: string;

  /** Data type */
  type: 'float' | 'vec2' | 'vec3' | 'vec4';

  /** Interpolation mode */
  interpolation?: 'smooth' | 'flat' | 'noperspective';
}

/**
 * Inline shader source code
 */
export interface ShaderSource {
  /** Shader language */
  language: ShaderLanguage;

  /** Vertex shader source code */
  vertex?: string;

  /** Fragment shader source code */
  fragment?: string;

  /** Geometry shader source code (optional) */
  geometry?: string;

  /** Tessellation control shader (optional) */
  tessellationControl?: string;

  /** Tessellation evaluation shader (optional) */
  tessellationEvaluation?: string;

  /** Compute shader source code (optional) */
  compute?: string;
}

/**
 * Shader include/import reference
 */
export interface ShaderInclude {
  /** Include path or name */
  path: string;

  /** Functions to import from include */
  functions?: string[];
}

/**
 * Shader compilation options
 */
export interface ShaderCompileOptions {
  /** Target platform for optimization */
  target?: 'web' | 'mobile' | 'vr' | 'desktop';

  /** Optimization level */
  optimization?: 'none' | 'size' | 'speed';

  /** Enable debug info */
  debug?: boolean;

  /** Strict mode (fail on warnings) */
  strict?: boolean;

  /** Defines/macros to inject */
  defines?: Record<string, string | number | boolean>;
}

/**
 * Complete shader configuration
 */
export interface ShaderConfig {
  /** Shader name for reuse */
  name?: string;

  /** Source code */
  source?: ShaderSource;

  /** Uniform definitions */
  uniforms?: Record<string, Omit<ShaderUniform, 'name'>>;

  /** Attribute definitions (auto-detected if not provided) */
  attributes?: ShaderAttribute[];

  /** Varying definitions (auto-detected if not provided) */
  varyings?: ShaderVarying[];

  /** Include external shader chunks */
  includes?: ShaderInclude[];

  /** Compilation options */
  compileOptions?: ShaderCompileOptions;

  /** Blend mode override */
  blendMode?: 'opaque' | 'blend' | 'additive' | 'multiply' | 'custom';

  /** Depth testing */
  depthTest?: boolean;

  /** Depth writing */
  depthWrite?: boolean;

  /** Face culling */
  cullFace?: 'none' | 'front' | 'back' | 'both';

  /** Render queue priority */
  renderQueue?: number;
}

/**
 * Shader compilation result
 */
export interface ShaderCompilationResult {
  success: boolean;
  errors: ShaderCompilationError[];
  warnings: ShaderCompilationWarning[];
  compiledCode?: {
    vertex: string;
    fragment: string;
    geometry?: string;
    compute?: string;
  };
  uniformLocations?: Map<string, number>;
  attributeLocations?: Map<string, number>;
}

export interface ShaderCompilationError {
  stage: ShaderStage;
  line: number;
  column?: number;
  message: string;
  code: string;
}

export interface ShaderCompilationWarning {
  stage: ShaderStage;
  line: number;
  message: string;
}

// ============================================================================
// Built-in Shader Chunks (Common Functions)
// ============================================================================

export const SHADER_CHUNKS = {
  /** Common noise functions */
  noise: `
// Simplex 2D noise
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }

float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                      -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v -   i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
  m = m*m;
  m = m*m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}
`,

  /** Hologram effect */
  hologram: `
// Hologram scanline effect
float hologramScanline(vec2 uv, float time, float density) {
  return sin(uv.y * density + time * 2.0) * 0.5 + 0.5;
}

// Hologram flicker
float hologramFlicker(float time) {
  return 0.9 + 0.1 * sin(time * 20.0) * sin(time * 13.0);
}

// Hologram edge glow
float hologramEdge(vec3 normal, vec3 viewDir) {
  return pow(1.0 - abs(dot(normal, viewDir)), 2.0);
}
`,

  /** Fresnel effect */
  fresnel: `
// Basic Fresnel
float fresnel(vec3 normal, vec3 viewDir, float power) {
  return pow(1.0 - abs(dot(normal, viewDir)), power);
}

// Schlick's approximation
float fresnelSchlick(float cosTheta, float F0) {
  return F0 + (1.0 - F0) * pow(1.0 - cosTheta, 5.0);
}
`,

  /** PBR lighting */
  pbr: `
// Distribution function (GGX/Trowbridge-Reitz)
float distributionGGX(vec3 N, vec3 H, float roughness) {
  float a = roughness * roughness;
  float a2 = a * a;
  float NdotH = max(dot(N, H), 0.0);
  float NdotH2 = NdotH * NdotH;
  float num = a2;
  float denom = (NdotH2 * (a2 - 1.0) + 1.0);
  denom = 3.14159265 * denom * denom;
  return num / denom;
}

// Geometry function (Schlick-GGX)
float geometrySchlickGGX(float NdotV, float roughness) {
  float r = (roughness + 1.0);
  float k = (r * r) / 8.0;
  float num = NdotV;
  float denom = NdotV * (1.0 - k) + k;
  return num / denom;
}

// Smith's geometry function
float geometrySmith(vec3 N, vec3 V, vec3 L, float roughness) {
  float NdotV = max(dot(N, V), 0.0);
  float NdotL = max(dot(N, L), 0.0);
  float ggx2 = geometrySchlickGGX(NdotV, roughness);
  float ggx1 = geometrySchlickGGX(NdotL, roughness);
  return ggx1 * ggx2;
}
`,

  /** UV utilities */
  uv: `
// Rotate UV
vec2 rotateUV(vec2 uv, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return vec2(c * uv.x - s * uv.y, s * uv.x + c * uv.y);
}

// Tile UV
vec2 tileUV(vec2 uv, vec2 scale) {
  return fract(uv * scale);
}

// Parallax mapping
vec2 parallaxUV(vec2 uv, vec3 viewDir, sampler2D heightMap, float scale) {
  float height = texture2D(heightMap, uv).r;
  vec2 p = viewDir.xy / viewDir.z * (height * scale);
  return uv - p;
}
`,
} as const;

// ============================================================================
// ShaderTrait Class
// ============================================================================

/**
 * ShaderTrait - Enables custom shader authoring
 */
export class ShaderTrait {
  private config: ShaderConfig;
  private compilationResult?: ShaderCompilationResult;
  private uniformValues: Map<string, number | number[] | boolean | string> = new Map();

  constructor(config: ShaderConfig) {
    this.config = {
      ...config,
      source: {
        language: config.source?.language || 'glsl',
        vertex: config.source?.vertex || '',
        fragment: config.source?.fragment || '',
        geometry: config.source?.geometry,
        tessellationControl: config.source?.tessellationControl,
        tessellationEvaluation: config.source?.tessellationEvaluation,
        compute: config.source?.compute,
      },
    };

    // Initialize uniform values from defaults
    if (config.uniforms) {
      for (const [name, uniform] of Object.entries(config.uniforms)) {
        this.uniformValues.set(name, uniform.value);
      }
    }
  }

  /**
   * Get shader configuration
   */
  public getConfig(): ShaderConfig {
    return { ...this.config };
  }

  /**
   * Get vertex shader source with includes
   */
  public getVertexSource(): string {
    return this.assembleShaderSource('vertex');
  }

  /**
   * Get fragment shader source with includes
   */
  public getFragmentSource(): string {
    return this.assembleShaderSource('fragment');
  }

  /**
   * Assemble shader source with includes and uniforms
   */
  private assembleShaderSource(stage: 'vertex' | 'fragment' | 'geometry' | 'compute'): string {
    const source = this.config.source ? this.config.source[stage as keyof ShaderSource] : undefined;
    if (!source) return '';

    let assembled = '';

    // Add precision for GLSL
    if (this.config.source?.language === 'glsl') {
      assembled += 'precision highp float;\n\n';
    }

    // Add uniforms
    if (this.config.uniforms) {
      for (const [name, uniform] of Object.entries(this.config.uniforms)) {
        assembled += `uniform ${this.getGLSLType(uniform.type)} ${name};\n`;
      }
      assembled += '\n';
    }

    // Add includes
    if (this.config.includes) {
      for (const include of this.config.includes) {
        const chunk = SHADER_CHUNKS[include.path as keyof typeof SHADER_CHUNKS];
        if (chunk) {
          assembled += `// Include: ${include.path}\n${chunk}\n`;
        }
      }
    }

    // Add main source
    assembled += source;

    return assembled;
  }

  /**
   * Convert uniform type to GLSL type
   */
  private getGLSLType(type: UniformType): string {
    const typeMap: Record<UniformType, string> = {
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
    };
    return typeMap[type] || 'float';
  }

  /**
   * Set uniform value
   */
  public setUniform(name: string, value: number | number[] | boolean | string): void {
    this.uniformValues.set(name, value);
  }

  /**
   * Get uniform value
   */
  public getUniform(name: string): number | number[] | boolean | string | undefined {
    return this.uniformValues.get(name);
  }

  /**
   * Get all uniform values
   */
  public getUniforms(): Map<string, number | number[] | boolean | string> {
    return new Map(this.uniformValues);
  }

  /**
   * Validate shader syntax
   */
  public validate(): ShaderCompilationResult {
    const errors: ShaderCompilationError[] = [];
    const warnings: ShaderCompilationWarning[] = [];

    // Basic syntax validation
    if (this.config.source?.vertex) {
      const vertexErrors = this.validateShaderSyntax(this.config.source.vertex, 'vertex');
      errors.push(...vertexErrors);
    }

    if (this.config.source?.fragment) {
      const fragmentErrors = this.validateShaderSyntax(this.config.source.fragment, 'fragment');
      errors.push(...fragmentErrors);
    }

    // Check for required main function
    if (this.config.source?.vertex && !this.config.source.vertex.includes('void main')) {
      errors.push({
        stage: 'vertex',
        line: 1,
        message: 'Vertex shader must contain a main() function',
        code: 'E001',
      });
    }

    if (this.config.source?.fragment && !this.config.source.fragment.includes('void main')) {
      errors.push({
        stage: 'fragment',
        line: 1,
        message: 'Fragment shader must contain a main() function',
        code: 'E002',
      });
    }

    this.compilationResult = {
      success: errors.length === 0,
      errors,
      warnings,
    };

    return this.compilationResult;
  }

  /**
   * Basic shader syntax validation
   */
  private validateShaderSyntax(source: string, stage: ShaderStage): ShaderCompilationError[] {
    const errors: ShaderCompilationError[] = [];
    const lines = source.split('\n');

    // Check for unbalanced braces
    let braceCount = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      braceCount += (line.match(/{/g) || []).length;
      braceCount -= (line.match(/}/g) || []).length;
    }

    if (braceCount !== 0) {
      errors.push({
        stage,
        line: lines.length,
        message: `Unbalanced braces in ${stage} shader`,
        code: 'E003',
      });
    }

    // Check for unbalanced parentheses
    let parenCount = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      parenCount += (line.match(/\(/g) || []).length;
      parenCount -= (line.match(/\)/g) || []).length;
    }

    if (parenCount !== 0) {
      errors.push({
        stage,
        line: lines.length,
        message: `Unbalanced parentheses in ${stage} shader`,
        code: 'E004',
      });
    }

    return errors;
  }

  /**
   * Compile shader to target platform
   */
  public compile(options?: ShaderCompileOptions): ShaderCompilationResult {
    // First validate
    const validation = this.validate();
    if (!validation.success) {
      return validation;
    }

    // Apply defines if provided
    let vertexSource = this.getVertexSource();
    let fragmentSource = this.getFragmentSource();

    if (options?.defines) {
      for (const [key, value] of Object.entries(options.defines)) {
        const define = `#define ${key} ${value}\n`;
        vertexSource = define + vertexSource;
        fragmentSource = define + fragmentSource;
      }
    }

    return {
      success: true,
      errors: [],
      warnings: [],
      compiledCode: {
        vertex: vertexSource,
        fragment: fragmentSource,
      },
    };
  }

  /**
   * Create Three.js ShaderMaterial config
   */
  public toThreeJSConfig(): Record<string, unknown> {
    const uniformsObj: Record<string, { value: unknown }> = {};

    for (const [name, value] of this.uniformValues) {
      uniformsObj[name] = { value };
    }

    return {
      vertexShader: this.getVertexSource(),
      fragmentShader: this.getFragmentSource(),
      uniforms: uniformsObj,
      transparent: this.config.blendMode !== 'opaque',
      depthTest: this.config.depthTest ?? true,
      depthWrite: this.config.depthWrite ?? true,
      side: this.getCullSide(),
    };
  }

  private getCullSide(): number {
    // Three.js side constants
    const THREE_FrontSide = 0;
    const THREE_BackSide = 1;
    const THREE_DoubleSide = 2;

    switch (this.config.cullFace) {
      case 'front':
        return THREE_BackSide;
      case 'back':
        return THREE_FrontSide;
      case 'none':
        return THREE_DoubleSide;
      default:
        return THREE_FrontSide;
    }
  }
}

// ============================================================================
// Preset Shaders
// ============================================================================

export const SHADER_PRESETS = {
  /** Hologram effect shader */
  hologram: {
    name: 'hologram',
    source: {
      language: 'glsl' as const,
      vertex: `
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vViewPosition;

void main() {
  vUv = uv;
  vNormal = normalize(normalMatrix * normal);
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vViewPosition = -mvPosition.xyz;
  gl_Position = projectionMatrix * mvPosition;
}
`,
      fragment: `
uniform float time;
uniform vec3 color;
uniform float opacity;
uniform float scanlineIntensity;
uniform float flickerIntensity;

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vViewPosition;

void main() {
  // Fresnel edge glow
  vec3 viewDir = normalize(vViewPosition);
  float fresnel = pow(1.0 - abs(dot(vNormal, viewDir)), 2.0);
  
  // Scanlines
  float scanline = sin(vUv.y * 100.0 + time * 2.0) * scanlineIntensity;
  
  // Flicker
  float flicker = 0.9 + flickerIntensity * sin(time * 20.0) * sin(time * 13.0);
  
  // Combine
  float alpha = (opacity + fresnel * 0.3 + scanline) * flicker;
  vec3 finalColor = color + fresnel * 0.5;
  
  gl_FragColor = vec4(finalColor, alpha);
}
`,
    },
    uniforms: {
      time: { type: 'float' as const, value: 0.0 },
      color: { type: 'vec3' as const, value: [0.0, 1.0, 1.0] },
      opacity: { type: 'float' as const, value: 0.5, min: 0, max: 1 },
      scanlineIntensity: { type: 'float' as const, value: 0.1, min: 0, max: 0.5 },
      flickerIntensity: { type: 'float' as const, value: 0.1, min: 0, max: 0.3 },
    },
    blendMode: 'blend' as const,
    depthWrite: false,
    cullFace: 'none' as const,
  },

  /** Force field shader */
  forceField: {
    name: 'forceField',
    source: {
      language: 'glsl' as const,
      vertex: `
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorldPosition;

void main() {
  vUv = uv;
  vNormal = normalize(normalMatrix * normal);
  vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`,
      fragment: `
uniform float time;
uniform vec3 color;
uniform float pulseSpeed;
uniform float hexScale;

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorldPosition;

float hexPattern(vec2 p) {
  vec2 q = vec2(p.x * 2.0 * 0.5773503, p.y + p.x * 0.5773503);
  vec2 pi = floor(q);
  vec2 pf = fract(q);
  float v = mod(pi.x + pi.y, 3.0);
  float ca = step(1.0, v);
  float cb = step(2.0, v);
  vec2 ma = step(pf.xy, pf.yx);
  float e = dot(ma, 1.0 - pf.yx + ca * (pf.x + pf.y - 1.0) + cb * (pf.yx - 2.0 * pf.xy));
  return e;
}

void main() {
  float hex = hexPattern(vUv * hexScale);
  float pulse = sin(time * pulseSpeed) * 0.5 + 0.5;
  float alpha = hex * (0.3 + pulse * 0.2);
  gl_FragColor = vec4(color, alpha);
}
`,
    },
    uniforms: {
      time: { type: 'float' as const, value: 0.0 },
      color: { type: 'vec3' as const, value: [0.2, 0.5, 1.0] },
      pulseSpeed: { type: 'float' as const, value: 2.0, min: 0.5, max: 5.0 },
      hexScale: { type: 'float' as const, value: 10.0, min: 5.0, max: 50.0 },
    },
    blendMode: 'additive' as const,
    depthWrite: false,
    cullFace: 'none' as const,
  },

  /** Dissolve effect shader */
  dissolve: {
    name: 'dissolve',
    source: {
      language: 'glsl' as const,
      vertex: `
varying vec2 vUv;
varying vec3 vPosition;

void main() {
  vUv = uv;
  vPosition = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`,
      fragment: `
uniform float progress;
uniform vec3 edgeColor;
uniform float edgeWidth;
uniform sampler2D noiseTexture;

varying vec2 vUv;
varying vec3 vPosition;

void main() {
  float noise = texture2D(noiseTexture, vUv).r;
  float diff = noise - progress;
  
  if (diff < 0.0) discard;
  
  float edge = smoothstep(0.0, edgeWidth, diff);
  vec3 color = mix(edgeColor, vec3(1.0), edge);
  
  gl_FragColor = vec4(color, 1.0);
}
`,
    },
    uniforms: {
      progress: { type: 'float' as const, value: 0.0, min: 0, max: 1 },
      edgeColor: { type: 'vec3' as const, value: [1.0, 0.5, 0.0] },
      edgeWidth: { type: 'float' as const, value: 0.1, min: 0.01, max: 0.5 },
      noiseTexture: { type: 'sampler2D' as const, value: '' },
    },
    blendMode: 'opaque' as const,
  },
} as const;

/**
 * HoloScript+ @shader trait factory
 */
export function createShaderTrait(config?: Partial<ShaderConfig>): ShaderTrait {
  return new ShaderTrait({
    name: 'custom',
    source: {
      language: 'glsl',
      vertex: '',
      fragment: '',
    },
    uniforms: {},
    blendMode: 'opaque',
    ...config,
  });
}

// Re-export type aliases for index.ts
export type ShaderType = ShaderLanguage;
export type UniformDefinition = ShaderUniform;
// Re-export ShaderConfig - directly exported at definition
// UniformType is already exported at line 33
// Additional type aliases:
export type UniformValue = number | number[] | boolean | string;
export type ShaderChunk = { name: string; code: string };
export type InlineShader = { vertex?: string; fragment?: string };

export default ShaderTrait;

// ── Handler (delegates to ShaderTrait) ──
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent, TraitInstanceDelegate } from './TraitTypes';

export const shaderHandler = {
  name: 'shader',
  defaultConfig: {},
  onAttach(node: HSPlusNode, config: unknown, ctx: TraitContext): void {
    const instance = new ShaderTrait(config);
    node.__shader_instance = instance;
    ctx.emit('shader_attached', { node, config });
  },
  onDetach(node: HSPlusNode, _config: unknown, ctx: TraitContext): void {
    const instance = node.__shader_instance as TraitInstanceDelegate;
    if (instance) {
      if (typeof instance.onDetach === 'function') instance.onDetach(node, ctx);
      else if (typeof instance.dispose === 'function') instance.dispose();
      else if (typeof instance.cleanup === 'function') instance.cleanup();
    }
    ctx.emit('shader_detached', { node });
    delete node.__shader_instance;
  },
  onEvent(node: HSPlusNode, _config: unknown, ctx: TraitContext, event: TraitEvent): void {
    const instance = node.__shader_instance as TraitInstanceDelegate;
    if (!instance) return;
    if (typeof instance.onEvent === 'function') instance.onEvent(event);
    else if (typeof instance.emit === 'function' && event.type) instance.emit(event);
    if (event.type === 'shader_configure' && event.payload) {
      Object.assign(instance, event.payload);
      ctx.emit('shader_configured', { node });
    }
  },
  onUpdate(node: HSPlusNode, _config: unknown, ctx: TraitContext, dt: number): void {
    const instance = node.__shader_instance as TraitInstanceDelegate;
    if (!instance) return;
    if (typeof instance.onUpdate === 'function') instance.onUpdate(node, ctx, dt);
  },
} as const satisfies TraitHandler;
