/**
 * MaterialSystem.prod.test.ts
 *
 * Production tests for MaterialSystem — shader management, material CRUD,
 * PBR uniforms, render state, sort order, and clone.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MaterialSystem } from '../MaterialSystem';

describe('MaterialSystem', () => {
  let ms: MaterialSystem;

  beforeEach(() => {
    ms = new MaterialSystem();
  });

  // -------------------------------------------------------------------------
  // Shader Management
  // -------------------------------------------------------------------------
  describe('registerShader / getShader', () => {
    it('registers and retrieves a shader', () => {
      ms.registerShader('pbr', 'void main(){}', 'void main(){}');
      const s = ms.getShader('pbr');
      expect(s).toBeDefined();
      expect(s!.vertexSrc).toBe('void main(){}');
    });

    it('returns undefined for unknown shader', () => {
      expect(ms.getShader('ghost')).toBeUndefined();
    });

    it('overwrites shader on re-registration', () => {
      ms.registerShader('pbr', 'v1', 'f1');
      ms.registerShader('pbr', 'v2', 'f2');
      expect(ms.getShader('pbr')!.vertexSrc).toBe('v2');
    });
  });

  // -------------------------------------------------------------------------
  // Material CRUD
  // -------------------------------------------------------------------------
  describe('createMaterial / getMaterial / removeMaterial / getMaterialCount', () => {
    it('createMaterial creates with correct defaults', () => {
      const m = ms.createMaterial('mat1', 'Metal', 'pbr');
      expect(m.blendMode).toBe('opaque');
      expect(m.cullMode).toBe('back');
      expect(m.depthWrite).toBe(true);
      expect(m.depthTest).toBe(true);
      expect(m.metallic).toBe(0);
      expect(m.roughness).toBeCloseTo(0.5, 5);
      expect(m.normalScale).toBe(1);
    });

    it('getMaterial retrieves by id', () => {
      ms.createMaterial('m', 'M', 'pbr');
      expect(ms.getMaterial('m')!.name).toBe('M');
    });

    it('getMaterial returns undefined for unknown id', () => {
      expect(ms.getMaterial('ghost')).toBeUndefined();
    });

    it('getMaterialCount increases on create', () => {
      ms.createMaterial('a', 'A', 'pbr');
      ms.createMaterial('b', 'B', 'pbr');
      expect(ms.getMaterialCount()).toBe(2);
    });

    it('removeMaterial deletes the material', () => {
      ms.createMaterial('x', 'X', 'pbr');
      ms.removeMaterial('x');
      expect(ms.getMaterial('x')).toBeUndefined();
      expect(ms.getMaterialCount()).toBe(0);
    });

    it('removeMaterial is a no-op for unknown id', () => {
      expect(() => ms.removeMaterial('ghost')).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Uniforms
  // -------------------------------------------------------------------------
  describe('setUniform / getUniform', () => {
    it('sets and retrieves a float uniform', () => {
      ms.createMaterial('m', 'M', 'pbr');
      ms.setUniform('m', 'u_alpha', 'float', 0.5);
      const u = ms.getUniform('m', 'u_alpha');
      expect(u!.value).toBe(0.5);
      expect(u!.type).toBe('float');
    });

    it('sets and retrieves a vec4 uniform', () => {
      ms.createMaterial('m', 'M', 'pbr');
      ms.setUniform('m', 'u_color', 'vec4', [1, 0, 0, 1]);
      const u = ms.getUniform('m', 'u_color');
      expect(u!.value).toEqual([1, 0, 0, 1]);
    });

    it('getUniform returns undefined for unknown uniform', () => {
      ms.createMaterial('m', 'M', 'pbr');
      expect(ms.getUniform('m', 'ghost')).toBeUndefined();
    });

    it('setUniform on unknown material is a no-op', () => {
      expect(() => ms.setUniform('ghost', 'x', 'float', 1)).not.toThrow();
    });

    it('overwrites existing uniform', () => {
      ms.createMaterial('m', 'M', 'pbr');
      ms.setUniform('m', 'x', 'float', 0.1);
      ms.setUniform('m', 'x', 'float', 0.9);
      expect(ms.getUniform('m', 'x')!.value).toBe(0.9);
    });
  });

  // -------------------------------------------------------------------------
  // PBR Properties
  // -------------------------------------------------------------------------
  describe('setPBR', () => {
    it('sets albedo', () => {
      ms.createMaterial('m', 'M', 'pbr');
      ms.setPBR('m', { albedo: [0.5, 0.3, 0.1, 1] });
      expect(ms.getMaterial('m')!.albedo).toEqual([0.5, 0.3, 0.1, 1]);
    });

    it('clamps metallic to [0,1]', () => {
      ms.createMaterial('m', 'M', 'pbr');
      ms.setPBR('m', { metallic: 2 });
      expect(ms.getMaterial('m')!.metallic).toBe(1);
      ms.setPBR('m', { metallic: -1 });
      expect(ms.getMaterial('m')!.metallic).toBe(0);
    });

    it('clamps roughness to [0,1]', () => {
      ms.createMaterial('m', 'M', 'pbr');
      ms.setPBR('m', { roughness: 5 });
      expect(ms.getMaterial('m')!.roughness).toBe(1);
    });

    it('sets emissive and normalScale', () => {
      ms.createMaterial('m', 'M', 'pbr');
      ms.setPBR('m', { emissive: [1, 0.5, 0], normalScale: 2 });
      expect(ms.getMaterial('m')!.emissive).toEqual([1, 0.5, 0]);
      expect(ms.getMaterial('m')!.normalScale).toBe(2);
    });

    it('no-op on unknown material', () => {
      expect(() => ms.setPBR('ghost', { metallic: 0.5 })).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Render State
  // -------------------------------------------------------------------------
  describe('setBlendMode / setCullMode', () => {
    it('setBlendMode changes blend mode', () => {
      ms.createMaterial('m', 'M', 'pbr');
      ms.setBlendMode('m', 'alpha');
      expect(ms.getMaterial('m')!.blendMode).toBe('alpha');
    });

    it('setCullMode changes cull mode', () => {
      ms.createMaterial('m', 'M', 'pbr');
      ms.setCullMode('m', 'none');
      expect(ms.getMaterial('m')!.cullMode).toBe('none');
    });

    it('setBlendMode on unknown material is a no-op', () => {
      expect(() => ms.setBlendMode('ghost', 'alpha')).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // getSortedMaterials
  // -------------------------------------------------------------------------
  describe('getSortedMaterials', () => {
    it('opaque materials come before transparent', () => {
      const a = ms.createMaterial('a', 'A', 'pbr');
      a.blendMode = 'alpha';
      a.renderOrder = 0;
      const b = ms.createMaterial('b', 'B', 'pbr');
      b.blendMode = 'opaque';
      b.renderOrder = 0;
      const sorted = ms.getSortedMaterials();
      expect(sorted[0].id).toBe('b');
      expect(sorted[1].id).toBe('a');
    });

    it('opaque materials sorted by renderOrder ascending', () => {
      const a = ms.createMaterial('a', 'A', 'pbr');
      a.blendMode = 'opaque';
      a.renderOrder = 5;
      const b = ms.createMaterial('b', 'B', 'pbr');
      b.blendMode = 'opaque';
      b.renderOrder = 2;
      const sorted = ms.getSortedMaterials();
      expect(sorted[0].id).toBe('b');
      expect(sorted[1].id).toBe('a');
    });

    it('transparent materials sorted by renderOrder ascending', () => {
      const a = ms.createMaterial('a', 'A', 'pbr');
      a.blendMode = 'alpha';
      a.renderOrder = 10;
      const b = ms.createMaterial('b', 'B', 'pbr');
      b.blendMode = 'alpha';
      b.renderOrder = 5;
      const sorted = ms.getSortedMaterials();
      expect(sorted[0].id).toBe('b');
    });

    it('empty list returns empty', () => {
      expect(ms.getSortedMaterials()).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Clone
  // -------------------------------------------------------------------------
  describe('cloneMaterial', () => {
    it('clone creates a new material with a new id', () => {
      ms.createMaterial('src', 'Source', 'pbr');
      ms.setPBR('src', { metallic: 0.8 });
      const clone = ms.cloneMaterial('src', 'clone', 'Clone');
      expect(clone).not.toBeNull();
      expect(clone!.id).toBe('clone');
      expect(clone!.metallic).toBeCloseTo(0.8, 5);
    });

    it('clone is independent from source', () => {
      ms.createMaterial('src', 'Source', 'pbr');
      ms.cloneMaterial('src', 'clone', 'Clone');
      ms.setPBR('src', { metallic: 1 });
      // Clone should not be affected
      expect(ms.getMaterial('clone')!.metallic).toBe(0); // original default
    });

    it('clone returns null for unknown source', () => {
      expect(ms.cloneMaterial('ghost', 'c', 'C')).toBeNull();
    });

    it('clone is stored in the system', () => {
      ms.createMaterial('src', 'Source', 'pbr');
      ms.cloneMaterial('src', 'c', 'C');
      expect(ms.getMaterialCount()).toBe(2);
      expect(ms.getMaterial('c')).toBeDefined();
    });
  });
});
