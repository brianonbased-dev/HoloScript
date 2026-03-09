/**
 * @holoscript/std — Materials Module
 *
 * Provides PBR material types, texture map definitions, and material presets.
 * Maps directly to HoloScript material_block grammar constructs.
 *
 * @version 0.2.0
 * @module @holoscript/std/materials
 */

// =============================================================================
// PBR Material
// =============================================================================

export interface PBRMaterial {
  name: string;
  baseColor: string; // hex color
  roughness: number; // 0.0 - 1.0
  metallic: number; // 0.0 - 1.0
  emissiveColor?: string;
  emissiveIntensity?: number;
  opacity?: number; // 0.0 - 1.0
  ior?: number; // Index of refraction (glass ~1.5, water ~1.33)
  subsurface?: number;
  clearcoat?: number;
  clearcoatRoughness?: number;
  // Texture maps
  albedoMap?: string;
  normalMap?: string;
  roughnessMap?: string;
  metallicMap?: string;
  emissionMap?: string;
  aoMap?: string;
  heightMap?: string;
  opacityMap?: string;
  displacementMap?: string;
}

export interface UnlitMaterial {
  name: string;
  color: string;
  emissiveColor?: string;
  emissiveIntensity?: number;
  opacity?: number;
  texture?: string;
}

// =============================================================================
// Material Presets
// =============================================================================

export const MATERIAL_PRESETS: Record<string, Partial<PBRMaterial>> = {
  metal: { roughness: 0.2, metallic: 1.0 },
  wood: { roughness: 0.85, metallic: 0.0, baseColor: '#8B6914' },
  glass: { roughness: 0.05, metallic: 0.0, opacity: 0.3, ior: 1.5 },
  plastic: { roughness: 0.4, metallic: 0.0 },
  concrete: { roughness: 0.95, metallic: 0.0, baseColor: '#808080' },
  fabric: { roughness: 0.9, metallic: 0.0, subsurface: 0.2 },
  water: { roughness: 0.05, metallic: 0.0, opacity: 0.7, ior: 1.33 },
  rubber: { roughness: 0.95, metallic: 0.0, baseColor: '#222222' },
  marble: { roughness: 0.3, metallic: 0.0, baseColor: '#f0f0f0' },
  skin: { roughness: 0.6, metallic: 0.0, subsurface: 0.5 },
  foliage: { roughness: 0.8, metallic: 0.0, baseColor: '#2d5a27', subsurface: 0.3 },
  chrome: { roughness: 0.05, metallic: 1.0, baseColor: '#cccccc' },
  gold: { roughness: 0.2, metallic: 1.0, baseColor: '#ffd700' },
  copper: { roughness: 0.3, metallic: 1.0, baseColor: '#b87333' },
  ice: { roughness: 0.1, metallic: 0.0, opacity: 0.8, ior: 1.31 },
};

export function createPBRMaterial(
  name: string,
  preset?: keyof typeof MATERIAL_PRESETS,
  overrides?: Partial<PBRMaterial>
): PBRMaterial {
  const base = preset ? MATERIAL_PRESETS[preset] : {};
  return {
    name,
    baseColor: '#ffffff',
    roughness: 0.5,
    metallic: 0.0,
    ...base,
    ...overrides,
  };
}

// =============================================================================
// Texture Map Types
// =============================================================================

export type TextureMapType =
  | 'albedo_map'
  | 'normal_map'
  | 'roughness_map'
  | 'metallic_map'
  | 'emission_map'
  | 'ao_map'
  | 'height_map'
  | 'opacity_map'
  | 'displacement_map'
  | 'specular_map'
  | 'clearcoat_map';

export interface TextureConfig {
  source: string;
  tiling?: [number, number];
  offset?: [number, number];
  filter?: 'linear' | 'nearest';
  wrap?: 'repeat' | 'clamp' | 'mirror';
}
