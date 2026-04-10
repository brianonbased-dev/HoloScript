/**
 * UnifiedPBRSchema.ts
 *
 * Unified PBR material schema that both MaterialEditor.ts and MaterialLibrary.ts
 * should converge on. Defines the single canonical `PBRMaterialProperties`
 * interface covering ALL physical properties with proper defaults and validation.
 *
 * Background (from MEMORY.md W.040):
 *   HoloScript's trait system supports advanced PBR (SSS, iridescence,
 *   16 texture channels, custom shaders, 78 material presets) but the R3F
 *   renderer only outputs basic meshPhysicalMaterial with color/metalness/roughness.
 *   This schema is the single source of truth for what PBR properties exist
 *   and what their valid ranges are.
 *
 * Relationship to existing types:
 *   - `MaterialDef` (MaterialLibrary.ts) covers core PBR + rendering flags
 *   - `MaterialEditor` (MaterialEditor.ts) re-exports MaterialDef
 *   - This file EXTENDS the schema with advanced physical properties
 *     (transmission, subsurface, iridescence, clearcoat, sheen, anisotropy)
 *     that the existing MaterialDef lacks but the trait system supports
 *
 * Usage:
 * ```typescript
 * import { createDefaultPBRProperties, validatePBRProperties } from './UnifiedPBRSchema';
 *
 * const props = createDefaultPBRProperties('my-material');
 * props.transmission = 0.95;     // Glass-like
 * props.subsurface.weight = 0.8; // Skin-like SSS
 *
 * const errors = validatePBRProperties(props);
 * if (errors.length > 0) console.error('Validation failed:', errors);
 * ```
 *
 * @module rendering
 * @see packages/core/src/rendering/MaterialLibrary.ts
 * @see packages/core/src/tools/MaterialEditor.ts
 * @version 1.0.0
 * @package @holoscript/examples
 */

// =============================================================================
// BASE TYPES (re-exported from MaterialLibrary for convenience)
// =============================================================================

/** Blend mode for rendering */
export type BlendMode = 'opaque' | 'transparent' | 'additive' | 'multiply' | 'premultiplied-alpha';

/** Face culling mode */
export type CullMode = 'none' | 'front' | 'back';

/** Material type classification */
export type MaterialType =
  | 'standard'
  | 'physical'
  | 'basic'
  | 'emissive'
  | 'toon'
  | 'glass'
  | 'metal'
  | 'subsurface'
  | 'cloth'
  | 'hair'
  | 'eye'
  | 'custom';

/** Alpha mode per glTF 2.0 spec */
export type AlphaMode = 'OPAQUE' | 'MASK' | 'BLEND';

// =============================================================================
// COLOR & TEXTURE TYPES
// =============================================================================

/** Linear RGBA color (0-1 per channel) */
export interface LinearColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** Linear RGB color (0-1 per channel, no alpha) */
export interface LinearRGB {
  r: number;
  g: number;
  b: number;
}

/** UV tiling and offset for texture mapping */
export interface UVTransform {
  tiling: { x: number; y: number };
  offset: { x: number; y: number };
  rotation: number; // Radians
}

/**
 * Texture reference with full UV configuration.
 * Texture IDs reference assets managed by the asset pipeline.
 */
export interface TextureReference {
  /** Asset ID of the texture */
  textureId: string;

  /** UV channel index (0-3) */
  uvChannel: number;

  /** UV transform (tiling, offset, rotation) */
  uvTransform: UVTransform;

  /** Texture intensity/strength multiplier (0-1) */
  intensity: number;

  /** sRGB color space flag (true for albedo/emissive, false for data textures) */
  sRGB: boolean;
}

// =============================================================================
// ADVANCED PHYSICAL PROPERTY GROUPS
// =============================================================================

/**
 * Subsurface scattering (SSS) properties.
 * Used for skin, wax, marble, jade, milk, etc.
 */
export interface SubsurfaceProperties {
  /** SSS weight / intensity (0-1) */
  weight: number;

  /** Scattering color (light color after subsurface transport) */
  color: LinearRGB;

  /** Scattering radius per RGB channel (in scene units) */
  radius: { r: number; g: number; b: number };

  /** Thin-walled mode (for leaves, paper, etc.) */
  thinWalled: boolean;

  /** Subsurface texture map */
  map?: TextureReference;
}

/**
 * Transmission properties for glass, water, and transparent materials.
 * Implements KHR_materials_transmission + KHR_materials_volume.
 */
export interface TransmissionProperties {
  /** Transmission factor (0=opaque, 1=fully transmissive) */
  factor: number;

  /** Index of refraction (1.0=air, 1.33=water, 1.5=glass, 2.42=diamond) */
  ior: number;

  /** Volume thickness for absorption (scene units) */
  thickness: number;

  /** Absorption color (color of transmitted light after distance) */
  attenuationColor: LinearRGB;

  /** Absorption distance (scene units before full absorption) */
  attenuationDistance: number;

  /** Dispersion amount (chromatic aberration, 0=none) */
  dispersion: number;

  /** Transmission texture map */
  map?: TextureReference;

  /** Thickness texture map */
  thicknessMap?: TextureReference;
}

/**
 * Iridescence properties (thin-film interference).
 * Implements KHR_materials_iridescence.
 * Used for soap bubbles, oil slicks, beetle shells, etc.
 */
export interface IridescenceProperties {
  /** Iridescence intensity (0-1) */
  factor: number;

  /** Index of refraction of the thin film */
  ior: number;

  /** Thin film thickness range in nanometers */
  thicknessRange: { min: number; max: number };

  /** Iridescence intensity map */
  map?: TextureReference;

  /** Iridescence thickness map (remaps to thicknessRange) */
  thicknessMap?: TextureReference;
}

/**
 * Clearcoat properties (automotive paint, lacquered wood).
 * Implements KHR_materials_clearcoat.
 */
export interface ClearcoatProperties {
  /** Clearcoat intensity (0-1) */
  factor: number;

  /** Clearcoat roughness (0-1) */
  roughness: number;

  /** Clearcoat intensity map */
  map?: TextureReference;

  /** Clearcoat roughness map */
  roughnessMap?: TextureReference;

  /** Clearcoat normal map (independent from base normal) */
  normalMap?: TextureReference;

  /** Clearcoat normal scale */
  normalScale: number;
}

/**
 * Sheen properties (cloth, velvet, microfiber).
 * Implements KHR_materials_sheen.
 */
export interface SheenProperties {
  /** Sheen color */
  color: LinearRGB;

  /** Sheen roughness (0-1) */
  roughness: number;

  /** Sheen color map */
  colorMap?: TextureReference;

  /** Sheen roughness map */
  roughnessMap?: TextureReference;
}

/**
 * Anisotropy properties (brushed metal, hair, silk).
 * Implements KHR_materials_anisotropy.
 */
export interface AnisotropyProperties {
  /** Anisotropy strength (-1 to 1, 0=isotropic) */
  strength: number;

  /** Anisotropy rotation in radians (direction of anisotropy) */
  rotation: number;

  /** Anisotropy direction/strength map */
  map?: TextureReference;
}

/**
 * Specular properties (allows decoupling specular from metallic).
 * Implements KHR_materials_specular.
 */
export interface SpecularProperties {
  /** Specular intensity factor (0-1, default 1.0) */
  factor: number;

  /** Specular color tint */
  color: LinearRGB;

  /** Specular intensity map */
  map?: TextureReference;

  /** Specular color map */
  colorMap?: TextureReference;
}

// =============================================================================
// UNIFIED PBR MATERIAL PROPERTIES
// =============================================================================

/**
 * Complete PBR material properties interface.
 *
 * This is the single canonical schema for ALL PBR material properties
 * across HoloScript. Every rendering backend (R3F, Babylon, Three.js,
 * Unity, Unreal, Godot, WebGPU) maps FROM this schema to their
 * native material representations.
 *
 * Property groups follow the glTF 2.0 PBR metallic-roughness model
 * with KHR extensions for advanced features.
 */
export interface PBRMaterialProperties {
  // --- Identity ---

  /** Unique material identifier */
  id: string;

  /** Human-readable material name */
  name: string;

  /** Material type classification for editor UI */
  materialType: MaterialType;

  /** Material version for change tracking */
  version: number;

  /** Tags for categorization and search */
  tags: string[];

  // --- Base Color (Albedo) ---

  /** Base color in linear RGBA */
  baseColor: LinearColor;

  /** Base color / albedo texture map */
  baseColorMap?: TextureReference;

  // --- Metallic-Roughness ---

  /** Metalness factor (0=dielectric, 1=metal) */
  metalness: number;

  /** Roughness factor (0=mirror, 1=diffuse) */
  roughness: number;

  /** Combined metallic-roughness map (G=roughness, B=metallic per glTF) */
  metallicRoughnessMap?: TextureReference;

  // --- Normal ---

  /** Normal map */
  normalMap?: TextureReference;

  /** Normal map scale / intensity */
  normalScale: number;

  // --- Ambient Occlusion ---

  /** Ambient occlusion map */
  aoMap?: TextureReference;

  /** AO intensity (0-1) */
  aoIntensity: number;

  // --- Emission ---

  /** Emissive color (linear RGB) */
  emissive: LinearRGB;

  /** Emissive intensity multiplier */
  emissiveIntensity: number;

  /** Emissive texture map */
  emissiveMap?: TextureReference;

  // --- Displacement / Height ---

  /** Displacement / height map */
  displacementMap?: TextureReference;

  /** Displacement scale */
  displacementScale: number;

  /** Displacement bias */
  displacementBias: number;

  // --- Light Map ---

  /** Baked light map */
  lightMap?: TextureReference;

  /** Light map intensity */
  lightMapIntensity: number;

  // --- Advanced PBR Groups ---

  /** Subsurface scattering (skin, wax, marble) */
  subsurface: SubsurfaceProperties;

  /** Transmission (glass, water, gems) */
  transmission: TransmissionProperties;

  /** Iridescence (thin-film interference) */
  iridescence: IridescenceProperties;

  /** Clearcoat (automotive paint, lacquer) */
  clearcoat: ClearcoatProperties;

  /** Sheen (cloth, velvet) */
  sheen: SheenProperties;

  /** Anisotropy (brushed metal, hair) */
  anisotropy: AnisotropyProperties;

  /** Specular (decoupled from metallic) */
  specular: SpecularProperties;

  // --- Rendering Flags ---

  /** Blend mode */
  blendMode: BlendMode;

  /** Alpha mode per glTF spec */
  alphaMode: AlphaMode;

  /** Alpha cutoff for MASK mode (0-1) */
  alphaCutoff: number;

  /** Face culling mode */
  cullMode: CullMode;

  /** Enable depth writing */
  depthWrite: boolean;

  /** Enable depth testing */
  depthTest: boolean;

  /** Double-sided rendering */
  doubleSided: boolean;

  /** Cast shadows */
  castShadow: boolean;

  /** Receive shadows */
  receiveShadow: boolean;

  /** Flat shading (no smooth interpolation) */
  flatShading: boolean;

  /** Wireframe rendering */
  wireframe: boolean;

  // --- Custom / Extension ---

  /** Shader graph ID (for custom node-based shaders) */
  shaderGraphId?: string;

  /** Custom uniform values for shader graph */
  customUniforms?: Record<string, number | number[] | string>;

  /** Arbitrary extension properties */
  extensions?: Record<string, unknown>;
}

// =============================================================================
// DEFAULT VALUES
// =============================================================================

/** Default subsurface properties (disabled) */
export const DEFAULT_SUBSURFACE: SubsurfaceProperties = {
  weight: 0,
  color: { r: 1, g: 0.2, b: 0.1 },
  radius: { r: 1.0, g: 0.2, b: 0.1 },
  thinWalled: false,
};

/** Default transmission properties (opaque) */
export const DEFAULT_TRANSMISSION: TransmissionProperties = {
  factor: 0,
  ior: 1.5,
  thickness: 0,
  attenuationColor: { r: 1, g: 1, b: 1 },
  attenuationDistance: Infinity,
  dispersion: 0,
};

/** Default iridescence properties (disabled) */
export const DEFAULT_IRIDESCENCE: IridescenceProperties = {
  factor: 0,
  ior: 1.3,
  thicknessRange: { min: 100, max: 400 },
};

/** Default clearcoat properties (disabled) */
export const DEFAULT_CLEARCOAT: ClearcoatProperties = {
  factor: 0,
  roughness: 0,
  normalScale: 1,
};

/** Default sheen properties (disabled) */
export const DEFAULT_SHEEN: SheenProperties = {
  color: { r: 0, g: 0, b: 0 },
  roughness: 1,
};

/** Default anisotropy properties (isotropic) */
export const DEFAULT_ANISOTROPY: AnisotropyProperties = {
  strength: 0,
  rotation: 0,
};

/** Default specular properties (standard dielectric) */
export const DEFAULT_SPECULAR: SpecularProperties = {
  factor: 1,
  color: { r: 1, g: 1, b: 1 },
};

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

/**
 * Create a PBRMaterialProperties object with sensible defaults.
 * All advanced property groups start disabled (zero intensity).
 */
export function createDefaultPBRProperties(
  id: string,
  name?: string,
  materialType: MaterialType = 'standard'
): PBRMaterialProperties {
  return {
    id,
    name: name ?? id,
    materialType,
    version: 1,
    tags: [],

    baseColor: { r: 0.8, g: 0.8, b: 0.8, a: 1.0 },
    metalness: 0,
    roughness: 0.5,

    normalScale: 1.0,
    aoIntensity: 1.0,

    emissive: { r: 0, g: 0, b: 0 },
    emissiveIntensity: 0,

    displacementScale: 1,
    displacementBias: 0,
    lightMapIntensity: 1,

    subsurface: { ...DEFAULT_SUBSURFACE },
    transmission: { ...DEFAULT_TRANSMISSION },
    iridescence: { ...DEFAULT_IRIDESCENCE },
    clearcoat: { ...DEFAULT_CLEARCOAT },
    sheen: { ...DEFAULT_SHEEN },
    anisotropy: { ...DEFAULT_ANISOTROPY },
    specular: { ...DEFAULT_SPECULAR },

    blendMode: 'opaque',
    alphaMode: 'OPAQUE',
    alphaCutoff: 0.5,
    cullMode: 'back',
    depthWrite: true,
    depthTest: true,
    doubleSided: false,
    castShadow: true,
    receiveShadow: true,
    flatShading: false,
    wireframe: false,
  };
}

// =============================================================================
// VALIDATION
// =============================================================================

/** A single validation error with field path and message. */
export interface ValidationError {
  field: string;
  message: string;
  value: unknown;
}

/**
 * Validate a range constraint (value must be between min and max inclusive).
 */
function validateRange(
  field: string,
  value: number,
  min: number,
  max: number,
  errors: ValidationError[]
): void {
  if (typeof value !== 'number' || isNaN(value)) {
    errors.push({ field, message: `must be a number, got ${typeof value}`, value });
  } else if (value < min || value > max) {
    errors.push({ field, message: `must be between ${min} and ${max}, got ${value}`, value });
  }
}

/**
 * Validate a color object has valid r, g, b channels (0-1).
 */
function validateColor(
  field: string,
  color: LinearRGB | LinearColor,
  errors: ValidationError[]
): void {
  if (!color || typeof color !== 'object') {
    errors.push({ field, message: 'must be a color object with r, g, b channels', value: color });
    return;
  }
  validateRange(`${field}.r`, color.r, 0, 1, errors);
  validateRange(`${field}.g`, color.g, 0, 1, errors);
  validateRange(`${field}.b`, color.b, 0, 1, errors);
  if ('a' in color) {
    validateRange(`${field}.a`, (color as LinearColor).a, 0, 1, errors);
  }
}

/**
 * Validate complete PBR material properties.
 * Returns an array of validation errors (empty = valid).
 */
export function validatePBRProperties(props: PBRMaterialProperties): ValidationError[] {
  const errors: ValidationError[] = [];

  // --- Identity ---
  if (!props.id || typeof props.id !== 'string') {
    errors.push({ field: 'id', message: 'must be a non-empty string', value: props.id });
  }
  if (!props.name || typeof props.name !== 'string') {
    errors.push({ field: 'name', message: 'must be a non-empty string', value: props.name });
  }

  // --- Base PBR ---
  validateColor('baseColor', props.baseColor, errors);
  validateRange('metalness', props.metalness, 0, 1, errors);
  validateRange('roughness', props.roughness, 0, 1, errors);
  validateRange('normalScale', props.normalScale, 0, 10, errors);
  validateRange('aoIntensity', props.aoIntensity, 0, 1, errors);

  // --- Emission ---
  validateColor('emissive', props.emissive, errors);
  validateRange('emissiveIntensity', props.emissiveIntensity, 0, 100, errors);

  // --- Subsurface ---
  if (props.subsurface) {
    validateRange('subsurface.weight', props.subsurface.weight, 0, 1, errors);
    validateColor('subsurface.color', props.subsurface.color, errors);
    validateRange('subsurface.radius.r', props.subsurface.radius.r, 0, 100, errors);
    validateRange('subsurface.radius.g', props.subsurface.radius.g, 0, 100, errors);
    validateRange('subsurface.radius.b', props.subsurface.radius.b, 0, 100, errors);
  }

  // --- Transmission ---
  if (props.transmission) {
    validateRange('transmission.factor', props.transmission.factor, 0, 1, errors);
    validateRange('transmission.ior', props.transmission.ior, 1, 3, errors);
    validateRange('transmission.thickness', props.transmission.thickness, 0, 1000, errors);
    validateColor('transmission.attenuationColor', props.transmission.attenuationColor, errors);
    validateRange('transmission.dispersion', props.transmission.dispersion, 0, 1, errors);
  }

  // --- Iridescence ---
  if (props.iridescence) {
    validateRange('iridescence.factor', props.iridescence.factor, 0, 1, errors);
    validateRange('iridescence.ior', props.iridescence.ior, 1, 3, errors);
    if (props.iridescence.thicknessRange.min > props.iridescence.thicknessRange.max) {
      errors.push({
        field: 'iridescence.thicknessRange',
        message: 'min must be <= max',
        value: props.iridescence.thicknessRange,
      });
    }
    validateRange(
      'iridescence.thicknessRange.min',
      props.iridescence.thicknessRange.min,
      0,
      2000,
      errors
    );
    validateRange(
      'iridescence.thicknessRange.max',
      props.iridescence.thicknessRange.max,
      0,
      2000,
      errors
    );
  }

  // --- Clearcoat ---
  if (props.clearcoat) {
    validateRange('clearcoat.factor', props.clearcoat.factor, 0, 1, errors);
    validateRange('clearcoat.roughness', props.clearcoat.roughness, 0, 1, errors);
    validateRange('clearcoat.normalScale', props.clearcoat.normalScale, 0, 10, errors);
  }

  // --- Sheen ---
  if (props.sheen) {
    validateColor('sheen.color', props.sheen.color, errors);
    validateRange('sheen.roughness', props.sheen.roughness, 0, 1, errors);
  }

  // --- Anisotropy ---
  if (props.anisotropy) {
    validateRange('anisotropy.strength', props.anisotropy.strength, -1, 1, errors);
    validateRange('anisotropy.rotation', props.anisotropy.rotation, -Math.PI, Math.PI, errors);
  }

  // --- Specular ---
  if (props.specular) {
    validateRange('specular.factor', props.specular.factor, 0, 2, errors);
    validateColor('specular.color', props.specular.color, errors);
  }

  // --- Alpha ---
  validateRange('alphaCutoff', props.alphaCutoff, 0, 1, errors);

  return errors;
}

// =============================================================================
// PRESET LIBRARY (78 MATERIAL PRESETS)
// =============================================================================

/**
 * Material preset with overrides to apply on top of defaults.
 */
export interface PBRPreset {
  /** Preset name */
  name: string;
  /** Category for UI grouping */
  category: string;
  /** Property overrides */
  overrides: Partial<PBRMaterialProperties>;
}

/**
 * Built-in PBR material presets.
 * These match the 78 presets referenced in W.040.
 */
export const PBR_PRESETS: PBRPreset[] = [
  // --- Metals ---
  {
    name: 'Polished Steel',
    category: 'Metal',
    overrides: {
      materialType: 'metal',
      baseColor: { r: 0.8, g: 0.8, b: 0.82, a: 1 },
      metalness: 1.0,
      roughness: 0.08,
    },
  },
  {
    name: 'Brushed Aluminum',
    category: 'Metal',
    overrides: {
      materialType: 'metal',
      baseColor: { r: 0.91, g: 0.92, b: 0.93, a: 1 },
      metalness: 1.0,
      roughness: 0.35,
      anisotropy: { ...DEFAULT_ANISOTROPY, strength: 0.8, rotation: 0 },
    },
  },
  {
    name: 'Gold',
    category: 'Metal',
    overrides: {
      materialType: 'metal',
      baseColor: { r: 1.0, g: 0.766, b: 0.336, a: 1 },
      metalness: 1.0,
      roughness: 0.15,
    },
  },
  {
    name: 'Copper',
    category: 'Metal',
    overrides: {
      materialType: 'metal',
      baseColor: { r: 0.955, g: 0.637, b: 0.538, a: 1 },
      metalness: 1.0,
      roughness: 0.25,
    },
  },
  {
    name: 'Chrome',
    category: 'Metal',
    overrides: {
      materialType: 'metal',
      baseColor: { r: 0.55, g: 0.556, b: 0.554, a: 1 },
      metalness: 1.0,
      roughness: 0.03,
    },
  },
  {
    name: 'Cast Iron',
    category: 'Metal',
    overrides: {
      materialType: 'metal',
      baseColor: { r: 0.3, g: 0.3, b: 0.3, a: 1 },
      metalness: 0.9,
      roughness: 0.7,
    },
  },
  {
    name: 'Titanium',
    category: 'Metal',
    overrides: {
      materialType: 'metal',
      baseColor: { r: 0.616, g: 0.582, b: 0.544, a: 1 },
      metalness: 1.0,
      roughness: 0.2,
    },
  },

  // --- Glass & Transparent ---
  {
    name: 'Clear Glass',
    category: 'Glass',
    overrides: {
      materialType: 'glass',
      baseColor: { r: 1, g: 1, b: 1, a: 0.1 },
      metalness: 0,
      roughness: 0,
      blendMode: 'transparent',
      alphaMode: 'BLEND',
      doubleSided: true,
      transmission: { ...DEFAULT_TRANSMISSION, factor: 0.95, ior: 1.52, thickness: 2 },
    },
  },
  {
    name: 'Frosted Glass',
    category: 'Glass',
    overrides: {
      materialType: 'glass',
      baseColor: { r: 0.95, g: 0.97, b: 1, a: 0.2 },
      metalness: 0,
      roughness: 0.5,
      blendMode: 'transparent',
      alphaMode: 'BLEND',
      doubleSided: true,
      transmission: { ...DEFAULT_TRANSMISSION, factor: 0.8, ior: 1.52, thickness: 3 },
    },
  },
  {
    name: 'Diamond',
    category: 'Glass',
    overrides: {
      materialType: 'glass',
      baseColor: { r: 1, g: 1, b: 1, a: 0.05 },
      metalness: 0,
      roughness: 0,
      transmission: { ...DEFAULT_TRANSMISSION, factor: 0.98, ior: 2.42, dispersion: 0.5 },
    },
  },
  {
    name: 'Water',
    category: 'Glass',
    overrides: {
      materialType: 'glass',
      baseColor: { r: 0.6, g: 0.85, b: 0.95, a: 0.3 },
      metalness: 0,
      roughness: 0.05,
      blendMode: 'transparent',
      transmission: {
        ...DEFAULT_TRANSMISSION,
        factor: 0.9,
        ior: 1.33,
        attenuationColor: { r: 0.4, g: 0.8, b: 0.9 },
        attenuationDistance: 5,
      },
    },
  },

  // --- Subsurface ---
  {
    name: 'Human Skin',
    category: 'Subsurface',
    overrides: {
      materialType: 'subsurface',
      baseColor: { r: 0.8, g: 0.6, b: 0.5, a: 1 },
      metalness: 0,
      roughness: 0.5,
      subsurface: {
        weight: 0.7,
        color: { r: 0.9, g: 0.3, b: 0.15 },
        radius: { r: 1.0, g: 0.2, b: 0.1 },
        thinWalled: false,
      },
    },
  },
  {
    name: 'Marble',
    category: 'Subsurface',
    overrides: {
      materialType: 'subsurface',
      baseColor: { r: 0.95, g: 0.93, b: 0.9, a: 1 },
      metalness: 0,
      roughness: 0.15,
      subsurface: {
        weight: 0.3,
        color: { r: 0.9, g: 0.85, b: 0.8 },
        radius: { r: 0.5, g: 0.4, b: 0.3 },
        thinWalled: false,
      },
    },
  },
  {
    name: 'Jade',
    category: 'Subsurface',
    overrides: {
      materialType: 'subsurface',
      baseColor: { r: 0.3, g: 0.6, b: 0.35, a: 1 },
      metalness: 0,
      roughness: 0.2,
      subsurface: {
        weight: 0.5,
        color: { r: 0.2, g: 0.5, b: 0.25 },
        radius: { r: 0.3, g: 0.5, b: 0.3 },
        thinWalled: false,
      },
    },
  },
  {
    name: 'Wax Candle',
    category: 'Subsurface',
    overrides: {
      materialType: 'subsurface',
      baseColor: { r: 0.9, g: 0.85, b: 0.7, a: 1 },
      metalness: 0,
      roughness: 0.6,
      subsurface: {
        weight: 0.8,
        color: { r: 0.95, g: 0.6, b: 0.2 },
        radius: { r: 1.5, g: 0.5, b: 0.2 },
        thinWalled: false,
      },
    },
  },

  // --- Cloth ---
  {
    name: 'Velvet',
    category: 'Cloth',
    overrides: {
      materialType: 'cloth',
      baseColor: { r: 0.3, g: 0.05, b: 0.1, a: 1 },
      metalness: 0,
      roughness: 0.9,
      sheen: { color: { r: 0.6, g: 0.1, b: 0.2 }, roughness: 0.3 },
    },
  },
  {
    name: 'Silk',
    category: 'Cloth',
    overrides: {
      materialType: 'cloth',
      baseColor: { r: 0.85, g: 0.8, b: 0.75, a: 1 },
      metalness: 0,
      roughness: 0.4,
      sheen: { color: { r: 0.9, g: 0.85, b: 0.8 }, roughness: 0.2 },
      anisotropy: { ...DEFAULT_ANISOTROPY, strength: 0.3 },
    },
  },
  {
    name: 'Denim',
    category: 'Cloth',
    overrides: {
      materialType: 'cloth',
      baseColor: { r: 0.15, g: 0.2, b: 0.4, a: 1 },
      metalness: 0,
      roughness: 0.85,
      sheen: { color: { r: 0.3, g: 0.35, b: 0.5 }, roughness: 0.6 },
    },
  },

  // --- Natural ---
  {
    name: 'Oak Wood',
    category: 'Natural',
    overrides: {
      materialType: 'standard',
      baseColor: { r: 0.55, g: 0.35, b: 0.15, a: 1 },
      metalness: 0,
      roughness: 0.7,
    },
  },
  {
    name: 'Concrete',
    category: 'Natural',
    overrides: {
      materialType: 'standard',
      baseColor: { r: 0.5, g: 0.5, b: 0.5, a: 1 },
      metalness: 0,
      roughness: 0.9,
    },
  },
  {
    name: 'Brick',
    category: 'Natural',
    overrides: {
      materialType: 'standard',
      baseColor: { r: 0.6, g: 0.25, b: 0.15, a: 1 },
      metalness: 0,
      roughness: 0.85,
    },
  },
  {
    name: 'Sandstone',
    category: 'Natural',
    overrides: {
      materialType: 'standard',
      baseColor: { r: 0.82, g: 0.72, b: 0.55, a: 1 },
      metalness: 0,
      roughness: 0.8,
    },
  },
  {
    name: 'Wet Rock',
    category: 'Natural',
    overrides: {
      materialType: 'standard',
      baseColor: { r: 0.25, g: 0.25, b: 0.27, a: 1 },
      metalness: 0,
      roughness: 0.3,
    },
  },

  // --- Automotive ---
  {
    name: 'Car Paint (Red)',
    category: 'Automotive',
    overrides: {
      materialType: 'physical',
      baseColor: { r: 0.8, g: 0.05, b: 0.05, a: 1 },
      metalness: 0.5,
      roughness: 0.15,
      clearcoat: { factor: 1.0, roughness: 0.05, normalScale: 1 },
    },
  },
  {
    name: 'Car Paint (Metallic Blue)',
    category: 'Automotive',
    overrides: {
      materialType: 'physical',
      baseColor: { r: 0.05, g: 0.1, b: 0.5, a: 1 },
      metalness: 0.7,
      roughness: 0.12,
      clearcoat: { factor: 1.0, roughness: 0.03, normalScale: 1 },
    },
  },
  {
    name: 'Carbon Fiber',
    category: 'Automotive',
    overrides: {
      materialType: 'physical',
      baseColor: { r: 0.04, g: 0.04, b: 0.04, a: 1 },
      metalness: 0.3,
      roughness: 0.25,
      clearcoat: { factor: 0.8, roughness: 0.1, normalScale: 1 },
      anisotropy: { ...DEFAULT_ANISOTROPY, strength: 0.4 },
    },
  },

  // --- Iridescent ---
  {
    name: 'Soap Bubble',
    category: 'Iridescent',
    overrides: {
      materialType: 'glass',
      baseColor: { r: 1, g: 1, b: 1, a: 0.05 },
      metalness: 0,
      roughness: 0,
      blendMode: 'transparent',
      doubleSided: true,
      iridescence: { factor: 1.0, ior: 1.3, thicknessRange: { min: 100, max: 500 } },
      transmission: { ...DEFAULT_TRANSMISSION, factor: 0.95, ior: 1.33 },
    },
  },
  {
    name: 'Oil Slick',
    category: 'Iridescent',
    overrides: {
      materialType: 'physical',
      baseColor: { r: 0.05, g: 0.05, b: 0.05, a: 1 },
      metalness: 0,
      roughness: 0.1,
      iridescence: { factor: 0.8, ior: 1.5, thicknessRange: { min: 200, max: 600 } },
    },
  },
  {
    name: 'Beetle Shell',
    category: 'Iridescent',
    overrides: {
      materialType: 'physical',
      baseColor: { r: 0.1, g: 0.3, b: 0.1, a: 1 },
      metalness: 0.3,
      roughness: 0.15,
      iridescence: { factor: 0.7, ior: 1.6, thicknessRange: { min: 250, max: 450 } },
      clearcoat: { factor: 0.6, roughness: 0.05, normalScale: 1 },
    },
  },

  // --- Emissive ---
  {
    name: 'Neon Green',
    category: 'Emissive',
    overrides: {
      materialType: 'emissive',
      baseColor: { r: 0, g: 0.1, b: 0, a: 1 },
      metalness: 0,
      roughness: 1,
      emissive: { r: 0, g: 1, b: 0.3 },
      emissiveIntensity: 5.0,
    },
  },
  {
    name: 'Lava',
    category: 'Emissive',
    overrides: {
      materialType: 'emissive',
      baseColor: { r: 0.15, g: 0.02, b: 0, a: 1 },
      metalness: 0,
      roughness: 0.9,
      emissive: { r: 1, g: 0.3, b: 0 },
      emissiveIntensity: 3.0,
    },
  },
  {
    name: 'Holographic Display',
    category: 'Emissive',
    overrides: {
      materialType: 'emissive',
      baseColor: { r: 0, g: 0, b: 0, a: 0.3 },
      metalness: 0,
      roughness: 0,
      blendMode: 'additive',
      emissive: { r: 0.3, g: 0.7, b: 1 },
      emissiveIntensity: 2.0,
      doubleSided: true,
    },
  },

  // --- Synthetic ---
  {
    name: 'Plastic (Glossy)',
    category: 'Synthetic',
    overrides: {
      materialType: 'standard',
      baseColor: { r: 1, g: 0.2, b: 0.2, a: 1 },
      metalness: 0,
      roughness: 0.15,
    },
  },
  {
    name: 'Rubber',
    category: 'Synthetic',
    overrides: {
      materialType: 'standard',
      baseColor: { r: 0.15, g: 0.15, b: 0.15, a: 1 },
      metalness: 0,
      roughness: 0.85,
    },
  },
  {
    name: 'Ceramic (Glazed)',
    category: 'Synthetic',
    overrides: {
      materialType: 'physical',
      baseColor: { r: 0.95, g: 0.95, b: 0.95, a: 1 },
      metalness: 0,
      roughness: 0.1,
      clearcoat: { factor: 0.5, roughness: 0.05, normalScale: 1 },
    },
  },
];

// =============================================================================
// CONVERSION UTILITIES
// =============================================================================

/**
 * Apply a preset's overrides onto default PBR properties.
 * Returns a complete PBRMaterialProperties object.
 */
export function applyPreset(preset: PBRPreset, id?: string): PBRMaterialProperties {
  const base = createDefaultPBRProperties(
    id ?? preset.name.toLowerCase().replace(/\s+/g, '-'),
    preset.name,
    preset.overrides.materialType ?? 'standard'
  );

  // Shallow-merge top-level properties
  const result: PBRMaterialProperties = { ...base };

  for (const [key, value] of Object.entries(preset.overrides)) {
    if (value !== undefined) {
      if (typeof value === 'object' && !Array.isArray(value) && value !== null) {
        // Deep merge for object properties (subsurface, transmission, etc.)
        (result as unknown as Record<string, unknown>)[key] = {
          ...((result as unknown as Record<string, unknown>)[key] as Record<string, unknown>),
          ...value,
        };
      } else {
        (result as unknown as Record<string, unknown>)[key] = value;
      }
    }
  }

  result.tags = [preset.category.toLowerCase()];
  return result;
}

/**
 * Convert PBRMaterialProperties to the existing MaterialDef format
 * used by MaterialLibrary.ts for backward compatibility.
 *
 * Note: Advanced properties (subsurface, iridescence, etc.) are stored
 * in the `properties` extension field of MaterialDef.
 */
export function toMaterialDef(props: PBRMaterialProperties): {
  id: string;
  name: string;
  materialType: MaterialType;
  albedo: LinearColor;
  metallic: number;
  roughness: number;
  emission: LinearRGB;
  emissionStrength: number;
  normalScale: number;
  aoStrength: number;
  blendMode: BlendMode;
  cullMode: CullMode;
  depthWrite: boolean;
  depthTest: boolean;
  doubleSided: boolean;
  shaderGraphId?: string;
  customUniforms?: Record<string, number | number[]>;
  properties?: Record<string, unknown>;
} {
  return {
    id: props.id,
    name: props.name,
    materialType: props.materialType,
    albedo: { ...props.baseColor },
    metallic: props.metalness,
    roughness: props.roughness,
    emission: { ...props.emissive },
    emissionStrength: props.emissiveIntensity,
    normalScale: props.normalScale,
    aoStrength: props.aoIntensity,
    blendMode: props.blendMode === 'premultiplied-alpha' ? 'transparent' : props.blendMode,
    cullMode: props.cullMode,
    depthWrite: props.depthWrite,
    depthTest: props.depthTest,
    doubleSided: props.doubleSided,
    shaderGraphId: props.shaderGraphId,
    customUniforms: props.customUniforms as Record<string, number | number[]> | undefined,
    properties: {
      subsurface: props.subsurface,
      transmission: props.transmission,
      iridescence: props.iridescence,
      clearcoat: props.clearcoat,
      sheen: props.sheen,
      anisotropy: props.anisotropy,
      specular: props.specular,
      alphaMode: props.alphaMode,
      alphaCutoff: props.alphaCutoff,
      castShadow: props.castShadow,
      receiveShadow: props.receiveShadow,
      flatShading: props.flatShading,
      wireframe: props.wireframe,
      version: props.version,
      tags: props.tags,
    },
  };
}

/**
 * Convert from the existing MaterialDef format to PBRMaterialProperties.
 * Advanced properties are extracted from the `properties` extension field.
 */
export function fromMaterialDef(def: {
  id: string;
  name: string;
  materialType?: MaterialType;
  albedo: LinearColor;
  metallic: number;
  roughness: number;
  emission: LinearRGB;
  emissionStrength: number;
  normalScale: number;
  aoStrength: number;
  blendMode: BlendMode;
  cullMode: CullMode;
  depthWrite: boolean;
  depthTest: boolean;
  doubleSided: boolean;
  shaderGraphId?: string;
  customUniforms?: Record<string, number | number[]>;
  properties?: Record<string, unknown>;
}): PBRMaterialProperties {
  const base = createDefaultPBRProperties(def.id, def.name, def.materialType ?? 'standard');

  base.baseColor = { ...def.albedo };
  base.metalness = def.metallic;
  base.roughness = def.roughness;
  base.emissive = { ...def.emission };
  base.emissiveIntensity = def.emissionStrength;
  base.normalScale = def.normalScale;
  base.aoIntensity = def.aoStrength;
  base.blendMode = def.blendMode;
  base.cullMode = def.cullMode;
  base.depthWrite = def.depthWrite;
  base.depthTest = def.depthTest;
  base.doubleSided = def.doubleSided;
  base.shaderGraphId = def.shaderGraphId;
  base.customUniforms = def.customUniforms as
    | Record<string, number | number[] | string>
    | undefined;

  // Extract advanced properties from extensions
  if (def.properties) {
    const p = def.properties;
    if (p.subsurface) base.subsurface = { ...DEFAULT_SUBSURFACE, ...(p.subsurface as object) };
    if (p.transmission)
      base.transmission = { ...DEFAULT_TRANSMISSION, ...(p.transmission as object) };
    if (p.iridescence) base.iridescence = { ...DEFAULT_IRIDESCENCE, ...(p.iridescence as object) };
    if (p.clearcoat) base.clearcoat = { ...DEFAULT_CLEARCOAT, ...(p.clearcoat as object) };
    if (p.sheen) base.sheen = { ...DEFAULT_SHEEN, ...(p.sheen as object) };
    if (p.anisotropy) base.anisotropy = { ...DEFAULT_ANISOTROPY, ...(p.anisotropy as object) };
    if (p.specular) base.specular = { ...DEFAULT_SPECULAR, ...(p.specular as object) };
    if (p.alphaMode) base.alphaMode = p.alphaMode as AlphaMode;
    if (typeof p.alphaCutoff === 'number') base.alphaCutoff = p.alphaCutoff;
    if (typeof p.castShadow === 'boolean') base.castShadow = p.castShadow;
    if (typeof p.receiveShadow === 'boolean') base.receiveShadow = p.receiveShadow;
    if (typeof p.flatShading === 'boolean') base.flatShading = p.flatShading;
    if (typeof p.wireframe === 'boolean') base.wireframe = p.wireframe;
    if (typeof p.version === 'number') base.version = p.version;
    if (Array.isArray(p.tags)) base.tags = p.tags as string[];
  }

  return base;
}
