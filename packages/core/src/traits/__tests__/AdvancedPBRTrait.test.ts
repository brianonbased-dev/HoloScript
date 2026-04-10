/**
 * AdvancedPBRTrait Unit Tests
 *
 * Tests for advanced PBR material features: clearcoat, anisotropy, sheen, SSS, iridescence, transmission
 */

import { describe, it, expect, vi } from 'vitest';
import { AdvancedPBRTrait } from '../AdvancedPBRTrait';
import type { AdvancedPBRConfig } from '../AdvancedPBRTrait';

describe('AdvancedPBRTrait', () => {
  describe('handler definition', () => {
    it('should have name "advanced_pbr"', () => {
      expect(AdvancedPBRTrait.name).toBe('advanced_pbr');
    });

    it('should have validate and compile methods', () => {
      expect(typeof AdvancedPBRTrait.validate).toBe('function');
      expect(typeof AdvancedPBRTrait.compile).toBe('function');
    });
  });

  describe('validate() - base PBR', () => {
    it('should pass validation for basic PBR config', () => {
      const config: AdvancedPBRConfig = {
        base_color: [1.0, 1.0, 1.0],
        metallic: 0.5,
        roughness: 0.5,
      };

      expect(() => AdvancedPBRTrait.validate(config)).not.toThrow();
      expect(AdvancedPBRTrait.validate(config)).toBe(true);
    });

    it('should accept hex color string', () => {
      const config: AdvancedPBRConfig = {
        base_color: '#FF5733',
      };

      expect(() => AdvancedPBRTrait.validate(config)).not.toThrow();
    });

    it('should fail for invalid RGB array length', () => {
      const config: AdvancedPBRConfig = {
        base_color: [1.0, 1.0] as any,
      };

      expect(() => AdvancedPBRTrait.validate(config)).toThrow('base_color must be [r, g, b]');
    });

    it('should fail for out-of-range RGB values', () => {
      const config: AdvancedPBRConfig = {
        base_color: [1.5, 0.5, 0.5],
      };

      expect(() => AdvancedPBRTrait.validate(config)).toThrow('base_color RGB values must be 0-1');
    });
  });

  describe('validate() - clearcoat', () => {
    it('should pass validation for clearcoat config', () => {
      const config: AdvancedPBRConfig = {
        base_color: [1.0, 0.0, 0.0],
        clearcoat: {
          intensity: 0.8,
          roughness: 0.1,
          ior: 1.5,
        },
      };

      expect(() => AdvancedPBRTrait.validate(config)).not.toThrow();
    });

    it('should fail for clearcoat intensity out of range', () => {
      const config: AdvancedPBRConfig = {
        base_color: [1.0, 0.0, 0.0],
        clearcoat: {
          intensity: 1.5,
          roughness: 0.1,
        },
      };

      expect(() => AdvancedPBRTrait.validate(config)).toThrow('clearcoat.intensity must be 0-1');
    });

    it('should fail for clearcoat roughness out of range', () => {
      const config: AdvancedPBRConfig = {
        base_color: [1.0, 0.0, 0.0],
        clearcoat: {
          intensity: 0.8,
          roughness: -0.1,
        },
      };

      expect(() => AdvancedPBRTrait.validate(config)).toThrow('clearcoat.roughness must be 0-1');
    });
  });

  describe('validate() - anisotropy', () => {
    it('should pass validation for anisotropy config', () => {
      const config: AdvancedPBRConfig = {
        base_color: [0.8, 0.8, 0.8],
        anisotropy: {
          strength: 0.7,
          rotation: 45,
          direction: 'u',
        },
      };

      expect(() => AdvancedPBRTrait.validate(config)).not.toThrow();
    });

    it('should fail for anisotropy strength out of range', () => {
      const config: AdvancedPBRConfig = {
        base_color: [0.8, 0.8, 0.8],
        anisotropy: {
          strength: 1.5,
          rotation: 0,
        },
      };

      expect(() => AdvancedPBRTrait.validate(config)).toThrow('anisotropy.strength must be 0-1');
    });
  });

  describe('validate() - subsurface scattering', () => {
    it('should pass validation for SSS config', () => {
      const config: AdvancedPBRConfig = {
        base_color: [1.0, 0.9, 0.8],
        subsurface_scattering: {
          method: 'burley',
          color: [1.0, 0.5, 0.3],
          radius: 1.0,
          thickness: 0.5,
        },
      };

      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
      expect(() => AdvancedPBRTrait.validate(config)).not.toThrow();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('SSS is computationally expensive')
      );
      consoleSpy.mockRestore();
    });

    it('should fail for SSS radius <= 0', () => {
      const config: AdvancedPBRConfig = {
        base_color: [1.0, 0.9, 0.8],
        subsurface_scattering: {
          method: 'burley',
          color: [1.0, 0.5, 0.3],
          radius: 0,
          thickness: 0.5,
        },
      };

      expect(() => AdvancedPBRTrait.validate(config)).toThrow(
        'subsurface_scattering.radius must be > 0'
      );
    });
  });

  describe('validate() - transmission', () => {
    it('should pass validation for transmission (glass) config', () => {
      const config: AdvancedPBRConfig = {
        base_color: [1.0, 1.0, 1.0],
        transmission: {
          factor: 0.95,
          ior: 1.5,
          thickness: 0.1,
          attenuation_distance: 1.0,
          attenuation_color: [1.0, 1.0, 1.0],
        },
      };

      expect(() => AdvancedPBRTrait.validate(config)).not.toThrow();
    });

    it('should fail for transmission factor out of range', () => {
      const config: AdvancedPBRConfig = {
        base_color: [1.0, 1.0, 1.0],
        transmission: {
          factor: 1.5,
          ior: 1.5,
          thickness: 0.1,
          attenuation_distance: 1.0,
          attenuation_color: [1.0, 1.0, 1.0],
        },
      };

      expect(() => AdvancedPBRTrait.validate(config)).toThrow('transmission.factor must be 0-1');
    });

    it('should fail for transmission IOR < 1.0', () => {
      const config: AdvancedPBRConfig = {
        base_color: [1.0, 1.0, 1.0],
        transmission: {
          factor: 0.9,
          ior: 0.5,
          thickness: 0.1,
          attenuation_distance: 1.0,
          attenuation_color: [1.0, 1.0, 1.0],
        },
      };

      expect(() => AdvancedPBRTrait.validate(config)).toThrow('transmission.ior must be >= 1.0');
    });
  });

  describe('validate() - performance warnings', () => {
    it('should warn about performance with many features', () => {
      const config: AdvancedPBRConfig = {
        base_color: [1.0, 0.0, 0.0],
        clearcoat: { intensity: 0.8, roughness: 0.1 },
        anisotropy: { strength: 0.7, rotation: 0 },
        sheen: { color: [1.0, 0.0, 0.0], roughness: 0.3, intensity: 0.5 },
        subsurface_scattering: {
          method: 'burley',
          color: [1.0, 0.5, 0.3],
          radius: 1.0,
          thickness: 0.5,
        },
        iridescence: { intensity: 0.5, ior: 1.5, thickness_min: 100, thickness_max: 400 },
        transmission: {
          factor: 0.5,
          ior: 1.5,
          thickness: 0.1,
          attenuation_distance: 1.0,
          attenuation_color: [1, 1, 1],
        },
      };

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      AdvancedPBRTrait.validate(config);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('6 advanced PBR features'));
      consoleSpy.mockRestore();
    });
  });

  describe('compile() - Unity', () => {
    it('should generate Unity HDRP material code', () => {
      const config: AdvancedPBRConfig = {
        base_color: [1.0, 0.0, 0.0],
        metallic: 1.0,
        roughness: 0.2,
      };

      const code = AdvancedPBRTrait.compile(config, 'unity');

      expect(code).toContain('using UnityEngine.Rendering.HighDefinition');
      expect(code).toContain('class AdvancedPBRMaterial');
      expect(code).toContain('_BaseColor');
      expect(code).toContain('_Metallic');
      expect(code).toContain('_Smoothness');
    });

    it('should enable clearcoat in Unity', () => {
      const config: AdvancedPBRConfig = {
        base_color: [0.8, 0.0, 0.0],
        clearcoat: {
          intensity: 0.9,
          roughness: 0.05,
        },
      };

      const code = AdvancedPBRTrait.compile(config, 'unity');

      expect(code).toContain('_MATERIAL_FEATURE_CLEAR_COAT');
      expect(code).toContain('_CoatMask');
      expect(code).toContain('_CoatSmoothness');
    });

    it('should enable anisotropy in Unity', () => {
      const config: AdvancedPBRConfig = {
        base_color: [0.7, 0.7, 0.7],
        anisotropy: {
          strength: 0.8,
          rotation: 90,
        },
      };

      const code = AdvancedPBRTrait.compile(config, 'unity');

      expect(code).toContain('_MATERIAL_FEATURE_ANISOTROPY');
      expect(code).toContain('_Anisotropy');
      expect(code).toContain('_AnisotropyRotation');
    });

    it('should enable SSS in Unity', () => {
      const config: AdvancedPBRConfig = {
        base_color: [1.0, 0.9, 0.8],
        subsurface_scattering: {
          method: 'burley',
          color: [1.0, 0.5, 0.3],
          radius: 1.5,
          thickness: 0.8,
        },
      };

      const code = AdvancedPBRTrait.compile(config, 'unity');

      expect(code).toContain('_MATERIAL_FEATURE_SUBSURFACE_SCATTERING');
      expect(code).toContain('_SubsurfaceColor');
      expect(code).toContain('_Thickness');
    });
  });

  describe('compile() - Unreal', () => {
    it('should generate Unreal Engine material code', () => {
      const config: AdvancedPBRConfig = {
        base_color: [0.5, 0.5, 0.5],
        metallic: 0.8,
        roughness: 0.3,
      };

      const code = AdvancedPBRTrait.compile(config, 'unreal');

      expect(code).toContain('#include "Materials/Material.h"');
      expect(code).toContain('UMaterialInstanceDynamic');
      expect(code).toContain('BaseColor');
      expect(code).toContain('Metallic');
      expect(code).toContain('Roughness');
    });

    it('should enable clearcoat in Unreal', () => {
      const config: AdvancedPBRConfig = {
        base_color: [0.9, 0.1, 0.1],
        clearcoat: {
          intensity: 1.0,
          roughness: 0.0,
        },
      };

      const code = AdvancedPBRTrait.compile(config, 'unreal');

      expect(code).toContain('ClearCoat');
      expect(code).toContain('ClearCoatRoughness');
    });
  });

  describe('compile() - Web (Three.js)', () => {
    it('should generate Three.js MeshPhysicalMaterial', () => {
      const config: AdvancedPBRConfig = {
        base_color: [0.2, 0.6, 1.0],
        metallic: 0.0,
        roughness: 0.4,
      };

      const code = AdvancedPBRTrait.compile(config, 'web');

      expect(code).toContain("import * as THREE from 'three'");
      expect(code).toContain('class AdvancedPBRMaterial extends THREE.MeshPhysicalMaterial');
      expect(code).toContain('metalness:');
      expect(code).toContain('roughness:');
    });

    it('should enable clearcoat in Three.js', () => {
      const config: AdvancedPBRConfig = {
        base_color: [1.0, 1.0, 1.0],
        clearcoat: {
          intensity: 0.7,
          roughness: 0.2,
        },
      };

      const code = AdvancedPBRTrait.compile(config, 'web');

      expect(code).toContain('clearcoat:');
      expect(code).toContain('clearcoatRoughness:');
    });

    it('should enable anisotropy in Three.js', () => {
      const config: AdvancedPBRConfig = {
        base_color: [0.5, 0.5, 0.5],
        anisotropy: {
          strength: 0.9,
          rotation: 45,
        },
      };

      const code = AdvancedPBRTrait.compile(config, 'web');

      expect(code).toContain('anisotropy:');
      expect(code).toContain('anisotropyRotation:');
    });

    it('should enable sheen in Three.js', () => {
      const config: AdvancedPBRConfig = {
        base_color: [0.8, 0.1, 0.3],
        sheen: {
          color: [1.0, 0.0, 0.5],
          roughness: 0.6,
          intensity: 0.8,
        },
      };

      const code = AdvancedPBRTrait.compile(config, 'web');

      expect(code).toContain('sheen:');
      expect(code).toContain('sheenColor:');
      expect(code).toContain('sheenRoughness:');
    });

    it('should enable transmission in Three.js', () => {
      const config: AdvancedPBRConfig = {
        base_color: [1.0, 1.0, 1.0],
        transmission: {
          factor: 1.0,
          ior: 1.5,
          thickness: 0.5,
          attenuation_distance: 1.0,
          attenuation_color: [0.8, 0.9, 1.0],
        },
      };

      const code = AdvancedPBRTrait.compile(config, 'web');

      expect(code).toContain('transmission:');
      expect(code).toContain('ior:');
      expect(code).toContain('thickness:');
      expect(code).toContain('attenuationDistance:');
      expect(code).toContain('attenuationColor:');
    });

    it('should enable iridescence in Three.js', () => {
      const config: AdvancedPBRConfig = {
        base_color: [1.0, 1.0, 1.0],
        iridescence: {
          intensity: 1.0,
          ior: 1.3,
          thickness_min: 100,
          thickness_max: 400,
        },
      };

      const code = AdvancedPBRTrait.compile(config, 'web');

      expect(code).toContain('iridescence:');
      expect(code).toContain('iridescenceIOR:');
      expect(code).toContain('iridescenceThicknessRange:');
    });

    it('should inject SSS shader code in Three.js', () => {
      const config: AdvancedPBRConfig = {
        base_color: [1.0, 0.9, 0.8],
        subsurface_scattering: {
          method: 'burley',
          color: [1.0, 0.5, 0.3],
          radius: 2.0,
          thickness: 1.0,
        },
      };

      const code = AdvancedPBRTrait.compile(config, 'web');

      expect(code).toContain('onBeforeCompile');
      expect(code).toContain('sssColor');
      expect(code).toContain('sssRadius');
      expect(code).toContain('sssThickness');
      expect(code).toContain('Burley SSS approximation');
    });
  });

  describe('compile() - WebGPU', () => {
    it('should generate WebGPU WGSL shader', () => {
      const config: AdvancedPBRConfig = {
        base_color: [0.7, 0.7, 0.7],
        metallic: 0.5,
        roughness: 0.5,
      };

      const code = AdvancedPBRTrait.compile(config, 'webgpu');

      expect(code).toContain('struct AdvancedPBRUniforms');
      expect(code).toContain('fn advancedBRDF');
      expect(code).toContain('GGX distribution');
      expect(code).toContain('Schlick-GGX geometry');
      expect(code).toContain('Fresnel-Schlick');
    });

    it('should add clearcoat BRDF in WebGPU', () => {
      const config: AdvancedPBRConfig = {
        base_color: [1.0, 0.0, 0.0],
        clearcoat: {
          intensity: 0.8,
          roughness: 0.1,
        },
      };

      const code = AdvancedPBRTrait.compile(config, 'webgpu');

      expect(code).toContain('fn clearcoatBRDF');
      expect(code).toContain('clearcoatIntensity');
      expect(code).toContain('clearcoatRoughness');
    });
  });

  describe('compile() - texture maps', () => {
    it('should load texture maps in Unity', () => {
      const config: AdvancedPBRConfig = {
        base_color: [1.0, 1.0, 1.0],
        albedo_map: 'textures/albedo.png',
        normal_map: 'textures/normal.png',
        roughness_map: 'textures/roughness.png',
      };

      const code = AdvancedPBRTrait.compile(config, 'unity');

      expect(code).toContain('_BaseColorMap');
      expect(code).toContain('_NormalMap');
      expect(code).toContain('_NormalScale');
    });

    it('should load texture maps in Three.js', () => {
      const config: AdvancedPBRConfig = {
        base_color: [1.0, 1.0, 1.0],
        albedo_map: 'textures/albedo.png',
        normal_map: 'textures/normal.png',
        metallic_map: 'textures/metallic.png',
        ao_map: 'textures/ao.png',
      };

      const code = AdvancedPBRTrait.compile(config, 'web');

      expect(code).toContain('this.map = new THREE.TextureLoader().load');
      expect(code).toContain('this.normalMap');
      expect(code).toContain('this.metalnessMap');
      expect(code).toContain('this.aoMap');
    });
  });
});
