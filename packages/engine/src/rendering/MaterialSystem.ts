/**
 * MaterialSystem.ts
 *
 * PBR material management: shader binding, uniform management,
 * render state, and instanced variants.
 *
 * @module rendering
 */

// =============================================================================
// TYPES
// =============================================================================

export type BlendMode = 'opaque' | 'alpha' | 'additive' | 'multiply';
export type CullMode = 'none' | 'front' | 'back';
export type UniformType = 'float' | 'vec2' | 'vec3' | 'vec4' | 'mat4' | 'int' | 'sampler2D';

export interface UniformDef {
  name: string;
  type: UniformType;
  value: number | number[] | string;
}

export interface Material {
  id: string;
  name: string;
  shaderId: string;
  uniforms: Map<string, UniformDef>;
  blendMode: BlendMode;
  cullMode: CullMode;
  depthWrite: boolean;
  depthTest: boolean;
  renderOrder: number;
  doubleSided: boolean;
  // PBR
  albedo: [number, number, number, number];
  metallic: number;
  roughness: number;
  emissive: [number, number, number];
  normalScale: number;
}

// =============================================================================
// MATERIAL SYSTEM
// =============================================================================

export class MaterialSystem {
  private materials: Map<string, Material> = new Map();
  private shaders: Map<string, { vertexSrc: string; fragmentSrc: string }> = new Map();

  // ---------------------------------------------------------------------------
  // Shader Management
  // ---------------------------------------------------------------------------

  registerShader(id: string, vertexSrc: string, fragmentSrc: string): void {
    this.shaders.set(id, { vertexSrc, fragmentSrc });
  }

  getShader(id: string) {
    return this.shaders.get(id);
  }

  // ---------------------------------------------------------------------------
  // Material CRUD
  // ---------------------------------------------------------------------------

  createMaterial(id: string, name: string, shaderId: string): Material {
    const mat: Material = {
      id,
      name,
      shaderId,
      uniforms: new Map(),
      blendMode: 'opaque',
      cullMode: 'back',
      depthWrite: true,
      depthTest: true,
      renderOrder: 0,
      doubleSided: false,
      albedo: [1, 1, 1, 1],
      metallic: 0,
      roughness: 0.5,
      emissive: [0, 0, 0],
      normalScale: 1,
    };
    this.materials.set(id, mat);
    return mat;
  }

  getMaterial(id: string): Material | undefined {
    return this.materials.get(id);
  }
  removeMaterial(id: string): void {
    this.materials.delete(id);
  }
  getMaterialCount(): number {
    return this.materials.size;
  }

  // ---------------------------------------------------------------------------
  // Uniforms
  // ---------------------------------------------------------------------------

  setUniform(
    materialId: string,
    name: string,
    type: UniformType,
    value: number | number[] | string
  ): void {
    const mat = this.materials.get(materialId);
    if (mat) mat.uniforms.set(name, { name, type, value });
  }

  getUniform(materialId: string, name: string): UniformDef | undefined {
    return this.materials.get(materialId)?.uniforms.get(name);
  }

  // ---------------------------------------------------------------------------
  // PBR Properties
  // ---------------------------------------------------------------------------

  setPBR(
    materialId: string,
    props: Partial<Pick<Material, 'albedo' | 'metallic' | 'roughness' | 'emissive' | 'normalScale'>>
  ): void {
    const mat = this.materials.get(materialId);
    if (!mat) return;
    if (props.albedo) mat.albedo = props.albedo;
    if (props.metallic !== undefined) mat.metallic = Math.max(0, Math.min(1, props.metallic));
    if (props.roughness !== undefined) mat.roughness = Math.max(0, Math.min(1, props.roughness));
    if (props.emissive) mat.emissive = props.emissive;
    if (props.normalScale !== undefined) mat.normalScale = props.normalScale;
  }

  // ---------------------------------------------------------------------------
  // Render State
  // ---------------------------------------------------------------------------

  setBlendMode(materialId: string, mode: BlendMode): void {
    const mat = this.materials.get(materialId);
    if (mat) mat.blendMode = mode;
  }

  setCullMode(materialId: string, mode: CullMode): void {
    const mat = this.materials.get(materialId);
    if (mat) mat.cullMode = mode;
  }

  // ---------------------------------------------------------------------------
  // Sorting
  // ---------------------------------------------------------------------------

  getSortedMaterials(): Material[] {
    const all = [...this.materials.values()];
    // Opaque first, then transparent sorted by render order
    const opaque = all
      .filter((m) => m.blendMode === 'opaque')
      .sort((a, b) => a.renderOrder - b.renderOrder);
    const transparent = all
      .filter((m) => m.blendMode !== 'opaque')
      .sort((a, b) => a.renderOrder - b.renderOrder);
    return [...opaque, ...transparent];
  }

  // ---------------------------------------------------------------------------
  // Clone
  // ---------------------------------------------------------------------------

  cloneMaterial(sourceId: string, newId: string, newName: string): Material | null {
    const source = this.materials.get(sourceId);
    if (!source) return null;
    const clone: Material = {
      ...source,
      id: newId,
      name: newName,
      uniforms: new Map(source.uniforms),
      albedo: [...source.albedo] as [number, number, number, number],
      emissive: [...source.emissive] as [number, number, number],
    };
    this.materials.set(newId, clone);
    return clone;
  }
}

