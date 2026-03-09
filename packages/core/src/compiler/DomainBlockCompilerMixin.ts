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

import type { HoloDomainBlock, HoloDomainType } from '../parser/HoloCompositionTypes';
import { ANSCapabilityPath, type ANSCapabilityPathValue } from './identity/ANSNamespace';

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
  const type =
    block.keyword === 'unlit_material' ? 'unlit' : block.keyword === 'shader' ? 'shader' : 'pbr';

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

  for (const child of block.children || []) {
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
    } else if (
      [
        'force_field',
        'gravity_zone',
        'wind_zone',
        'buoyancy_zone',
        'magnetic_field',
        'drag_zone',
      ].includes(kw)
    ) {
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

  for (const child of block.children || []) {
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

  for (const child of block.children || []) {
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

  for (const child of block.children || []) {
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

  const modulesJSX = ps.modules
    .map((m) => {
      const mProps = Object.entries(m.properties)
        .map(([k, v]) => {
          const camel = k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
          return typeof v === 'string' ? `${camel}="${v}"` : `${camel}={${JSON.stringify(v)}}`;
        })
        .join(' ');
      return `  <${m.type} ${mProps} />`;
    })
    .join('\n');

  return [`<ParticleSystem name="${ps.name}" ${props.join(' ')}>`, modulesJSX, '</ParticleSystem>']
    .filter(Boolean)
    .join('\n');
}

/** Generate R3F/Three.js post-processing JSX (react-postprocessing) */
export function postProcessingToR3F(pp: CompiledPostProcessing): string {
  const effectsJSX = pp.effects
    .map((e) => {
      const componentName = e.type
        .split('_')
        .map((w) => w[0].toUpperCase() + w.slice(1))
        .join('');
      const props = Object.entries(e.properties)
        .map(([k, v]) => {
          const camel = k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
          return typeof v === 'string' ? `${camel}="${v}"` : `${camel}={${JSON.stringify(v)}}`;
        })
        .join(' ');
      return `  <${componentName} ${props} />`;
    })
    .join('\n');

  return ['<EffectComposer>', effectsJSX, '</EffectComposer>'].join('\n');
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
  const lines: string[] = [`def Scope "${weather.name || 'Weather'}" {`];

  for (const [key, value] of Object.entries(weather.properties)) {
    lines.push(
      `    custom ${typeof value === 'number' ? 'float' : 'string'} ${key} = ${JSON.stringify(value)}`
    );
  }

  for (const layer of weather.layers) {
    lines.push(`    def Scope "${layer.type}" {`);
    for (const [key, value] of Object.entries(layer.properties)) {
      const usdType =
        typeof value === 'number'
          ? 'float'
          : typeof value === 'boolean'
            ? 'bool'
            : Array.isArray(value)
              ? 'float3'
              : 'string';
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
    ]
      .filter(Boolean)
      .join(' ');
    return `<meshBasicMaterial ${props} />`;
  }

  const props = [
    mat.baseColor ? `color="${mat.baseColor}"` : '',
    mat.roughness !== undefined ? `roughness={${mat.roughness}}` : '',
    mat.metallic !== undefined ? `metalness={${mat.metallic}}` : '',
    mat.opacity !== undefined ? `opacity={${mat.opacity}} transparent` : '',
    mat.emissiveColor ? `emissive="${mat.emissiveColor}"` : '',
    mat.emissiveIntensity ? `emissiveIntensity={${mat.emissiveIntensity}}` : '',
  ]
    .filter(Boolean)
    .join(' ');

  const textures = Object.entries(mat.textureMaps)
    .map(([type, path]) => {
      const propName = type.replace(/_map$/, 'Map').replace(/^albedo/, '');
      return `${propName}={useTexture("${path}")}`;
    })
    .join(' ');

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
  if (mat.baseColor)
    lines.push(`        color3f inputs:diffuseColor = (${hexToRGB(mat.baseColor)})`);
  if (mat.roughness !== undefined) lines.push(`        float inputs:roughness = ${mat.roughness}`);
  if (mat.metallic !== undefined) lines.push(`        float inputs:metallic = ${mat.metallic}`);
  if (mat.opacity !== undefined) lines.push(`        float inputs:opacity = ${mat.opacity}`);
  if (mat.ior !== undefined) lines.push(`        float inputs:ior = ${mat.ior}`);

  // Emissive — scale color by intensity since USD has no separate intensity input
  if (mat.emissiveColor) {
    const rgb = hexToRGB(mat.emissiveColor).split(', ').map(Number);
    const intensity = mat.emissiveIntensity ?? 1;
    const scaled = rgb.map((c) => Math.min(1, c * intensity));
    lines.push(`        color3f inputs:emissiveColor = (${scaled.join(', ')})`);
  }

  lines.push(`        token outputs:surface`);
  lines.push(`    }`);

  // Texture reader nodes
  const texEntries = Object.entries(mat.textureMaps);
  if (texEntries.length > 0) {
    const TEX_MAP: Record<string, { input: string; type: string }> = {
      albedo_map: { input: 'diffuseColor', type: 'rgb' },
      normal_map: { input: 'normal', type: 'rgb' },
      roughness_map: { input: 'roughness', type: 'r' },
      metallic_map: { input: 'metallic', type: 'r' },
      ao_map: { input: 'occlusion', type: 'r' },
      emission_map: { input: 'emissiveColor', type: 'rgb' },
      displacement_map: { input: 'displacement', type: 'r' },
    };

    lines.push(`    def Shader "stReader" {`);
    lines.push(`        uniform token info:id = "UsdPrimvarReader_float2"`);
    lines.push(`        token inputs:varname = "st"`);
    lines.push(`        float2 outputs:result`);
    lines.push(`    }`);

    for (const [channel, path] of texEntries) {
      const mapping = TEX_MAP[channel];
      if (!mapping) continue;
      const readerName = `${mapping.input}Texture`;
      lines.push(`    def Shader "${readerName}" {`);
      lines.push(`        uniform token info:id = "UsdUVTexture"`);
      lines.push(`        asset inputs:file = @textures/${path}@`);
      lines.push(`        float2 inputs:st.connect = <${mat.name}/stReader.outputs:result>`);
      if (mapping.type === 'rgb') {
        lines.push(`        color3f outputs:rgb`);
      } else {
        lines.push(`        float outputs:r`);
      }
      lines.push(`    }`);
    }
  }

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
    case 'hinge':
      return 'revolute';
    case 'slider':
    case 'prismatic':
      return 'prismatic';
    case 'ball_socket':
      return 'ball';
    case 'fixed_joint':
      return 'fixed';
    case 'd6_joint':
      return 'floating';
    case 'spring_joint':
      return 'revolute'; // closest URDF equivalent
    default:
      return 'fixed';
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
      lines.push(
        `    <geometry><cylinder radius="${props.radius || 0.5}" length="${props.height || 1.0}"/></geometry>`
      );
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
    const joints = (physics.joints || []).map((j) => {
      const props = j.properties;
      return [
        `  <joint name="${j.name}" type="${jointKeywordToURDF(j.keyword)}">`,
        props.axis
          ? `    <axis xyz="${Array.isArray(props.axis) ? props.axis.join(' ') : '0 0 1'}"/>`
          : '',
        props.limits ? `    <limit lower="${props.limits[0]}" upper="${props.limits[1]}"/>` : '',
        props.damping ? `    <dynamics damping="${props.damping}"/>` : '',
        `  </joint>`,
      ]
        .filter(Boolean)
        .join('\n');
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
      parts.push(
        `  <!-- ${ff.keyword} "${ff.name || ''}" strength="${ff.properties.strength || 0}" -->`
      );
    }
  }

  if (parts.length > 0) return parts.join('\n');
  return `<!-- ${physics.keyword} ${physics.name || ''} -->`;
}

// =============================================================================
// Unity (C#) Target Helpers
// =============================================================================

/** Generate Unity C# material setup code */
export function materialToUnity(mat: CompiledMaterial, varPrefix: string): string {
  const lines: string[] = [];
  lines.push(`// Material: ${mat.name}`);
  lines.push(
    `var ${varPrefix}Mat = new Material(Shader.Find("${mat.type === 'unlit' ? 'Unlit/Color' : 'Standard'}"));`
  );
  if (mat.baseColor) lines.push(`${varPrefix}Mat.color = ${hexToUnityColor(mat.baseColor)};`);
  if (mat.roughness !== undefined)
    lines.push(`${varPrefix}Mat.SetFloat("_Smoothness", ${(1 - mat.roughness).toFixed(3)}f);`);
  if (mat.metallic !== undefined)
    lines.push(`${varPrefix}Mat.SetFloat("_Metallic", ${mat.metallic}f);`);
  if (mat.opacity !== undefined && mat.opacity < 1) {
    lines.push(`${varPrefix}Mat.SetFloat("_Mode", 3); // Transparent`);
    lines.push(
      `${varPrefix}Mat.color = new Color(${varPrefix}Mat.color.r, ${varPrefix}Mat.color.g, ${varPrefix}Mat.color.b, ${mat.opacity}f);`
    );
  }
  if (mat.emissiveColor) {
    lines.push(`${varPrefix}Mat.EnableKeyword("_EMISSION");`);
    lines.push(
      `${varPrefix}Mat.SetColor("_EmissionColor", ${hexToUnityColor(mat.emissiveColor)}${mat.emissiveIntensity ? ` * ${mat.emissiveIntensity}f` : ''});`
    );
  }
  for (const [mapType, path] of Object.entries(mat.textureMaps)) {
    const shaderProp =
      mapType === 'albedo_map'
        ? '_MainTex'
        : mapType === 'normal_map'
          ? '_BumpMap'
          : mapType === 'metallic_map'
            ? '_MetallicGlossMap'
            : mapType === 'roughness_map'
              ? '_SpecGlossMap'
              : mapType === 'emission_map'
                ? '_EmissionMap'
                : mapType === 'occlusion_map'
                  ? '_OcclusionMap'
                  : `_${mapType.replace(/_map$/, '')}`;
    lines.push(
      `${varPrefix}Mat.SetTexture("${shaderProp}", Resources.Load<Texture2D>("${path}"));`
    );
  }
  return lines.join('\n');
}

/** Generate Unity C# physics setup code */
export function physicsToUnity(physics: CompiledPhysics, varPrefix: string): string {
  const lines: string[] = [];
  lines.push(`// Physics: ${physics.keyword} "${physics.name || ''}"`);

  if (physics.rigidbody) {
    lines.push(`var ${varPrefix}RB = ${varPrefix}GO.AddComponent<Rigidbody>();`);
    const rb = physics.rigidbody.properties;
    if (rb.mass !== undefined) lines.push(`${varPrefix}RB.mass = ${rb.mass}f;`);
    if (rb.drag !== undefined) lines.push(`${varPrefix}RB.drag = ${rb.drag}f;`);
    if (rb.angular_damping !== undefined)
      lines.push(`${varPrefix}RB.angularDrag = ${rb.angular_damping}f;`);
    if (rb.use_gravity === false) lines.push(`${varPrefix}RB.useGravity = false;`);
  }

  if (physics.colliders) {
    for (let i = 0; i < physics.colliders.length; i++) {
      const c = physics.colliders[i];
      const shape = c.shape || 'box';
      const colVar = `${varPrefix}Col${i}`;
      if (shape === 'sphere') {
        lines.push(`var ${colVar} = ${varPrefix}GO.AddComponent<SphereCollider>();`);
        if (c.properties.radius) lines.push(`${colVar}.radius = ${c.properties.radius}f;`);
      } else if (shape === 'capsule') {
        lines.push(`var ${colVar} = ${varPrefix}GO.AddComponent<CapsuleCollider>();`);
        if (c.properties.radius) lines.push(`${colVar}.radius = ${c.properties.radius}f;`);
        if (c.properties.height) lines.push(`${colVar}.height = ${c.properties.height}f;`);
      } else {
        lines.push(`var ${colVar} = ${varPrefix}GO.AddComponent<BoxCollider>();`);
        if (c.properties.size && Array.isArray(c.properties.size)) {
          lines.push(`${colVar}.size = new Vector3(${c.properties.size.join('f, ')}f);`);
        }
      }
      if (c.type === 'trigger') lines.push(`${colVar}.isTrigger = true;`);
    }
  }

  if (physics.forceFields) {
    for (const ff of physics.forceFields) {
      if (ff.keyword === 'wind_zone') {
        lines.push(`var ${varPrefix}Wind = ${varPrefix}GO.AddComponent<WindZone>();`);
        if (ff.properties.strength)
          lines.push(`${varPrefix}Wind.windMain = ${ff.properties.strength}f;`);
      } else {
        lines.push(`// ${ff.keyword} "${ff.name || ''}": ${JSON.stringify(ff.properties)}`);
      }
    }
  }

  if (physics.joints) {
    for (const j of physics.joints) {
      lines.push(`// Joint: ${j.keyword} "${j.name || ''}" — use ConfigurableJoint or HingeJoint`);
    }
  }

  return lines.join('\n');
}

/** Generate Unity C# particle system setup code */
export function particlesToUnity(ps: CompiledParticleSystem, varPrefix: string): string {
  const lines: string[] = [];
  lines.push(`// Particles: ${ps.name}`);
  lines.push(`var ${varPrefix}PS = ${varPrefix}GO.AddComponent<ParticleSystem>();`);
  lines.push(`var ${varPrefix}Main = ${varPrefix}PS.main;`);
  if (ps.properties.max_particles)
    lines.push(`${varPrefix}Main.maxParticles = ${ps.properties.max_particles};`);
  if (ps.properties.start_lifetime) {
    const lt = ps.properties.start_lifetime;
    lines.push(`${varPrefix}Main.startLifetime = ${Array.isArray(lt) ? lt[0] : lt}f;`);
  }
  if (ps.properties.start_speed) {
    const sp = ps.properties.start_speed;
    lines.push(`${varPrefix}Main.startSpeed = ${Array.isArray(sp) ? sp[0] : sp}f;`);
  }
  if (ps.properties.gravity_modifier !== undefined) {
    lines.push(`${varPrefix}Main.gravityModifier = ${ps.properties.gravity_modifier}f;`);
  }
  if (ps.traits.includes('looping')) lines.push(`${varPrefix}Main.loop = true;`);

  for (const m of ps.modules) {
    lines.push(`// Module: ${m.type} — ${JSON.stringify(m.properties)}`);
  }
  return lines.join('\n');
}

/** Generate Unity C# post-processing setup code */
export function postProcessingToUnity(pp: CompiledPostProcessing): string {
  const lines: string[] = [];
  lines.push('// Post-Processing (URP Volume Profile)');
  for (const e of pp.effects) {
    const className = e.type
      .split('_')
      .map((w) => w[0].toUpperCase() + w.slice(1))
      .join('');
    lines.push(`// Effect: ${className}`);
    for (const [k, v] of Object.entries(e.properties)) {
      lines.push(`//   ${k} = ${JSON.stringify(v)}`);
    }
  }
  return lines.join('\n');
}

/** Generate Unity C# audio source setup code */
export function audioSourceToUnity(audio: CompiledAudioSource, varPrefix: string): string {
  const lines: string[] = [];
  lines.push(`// Audio: ${audio.name} (${audio.keyword})`);
  if (audio.keyword === 'reverb_zone') {
    lines.push(`var ${varPrefix}Reverb = ${varPrefix}GO.AddComponent<AudioReverbZone>();`);
    if (audio.properties.min_distance)
      lines.push(`${varPrefix}Reverb.minDistance = ${audio.properties.min_distance}f;`);
    if (audio.properties.max_distance)
      lines.push(`${varPrefix}Reverb.maxDistance = ${audio.properties.max_distance}f;`);
  } else {
    lines.push(`var ${varPrefix}AS = ${varPrefix}GO.AddComponent<AudioSource>();`);
    if (audio.properties.clip)
      lines.push(
        `${varPrefix}AS.clip = Resources.Load<AudioClip>("Audio/${audio.properties.clip}");`
      );
    if (audio.properties.volume !== undefined)
      lines.push(`${varPrefix}AS.volume = ${audio.properties.volume}f;`);
    if (audio.properties.loop !== undefined)
      lines.push(`${varPrefix}AS.loop = ${audio.properties.loop};`);
    if (audio.properties.spatial_blend !== undefined)
      lines.push(`${varPrefix}AS.spatialBlend = ${audio.properties.spatial_blend}f;`);
    if (audio.properties.max_distance)
      lines.push(`${varPrefix}AS.maxDistance = ${audio.properties.max_distance}f;`);
    if (audio.traits.includes('spatial') || audio.traits.includes('hrtf')) {
      lines.push(`${varPrefix}AS.spatialBlend = 1.0f;`);
    }
    if (audio.properties.play_on_awake) lines.push(`${varPrefix}AS.playOnAwake = true;`);
  }
  return lines.join('\n');
}

/** Generate Unity C# weather setup code */
export function weatherToUnity(weather: CompiledWeather): string {
  const lines: string[] = [];
  lines.push(`// Weather: ${weather.keyword} "${weather.name || ''}"`);
  for (const layer of weather.layers) {
    lines.push(`// Layer: ${layer.type} — ${JSON.stringify(layer.properties)}`);
  }
  if (weather.properties.intensity !== undefined) {
    lines.push(`// Intensity: ${weather.properties.intensity}`);
  }
  return lines.join('\n');
}

// =============================================================================
// Unreal Engine (C++) Target Helpers
// =============================================================================

/** Generate Unreal C++ material setup code */
export function materialToUnreal(mat: CompiledMaterial, varPrefix: string): string {
  const lines: string[] = [];
  lines.push(`// Material: ${mat.name}`);
  lines.push(`UMaterialInstanceDynamic* ${varPrefix}Mat = UMaterialInstanceDynamic::Create(`);
  lines.push(
    `    LoadObject<UMaterial>(nullptr, TEXT("/Game/Materials/M_${mat.type === 'unlit' ? 'Unlit' : 'PBR'}")), this);`
  );
  if (mat.baseColor) {
    const [r, g, b] = hexToRGBTuple(mat.baseColor);
    lines.push(
      `${varPrefix}Mat->SetVectorParameterValue(TEXT("BaseColor"), FLinearColor(${r}f, ${g}f, ${b}f));`
    );
  }
  if (mat.roughness !== undefined)
    lines.push(`${varPrefix}Mat->SetScalarParameterValue(TEXT("Roughness"), ${mat.roughness}f);`);
  if (mat.metallic !== undefined)
    lines.push(`${varPrefix}Mat->SetScalarParameterValue(TEXT("Metallic"), ${mat.metallic}f);`);
  if (mat.opacity !== undefined)
    lines.push(`${varPrefix}Mat->SetScalarParameterValue(TEXT("Opacity"), ${mat.opacity}f);`);
  if (mat.emissiveColor) {
    const [r, g, b] = hexToRGBTuple(mat.emissiveColor);
    const intensity = mat.emissiveIntensity ?? 1;
    lines.push(
      `${varPrefix}Mat->SetVectorParameterValue(TEXT("EmissiveColor"), FLinearColor(${r * intensity}f, ${g * intensity}f, ${b * intensity}f));`
    );
  }
  for (const [mapType, path] of Object.entries(mat.textureMaps)) {
    lines.push(
      `${varPrefix}Mat->SetTextureParameterValue(TEXT("${mapType}"), LoadObject<UTexture2D>(nullptr, TEXT("/Game/Textures/${path}")));`
    );
  }
  return lines.join('\n');
}

/** Generate Unreal C++ physics setup code */
export function physicsToUnreal(physics: CompiledPhysics, varPrefix: string): string {
  const lines: string[] = [];
  lines.push(`// Physics: ${physics.keyword} "${physics.name || ''}"`);

  if (physics.rigidbody) {
    const rb = physics.rigidbody.properties;
    lines.push(`${varPrefix}Mesh->SetSimulatePhysics(true);`);
    if (rb.mass !== undefined)
      lines.push(`${varPrefix}Mesh->SetMassOverrideInKg(NAME_None, ${rb.mass}f);`);
    if (rb.drag !== undefined) lines.push(`${varPrefix}Mesh->SetLinearDamping(${rb.drag}f);`);
    if (rb.angular_damping !== undefined)
      lines.push(`${varPrefix}Mesh->SetAngularDamping(${rb.angular_damping}f);`);
    if (rb.use_gravity === false) lines.push(`${varPrefix}Mesh->SetEnableGravity(false);`);
  }

  if (physics.colliders) {
    for (const c of physics.colliders) {
      const shape = c.shape || 'box';
      if (shape === 'sphere') {
        lines.push(
          `auto* ${varPrefix}Sphere = CreateDefaultSubobject<USphereComponent>(TEXT("${varPrefix}Sphere"));`
        );
        if (c.properties.radius)
          lines.push(`${varPrefix}Sphere->SetSphereRadius(${c.properties.radius}f);`);
      } else if (shape === 'capsule') {
        lines.push(
          `auto* ${varPrefix}Capsule = CreateDefaultSubobject<UCapsuleComponent>(TEXT("${varPrefix}Capsule"));`
        );
      } else {
        lines.push(
          `auto* ${varPrefix}Box = CreateDefaultSubobject<UBoxComponent>(TEXT("${varPrefix}Box"));`
        );
      }
    }
  }

  if (physics.forceFields) {
    for (const ff of physics.forceFields) {
      lines.push(
        `// Force field: ${ff.keyword} "${ff.name || ''}" — ${JSON.stringify(ff.properties)}`
      );
    }
  }

  if (physics.joints) {
    for (const j of physics.joints) {
      lines.push(
        `auto* ${varPrefix}Constraint = CreateDefaultSubobject<UPhysicsConstraintComponent>(TEXT("${j.name || varPrefix + 'Joint'}"));`
      );
      lines.push(`// Joint type: ${j.keyword} — configure constraint limits`);
    }
  }

  return lines.join('\n');
}

/** Generate Unreal C++ Niagara particle system code */
export function particlesToUnreal(ps: CompiledParticleSystem, varPrefix: string): string {
  const lines: string[] = [];
  lines.push(`// Niagara Particles: ${ps.name}`);
  lines.push(
    `auto* ${varPrefix}Niagara = CreateDefaultSubobject<UNiagaraComponent>(TEXT("${ps.name}"));`
  );
  lines.push(`${varPrefix}Niagara->SetupAttachment(RootComponent);`);
  if (ps.properties.rate)
    lines.push(`${varPrefix}Niagara->SetVariableFloat(TEXT("SpawnRate"), ${ps.properties.rate}f);`);
  if (ps.properties.start_lifetime)
    lines.push(
      `${varPrefix}Niagara->SetVariableFloat(TEXT("Lifetime"), ${Array.isArray(ps.properties.start_lifetime) ? ps.properties.start_lifetime[0] : ps.properties.start_lifetime}f);`
    );
  if (ps.traits.includes('looping'))
    lines.push(`${varPrefix}Niagara->SetVariableBool(TEXT("Looping"), true);`);
  for (const m of ps.modules) {
    lines.push(`// Module: ${m.type} — ${JSON.stringify(m.properties)}`);
  }
  return lines.join('\n');
}

/** Generate Unreal C++ post-processing setup code */
export function postProcessingToUnreal(pp: CompiledPostProcessing, varPrefix: string): string {
  const lines: string[] = [];
  lines.push(`// Post-Processing: ${pp.keyword}`);
  lines.push(
    `auto* ${varPrefix}PP = CreateDefaultSubobject<UPostProcessComponent>(TEXT("PostProcess"));`
  );
  lines.push(`${varPrefix}PP->SetupAttachment(RootComponent);`);
  for (const e of pp.effects) {
    if (e.type === 'bloom') {
      lines.push(`${varPrefix}PP->Settings.bOverride_BloomIntensity = true;`);
      if (e.properties.intensity)
        lines.push(`${varPrefix}PP->Settings.BloomIntensity = ${e.properties.intensity}f;`);
      if (e.properties.threshold)
        lines.push(`${varPrefix}PP->Settings.BloomThreshold = ${e.properties.threshold}f;`);
    } else if (e.type === 'depth_of_field') {
      lines.push(`${varPrefix}PP->Settings.bOverride_DepthOfFieldFocalDistance = true;`);
      if (e.properties.focal_distance)
        lines.push(
          `${varPrefix}PP->Settings.DepthOfFieldFocalDistance = ${e.properties.focal_distance}f;`
        );
    } else {
      lines.push(`// Effect: ${e.type} — ${JSON.stringify(e.properties)}`);
    }
  }
  return lines.join('\n');
}

/** Generate Unreal C++ audio component code */
export function audioSourceToUnreal(audio: CompiledAudioSource, varPrefix: string): string {
  const lines: string[] = [];
  lines.push(`// Audio: ${audio.name} (${audio.keyword})`);
  lines.push(
    `auto* ${varPrefix}Audio = CreateDefaultSubobject<UAudioComponent>(TEXT("${audio.name}"));`
  );
  lines.push(`${varPrefix}Audio->SetupAttachment(RootComponent);`);
  if (audio.properties.clip)
    lines.push(
      `${varPrefix}Audio->SetSound(LoadObject<USoundWave>(nullptr, TEXT("/Game/Audio/${audio.properties.clip}")));`
    );
  if (audio.properties.volume !== undefined)
    lines.push(`${varPrefix}Audio->SetVolumeMultiplier(${audio.properties.volume}f);`);
  if (audio.properties.loop !== undefined)
    lines.push(`${varPrefix}Audio->bIsLooping = ${audio.properties.loop ? 'true' : 'false'};`);
  if (audio.traits.includes('spatial') || audio.properties.spatial_blend > 0) {
    lines.push(`${varPrefix}Audio->bOverrideAttenuation = true;`);
    if (audio.properties.max_distance)
      lines.push(
        `${varPrefix}Audio->AttenuationOverrides.FalloffDistance = ${audio.properties.max_distance}f;`
      );
  }
  if (audio.properties.play_on_awake) lines.push(`${varPrefix}Audio->bAutoActivate = true;`);
  return lines.join('\n');
}

/** Generate Unreal weather/atmosphere comment block */
export function weatherToUnreal(weather: CompiledWeather): string {
  const lines: string[] = [];
  lines.push(`// Weather: ${weather.keyword} "${weather.name || ''}"`);
  lines.push('// Use UltraDynamicSky or custom weather system');
  for (const layer of weather.layers) {
    lines.push(`// Layer: ${layer.type} — ${JSON.stringify(layer.properties)}`);
  }
  return lines.join('\n');
}

// =============================================================================
// Godot (GDScript) Target Helpers
// =============================================================================

/** Generate Godot GDScript material setup code */
export function materialToGodot(mat: CompiledMaterial, varPrefix: string): string {
  const lines: string[] = [];
  lines.push(`# Material: ${mat.name}`);
  if (mat.type === 'unlit') {
    lines.push(`var ${varPrefix}_mat = StandardMaterial3D.new()`);
    lines.push(`${varPrefix}_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED`);
  } else {
    lines.push(`var ${varPrefix}_mat = StandardMaterial3D.new()`);
  }
  if (mat.baseColor) lines.push(`${varPrefix}_mat.albedo_color = Color.html("${mat.baseColor}")`);
  if (mat.roughness !== undefined) lines.push(`${varPrefix}_mat.roughness = ${mat.roughness}`);
  if (mat.metallic !== undefined) lines.push(`${varPrefix}_mat.metallic = ${mat.metallic}`);
  if (mat.opacity !== undefined && mat.opacity < 1) {
    lines.push(`${varPrefix}_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA`);
    lines.push(`${varPrefix}_mat.albedo_color.a = ${mat.opacity}`);
  }
  if (mat.emissiveColor) {
    lines.push(`${varPrefix}_mat.emission_enabled = true`);
    lines.push(`${varPrefix}_mat.emission = Color.html("${mat.emissiveColor}")`);
    if (mat.emissiveIntensity)
      lines.push(`${varPrefix}_mat.emission_energy_multiplier = ${mat.emissiveIntensity}`);
  }
  for (const [mapType, path] of Object.entries(mat.textureMaps)) {
    const prop =
      mapType === 'albedo_map'
        ? 'albedo_texture'
        : mapType === 'normal_map'
          ? 'normal_texture'
          : mapType === 'metallic_map'
            ? 'metallic_texture'
            : mapType === 'roughness_map'
              ? 'roughness_texture'
              : mapType === 'emission_map'
                ? 'emission_texture'
                : `${mapType.replace(/_map$/, '_texture')}`;
    lines.push(`${varPrefix}_mat.${prop} = load("res://${path}")`);
  }
  return lines.join('\n');
}

/** Generate Godot GDScript physics setup code */
export function physicsToGodot(physics: CompiledPhysics, varPrefix: string): string {
  const lines: string[] = [];
  lines.push(`# Physics: ${physics.keyword} "${physics.name || ''}"`);

  if (physics.rigidbody) {
    const rb = physics.rigidbody.properties;
    lines.push(`var ${varPrefix}_rb = RigidBody3D.new()`);
    if (rb.mass !== undefined) lines.push(`${varPrefix}_rb.mass = ${rb.mass}`);
    if (rb.drag !== undefined) lines.push(`${varPrefix}_rb.linear_damp = ${rb.drag}`);
    if (rb.angular_damping !== undefined)
      lines.push(`${varPrefix}_rb.angular_damp = ${rb.angular_damping}`);
    if (rb.use_gravity === false) lines.push(`${varPrefix}_rb.gravity_scale = 0.0`);
  }

  if (physics.colliders) {
    for (let i = 0; i < physics.colliders.length; i++) {
      const c = physics.colliders[i];
      const shape = c.shape || 'box';
      if (shape === 'sphere') {
        lines.push(`var ${varPrefix}_col${i} = CollisionShape3D.new()`);
        lines.push(`${varPrefix}_col${i}.shape = SphereShape3D.new()`);
        if (c.properties.radius)
          lines.push(`${varPrefix}_col${i}.shape.radius = ${c.properties.radius}`);
      } else if (shape === 'capsule') {
        lines.push(`var ${varPrefix}_col${i} = CollisionShape3D.new()`);
        lines.push(`${varPrefix}_col${i}.shape = CapsuleShape3D.new()`);
      } else {
        lines.push(`var ${varPrefix}_col${i} = CollisionShape3D.new()`);
        lines.push(`${varPrefix}_col${i}.shape = BoxShape3D.new()`);
      }
    }
  }

  if (physics.forceFields) {
    for (const ff of physics.forceFields) {
      lines.push(
        `# Force field: ${ff.keyword} "${ff.name || ''}" — ${JSON.stringify(ff.properties)}`
      );
    }
  }

  if (physics.joints) {
    for (const j of physics.joints) {
      const jointType =
        j.keyword === 'hinge'
          ? 'HingeJoint3D'
          : j.keyword === 'slider'
            ? 'SliderJoint3D'
            : 'Generic6DOFJoint3D';
      lines.push(`var ${varPrefix}_joint = ${jointType}.new()`);
      lines.push(`# Joint: ${j.keyword} "${j.name || ''}" — ${JSON.stringify(j.properties)}`);
    }
  }

  return lines.join('\n');
}

/** Generate Godot GDScript particle system code */
export function particlesToGodot(ps: CompiledParticleSystem, varPrefix: string): string {
  const lines: string[] = [];
  lines.push(`# Particles: ${ps.name}`);
  lines.push(`var ${varPrefix}_particles = GPUParticles3D.new()`);
  lines.push(`${varPrefix}_particles.name = "${ps.name}"`);
  if (ps.properties.max_particles)
    lines.push(`${varPrefix}_particles.amount = ${ps.properties.max_particles}`);
  if (ps.properties.start_lifetime) {
    const lt = Array.isArray(ps.properties.start_lifetime)
      ? ps.properties.start_lifetime[0]
      : ps.properties.start_lifetime;
    lines.push(`${varPrefix}_particles.lifetime = ${lt}`);
  }
  if (ps.traits.includes('looping')) lines.push(`${varPrefix}_particles.one_shot = false`);
  else lines.push(`${varPrefix}_particles.one_shot = true`);
  for (const m of ps.modules) {
    lines.push(`# Module: ${m.type} — ${JSON.stringify(m.properties)}`);
  }
  return lines.join('\n');
}

/** Generate Godot GDScript post-processing code */
export function postProcessingToGodot(pp: CompiledPostProcessing): string {
  const lines: string[] = [];
  lines.push(`# Post-Processing: ${pp.keyword} (use WorldEnvironment)`);
  lines.push('var env = WorldEnvironment.new()');
  lines.push('var environment = Environment.new()');
  for (const e of pp.effects) {
    if (e.type === 'bloom' || e.type === 'glow') {
      lines.push('environment.glow_enabled = true');
      if (e.properties.intensity)
        lines.push(`environment.glow_intensity = ${e.properties.intensity}`);
      if (e.properties.threshold) lines.push(`environment.glow_bloom = ${e.properties.threshold}`);
    } else if (e.type === 'fog') {
      lines.push('environment.fog_enabled = true');
      if (e.properties.density) lines.push(`environment.fog_density = ${e.properties.density}`);
    } else {
      lines.push(`# Effect: ${e.type} — ${JSON.stringify(e.properties)}`);
    }
  }
  lines.push('env.environment = environment');
  return lines.join('\n');
}

/** Generate Godot GDScript audio source code */
export function audioSourceToGodot(audio: CompiledAudioSource, varPrefix: string): string {
  const lines: string[] = [];
  lines.push(`# Audio: ${audio.name} (${audio.keyword})`);
  const isSpatial = audio.traits.includes('spatial') || audio.properties.spatial_blend > 0;
  const nodeType = isSpatial ? 'AudioStreamPlayer3D' : 'AudioStreamPlayer';
  lines.push(`var ${varPrefix}_audio = ${nodeType}.new()`);
  lines.push(`${varPrefix}_audio.name = "${audio.name}"`);
  if (audio.properties.clip)
    lines.push(`${varPrefix}_audio.stream = load("res://${audio.properties.clip}")`);
  if (audio.properties.volume !== undefined)
    lines.push(`${varPrefix}_audio.volume_db = linear_to_db(${audio.properties.volume})`);
  if (isSpatial && audio.properties.max_distance) {
    lines.push(`${varPrefix}_audio.max_distance = ${audio.properties.max_distance}`);
  }
  if (audio.properties.play_on_awake) lines.push(`${varPrefix}_audio.autoplay = true`);
  return lines.join('\n');
}

/** Generate Godot weather comment block */
export function weatherToGodot(weather: CompiledWeather): string {
  const lines: string[] = [];
  lines.push(`# Weather: ${weather.keyword} "${weather.name || ''}"`);
  for (const layer of weather.layers) {
    lines.push(`# Layer: ${layer.type} — ${JSON.stringify(layer.properties)}`);
  }
  return lines.join('\n');
}

// =============================================================================
// VisionOS (Swift / RealityKit) Target Helpers
// =============================================================================

/** Generate VisionOS Swift material setup code */
export function materialToVisionOS(mat: CompiledMaterial, varPrefix: string): string {
  const lines: string[] = [];
  lines.push(`// Material: ${mat.name}`);
  if (mat.type === 'unlit') {
    lines.push(`var ${varPrefix}Mat = UnlitMaterial()`);
    if (mat.baseColor)
      lines.push(`${varPrefix}Mat.color = .init(tint: ${hexToSwiftColor(mat.baseColor)})`);
  } else {
    lines.push(`var ${varPrefix}Mat = PhysicallyBasedMaterial()`);
    if (mat.baseColor)
      lines.push(`${varPrefix}Mat.baseColor = .init(tint: ${hexToSwiftColor(mat.baseColor)})`);
    if (mat.roughness !== undefined)
      lines.push(`${varPrefix}Mat.roughness = .init(floatLiteral: ${mat.roughness})`);
    if (mat.metallic !== undefined)
      lines.push(`${varPrefix}Mat.metallic = .init(floatLiteral: ${mat.metallic})`);
    if (mat.opacity !== undefined && mat.opacity < 1)
      lines.push(
        `${varPrefix}Mat.blending = .transparent(opacity: .init(floatLiteral: ${mat.opacity}))`
      );
    if (mat.emissiveColor) {
      lines.push(
        `${varPrefix}Mat.emissiveColor = .init(color: ${hexToSwiftColor(mat.emissiveColor)})`
      );
      if (mat.emissiveIntensity)
        lines.push(`${varPrefix}Mat.emissiveIntensity = ${mat.emissiveIntensity}`);
    }
  }
  for (const [mapType, path] of Object.entries(mat.textureMaps)) {
    const prop =
      mapType === 'albedo_map'
        ? 'baseColor'
        : mapType === 'normal_map'
          ? 'normal'
          : mapType === 'metallic_map'
            ? 'metallic'
            : mapType === 'roughness_map'
              ? 'roughness'
              : mapType;
    lines.push(`${varPrefix}Mat.${prop} = .init(texture: .init(try! .load(named: "${path}")))`);
  }
  return lines.join('\n');
}

/** Generate VisionOS Swift physics setup code */
export function physicsToVisionOS(physics: CompiledPhysics, varPrefix: string): string {
  const lines: string[] = [];
  lines.push(`// Physics: ${physics.keyword} "${physics.name || ''}"`);

  if (physics.colliders) {
    for (const c of physics.colliders) {
      const shape = c.shape || 'box';
      if (shape === 'sphere') {
        lines.push(
          `${varPrefix}Entity.components.set(CollisionComponent(shapes: [.generateSphere(radius: ${c.properties.radius || 0.5})]))`
        );
      } else if (shape === 'capsule') {
        lines.push(
          `${varPrefix}Entity.components.set(CollisionComponent(shapes: [.generateCapsule(height: ${c.properties.height || 1}, radius: ${c.properties.radius || 0.25})]))`
        );
      } else {
        const size =
          c.properties.size && Array.isArray(c.properties.size) ? c.properties.size : [1, 1, 1];
        lines.push(
          `${varPrefix}Entity.components.set(CollisionComponent(shapes: [.generateBox(size: [${size.join(', ')}])]))`
        );
      }
    }
  }

  if (physics.rigidbody) {
    const rb = physics.rigidbody.properties;
    lines.push(
      `var ${varPrefix}Physics = PhysicsBodyComponent(massProperties: .init(mass: ${rb.mass ?? 1}), mode: .dynamic)`
    );
    if (rb.drag !== undefined) lines.push(`${varPrefix}Physics.linearDamping = ${rb.drag}`);
    if (rb.angular_damping !== undefined)
      lines.push(`${varPrefix}Physics.angularDamping = ${rb.angular_damping}`);
    lines.push(`${varPrefix}Entity.components.set(${varPrefix}Physics)`);
  }

  if (physics.joints) {
    for (const j of physics.joints) {
      lines.push(`// Joint: ${j.keyword} "${j.name || ''}" — use PhysicsJoint`);
    }
  }

  return lines.join('\n');
}

/** Generate VisionOS Swift particle system code */
export function particlesToVisionOS(ps: CompiledParticleSystem, varPrefix: string): string {
  const lines: string[] = [];
  lines.push(`// Particles: ${ps.name}`);
  lines.push(`var ${varPrefix}Particles = ParticleEmitterComponent()`);
  if (ps.properties.rate) lines.push(`${varPrefix}Particles.birthRate = ${ps.properties.rate}`);
  if (ps.properties.start_lifetime) {
    const lt = Array.isArray(ps.properties.start_lifetime)
      ? ps.properties.start_lifetime[0]
      : ps.properties.start_lifetime;
    lines.push(`${varPrefix}Particles.lifeSpan = ${lt}`);
  }
  if (ps.traits.includes('looping')) lines.push(`${varPrefix}Particles.isEmitting = true`);
  lines.push(`${varPrefix}Entity.components.set(${varPrefix}Particles)`);
  return lines.join('\n');
}

/** Generate VisionOS audio source code */
export function audioSourceToVisionOS(audio: CompiledAudioSource, varPrefix: string): string {
  const lines: string[] = [];
  lines.push(`// Audio: ${audio.name} (${audio.keyword})`);
  const isSpatial = audio.traits.includes('spatial') || audio.properties.spatial_blend > 0;
  if (isSpatial) {
    lines.push(`let ${varPrefix}Audio = Entity()`);
    lines.push(`${varPrefix}Audio.spatialAudio = SpatialAudioComponent()`);
    if (audio.properties.max_distance)
      lines.push(
        `${varPrefix}Audio.spatialAudio?.distanceAttenuation = .rolloff(factor: .custom(${audio.properties.max_distance}))`
      );
  }
  lines.push(
    `let ${varPrefix}Resource = try! AudioFileResource.load(named: "${audio.properties.clip || audio.name}")`
  );
  lines.push(`let ${varPrefix}Controller = ${varPrefix}Entity.prepareAudio(${varPrefix}Resource)`);
  if (audio.properties.volume !== undefined)
    lines.push(
      `${varPrefix}Controller.gain = AudioPlaybackController.Decibel(${audio.properties.volume})`
    );
  if (audio.properties.play_on_awake) lines.push(`${varPrefix}Controller.play()`);
  return lines.join('\n');
}

// =============================================================================
// Android XR (Kotlin / SceneCore + Filament) Target Helpers
// =============================================================================

/** Generate Android XR Kotlin/Filament material setup code */
export function materialToAndroidXR(mat: CompiledMaterial, varPrefix: string): string {
  const lines: string[] = [];
  lines.push(`// Material: ${mat.name}`);
  if (mat.type === 'unlit') {
    lines.push(`val ${varPrefix}MatBuilder = MaterialInstance.Builder()`);
    lines.push(
      `    .setParameter("baseColor", ${mat.baseColor ? hexToFilamentColor(mat.baseColor) : 'Float4(1f, 1f, 1f, 1f)'})`
    );
    if (mat.opacity !== undefined) lines.push(`    .setParameter("alpha", ${mat.opacity}f)`);
    lines.push(`val ${varPrefix}Mat = ${varPrefix}MatBuilder.build(engine)`);
  } else {
    lines.push(`val ${varPrefix}MatBuilder = MaterialInstance.Builder()`);
    if (mat.baseColor) {
      lines.push(`    .setParameter("baseColor", ${hexToFilamentColor(mat.baseColor)})`);
    }
    if (mat.roughness !== undefined)
      lines.push(`    .setParameter("roughness", ${mat.roughness}f)`);
    if (mat.metallic !== undefined) lines.push(`    .setParameter("metallic", ${mat.metallic}f)`);
    if (mat.opacity !== undefined && mat.opacity < 1) {
      lines.push(`    .setParameter("alpha", ${mat.opacity}f)`);
    }
    if (mat.emissiveColor) {
      const [er, eg, eb] = hexToRGBTuple(mat.emissiveColor);
      const intensity = mat.emissiveIntensity ?? 1;
      lines.push(
        `    .setParameter("emissive", Float4(${er * intensity}f, ${eg * intensity}f, ${eb * intensity}f, 1f))`
      );
    }
    lines.push(`val ${varPrefix}Mat = ${varPrefix}MatBuilder.build(engine)`);
  }
  for (const [mapType, path] of Object.entries(mat.textureMaps)) {
    const paramName =
      mapType === 'albedo_map'
        ? 'baseColorMap'
        : mapType === 'normal_map'
          ? 'normalMap'
          : mapType === 'metallic_map'
            ? 'metallicMap'
            : mapType === 'roughness_map'
              ? 'roughnessMap'
              : mapType === 'emission_map'
                ? 'emissiveMap'
                : mapType === 'occlusion_map'
                  ? 'aoMap'
                  : mapType.replace(/_map$/, 'Map');
    lines.push(`// Texture: ${paramName} -> "${path}"`);
    lines.push(
      `val ${varPrefix}Tex_${paramName} = Texture.Builder().build(engine) // load from "${path}"`
    );
    lines.push(
      `${varPrefix}Mat.setParameter("${paramName}", ${varPrefix}Tex_${paramName}, TextureSampler())`
    );
  }
  return lines.join('\n');
}

/** Generate Android XR Kotlin/SceneCore physics setup code */
export function physicsToAndroidXR(physics: CompiledPhysics, varPrefix: string): string {
  const lines: string[] = [];
  lines.push(`// Physics: ${physics.keyword} "${physics.name || ''}"`);

  if (physics.colliders) {
    for (let i = 0; i < physics.colliders.length; i++) {
      const c = physics.colliders[i];
      const shape = c.shape || 'box';
      const colVar = `${varPrefix}Col${i}`;
      if (shape === 'sphere') {
        lines.push(`val ${colVar} = SphereCollider(engine, ${c.properties.radius || 0.5}f)`);
      } else if (shape === 'capsule') {
        lines.push(
          `val ${colVar} = CapsuleCollider(engine, ${c.properties.radius || 0.25}f, ${c.properties.height || 1.0}f)`
        );
      } else {
        const size =
          c.properties.size && Array.isArray(c.properties.size) ? c.properties.size : [1, 1, 1];
        lines.push(
          `val ${colVar} = BoxCollider(engine, Float3(${size[0]}f, ${size[1]}f, ${size[2]}f))`
        );
      }
      if (c.type === 'trigger') lines.push(`${colVar}.isTrigger = true`);
      lines.push(`${varPrefix}Entity.addComponent(${colVar})`);
    }
  }

  if (physics.rigidbody) {
    const rb = physics.rigidbody.properties;
    lines.push(`val ${varPrefix}RB = RigidBodyComponent()`);
    if (rb.mass !== undefined) lines.push(`${varPrefix}RB.mass = ${rb.mass}f`);
    if (rb.drag !== undefined) lines.push(`${varPrefix}RB.linearDamping = ${rb.drag}f`);
    if (rb.angular_damping !== undefined)
      lines.push(`${varPrefix}RB.angularDamping = ${rb.angular_damping}f`);
    if (rb.use_gravity === false) lines.push(`${varPrefix}RB.isGravityEnabled = false`);
    lines.push(`${varPrefix}Entity.addComponent(${varPrefix}RB)`);
  }

  if (physics.forceFields) {
    for (const ff of physics.forceFields) {
      if (ff.keyword === 'wind_zone') {
        lines.push(`// Wind zone: "${ff.name || ''}" strength=${ff.properties.strength || 0}`);
        lines.push(`// Implement via custom force application in physics update loop`);
      } else {
        lines.push(
          `// Force field: ${ff.keyword} "${ff.name || ''}" — ${JSON.stringify(ff.properties)}`
        );
      }
    }
  }

  if (physics.joints) {
    for (const j of physics.joints) {
      lines.push(`// Joint: ${j.keyword} "${j.name || ''}" — configure via PhysicsConstraint`);
      if (j.properties.axis) {
        const axis = Array.isArray(j.properties.axis) ? j.properties.axis : [0, 0, 1];
        lines.push(`// Axis: Float3(${axis[0]}f, ${axis[1]}f, ${axis[2]}f)`);
      }
    }
  }

  return lines.join('\n');
}

/** Generate Android XR Kotlin particle system code (SceneCore + Filament) */
export function particlesToAndroidXR(ps: CompiledParticleSystem, varPrefix: string): string {
  const lines: string[] = [];
  lines.push(`// Particles: ${ps.name}`);
  lines.push(`val ${varPrefix}ParticleEntity = xrSession.scene.createEntity("${ps.name}")`);
  lines.push(`// Configure particle system via Filament ParticleSystem or custom emitter`);

  if (ps.properties.rate) lines.push(`val ${varPrefix}EmitRate = ${ps.properties.rate}f`);
  if (ps.properties.max_particles)
    lines.push(`val ${varPrefix}MaxParticles = ${ps.properties.max_particles}`);
  if (ps.properties.start_lifetime) {
    const lt = Array.isArray(ps.properties.start_lifetime)
      ? ps.properties.start_lifetime[0]
      : ps.properties.start_lifetime;
    lines.push(`val ${varPrefix}Lifetime = ${lt}f`);
  }
  if (ps.properties.start_speed) {
    const sp = Array.isArray(ps.properties.start_speed)
      ? ps.properties.start_speed[0]
      : ps.properties.start_speed;
    lines.push(`val ${varPrefix}Speed = ${sp}f`);
  }
  if (ps.properties.gravity_modifier !== undefined) {
    lines.push(`val ${varPrefix}GravityMod = ${ps.properties.gravity_modifier}f`);
  }
  if (ps.traits.includes('looping')) lines.push(`val ${varPrefix}Looping = true`);
  if (ps.traits.includes('gpu')) lines.push(`// GPU particles: use compute shader pipeline`);

  for (const m of ps.modules) {
    lines.push(`// Module: ${m.type} — ${JSON.stringify(m.properties)}`);
  }
  return lines.join('\n');
}

/** Generate Android XR Kotlin spatial audio code (Oboe / SceneCore SpatialAudioTrack) */
export function audioSourceToAndroidXR(audio: CompiledAudioSource, varPrefix: string): string {
  const lines: string[] = [];
  lines.push(`// Audio: ${audio.name} (${audio.keyword})`);
  const isSpatial =
    audio.traits.includes('spatial') ||
    audio.traits.includes('hrtf') ||
    audio.properties.spatial_blend > 0;

  if (audio.keyword === 'reverb_zone') {
    lines.push(`// Reverb zone: "${audio.name}" — implement via AudioEffect.EFFECT_TYPE_REVERB`);
    if (audio.properties.min_distance)
      lines.push(`// minDistance = ${audio.properties.min_distance}`);
    if (audio.properties.max_distance)
      lines.push(`// maxDistance = ${audio.properties.max_distance}`);
    return lines.join('\n');
  }

  lines.push(`val ${varPrefix}AudioEntity = xrSession.scene.createEntity("${audio.name}")`);

  if (isSpatial) {
    lines.push(
      `val ${varPrefix}SpatialTrack = SpatialAudioTrack(xrSession, ${varPrefix}AudioEntity)`
    );
    if (audio.properties.max_distance) {
      lines.push(`// Spatial falloff distance: ${audio.properties.max_distance}`);
    }
  }

  if (audio.properties.clip) {
    lines.push(
      `val ${varPrefix}SoundId = soundPool.load(context, R.raw.${audio.properties.clip.toString().replace(/[^a-zA-Z0-9_]/g, '_')}, 1)`
    );
  }
  if (audio.properties.volume !== undefined)
    lines.push(`val ${varPrefix}Volume = ${audio.properties.volume}f`);
  if (audio.properties.loop !== undefined)
    lines.push(
      `val ${varPrefix}Loop = ${audio.properties.loop ? '1' : '0'} // -1 = loop, 0 = once`
    );

  if (audio.properties.play_on_awake || audio.properties.clip) {
    lines.push(`soundPool.setOnLoadCompleteListener { pool, id, _ ->`);
    lines.push(
      `    if (id == ${varPrefix}SoundId) pool.play(id, ${audio.properties.volume ?? 1}f, ${audio.properties.volume ?? 1}f, 1, ${audio.properties.loop ? '-1' : '0'}, 1.0f)`
    );
    lines.push(`}`);
  }

  return lines.join('\n');
}

/** Generate Android XR Kotlin weather/atmosphere code */
export function weatherToAndroidXR(weather: CompiledWeather): string {
  const lines: string[] = [];
  lines.push(`// Weather: ${weather.keyword} "${weather.name || ''}"`);
  lines.push('// Implement weather via Filament IndirectLight + custom particle emitters');

  for (const [key, value] of Object.entries(weather.properties)) {
    lines.push(`// ${key} = ${JSON.stringify(value)}`);
  }

  for (const layer of weather.layers) {
    lines.push(`// Layer: ${layer.type}`);
    if (layer.type === 'rain' || layer.type === 'snow') {
      lines.push(
        `// Use GPU particle emitter for ${layer.type} — rate=${layer.properties.rate || 'default'}, intensity=${layer.properties.intensity || 'default'}`
      );
    } else if (layer.type === 'wind') {
      lines.push(
        `// Apply force to particle systems: strength=${layer.properties.strength || 'default'}, direction=${JSON.stringify(layer.properties.direction) || 'default'}`
      );
    } else if (layer.type === 'fog' || layer.type === 'fog_layer') {
      lines.push(
        `// Configure Filament fog: density=${layer.properties.density || 'default'}, color=${layer.properties.color || 'default'}`
      );
    } else if (layer.type === 'lightning') {
      lines.push(`// Lightning flash: frequency=${layer.properties.frequency || 'default'}`);
    } else if (layer.type === 'clouds') {
      lines.push(`// Volumetric clouds: coverage=${layer.properties.coverage || 'default'}`);
    } else {
      for (const [k, v] of Object.entries(layer.properties)) {
        lines.push(`//   ${k} = ${JSON.stringify(v)}`);
      }
    }
  }

  return lines.join('\n');
}

/** Convert hex color to Filament Float4 */
function hexToFilamentColor(hex: string): string {
  const [r, g, b] = hexToRGBTuple(hex);
  return `Float4(${r}f, ${g}f, ${b}f, 1f)`;
}

// =============================================================================
// Babylon.js Target Helpers
// =============================================================================

/** Generate Babylon.js material setup code */
export function materialToBabylon(mat: CompiledMaterial, varPrefix: string): string {
  const lines: string[] = [];
  lines.push(`// Material: ${mat.name}`);
  if (mat.type === 'unlit') {
    lines.push(`const ${varPrefix}Mat = new BABYLON.StandardMaterial("${mat.name}", scene);`);
    lines.push(`${varPrefix}Mat.disableLighting = true;`);
    if (mat.emissiveColor)
      lines.push(
        `${varPrefix}Mat.emissiveColor = BABYLON.Color3.FromHexString("${mat.emissiveColor}");`
      );
  } else {
    lines.push(`const ${varPrefix}Mat = new BABYLON.PBRMaterial("${mat.name}", scene);`);
    if (mat.baseColor)
      lines.push(`${varPrefix}Mat.albedoColor = BABYLON.Color3.FromHexString("${mat.baseColor}");`);
    if (mat.roughness !== undefined) lines.push(`${varPrefix}Mat.roughness = ${mat.roughness};`);
    if (mat.metallic !== undefined) lines.push(`${varPrefix}Mat.metallic = ${mat.metallic};`);
    if (mat.opacity !== undefined && mat.opacity < 1) {
      lines.push(`${varPrefix}Mat.alpha = ${mat.opacity};`);
    }
    if (mat.emissiveColor) {
      lines.push(
        `${varPrefix}Mat.emissiveColor = BABYLON.Color3.FromHexString("${mat.emissiveColor}");`
      );
      if (mat.emissiveIntensity)
        lines.push(`${varPrefix}Mat.emissiveIntensity = ${mat.emissiveIntensity};`);
    }
    if (mat.ior !== undefined) lines.push(`${varPrefix}Mat.indexOfRefraction = ${mat.ior};`);
  }
  for (const [mapType, path] of Object.entries(mat.textureMaps)) {
    const prop =
      mapType === 'albedo_map'
        ? 'albedoTexture'
        : mapType === 'normal_map'
          ? 'bumpTexture'
          : mapType === 'metallic_map'
            ? 'metallicTexture'
            : mapType === 'roughness_map'
              ? 'microSurfaceTexture'
              : mapType === 'emission_map'
                ? 'emissiveTexture'
                : mapType === 'occlusion_map'
                  ? 'ambientTexture'
                  : `${mapType.replace(/_map$/, 'Texture')}`;
    lines.push(`${varPrefix}Mat.${prop} = new BABYLON.Texture("${path}", scene);`);
  }
  return lines.join('\n');
}

/** Generate Babylon.js physics setup code */
export function physicsToBabylon(physics: CompiledPhysics, varPrefix: string): string {
  const lines: string[] = [];
  lines.push(`// Physics: ${physics.keyword} "${physics.name || ''}"`);

  if (physics.rigidbody) {
    const rb = physics.rigidbody.properties;
    lines.push(
      `const ${varPrefix}Aggregate = new BABYLON.PhysicsAggregate(${varPrefix}Mesh, BABYLON.PhysicsShapeType.BOX, {`
    );
    if (rb.mass !== undefined) lines.push(`  mass: ${rb.mass},`);
    if (rb.drag !== undefined) lines.push(`  linearDamping: ${rb.drag},`);
    if (rb.angular_damping !== undefined) lines.push(`  angularDamping: ${rb.angular_damping},`);
    lines.push('}, scene);');
  }

  if (physics.colliders) {
    for (const c of physics.colliders) {
      const shape = c.shape || 'box';
      const shapeType = shape === 'sphere' ? 'SPHERE' : shape === 'capsule' ? 'CAPSULE' : 'BOX';
      lines.push(`// Collider: ${shape} — PhysicsShapeType.${shapeType}`);
    }
  }

  if (physics.joints) {
    for (const j of physics.joints) {
      const jointType =
        j.keyword === 'hinge'
          ? 'HingeConstraint'
          : j.keyword === 'slider'
            ? 'SliderConstraint'
            : j.keyword === 'ball_socket'
              ? 'BallAndSocketConstraint'
              : 'Physics6DoFConstraint';
      lines.push(`// Joint: ${j.keyword} — BABYLON.${jointType}`);
    }
  }

  return lines.join('\n');
}

/** Generate Babylon.js particle system code */
export function particlesToBabylon(ps: CompiledParticleSystem, varPrefix: string): string {
  const lines: string[] = [];
  lines.push(`// Particles: ${ps.name}`);
  const useGPU = ps.traits.includes('gpu');
  if (useGPU) {
    lines.push(
      `const ${varPrefix}PS = new BABYLON.GPUParticleSystem("${ps.name}", { capacity: ${ps.properties.max_particles || 1000} }, scene);`
    );
  } else {
    lines.push(
      `const ${varPrefix}PS = new BABYLON.ParticleSystem("${ps.name}", ${ps.properties.max_particles || 1000}, scene);`
    );
  }
  if (ps.properties.rate) lines.push(`${varPrefix}PS.emitRate = ${ps.properties.rate};`);
  if (ps.properties.start_lifetime) {
    const lt = ps.properties.start_lifetime;
    if (Array.isArray(lt)) {
      lines.push(`${varPrefix}PS.minLifeTime = ${lt[0]};`);
      lines.push(`${varPrefix}PS.maxLifeTime = ${lt[1] || lt[0]};`);
    } else {
      lines.push(`${varPrefix}PS.minLifeTime = ${lt};`);
      lines.push(`${varPrefix}PS.maxLifeTime = ${lt};`);
    }
  }
  if (ps.properties.start_speed) {
    const sp = ps.properties.start_speed;
    if (Array.isArray(sp)) {
      lines.push(`${varPrefix}PS.minEmitPower = ${sp[0]};`);
      lines.push(`${varPrefix}PS.maxEmitPower = ${sp[1] || sp[0]};`);
    } else {
      lines.push(`${varPrefix}PS.minEmitPower = ${sp};`);
      lines.push(`${varPrefix}PS.maxEmitPower = ${sp};`);
    }
  }
  if (ps.properties.gravity_modifier !== undefined) {
    lines.push(
      `${varPrefix}PS.gravity = new BABYLON.Vector3(0, ${-9.81 * ps.properties.gravity_modifier}, 0);`
    );
  }
  lines.push(`${varPrefix}PS.start();`);
  return lines.join('\n');
}

/** Generate Babylon.js post-processing code */
export function postProcessingToBabylon(pp: CompiledPostProcessing): string {
  const lines: string[] = [];
  lines.push(`// Post-Processing: ${pp.keyword}`);
  lines.push(
    'const pipeline = new BABYLON.DefaultRenderingPipeline("default", true, scene, [camera]);'
  );
  for (const e of pp.effects) {
    if (e.type === 'bloom') {
      lines.push('pipeline.bloomEnabled = true;');
      if (e.properties.intensity) lines.push(`pipeline.bloomWeight = ${e.properties.intensity};`);
      if (e.properties.threshold)
        lines.push(`pipeline.bloomThreshold = ${e.properties.threshold};`);
    } else if (e.type === 'depth_of_field') {
      lines.push('pipeline.depthOfFieldEnabled = true;');
      if (e.properties.focal_length)
        lines.push(`pipeline.depthOfField.focalLength = ${e.properties.focal_length};`);
    } else if (e.type === 'chromatic_aberration') {
      lines.push('pipeline.chromaticAberrationEnabled = true;');
      if (e.properties.amount)
        lines.push(`pipeline.chromaticAberration.aberrationAmount = ${e.properties.amount};`);
    } else if (e.type === 'vignette') {
      lines.push('pipeline.imageProcessing.vignetteEnabled = true;');
      if (e.properties.weight)
        lines.push(`pipeline.imageProcessing.vignetteWeight = ${e.properties.weight};`);
    } else {
      lines.push(`// Effect: ${e.type} — ${JSON.stringify(e.properties)}`);
    }
  }
  return lines.join('\n');
}

/** Generate Babylon.js audio source code */
export function audioSourceToBabylon(audio: CompiledAudioSource, varPrefix: string): string {
  const lines: string[] = [];
  lines.push(`// Audio: ${audio.name} (${audio.keyword})`);
  const isSpatial = audio.traits.includes('spatial') || audio.properties.spatial_blend > 0;
  lines.push(
    `const ${varPrefix}Sound = new BABYLON.Sound("${audio.name}", "${audio.properties.clip || ''}", scene, null, {`
  );
  if (audio.properties.loop !== undefined) lines.push(`  loop: ${audio.properties.loop},`);
  if (audio.properties.volume !== undefined) lines.push(`  volume: ${audio.properties.volume},`);
  if (isSpatial) lines.push('  spatialSound: true,');
  if (audio.properties.play_on_awake) lines.push('  autoplay: true,');
  if (isSpatial && audio.properties.max_distance)
    lines.push(`  maxDistance: ${audio.properties.max_distance},`);
  lines.push('});');
  return lines.join('\n');
}

// =============================================================================
// PlayCanvas Target Helpers
// =============================================================================

/** Generate PlayCanvas material setup code */
export function materialToPlayCanvas(mat: CompiledMaterial, varPrefix: string): string {
  const lines: string[] = [];
  lines.push(`// Material: ${mat.name}`);
  lines.push(`const ${varPrefix}Mat = new pc.StandardMaterial();`);
  lines.push(`${varPrefix}Mat.name = "${mat.name}";`);
  if (mat.baseColor)
    lines.push(`${varPrefix}Mat.diffuse = new pc.Color().fromString("${mat.baseColor}");`);
  if (mat.roughness !== undefined)
    lines.push(`${varPrefix}Mat.gloss = ${1 - mat.roughness}; // roughness inverted`);
  if (mat.metallic !== undefined) lines.push(`${varPrefix}Mat.metalness = ${mat.metallic};`);
  if (mat.metallic !== undefined) lines.push(`${varPrefix}Mat.useMetalness = true;`);
  if (mat.opacity !== undefined && mat.opacity < 1) {
    lines.push(`${varPrefix}Mat.opacity = ${mat.opacity};`);
    lines.push(`${varPrefix}Mat.blendType = pc.BLEND_NORMAL;`);
  }
  if (mat.emissiveColor) {
    lines.push(`${varPrefix}Mat.emissive = new pc.Color().fromString("${mat.emissiveColor}");`);
    if (mat.emissiveIntensity)
      lines.push(`${varPrefix}Mat.emissiveIntensity = ${mat.emissiveIntensity};`);
  }
  lines.push(`${varPrefix}Mat.update();`);
  return lines.join('\n');
}

/** Generate PlayCanvas physics setup code */
export function physicsToPlayCanvas(physics: CompiledPhysics, varPrefix: string): string {
  const lines: string[] = [];
  lines.push(`// Physics: ${physics.keyword} "${physics.name || ''}"`);

  if (physics.rigidbody) {
    const rb = physics.rigidbody.properties;
    lines.push(`${varPrefix}Entity.addComponent("rigidbody", {`);
    lines.push(`  type: "dynamic",`);
    if (rb.mass !== undefined) lines.push(`  mass: ${rb.mass},`);
    if (rb.drag !== undefined) lines.push(`  linearDamping: ${rb.drag},`);
    if (rb.angular_damping !== undefined) lines.push(`  angularDamping: ${rb.angular_damping},`);
    lines.push('});');
  }

  if (physics.colliders) {
    for (const c of physics.colliders) {
      const shape = c.shape || 'box';
      lines.push(`${varPrefix}Entity.addComponent("collision", {`);
      lines.push(`  type: "${shape}",`);
      if (c.properties.radius) lines.push(`  radius: ${c.properties.radius},`);
      if (c.properties.height) lines.push(`  height: ${c.properties.height},`);
      if (c.properties.size && Array.isArray(c.properties.size)) {
        lines.push(
          `  halfExtents: new pc.Vec3(${c.properties.size.map((s: number) => s / 2).join(', ')}),`
        );
      }
      lines.push('});');
    }
  }

  return lines.join('\n');
}

/** Generate PlayCanvas particle system code */
export function particlesToPlayCanvas(ps: CompiledParticleSystem, varPrefix: string): string {
  const lines: string[] = [];
  lines.push(`// Particles: ${ps.name}`);
  lines.push(`${varPrefix}Entity.addComponent("particlesystem", {`);
  if (ps.properties.max_particles) lines.push(`  numParticles: ${ps.properties.max_particles},`);
  if (ps.properties.rate) lines.push(`  rate: ${ps.properties.rate},`);
  if (ps.properties.start_lifetime)
    lines.push(
      `  lifetime: ${Array.isArray(ps.properties.start_lifetime) ? ps.properties.start_lifetime[0] : ps.properties.start_lifetime},`
    );
  if (ps.properties.start_speed)
    lines.push(
      `  emitterExtents: new pc.Vec3(${Array.isArray(ps.properties.start_speed) ? ps.properties.start_speed[0] : ps.properties.start_speed}, 0, 0),`
    );
  lines.push(`  loop: ${ps.traits.includes('looping')},`);
  lines.push('});');
  return lines.join('\n');
}

/** Generate PlayCanvas audio source code */
export function audioSourceToPlayCanvas(audio: CompiledAudioSource, varPrefix: string): string {
  const lines: string[] = [];
  lines.push(`// Audio: ${audio.name} (${audio.keyword})`);
  lines.push(`${varPrefix}Entity.addComponent("sound", {`);
  lines.push(
    `  positional: ${audio.traits.includes('spatial') || audio.properties.spatial_blend > 0},`
  );
  if (audio.properties.volume !== undefined) lines.push(`  volume: ${audio.properties.volume},`);
  if (audio.properties.max_distance) lines.push(`  maxDistance: ${audio.properties.max_distance},`);
  lines.push('});');
  if (audio.properties.clip) {
    lines.push(
      `${varPrefix}Entity.sound.addSlot("${audio.name}", { asset: app.assets.find("${audio.properties.clip}"),`
    );
    if (audio.properties.loop !== undefined) lines.push(`  loop: ${audio.properties.loop},`);
    if (audio.properties.play_on_awake) lines.push('  autoPlay: true,');
    lines.push('});');
  }
  return lines.join('\n');
}

// =============================================================================
// SDF (Gazebo) Target Helpers
// =============================================================================

/** Generate SDF material element */
export function materialToSDF(mat: CompiledMaterial): string {
  const lines: string[] = [];
  lines.push(`<material>`);
  lines.push(`  <script><name>${mat.name}</name></script>`);
  if (mat.baseColor) {
    const [r, g, b] = hexToRGBTuple(mat.baseColor);
    lines.push(`  <ambient>${r} ${g} ${b} 1</ambient>`);
    lines.push(`  <diffuse>${r} ${g} ${b} ${mat.opacity ?? 1}</diffuse>`);
  }
  if (mat.metallic !== undefined && mat.metallic > 0.5) {
    lines.push(`  <specular>0.8 0.8 0.8 1</specular>`);
  }
  if (mat.emissiveColor) {
    const [r, g, b] = hexToRGBTuple(mat.emissiveColor);
    lines.push(`  <emissive>${r} ${g} ${b} 1</emissive>`);
  }
  lines.push(`</material>`);
  return lines.join('\n');
}

/** Generate SDF physics (already well supported via collider/inertial) */
export function physicsToSDF(physics: CompiledPhysics): string {
  const lines: string[] = [];

  if (physics.rigidbody) {
    const rb = physics.rigidbody.properties;
    lines.push('<inertial>');
    lines.push(`  <mass>${rb.mass ?? 1.0}</mass>`);
    lines.push('</inertial>');
  }

  if (physics.colliders) {
    for (const c of physics.colliders) {
      const shape = c.shape || 'box';
      lines.push('<collision name="collision">');
      lines.push('  <geometry>');
      if (shape === 'sphere') {
        lines.push(`    <sphere><radius>${c.properties.radius || 0.5}</radius></sphere>`);
      } else if (shape === 'capsule' || shape === 'cylinder') {
        lines.push(
          `    <cylinder><radius>${c.properties.radius || 0.5}</radius><length>${c.properties.height || 1.0}</length></cylinder>`
        );
      } else {
        const size =
          c.properties.size && Array.isArray(c.properties.size) ? c.properties.size : [1, 1, 1];
        lines.push(`    <box><size>${size.join(' ')}</size></box>`);
      }
      lines.push('  </geometry>');
      lines.push('</collision>');
    }
  }

  if (physics.joints) {
    for (const j of physics.joints) {
      const sdfType =
        j.keyword === 'hinge'
          ? 'revolute'
          : j.keyword === 'slider'
            ? 'prismatic'
            : j.keyword === 'ball_socket'
              ? 'ball'
              : j.keyword === 'fixed_joint'
                ? 'fixed'
                : 'revolute';
      lines.push(`<joint name="${j.name || 'joint'}" type="${sdfType}">`);
      if (j.properties.axis) {
        const axis = Array.isArray(j.properties.axis) ? j.properties.axis : [0, 0, 1];
        lines.push(`  <axis><xyz>${axis.join(' ')}</xyz></axis>`);
      }
      if (j.properties.limits) {
        lines.push(
          `  <axis><limit><lower>${j.properties.limits[0]}</lower><upper>${j.properties.limits[1]}</upper></limit></axis>`
        );
      }
      lines.push('</joint>');
    }
  }

  return lines.join('\n');
}

// =============================================================================
// VRChat (C# / Udon) Target Helpers
// =============================================================================

/** Generate VRChat material code (Unity-based with VRC extensions) */
export function materialToVRChat(mat: CompiledMaterial, varPrefix: string): string {
  const lines: string[] = [];
  lines.push(`// VRChat Material: ${mat.name}`);
  lines.push(`var ${varPrefix}Mat = new Material(Shader.Find("VRChat/Mobile/Standard Lite"));`);
  if (mat.baseColor)
    lines.push(`${varPrefix}Mat.SetColor("_Color", ${hexToUnityColor(mat.baseColor)});`);
  if (mat.roughness !== undefined)
    lines.push(`${varPrefix}Mat.SetFloat("_Glossiness", ${(1 - mat.roughness).toFixed(3)}f);`);
  if (mat.metallic !== undefined)
    lines.push(`${varPrefix}Mat.SetFloat("_Metallic", ${mat.metallic}f);`);
  if (mat.emissiveColor) {
    lines.push(`${varPrefix}Mat.EnableKeyword("_EMISSION");`);
    lines.push(
      `${varPrefix}Mat.SetColor("_EmissionColor", ${hexToUnityColor(mat.emissiveColor)});`
    );
  }
  return lines.join('\n');
}

// =============================================================================
// USD Particle / Post-Processing / Audio Helpers
// =============================================================================

/** Generate USD particle system prim */
export function particlesToUSD(ps: CompiledParticleSystem): string {
  const lines: string[] = [];
  lines.push(`def Scope "Particles_${ps.name.replace(/[^a-zA-Z0-9_]/g, '_')}" {`);
  lines.push(`    custom string holoscript:type = "particle_system"`);
  if (ps.properties.rate) lines.push(`    custom float holoscript:rate = ${ps.properties.rate}`);
  if (ps.properties.max_particles)
    lines.push(`    custom int holoscript:maxParticles = ${ps.properties.max_particles}`);
  if (ps.properties.start_lifetime)
    lines.push(
      `    custom float holoscript:lifetime = ${Array.isArray(ps.properties.start_lifetime) ? ps.properties.start_lifetime[0] : ps.properties.start_lifetime}`
    );
  for (const m of ps.modules) {
    lines.push(`    def Scope "${m.type}" {`);
    for (const [k, v] of Object.entries(m.properties)) {
      const usdType = typeof v === 'number' ? 'float' : typeof v === 'boolean' ? 'bool' : 'string';
      lines.push(`        custom ${usdType} ${k} = ${JSON.stringify(v)}`);
    }
    lines.push('    }');
  }
  lines.push('}');
  return lines.join('\n');
}

/** Generate USD post-processing scope */
export function postProcessingToUSD(pp: CompiledPostProcessing): string {
  const lines: string[] = [];
  lines.push(`def Scope "PostProcessing" {`);
  for (const e of pp.effects) {
    lines.push(`    def Scope "${e.type}" {`);
    for (const [k, v] of Object.entries(e.properties)) {
      const usdType = typeof v === 'number' ? 'float' : typeof v === 'boolean' ? 'bool' : 'string';
      lines.push(`        custom ${usdType} ${k} = ${JSON.stringify(v)}`);
    }
    lines.push('    }');
  }
  lines.push('}');
  return lines.join('\n');
}

/** Generate USD audio source prim */
export function audioSourceToUSD(audio: CompiledAudioSource): string {
  const lines: string[] = [];
  lines.push(`def Scope "Audio_${audio.name.replace(/[^a-zA-Z0-9_]/g, '_')}" {`);
  lines.push(`    custom string holoscript:type = "${audio.keyword}"`);
  if (audio.properties.clip) lines.push(`    asset holoscript:clip = @${audio.properties.clip}@`);
  if (audio.properties.volume !== undefined)
    lines.push(`    custom float holoscript:volume = ${audio.properties.volume}`);
  if (audio.properties.loop !== undefined)
    lines.push(`    custom bool holoscript:loop = ${audio.properties.loop}`);
  if (audio.properties.spatial_blend !== undefined)
    lines.push(`    custom float holoscript:spatialBlend = ${audio.properties.spatial_blend}`);
  lines.push('}');
  return lines.join('\n');
}

// =============================================================================
// R3F Physics / Weather Helpers
// =============================================================================

/** Generate R3F/Three.js physics JSX (rapier or cannon) */
export function physicsToR3F(physics: CompiledPhysics): string {
  const lines: string[] = [];

  if (physics.rigidbody) {
    const rb = physics.rigidbody.properties;
    const bodyType = rb.use_gravity === false ? 'kinematicPosition' : 'dynamic';
    lines.push(
      `<RigidBody type="${bodyType}"${rb.mass ? ` mass={${rb.mass}}` : ''}${rb.drag ? ` linearDamping={${rb.drag}}` : ''}${rb.angular_damping ? ` angularDamping={${rb.angular_damping}}` : ''}>`
    );
  }

  if (physics.colliders) {
    for (const c of physics.colliders) {
      const shape = c.shape || 'cuboid';
      const r3fShape = shape === 'box' ? 'cuboid' : shape === 'sphere' ? 'ball' : shape;
      const args =
        shape === 'sphere' && c.properties.radius ? ` args={[${c.properties.radius}]}` : '';
      lines.push(
        `  <${c.type === 'trigger' ? 'CuboidCollider sensor' : `${capitalizeFirst(r3fShape)}Collider`}${args} />`
      );
    }
  }

  if (physics.rigidbody) {
    lines.push('</RigidBody>');
  }

  if (physics.joints) {
    for (const j of physics.joints) {
      lines.push(
        `{/* Joint: ${j.keyword} "${j.name || ''}" — use useRevoluteJoint/useSphericalJoint */}`
      );
    }
  }

  if (physics.forceFields) {
    for (const ff of physics.forceFields) {
      lines.push(
        `{/* Force field: ${ff.keyword} "${ff.name || ''}" — ${JSON.stringify(ff.properties)} */}`
      );
    }
  }

  return lines.join('\n');
}

/** Generate R3F weather JSX (custom components) */
export function weatherToR3F(weather: CompiledWeather): string {
  const lines: string[] = [];
  lines.push(`{/* Weather: ${weather.keyword} "${weather.name || ''}" */}`);
  for (const layer of weather.layers) {
    const componentName = capitalizeFirst(layer.type);
    const props = Object.entries(layer.properties)
      .map(([k, v]) => {
        const camel = k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
        return typeof v === 'string' ? `${camel}="${v}"` : `${camel}={${JSON.stringify(v)}}`;
      })
      .join(' ');
    lines.push(`<${componentName} ${props} />`);
  }
  return lines.join('\n');
}

// =============================================================================
// WebGPU Target Helpers
// =============================================================================

/** Generate WebGPU material uniform buffer layout */
export function materialToWebGPU(mat: CompiledMaterial, varPrefix: string): string {
  const lines: string[] = [];
  lines.push(`// Material: ${mat.name}`);
  lines.push(`const ${varPrefix}MaterialData = new Float32Array([`);
  if (mat.baseColor) {
    const [r, g, b] = hexToRGBTuple(mat.baseColor);
    lines.push(`  ${r}, ${g}, ${b}, ${mat.opacity ?? 1},  // baseColor + opacity`);
  } else {
    lines.push('  1.0, 1.0, 1.0, 1.0,  // baseColor + opacity');
  }
  lines.push(
    `  ${mat.roughness ?? 0.5}, ${mat.metallic ?? 0}, ${mat.ior ?? 1.5}, 0.0,  // roughness, metallic, ior, pad`
  );
  if (mat.emissiveColor) {
    const [r, g, b] = hexToRGBTuple(mat.emissiveColor);
    lines.push(`  ${r}, ${g}, ${b}, ${mat.emissiveIntensity ?? 1},  // emissive + intensity`);
  } else {
    lines.push('  0.0, 0.0, 0.0, 0.0,  // emissive + intensity');
  }
  lines.push(']);');
  lines.push(`const ${varPrefix}MaterialBuffer = device.createBuffer({`);
  lines.push(`  size: ${varPrefix}MaterialData.byteLength,`);
  lines.push('  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,');
  lines.push('});');
  lines.push(`device.queue.writeBuffer(${varPrefix}MaterialBuffer, 0, ${varPrefix}MaterialData);`);
  return lines.join('\n');
}

// =============================================================================
// Additional Utility Helpers
// =============================================================================

function hexToRGBTuple(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseFloat((parseInt(h.substring(0, 2), 16) / 255).toFixed(3)),
    parseFloat((parseInt(h.substring(2, 4), 16) / 255).toFixed(3)),
    parseFloat((parseInt(h.substring(4, 6), 16) / 255).toFixed(3)),
  ];
}

function hexToUnityColor(hex: string): string {
  const [r, g, b] = hexToRGBTuple(hex);
  return `new Color(${r}f, ${g}f, ${b}f)`;
}

function hexToSwiftColor(hex: string): string {
  return `.init(red: 0x${hex.slice(1, 3)}, green: 0x${hex.slice(3, 5)}, blue: 0x${hex.slice(5, 7)})`;
}

function capitalizeFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// =============================================================================
// Narrative / StoryWeaver Protocol Compilation
// =============================================================================

import type {
  CompiledNarrative,
  CompiledChapter,
  CompiledDialogueLine,
  CompiledChoice,
  CompiledCutsceneAction,
} from '../parser/HoloCompositionTypes';

export function compileNarrativeBlock(block: HoloDomainBlock): CompiledNarrative {
  const chapters: CompiledChapter[] = [];
  let hasChoices = false;

  for (const child of block.children || []) {
    const c = child as any;
    if (c.type !== 'DomainBlock') continue;

    const kw = c.keyword as string;
    if (kw === 'chapter' || kw === 'act' || kw === 'scene') {
      const chapter = compileChapterBlock(c);
      if (chapter.choices && chapter.choices.length > 0) hasChoices = true;
      chapters.push(chapter);
    } else if (kw === 'dialogue_tree') {
      // Dialogue tree as a virtual chapter
      const dialogueLines: CompiledDialogueLine[] = [];
      const choices: CompiledChoice[] = [];
      for (const dc of c.children || []) {
        const dck = (dc as any).keyword as string;
        if (dck === 'line' || dck === 'dialogue') {
          dialogueLines.push(compileDialogueLine(dc as any));
        } else if (dck === 'choice') {
          choices.push(compileChoiceNode(dc as any));
          hasChoices = true;
        }
      }
      chapters.push({
        name: c.name || 'dialogue',
        dialogueLines: dialogueLines.length > 0 ? dialogueLines : undefined,
        choices: choices.length > 0 ? choices : undefined,
      });
    }
  }

  const props = block.properties || {};
  const narrativeType: CompiledNarrative['type'] = hasChoices
    ? 'branching'
    : (props.type as string) === 'open_world'
      ? 'open_world'
      : 'linear';

  return {
    name: block.name || 'unnamed',
    type: narrativeType,
    chapters,
    startChapter: (props.start_chapter || props.startChapter) as string | undefined,
    variables: props.variables as Record<string, any> | undefined,
  };
}

function compileChapterBlock(block: any): CompiledChapter {
  const props = block.properties || {};
  const dialogueLines: CompiledDialogueLine[] = [];
  const choices: CompiledChoice[] = [];
  const cutsceneActions: CompiledCutsceneAction[] = [];

  for (const child of block.children || []) {
    const c = child as any;
    const kw = c.keyword as string;
    if (kw === 'line' || kw === 'dialogue') {
      dialogueLines.push(compileDialogueLine(c));
    } else if (kw === 'choice') {
      choices.push(compileChoiceNode(c));
    } else if (
      kw === 'cutscene' ||
      kw === 'camera' ||
      kw === 'action' ||
      kw === 'wait' ||
      kw === 'effect' ||
      kw === 'audio'
    ) {
      cutsceneActions.push(compileCutsceneAction(c));
    }
  }

  return {
    name: block.name || 'unnamed',
    trigger: (props.trigger || props.on_enter) as string | undefined,
    dialogueLines: dialogueLines.length > 0 ? dialogueLines : undefined,
    choices: choices.length > 0 ? choices : undefined,
    onComplete: (props.on_complete || props.next) as string | undefined,
    cutsceneActions: cutsceneActions.length > 0 ? cutsceneActions : undefined,
  };
}

function compileDialogueLine(block: any): CompiledDialogueLine {
  const props = block.properties || {};
  return {
    speaker: (props.speaker || props.character) as string | undefined,
    text: (props.text || props.content || block.name || '') as string,
    emotion: props.emotion as string | undefined,
    duration: props.duration as number | undefined,
    voiceClip: (props.voice_clip || props.voiceClip || props.audio) as string | undefined,
  };
}

function compileChoiceNode(block: any): CompiledChoice {
  const props = block.properties || {};
  return {
    text: (props.text || block.name || '') as string,
    condition: props.condition as string | undefined,
    nextChapter: (props.next || props.next_chapter || props.goto) as string | undefined,
    action: props.action as string | undefined,
  };
}

function compileCutsceneAction(block: any): CompiledCutsceneAction {
  const props = block.properties || {};
  const kw = block.keyword as string;
  const type: CompiledCutsceneAction['type'] =
    kw === 'camera' || kw === 'camera_move'
      ? 'camera_move'
      : kw === 'action' || kw === 'character_action'
        ? 'character_action'
        : kw === 'wait'
          ? 'wait'
          : kw === 'audio'
            ? 'audio'
            : 'effect';

  return {
    type,
    target: (props.target || block.name) as string | undefined,
    params: { ...props },
    duration: props.duration as number | undefined,
  };
}

/** Generate Unity C# ScriptableObject + Timeline narrative code */
export function narrativeToUnity(narrative: CompiledNarrative): string {
  const lines: string[] = [];
  const safeName = narrative.name.replace(/[^a-zA-Z0-9_]/g, '_');

  lines.push(`// StoryWeaver Narrative: ${narrative.name}`);
  lines.push(`[CreateAssetMenu(menuName = "StoryWeaver/${safeName}")]`);
  lines.push(`public class ${safeName}Narrative : ScriptableObject {`);
  lines.push(`    public NarrativeType type = NarrativeType.${capitalizeFirst(narrative.type)};`);
  if (narrative.startChapter) {
    lines.push(`    public string startChapter = "${narrative.startChapter}";`);
  }
  lines.push('');

  for (const chapter of narrative.chapters) {
    lines.push(`    [Header("${chapter.name}")]`);
    lines.push(`    public Chapter ${chapter.name.replace(/[^a-zA-Z0-9_]/g, '_')} = new Chapter {`);
    if (chapter.trigger) lines.push(`        trigger = "${chapter.trigger}",`);
    if (chapter.onComplete) lines.push(`        onComplete = "${chapter.onComplete}",`);

    if (chapter.dialogueLines && chapter.dialogueLines.length > 0) {
      lines.push('        dialogueLines = new DialogueLine[] {');
      for (const dl of chapter.dialogueLines) {
        const parts = [`text = "${dl.text}"`];
        if (dl.speaker) parts.push(`speaker = "${dl.speaker}"`);
        if (dl.emotion) parts.push(`emotion = "${dl.emotion}"`);
        if (dl.duration) parts.push(`duration = ${dl.duration}f`);
        if (dl.voiceClip) parts.push(`voiceClip = "${dl.voiceClip}"`);
        lines.push(`            new DialogueLine { ${parts.join(', ')} },`);
      }
      lines.push('        },');
    }

    if (chapter.choices && chapter.choices.length > 0) {
      lines.push('        choices = new Choice[] {');
      for (const ch of chapter.choices) {
        const parts = [`text = "${ch.text}"`];
        if (ch.nextChapter) parts.push(`nextChapter = "${ch.nextChapter}"`);
        if (ch.condition) parts.push(`condition = "${ch.condition}"`);
        if (ch.action) parts.push(`action = "${ch.action}"`);
        lines.push(`            new Choice { ${parts.join(', ')} },`);
      }
      lines.push('        },');
    }

    lines.push('    };');
  }

  lines.push('}');
  return lines.join('\n');
}

/** Generate Godot 4 GDScript signal-based narrative controller */
export function narrativeToGodot(narrative: CompiledNarrative): string {
  const lines: string[] = [];
  const safeName = narrative.name.replace(/[^a-zA-Z0-9_]/g, '_');

  lines.push(`# StoryWeaver Narrative: ${narrative.name}`);
  lines.push('extends Node');
  lines.push(`class_name ${safeName}Narrative`);
  lines.push('');
  lines.push('signal chapter_started(chapter_name: String)');
  lines.push('signal chapter_complete(chapter_name: String)');
  lines.push('signal dialogue_line(speaker: String, text: String, emotion: String)');
  lines.push('signal choice_presented(choices: Array)');
  lines.push('');
  lines.push(`var narrative_type: String = "${narrative.type}"`);
  lines.push(
    `var current_chapter: String = "${narrative.startChapter || narrative.chapters[0]?.name || ''}"`
  );

  // Chapter data dictionary
  lines.push('');
  lines.push('var chapters: Dictionary = {');
  for (const chapter of narrative.chapters) {
    const chKey = chapter.name.replace(/[^a-zA-Z0-9_]/g, '_');
    lines.push(`    "${chKey}": {`);
    if (chapter.trigger) lines.push(`        "trigger": "${chapter.trigger}",`);
    if (chapter.onComplete) lines.push(`        "on_complete": "${chapter.onComplete}",`);

    if (chapter.dialogueLines && chapter.dialogueLines.length > 0) {
      lines.push('        "dialogue": [');
      for (const dl of chapter.dialogueLines) {
        lines.push(
          `            {"speaker": "${dl.speaker || ''}", "text": "${dl.text}", "emotion": "${dl.emotion || 'neutral'}"},`
        );
      }
      lines.push('        ],');
    }

    if (chapter.choices && chapter.choices.length > 0) {
      lines.push('        "choices": [');
      for (const ch of chapter.choices) {
        lines.push(`            {"text": "${ch.text}", "next": "${ch.nextChapter || ''}"},`);
      }
      lines.push('        ],');
    }

    lines.push('    },');
  }
  lines.push('}');

  // Advance function
  lines.push('');
  lines.push('func advance_chapter(chapter_name: String) -> void:');
  lines.push('    current_chapter = chapter_name');
  lines.push('    chapter_started.emit(chapter_name)');
  lines.push('    if chapters.has(chapter_name):');
  lines.push('        var ch = chapters[chapter_name]');
  lines.push('        if ch.has("dialogue"):');
  lines.push('            for line in ch["dialogue"]:');
  lines.push('                dialogue_line.emit(line["speaker"], line["text"], line["emotion"])');
  lines.push('        if ch.has("choices"):');
  lines.push('            choice_presented.emit(ch["choices"])');
  lines.push('        elif ch.has("on_complete"):');
  lines.push('            chapter_complete.emit(chapter_name)');
  lines.push('            advance_chapter(ch["on_complete"])');

  return lines.join('\n');
}

/** Generate VRChat SDK3 UdonSharp narrative controller */
export function narrativeToVRChat(narrative: CompiledNarrative): string {
  const lines: string[] = [];
  const safeName = narrative.name.replace(/[^a-zA-Z0-9_]/g, '_');

  lines.push(`// StoryWeaver Narrative: ${narrative.name} (VRChat UdonSharp)`);
  lines.push('[UdonBehaviourSyncMode(BehaviourSyncMode.Manual)]');
  lines.push(`public class ${safeName}Narrative : UdonSharpBehaviour {`);
  lines.push('    [UdonSynced] public int currentChapter = 0;');
  lines.push(
    `    private string[] chapterNames = new string[] { ${narrative.chapters.map((c) => `"${c.name}"`).join(', ')} };`
  );
  lines.push('');

  // Trigger detection
  for (let i = 0; i < narrative.chapters.length; i++) {
    const chapter = narrative.chapters[i];
    if (chapter.trigger) {
      lines.push(`    // Trigger for chapter "${chapter.name}": ${chapter.trigger}`);
    }
  }

  lines.push('');
  lines.push('    public void AdvanceChapter() {');
  lines.push('        if (!Networking.IsOwner(gameObject)) {');
  lines.push('            Networking.SetOwner(Networking.LocalPlayer, gameObject);');
  lines.push('        }');
  lines.push('        currentChapter++;');
  lines.push(
    '        if (currentChapter >= chapterNames.Length) currentChapter = chapterNames.Length - 1;'
  );
  lines.push('        RequestSerialization();');
  lines.push('    }');

  lines.push('');
  lines.push('    public override void OnDeserialization() {');
  lines.push('        // Sync chapter state across all players');
  lines.push('        UpdateNarrativeUI();');
  lines.push('    }');

  lines.push('');
  lines.push('    private void UpdateNarrativeUI() {');
  for (let i = 0; i < narrative.chapters.length; i++) {
    const chapter = narrative.chapters[i];
    if (chapter.dialogueLines && chapter.dialogueLines.length > 0) {
      const dl = chapter.dialogueLines[0];
      lines.push(`        if (currentChapter == ${i}) {`);
      lines.push(`            // ${dl.speaker || 'Narrator'}: "${dl.text}"`);
      lines.push('        }');
    }
  }
  lines.push('    }');

  lines.push('}');
  return lines.join('\n');
}

/** Generate React-compatible narrative state for R3F renderer */
export function narrativeToR3F(narrative: CompiledNarrative): string {
  const lines: string[] = [];
  const safeName = narrative.name.replace(/[^a-zA-Z0-9_]/g, '_');

  lines.push(`// StoryWeaver Narrative: ${narrative.name} (R3F/React)`);
  lines.push(`export const ${safeName}NarrativeData = {`);
  lines.push(`  name: "${narrative.name}",`);
  lines.push(`  type: "${narrative.type}",`);
  if (narrative.startChapter) lines.push(`  startChapter: "${narrative.startChapter}",`);

  lines.push('  chapters: [');
  for (const chapter of narrative.chapters) {
    lines.push('    {');
    lines.push(`      name: "${chapter.name}",`);
    if (chapter.trigger) lines.push(`      trigger: "${chapter.trigger}",`);
    if (chapter.onComplete) lines.push(`      onComplete: "${chapter.onComplete}",`);

    if (chapter.dialogueLines && chapter.dialogueLines.length > 0) {
      lines.push('      dialogueLines: [');
      for (const dl of chapter.dialogueLines) {
        const parts: string[] = [`text: "${dl.text}"`];
        if (dl.speaker) parts.push(`speaker: "${dl.speaker}"`);
        if (dl.emotion) parts.push(`emotion: "${dl.emotion}"`);
        if (dl.duration) parts.push(`duration: ${dl.duration}`);
        lines.push(`        { ${parts.join(', ')} },`);
      }
      lines.push('      ],');
    }

    if (chapter.choices && chapter.choices.length > 0) {
      lines.push('      choices: [');
      for (const ch of chapter.choices) {
        const parts: string[] = [`text: "${ch.text}"`];
        if (ch.nextChapter) parts.push(`nextChapter: "${ch.nextChapter}"`);
        if (ch.condition) parts.push(`condition: "${ch.condition}"`);
        lines.push(`        { ${parts.join(', ')} },`);
      }
      lines.push('      ],');
    }

    lines.push('    },');
  }
  lines.push('  ],');
  lines.push('};');

  return lines.join('\n');
}

/** Generate USD customData annotations for AR narratives */
export function narrativeToUSDA(narrative: CompiledNarrative): string {
  const lines: string[] = [];
  const safeName = narrative.name.replace(/[^a-zA-Z0-9_]/g, '_');

  lines.push(`def Scope "Narrative_${safeName}" {`);
  lines.push(`    custom string holoscript:narrativeType = "${narrative.type}"`);
  if (narrative.startChapter) {
    lines.push(`    custom string holoscript:startChapter = "${narrative.startChapter}"`);
  }

  for (const chapter of narrative.chapters) {
    const chName = chapter.name.replace(/[^a-zA-Z0-9_]/g, '_');
    lines.push(`    def Scope "Chapter_${chName}" {`);
    lines.push(`        custom string holoscript:chapterName = "${chapter.name}"`);
    if (chapter.trigger)
      lines.push(`        custom string holoscript:trigger = "${chapter.trigger}"`);
    if (chapter.onComplete)
      lines.push(`        custom string holoscript:onComplete = "${chapter.onComplete}"`);

    if (chapter.dialogueLines) {
      for (let i = 0; i < chapter.dialogueLines.length; i++) {
        const dl = chapter.dialogueLines[i];
        lines.push(`        def Scope "Dialogue_${i}" {`);
        lines.push(`            custom string holoscript:text = "${dl.text}"`);
        if (dl.speaker)
          lines.push(`            custom string holoscript:speaker = "${dl.speaker}"`);
        if (dl.emotion)
          lines.push(`            custom string holoscript:emotion = "${dl.emotion}"`);
        if (dl.duration)
          lines.push(`            custom float holoscript:duration = ${dl.duration}`);
        lines.push('        }');
      }
    }

    if (chapter.choices) {
      for (let i = 0; i < chapter.choices.length; i++) {
        const ch = chapter.choices[i];
        lines.push(`        def Scope "Choice_${i}" {`);
        lines.push(`            custom string holoscript:text = "${ch.text}"`);
        if (ch.nextChapter)
          lines.push(`            custom string holoscript:nextChapter = "${ch.nextChapter}"`);
        if (ch.condition)
          lines.push(`            custom string holoscript:condition = "${ch.condition}"`);
        lines.push('        }');
      }
    }

    if (chapter.cutsceneActions) {
      for (let i = 0; i < chapter.cutsceneActions.length; i++) {
        const ca = chapter.cutsceneActions[i];
        lines.push(`        def Scope "CutsceneAction_${i}" {`);
        lines.push(`            custom string holoscript:actionType = "${ca.type}"`);
        if (ca.target) lines.push(`            custom string holoscript:target = "${ca.target}"`);
        if (ca.duration)
          lines.push(`            custom float holoscript:duration = ${ca.duration}`);
        lines.push('        }');
      }
    }

    lines.push('    }');
  }

  lines.push('}');
  return lines.join('\n');
}

// =============================================================================
// x402 Payment Protocol Compilation
// =============================================================================

import type { CompiledPaywall } from '../parser/HoloCompositionTypes';

export function compilePaymentBlock(block: HoloDomainBlock): CompiledPaywall {
  const props = block.properties || {};

  const paywallType: CompiledPaywall['type'] =
    block.keyword === 'subscription'
      ? 'subscription'
      : block.keyword === 'tip_jar'
        ? 'tip'
        : block.keyword === 'per_use' || props.per_use
          ? 'per_use'
          : 'one_time';

  // Extract gated content from children or property
  const gatedContent: string[] = [];
  if (props.gated_content && Array.isArray(props.gated_content)) {
    gatedContent.push(...(props.gated_content as string[]));
  } else if (typeof props.gated_content === 'string') {
    gatedContent.push(props.gated_content as string);
  }
  for (const child of block.children || []) {
    const c = child as any;
    if (c.name) gatedContent.push(c.name);
  }

  // Extract revenue split
  let revenueSplit: CompiledPaywall['revenueSplit'] | undefined;
  if (props.revenue_split && typeof props.revenue_split === 'object') {
    const rs = props.revenue_split as Record<string, any>;
    revenueSplit = {
      creator: (rs.creator as number) ?? 80,
      platform: (rs.platform as number) ?? 10,
      agent: (rs.agent as number) ?? 10,
    };
  }

  return {
    name: block.name || 'unnamed',
    price: (props.price as number) ?? 0,
    asset: ((props.asset as string) ?? 'USDC') as CompiledPaywall['asset'],
    network: ((props.network as string) ?? 'base') as CompiledPaywall['network'],
    recipient: (props.recipient || props.wallet || '') as string,
    description: (props.description || props.message) as string | undefined,
    type: paywallType,
    gatedContent: gatedContent.length > 0 ? gatedContent : undefined,
    revenueSplit,
  };
}

/** Generate Unity C# ScriptableObject paywall controller */
export function paymentToUnity(paywall: CompiledPaywall): string {
  const lines: string[] = [];
  const safeName = paywall.name.replace(/[^a-zA-Z0-9_]/g, '_');

  lines.push(`// x402 Paywall: ${paywall.name}`);
  lines.push(`[CreateAssetMenu(menuName = "x402/${safeName}")]`);
  lines.push(`public class ${safeName}Paywall : ScriptableObject {`);
  lines.push(`    public decimal price = ${paywall.price}m;`);
  lines.push(`    public string asset = "${paywall.asset}";`);
  lines.push(`    public string network = "${paywall.network}";`);
  lines.push(`    public string recipientWallet = "${paywall.recipient}";`);
  lines.push(`    public string paywallType = "${paywall.type}";`);
  if (paywall.description) {
    lines.push(`    public string description = "${paywall.description}";`);
  }
  if (paywall.gatedContent && paywall.gatedContent.length > 0) {
    lines.push(
      `    public string[] gatedObjects = new string[] { ${paywall.gatedContent.map((g) => `"${g}"`).join(', ')} };`
    );
  }
  if (paywall.revenueSplit) {
    lines.push(
      `    // Revenue split: ${paywall.revenueSplit.creator}% Creator, ${paywall.revenueSplit.platform}% Platform, ${paywall.revenueSplit.agent}% Agent`
    );
  }
  lines.push('');
  lines.push('    public bool IsUnlocked { get; private set; }');
  lines.push('');
  lines.push('    public async Task<bool> RequestPayment() {');
  lines.push('        // HTTP 402 payment flow via x402 protocol');
  lines.push('        var response = await Http.Get(paymentEndpoint);');
  lines.push('        if (response.StatusCode == 402) {');
  lines.push('            var challenge = JsonUtility.FromJson<PaymentChallenge>(response.Body);');
  lines.push('            return await ProcessPayment(challenge);');
  lines.push('        }');
  lines.push('        return false;');
  lines.push('    }');
  lines.push('}');

  return lines.join('\n');
}

/** Generate Godot 4 GDScript payment gate controller */
export function paymentToGodot(paywall: CompiledPaywall): string {
  const lines: string[] = [];
  const safeName = paywall.name.replace(/[^a-zA-Z0-9_]/g, '_');

  lines.push(`# x402 Paywall: ${paywall.name}`);
  lines.push('extends Node');
  lines.push(`class_name ${safeName}Paywall`);
  lines.push('');
  lines.push('signal payment_required(price: float, asset: String)');
  lines.push('signal payment_verified(tx_hash: String)');
  lines.push('signal access_granted');
  lines.push('');
  lines.push(`var price: float = ${paywall.price}`);
  lines.push(`var asset: String = "${paywall.asset}"`);
  lines.push(`var network: String = "${paywall.network}"`);
  lines.push(`var recipient: String = "${paywall.recipient}"`);
  lines.push(`var paywall_type: String = "${paywall.type}"`);
  lines.push('var is_unlocked: bool = false');
  if (paywall.gatedContent && paywall.gatedContent.length > 0) {
    lines.push(
      `var gated_objects: Array = [${paywall.gatedContent.map((g) => `"${g}"`).join(', ')}]`
    );
  }
  lines.push('');
  lines.push('func request_payment() -> void:');
  lines.push('    payment_required.emit(price, asset)');
  lines.push('');
  lines.push('func verify_payment(tx_hash: String) -> void:');
  lines.push('    payment_verified.emit(tx_hash)');
  lines.push('    is_unlocked = true');
  lines.push('    access_granted.emit()');
  if (paywall.gatedContent && paywall.gatedContent.length > 0) {
    lines.push('    for obj_name in gated_objects:');
    lines.push('        var node = get_node_or_null(obj_name)');
    lines.push('        if node: node.visible = true');
  }

  return lines.join('\n');
}

/** Generate VRChat SDK3 UdonSharp paywall controller */
export function paymentToVRChat(paywall: CompiledPaywall): string {
  const lines: string[] = [];
  const safeName = paywall.name.replace(/[^a-zA-Z0-9_]/g, '_');

  lines.push(`// x402 Paywall: ${paywall.name} (VRChat UdonSharp)`);
  lines.push('[UdonBehaviourSyncMode(BehaviourSyncMode.Manual)]');
  lines.push(`public class ${safeName}Paywall : UdonSharpBehaviour {`);
  lines.push('    [UdonSynced] public bool isUnlocked = false;');
  lines.push(`    public float price = ${paywall.price}f;`);
  lines.push(`    public string asset = "${paywall.asset}";`);
  lines.push(`    public string network = "${paywall.network}";`);
  lines.push(`    public string paymentUrl = "https://hololand.app/pay/${safeName}";`);
  if (paywall.gatedContent && paywall.gatedContent.length > 0) {
    lines.push('    public GameObject[] gatedObjects;');
  }
  lines.push('');
  lines.push('    public override void Interact() {');
  lines.push('        if (!isUnlocked) {');
  lines.push('            VRCUrl url = new VRCUrl(paymentUrl);');
  lines.push('        }');
  lines.push('    }');
  lines.push('');
  lines.push('    public void OnPaymentVerified() {');
  lines.push('        if (!Networking.IsOwner(gameObject)) {');
  lines.push('            Networking.SetOwner(Networking.LocalPlayer, gameObject);');
  lines.push('        }');
  lines.push('        isUnlocked = true;');
  lines.push('        RequestSerialization();');
  lines.push('    }');
  lines.push('');
  lines.push('    public override void OnDeserialization() {');
  if (paywall.gatedContent && paywall.gatedContent.length > 0) {
    lines.push('        foreach (var obj in gatedObjects) {');
    lines.push('            if (obj != null) obj.SetActive(isUnlocked);');
    lines.push('        }');
  }
  lines.push('    }');
  lines.push('}');

  return lines.join('\n');
}

/** Generate React-compatible payment gate config for R3F renderer */
export function paymentToR3F(paywall: CompiledPaywall): string {
  const lines: string[] = [];
  const safeName = paywall.name.replace(/[^a-zA-Z0-9_]/g, '_');

  lines.push(`// x402 Paywall: ${paywall.name} (R3F/React)`);
  lines.push(`export const ${safeName}PaywallConfig = {`);
  lines.push(`  name: "${paywall.name}",`);
  lines.push(`  price: ${paywall.price},`);
  lines.push(`  asset: "${paywall.asset}",`);
  lines.push(`  network: "${paywall.network}",`);
  lines.push(`  recipient: "${paywall.recipient}",`);
  lines.push(`  type: "${paywall.type}",`);
  if (paywall.description) {
    lines.push(`  description: "${paywall.description}",`);
  }
  if (paywall.gatedContent && paywall.gatedContent.length > 0) {
    lines.push(`  gatedContent: [${paywall.gatedContent.map((g) => `"${g}"`).join(', ')}],`);
  }
  if (paywall.revenueSplit) {
    lines.push(
      `  revenueSplit: { creator: ${paywall.revenueSplit.creator}, platform: ${paywall.revenueSplit.platform}, agent: ${paywall.revenueSplit.agent} },`
    );
  }
  lines.push('};');

  return lines.join('\n');
}

/** Generate USD customData annotations for AR monetization */
export function paymentToUSDA(paywall: CompiledPaywall): string {
  const lines: string[] = [];
  const safeName = paywall.name.replace(/[^a-zA-Z0-9_]/g, '_');

  lines.push(`def Scope "Paywall_${safeName}" {`);
  lines.push(`    custom string holoscript:paywallType = "${paywall.type}"`);
  lines.push(`    custom float holoscript:price = ${paywall.price}`);
  lines.push(`    custom string holoscript:asset = "${paywall.asset}"`);
  lines.push(`    custom string holoscript:network = "${paywall.network}"`);
  if (paywall.recipient) {
    lines.push(`    custom string holoscript:recipient = "${paywall.recipient}"`);
  }
  if (paywall.description) {
    lines.push(`    custom string holoscript:description = "${paywall.description}"`);
  }
  if (paywall.gatedContent && paywall.gatedContent.length > 0) {
    lines.push(
      `    custom string[] holoscript:gatedContent = [${paywall.gatedContent.map((g) => `"${g}"`).join(', ')}]`
    );
  }
  if (paywall.revenueSplit) {
    lines.push(`    custom float holoscript:revenueSplitCreator = ${paywall.revenueSplit.creator}`);
    lines.push(
      `    custom float holoscript:revenueSplitPlatform = ${paywall.revenueSplit.platform}`
    );
    lines.push(`    custom float holoscript:revenueSplitAgent = ${paywall.revenueSplit.agent}`);
  }
  lines.push('}');

  return lines.join('\n');
}

// =============================================================================
// Domain Block Router
// =============================================================================

export type DomainCompileFn = (block: HoloDomainBlock) => string;

/** Route domain blocks to appropriate compilation function */
export function compileDomainBlocks(
  blocks: HoloDomainBlock[],
  handlers: Partial<Record<HoloDomainType, DomainCompileFn>>,
  fallback?: DomainCompileFn
): string[] {
  return blocks.map((block) => {
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

// =============================================================================
// ANS Capability Path (P5 Compiler Fleet Migration)
// =============================================================================

/**
 * ANS capability path for the DomainBlockCompilerMixin.
 *
 * Since DomainBlockCompilerMixin is a utility module (not a CompilerBase subclass),
 * it exposes its required capability as an exported constant and helper function.
 */
export const DOMAIN_BLOCK_COMPILER_MIXIN_CAPABILITY: ANSCapabilityPathValue =
  ANSCapabilityPath.DOMAIN_BLOCK;

/**
 * Get the ANS capability namespace path for DomainBlockCompilerMixin.
 *
 * Mirrors the `getRequiredCapability()` pattern used by CompilerBase subclasses,
 * adapted for a standalone utility module.
 *
 * @returns The ANS capability path "/compile/mixin/domain-block"
 */
export function getRequiredCapability(): ANSCapabilityPathValue {
  return ANSCapabilityPath.DOMAIN_BLOCK;
}
