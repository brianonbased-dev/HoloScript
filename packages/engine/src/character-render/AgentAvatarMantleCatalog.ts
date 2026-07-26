/**
 * AgentAvatarMantleCatalog — typed public/story mantle identities for sovereign characters.
 *
 * These entries alter only the detachable mantle channel. They do not name or bind research
 * residents, seats, personas, roles, adapters, prompts, or model revisions. Every style is
 * rendered on the same procedural body, HUMANOID_65 palette, Stormglass garment, and cloth
 * solver; only authored colour, UV pattern metadata, and mantle silhouette vary.
 */

export type SovereignMantleStyle =
  | 'anthropic_quiet_nested_arcs'
  | 'openai_recursive_interlock'
  | 'google_paired_prism_panels'
  | 'xai_off_axis_signal_bands'
  | 'glm_modular_phase_lattice'
  | 'sovereign_locality_mesh';

export type SovereignMantleFamilyId =
  | 'anthropic'
  | 'openai'
  | 'google'
  | 'xai'
  | 'ollama'
  | 'sovereign';

/**
 * Procedural silhouette parameters. All profiles share one grid topology so family style
 * cannot change the neutral body, joint palette, cloth constraints, or LOD contract.
 */
export interface SovereignMantleGeometryProfile {
  shoulderHalfWidth: number;
  hemHalfWidth: number;
  length: number;
  centerDrop: number;
  edgeDrop: number;
  shoulderCenterRise: number;
  midWidthFactor: number;
  lateralSkew: number;
  verticalSkew: number;
  zCurve: number;
  zWave: number;
}

export interface SovereignMantleCatalogEntry {
  style: SovereignMantleStyle;
  familyId: SovereignMantleFamilyId;
  publicDisplayName: 'Claude' | 'OpenAI' | 'Gemini' | 'Grok' | 'GLM' | 'Brittney';
  patternId:
    | 'quiet_nested_open_arcs'
    | 'recursive_cell_interlock'
    | 'paired_offset_prismatic_panels'
    | 'off_axis_signal_bands'
    | 'modular_phase_lattice'
    | 'sovereign_locality_mesh';
  glyphId:
    | 'open_arc_weave'
    | 'recursive_interlock_glyph'
    | 'paired_prism_weave'
    | 'diagonal_signal_weave'
    | 'phase_lattice_glyph'
    | 'owned_mesh_glyph';
  /** Packed 0xRRGGBB accent colour; authored source may override it explicitly. */
  accentColor: number;
  geometry: Readonly<SovereignMantleGeometryProfile>;
}

export const SOVEREIGN_MANTLE_CATALOG: Readonly<
  Record<SovereignMantleStyle, Readonly<SovereignMantleCatalogEntry>>
> = Object.freeze({
  anthropic_quiet_nested_arcs: Object.freeze({
    style: 'anthropic_quiet_nested_arcs',
    familyId: 'anthropic',
    publicDisplayName: 'Claude',
    patternId: 'quiet_nested_open_arcs',
    glyphId: 'open_arc_weave',
    accentColor: 0xc16f45,
    geometry: Object.freeze({
      shoulderHalfWidth: 0.36,
      hemHalfWidth: 0.29,
      length: 0.69,
      centerDrop: -0.12,
      edgeDrop: 0.035,
      shoulderCenterRise: 0.09,
      midWidthFactor: 0.08,
      lateralSkew: 0,
      verticalSkew: 0,
      zCurve: 0.032,
      zWave: 0,
    }),
  }),
  openai_recursive_interlock: Object.freeze({
    style: 'openai_recursive_interlock',
    familyId: 'openai',
    publicDisplayName: 'OpenAI',
    patternId: 'recursive_cell_interlock',
    glyphId: 'recursive_interlock_glyph',
    accentColor: 0xd6d1c7,
    geometry: Object.freeze({
      shoulderHalfWidth: 0.34,
      hemHalfWidth: 0.15,
      length: 0.78,
      centerDrop: 0.12,
      edgeDrop: 0,
      shoulderCenterRise: 0,
      midWidthFactor: 0,
      lateralSkew: 0,
      verticalSkew: 0,
      zCurve: 0.026,
      zWave: 0,
    }),
  }),
  google_paired_prism_panels: Object.freeze({
    style: 'google_paired_prism_panels',
    familyId: 'google',
    publicDisplayName: 'Gemini',
    patternId: 'paired_offset_prismatic_panels',
    glyphId: 'paired_prism_weave',
    accentColor: 0x3f6d7a,
    geometry: Object.freeze({
      shoulderHalfWidth: 0.35,
      hemHalfWidth: 0.2,
      length: 0.72,
      centerDrop: -0.15,
      edgeDrop: 0.035,
      shoulderCenterRise: 0.065,
      midWidthFactor: 0.03,
      lateralSkew: 0.055,
      verticalSkew: 0.045,
      zCurve: 0.02,
      zWave: 0.018,
    }),
  }),
  xai_off_axis_signal_bands: Object.freeze({
    style: 'xai_off_axis_signal_bands',
    familyId: 'xai',
    publicDisplayName: 'Grok',
    patternId: 'off_axis_signal_bands',
    glyphId: 'diagonal_signal_weave',
    accentColor: 0xa64b3c,
    geometry: Object.freeze({
      shoulderHalfWidth: 0.33,
      hemHalfWidth: 0.28,
      length: 0.71,
      centerDrop: 0.025,
      edgeDrop: -0.035,
      shoulderCenterRise: 0.025,
      midWidthFactor: 0.06,
      lateralSkew: -0.085,
      verticalSkew: -0.17,
      zCurve: 0.018,
      zWave: -0.022,
    }),
  }),
  glm_modular_phase_lattice: Object.freeze({
    style: 'glm_modular_phase_lattice',
    familyId: 'ollama',
    publicDisplayName: 'GLM',
    patternId: 'modular_phase_lattice',
    glyphId: 'phase_lattice_glyph',
    accentColor: 0xc8a84e,
    geometry: Object.freeze({
      shoulderHalfWidth: 0.34,
      hemHalfWidth: 0.3,
      length: 0.61,
      centerDrop: 0,
      edgeDrop: 0,
      shoulderCenterRise: 0.035,
      midWidthFactor: -0.03,
      lateralSkew: 0,
      verticalSkew: 0,
      zCurve: 0.014,
      zWave: 0,
    }),
  }),
  sovereign_locality_mesh: Object.freeze({
    style: 'sovereign_locality_mesh',
    familyId: 'sovereign',
    publicDisplayName: 'Brittney',
    patternId: 'sovereign_locality_mesh',
    glyphId: 'owned_mesh_glyph',
    accentColor: 0x6d5a8c,
    geometry: Object.freeze({
      shoulderHalfWidth: 0.38,
      hemHalfWidth: 0.26,
      length: 0.75,
      centerDrop: -0.16,
      edgeDrop: 0.045,
      shoulderCenterRise: 0.075,
      midWidthFactor: 0.1,
      lateralSkew: 0,
      verticalSkew: 0,
      zCurve: 0.036,
      zWave: 0.012,
    }),
  }),
});

const SOVEREIGN_MANTLE_STYLES = Object.freeze(
  Object.keys(SOVEREIGN_MANTLE_CATALOG) as SovereignMantleStyle[]
);

export function isSovereignMantleStyle(value: string): value is SovereignMantleStyle {
  return Object.prototype.hasOwnProperty.call(SOVEREIGN_MANTLE_CATALOG, value);
}

export function getSovereignMantleCatalogEntry(
  style: SovereignMantleStyle
): Readonly<SovereignMantleCatalogEntry> {
  return SOVEREIGN_MANTLE_CATALOG[style];
}

export function listSovereignMantleStyles(): readonly SovereignMantleStyle[] {
  return SOVEREIGN_MANTLE_STYLES;
}
