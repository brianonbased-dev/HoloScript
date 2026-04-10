/**
 * Visual configuration types for trait-to-PBR mapping.
 *
 * Each VR trait can optionally declare visual properties (material, emissive,
 * opacity, scale, etc.) that the R3FCompiler uses to produce rendered output.
 */

/** Priority layers for compositor merge order (lower = applied first). */
export type VisualLayer =
  | 'base_material' // 0 — foundation (metallic, wooden, stone)
  | 'surface' // 1 — texture overlay (rough, polished, bumpy)
  | 'condition' // 2 — age/wear state (rusted, pristine, ancient)
  | 'physical' // 3 — affordance hints (heavy, fragile)
  | 'scale' // 4 — size modifiers
  | 'lighting' // 5 — glow, luminosity
  | 'visual_effect' // 6 — particles, shaders
  | 'environmental' // 7 — biome influence
  | 'mood'; // 8 — emotion overlays

/** Numeric priority for each visual layer (used by TraitCompositor). */
export const VISUAL_LAYER_PRIORITY: Record<VisualLayer, number> = {
  base_material: 0,
  surface: 1,
  condition: 2,
  physical: 3,
  scale: 4,
  lighting: 5,
  visual_effect: 6,
  environmental: 7,
  mood: 8,
};

/** Three.js MeshStandardMaterial / MeshPhysicalMaterial properties. */
export interface R3FMaterialProps {
  color?: string;
  metalness?: number;
  roughness?: number;
  emissive?: string;
  emissiveIntensity?: number;
  transparent?: boolean;
  opacity?: number;
  envMapIntensity?: number;
  clearcoat?: number;
  clearcoatRoughness?: number;
  transmission?: number;
  ior?: number;
  thickness?: number;
  iridescence?: number;
  iridescenceIOR?: number;
  // Sheen (fabrics, velvet)
  sheen?: number;
  sheenRoughness?: number;
  sheenColor?: string;
  // Anisotropy (brushed metals, silk, hair)
  anisotropy?: number;
  anisotropyRotation?: number;
  // SSS / Volume attenuation (skin, wax, jade, leaves)
  attenuationColor?: string;
  attenuationDistance?: number;
  // Wireframe
  wireframe?: boolean;
}

/** Visual configuration for a single trait. */
export interface TraitVisualConfig {
  /** PBR material properties to apply or merge. */
  material?: R3FMaterialProps;
  /** Emissive glow settings. */
  emissive?: { color: string; intensity: number };
  /** Override opacity (0-1). */
  opacity?: number;
  /** Scale multiplier [x, y, z]. */
  scale?: [number, number, number];
  /** Named particle effect to attach. */
  particleEffect?: string;
  /** Named shader preset to use. */
  shader?: string;
  /** Semantic tags for compositor rules (e.g., ['metallic', 'reflective']). */
  tags?: string[];
  /** Layer priority for compositor merge order. */
  layer?: VisualLayer;
}
