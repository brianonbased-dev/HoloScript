import { describe, it, expect, beforeEach } from 'vitest';
import { MaterialSystem } from '@holoscript/engine/rendering';

// =============================================================================
// C287 — Material System
// =============================================================================

describe('MaterialSystem', () => {
  let ms: MaterialSystem;
  beforeEach(() => {
    ms = new MaterialSystem();
  });

  it('registerShader stores shader', () => {
    ms.registerShader('pbr', 'void main(){}', 'void main(){}');
    expect(ms.getShader('pbr')).toBeDefined();
  });

  it('createMaterial with PBR defaults', () => {
    const mat = ms.createMaterial('mat1', 'Default', 'pbr');
    expect(mat.blendMode).toBe('opaque');
    expect(mat.cullMode).toBe('back');
    expect(mat.metallic).toBe(0);
    expect(mat.roughness).toBe(0.5);
    expect(mat.albedo).toEqual([1, 1, 1, 1]);
  });

  it('getMaterial and getMaterialCount', () => {
    ms.createMaterial('mat1', 'A', 'pbr');
    expect(ms.getMaterial('mat1')).toBeDefined();
    expect(ms.getMaterialCount()).toBe(1);
  });

  it('removeMaterial deletes material', () => {
    ms.createMaterial('mat1', 'A', 'pbr');
    ms.removeMaterial('mat1');
    expect(ms.getMaterialCount()).toBe(0);
  });

  it('setUniform and getUniform', () => {
    ms.createMaterial('mat1', 'A', 'pbr');
    ms.setUniform('mat1', 'u_time', 'float', 1.5);
    const u = ms.getUniform('mat1', 'u_time');
    expect(u).toBeDefined();
    expect(u!.value).toBe(1.5);
  });

  it('setPBR clamps metallic and roughness to [0,1]', () => {
    ms.createMaterial('mat1', 'A', 'pbr');
    ms.setPBR('mat1', { metallic: 5, roughness: -1 });
    const mat = ms.getMaterial('mat1')!;
    expect(mat.metallic).toBe(1);
    expect(mat.roughness).toBe(0);
  });

  it('setBlendMode updates blend', () => {
    ms.createMaterial('mat1', 'A', 'pbr');
    ms.setBlendMode('mat1', 'alpha');
    expect(ms.getMaterial('mat1')!.blendMode).toBe('alpha');
  });

  it('setCullMode updates cull', () => {
    ms.createMaterial('mat1', 'A', 'pbr');
    ms.setCullMode('mat1', 'none');
    expect(ms.getMaterial('mat1')!.cullMode).toBe('none');
  });

  it('getSortedMaterials returns opaque before transparent', () => {
    ms.createMaterial('trans', 'Trans', 'pbr');
    ms.setBlendMode('trans', 'alpha');
    ms.createMaterial('opaque', 'Opaque', 'pbr');
    const sorted = ms.getSortedMaterials();
    expect(sorted[0].id).toBe('opaque');
    expect(sorted[1].id).toBe('trans');
  });

  it('cloneMaterial creates independent copy', () => {
    ms.createMaterial('src', 'Source', 'pbr');
    ms.setPBR('src', { metallic: 0.8 });
    const clone = ms.cloneMaterial('src', 'dst', 'Clone');
    expect(clone).not.toBeNull();
    expect(clone!.metallic).toBe(0.8);
    // Mutating clone doesn't affect source
    ms.setPBR('dst', { metallic: 0.1 });
    expect(ms.getMaterial('src')!.metallic).toBe(0.8);
  });

  it('cloneMaterial returns null for missing source', () => {
    expect(ms.cloneMaterial('nope', 'dst', 'Clone')).toBeNull();
  });
});
