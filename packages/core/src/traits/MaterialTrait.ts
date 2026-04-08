/**
 * @holoscript/core Material Trait
 *
 * Enables advanced material and shader properties for photorealistic rendering
 * Supports PBR (Physically Based Rendering) workflows
 *
 * W.SIG25.06: Neural shading evaluation path for complex material reproduction.
 * P.SIG25.01: GS-editable materials for VR-Doh sculpting pattern.
 */

export type MaterialType =
  | 'pbr'
  | 'standard'
  | 'unlit'
  | 'transparent'
  | 'volumetric'
  | 'custom'
  | 'neural';
export type TextureChannel =
  | 'baseColor'
  | 'normalMap'
  | 'roughnessMap'
  | 'metallicMap'
  | 'ambientOcclusionMap'
  | 'emissionMap'
  | 'heightMap'
  | 'coatNormalMap'
  | 'specularColorMap'
  | 'detailNormalMap'
  | 'displacementMap'
  | 'glintMap'
  | 'sheenColorMap'
  | 'anisotropyDirectionMap'
  | 'subsurfaceThicknessMap'
  | 'weatheringMaskMap';

/**
 * Texture map configuration
 */
export interface TextureMap {
  /** Texture path or URL */
  path: string;

  /** Channel this texture maps to */
  channel: TextureChannel;

  /** UV scale (tiling) */
  scale?: { x: number; y: number };

  /** UV offset */
  offset?: { x: number; y: number };

  /** Texture filtering: linear, nearest, anisotropic */
  filter?: 'linear' | 'nearest' | 'anisotropic';

  /** Anisotropic level (1-16) */
  anisotropy?: number;
}

/**
 * PBR Material properties
 */
export interface PBRMaterial {
  /** Base color in linear space [0-1] */
  baseColor: { r: number; g: number; b: number; a?: number };

  /** Metallic value 0-1 */
  metallic: number;

  /** Roughness value 0-1 */
  roughness: number;

  /** Ambient occlusion 0-1 */
  ambientOcclusion?: number;

  /** Emission color and intensity */
  emission?: {
    color: { r: number; g: number; b: number };
    intensity: number;
  };

  /** Normal map strength */
  normalStrength?: number;

  /** Parallax/height map strength */
  parallaxHeight?: number;

  /** Index of refraction for transmission */
  ior?: number;

  /** Transmission amount for transparent materials */
  transmission?: number;

  // =========================================================================
  // ADVANCED PBR — SSS, Sheen, Anisotropy
  // =========================================================================

  /** Subsurface scattering — light penetrating and scattering inside the surface */
  subsurface?: {
    /** Thickness for light attenuation (0 = infinitely thin) */
    thickness: number;
    /** Color of light after passing through the material */
    attenuationColor: { r: number; g: number; b: number };
    /** Distance light travels before full attenuation (world units) */
    attenuationDistance: number;
  };

  /** Sheen — soft fuzzy reflection for fabrics and textiles */
  sheen?: {
    /** Sheen intensity 0-1 */
    intensity: number;
    /** Sheen tint color */
    color: { r: number; g: number; b: number };
    /** Sheen roughness 0-1 (low = silk shimmer, high = cotton diffuse glow) */
    roughness: number;
  };

  /** Anisotropy — directional roughness for brushed metal, hair, silk fibers */
  anisotropy?: {
    /** Anisotropy strength 0-1 (0 = isotropic, 1 = fully directional) */
    strength: number;
    /** Rotation angle in radians (0 = horizontal, PI/2 = vertical) */
    rotation: number;
  };

  /** Clearcoat — protective top layer (car paint, lacquer, varnished wood) */
  clearcoat?: {
    /** Clearcoat intensity 0-1 */
    intensity: number;
    /** Clearcoat roughness 0-1 */
    roughness: number;
  };

  /** Iridescence — thin-film interference (oil slicks, soap bubbles, beetle shells) */
  iridescence?: {
    /** Iridescence intensity 0-1 */
    intensity: number;
    /** IOR of the thin film layer */
    ior: number;
    /** Thickness range of the thin film in nanometers [min, max] */
    thicknessRange?: [number, number];
  };

  // =========================================================================
  // EXOTIC OPTICS — sparkle, fluorescence, blackbody, retroreflection
  // =========================================================================

  /** Sparkle/glitter — stochastic micro-facet flashing (glitter, metallic paint flake, mica) */
  sparkle?: {
    /** Particle density per unit area 0-1 */
    density: number;
    /** Micro-facet size 0-1 */
    size: number;
    /** Flash intensity 0-1 */
    intensity: number;
  };

  /** Fluorescence — absorb short wavelengths, emit longer ones (UV paint, deep-sea creatures) */
  fluorescence?: {
    /** Color that triggers the fluorescent response */
    excitationColor: { r: number; g: number; b: number };
    /** Color emitted by the fluorescent material */
    emissionColor: { r: number; g: number; b: number };
    /** Fluorescence intensity 0-1 */
    intensity: number;
  };

  /** Blackbody temperature in Kelvin — maps to emission color via Planck's law
   *  1000K=deep red, 3000K=orange, 5500K=white, 10000K=blue-white */
  blackbodyTemperature?: number;

  /** Retroreflection — light bounces back toward source (road signs, safety vests, cat's eyes) 0-1 */
  retroreflection?: number;

  // =========================================================================
  // DYNAMIC MATERIALS — animated, weathering, dual-layer
  // =========================================================================

  /** Animated material — time-varying surface patterns */
  animated?: {
    /** Animation pattern type */
    pattern: 'ripple' | 'flicker' | 'pulse' | 'flow' | 'breathe' | 'scroll' | 'wave' | 'noise';
    /** Animation speed multiplier */
    speed: number;
    /** Effect amplitude 0-1 */
    amplitude: number;
    /** Optional direction for directional patterns [x, y] */
    direction?: [number, number];
  };

  /** Weathering — progressive surface degradation over time */
  weathering?: {
    /** Weathering effect type */
    type:
      | 'rust'
      | 'moss'
      | 'crack'
      | 'peel'
      | 'patina'
      | 'frost'
      | 'burn'
      | 'erosion'
      | 'stain'
      | 'dust';
    /** Weathering progress 0-1 (0=pristine, 1=fully weathered) */
    progress: number;
    /** Randomization seed for consistent procedural patterns */
    seed?: number;
  };

  /** Dual-layer material — composite of two materials blended together */
  dualLayer?: {
    /** Top layer material preset name */
    topMaterial: string;
    /** Blend factor 0-1 (0=base only, 1=top only) */
    blendFactor: number;
    /** How the layers blend */
    blendMode: 'linear' | 'height' | 'noise' | 'fresnel';
  };
}

/**
 * Volumetric material — non-surface phenomena rendered via ray marching
 * (fog, smoke, fire, clouds, dust, aurora, nebula, god rays)
 */
export interface VolumetricMaterial {
  /** Volume type for preset behavior */
  volumeType:
    | 'fog'
    | 'smoke'
    | 'fire'
    | 'clouds'
    | 'dust'
    | 'mist'
    | 'steam'
    | 'aurora'
    | 'nebula'
    | 'underwater'
    | 'god_rays'
    | 'neon_gas';

  /** Base density 0-1 (how opaque the volume is) */
  density: number;

  /** Scattering coefficient — how much light scatters within the volume */
  scattering: number;

  /** Absorption coefficient — how much light is absorbed */
  absorption: number;

  /** Emission color and intensity for self-luminous volumes (fire, neon) */
  emission?: {
    color: { r: number; g: number; b: number };
    intensity: number;
  };

  /** Base color / albedo of the volume */
  color?: { r: number; g: number; b: number };

  /** Noise parameters for density variation */
  noise?: {
    /** Noise type */
    type: 'perlin' | 'worley' | 'fbm' | 'curl';
    /** Scale of noise pattern */
    scale: number;
    /** Number of octaves for fbm */
    octaves?: number;
    /** Lacunarity (frequency multiplier per octave) */
    lacunarity?: number;
    /** Gain (amplitude multiplier per octave) */
    gain?: number;
  };

  /** Animation parameters for temporal effects */
  animation?: {
    /** Wind direction and speed [x, y, z] */
    wind?: [number, number, number];
    /** Turbulence intensity 0-1 */
    turbulence?: number;
    /** Rise speed for buoyant volumes (fire, smoke) */
    riseSpeed?: number;
    /** Dissipation rate — how quickly the volume fades */
    dissipation?: number;
  };

  /** Ray marching quality settings */
  quality?: {
    /** Number of ray march steps (higher = better quality, slower) */
    steps?: number;
    /** Maximum ray distance */
    maxDistance?: number;
    /** Light marching steps for shadow/scattering */
    lightSteps?: number;
  };

  /** Height-based density falloff */
  heightFalloff?: {
    /** Ground level Y */
    groundLevel: number;
    /** Falloff rate (higher = sharper boundary) */
    falloff: number;
  };

  /** Temperature field for fire/thermal volumes — drives emission color */
  temperature?: {
    /** Base temperature in Kelvin */
    base: number;
    /** Temperature variation range */
    variation: number;
    /** Cooling rate with height */
    coolingRate: number;
  };
}

/**
 * Material configuration
 */
export interface MaterialConfig {
  /** Material type */
  type: MaterialType;

  /** Material name for reuse */
  name?: string;

  /** PBR properties (for PBR materials) */
  pbr?: PBRMaterial;

  /** Volumetric properties (for volumetric materials — fog, smoke, fire, clouds) */
  volumetric?: VolumetricMaterial;

  /** Texture maps */
  textures?: TextureMap[];

  /** Double-sided rendering */
  doubleSided?: boolean;

  /** Blend mode for transparency */
  blendMode?: 'opaque' | 'blend' | 'additive' | 'multiply';

  /** Custom shader code/reference */
  customShader?: {
    vertex?: string;
    fragment?: string;
    shaderLanguage?: 'glsl' | 'hlsl' | 'shadergraph';
  };

  /** GPU memory optimization hints */
  optimization?: {
    /** Stream textures if needed */
    streamTextures?: boolean;

    /** Compress textures */
    compression?: 'none' | 'dxt' | 'astc' | 'basis';

    /** Instance this material */
    instanced?: boolean;

    /** LOD bias for texture streaming */
    lodBias?: number;
  };

  /** W.SIG25.06: Neural material configuration (for type 'neural') */
  neural?: NeuralMaterialConfig;

  /** P.SIG25.01: GS-editable configuration for VR sculpting */
  gsEditable?: GSEditableConfig;
}

/**
 * W.SIG25.06: Neural Material Configuration.
 * Uses a trained neural network to evaluate material appearance,
 * replacing expensive PBR calculations for complex phenomena
 * (subsurface scattering, iridescence, caustics) at <1ms.
 */
export interface NeuralMaterialConfig {
  /** Path to the trained model weights (ONNX or TFLite) */
  modelPath: string;
  /** Input features the model expects */
  inputFeatures: NeuralInputFeature[];
  /** Inference device */
  device: 'gpu' | 'cpu' | 'npu';
  /** Maximum inference time budget in ms (default: 1.0) */
  maxInferenceMs: number;
  /** Fallback material type if inference fails */
  fallbackType: MaterialType;
}

/** Input features for neural material evaluation */
export type NeuralInputFeature =
  | 'view_direction'
  | 'light_direction'
  | 'surface_normal'
  | 'uv_coordinates'
  | 'world_position'
  | 'time';

/**
 * P.SIG25.01: GS-Editable Configuration.
 * Exposes per-splat material editing for VR sculpting workflows.
 * Based on VR-Doh real-time GS scene sculpting (SIGGRAPH 2025).
 */
export interface GSEditableConfig {
  /** Whether per-splat editing is enabled */
  enabled: boolean;
  /** Maximum edit radius in world units */
  maxEditRadius: number;
  /** Edit brush type */
  brushType: 'paint' | 'sculpt' | 'erase' | 'clone';
  /** Undo buffer size (number of steps) */
  undoSteps: number;
  /** Whether edits are synced in multiplayer */
  networkSync: boolean;
}

/**
 * MaterialTrait - Enables photorealistic material rendering
 */
export class MaterialTrait {
  private material: MaterialConfig;
  private textureCache: Map<string, any> = new Map();

  constructor(config: MaterialConfig) {
    this.material = {
      ...{ type: 'pbr' as const },
      ...config,
    };
  }

  /**
   * Get material properties
   */
  public getMaterial(): MaterialConfig {
    return { ...this.material };
  }

  /**
   * Update material property
   */
  public setProperty<K extends keyof MaterialConfig>(key: K, value: MaterialConfig[K]): void {
    this.material[key] = value;
  }

  /**
   * Get PBR properties
   */
  public getPBRProperties(): PBRMaterial | undefined {
    return this.material.pbr;
  }

  /**
   * Update PBR material
   */
  public updatePBR(pbr: Partial<PBRMaterial>): void {
    if (!this.material.pbr) {
      this.material.pbr = {
        baseColor: { r: 1, g: 1, b: 1 },
        metallic: 0,
        roughness: 0.5,
      };
    }
    this.material.pbr = { ...this.material.pbr, ...pbr };
  }

  /**
   * Add texture map
   */
  public addTexture(texture: TextureMap): void {
    if (!this.material.textures) {
      this.material.textures = [];
    }
    this.material.textures.push(texture);
  }

  /**
   * Get all textures
   */
  public getTextures(): TextureMap[] {
    return [...(this.material.textures || [])];
  }

  /**
   * Clear texture cache (for memory optimization)
   */
  public clearTextureCache(): void {
    this.textureCache.clear();
  }

  /**
   * Get shader code if custom
   */
  public getCustomShader() {
    return this.material.customShader;
  }

  /**
   * Set custom shader
   */
  public setCustomShader(shader: MaterialConfig['customShader']): void {
    this.material.customShader = shader;
  }

  /**
   * Get optimization hints
   */
  public getOptimization(): MaterialConfig['optimization'] {
    return this.material.optimization;
  }

  /**
   * Enable/disable texture streaming
   */
  public setTextureStreaming(enabled: boolean): void {
    if (!this.material.optimization) {
      this.material.optimization = {};
    }
    this.material.optimization.streamTextures = enabled;
  }

  /**
   * Set texture compression
   */
  public setCompression(compression: 'none' | 'dxt' | 'astc' | 'basis'): void {
    if (!this.material.optimization) {
      this.material.optimization = {};
    }
    this.material.optimization.compression = compression;
  }

  /**
   * Enable material instancing for performance
   */
  public setInstanced(instanced: boolean): void {
    if (!this.material.optimization) {
      this.material.optimization = {};
    }
    this.material.optimization.instanced = instanced;
  }

  /**
   * Dispose and cleanup
   */
  public dispose(): void {
    this.textureCache.clear();
  }
}

/**
 * HoloScript+ @material trait factory
 */
export function createMaterialTrait(config: MaterialConfig): MaterialTrait {
  return new MaterialTrait(config);
}

/**
 * Preset materials for common use cases
 */
export const MATERIAL_PRESETS = {
  /** Shiny metal */
  chrome: (): MaterialConfig => ({
    type: 'pbr',
    pbr: {
      baseColor: { r: 0.77, g: 0.77, b: 0.77 },
      metallic: 1.0,
      roughness: 0.1,
    },
  }),

  /** Rough plastic */
  plastic: (): MaterialConfig => ({
    type: 'pbr',
    pbr: {
      baseColor: { r: 1, g: 1, b: 1 },
      metallic: 0,
      roughness: 0.8,
    },
  }),

  /** Wood texture */
  wood: (): MaterialConfig => ({
    type: 'pbr',
    pbr: {
      baseColor: { r: 0.6, g: 0.4, b: 0.2 },
      metallic: 0,
      roughness: 0.4,
    },
  }),

  /** Glass */
  glass: (): MaterialConfig => ({
    type: 'transparent',
    blendMode: 'blend',
    pbr: {
      baseColor: { r: 1, g: 1, b: 1, a: 0.3 },
      metallic: 0,
      roughness: 0.0,
      ior: 1.5,
      transmission: 0.9,
    },
  }),

  /** Emissive (glowing) */
  emissive: (): MaterialConfig => ({
    type: 'pbr',
    pbr: {
      baseColor: { r: 0, g: 1, b: 0 },
      metallic: 0,
      roughness: 1.0,
      emission: {
        color: { r: 0, g: 1, b: 0 },
        intensity: 2.0,
      },
    },
  }),

  /** Skin material */
  skin: (): MaterialConfig => ({
    type: 'pbr',
    pbr: {
      baseColor: { r: 1, g: 0.8, b: 0.7 },
      metallic: 0,
      roughness: 0.5,
      ambientOcclusion: 0.8,
    },
  }),
};

// ── Handler (delegates to MaterialTrait) ──
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent, TraitInstanceDelegate } from './TraitTypes';

export const materialHandler = {
  name: 'material',
  defaultConfig: {},
  onAttach(node: HSPlusNode, config: unknown, ctx: TraitContext): void {
    // @ts-expect-error
    const instance = new MaterialTrait(config);
    node.__material_instance = instance;
    ctx.emit('material_attached', { node, config });
  },
  onDetach(node: HSPlusNode, _config: unknown, ctx: TraitContext): void {
    const instance = node.__material_instance as TraitInstanceDelegate;
    if (instance) {
      if (typeof instance.onDetach === 'function') instance.onDetach(node, ctx);
      else if (typeof instance.dispose === 'function') instance.dispose();
      else if (typeof instance.cleanup === 'function') instance.cleanup();
    }
    ctx.emit('material_detached', { node });
    delete node.__material_instance;
  },
  onEvent(node: HSPlusNode, _config: unknown, ctx: TraitContext, event: TraitEvent): void {
    const instance = node.__material_instance as TraitInstanceDelegate;
    if (!instance) return;
    if (typeof instance.onEvent === 'function') instance.onEvent(event);
    else if (typeof instance.emit === 'function' && event.type) instance.emit(event);
    if (event.type === 'material_configure' && event.payload) {
      Object.assign(instance, event.payload);
      ctx.emit('material_configured', { node });
    }
  },
  onUpdate(node: HSPlusNode, _config: unknown, ctx: TraitContext, dt: number): void {
    const instance = node.__material_instance as TraitInstanceDelegate;
    if (!instance) return;
    if (typeof instance.onUpdate === 'function') instance.onUpdate(node, ctx, dt);
  },
} as const satisfies TraitHandler;
