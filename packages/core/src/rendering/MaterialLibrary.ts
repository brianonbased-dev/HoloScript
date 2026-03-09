/**
 * MaterialLibrary.ts
 *
 * PBR material system: material definitions, texture slots,
 * instancing, and preset materials.
 *
 * @module rendering
 */

// =============================================================================
// TYPES
// =============================================================================

export type BlendMode = 'opaque' | 'transparent' | 'additive' | 'multiply';
export type CullMode = 'none' | 'front' | 'back';

/**
 * Material type classification for UI and editor workflows.
 * Maps to high-level rendering strategies.
 */
export type MaterialType =
  | 'standard'
  | 'physical'
  | 'basic'
  | 'emissive'
  | 'toon'
  | 'glass'
  | 'metal';

export interface TextureSlot {
  textureId: string;
  uvChannel: number;
  tiling: { x: number; y: number };
  offset: { x: number; y: number };
}

/**
 * Unified PBR material definition.
 *
 * This is the single canonical material type used across all HoloScript
 * subsystems: the rendering MaterialLibrary, the MaterialEditor tool,
 * shader graphs, and export compilers.
 *
 * Color values use linear RGBA objects (not hex strings) for precision
 * and compatibility with GPU pipelines.
 */
export interface MaterialDef {
  id: string;
  name: string;
  /** High-level material classification for editor UI (default: 'standard') */
  materialType?: MaterialType;
  // PBR properties
  albedo: { r: number; g: number; b: number; a: number };
  metallic: number; // 0-1
  roughness: number; // 0-1
  emission: { r: number; g: number; b: number };
  emissionStrength: number;
  normalScale: number;
  aoStrength: number;
  // Textures
  albedoMap?: TextureSlot;
  normalMap?: TextureSlot;
  metallicRoughnessMap?: TextureSlot;
  emissionMap?: TextureSlot;
  aoMap?: TextureSlot;
  // Rendering
  blendMode: BlendMode;
  cullMode: CullMode;
  depthWrite: boolean;
  depthTest: boolean;
  doubleSided: boolean;
  // Custom
  shaderGraphId?: string;
  customUniforms?: Record<string, number | number[]>;
  /** Arbitrary extension properties for editor/plugin use */
  properties?: Record<string, unknown>;
}

// =============================================================================
// COLOR UTILITIES
// =============================================================================

/**
 * Convert a hex color string (#RRGGBB or #RRGGBBAA) to an RGBA object
 * with linear color values (0-1).
 */
export function hexToRGBA(hex: string): { r: number; g: number; b: number; a: number } {
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

export interface MaterialInstance {
  id: string;
  baseMaterialId: string;
  overrides: Partial<MaterialDef>;
}

// =============================================================================
// PRESET MATERIALS
// =============================================================================

const defaultMat: MaterialDef = {
  id: 'default',
  name: 'Default',
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

export const MATERIAL_PRESETS: Record<string, Partial<MaterialDef>> = {
  metal: {
    name: 'Metal',
    metallic: 0.9,
    roughness: 0.2,
    albedo: { r: 0.9, g: 0.9, b: 0.9, a: 1 },
  },
  wood: {
    name: 'Wood',
    metallic: 0,
    roughness: 0.7,
    albedo: { r: 0.55, g: 0.35, b: 0.15, a: 1 },
  },
  glass: {
    name: 'Glass',
    metallic: 0,
    roughness: 0.05,
    albedo: { r: 0.9, g: 0.95, b: 1, a: 0.3 },
    blendMode: 'transparent' as BlendMode,
    doubleSided: true,
  },
  plastic: {
    name: 'Plastic',
    metallic: 0,
    roughness: 0.4,
    albedo: { r: 1, g: 0.2, b: 0.2, a: 1 },
  },
  emissive: {
    name: 'Emissive',
    metallic: 0,
    roughness: 1,
    albedo: { r: 0, g: 0, b: 0, a: 1 },
    emission: { r: 0.3, g: 0.7, b: 1 },
    emissionStrength: 5,
  },
  ground: {
    name: 'Ground',
    metallic: 0,
    roughness: 0.9,
    albedo: { r: 0.35, g: 0.3, b: 0.2, a: 1 },
  },
};

// =============================================================================
// MATERIAL LIBRARY
// =============================================================================

let _matInstanceId = 0;

export class MaterialLibrary {
  private materials: Map<string, MaterialDef> = new Map();
  private instances: Map<string, MaterialInstance> = new Map();

  constructor() {
    // Register default material
    this.register({ ...defaultMat });
  }

  // ---------------------------------------------------------------------------
  // Registration
  // ---------------------------------------------------------------------------

  register(material: MaterialDef): void {
    this.materials.set(material.id, material);
  }

  registerPreset(presetName: string, id?: string): MaterialDef | null {
    const preset = MATERIAL_PRESETS[presetName];
    if (!preset) return null;
    const mat: MaterialDef = { ...defaultMat, ...preset, id: id ?? presetName };
    this.register(mat);
    return mat;
  }

  unregister(id: string): void {
    this.materials.delete(id);
    // Remove instances referencing this material
    for (const [instId, inst] of this.instances) {
      if (inst.baseMaterialId === id) this.instances.delete(instId);
    }
  }

  getMaterial(id: string): MaterialDef | undefined {
    return this.materials.get(id);
  }

  getMaterialCount(): number {
    return this.materials.size;
  }

  getAllMaterials(): MaterialDef[] {
    return [...this.materials.values()];
  }

  // ---------------------------------------------------------------------------
  // Instancing
  // ---------------------------------------------------------------------------

  createInstance(
    baseMaterialId: string,
    overrides: Partial<MaterialDef> = {}
  ): MaterialInstance | null {
    if (!this.materials.has(baseMaterialId)) return null;
    const inst: MaterialInstance = {
      id: `matinst_${_matInstanceId++}`,
      baseMaterialId,
      overrides,
    };
    this.instances.set(inst.id, inst);
    return inst;
  }

  /**
   * Resolve an instance to its full material definition.
   */
  resolveInstance(instanceId: string): MaterialDef | null {
    const inst = this.instances.get(instanceId);
    if (!inst) return null;
    const base = this.materials.get(inst.baseMaterialId);
    if (!base) return null;
    return { ...base, ...inst.overrides, id: inst.id };
  }

  getInstance(id: string): MaterialInstance | undefined {
    return this.instances.get(id);
  }

  getInstanceCount(): number {
    return this.instances.size;
  }

  // ---------------------------------------------------------------------------
  // Texture Slot Helpers
  // ---------------------------------------------------------------------------

  setTexture(
    materialId: string,
    slot: keyof Pick<
      MaterialDef,
      'albedoMap' | 'normalMap' | 'metallicRoughnessMap' | 'emissionMap' | 'aoMap'
    >,
    textureId: string
  ): boolean {
    const mat = this.materials.get(materialId);
    if (!mat) return false;
    mat[slot] = {
      textureId,
      uvChannel: 0,
      tiling: { x: 1, y: 1 },
      offset: { x: 0, y: 0 },
    };
    return true;
  }
}
