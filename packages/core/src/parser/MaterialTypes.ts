/**
 * Material Type Definitions for HoloScript material_block Grammar
 *
 * These types define the intermediate representation between the tree-sitter
 * material_block AST and rendering engines. They map directly to the grammar
 * rules in tree-sitter-holoscript/grammar.js:
 *
 *   material_block: material | pbr_material | unlit_material | shader |
 *                   toon_material | glass_material | subsurface_material
 *   texture_map: inline form (channel: "source")
 *   texture_map_block: structured form (channel { source: ... tiling: ... })
 *   shader_pass: pass "name" { vertex: ... fragment: ... }
 *   shader_connection: output -> input.property
 *
 * @module MaterialTypes
 */

// =============================================================================
// MATERIAL BLOCK TYPES
// =============================================================================

/**
 * Supported HoloScript material block types (from grammar.js material_block rule).
 */
export type HoloMaterialType =
  | 'material'
  | 'pbr_material'
  | 'unlit_material'
  | 'shader'
  | 'toon_material'
  | 'glass_material'
  | 'subsurface_material';

/**
 * Texture map channel names from grammar.js texture_map rule.
 * Supports both inline (texture_map) and block (texture_map_block) forms.
 */
export type TextureChannel =
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
  | 'clearcoat_map'
  | 'baseColor_map'
  | 'emissive_map'
  | 'transmission_map'
  | 'sheen_map'
  | 'anisotropy_map'
  | 'thickness_map'
  | 'subsurface_map'
  | 'iridescence_map';

// =============================================================================
// TEXTURE & SHADER DEFINITIONS
// =============================================================================

/**
 * Texture map definition — inline or block form
 */
export interface TextureMapDef {
  channel: TextureChannel;
  source: string;
  tiling?: [number, number];
  filtering?: 'nearest' | 'bilinear' | 'trilinear' | 'anisotropic';
  strength?: number;
  format?: string;
  intensity?: number;
  scale?: number;
  /** Which color channel to read from (for packed maps) */
  channelSelect?: 'r' | 'g' | 'b' | 'a';
}

/**
 * Shader pass definition from grammar.js shader_pass rule.
 */
export interface ShaderPassDef {
  name?: string;
  vertex?: string;
  fragment?: string;
  blend?: string;
  properties: Record<string, unknown>;
}

// =============================================================================
// MATERIAL DEFINITION
// =============================================================================

/**
 * Complete material definition parsed from HoloScript material_block.
 * This is the intermediate representation between the AST and rendering engines.
 */
export interface MaterialDefinition {
  /** Material block type (material, pbr_material, etc.) */
  type: HoloMaterialType;
  /** Material name from the grammar field('name', ...) */
  name: string;
  /** Trait decorators (@pbr, @transparent, @cel_shaded, @sss, etc.) */
  traits: string[];

  // ── PBR Core Properties ──────────────────────────────────────────
  baseColor?: string | number[];
  roughness?: number;
  metallic?: number;
  emissive?: string;
  emissiveIntensity?: number;
  opacity?: number;
  IOR?: number;
  transmission?: number;
  thickness?: number;
  doubleSided?: boolean;

  // ── Subsurface (subsurface_material) ─────────────────────────────
  subsurfaceColor?: string;
  subsurfaceRadius?: number[];

  // ── Toon (toon_material) ─────────────────────────────────────────
  outlineWidth?: number;
  outlineColor?: string;
  shadeSteps?: number;
  specularSize?: number;
  rimLight?: number;
  rimColor?: string;

  // ── Glass (glass_material) ───────────────────────────────────────
  attenuationColor?: string;

  // ── Texture Maps ─────────────────────────────────────────────────
  textureMaps: TextureMapDef[];

  // ── Shader Passes (shader blocks only) ───────────────────────────
  shaderPasses: ShaderPassDef[];

  // ── Shader Connections (output -> input) ─────────────────────────
  shaderConnections: Array<{ output: string; input: string }>;

  // ── Remaining properties (extensibility) ─────────────────────────
  properties: Record<string, unknown>;
}
