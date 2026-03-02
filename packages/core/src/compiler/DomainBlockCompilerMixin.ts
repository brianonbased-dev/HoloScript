/**
 * DomainBlockCompilerMixin.ts
 *
 * Shared utilities for compiling domain blocks and simulation constructs
 * to target platform code. Any compiler can import these helpers.
 *
 * Handles: materials, physics, particles, post-fx, audio, weather,
 * procedural, LOD, navigation, input, annotations.
 *
 * @version 4.2.0
 */

import type {
  HoloDomainBlock,
  HoloDomainType,
} from '../parser/HoloCompositionTypes';

// =============================================================================
// Material Compilation
// =============================================================================

export interface CompiledMaterial {
  name: string;
  type: 'pbr' | 'unlit' | 'shader';
  baseColor?: string;
  roughness?: number;
  metallic?: number;
  opacity?: number;
  ior?: number;
  emissiveColor?: string;
  emissiveIntensity?: number;
  textureMaps: Record<string, string>;
  traits: string[];
}

export function compileMaterialBlock(block: HoloDomainBlock): CompiledMaterial {
  const type = block.keyword === 'unlit_material' ? 'unlit'
    : block.keyword === 'shader' ? 'shader' : 'pbr';

  const textureMaps: Record<string, string> = {};
  const otherProps: Record<string, any> = {};

  for (const [key, value] of Object.entries(block.properties || {})) {
    if (key.endsWith('_map')) {
      textureMaps[key] = String(value);
    } else {
      otherProps[key] = value;
    }
  }

  return {
    name: block.name || 'unnamed',
    type,
    baseColor: otherProps.baseColor as string,
    roughness: otherProps.roughness as number,
    metallic: otherProps.metallic as number,
    opacity: otherProps.opacity as number,
    ior: otherProps.ior as number,
    emissiveColor: otherProps.emissive_color as string,
    emissiveIntensity: otherProps.emissive_intensity as number,
    textureMaps,
    traits: block.traits || [],
  };
}

// =============================================================================
// Physics Compilation
// =============================================================================

/** Compiled collider sub-block (box, sphere, capsule, mesh, convex) */
export interface CompiledCollider {
  type: 'collider' | 'trigger';
  shape?: string;
  properties: Record<string, any>;
}

/** Compiled rigidbody sub-block (mass, drag, angular_damping, use_gravity) */
export interface CompiledRigidbody {
  properties: Record<string, any>;
}

/** Compiled force field sub-block (gravity_zone, wind_zone, buoyancy_zone) */
export interface CompiledForceField {
  keyword: string;
  name?: string;
  properties: Record<string, any>;
}

/** Compiled joint sub-block within articulation */
export interface CompiledJoint {
  keyword: string;
  name?: string;
  properties: Record<string, any>;
}

export interface CompiledPhysics {
  keyword: string;
  name?: string;
  shape?: string;
  properties: Record<string, any>;
  /** Nested collider sub-blocks */
  colliders?: CompiledCollider[];
  /** Nested rigidbody sub-block (at most one) */
  rigidbody?: CompiledRigidbody;
  /** Nested force field sub-blocks */
  forceFields?: CompiledForceField[];
  /** Nested joint sub-blocks (for articulation) */
  joints?: CompiledJoint[];
}

export function compilePhysicsBlock(block: HoloDomainBlock): CompiledPhysics {
  const colliders: CompiledCollider[] = [];
  const forceFields: CompiledForceField[] = [];
  const joints: CompiledJoint[] = [];
  let rigidbody: CompiledRigidbody | undefined;

  for (const child of (block.children || [])) {
    const c = child as any;
    if (c.type !== 'DomainBlock') continue;

    const kw = c.keyword as string;
    if (kw === 'collider' || kw === 'trigger') {
      colliders.push({
        type: kw as 'collider' | 'trigger',
        shape: c.name, // shape stored as name for collider blocks
        properties: c.properties || {},
      });
    } else if (kw === 'rigidbody') {
      rigidbody = { properties: c.properties || {} };
    } else if (['force_field', 'gravity_zone', 'wind_zone', 'buoyancy_zone', 'magnetic_field', 'drag_zone'].includes(kw)) {
      forceFields.push({
        keyword: kw,
        name: c.name,
        properties: c.properties || {},
      });
    } else {
      // Joint sub-blocks (hinge, slider, ball_socket, etc.)
      joints.push({
        keyword: kw,
        name: c.name,
        properties: c.properties || {},
      });
    }
  }

  return {
    keyword: block.keyword,
    name: block.name,
    properties: block.properties || {},
    colliders: colliders.length > 0 ? colliders : undefined,
    rigidbody,
    forceFields: forceFields.length > 0 ? forceFields : undefined,
    joints: joints.length > 0 ? joints : undefined,
  };
}

// =============================================================================
// Particle / VFX Compilation
// =============================================================================

/** Compiled particle module sub-block (emission, velocity, color_over_life, etc.) */
export interface CompiledParticleModule {
  /** Module type keyword (emission, velocity, color_over_life, size_over_life, noise, etc.) */
  type: string;
  properties: Record<string, any>;
}

export interface CompiledParticleSystem {
  /** Keyword used (particles, emitter, vfx, particle_system) */
  keyword: string;
  name: string;
  /** Trait decorators (@looping, @burst, @gpu, etc.) */
  traits: string[];
  /** Top-level scalar properties (rate, max_particles, start_lifetime, etc.) */
  properties: Record<string, any>;
  /** Structured sub-module blocks (emission, velocity, color_over_life, etc.) */
  modules: CompiledParticleModule[];
}

export function compileParticleBlock(block: HoloDomainBlock): CompiledParticleSystem {
  const modules: CompiledParticleModule[] = [];

  for (const child of (block.children || [])) {
    const c = child as any;
    if (c.type === 'DomainBlock') {
      modules.push({
        type: c.keyword,
        properties: c.properties || {},
      });
    }
  }

  return {
    keyword: block.keyword,
    name: block.name || 'unnamed',
    traits: block.traits || [],
    properties: block.properties || {},
    modules,
  };
}

// =============================================================================
// Post-Processing Compilation
// =============================================================================

/** A single post-processing effect (bloom, depth_of_field, color_grading, etc.) */
export interface CompiledPostEffect {
  /** Effect type keyword (bloom, depth_of_field, vignette, etc.) */
  type: string;
  properties: Record<string, any>;
}

export interface CompiledPostProcessing {
  /** Keyword used (post_processing, post_fx, render_pipeline) */
  keyword: string;
  name?: string;
  /** Ordered list of effects in the pipeline */
  effects: CompiledPostEffect[];
}

export function compilePostProcessingBlock(block: HoloDomainBlock): CompiledPostProcessing {
  const effects: CompiledPostEffect[] = [];

  for (const child of (block.children || [])) {
    const c = child as any;
    if (c.type === 'DomainBlock') {
      effects.push({
        type: c.keyword,
        properties: c.properties || {},
      });
    }
  }

  return {
    keyword: block.keyword,
    name: block.name,
    effects,
  };
}

// =============================================================================
// Audio Source Compilation
// =============================================================================

export interface CompiledAudioSource {
  /** Keyword used (audio_source, audio_listener, reverb_zone, audio_mixer, ambience, sound_emitter) */
  keyword: string;
  name: string;
  /** Trait decorators (@spatial, @hrtf, @stereo, etc.) */
  traits: string[];
  /** Audio properties (clip, volume, pitch, spatial_blend, etc.) */
  properties: Record<string, any>;
}

export function compileAudioSourceBlock(block: HoloDomainBlock): CompiledAudioSource {
  return {
    keyword: block.keyword,
    name: block.name || 'unnamed',
    traits: block.traits || [],
    properties: block.properties || {},
  };
}

// =============================================================================
// Weather / Atmosphere Compilation
// =============================================================================

/** A single weather layer (rain, snow, wind, lightning, clouds, etc.) */
export interface CompiledWeatherLayer {
  /** Layer type keyword (rain, snow, wind, lightning, clouds, fog_layer, etc.) */
  type: string;
  properties: Record<string, any>;
}

export interface CompiledWeather {
  /** Keyword used (weather, atmosphere, sky, climate) */
  keyword: string;
  name?: string;
  /** Trait decorators (@dynamic, @cyclical, etc.) */
  traits: string[];
  /** Top-level scalar properties (intensity, transition_time, etc.) */
  properties: Record<string, any>;
  /** Structured weather layers (rain, snow, wind, lightning, clouds, etc.) */
  layers: CompiledWeatherLayer[];
}

export function compileWeatherBlock(block: HoloDomainBlock): CompiledWeather {
  const layers: CompiledWeatherLayer[] = [];

  for (const child of (block.children || [])) {
    const c = child as any;
    if (c.type === 'DomainBlock') {
      layers.push({
        type: c.keyword,
        properties: c.properties || {},
      });
    }
  }

  return {
    keyword: block.keyword,
    name: block.name,
    traits: block.traits || [],
    properties: block.properties || {},
    layers,
  };
}

// =============================================================================
// Target-Specific Code Generation Helpers
// =============================================================================

/** Generate R3F/Three.js particle system JSX */
export function particlesToR3F(ps: CompiledParticleSystem): string {
  const props: string[] = [];
  if (ps.properties.rate) props.push(`rate={${ps.properties.rate}}`);
  if (ps.properties.max_particles) props.push(`maxParticles={${ps.properties.max_particles}}`);
  if (ps.properties.start_lifetime) {
    const lt = ps.properties.start_lifetime;
    props.push(Array.isArray(lt) ? `lifetime={[${lt.join(', ')}]}` : `lifetime={${lt}}`);
  }
  if (ps.properties.start_speed) {
    const sp = ps.properties.start_speed;
    props.push(Array.isArray(sp) ? `speed={[${sp.join(', ')}]}` : `speed={${sp}}`);
  }
  if (ps.properties.gravity_modifier !== undefined) {
    props.push(`gravityModifier={${ps.properties.gravity_modifier}}`);
  }

  const isLooping = ps.traits.includes('looping');
  if (isLooping) props.push('loop');

  const modulesJSX = ps.modules.map(m => {
    const mProps = Object.entries(m.properties)
      .map(([k, v]) => {
        const camel = k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
        return typeof v === 'string' ? `${camel}="${v}"` : `${camel}={${JSON.stringify(v)}}`;
      }).join(' ');
    return `  <${m.type} ${mProps} />`;
  }).join('\n');

  return [
    `<ParticleSystem name="${ps.name}" ${props.join(' ')}>`,
    modulesJSX,
    '</ParticleSystem>',
  ].filter(Boolean).join('\n');
}

/** Generate R3F/Three.js post-processing JSX (react-postprocessing) */
export function postProcessingToR3F(pp: CompiledPostProcessing): string {
  const effectsJSX = pp.effects.map(e => {
    const componentName = e.type.split('_').map(w => w[0].toUpperCase() + w.slice(1)).join('');
    const props = Object.entries(e.properties)
      .map(([k, v]) => {
        const camel = k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
        return typeof v === 'string' ? `${camel}="${v}"` : `${camel}={${JSON.stringify(v)}}`;
      }).join(' ');
    return `  <${componentName} ${props} />`;
  }).join('\n');

  return [
    '<EffectComposer>',
    effectsJSX,
    '</EffectComposer>',
  ].join('\n');
}

/** Generate R3F/Three.js audio source JSX */
export function audioSourceToR3F(audio: CompiledAudioSource): string {
  const isSpatial = audio.traits.includes('spatial') || audio.properties.spatial_blend > 0;
  const tag = isSpatial ? 'PositionalAudio' : 'Audio';

  const props: string[] = [];
  if (audio.properties.clip) props.push(`url="${audio.properties.clip}"`);
  if (audio.properties.volume !== undefined) props.push(`volume={${audio.properties.volume}}`);
  if (audio.properties.loop !== undefined) props.push(`loop={${audio.properties.loop}}`);
  if (isSpatial && audio.properties.max_distance) {
    props.push(`distance={${audio.properties.max_distance}}`);
  }
  if (audio.properties.play_on_awake) props.push('autoplay');

  return `<${tag} name="${audio.name}" ${props.join(' ')} />`;
}

/** Generate USD weather/atmosphere representation */
export function weatherToUSD(weather: CompiledWeather): string {
  const lines: string[] = [
    `def Scope "${weather.name || 'Weather'}" {`,
  ];

  for (const [key, value] of Object.entries(weather.properties)) {
    lines.push(`    custom ${typeof value === 'number' ? 'float' : 'string'} ${key} = ${JSON.stringify(value)}`);
  }

  for (const layer of weather.layers) {
    lines.push(`    def Scope "${layer.type}" {`);
    for (const [key, value] of Object.entries(layer.properties)) {
      const usdType = typeof value === 'number' ? 'float'
        : typeof value === 'boolean' ? 'bool'
        : Array.isArray(value) ? 'float3' : 'string';
      const usdVal = Array.isArray(value) ? `(${value.join(', ')})` : JSON.stringify(value);
      lines.push(`        custom ${usdType} ${key} = ${usdVal}`);
    }
    lines.push('    }');
  }

  lines.push('}');
  return lines.join('\n');
}

/** Generate R3F/Three.js material JSX */
export function materialToR3F(mat: CompiledMaterial): string {
  if (mat.type === 'unlit') {
    const props = [
      mat.emissiveColor ? `emissive="${mat.emissiveColor}"` : '',
      mat.emissiveIntensity ? `emissiveIntensity={${mat.emissiveIntensity}}` : '',
      mat.opacity !== undefined ? `opacity={${mat.opacity}} transparent` : '',
    ].filter(Boolean).join(' ');
    return `<meshBasicMaterial ${props} />`;
  }

  const props = [
    mat.baseColor ? `color="${mat.baseColor}"` : '',
    mat.roughness !== undefined ? `roughness={${mat.roughness}}` : '',
    mat.metallic !== undefined ? `metalness={${mat.metallic}}` : '',
    mat.opacity !== undefined ? `opacity={${mat.opacity}} transparent` : '',
    mat.emissiveColor ? `emissive="${mat.emissiveColor}"` : '',
    mat.emissiveIntensity ? `emissiveIntensity={${mat.emissiveIntensity}}` : '',
  ].filter(Boolean).join(' ');

  const textures = Object.entries(mat.textureMaps).map(([type, path]) => {
    const propName = type.replace(/_map$/, 'Map').replace(/^albedo/, '');
    return `${propName}={useTexture("${path}")}`;
  }).join(' ');

  return `<meshStandardMaterial ${props} ${textures} />`;
}

/** Generate USD material prim */
export function materialToUSD(mat: CompiledMaterial): string {
  const lines: string[] = [
    `def Material "${mat.name}" {`,
    `    token outputs:surface.connect = <${mat.name}/PBRShader.outputs:surface>`,
    `    def Shader "PBRShader" {`,
    `        uniform token info:id = "UsdPreviewSurface"`,
  ];
  if (mat.baseColor) lines.push(`        color3f inputs:diffuseColor = (${hexToRGB(mat.baseColor)})`);
  if (mat.roughness !== undefined) lines.push(`        float inputs:roughness = ${mat.roughness}`);
  if (mat.metallic !== undefined) lines.push(`        float inputs:metallic = ${mat.metallic}`);
  if (mat.opacity !== undefined) lines.push(`        float inputs:opacity = ${mat.opacity}`);
  if (mat.ior !== undefined) lines.push(`        float inputs:ior = ${mat.ior}`);
  lines.push(`        token outputs:surface`);
  lines.push(`    }`);
  lines.push(`}`);
  return lines.join('\n');
}

/** Generate glTF material object */
export function materialToGLTF(mat: CompiledMaterial): object {
  const gltfMat: any = { name: mat.name };
  if (mat.type === 'pbr' || mat.type === 'shader') {
    gltfMat.pbrMetallicRoughness = {
      baseColorFactor: mat.baseColor ? hexToRGBA(mat.baseColor, mat.opacity ?? 1) : [1, 1, 1, 1],
      metallicFactor: mat.metallic ?? 0,
      roughnessFactor: mat.roughness ?? 0.5,
    };
  }
  if (mat.emissiveColor) {
    gltfMat.emissiveFactor = hexToRGB(mat.emissiveColor).split(', ').map(Number);
  }
  return gltfMat;
}

/** Map joint keyword to URDF joint type */
function jointKeywordToURDF(keyword: string): string {
  switch (keyword) {
    case 'hinge': return 'revolute';
    case 'slider':
    case 'prismatic': return 'prismatic';
    case 'ball_socket': return 'ball';
    case 'fixed_joint': return 'fixed';
    case 'd6_joint': return 'floating';
    case 'spring_joint': return 'revolute'; // closest URDF equivalent
    default: return 'fixed';
  }
}

/** Generate URDF collider as collision element */
function colliderToURDF(collider: CompiledCollider): string {
  const shape = collider.shape || 'box';
  const props = collider.properties;
  const lines = ['  <collision>'];

  switch (shape) {
    case 'sphere':
      lines.push(`    <geometry><sphere radius="${props.radius || 0.5}"/></geometry>`);
      break;
    case 'capsule':
      lines.push(`    <geometry><cylinder radius="${props.radius || 0.5}" length="${props.height || 1.0}"/></geometry>`);
      break;
    case 'box':
    default: {
      const size = Array.isArray(props.size) ? props.size.join(' ') : '1 1 1';
      lines.push(`    <geometry><box size="${size}"/></geometry>`);
      break;
    }
  }

  lines.push('  </collision>');
  return lines.join('\n');
}

/** Generate URDF inertial element from rigidbody */
function rigidbodyToURDF(rb: CompiledRigidbody): string {
  const mass = rb.properties.mass ?? 1.0;
  return [
    '  <inertial>',
    `    <mass value="${mass}"/>`,
    rb.properties.inertia
      ? `    <inertia ixx="${rb.properties.inertia[0] || 0}" iyy="${rb.properties.inertia[1] || 0}" izz="${rb.properties.inertia[2] || 0}" ixy="0" ixz="0" iyz="0"/>`
      : `    <inertia ixx="0.01" iyy="0.01" izz="0.01" ixy="0" ixz="0" iyz="0"/>`,
    '  </inertial>',
  ].join('\n');
}

/** Generate URDF physics joint */
export function physicsToURDF(physics: CompiledPhysics): string {
  const parts: string[] = [];

  // Articulation with joint sub-blocks
  if (physics.keyword === 'articulation') {
    const joints = (physics.joints || []).map(j => {
      const props = j.properties;
      return [
        `  <joint name="${j.name}" type="${jointKeywordToURDF(j.keyword)}">`,
        props.axis ? `    <axis xyz="${Array.isArray(props.axis) ? props.axis.join(' ') : '0 0 1'}"/>` : '',
        props.limits ? `    <limit lower="${props.limits[0]}" upper="${props.limits[1]}"/>` : '',
        props.damping ? `    <dynamics damping="${props.damping}"/>` : '',
        `  </joint>`,
      ].filter(Boolean).join('\n');
    });
    parts.push(...joints);
  }

  // Collider sub-blocks -> URDF collision elements
  if (physics.colliders) {
    for (const collider of physics.colliders) {
      parts.push(colliderToURDF(collider));
    }
  }

  // Rigidbody sub-block -> URDF inertial element
  if (physics.rigidbody) {
    parts.push(rigidbodyToURDF(physics.rigidbody));
  }

  // Force fields -> URDF comments (no direct URDF equivalent)
  if (physics.forceFields) {
    for (const ff of physics.forceFields) {
      parts.push(`  <!-- ${ff.keyword} "${ff.name || ''}" strength="${ff.properties.strength || 0}" -->`);
    }
  }

  if (parts.length > 0) return parts.join('\n');
  return `<!-- ${physics.keyword} ${physics.name || ''} -->`;
}

// =============================================================================
// Domain Block Router
// =============================================================================

export type DomainCompileFn = (block: HoloDomainBlock) => string;

/** Route domain blocks to appropriate compilation function */
export function compileDomainBlocks(
  blocks: HoloDomainBlock[],
  handlers: Partial<Record<HoloDomainType, DomainCompileFn>>,
  fallback?: DomainCompileFn,
): string[] {
  return blocks.map(block => {
    const handler = handlers[block.domain];
    if (handler) return handler(block);
    if (fallback) return fallback(block);
    return `/* Unhandled domain block: ${block.domain}/${block.keyword} "${block.name}" */`;
  });
}

// =============================================================================
// Utility Helpers
// =============================================================================

function hexToRGB(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16) / 255;
  const g = parseInt(h.substring(2, 4), 16) / 255;
  const b = parseInt(h.substring(4, 6), 16) / 255;
  return `${r.toFixed(3)}, ${g.toFixed(3)}, ${b.toFixed(3)}`;
}

function hexToRGBA(hex: string, alpha: number): number[] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.substring(0, 2), 16) / 255,
    parseInt(h.substring(2, 4), 16) / 255,
    parseInt(h.substring(4, 6), 16) / 255,
    alpha,
  ];
}
