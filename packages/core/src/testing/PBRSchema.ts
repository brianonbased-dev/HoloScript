/**
 * PBRSchema.ts - Unified PBR material property schema (TODO-043).
 *
 * NOTE: This file is temporarily placed in testing/ due to write permission
 * constraints. It should be moved to materials/PBRSchema.ts and the imports
 * in MaterialLibrary.ts and MaterialEditor.ts updated accordingly.
 *
 * This module defines the single canonical set of PBR types shared across
 * all HoloScript subsystems:
 *   - rendering/MaterialLibrary  (runtime material registry)
 *   - tools/MaterialEditor       (live material editing UI)
 *   - parser/MaterialTypes       (AST -> material IR)
 *   - compiler/gltf/materials    (export to glTF)
 *   - traits/MaterialTrait       (trait-based PBR)
 *
 * Design principles:
 *   1. Color values use linear RGBA objects ({r,g,b,a}) for GPU precision.
 *   2. All numeric ranges are 0-1 unless documented otherwise.
 *   3. Advanced PBR features (SSS, sheen, clearcoat, iridescence, anisotropy)
 *      are optional sub-objects so that simple materials stay lightweight.
 *   4. Texture slots are separated from scalar properties; each slot
 *      carries its own UV channel, tiling, and offset.
 *
 * @module materials
 */

// =============================================================================
// COLOR TYPES
// =============================================================================

/**
 * Linear RGB color (0-1 per channel).
 */
export interface RGB {
  r: number;
  g: number;
  b: number;
}

/**
 * Linear RGBA color (0-1 per channel).
 */
export interface RGBA extends RGB {
  a: number;
}

// =============================================================================
// BLEND / CULL / MATERIAL TYPE ENUMS
// =============================================================================

/** How the material blends with the background. */
export type BlendMode = 'opaque' | 'transparent' | 'additive' | 'multiply';

/** Which polygon faces to cull during rasterization. */
export type CullMode = 'none' | 'front' | 'back';

/**
 * High-level material classification for editor UI and rendering strategy.
 */
export type MaterialType =
  | 'standard'
  | 'physical'
  | 'basic'
  | 'emissive'
  | 'toon'
  | 'glass'
  | 'metal';

// =============================================================================
// TEXTURE SLOT
// =============================================================================

/**
 * A single texture binding for a material channel.
 */
export interface TextureSlot {
  /** Identifier for the texture asset. */
  textureId: string;
  /** Which UV set to sample (default 0). */
  uvChannel: number;
  /** Texture coordinate tiling. */
  tiling: { x: number; y: number };
  /** Texture coordinate offset. */
  offset: { x: number; y: number };
}

// =============================================================================
// ADVANCED PBR SUB-STRUCTURES
// =============================================================================

/**
 * Subsurface scattering configuration.
 * Models light that penetrates and scatters inside the surface
 * (skin, wax, jade, milk).
 */
export interface SubsurfaceConfig {
  /** Thickness for light attenuation (0 = infinitely thin). */
  thickness: number;
  /** Color of light after passing through the material. */
  attenuationColor: RGB;
  /** Distance light travels before full attenuation (world units). */
  attenuationDistance: number;
}

/**
 * Sheen configuration for fabrics and textiles.
 * Produces a soft fuzzy reflection at grazing angles.
 */
export interface SheenConfig {
  /** Sheen intensity 0-1. */
  intensity: number;
  /** Sheen tint color. */
  color: RGB;
  /** Sheen roughness 0-1 (low = silk, high = cotton). */
  roughness: number;
}

/**
 * Anisotropy configuration for directional roughness
 * (brushed metal, hair, silk fibers).
 */
export interface AnisotropyConfig {
  /** Anisotropy strength 0-1 (0 = isotropic). */
  strength: number;
  /** Rotation angle in radians (0 = horizontal, PI/2 = vertical). */
  rotation: number;
}

/**
 * Clearcoat configuration for a protective top layer
 * (car paint, lacquer, varnished wood).
 */
export interface ClearcoatConfig {
  /** Clearcoat intensity 0-1. */
  intensity: number;
  /** Clearcoat roughness 0-1. */
  roughness: number;
}

/**
 * Iridescence configuration for thin-film interference effects
 * (oil slicks, soap bubbles, beetle shells).
 */
export interface IridescenceConfig {
  /** Iridescence intensity 0-1. */
  intensity: number;
  /** Index of refraction for the thin film layer. */
  ior: number;
  /** Minimum thickness of the film in nanometers. */
  thicknessMin: number;
  /** Maximum thickness of the film in nanometers. */
  thicknessMax: number;
}

/**
 * Weathering/aging configuration for procedural surface degradation.
 */
export interface WeatheringConfig {
  /** Weathering type (e.g., rust, moss, dust). */
  type: string;
  /** Weathering progress 0-1 (0 = pristine, 1 = fully weathered). */
  progress: number;
}

// =============================================================================
// CORE PBR PROPERTIES
// =============================================================================

/**
 * Core PBR material properties shared by all material representations.
 *
 * This interface captures the common denominator of PBR properties that
 * appear in the rendering pipeline (MaterialDef), the parser IR
 * (MaterialDefinition), the trait system (PBRMaterial), and the glTF
 * exporter (PBRMaterialConfig).
 *
 * Each subsystem extends or wraps these properties with domain-specific
 * fields (e.g., texture maps, shader passes, editor metadata).
 */
export interface PBRCoreProperties {
  /** Base color / albedo in linear RGBA. Alpha < 1 implies transparency. */
  albedo: RGBA;

  /** Metallic factor 0-1 (0 = dielectric, 1 = conductor). */
  metallic: number;

  /** Roughness factor 0-1 (0 = mirror, 1 = diffuse). */
  roughness: number;

  /** Emission color in linear RGB. */
  emission: RGB;

  /** Emission multiplier / strength. */
  emissionStrength: number;

  /** Normal map influence 0-1. */
  normalScale: number;

  /** Ambient occlusion strength 0-1. */
  aoStrength: number;

  /** Index of refraction (default 1.5 for glass). */
  ior?: number;

  /** Transmission amount 0-1 for refractive transparent materials. */
  transmission?: number;

  /** Volume thickness for transmission materials (world units). */
  thickness?: number;
}

// =============================================================================
// FULL MATERIAL DEFINITION
// =============================================================================

/**
 * Complete, unified PBR material definition.
 *
 * This is the canonical material type used by:
 *   - MaterialLibrary (rendering runtime)
 *   - MaterialEditor  (live preview tool)
 *   - Export compilers (glTF, Unreal, etc.)
 *
 * The parser's MaterialDefinition converts into this type after parsing.
 *
 * Changes from the previous separate schemas:
 *   - Added ior, transmission, thickness from parser's MaterialDefinition
 *   - Added subsurface, sheen, anisotropy, clearcoat, iridescence, weathering
 *     from traits/MaterialTrait's PBRMaterial (all optional)
 *   - Kept all texture slots and rendering state from the original MaterialDef
 *   - Color types use named RGB/RGBA interfaces instead of inline objects
 */
export interface MaterialDef extends PBRCoreProperties {
  /** Unique material identifier. */
  id: string;

  /** Human-readable material name. */
  name: string;

  /** High-level material classification for editor UI. */
  materialType?: MaterialType;

  // -- Texture maps -----------------------------------------------------------
  albedoMap?: TextureSlot;
  normalMap?: TextureSlot;
  metallicRoughnessMap?: TextureSlot;
  emissionMap?: TextureSlot;
  aoMap?: TextureSlot;

  // -- Rendering state --------------------------------------------------------
  blendMode: BlendMode;
  cullMode: CullMode;
  depthWrite: boolean;
  depthTest: boolean;
  doubleSided: boolean;

  // -- Advanced PBR (optional) ------------------------------------------------
  /** Subsurface scattering for organic/translucent materials. */
  subsurface?: SubsurfaceConfig;
  /** Sheen for fabric/textile materials. */
  sheen?: SheenConfig;
  /** Anisotropy for brushed metal / hair. */
  anisotropy?: AnisotropyConfig;
  /** Clearcoat for lacquered / car paint surfaces. */
  clearcoat?: ClearcoatConfig;
  /** Iridescence for thin-film interference. */
  iridescence?: IridescenceConfig;
  /** Weathering / aging effects. */
  weathering?: WeatheringConfig;

  // -- Shader / custom --------------------------------------------------------
  shaderGraphId?: string;
  customUniforms?: Record<string, number | number[]>;

  /** Arbitrary extension properties for editor/plugin use. */
  properties?: Record<string, unknown>;
}

/**
 * A material instance that overrides a subset of a base material's properties.
 */
export interface MaterialInstance {
  id: string;
  baseMaterialId: string;
  overrides: Partial<MaterialDef>;
}

// =============================================================================
// COLOR UTILITIES
// =============================================================================

/**
 * Convert a hex color string (#RRGGBB or #RRGGBBAA) to an RGBA object
 * with linear color values (0-1).
 */
export function hexToRGBA(hex: string): RGBA {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16) / 255;
  const g = parseInt(clean.substring(2, 4), 16) / 255;
  const b = parseInt(clean.substring(4, 6), 16) / 255;
  const a = clean.length >= 8 ? parseInt(clean.substring(6, 8), 16) / 255 : 1;
  return { r, g, b, a };
}

/**
 * Convert an RGBA object (0-1 values) to a hex color string (#RRGGBB).
 */
export function rgbaToHex(color: { r: number; g: number; b: number; a?: number }): string {
  const toHex = (v: number) =>
    Math.round(Math.max(0, Math.min(1, v)) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`;
}

/**
 * Create a default MaterialDef with sensible PBR defaults.
 * Useful for editors and tools that need a starting point.
 */
export function createDefaultMaterialDef(
  id: string,
  name?: string,
  materialType?: MaterialType
): MaterialDef {
  return {
    id,
    name: name ?? id,
    materialType: materialType ?? 'standard',
    albedo: { r: 0.8, g: 0.8, b: 0.8, a: 1 },
    metallic: 0,
    roughness: 0.5,
    emission: { r: 0, g: 0, b: 0 },
    emissionStrength: 0,
    normalScale: 1,
    aoStrength: 1,
    blendMode: 'opaque',
    cullMode: 'back',
    depthWrite: true,
    depthTest: true,
    doubleSided: false,
  };
}

/**
 * PBR default values as a plain object, useful for merging with partial
 * material overrides (e.g., preset definitions).
 */
export const PBR_DEFAULTS: Readonly<PBRCoreProperties> = Object.freeze({
  albedo: { r: 0.8, g: 0.8, b: 0.8, a: 1 },
  metallic: 0,
  roughness: 0.5,
  emission: { r: 0, g: 0, b: 0 },
  emissionStrength: 0,
  normalScale: 1,
  aoStrength: 1,
});

// =============================================================================
// CONVERSION UTILITIES
// =============================================================================

/**
 * Convert a parser MaterialDefinition's color (string | number[]) to an
 * RGB object. This bridges the gap between the parser's flexible color
 * representations and the canonical PBR schema.
 *
 * Supports:
 *   - Hex strings: "#ff0000", "#ff0000ff"
 *   - Number arrays: [1.0, 0.0, 0.0] or [1.0, 0.0, 0.0, 1.0]
 *   - Named colors: "red", "blue" (basic set)
 *   - Falls back to medium gray on parse failure.
 */
export function parseColorToRGB(color: string | number[] | undefined): RGB {
  if (!color) return { r: 0.5, g: 0.5, b: 0.5 };

  if (Array.isArray(color)) {
    return { r: color[0] ?? 0, g: color[1] ?? 0, b: color[2] ?? 0 };
  }

  if (color.startsWith('#')) {
    const rgba = hexToRGBA(color);
    return { r: rgba.r, g: rgba.g, b: rgba.b };
  }

  // Basic named color fallback
  const NAMED: Record<string, RGB> = {
    red: { r: 1, g: 0, b: 0 },
    green: { r: 0, g: 0.8, b: 0 },
    blue: { r: 0, g: 0.4, b: 1 },
    white: { r: 1, g: 1, b: 1 },
    black: { r: 0, g: 0, b: 0 },
  };
  return NAMED[color.toLowerCase()] ?? { r: 0.5, g: 0.5, b: 0.5 };
}

/**
 * Convert a parser MaterialDefinition's color to an RGBA object.
 */
export function parseColorToRGBA(
  color: string | number[] | undefined,
  opacity?: number
): RGBA {
  const rgb = parseColorToRGB(color);
  let a = opacity ?? 1;
  if (Array.isArray(color) && color.length >= 4) {
    a = color[3];
  }
  return { ...rgb, a };
}
