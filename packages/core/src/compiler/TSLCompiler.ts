/**
 * HoloScript -> TSL (Trait Shader Language) Compiler
 *
 * Translates HoloComposition AST traits into WGSL shader code, bridging
 * HoloScript's trait composition system with GPU shader generation.
 *
 * Each trait on a HoloScript object maps to:
 *   - Uniform bindings (trait config properties -> shader uniforms)
 *   - Vertex shader contributions (position/normal modifications)
 *   - Fragment shader contributions (material/color modifications)
 *   - Compute shader pipelines (physics, particles, AI traits)
 *
 * The compiler produces a multi-file output keyed by shader stage and object,
 * enabling fine-grained shader module composition.
 *
 * Supported trait categories:
 *   - Material traits: @shader, @pbr, @emissive, @transparent
 *   - GPU compute traits: @gpu_particle, @gpu_physics, @compute, @gpu_buffer
 *   - Visual effect traits: @hologram, @dissolve, @force_field, @gaussian_splat
 *   - Spatial traits: @billboard, @lod, @instanced
 *   - Animation traits: @animated, @morph_target, @skeletal
 *
 * @version 1.0.0
 * @package @holoscript/core/compiler
 */

import type {
  HoloComposition,
  HoloObjectDecl,
  HoloObjectTrait,
  HoloValue,
  HoloEnvironment,
  HoloLight,
} from '../parser/HoloCompositionTypes';
import { CompilerBase } from './CompilerBase';
import { ANSCapabilityPath, type ANSCapabilityPathValue } from './identity/ANSNamespace';
import {
  compileDomainBlocks,
  compileMaterialBlock,
  compilePhysicsBlock,
  compileParticleBlock,
  compilePostProcessingBlock,
  compileAudioSourceBlock,
  compileWeatherBlock,
} from './DomainBlockCompilerMixin';

// =============================================================================
// TYPES
// =============================================================================

export interface TSLCompilerOptions {
  /** Shader target language (currently only WGSL supported) */
  shaderTarget?: 'wgsl';
  /** Include debug comments in generated code */
  debug?: boolean;
  /** Indent string */
  indent?: string;
  /** Enable PBR lighting in generated fragment shaders */
  enablePBR?: boolean;
  /** Enable compute shader generation for GPU traits */
  enableCompute?: boolean;
  /** Maximum bind group index for material uniforms */
  materialBindGroup?: number;
  /** Include helper functions (noise, PBR, etc.) */
  includeHelpers?: boolean;
}

/** Represents a single uniform binding extracted from a trait */
export interface TSLUniform {
  name: string;
  type: TSLDataType;
  defaultValue: string;
  binding: number;
  group: number;
  /** Source trait that generated this uniform */
  sourceTrait: string;
}

/** Represents a shader contribution from a single trait */
export interface TSLTraitShaderContribution {
  traitName: string;
  uniforms: TSLUniform[];
  vertexCode: string;
  fragmentCode: string;
  computeCode: string;
  /** Whether this trait requires a compute pipeline */
  needsCompute: boolean;
  /** Workgroup size for compute shaders */
  workgroupSize?: [number, number, number];
}

/** The full compiled output for one object */
export interface TSLObjectOutput {
  objectName: string;
  traits: string[];
  vertexShader: string;
  fragmentShader: string;
  computeShaders: Record<string, string>;
  uniforms: TSLUniform[];
  bindGroupLayout: string;
}

/** Complete TSL compilation result */
export interface TSLCompilationResult {
  /** All object outputs keyed by sanitized object name */
  objects: Record<string, TSLObjectOutput>;
  /** Shared helper functions module */
  helpers: string;
  /** Global uniforms (camera, scene, time) */
  globalUniforms: string;
  /** Pipeline creation code */
  pipelineSetup: string;
  /** Diagnostic warnings */
  warnings: string[];
}

export type TSLDataType =
  | 'f32'
  | 'i32'
  | 'u32'
  | 'bool'
  | 'vec2<f32>'
  | 'vec3<f32>'
  | 'vec4<f32>'
  | 'mat3x3<f32>'
  | 'mat4x4<f32>'
  | 'texture_2d<f32>'
  | 'sampler';

// =============================================================================
// TRAIT -> SHADER MAPPING REGISTRY
// =============================================================================

/**
 * Maps HoloScript trait names to their shader generation strategies.
 * Each entry describes how a trait's config properties map to shader uniforms
 * and what code it contributes to each shader stage.
 */
interface TraitShaderMapping {
  /** Uniform definitions derived from trait config */
  uniforms: Array<{
    configKey: string;
    shaderName: string;
    type: TSLDataType;
    defaultValue: string;
  }>;
  /** WGSL code appended to vertex shader body */
  vertexContribution?: string;
  /** WGSL code appended to fragment shader body */
  fragmentContribution?: string;
  /** WGSL code for compute shader (null = no compute needed) */
  computeContribution?: string;
  /** Workgroup size if compute is needed */
  workgroupSize?: [number, number, number];
}

const TRAIT_SHADER_MAP: Record<string, TraitShaderMapping> = {
  // ─── Material Traits ─────────────────────────────────────────────────
  shader: {
    uniforms: [{ configKey: 'time', shaderName: 'u_time', type: 'f32', defaultValue: '0.0' }],
    fragmentContribution: `
    // @shader trait: custom shader passthrough
    // User-defined shader code is injected via the ShaderTrait system
    let shaderTime = material.u_time;`,
  },

  pbr: {
    uniforms: [
      { configKey: 'roughness', shaderName: 'u_roughness', type: 'f32', defaultValue: '0.5' },
      { configKey: 'metalness', shaderName: 'u_metalness', type: 'f32', defaultValue: '0.0' },
      {
        configKey: 'color',
        shaderName: 'u_baseColor',
        type: 'vec3<f32>',
        defaultValue: 'vec3<f32>(0.8, 0.8, 0.8)',
      },
      {
        configKey: 'emissive',
        shaderName: 'u_emissive',
        type: 'vec3<f32>',
        defaultValue: 'vec3<f32>(0.0)',
      },
      { configKey: 'ao', shaderName: 'u_ao', type: 'f32', defaultValue: '1.0' },
    ],
    fragmentContribution: `
    // @pbr trait: physically-based rendering
    let pbrRoughness = material.u_roughness;
    let pbrMetalness = material.u_metalness;
    let pbrBaseColor = material.u_baseColor;
    let pbrEmissive = material.u_emissive;
    let pbrAO = material.u_ao;
    baseColor = pbrBaseColor;
    roughness = pbrRoughness;
    metallic = pbrMetalness;
    emission = pbrEmissive;
    ao = pbrAO;`,
  },

  emissive: {
    uniforms: [
      {
        configKey: 'color',
        shaderName: 'u_emissiveColor',
        type: 'vec3<f32>',
        defaultValue: 'vec3<f32>(1.0, 1.0, 1.0)',
      },
      {
        configKey: 'intensity',
        shaderName: 'u_emissiveIntensity',
        type: 'f32',
        defaultValue: '1.0',
      },
    ],
    fragmentContribution: `
    // @emissive trait: self-illumination
    emission = emission + material.u_emissiveColor * material.u_emissiveIntensity;`,
  },

  transparent: {
    uniforms: [{ configKey: 'opacity', shaderName: 'u_opacity', type: 'f32', defaultValue: '0.5' }],
    fragmentContribution: `
    // @transparent trait: alpha blending
    alpha = material.u_opacity;`,
  },

  // ─── Visual Effect Traits ────────────────────────────────────────────
  hologram: {
    uniforms: [
      {
        configKey: 'color',
        shaderName: 'u_holoColor',
        type: 'vec3<f32>',
        defaultValue: 'vec3<f32>(0.0, 1.0, 1.0)',
      },
      {
        configKey: 'scanline_density',
        shaderName: 'u_scanlineDensity',
        type: 'f32',
        defaultValue: '100.0',
      },
      {
        configKey: 'flicker_speed',
        shaderName: 'u_flickerSpeed',
        type: 'f32',
        defaultValue: '20.0',
      },
      { configKey: 'opacity', shaderName: 'u_holoOpacity', type: 'f32', defaultValue: '0.5' },
    ],
    fragmentContribution: `
    // @hologram trait: holographic scanline effect
    let holoScanline = sin(in.uv.y * material.u_scanlineDensity + scene.time * 2.0) * 0.1;
    let holoFlicker = 0.9 + 0.1 * sin(scene.time * material.u_flickerSpeed) * sin(scene.time * 13.0);
    let holoFresnel = pow(1.0 - abs(dot(N, V)), 2.0);
    baseColor = material.u_holoColor;
    emission = emission + material.u_holoColor * holoFresnel * 0.5;
    alpha = (material.u_holoOpacity + holoFresnel * 0.3 + holoScanline) * holoFlicker;`,
  },

  dissolve: {
    uniforms: [
      { configKey: 'progress', shaderName: 'u_dissolveProgress', type: 'f32', defaultValue: '0.0' },
      {
        configKey: 'edge_color',
        shaderName: 'u_dissolveEdgeColor',
        type: 'vec3<f32>',
        defaultValue: 'vec3<f32>(1.0, 0.5, 0.0)',
      },
      {
        configKey: 'edge_width',
        shaderName: 'u_dissolveEdgeWidth',
        type: 'f32',
        defaultValue: '0.1',
      },
    ],
    fragmentContribution: `
    // @dissolve trait: noise-based dissolution effect
    let dissolveNoise = simpleNoise(in.uv * 8.0);
    let dissolveDiff = dissolveNoise - material.u_dissolveProgress;
    if (dissolveDiff < 0.0) { discard; }
    let dissolveEdge = smoothstep(0.0, material.u_dissolveEdgeWidth, dissolveDiff);
    emission = emission + material.u_dissolveEdgeColor * (1.0 - dissolveEdge);`,
  },

  force_field: {
    uniforms: [
      {
        configKey: 'color',
        shaderName: 'u_fieldColor',
        type: 'vec3<f32>',
        defaultValue: 'vec3<f32>(0.2, 0.5, 1.0)',
      },
      {
        configKey: 'pulse_speed',
        shaderName: 'u_fieldPulseSpeed',
        type: 'f32',
        defaultValue: '2.0',
      },
      { configKey: 'hex_scale', shaderName: 'u_fieldHexScale', type: 'f32', defaultValue: '10.0' },
    ],
    fragmentContribution: `
    // @force_field trait: hexagonal energy shield
    let fieldPulse = sin(scene.time * material.u_fieldPulseSpeed) * 0.5 + 0.5;
    let fieldHex = simpleNoise(in.uv * material.u_fieldHexScale);
    baseColor = material.u_fieldColor;
    alpha = fieldHex * (0.3 + fieldPulse * 0.2);`,
  },

  // ─── GPU Compute Traits ──────────────────────────────────────────────
  gpu_particle: {
    uniforms: [
      { configKey: 'count', shaderName: 'u_particleCount', type: 'u32', defaultValue: '10000u' },
      { configKey: 'gravity', shaderName: 'u_gravity', type: 'f32', defaultValue: '-9.81' },
      { configKey: 'lifetime', shaderName: 'u_lifetime', type: 'f32', defaultValue: '2.0' },
      { configKey: 'emit_rate', shaderName: 'u_emitRate', type: 'f32', defaultValue: '100.0' },
    ],
    computeContribution: `
    // @gpu_particle trait: GPU particle simulation
    struct Particle {
      pos: vec3<f32>,
      _pad0: f32,
      vel: vec3<f32>,
      life: f32,
    };

    @group(0) @binding(0) var<storage, read> particlesIn: array<Particle>;
    @group(0) @binding(1) var<storage, read_write> particlesOut: array<Particle>;
    @group(0) @binding(2) var<uniform> dt: f32;

    @compute @workgroup_size(64)
    fn cs_particle_update(@builtin(global_invocation_id) gid: vec3<u32>) {
      let i = gid.x;
      if (i >= arrayLength(&particlesIn)) { return; }

      var p = particlesIn[i];
      p.vel.y += material.u_gravity * dt;
      p.pos += p.vel * dt;
      p.life -= dt;

      if (p.life <= 0.0) {
        p.pos = vec3<f32>(0.0);
        p.vel = vec3<f32>(0.0, 5.0, 0.0);
        p.life = material.u_lifetime;
      }

      particlesOut[i] = p;
    }`,
    fragmentContribution: `
    // @gpu_particle trait: particle rendering
    let particleLife = clamp(in.worldPosition.y / 5.0, 0.0, 1.0);
    baseColor = mix(vec3<f32>(1.0, 0.2, 0.0), vec3<f32>(1.0, 1.0, 0.5), particleLife);
    alpha = particleLife * 0.8;`,
    workgroupSize: [64, 1, 1],
  },

  gpu_physics: {
    uniforms: [
      { configKey: 'body_count', shaderName: 'u_bodyCount', type: 'u32', defaultValue: '1024u' },
      { configKey: 'restitution', shaderName: 'u_restitution', type: 'f32', defaultValue: '0.6' },
    ],
    computeContribution: `
    // @gpu_physics trait: GPU rigid body simulation
    struct RigidBody {
      pos: vec3<f32>,
      mass: f32,
      vel: vec3<f32>,
      _pad: f32,
    };

    @group(0) @binding(0) var<storage, read_write> bodies: array<RigidBody>;
    @group(0) @binding(1) var<uniform> dt: f32;

    @compute @workgroup_size(64)
    fn cs_physics_step(@builtin(global_invocation_id) gid: vec3<u32>) {
      let i = gid.x;
      if (i >= arrayLength(&bodies)) { return; }

      var b = bodies[i];
      b.vel.y -= 9.81 * dt;
      b.pos += b.vel * dt;

      // Ground plane collision
      if (b.pos.y < 0.0) {
        b.pos.y = 0.0;
        b.vel.y = -b.vel.y * material.u_restitution;
      }

      bodies[i] = b;
    }`,
    workgroupSize: [64, 1, 1],
  },

  compute: {
    uniforms: [
      { configKey: 'buffer_size', shaderName: 'u_bufferSize', type: 'u32', defaultValue: '4096u' },
    ],
    computeContribution: `
    // @compute trait: generic compute shader
    @group(0) @binding(0) var<storage, read_write> computeBuffer: array<f32>;

    @compute @workgroup_size(64)
    fn cs_generic(@builtin(global_invocation_id) gid: vec3<u32>) {
      let i = gid.x;
      if (i >= arrayLength(&computeBuffer)) { return; }
      // Custom compute logic placeholder
      computeBuffer[i] = computeBuffer[i];
    }`,
    workgroupSize: [64, 1, 1],
  },

  // ─── Spatial Traits ──────────────────────────────────────────────────
  billboard: {
    uniforms: [],
    vertexContribution: `
    // @billboard trait: always face camera
    let billboardRight = camera.view[0].xyz;
    let billboardUp = camera.view[1].xyz;
    worldPos = in.position.x * billboardRight + in.position.y * billboardUp;`,
  },

  lod: {
    uniforms: [
      {
        configKey: 'distances',
        shaderName: 'u_lodDistances',
        type: 'vec4<f32>',
        defaultValue: 'vec4<f32>(10.0, 25.0, 50.0, 100.0)',
      },
    ],
    vertexContribution: `
    // @lod trait: level of detail (distance-based vertex culling)
    let lodDist = length(camera.position - (model.model * vec4<f32>(in.position, 1.0)).xyz);
    let lodLevel = select(0u, select(1u, select(2u, 3u, lodDist > material.u_lodDistances.z), lodDist > material.u_lodDistances.y), lodDist > material.u_lodDistances.x);`,
  },

  instanced: {
    uniforms: [
      { configKey: 'count', shaderName: 'u_instanceCount', type: 'u32', defaultValue: '100u' },
    ],
    vertexContribution: `
    // @instanced trait: hardware instancing support
    // Instance transforms are read from storage buffer
    // let instanceTransform = instances[instanceIndex];
    // worldPos = (instanceTransform * vec4<f32>(in.position, 1.0)).xyz;`,
  },

  // ─── Animation Traits ────────────────────────────────────────────────
  animated: {
    uniforms: [
      { configKey: 'speed', shaderName: 'u_animSpeed', type: 'f32', defaultValue: '1.0' },
      { configKey: 'amplitude', shaderName: 'u_animAmplitude', type: 'f32', defaultValue: '0.1' },
    ],
    vertexContribution: `
    // @animated trait: vertex animation
    let animOffset = sin(scene.time * material.u_animSpeed + in.position.x * 3.0) * material.u_animAmplitude;
    worldPos = in.position + in.normal * animOffset;`,
  },

  morph_target: {
    uniforms: [
      { configKey: 'weight', shaderName: 'u_morphWeight', type: 'f32', defaultValue: '0.0' },
    ],
    vertexContribution: `
    // @morph_target trait: blend shape interpolation
    // morphTarget positions would be read from storage buffer
    // worldPos = mix(in.position, morphTargetPosition, material.u_morphWeight);`,
  },

  // ─── Special Rendering Traits ────────────────────────────────────────
  gaussian_splat: {
    uniforms: [
      { configKey: 'max_splats', shaderName: 'u_maxSplats', type: 'u32', defaultValue: '500000u' },
    ],
    vertexContribution: `
    // @gaussian_splat trait: 3D Gaussian Splatting
    // Splat data (center, covariance, SH coefficients) from storage buffer`,
    fragmentContribution: `
    // @gaussian_splat trait: Gaussian alpha blending
    let splatAlpha = exp(-dot(in.uv - vec2<f32>(0.5), in.uv - vec2<f32>(0.5)) * 4.0);
    alpha = alpha * splatAlpha;`,
  },

  point_cloud: {
    uniforms: [
      { configKey: 'max_points', shaderName: 'u_maxPoints', type: 'u32', defaultValue: '100000u' },
      { configKey: 'point_size', shaderName: 'u_pointSize', type: 'f32', defaultValue: '2.0' },
    ],
    fragmentContribution: `
    // @point_cloud trait: point cloud rendering
    let pcDist = length(in.uv - vec2<f32>(0.5)) * 2.0;
    if (pcDist > 1.0) { discard; }
    alpha = 1.0 - pcDist * pcDist;`,
  },

  // ─── VR/XR Interaction Traits (shader-relevant aspects) ──────────────
  grabbable: {
    uniforms: [
      {
        configKey: 'highlight_color',
        shaderName: 'u_grabHighlight',
        type: 'vec3<f32>',
        defaultValue: 'vec3<f32>(1.0, 1.0, 0.0)',
      },
      {
        configKey: 'highlight_intensity',
        shaderName: 'u_grabHighlightIntensity',
        type: 'f32',
        defaultValue: '0.0',
      },
    ],
    fragmentContribution: `
    // @grabbable trait: interaction highlight
    emission = emission + material.u_grabHighlight * material.u_grabHighlightIntensity;`,
  },
};

// =============================================================================
// TSL COMPILER
// =============================================================================

export class TSLCompiler extends CompilerBase {
  protected readonly compilerName = 'TSLCompiler';

  protected override getRequiredCapability(): ANSCapabilityPathValue {
    return ANSCapabilityPath.TSL;
  }

  private options: Required<TSLCompilerOptions>;
  private warnings: string[] = [];
  private bindingCounter: number = 0;

  constructor(options: TSLCompilerOptions = {}) {
    super();
    this.options = {
      shaderTarget: options.shaderTarget || 'wgsl',
      debug: options.debug ?? false,
      indent: options.indent || '  ',
      enablePBR: options.enablePBR ?? true,
      enableCompute: options.enableCompute ?? true,
      materialBindGroup: options.materialBindGroup ?? 2,
      includeHelpers: options.includeHelpers ?? true,
    };
  }

  /**
   * Compile HoloComposition to TSL multi-file shader output.
   *
   * Returns a Record<string, string> where keys are file identifiers:
   *   - `{objectName}.vertex.wgsl` — Vertex shader
   *   - `{objectName}.fragment.wgsl` — Fragment shader
   *   - `{objectName}.compute.{traitName}.wgsl` — Compute shaders
   *   - `_helpers.wgsl` — Shared helper functions
   *   - `_globals.wgsl` — Global uniform structures
   *   - `_pipeline.ts` — Pipeline creation code
   */
  compile(
    composition: HoloComposition,
    agentToken?: string,
    outputPath?: string
  ): Record<string, string> {
    // ─── Agent Identity Verification (optional — skipped when no token) ───
    if (agentToken) {
      this.validateCompilerAccess(agentToken, outputPath);
    }
    // ───────────────────────────────────────────────────────────────────────

    this.warnings = [];
    this.bindingCounter = 0;
    const result: Record<string, string> = {};

    // 1. Generate shared helpers
    if (this.options.includeHelpers) {
      result['_helpers.wgsl'] = this.generateHelpers();
    }

    // 2. Generate global uniform structures
    result['_globals.wgsl'] = this.generateGlobalUniforms(composition);

    // 3. Process each object
    const objects = composition.objects || [];
    for (const obj of objects) {
      this.bindingCounter = 0;
      const objOutput = this.compileObject(obj);
      const safeName = this.sanitizeName(obj.name);

      result[`${safeName}.vertex.wgsl`] = objOutput.vertexShader;
      result[`${safeName}.fragment.wgsl`] = objOutput.fragmentShader;
      result[`${safeName}.bindings.wgsl`] = objOutput.bindGroupLayout;

      for (const [computeName, computeCode] of Object.entries(objOutput.computeShaders)) {
        result[`${safeName}.compute.${computeName}.wgsl`] = computeCode;
      }
    }

    // 3b. v4.2: Domain Block shader generation
    const domainBlocks = (composition as any).domainBlocks ?? [];
    if (domainBlocks.length > 0) {
      this.compileTSLDomainBlocks(domainBlocks, result);
    }

    // 4. Generate pipeline setup code
    result['_pipeline.ts'] = this.generatePipelineSetup(composition);

    // 5. Add warnings as a metadata file
    if (this.warnings.length > 0) {
      result['_warnings.txt'] = this.warnings.join('\n');
    }

    return result;
  }

  // ─── v4.2 Domain Block Compilation ────────────────────────────────────────

  private compileTSLDomainBlocks(domainBlocks: any[], result: Record<string, string>): void {
    compileDomainBlocks(
      domainBlocks,
      {
        material: (block) => {
          const mat = compileMaterialBlock(block) as any;
          const safeName = this.sanitizeName(mat.name);
          const lines: string[] = [
            `// TSL Domain Block Material: "${this.escapeStringValue(mat.name as string, 'TypeScript')}"`,
            `// Type: ${mat.type} | Generated by HoloScript TSLCompiler v4.2`,
            '',
            `struct DomainMaterial_${safeName} {`,
          ];

          // PBR properties as uniform struct members
          if (mat.baseColor) {
            const [r, g, b] = this.parseHexColor(mat.baseColor);
            lines.push(
              `  baseColor: vec3<f32>, // default: vec3<f32>(${r.toFixed(4)}, ${g.toFixed(4)}, ${b.toFixed(4)})`
            );
          } else {
            lines.push(`  baseColor: vec3<f32>, // default: vec3<f32>(0.8, 0.8, 0.8)`);
          }
          lines.push(`  roughness: f32, // default: ${mat.roughness ?? 0.5}`);
          lines.push(`  metallic: f32, // default: ${mat.metallic ?? 0.0}`);
          lines.push(`  opacity: f32, // default: ${mat.opacity ?? 1.0}`);
          if (mat.emissiveColor) {
            const [r, g, b] = this.parseHexColor(mat.emissiveColor);
            lines.push(
              `  emissiveColor: vec3<f32>, // default: vec3<f32>(${r.toFixed(4)}, ${g.toFixed(4)}, ${b.toFixed(4)})`
            );
          }
          lines.push(`  emissiveIntensity: f32, // default: ${mat.emissiveIntensity ?? 0.0}`);
          if (mat.ior !== undefined) {
            lines.push(`  ior: f32, // default: ${mat.ior}`);
          }
          lines.push(`};`);
          lines.push('');

          // Texture sampler bindings
          const texEntries = Object.entries(mat.textureMaps);
          if (texEntries.length > 0) {
            lines.push(
              `// Texture bindings for "${this.escapeStringValue(mat.name as string, 'TypeScript')}"`
            );
            let texBinding = 1;
            for (const [mapName, _path] of texEntries) {
              lines.push(
                `@group(3) @binding(${texBinding}) var tex_${safeName}_${mapName}: texture_2d<f32>;`
              );
              lines.push(
                `@group(3) @binding(${texBinding + 1}) var samp_${safeName}_${mapName}: sampler;`
              );
              texBinding += 2;
            }
          }

          // Fragment contribution snippet
          lines.push('');
          lines.push(
            `// Fragment contribution for domain material "${this.escapeStringValue(mat.name as string, 'TypeScript')}"`
          );
          lines.push(`// Usage in fs_main:`);
          lines.push(`//   baseColor = domainMat_${safeName}.baseColor;`);
          lines.push(`//   roughness = domainMat_${safeName}.roughness;`);
          lines.push(`//   metallic = domainMat_${safeName}.metallic;`);
          lines.push(`//   alpha = domainMat_${safeName}.opacity;`);

          result[`_domain.material.${safeName}.wgsl`] = lines.join('\n');
          return `// TSL Material: "${this.escapeStringValue(mat.name as string, 'TypeScript')}" type=${mat.type}`;
        },

        physics: (block) => {
          const phys = compilePhysicsBlock(block) as any;
          const safeName = this.sanitizeName(phys.name || 'physics');
          const lines: string[] = [
            `// TSL Domain Block Physics Compute: "${this.escapeStringValue(phys.name as string, 'TypeScript')}"`,
            `// Keyword: ${phys.keyword} | Colliders: ${phys.colliders?.length || 0} | Joints: ${phys.joints?.length || 0}`,
            `// Generated by HoloScript TSLCompiler v4.2`,
            '',
          ];

          // Rigidbody struct
          if (phys.rigidbody) {
            lines.push(`struct DomainRigidbody_${safeName} {`);
            lines.push(`  position: vec3<f32>,`);
            lines.push(`  mass: f32, // ${phys.rigidbody.mass}`);
            lines.push(`  velocity: vec3<f32>,`);
            lines.push(`  friction: f32, // ${phys.rigidbody.friction}`);
            lines.push(`  angularVelocity: vec3<f32>,`);
            lines.push(`  restitution: f32, // ${phys.rigidbody.restitution}`);
            lines.push(`};`);
            lines.push('');
          }

          // Collider representations
          if (phys.colliders && phys.colliders.length > 0) {
            for (const collider of phys.colliders) {
              lines.push(
                `// Collider: type=${collider.type} size=${JSON.stringify(collider.size)} offset=${JSON.stringify(collider.offset)}`
              );
            }
            lines.push('');
          }

          // Force fields as compute
          if (phys.forceFields && phys.forceFields.length > 0) {
            for (const ff of phys.forceFields) {
              lines.push(
                `// ForceField: type=${ff.type} strength=${ff.strength} radius=${ff.radius}`
              );
            }
            lines.push('');
          }

          // Compute shader for physics simulation
          lines.push(
            `@group(0) @binding(0) var<storage, read_write> bodies_${safeName}: array<DomainRigidbody_${safeName}>;`
          );
          lines.push(`@group(0) @binding(1) var<uniform> dt_${safeName}: f32;`);
          lines.push('');
          lines.push(`@compute @workgroup_size(64)`);
          lines.push(
            `fn cs_domain_physics_${safeName}(@builtin(global_invocation_id) gid: vec3<u32>) {`
          );
          lines.push(`  let i = gid.x;`);
          lines.push(`  if (i >= arrayLength(&bodies_${safeName})) { return; }`);
          lines.push(`  var b = bodies_${safeName}[i];`);
          lines.push(`  b.velocity.y -= 9.81 * dt_${safeName};`);
          lines.push(`  b.position += b.velocity * dt_${safeName};`);
          lines.push(`  if (b.position.y < 0.0) {`);
          lines.push(`    b.position.y = 0.0;`);
          lines.push(`    b.velocity.y = -b.velocity.y * b.restitution;`);
          lines.push(`  }`);
          lines.push(`  bodies_${safeName}[i] = b;`);
          lines.push(`}`);

          result[`_domain.physics.${safeName}.compute.wgsl`] = lines.join('\n');
          return `// TSL Physics Compute: "${this.escapeStringValue(phys.name as string, 'TypeScript')}" colliders=${phys.colliders?.length || 0}`;
        },

        vfx: (block) => {
          const ps = compileParticleBlock(block) as any;
          const safeName = this.sanitizeName(ps.name);
          const lines: string[] = [
            `// TSL Domain Block Particle Compute: "${this.escapeStringValue(ps.name as string, 'TypeScript')}"`,
            `// Rate: ${ps.properties.rate || 'default'} | Lifetime: ${ps.properties.lifetime || 'default'}`,
            `// Generated by HoloScript TSLCompiler v4.2`,
            '',
            `struct DomainParticle_${safeName} {`,
            `  pos: vec3<f32>,`,
            `  _pad0: f32,`,
            `  vel: vec3<f32>,`,
            `  life: f32,`,
            `  color: vec4<f32>,`,
            `  size: f32,`,
            `  _pad1: vec3<f32>,`,
            `};`,
            '',
          ];

          // Emitter modules as comments
          if (ps.modules && ps.modules.length > 0) {
            for (const mod of ps.modules) {
              lines.push(`// Module: type=${mod.type} ${JSON.stringify(mod.properties)}`);
            }
            lines.push('');
          }

          const lifetime = ps.properties.lifetime || 2.0;
          const gravity = ps.properties.gravity ?? -9.81;

          lines.push(
            `@group(0) @binding(0) var<storage, read> particlesIn_${safeName}: array<DomainParticle_${safeName}>;`
          );
          lines.push(
            `@group(0) @binding(1) var<storage, read_write> particlesOut_${safeName}: array<DomainParticle_${safeName}>;`
          );
          lines.push(`@group(0) @binding(2) var<uniform> dt_${safeName}: f32;`);
          lines.push('');
          lines.push(`@compute @workgroup_size(64)`);
          lines.push(
            `fn cs_domain_particle_${safeName}(@builtin(global_invocation_id) gid: vec3<u32>) {`
          );
          lines.push(`  let i = gid.x;`);
          lines.push(`  if (i >= arrayLength(&particlesIn_${safeName})) { return; }`);
          lines.push(`  var p = particlesIn_${safeName}[i];`);
          lines.push(
            `  p.vel.y += ${typeof gravity === 'number' ? gravity.toFixed(2) : gravity} * dt_${safeName};`
          );
          lines.push(`  p.pos += p.vel * dt_${safeName};`);
          lines.push(`  p.life -= dt_${safeName};`);
          lines.push(`  if (p.life <= 0.0) {`);
          lines.push(`    p.pos = vec3<f32>(0.0);`);
          lines.push(`    p.vel = vec3<f32>(0.0, 5.0, 0.0);`);
          lines.push(
            `    p.life = ${typeof lifetime === 'number' ? lifetime.toFixed(1) : lifetime};`
          );
          lines.push(`  }`);
          lines.push(`  particlesOut_${safeName}[i] = p;`);
          lines.push(`}`);

          result[`_domain.vfx.${safeName}.compute.wgsl`] = lines.join('\n');
          return `// TSL Particles Compute: "${this.escapeStringValue(ps.name as string, 'TypeScript')}" rate=${ps.properties.rate || 'default'}`;
        },

        postfx: (block) => {
          const pp = compilePostProcessingBlock(block) as any;
          const safeName = this.sanitizeName(pp.name);
          const lines: string[] = [
            `// TSL Domain Block Post-Processing: "${this.escapeStringValue(pp.name as string, 'TypeScript')}"`,
            `// Priority: ${pp.priority} | Effects: ${pp.effects.length}`,
            `// Generated by HoloScript TSLCompiler v4.2`,
            '',
            `// Full-screen quad fragment shader for post-processing`,
            '',
            `struct PostFXInput {`,
            `  @location(0) uv: vec2<f32>,`,
            `};`,
            '',
            `@group(0) @binding(0) var sceneTexture: texture_2d<f32>;`,
            `@group(0) @binding(1) var sceneSampler: sampler;`,
            '',
          ];

          // Effect-specific uniforms
          for (const effect of pp.effects) {
            lines.push(
              `// Effect: ${effect.type} — enabled: ${effect.enabled} intensity: ${effect.intensity}`
            );
            for (const [k, v] of Object.entries(effect.parameters)) {
              lines.push(`//   ${k}: ${JSON.stringify(v)}`);
            }
          }

          lines.push('');
          lines.push(`@fragment`);
          lines.push(`fn fs_postfx_${safeName}(in: PostFXInput) -> @location(0) vec4<f32> {`);
          lines.push(`  var color = textureSample(sceneTexture, sceneSampler, in.uv);`);

          for (const effect of pp.effects) {
            if (effect.type === 'bloom') {
              lines.push(`  // Bloom pass (intensity: ${effect.intensity})`);
              lines.push(
                `  let bloomThreshold = ${((effect.parameters.threshold as number) || 0.8).toFixed(2)};`
              );
              lines.push(
                `  let bloomBright = max(color.rgb - vec3<f32>(bloomThreshold), vec3<f32>(0.0));`
              );
              lines.push(
                `  color = vec4<f32>(color.rgb + bloomBright * ${effect.intensity.toFixed(2)}, color.a);`
              );
            } else if (effect.type === 'tonemap') {
              lines.push(`  // Tonemapping (Reinhard)`);
              lines.push(`  color = vec4<f32>(color.rgb / (color.rgb + vec3<f32>(1.0)), color.a);`);
            } else if (effect.type === 'vignette') {
              lines.push(`  // Vignette (intensity: ${effect.intensity})`);
              lines.push(`  let vigDist = length(in.uv - vec2<f32>(0.5)) * 1.414;`);
              lines.push(
                `  let vigFactor = 1.0 - vigDist * vigDist * ${effect.intensity.toFixed(2)};`
              );
              lines.push(`  color = vec4<f32>(color.rgb * vigFactor, color.a);`);
            } else {
              lines.push(
                `  // Effect: ${effect.type} (intensity: ${effect.intensity}) — generic passthrough`
              );
            }
          }

          lines.push(`  return color;`);
          lines.push(`}`);

          result[`_domain.postfx.${safeName}.fragment.wgsl`] = lines.join('\n');
          return `// TSL PostFX: "${this.escapeStringValue(pp.name as string, 'TypeScript')}" effects=${pp.effects.length}`;
        },

        audio: (block) => {
          const audio = compileAudioSourceBlock(block);
          const safeName = this.sanitizeName(audio.name);
          const lines: string[] = [
            `// TSL Domain Block Audio Metadata: "${this.escapeStringValue(audio.name as string, 'TypeScript')}"`,
            `// Generated by HoloScript TSLCompiler v4.2`,
            `// NOTE: Audio is not a shader concern; this file provides metadata`,
            `// for runtime integration with WebAudio API or spatial audio systems.`,
            '',
            `// clip: ${audio.properties.clip || 'none'}`,
            `// spatial: ${audio.properties.spatial ?? true}`,
            `// volume: ${audio.properties.volume ?? 1.0}`,
            `// loop: ${audio.properties.loop ?? false}`,
            `// rolloff: ${audio.properties.rolloff || 'linear'}`,
          ];

          result[`_domain.audio.${safeName}.meta.txt`] = lines.join('\n');
          return `// TSL Audio: "${this.escapeStringValue(audio.name as string, 'TypeScript')}" clip=${audio.properties.clip || 'none'}`;
        },

        weather: (block) => {
          const weather = compileWeatherBlock(block);
          const safeName = this.sanitizeName(weather.keyword || 'weather');
          const lines: string[] = [
            `// TSL Domain Block Weather: "${weather.keyword}"`,
            `// Layers: ${weather.layers.length}`,
            `// Generated by HoloScript TSLCompiler v4.2`,
            '',
          ];

          // Weather contributes uniform data for atmospheric shaders
          lines.push(`struct DomainWeather_${safeName} {`);
          for (const layer of weather.layers) {
            lines.push(
              `  // Layer: ${layer.type} intensity=${layer.intensity} color=${layer.color || 'auto'}`
            );
            lines.push(`  ${layer.type}_intensity: f32,`);
          }
          if (weather.wind) {
            lines.push(`  windDirection: vec3<f32>, // ${JSON.stringify(weather.wind.direction)}`);
            lines.push(`  windSpeed: f32, // ${weather.wind.speed}`);
          }
          lines.push(`};`);

          // Simple atmospheric fragment contribution
          lines.push('');
          lines.push(`// Atmospheric fragment contribution for weather "${weather.keyword}"`);
          lines.push(`// Apply in fs_main after PBR lighting:`);
          for (const layer of weather.layers) {
            if (layer.type === 'fog') {
              lines.push(`//   let fogDist = length(camera.position - in.worldPosition);`);
              lines.push(
                `//   let fogFactor = exp(-fogDist * ${((layer.intensity ?? 1.0) * 0.01).toFixed(4)});`
              );
              lines.push(`//   color = mix(vec3<f32>(0.7, 0.7, 0.75), color, fogFactor);`);
            } else if (layer.type === 'rain' || layer.type === 'snow') {
              lines.push(`//   // ${layer.type}: use particle compute shader for precipitation`);
            }
          }

          result[`_domain.weather.${safeName}.wgsl`] = lines.join('\n');
          return `// TSL Weather: "${weather.keyword}" layers=${weather.layers.length}`;
        },
      },
      (block) => {
        // Fallback for unknown domain types
        result[`_domain.${block.domain}.${this.sanitizeName(block.name || 'unknown')}.meta.txt`] =
          `// Unhandled TSL domain block: ${block.domain}/${block.keyword} "${this.escapeStringValue(block.name as string, 'TypeScript')}"`;
        return `// Unhandled domain: ${block.domain}/${block.keyword} "${this.escapeStringValue(block.name as string, 'TypeScript')}"`;
      }
    );
  }

  // ─── Object Compilation ──────────────────────────────────────────────────

  private compileObject(obj: HoloObjectDecl): TSLObjectOutput {
    const traits = obj.traits || [];
    const contributions: TSLTraitShaderContribution[] = [];

    // Collect shader contributions from each trait
    for (const trait of traits) {
      const contribution = this.compileTraitToShader(trait);
      if (contribution) {
        contributions.push(contribution);
      }
    }

    // Merge all uniforms
    const allUniforms: TSLUniform[] = [];
    for (const contrib of contributions) {
      allUniforms.push(...contrib.uniforms);
    }

    // Generate vertex shader
    const vertexShader = this.generateVertexShader(obj, contributions);

    // Generate fragment shader
    const fragmentShader = this.generateFragmentShader(obj, contributions);

    // Generate compute shaders
    const computeShaders: Record<string, string> = {};
    if (this.options.enableCompute) {
      for (const contrib of contributions) {
        if (contrib.needsCompute && contrib.computeCode) {
          computeShaders[contrib.traitName] = this.wrapComputeShader(obj, contrib);
        }
      }
    }

    // Generate bind group layout
    const bindGroupLayout = this.generateBindGroupLayout(allUniforms);

    return {
      objectName: obj.name,
      traits: traits.map((t) => t.name),
      vertexShader,
      fragmentShader,
      computeShaders,
      uniforms: allUniforms,
      bindGroupLayout,
    };
  }

  // ─── Trait -> Shader Compilation ─────────────────────────────────────────

  private compileTraitToShader(trait: HoloObjectTrait): TSLTraitShaderContribution | null {
    const mapping = TRAIT_SHADER_MAP[trait.name];

    if (!mapping) {
      this.warnings.push(
        `Trait "@${this.escapeStringValue(trait.name as string, 'TypeScript')}" has no TSL shader mapping — skipped in shader generation.`
      );
      return null;
    }

    // Build uniforms from mapping + trait config overrides
    const uniforms: TSLUniform[] = mapping.uniforms.map((u) => {
      const configValue = trait.config?.[u.configKey];
      const resolvedDefault =
        configValue !== undefined ? this.holoValueToWGSL(configValue, u.type) : u.defaultValue;

      return {
        name: u.shaderName,
        type: u.type,
        defaultValue: resolvedDefault,
        binding: this.bindingCounter++,
        group: this.options.materialBindGroup,
        sourceTrait: trait.name,
      };
    });

    return {
      traitName: trait.name,
      uniforms,
      vertexCode: mapping.vertexContribution || '',
      fragmentCode: mapping.fragmentContribution || '',
      computeCode: mapping.computeContribution || '',
      needsCompute: !!mapping.computeContribution,
      workgroupSize: mapping.workgroupSize,
    };
  }

  // ─── Vertex Shader Generation ────────────────────────────────────────────

  private generateVertexShader(
    obj: HoloObjectDecl,
    contributions: TSLTraitShaderContribution[]
  ): string {
    const vertexContributions = contributions
      .filter((c) => c.vertexCode.trim().length > 0)
      .map((c) => c.vertexCode)
      .join('\n');

    const uniformStruct = this.generateMaterialUniformStruct(contributions);

    return `// TSL Vertex Shader — Object: "${this.escapeStringValue(obj.name as string, 'TypeScript')}"
// Generated by HoloScript TSLCompiler
// Traits: ${contributions.map((c) => '@' + c.traitName).join(', ') || 'none'}

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

struct SceneUniforms {
  ambientColor: vec3<f32>,
  time: f32,
  deltaTime: f32,
};

@group(0) @binding(0) var<uniform> camera: CameraUniforms;
@group(0) @binding(1) var<uniform> scene: SceneUniforms;
@group(1) @binding(0) var<uniform> model: ModelUniforms;
${uniformStruct}

@vertex
fn vs_main(in: VertexInput) -> VertexOutput {
  var out: VertexOutput;
  var worldPos = in.position;
${vertexContributions}

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

  // ─── Fragment Shader Generation ──────────────────────────────────────────

  private generateFragmentShader(
    obj: HoloObjectDecl,
    contributions: TSLTraitShaderContribution[]
  ): string {
    const fragmentContributions = contributions
      .filter((c) => c.fragmentCode.trim().length > 0)
      .map((c) => c.fragmentCode)
      .join('\n');

    const uniformStruct = this.generateMaterialUniformStruct(contributions);
    const pbrLighting = this.options.enablePBR ? this.generatePBRLighting() : '';
    const helperFunctions = this.options.includeHelpers ? this.generateInlineHelpers() : '';

    return `// TSL Fragment Shader — Object: "${this.escapeStringValue(obj.name as string, 'TypeScript')}"
// Generated by HoloScript TSLCompiler
// Traits: ${contributions.map((c) => '@' + c.traitName).join(', ') || 'none'}

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
${uniformStruct}

const PI: f32 = 3.14159265359;

${helperFunctions}
${pbrLighting}

@fragment
fn fs_main(in: FragmentInput) -> @location(0) vec4<f32> {
  // Initialize PBR material defaults
  var baseColor = vec3<f32>(0.8, 0.8, 0.8);
  var metallic: f32 = 0.0;
  var roughness: f32 = 0.5;
  var emission = vec3<f32>(0.0);
  var alpha: f32 = 1.0;
  var ao: f32 = 1.0;

  let N = normalize(in.worldNormal);
  let V = normalize(camera.position - in.worldPosition);

  // ─── Trait Shader Contributions ─────────────────────────────────────
${fragmentContributions}
  // ────────────────────────────────────────────────────────────────────

${
  this.options.enablePBR
    ? `
  // ─── PBR Lighting ──────────────────────────────────────────────────
  let L = normalize(light.position - in.worldPosition);
  let H = normalize(V + L);
  let NdotV = max(dot(N, V), 0.0);
  let NdotL = max(dot(N, L), 0.0);
  let NdotH = max(dot(N, H), 0.0);
  let VdotH = max(dot(V, H), 0.0);

  let F0 = mix(vec3<f32>(0.04), baseColor, metallic);

  let NDF = distributionGGX(N, H, roughness);
  let G = geometrySmith(N, V, L, roughness);
  let F = fresnelSchlick(VdotH, F0);

  let numerator = NDF * G * F;
  let denominator = 4.0 * NdotV * NdotL + 0.0001;
  let specular = numerator / denominator;

  let kS = F;
  let kD = (vec3<f32>(1.0) - kS) * (1.0 - metallic);
  let Lo = (kD * baseColor / PI + specular) * light.color * light.intensity * NdotL;

  var color = scene.ambientColor * baseColor * ao + Lo + emission;

  // Tone mapping (Reinhard)
  color = color / (color + vec3<f32>(1.0));
  // Gamma correction
  color = pow(color, vec3<f32>(1.0 / 2.2));

  return vec4<f32>(color, alpha);`
    : `
  // ─── Simple Lighting (PBR disabled) ────────────────────────────────
  let L = normalize(vec3<f32>(1.0, 2.0, 1.5));
  let d = max(dot(N, L), 0.0);
  var color = baseColor * (0.15 + d * 0.85) + emission;
  return vec4<f32>(color, alpha);`
}
}
`;
  }

  // ─── Compute Shader Wrapping ─────────────────────────────────────────────

  private wrapComputeShader(obj: HoloObjectDecl, contribution: TSLTraitShaderContribution): string {
    return `// TSL Compute Shader — Object: "${this.escapeStringValue(obj.name as string, 'TypeScript')}" / Trait: @${contribution.traitName}
// Generated by HoloScript TSLCompiler
// Workgroup size: [${(contribution.workgroupSize || [64, 1, 1]).join(', ')}]

struct SceneUniforms {
  ambientColor: vec3<f32>,
  time: f32,
  deltaTime: f32,
};

${this.generateMaterialUniformStruct([contribution])}

${contribution.computeCode}
`;
  }

  // ─── Uniform Structure Generation ────────────────────────────────────────

  private generateMaterialUniformStruct(contributions: TSLTraitShaderContribution[]): string {
    const allUniforms: TSLUniform[] = [];
    for (const contrib of contributions) {
      allUniforms.push(...contrib.uniforms);
    }

    if (allUniforms.length === 0) {
      return '';
    }

    const lines: string[] = ['struct MaterialUniforms {'];
    for (const u of allUniforms) {
      const comment = this.options.debug ? ` // from @${u.sourceTrait}` : '';
      lines.push(
        `  ${this.escapeStringValue(u.name as string, 'TypeScript')}: ${u.type},${comment}`
      );
    }
    lines.push('};');
    lines.push(
      `@group(${this.options.materialBindGroup}) @binding(0) var<uniform> material: MaterialUniforms;`
    );

    return lines.join('\n');
  }

  private generateBindGroupLayout(uniforms: TSLUniform[]): string {
    const lines: string[] = [
      '// TSL Bind Group Layout',
      '// Generated by HoloScript TSLCompiler',
      '',
      '// Group 0: Camera + Scene + Lights',
      '// @binding(0) camera: CameraUniforms',
      '// @binding(1) scene: SceneUniforms',
      '// @binding(2) light: LightData',
      '',
      '// Group 1: Model transforms',
      '// @binding(0) model: ModelUniforms',
      '',
      `// Group ${this.options.materialBindGroup}: Material uniforms (from traits)`,
    ];

    if (uniforms.length === 0) {
      lines.push('// (no trait uniforms)');
    } else {
      lines.push('// struct MaterialUniforms {');
      for (const u of uniforms) {
        lines.push(
          `//   ${this.escapeStringValue(u.name as string, 'TypeScript')}: ${u.type}, // @${u.sourceTrait} — default: ${u.defaultValue}`
        );
      }
      lines.push('// };');
    }

    return lines.join('\n');
  }

  // ─── Global Uniforms ─────────────────────────────────────────────────────

  private generateGlobalUniforms(composition: HoloComposition): string {
    const lines: string[] = [
      '// TSL Global Uniform Structures',
      `// Composition: "${this.escapeStringValue(composition.name as string, 'TypeScript')}"`,
      '// Generated by HoloScript TSLCompiler',
      '',
      'struct CameraUniforms {',
      '  viewProjection: mat4x4<f32>,',
      '  view: mat4x4<f32>,',
      '  projection: mat4x4<f32>,',
      '  position: vec3<f32>,',
      '};',
      '',
      'struct SceneUniforms {',
      '  ambientColor: vec3<f32>,',
      '  time: f32,',
      '  deltaTime: f32,',
      '};',
      '',
      'struct ModelUniforms {',
      '  model: mat4x4<f32>,',
      '  normalMatrix: mat3x3<f32>,',
      '};',
      '',
      'struct LightData {',
      '  position: vec3<f32>,',
      '  color: vec3<f32>,',
      '  intensity: f32,',
      '};',
    ];

    // Extract environment data for default values
    if (composition.environment) {
      lines.push('');
      lines.push('// Environment defaults:');
      for (const prop of composition.environment.properties) {
        lines.push(
          `// ${this.escapeStringValue(prop.key as string, 'TypeScript')}: ${JSON.stringify(prop.value)}`
        );
      }
    }

    // Extract light data
    if (composition.lights && composition.lights.length > 0) {
      lines.push('');
      lines.push(`// Scene lights: ${composition.lights.length}`);
      for (const light of composition.lights) {
        lines.push(
          `// - ${this.escapeStringValue(light.name as string, 'TypeScript')} (${light.lightType})`
        );
      }
    }

    return lines.join('\n');
  }

  // ─── Pipeline Setup Generation ───────────────────────────────────────────

  private generatePipelineSetup(composition: HoloComposition): string {
    const objects = composition.objects || [];
    const lines: string[] = [
      '// TSL Pipeline Setup',
      `// Composition: "${this.escapeStringValue(composition.name as string, 'TypeScript')}"`,
      '// Generated by HoloScript TSLCompiler',
      '// This file creates WebGPU render/compute pipelines for all trait-driven shaders.',
      '',
      `import type { GPUDevice, GPURenderPipeline, GPUComputePipeline } from 'webgpu';`,
      '',
      'export interface TSLPipelineBundle {',
      '  renderPipelines: Map<string, GPURenderPipeline>;',
      '  computePipelines: Map<string, GPUComputePipeline>;',
      '  bindGroupLayouts: Map<string, GPUBindGroupLayout>;',
      '}',
      '',
      'export async function createTSLPipelines(device: GPUDevice): Promise<TSLPipelineBundle> {',
      '  const renderPipelines = new Map<string, GPURenderPipeline>();',
      '  const computePipelines = new Map<string, GPUComputePipeline>();',
      '  const bindGroupLayouts = new Map<string, GPUBindGroupLayout>();',
      '',
    ];

    for (const obj of objects) {
      const safeName = this.sanitizeName(obj.name);
      const traits = obj.traits || [];
      const computeTraits = traits.filter((t) => TRAIT_SHADER_MAP[t.name]?.computeContribution);

      lines.push(
        `  // ─── Object: "${this.escapeStringValue(obj.name as string, 'TypeScript')}" ───`
      );
      lines.push(`  // Traits: ${traits.map((t) => '@' + t.name).join(', ') || 'none'}`);
      lines.push(`  {`);
      lines.push(
        `    const vertexModule = device.createShaderModule({ code: ${safeName}VertexWGSL });`
      );
      lines.push(
        `    const fragmentModule = device.createShaderModule({ code: ${safeName}FragmentWGSL });`
      );
      lines.push(`    const pipeline = device.createRenderPipeline({`);
      lines.push(`      layout: 'auto',`);
      lines.push(`      vertex: {`);
      lines.push(`        module: vertexModule,`);
      lines.push(`        entryPoint: 'vs_main',`);
      lines.push(`        buffers: [{`);
      lines.push(`          arrayStride: 48,`);
      lines.push(`          attributes: [`);
      lines.push(`            { shaderLocation: 0, offset: 0, format: 'float32x3' },  // position`);
      lines.push(`            { shaderLocation: 1, offset: 12, format: 'float32x3' }, // normal`);
      lines.push(`            { shaderLocation: 2, offset: 24, format: 'float32x2' }, // uv`);
      lines.push(`            { shaderLocation: 3, offset: 32, format: 'float32x4' }, // tangent`);
      lines.push(`          ],`);
      lines.push(`        }],`);
      lines.push(`      },`);
      lines.push(`      fragment: {`);
      lines.push(`        module: fragmentModule,`);
      lines.push(`        entryPoint: 'fs_main',`);
      lines.push(`        targets: [{ format: navigator.gpu.getPreferredCanvasFormat() }],`);
      lines.push(`      },`);
      lines.push(`      primitive: { topology: 'triangle-list', cullMode: 'back' },`);
      lines.push(
        `      depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },`
      );
      lines.push(`    });`);
      lines.push(`    renderPipelines.set('${safeName}', pipeline);`);

      // Compute pipelines
      for (const ct of computeTraits) {
        const mapping = TRAIT_SHADER_MAP[ct.name];
        const wg = mapping?.workgroupSize || [64, 1, 1];
        lines.push(``);
        lines.push(`    // Compute: @${this.escapeStringValue(ct.name as string, 'TypeScript')}`);
        lines.push(
          `    const ${safeName}_${this.escapeStringValue(ct.name as string, 'TypeScript')}ComputeModule = device.createShaderModule({ code: ${safeName}_${this.escapeStringValue(ct.name as string, 'TypeScript')}ComputeWGSL });`
        );
        lines.push(
          `    const ${safeName}_${this.escapeStringValue(ct.name as string, 'TypeScript')}Pipeline = device.createComputePipeline({`
        );
        lines.push(`      layout: 'auto',`);
        lines.push(
          `      compute: { module: ${safeName}_${this.escapeStringValue(ct.name as string, 'TypeScript')}ComputeModule, entryPoint: 'cs_${ct.name === 'gpu_particle' ? 'particle_update' : ct.name === 'gpu_physics' ? 'physics_step' : 'generic'}' },`
        );
        lines.push(`    });`);
        lines.push(
          `    computePipelines.set('${safeName}_${this.escapeStringValue(ct.name as string, 'TypeScript')}', ${safeName}_${this.escapeStringValue(ct.name as string, 'TypeScript')}Pipeline);`
        );
      }

      lines.push(`  }`);
      lines.push('');
    }

    lines.push('  return { renderPipelines, computePipelines, bindGroupLayouts };');
    lines.push('}');

    return lines.join('\n');
  }

  // ─── Helper Function Generation ──────────────────────────────────────────

  private generateHelpers(): string {
    return `// TSL Shared Helper Functions
// Generated by HoloScript TSLCompiler

const PI: f32 = 3.14159265359;

// ─── Noise Functions ───────────────────────────────────────────────────

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

// ─── PBR Functions ─────────────────────────────────────────────────────

fn distributionGGX(N: vec3<f32>, H: vec3<f32>, roughness: f32) -> f32 {
  let a = roughness * roughness;
  let a2 = a * a;
  let NdotH = max(dot(N, H), 0.0);
  let NdotH2 = NdotH * NdotH;
  let num = a2;
  let denom = (NdotH2 * (a2 - 1.0) + 1.0);
  return num / (PI * denom * denom);
}

fn geometrySchlickGGX(NdotV: f32, roughness: f32) -> f32 {
  let r = roughness + 1.0;
  let k = (r * r) / 8.0;
  return NdotV / (NdotV * (1.0 - k) + k);
}

fn geometrySmith(N: vec3<f32>, V: vec3<f32>, L: vec3<f32>, roughness: f32) -> f32 {
  let NdotV = max(dot(N, V), 0.0);
  let NdotL = max(dot(N, L), 0.0);
  return geometrySchlickGGX(NdotV, roughness) * geometrySchlickGGX(NdotL, roughness);
}

fn fresnelSchlick(cosTheta: f32, F0: vec3<f32>) -> vec3<f32> {
  return F0 + (vec3<f32>(1.0) - F0) * pow(saturate(1.0 - cosTheta), 5.0);
}
`;
  }

  private generateInlineHelpers(): string {
    return `
// ─── Inline Helper Functions ───────────────────────────────────────────

fn simpleNoise(uv: vec2<f32>) -> f32 {
  return fract(sin(dot(uv, vec2<f32>(12.9898, 78.233))) * 43758.5453);
}

fn distributionGGX(N: vec3<f32>, H: vec3<f32>, roughness: f32) -> f32 {
  let a = roughness * roughness;
  let a2 = a * a;
  let NdotH = max(dot(N, H), 0.0);
  let NdotH2 = NdotH * NdotH;
  let num = a2;
  let denom = (NdotH2 * (a2 - 1.0) + 1.0);
  return num / (PI * denom * denom);
}

fn geometrySchlickGGX(NdotV: f32, roughness: f32) -> f32 {
  let r = roughness + 1.0;
  let k = (r * r) / 8.0;
  return NdotV / (NdotV * (1.0 - k) + k);
}

fn geometrySmith(N: vec3<f32>, V: vec3<f32>, L: vec3<f32>, roughness: f32) -> f32 {
  let NdotV = max(dot(N, V), 0.0);
  let NdotL = max(dot(N, L), 0.0);
  return geometrySchlickGGX(NdotV, roughness) * geometrySchlickGGX(NdotL, roughness);
}

fn fresnelSchlick(cosTheta: f32, F0: vec3<f32>) -> vec3<f32> {
  return F0 + (vec3<f32>(1.0) - F0) * pow(saturate(1.0 - cosTheta), 5.0);
}
`;
  }

  private generatePBRLighting(): string {
    // PBR lighting is inlined in the fragment shader body, not as separate functions
    return '';
  }

  // ─── Value Conversion Helpers ────────────────────────────────────────────

  private holoValueToWGSL(value: HoloValue, targetType: TSLDataType): string {
    if (value === null || value === undefined) {
      return this.defaultForType(targetType);
    }

    if (typeof value === 'number') {
      switch (targetType) {
        case 'f32':
          return Number.isInteger(value) ? `${value}.0` : `${value}`;
        case 'i32':
          return `${Math.floor(value)}i`;
        case 'u32':
          return `${Math.max(0, Math.floor(value))}u`;
        default:
          return `${value}`;
      }
    }

    if (typeof value === 'boolean') {
      return value ? 'true' : 'false';
    }

    if (typeof value === 'string') {
      // Try to parse hex color
      if (value.startsWith('#')) {
        const [r, g, b] = this.parseHexColor(value);
        return `vec3<f32>(${r.toFixed(4)}, ${g.toFixed(4)}, ${b.toFixed(4)})`;
      }
      return `0.0`; // fallback for string values
    }

    if (Array.isArray(value)) {
      const nums = value.filter((v): v is number => typeof v === 'number');
      switch (targetType) {
        case 'vec2<f32>':
          return `vec2<f32>(${nums[0] ?? 0}, ${nums[1] ?? 0})`;
        case 'vec3<f32>':
          return `vec3<f32>(${nums[0] ?? 0}, ${nums[1] ?? 0}, ${nums[2] ?? 0})`;
        case 'vec4<f32>':
          return `vec4<f32>(${nums[0] ?? 0}, ${nums[1] ?? 0}, ${nums[2] ?? 0}, ${nums[3] ?? 1})`;
        default:
          return nums.length > 0 ? `${nums[0]}` : '0.0';
      }
    }

    return this.defaultForType(targetType);
  }

  private defaultForType(type: TSLDataType): string {
    switch (type) {
      case 'f32':
        return '0.0';
      case 'i32':
        return '0i';
      case 'u32':
        return '0u';
      case 'bool':
        return 'false';
      case 'vec2<f32>':
        return 'vec2<f32>(0.0)';
      case 'vec3<f32>':
        return 'vec3<f32>(0.0)';
      case 'vec4<f32>':
        return 'vec4<f32>(0.0, 0.0, 0.0, 1.0)';
      case 'mat3x3<f32>':
        return 'mat3x3<f32>(1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0)';
      case 'mat4x4<f32>':
        return 'mat4x4<f32>(1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0)';
      default:
        return '0.0';
    }
  }

  private parseHexColor(hex: string): [number, number, number] {
    const h = hex.slice(1);
    return [
      parseInt(h.substring(0, 2), 16) / 255,
      parseInt(h.substring(2, 4), 16) / 255,
      parseInt(h.substring(4, 6), 16) / 255,
    ];
  }

  private sanitizeName(name: string): string {
    return name.replace(/[^a-zA-Z0-9_]/g, '_');
  }
}
