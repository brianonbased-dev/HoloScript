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

export interface TextureSlot {
  textureId: string;
  uvChannel: number;
  tiling: { x: number; y: number };
  offset: { x: number; y: number };
}

export interface MaterialDef {
  id: string;
  name: string;
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
