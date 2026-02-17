import { describe, it, expect, beforeEach } from 'vitest';
import { MaterialSystem } from '../MaterialSystem';

describe('MaterialSystem', () => {
  let ms: MaterialSystem;

  beforeEach(() => { ms = new MaterialSystem(); });

  // Shader management
  it('registerShader and getShader', () => {
    ms.registerShader('pbr', 'v_src', 'f_src');
    const s = ms.getShader('pbr');
    expect(s).toBeDefined();
    expect(s!.vertexSrc).toBe('v_src');
  });

  it('getShader returns undefined for unknown', () => {
    expect(ms.getShader('nope')).toBeUndefined();
  });

  // Material CRUD
  it('createMaterial creates with defaults', () => {
    const m = ms.createMaterial('m1', 'Test', 'pbr');
    expect(m.id).toBe('m1');
    expect(m.blendMode).toBe('opaque');
    expect(m.roughness).toBe(0.5);
    expect(ms.getMaterialCount()).toBe(1);
  });

  it('getMaterial and removeMaterial', () => {
    ms.createMaterial('m1', 'A', 'pbr');
    expect(ms.getMaterial('m1')).toBeDefined();
    ms.removeMaterial('m1');
    expect(ms.getMaterial('m1')).toBeUndefined();
    expect(ms.getMaterialCount()).toBe(0);
  });

  // Uniforms
  it('setUniform and getUniform', () => {
    ms.createMaterial('m1', 'A', 's');
    ms.setUniform('m1', 'u_color', 'vec3', [1, 0, 0]);
    const u = ms.getUniform('m1', 'u_color');
    expect(u).toBeDefined();
    expect(u!.type).toBe('vec3');
    expect(u!.value).toEqual([1, 0, 0]);
  });

  it('getUniform returns undefined for unknown', () => {
    ms.createMaterial('m1', 'A', 's');
    expect(ms.getUniform('m1', 'nope')).toBeUndefined();
  });

  // PBR
  it('setPBR updates metallic/roughness with clamping', () => {
    ms.createMaterial('m1', 'A', 's');
    ms.setPBR('m1', { metallic: 1.5, roughness: -0.5 });
    const m = ms.getMaterial('m1')!;
    expect(m.metallic).toBe(1);
    expect(m.roughness).toBe(0);
  });

  it('setPBR updates albedo', () => {
    ms.createMaterial('m1', 'A', 's');
    ms.setPBR('m1', { albedo: [1, 0, 0.5, 1] });
    expect(ms.getMaterial('m1')!.albedo).toEqual([1, 0, 0.5, 1]);
  });

  // Render state
  it('setBlendMode and setCullMode', () => {
    ms.createMaterial('m1', 'A', 's');
    ms.setBlendMode('m1', 'additive');
    ms.setCullMode('m1', 'none');
    const m = ms.getMaterial('m1')!;
    expect(m.blendMode).toBe('additive');
    expect(m.cullMode).toBe('none');
  });

  // Sorting
  it('getSortedMaterials opaque first, then transparent', () => {
    const a = ms.createMaterial('m1', 'A', 's');
    a.blendMode = 'alpha'; a.renderOrder = 1;
    const b = ms.createMaterial('m2', 'B', 's');
    b.blendMode = 'opaque'; b.renderOrder = 0;

    const sorted = ms.getSortedMaterials();
    expect(sorted[0].id).toBe('m2');
    expect(sorted[1].id).toBe('m1');
  });

  // Clone
  it('cloneMaterial creates independent copy', () => {
    ms.createMaterial('m1', 'Original', 's');
    ms.setPBR('m1', { metallic: 0.8 });
    const clone = ms.cloneMaterial('m1', 'm2', 'Copy');
    expect(clone).not.toBeNull();
    expect(clone!.id).toBe('m2');
    expect(clone!.metallic).toBe(0.8);
    ms.setPBR('m1', { metallic: 0.2 });
    expect(clone!.metallic).toBe(0.8); // independent
  });

  it('cloneMaterial returns null for missing source', () => {
    expect(ms.cloneMaterial('nope', 'x', 'X')).toBeNull();
  });
});
