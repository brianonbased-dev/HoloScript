/**
 * MaterialPresetAudit — Audit 78 material presets against R3F renderer support
 *
 * AUDIT-038: Material Preset Audit
 *
 * Purpose:
 *   The HoloScript language supports 78 material presets with advanced PBR
 *   features (SSS, iridescence, 16 texture channels, custom shaders). However,
 *   the R3F renderer only outputs basic meshPhysicalMaterial with limited
 *   property support. This auditor identifies gaps and generates a
 *   compatibility matrix.
 *
 * Features:
 * - Audits all 78 material presets against renderer capabilities
 * - Generates compatibility matrix (supported / partial / unsupported)
 * - Reports per-property gap analysis
 * - Suggests renderer improvements ordered by impact
 * - Exportable report (JSON, Markdown)
 *
 * @version 1.0.0
 */

// =============================================================================
// TYPES
// =============================================================================

export type CompatibilityLevel = 'full' | 'partial' | 'unsupported' | 'degraded';

export type MaterialPropertyCategory =
  | 'base'
  | 'pbr'
  | 'advanced-pbr'
  | 'texture'
  | 'shader'
  | 'transparency'
  | 'emission'
  | 'special';

export interface MaterialProperty {
  name: string;
  category: MaterialPropertyCategory;
  description: string;
  r3fSupport: CompatibilityLevel;
  threeJsProperty?: string; // corresponding Three.js property name
  fallback?: string; // what happens when not supported
}

export interface MaterialPreset {
  name: string;
  category: string;
  description: string;
  properties: Record<string, unknown>;
  requiredFeatures: string[];
  tags: string[];
}

export interface PresetAuditResult {
  preset: MaterialPreset;
  compatibility: CompatibilityLevel;
  supportedProperties: string[];
  partialProperties: string[];
  unsupportedProperties: string[];
  degradedProperties: string[];
  score: number; // 0-100
  notes: string[];
  suggestedFixes: string[];
}

export interface AuditReport {
  timestamp: number;
  totalPresets: number;
  fullySupportedCount: number;
  partialCount: number;
  unsupportedCount: number;
  degradedCount: number;
  overallScore: number; // 0-100
  presetResults: PresetAuditResult[];
  propertyGaps: PropertyGap[];
  rendererImprovements: RendererImprovement[];
  compatibilityMatrix: CompatibilityMatrixRow[];
}

export interface PropertyGap {
  property: string;
  category: MaterialPropertyCategory;
  affectedPresets: string[];
  impactScore: number; // how many presets need this
  difficulty: 'trivial' | 'moderate' | 'complex' | 'requires-shader';
  threeJsSupport: boolean; // does Three.js support it even if R3F renderer doesn't?
}

export interface RendererImprovement {
  title: string;
  description: string;
  properties: string[];
  presetsFixed: number;
  difficulty: 'trivial' | 'moderate' | 'complex' | 'requires-shader';
  estimatedEffort: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
}

export interface CompatibilityMatrixRow {
  presetName: string;
  category: string;
  color: CompatibilityLevel;
  metalness: CompatibilityLevel;
  roughness: CompatibilityLevel;
  emissive: CompatibilityLevel;
  transmission: CompatibilityLevel;
  iridescence: CompatibilityLevel;
  clearcoat: CompatibilityLevel;
  subsurface: CompatibilityLevel;
  textures: CompatibilityLevel;
  shader: CompatibilityLevel;
  overallLevel: CompatibilityLevel;
}

// =============================================================================
// RENDERER CAPABILITY MAP
// =============================================================================

/**
 * What the R3F renderer currently supports.
 * Based on MEMORY.md: "renderer only outputs basic meshPhysicalMaterial
 * with color/metalness/roughness"
 */
const R3F_RENDERER_CAPABILITIES: Record<string, MaterialProperty> = {
  // Base - SUPPORTED
  color: {
    name: 'color',
    category: 'base',
    description: 'Base albedo color',
    r3fSupport: 'full',
    threeJsProperty: 'color',
  },
  opacity: {
    name: 'opacity',
    category: 'transparency',
    description: 'Material opacity',
    r3fSupport: 'full',
    threeJsProperty: 'opacity',
  },
  transparent: {
    name: 'transparent',
    category: 'transparency',
    description: 'Enable transparency',
    r3fSupport: 'full',
    threeJsProperty: 'transparent',
  },

  // PBR - SUPPORTED
  metalness: {
    name: 'metalness',
    category: 'pbr',
    description: 'Metalness factor',
    r3fSupport: 'full',
    threeJsProperty: 'metalness',
  },
  roughness: {
    name: 'roughness',
    category: 'pbr',
    description: 'Roughness factor',
    r3fSupport: 'full',
    threeJsProperty: 'roughness',
  },

  // Emission - PARTIAL (Phase 1 fixed emissive override issue)
  emissive: {
    name: 'emissive',
    category: 'emission',
    description: 'Emission color',
    r3fSupport: 'partial',
    threeJsProperty: 'emissive',
    fallback: 'Emissive color renders but intensity may default to 0',
  },
  emissiveIntensity: {
    name: 'emissiveIntensity',
    category: 'emission',
    description: 'Emission strength',
    r3fSupport: 'partial',
    threeJsProperty: 'emissiveIntensity',
    fallback: 'Falls back to || 0 (Phase 1 fix applied)',
  },

  // Transmission - PARTIAL (Phase 1 auto-transparency)
  transmission: {
    name: 'transmission',
    category: 'advanced-pbr',
    description: 'Light transmission',
    r3fSupport: 'partial',
    threeJsProperty: 'transmission',
    fallback: 'Auto-transparency added but refraction limited',
  },
  thickness: {
    name: 'thickness',
    category: 'advanced-pbr',
    description: 'Material thickness for transmission',
    r3fSupport: 'partial',
    threeJsProperty: 'thickness',
  },
  ior: {
    name: 'ior',
    category: 'advanced-pbr',
    description: 'Index of refraction',
    r3fSupport: 'partial',
    threeJsProperty: 'ior',
  },

  // Advanced PBR - UNSUPPORTED by R3F renderer
  iridescence: {
    name: 'iridescence',
    category: 'advanced-pbr',
    description: 'Thin-film iridescence',
    r3fSupport: 'unsupported',
    threeJsProperty: 'iridescence',
    fallback: 'Silently ignored',
  },
  iridescenceIOR: {
    name: 'iridescenceIOR',
    category: 'advanced-pbr',
    description: 'Iridescence IOR',
    r3fSupport: 'unsupported',
    threeJsProperty: 'iridescenceIOR',
  },
  iridescenceThicknessRange: {
    name: 'iridescenceThicknessRange',
    category: 'advanced-pbr',
    description: 'Iridescence thickness range',
    r3fSupport: 'unsupported',
    threeJsProperty: 'iridescenceThicknessRange',
  },
  clearcoat: {
    name: 'clearcoat',
    category: 'advanced-pbr',
    description: 'Clearcoat layer',
    r3fSupport: 'unsupported',
    threeJsProperty: 'clearcoat',
    fallback: 'Silently ignored',
  },
  clearcoatRoughness: {
    name: 'clearcoatRoughness',
    category: 'advanced-pbr',
    description: 'Clearcoat roughness',
    r3fSupport: 'unsupported',
    threeJsProperty: 'clearcoatRoughness',
  },
  sheen: {
    name: 'sheen',
    category: 'advanced-pbr',
    description: 'Sheen layer',
    r3fSupport: 'unsupported',
    threeJsProperty: 'sheen',
    fallback: 'Silently ignored',
  },
  sheenRoughness: {
    name: 'sheenRoughness',
    category: 'advanced-pbr',
    description: 'Sheen roughness',
    r3fSupport: 'unsupported',
    threeJsProperty: 'sheenRoughness',
  },
  sheenColor: {
    name: 'sheenColor',
    category: 'advanced-pbr',
    description: 'Sheen color',
    r3fSupport: 'unsupported',
    threeJsProperty: 'sheenColor',
  },
  anisotropy: {
    name: 'anisotropy',
    category: 'advanced-pbr',
    description: 'Anisotropic reflections',
    r3fSupport: 'unsupported',
    threeJsProperty: 'anisotropy',
  },
  subsurface: {
    name: 'subsurface',
    category: 'special',
    description: 'Subsurface scattering',
    r3fSupport: 'unsupported',
    fallback: 'Requires custom shader; not in meshPhysicalMaterial',
  },

  // Textures - PARTIAL (Phase 3 useHoloTextures hook)
  map: {
    name: 'map',
    category: 'texture',
    description: 'Albedo/diffuse map',
    r3fSupport: 'partial',
    threeJsProperty: 'map',
    fallback: 'useHoloTextures hook available (Phase 3)',
  },
  normalMap: {
    name: 'normalMap',
    category: 'texture',
    description: 'Normal map',
    r3fSupport: 'partial',
    threeJsProperty: 'normalMap',
  },
  roughnessMap: {
    name: 'roughnessMap',
    category: 'texture',
    description: 'Roughness map',
    r3fSupport: 'partial',
    threeJsProperty: 'roughnessMap',
  },
  metalnessMap: {
    name: 'metalnessMap',
    category: 'texture',
    description: 'Metalness map',
    r3fSupport: 'partial',
    threeJsProperty: 'metalnessMap',
  },
  emissiveMap: {
    name: 'emissiveMap',
    category: 'texture',
    description: 'Emissive map',
    r3fSupport: 'partial',
    threeJsProperty: 'emissiveMap',
  },
  aoMap: {
    name: 'aoMap',
    category: 'texture',
    description: 'Ambient occlusion map',
    r3fSupport: 'partial',
    threeJsProperty: 'aoMap',
  },
  displacementMap: {
    name: 'displacementMap',
    category: 'texture',
    description: 'Displacement map',
    r3fSupport: 'unsupported',
    threeJsProperty: 'displacementMap',
  },
  bumpMap: {
    name: 'bumpMap',
    category: 'texture',
    description: 'Bump map',
    r3fSupport: 'unsupported',
    threeJsProperty: 'bumpMap',
  },
  lightMap: {
    name: 'lightMap',
    category: 'texture',
    description: 'Light map',
    r3fSupport: 'unsupported',
    threeJsProperty: 'lightMap',
  },
  envMap: {
    name: 'envMap',
    category: 'texture',
    description: 'Environment map',
    r3fSupport: 'unsupported',
    threeJsProperty: 'envMap',
  },
  alphaMap: {
    name: 'alphaMap',
    category: 'texture',
    description: 'Alpha map',
    r3fSupport: 'unsupported',
    threeJsProperty: 'alphaMap',
  },
  clearcoatNormalMap: {
    name: 'clearcoatNormalMap',
    category: 'texture',
    description: 'Clearcoat normal map',
    r3fSupport: 'unsupported',
    threeJsProperty: 'clearcoatNormalMap',
  },
  transmissionMap: {
    name: 'transmissionMap',
    category: 'texture',
    description: 'Transmission map',
    r3fSupport: 'unsupported',
    threeJsProperty: 'transmissionMap',
  },
  thicknessMap: {
    name: 'thicknessMap',
    category: 'texture',
    description: 'Thickness map',
    r3fSupport: 'unsupported',
    threeJsProperty: 'thicknessMap',
  },
  iridescenceMap: {
    name: 'iridescenceMap',
    category: 'texture',
    description: 'Iridescence map',
    r3fSupport: 'unsupported',
    threeJsProperty: 'iridescenceMap',
  },
  iridescenceThicknessMap: {
    name: 'iridescenceThicknessMap',
    category: 'texture',
    description: 'Iridescence thickness map',
    r3fSupport: 'unsupported',
    threeJsProperty: 'iridescenceThicknessMap',
  },

  // Shaders - PARTIAL (Phase 5 ShaderMeshNode)
  customShader: {
    name: 'customShader',
    category: 'shader',
    description: 'Custom shader material',
    r3fSupport: 'partial',
    fallback: 'ShaderMeshNode supports @shader trait (Phase 5)',
  },

  // Procedural textures - PARTIAL (Phase 4)
  proceduralTexture: {
    name: 'proceduralTexture',
    category: 'texture',
    description: 'Procedural texture generation',
    r3fSupport: 'partial',
    fallback: 'core generators -> THREE.DataTexture (Phase 4)',
  },
};

// =============================================================================
// 78 MATERIAL PRESETS
// =============================================================================

const MATERIAL_PRESETS: MaterialPreset[] = [
  // ─── Basic Materials ──────────────────────────────────────────────────
  {
    name: 'default',
    category: 'basic',
    description: 'Default white material',
    properties: { color: '#ffffff', metalness: 0, roughness: 0.5 },
    requiredFeatures: ['color', 'metalness', 'roughness'],
    tags: ['basic'],
  },
  {
    name: 'matte',
    category: 'basic',
    description: 'Flat matte finish',
    properties: { roughness: 1, metalness: 0 },
    requiredFeatures: ['color', 'roughness'],
    tags: ['basic', 'matte'],
  },
  {
    name: 'glossy',
    category: 'basic',
    description: 'Shiny glossy surface',
    properties: { roughness: 0.1, metalness: 0 },
    requiredFeatures: ['color', 'roughness'],
    tags: ['basic', 'shiny'],
  },
  {
    name: 'plastic',
    category: 'basic',
    description: 'Plastic-like material',
    properties: { roughness: 0.4, metalness: 0 },
    requiredFeatures: ['color', 'roughness'],
    tags: ['basic', 'plastic'],
  },
  {
    name: 'rubber',
    category: 'basic',
    description: 'Rubber material',
    properties: { roughness: 0.9, metalness: 0 },
    requiredFeatures: ['color', 'roughness'],
    tags: ['basic', 'rubber'],
  },

  // ─── Metals ───────────────────────────────────────────────────────────
  {
    name: 'chrome',
    category: 'metal',
    description: 'Polished chrome',
    properties: { metalness: 1, roughness: 0.05, color: '#e8e8e8' },
    requiredFeatures: ['color', 'metalness', 'roughness', 'envMap'],
    tags: ['metal', 'reflective'],
  },
  {
    name: 'gold',
    category: 'metal',
    description: 'Gold surface',
    properties: { metalness: 1, roughness: 0.2, color: '#ffd700' },
    requiredFeatures: ['color', 'metalness', 'roughness', 'envMap'],
    tags: ['metal', 'precious'],
  },
  {
    name: 'silver',
    category: 'metal',
    description: 'Silver surface',
    properties: { metalness: 1, roughness: 0.15, color: '#c0c0c0' },
    requiredFeatures: ['color', 'metalness', 'roughness', 'envMap'],
    tags: ['metal', 'precious'],
  },
  {
    name: 'copper',
    category: 'metal',
    description: 'Copper surface',
    properties: { metalness: 1, roughness: 0.3, color: '#b87333' },
    requiredFeatures: ['color', 'metalness', 'roughness'],
    tags: ['metal'],
  },
  {
    name: 'bronze',
    category: 'metal',
    description: 'Bronze surface',
    properties: { metalness: 0.9, roughness: 0.4, color: '#cd7f32' },
    requiredFeatures: ['color', 'metalness', 'roughness'],
    tags: ['metal'],
  },
  {
    name: 'iron',
    category: 'metal',
    description: 'Raw iron',
    properties: { metalness: 0.95, roughness: 0.6, color: '#48494b' },
    requiredFeatures: ['color', 'metalness', 'roughness'],
    tags: ['metal', 'industrial'],
  },
  {
    name: 'brushedSteel',
    category: 'metal',
    description: 'Brushed steel finish',
    properties: { metalness: 1, roughness: 0.35, color: '#8a8a8a', anisotropy: 0.8 },
    requiredFeatures: ['color', 'metalness', 'roughness', 'anisotropy'],
    tags: ['metal', 'industrial'],
  },
  {
    name: 'aluminum',
    category: 'metal',
    description: 'Aluminum surface',
    properties: { metalness: 0.95, roughness: 0.25, color: '#a8a8a8' },
    requiredFeatures: ['color', 'metalness', 'roughness'],
    tags: ['metal'],
  },
  {
    name: 'titanium',
    category: 'metal',
    description: 'Titanium surface',
    properties: { metalness: 0.9, roughness: 0.3, color: '#878681' },
    requiredFeatures: ['color', 'metalness', 'roughness'],
    tags: ['metal'],
  },
  {
    name: 'rustedMetal',
    category: 'metal',
    description: 'Oxidized rusty metal',
    properties: { metalness: 0.7, roughness: 0.85, color: '#8b4513' },
    requiredFeatures: ['color', 'metalness', 'roughness', 'roughnessMap', 'normalMap'],
    tags: ['metal', 'weathered'],
  },

  // ─── Glass & Transparent ──────────────────────────────────────────────
  {
    name: 'glass',
    category: 'glass',
    description: 'Clear glass',
    properties: { transmission: 1, roughness: 0, ior: 1.5, thickness: 0.5 },
    requiredFeatures: ['transmission', 'roughness', 'ior', 'thickness'],
    tags: ['glass', 'transparent'],
  },
  {
    name: 'frostedGlass',
    category: 'glass',
    description: 'Frosted/etched glass',
    properties: { transmission: 0.9, roughness: 0.4, ior: 1.5 },
    requiredFeatures: ['transmission', 'roughness', 'ior'],
    tags: ['glass', 'translucent'],
  },
  {
    name: 'stainedGlass',
    category: 'glass',
    description: 'Colored stained glass',
    properties: { transmission: 0.8, roughness: 0.1, color: '#ff4444' },
    requiredFeatures: ['transmission', 'roughness', 'color'],
    tags: ['glass', 'decorative'],
  },
  {
    name: 'crystal',
    category: 'glass',
    description: 'Cut crystal',
    properties: { transmission: 1, roughness: 0, ior: 2.0, iridescence: 0.3 },
    requiredFeatures: ['transmission', 'ior', 'iridescence'],
    tags: ['glass', 'luxury'],
  },
  {
    name: 'diamond',
    category: 'glass',
    description: 'Diamond material',
    properties: { transmission: 1, roughness: 0, ior: 2.42, iridescence: 0.5 },
    requiredFeatures: ['transmission', 'ior', 'iridescence'],
    tags: ['glass', 'precious'],
  },
  {
    name: 'ice',
    category: 'glass',
    description: 'Ice material',
    properties: { transmission: 0.7, roughness: 0.3, ior: 1.31, color: '#e0f0ff', subsurface: 0.2 },
    requiredFeatures: ['transmission', 'ior', 'subsurface'],
    tags: ['natural', 'transparent'],
  },

  // ─── Emissive ─────────────────────────────────────────────────────────
  {
    name: 'neon',
    category: 'emissive',
    description: 'Bright neon glow',
    properties: { emissive: '#00ff88', emissiveIntensity: 3 },
    requiredFeatures: ['emissive', 'emissiveIntensity'],
    tags: ['emissive', 'glow', 'neon'],
  },
  {
    name: 'lava',
    category: 'emissive',
    description: 'Molten lava',
    properties: { emissive: '#ff4400', emissiveIntensity: 2, roughness: 0.9, color: '#1a0a00' },
    requiredFeatures: ['emissive', 'emissiveIntensity', 'emissiveMap'],
    tags: ['emissive', 'natural'],
  },
  {
    name: 'hologram',
    category: 'emissive',
    description: 'Sci-fi hologram',
    properties: { emissive: '#00ccff', emissiveIntensity: 1.5, transparent: true, opacity: 0.5 },
    requiredFeatures: ['emissive', 'transparent', 'opacity'],
    tags: ['emissive', 'scifi'],
  },
  {
    name: 'screen',
    category: 'emissive',
    description: 'LED screen surface',
    properties: { emissive: '#ffffff', emissiveIntensity: 1, roughness: 0.1 },
    requiredFeatures: ['emissive', 'emissiveIntensity', 'emissiveMap'],
    tags: ['emissive', 'tech'],
  },

  // ─── Natural Materials ────────────────────────────────────────────────
  {
    name: 'wood',
    category: 'natural',
    description: 'Natural wood grain',
    properties: { roughness: 0.7, metalness: 0, color: '#8b6914' },
    requiredFeatures: ['color', 'roughness', 'normalMap', 'map'],
    tags: ['natural', 'wood'],
  },
  {
    name: 'darkWood',
    category: 'natural',
    description: 'Dark walnut wood',
    properties: { roughness: 0.6, metalness: 0, color: '#3e2723' },
    requiredFeatures: ['color', 'roughness', 'normalMap', 'map'],
    tags: ['natural', 'wood'],
  },
  {
    name: 'lightWood',
    category: 'natural',
    description: 'Light pine/birch wood',
    properties: { roughness: 0.65, metalness: 0, color: '#deb887' },
    requiredFeatures: ['color', 'roughness', 'normalMap', 'map'],
    tags: ['natural', 'wood'],
  },
  {
    name: 'stone',
    category: 'natural',
    description: 'Natural stone',
    properties: { roughness: 0.85, metalness: 0, color: '#808080' },
    requiredFeatures: ['color', 'roughness', 'normalMap'],
    tags: ['natural', 'stone'],
  },
  {
    name: 'marble',
    category: 'natural',
    description: 'Polished marble',
    properties: { roughness: 0.2, metalness: 0, color: '#f5f5f5', subsurface: 0.1 },
    requiredFeatures: ['color', 'roughness', 'subsurface', 'normalMap', 'map'],
    tags: ['natural', 'stone', 'luxury'],
  },
  {
    name: 'granite',
    category: 'natural',
    description: 'Granite surface',
    properties: { roughness: 0.5, metalness: 0.05, color: '#696969' },
    requiredFeatures: ['color', 'roughness', 'normalMap', 'map'],
    tags: ['natural', 'stone'],
  },
  {
    name: 'sandstone',
    category: 'natural',
    description: 'Sandstone',
    properties: { roughness: 0.9, metalness: 0, color: '#d2b48c' },
    requiredFeatures: ['color', 'roughness'],
    tags: ['natural', 'stone'],
  },
  {
    name: 'clay',
    category: 'natural',
    description: 'Ceramic clay',
    properties: { roughness: 0.8, metalness: 0, color: '#cc7733' },
    requiredFeatures: ['color', 'roughness'],
    tags: ['natural', 'craft'],
  },
  {
    name: 'dirt',
    category: 'natural',
    description: 'Soil/dirt',
    properties: { roughness: 1, metalness: 0, color: '#5c4033' },
    requiredFeatures: ['color', 'roughness', 'normalMap'],
    tags: ['natural', 'terrain'],
  },
  {
    name: 'sand',
    category: 'natural',
    description: 'Sand surface',
    properties: { roughness: 0.95, metalness: 0, color: '#c2b280' },
    requiredFeatures: ['color', 'roughness', 'normalMap'],
    tags: ['natural', 'terrain'],
  },
  {
    name: 'grass',
    category: 'natural',
    description: 'Grass/lawn',
    properties: { roughness: 0.9, metalness: 0, color: '#228b22' },
    requiredFeatures: ['color', 'roughness', 'map', 'normalMap'],
    tags: ['natural', 'terrain'],
  },
  {
    name: 'water',
    category: 'natural',
    description: 'Water surface',
    properties: { transmission: 0.9, roughness: 0.05, ior: 1.33, color: '#004488' },
    requiredFeatures: ['transmission', 'ior', 'normalMap', 'envMap'],
    tags: ['natural', 'liquid'],
  },
  {
    name: 'snow',
    category: 'natural',
    description: 'Fresh snow',
    properties: { roughness: 0.3, metalness: 0, color: '#fffafa', subsurface: 0.15 },
    requiredFeatures: ['color', 'roughness', 'subsurface'],
    tags: ['natural', 'terrain'],
  },

  // ─── Fabric ───────────────────────────────────────────────────────────
  {
    name: 'fabric',
    category: 'fabric',
    description: 'Generic cloth/fabric',
    properties: { roughness: 0.9, metalness: 0, sheen: 0.5 },
    requiredFeatures: ['color', 'roughness', 'sheen'],
    tags: ['fabric', 'cloth'],
  },
  {
    name: 'silk',
    category: 'fabric',
    description: 'Silk fabric',
    properties: { roughness: 0.3, metalness: 0, sheen: 0.8, sheenRoughness: 0.2 },
    requiredFeatures: ['color', 'roughness', 'sheen', 'sheenRoughness'],
    tags: ['fabric', 'luxury'],
  },
  {
    name: 'velvet',
    category: 'fabric',
    description: 'Velvet fabric',
    properties: { roughness: 0.8, metalness: 0, sheen: 0.9, sheenRoughness: 0.6 },
    requiredFeatures: ['color', 'roughness', 'sheen', 'sheenRoughness'],
    tags: ['fabric', 'luxury'],
  },
  {
    name: 'leather',
    category: 'fabric',
    description: 'Leather material',
    properties: { roughness: 0.6, metalness: 0, color: '#8b4513' },
    requiredFeatures: ['color', 'roughness', 'normalMap'],
    tags: ['fabric', 'natural'],
  },
  {
    name: 'denim',
    category: 'fabric',
    description: 'Denim fabric',
    properties: { roughness: 0.85, metalness: 0, color: '#1560bd' },
    requiredFeatures: ['color', 'roughness', 'normalMap'],
    tags: ['fabric', 'cloth'],
  },

  // ─── Coating / Car Paint ──────────────────────────────────────────────
  {
    name: 'carPaint',
    category: 'coating',
    description: 'Metallic car paint',
    properties: { metalness: 0.6, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05 },
    requiredFeatures: ['color', 'metalness', 'roughness', 'clearcoat', 'clearcoatRoughness'],
    tags: ['coating', 'automotive'],
  },
  {
    name: 'matteCarPaint',
    category: 'coating',
    description: 'Matte car paint',
    properties: { metalness: 0.4, roughness: 0.7, clearcoat: 0.3 },
    requiredFeatures: ['color', 'metalness', 'roughness', 'clearcoat'],
    tags: ['coating', 'automotive'],
  },
  {
    name: 'pearlescent',
    category: 'coating',
    description: 'Pearlescent finish',
    properties: { metalness: 0.3, roughness: 0.2, iridescence: 0.6, clearcoat: 0.8 },
    requiredFeatures: ['color', 'iridescence', 'clearcoat'],
    tags: ['coating', 'luxury'],
  },
  {
    name: 'lacquer',
    category: 'coating',
    description: 'Glossy lacquer',
    properties: { roughness: 0.05, metalness: 0, clearcoat: 1 },
    requiredFeatures: ['color', 'roughness', 'clearcoat'],
    tags: ['coating', 'glossy'],
  },
  {
    name: 'ceramic',
    category: 'coating',
    description: 'Ceramic glaze',
    properties: { roughness: 0.15, metalness: 0, clearcoat: 0.7 },
    requiredFeatures: ['color', 'roughness', 'clearcoat'],
    tags: ['coating', 'craft'],
  },

  // ─── Skin / Organic ───────────────────────────────────────────────────
  {
    name: 'skin',
    category: 'organic',
    description: 'Human skin',
    properties: { roughness: 0.5, metalness: 0, subsurface: 0.4, color: '#e0b0a0' },
    requiredFeatures: ['color', 'roughness', 'subsurface'],
    tags: ['organic', 'skin', 'character'],
  },
  {
    name: 'skinDark',
    category: 'organic',
    description: 'Dark skin tone',
    properties: { roughness: 0.5, metalness: 0, subsurface: 0.35, color: '#8d5524' },
    requiredFeatures: ['color', 'roughness', 'subsurface'],
    tags: ['organic', 'skin', 'character'],
  },
  {
    name: 'wax',
    category: 'organic',
    description: 'Candle wax',
    properties: {
      roughness: 0.4,
      metalness: 0,
      subsurface: 0.6,
      color: '#fdf5e6',
      transmission: 0.2,
    },
    requiredFeatures: ['color', 'roughness', 'subsurface', 'transmission'],
    tags: ['organic', 'translucent'],
  },
  {
    name: 'leaf',
    category: 'organic',
    description: 'Plant leaf',
    properties: { roughness: 0.6, metalness: 0, subsurface: 0.3, color: '#228b22' },
    requiredFeatures: ['color', 'roughness', 'subsurface', 'map', 'alphaMap'],
    tags: ['organic', 'natural'],
  },
  {
    name: 'eye',
    category: 'organic',
    description: 'Eye/iris material',
    properties: { roughness: 0.1, metalness: 0, clearcoat: 0.9 },
    requiredFeatures: ['color', 'roughness', 'clearcoat', 'map'],
    tags: ['organic', 'character'],
  },

  // ─── Concrete / Architectural ─────────────────────────────────────────
  {
    name: 'concrete',
    category: 'architectural',
    description: 'Raw concrete',
    properties: { roughness: 0.95, metalness: 0, color: '#b0b0b0' },
    requiredFeatures: ['color', 'roughness', 'normalMap'],
    tags: ['architectural', 'industrial'],
  },
  {
    name: 'polishedConcrete',
    category: 'architectural',
    description: 'Polished concrete',
    properties: { roughness: 0.3, metalness: 0.05, color: '#a0a0a0' },
    requiredFeatures: ['color', 'roughness'],
    tags: ['architectural', 'modern'],
  },
  {
    name: 'brick',
    category: 'architectural',
    description: 'Brick wall',
    properties: { roughness: 0.85, metalness: 0, color: '#b74444' },
    requiredFeatures: ['color', 'roughness', 'normalMap', 'map'],
    tags: ['architectural'],
  },
  {
    name: 'tile',
    category: 'architectural',
    description: 'Ceramic tile',
    properties: { roughness: 0.2, metalness: 0 },
    requiredFeatures: ['color', 'roughness', 'normalMap'],
    tags: ['architectural'],
  },
  {
    name: 'plaster',
    category: 'architectural',
    description: 'Wall plaster',
    properties: { roughness: 0.8, metalness: 0, color: '#f5f5dc' },
    requiredFeatures: ['color', 'roughness'],
    tags: ['architectural'],
  },
  {
    name: 'asphalt',
    category: 'architectural',
    description: 'Road asphalt',
    properties: { roughness: 0.95, metalness: 0, color: '#333333' },
    requiredFeatures: ['color', 'roughness', 'normalMap'],
    tags: ['architectural', 'terrain'],
  },

  // ─── Sci-Fi / Special ─────────────────────────────────────────────────
  {
    name: 'forcefield',
    category: 'scifi',
    description: 'Energy force field',
    properties: { transparent: true, opacity: 0.3, emissive: '#00aaff', emissiveIntensity: 2 },
    requiredFeatures: ['transparent', 'opacity', 'emissive', 'customShader'],
    tags: ['scifi', 'energy'],
  },
  {
    name: 'plasma',
    category: 'scifi',
    description: 'Plasma energy',
    properties: { emissive: '#ff00ff', emissiveIntensity: 4, transparent: true },
    requiredFeatures: ['emissive', 'emissiveIntensity', 'customShader'],
    tags: ['scifi', 'energy'],
  },
  {
    name: 'circuit',
    category: 'scifi',
    description: 'Circuit board',
    properties: { emissive: '#00ff00', emissiveIntensity: 0.5, metalness: 0.8, roughness: 0.3 },
    requiredFeatures: ['color', 'emissive', 'metalness', 'emissiveMap'],
    tags: ['scifi', 'tech'],
  },
  {
    name: 'wireframe',
    category: 'scifi',
    description: 'Wireframe overlay',
    properties: { transparent: true, opacity: 0.5, emissive: '#ffffff' },
    requiredFeatures: ['transparent', 'emissive', 'customShader'],
    tags: ['scifi', 'debug'],
  },

  // ─── Toon / Stylized ──────────────────────────────────────────────────
  {
    name: 'toon',
    category: 'stylized',
    description: 'Cel-shaded toon',
    properties: { roughness: 1, metalness: 0 },
    requiredFeatures: ['color', 'customShader'],
    tags: ['stylized', 'toon'],
  },
  {
    name: 'toonOutline',
    category: 'stylized',
    description: 'Toon with outline',
    properties: { roughness: 1, metalness: 0 },
    requiredFeatures: ['color', 'customShader'],
    tags: ['stylized', 'toon', 'outline'],
  },
  {
    name: 'watercolor',
    category: 'stylized',
    description: 'Watercolor paint effect',
    properties: { roughness: 0.8 },
    requiredFeatures: ['color', 'customShader', 'proceduralTexture'],
    tags: ['stylized', 'artistic'],
  },
  {
    name: 'pencilSketch',
    category: 'stylized',
    description: 'Pencil sketch effect',
    properties: {},
    requiredFeatures: ['customShader', 'proceduralTexture'],
    tags: ['stylized', 'artistic'],
  },
  {
    name: 'pixelArt',
    category: 'stylized',
    description: 'Pixel art look',
    properties: { roughness: 1, metalness: 0 },
    requiredFeatures: ['color', 'customShader'],
    tags: ['stylized', 'retro'],
  },

  // ─── Food / Misc ──────────────────────────────────────────────────────
  {
    name: 'chocolate',
    category: 'food',
    description: 'Chocolate material',
    properties: { roughness: 0.35, metalness: 0, color: '#3c1414', subsurface: 0.2 },
    requiredFeatures: ['color', 'roughness', 'subsurface'],
    tags: ['food', 'organic'],
  },
  {
    name: 'honey',
    category: 'food',
    description: 'Honey / syrup',
    properties: { transmission: 0.6, roughness: 0.1, color: '#eb9605', ior: 1.5 },
    requiredFeatures: ['transmission', 'color', 'ior'],
    tags: ['food', 'liquid'],
  },
  {
    name: 'cheese',
    category: 'food',
    description: 'Cheese surface',
    properties: { roughness: 0.7, metalness: 0, subsurface: 0.3, color: '#ffc107' },
    requiredFeatures: ['color', 'roughness', 'subsurface'],
    tags: ['food', 'organic'],
  },

  // ─── Procedural ───────────────────────────────────────────────────────
  {
    name: 'noise',
    category: 'procedural',
    description: 'Perlin noise pattern',
    properties: {},
    requiredFeatures: ['proceduralTexture', 'customShader'],
    tags: ['procedural'],
  },
  {
    name: 'checkerboard',
    category: 'procedural',
    description: 'Checkerboard pattern',
    properties: {},
    requiredFeatures: ['proceduralTexture'],
    tags: ['procedural', 'pattern'],
  },
  {
    name: 'gradient',
    category: 'procedural',
    description: 'Color gradient',
    properties: {},
    requiredFeatures: ['customShader'],
    tags: ['procedural'],
  },
  {
    name: 'voronoi',
    category: 'procedural',
    description: 'Voronoi cell pattern',
    properties: {},
    requiredFeatures: ['proceduralTexture', 'customShader'],
    tags: ['procedural', 'pattern'],
  },
];

// =============================================================================
// AUDIT ENGINE
// =============================================================================

export class MaterialPresetAuditor {
  private capabilities: Record<string, MaterialProperty>;
  private presets: MaterialPreset[];

  constructor(
    capabilities: Record<string, MaterialProperty> = R3F_RENDERER_CAPABILITIES,
    presets: MaterialPreset[] = MATERIAL_PRESETS
  ) {
    this.capabilities = capabilities;
    this.presets = presets;
  }

  /** Run the full audit across all presets. */
  audit(): AuditReport {
    const presetResults = this.presets.map((preset) => this.auditPreset(preset));

    const fullySupportedCount = presetResults.filter((r) => r.compatibility === 'full').length;
    const partialCount = presetResults.filter((r) => r.compatibility === 'partial').length;
    const unsupportedCount = presetResults.filter((r) => r.compatibility === 'unsupported').length;
    const degradedCount = presetResults.filter((r) => r.compatibility === 'degraded').length;

    const overallScore = Math.round(
      presetResults.reduce((sum, r) => sum + r.score, 0) / presetResults.length
    );

    const propertyGaps = this.analyzePropertyGaps(presetResults);
    const rendererImprovements = this.generateImprovements(propertyGaps);
    const compatibilityMatrix = presetResults.map((r) => this.buildMatrixRow(r));

    return {
      timestamp: Date.now(),
      totalPresets: this.presets.length,
      fullySupportedCount,
      partialCount,
      unsupportedCount,
      degradedCount,
      overallScore,
      presetResults,
      propertyGaps,
      rendererImprovements,
      compatibilityMatrix,
    };
  }

  /** Audit a single preset. */
  auditPreset(preset: MaterialPreset): PresetAuditResult {
    const supported: string[] = [];
    const partial: string[] = [];
    const unsupported: string[] = [];
    const degraded: string[] = [];
    const notes: string[] = [];
    const suggestedFixes: string[] = [];

    for (const feature of preset.requiredFeatures) {
      const cap = this.capabilities[feature];
      if (!cap) {
        unsupported.push(feature);
        continue;
      }

      switch (cap.r3fSupport) {
        case 'full':
          supported.push(feature);
          break;
        case 'partial':
          partial.push(feature);
          if (cap.fallback) notes.push(`${feature}: ${cap.fallback}`);
          break;
        case 'degraded':
          degraded.push(feature);
          if (cap.fallback) notes.push(`${feature}: ${cap.fallback}`);
          break;
        case 'unsupported':
          unsupported.push(feature);
          if (cap.fallback) notes.push(`${feature}: ${cap.fallback}`);
          if (cap.threeJsProperty) {
            suggestedFixes.push(`Pass ${cap.threeJsProperty} to meshPhysicalMaterial props`);
          }
          break;
      }
    }

    // Calculate score
    const total = preset.requiredFeatures.length;
    const score =
      total > 0 ? Math.round(((supported.length + partial.length * 0.5) / total) * 100) : 100;

    // Determine overall compatibility
    let compatibility: CompatibilityLevel;
    if (unsupported.length === 0 && partial.length === 0) {
      compatibility = 'full';
    } else if (unsupported.length === 0) {
      compatibility = 'partial';
    } else if (supported.length === 0) {
      compatibility = 'unsupported';
    } else {
      compatibility = 'degraded';
    }

    return {
      preset,
      compatibility,
      supportedProperties: supported,
      partialProperties: partial,
      unsupportedProperties: unsupported,
      degradedProperties: degraded,
      score,
      notes,
      suggestedFixes,
    };
  }

  /** Analyze which properties are most commonly missing. */
  private analyzePropertyGaps(results: PresetAuditResult[]): PropertyGap[] {
    const gapMap = new Map<
      string,
      { affectedPresets: string[]; category: MaterialPropertyCategory }
    >();

    for (const result of results) {
      for (const prop of [...result.unsupportedProperties, ...result.partialProperties]) {
        if (!gapMap.has(prop)) {
          const cap = this.capabilities[prop];
          gapMap.set(prop, {
            affectedPresets: [],
            category: cap?.category || 'general',
          });
        }
        gapMap.get(prop)!.affectedPresets.push(result.preset.name);
      }
    }

    const gaps: PropertyGap[] = [];
    for (const [property, data] of gapMap) {
      const cap = this.capabilities[property];
      gaps.push({
        property,
        category: data.category,
        affectedPresets: data.affectedPresets,
        impactScore: data.affectedPresets.length,
        difficulty: this.estimateDifficulty(property),
        threeJsSupport: cap?.threeJsProperty !== undefined,
      });
    }

    return gaps.sort((a, b) => b.impactScore - a.impactScore);
  }

  /** Generate improvement recommendations sorted by impact. */
  private generateImprovements(gaps: PropertyGap[]): RendererImprovement[] {
    const improvements: RendererImprovement[] = [];

    // Group related properties
    const groups: Record<string, PropertyGap[]> = {};
    for (const gap of gaps) {
      const key = gap.category;
      if (!groups[key]) groups[key] = [];
      groups[key].push(gap);
    }

    for (const [category, categoryGaps] of Object.entries(groups)) {
      const totalImpact = categoryGaps.reduce((sum, g) => sum + g.impactScore, 0);
      const uniquePresets = new Set(categoryGaps.flatMap((g) => g.affectedPresets));
      const maxDifficulty = categoryGaps.reduce(
        (max, g) => {
          const order = { trivial: 0, moderate: 1, complex: 2, 'requires-shader': 3 };
          return order[g.difficulty] > order[max] ? g.difficulty : max;
        },
        'trivial' as PropertyGap['difficulty']
      );

      improvements.push({
        title: `Add ${category} support`,
        description: `Implement ${categoryGaps.map((g) => g.property).join(', ')} in R3F renderer`,
        properties: categoryGaps.map((g) => g.property),
        presetsFixed: uniquePresets.size,
        difficulty: maxDifficulty,
        estimatedEffort: this.estimateEffort(maxDifficulty, categoryGaps.length),
        priority:
          totalImpact > 20
            ? 'critical'
            : totalImpact > 10
              ? 'high'
              : totalImpact > 5
                ? 'medium'
                : 'low',
      });
    }

    return improvements.sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }

  /** Build a row for the compatibility matrix. */
  private buildMatrixRow(result: PresetAuditResult): CompatibilityMatrixRow {
    const getLevel = (prop: string): CompatibilityLevel => {
      if (result.supportedProperties.includes(prop)) return 'full';
      if (result.partialProperties.includes(prop)) return 'partial';
      if (result.unsupportedProperties.includes(prop)) return 'unsupported';
      if (result.preset.requiredFeatures.includes(prop)) return 'unsupported';
      return 'full'; // not required, so N/A = full
    };

    return {
      presetName: result.preset.name,
      category: result.preset.category,
      color: getLevel('color'),
      metalness: getLevel('metalness'),
      roughness: getLevel('roughness'),
      emissive: getLevel('emissive'),
      transmission: getLevel('transmission'),
      iridescence: getLevel('iridescence'),
      clearcoat: getLevel('clearcoat'),
      subsurface: getLevel('subsurface'),
      textures: this.aggregateTextureLevel(result),
      shader: getLevel('customShader'),
      overallLevel: result.compatibility,
    };
  }

  private aggregateTextureLevel(result: PresetAuditResult): CompatibilityLevel {
    const texProps = [
      'map',
      'normalMap',
      'roughnessMap',
      'metalnessMap',
      'emissiveMap',
      'aoMap',
      'displacementMap',
      'bumpMap',
      'envMap',
      'alphaMap',
    ];
    const required = texProps.filter((p) => result.preset.requiredFeatures.includes(p));
    if (required.length === 0) return 'full';
    const supported = required.filter(
      (p) => result.supportedProperties.includes(p) || result.partialProperties.includes(p)
    );
    if (supported.length === required.length) return 'partial'; // textures are partial support
    if (supported.length === 0) return 'unsupported';
    return 'degraded';
  }

  private estimateDifficulty(property: string): PropertyGap['difficulty'] {
    const trivial = [
      'clearcoat',
      'clearcoatRoughness',
      'sheen',
      'sheenRoughness',
      'sheenColor',
      'anisotropy',
      'iridescence',
      'iridescenceIOR',
    ];
    const moderate = [
      'envMap',
      'displacementMap',
      'bumpMap',
      'lightMap',
      'alphaMap',
      'transmissionMap',
      'thicknessMap',
    ];
    const complex = [
      'iridescenceThicknessRange',
      'clearcoatNormalMap',
      'iridescenceMap',
      'iridescenceThicknessMap',
    ];
    const shader = ['customShader', 'proceduralTexture', 'subsurface'];

    if (trivial.includes(property)) return 'trivial';
    if (moderate.includes(property)) return 'moderate';
    if (complex.includes(property)) return 'complex';
    if (shader.includes(property)) return 'requires-shader';
    return 'moderate';
  }

  private estimateEffort(difficulty: PropertyGap['difficulty'], propCount: number): string {
    const base = { trivial: 1, moderate: 4, complex: 8, 'requires-shader': 16 };
    const hours = base[difficulty] * Math.max(1, propCount * 0.5);
    if (hours <= 2) return '< 2 hours';
    if (hours <= 8) return '< 1 day';
    if (hours <= 24) return '1-3 days';
    return '1+ weeks';
  }

  /** Generate a Markdown summary of the audit. */
  generateMarkdown(report: AuditReport): string {
    const lines: string[] = [
      '# Material Preset Audit Report',
      '',
      `Generated: ${new Date(report.timestamp).toISOString()}`,
      '',
      '## Summary',
      '',
      `| Metric | Value |`,
      `|--------|-------|`,
      `| Total Presets | ${report.totalPresets} |`,
      `| Fully Supported | ${report.fullySupportedCount} (${Math.round((report.fullySupportedCount / report.totalPresets) * 100)}%) |`,
      `| Partial Support | ${report.partialCount} (${Math.round((report.partialCount / report.totalPresets) * 100)}%) |`,
      `| Degraded | ${report.degradedCount} (${Math.round((report.degradedCount / report.totalPresets) * 100)}%) |`,
      `| Unsupported | ${report.unsupportedCount} (${Math.round((report.unsupportedCount / report.totalPresets) * 100)}%) |`,
      `| Overall Score | ${report.overallScore}/100 |`,
      '',
      '## Top Property Gaps',
      '',
      '| Property | Affected Presets | Three.js Support | Difficulty |',
      '|----------|-----------------|------------------|------------|',
    ];

    for (const gap of report.propertyGaps.slice(0, 15)) {
      lines.push(
        `| ${gap.property} | ${gap.affectedPresets.length} | ${gap.threeJsSupport ? 'Yes' : 'No'} | ${gap.difficulty} |`
      );
    }

    lines.push('', '## Recommended Improvements', '');
    for (const imp of report.rendererImprovements) {
      lines.push(`### [${imp.priority.toUpperCase()}] ${imp.title}`);
      lines.push(`- Properties: ${imp.properties.join(', ')}`);
      lines.push(`- Fixes ${imp.presetsFixed} presets`);
      lines.push(`- Difficulty: ${imp.difficulty} (~${imp.estimatedEffort})`);
      lines.push('');
    }

    return lines.join('\n');
  }
}

// =============================================================================
// FACTORY
// =============================================================================

/** Create and run a material preset audit. */
export function runMaterialPresetAudit(): AuditReport {
  const auditor = new MaterialPresetAuditor();
  return auditor.audit();
}

/** Create an auditor for custom capabilities/presets. */
export function createMaterialPresetAuditor(
  capabilities?: Record<string, MaterialProperty>,
  presets?: MaterialPreset[]
): MaterialPresetAuditor {
  return new MaterialPresetAuditor(capabilities, presets);
}

export default MaterialPresetAuditor;
