import { describe, it, expect } from 'vitest';
import { AdvancedLightingTrait } from '../../traits/AdvancedLightingTrait';
import type { AdvancedLightingConfig } from '../../traits/AdvancedLightingTrait';

const rectConfig: AdvancedLightingConfig = {
  lights: [{ type: 'area_rect', config: { width: 2, height: 1, intensity: 1000, color: [1, 1, 1], castShadows: true } }],
};

const mixedConfig: AdvancedLightingConfig = {
  lights: [
    { type: 'area_rect', config: { width: 1, height: 1, intensity: 500, color: [1, 0.9, 0.8] } },
    { type: 'area_disk', config: { radius: 0.5, intensity: 300, color: [1, 1, 1] } },
    { type: 'ies', config: { profilePath: 'lights/office.ies', intensity: 800, color: [1, 1, 0.9] } },
  ],
};

const cookieConfig: AdvancedLightingConfig = {
  lights: [{ type: 'cookie', config: { texturePath: 'cookies/window.png', lightType: 'spot', intensity: 1.0, angle: 45 } }],
};

const emissiveConfig: AdvancedLightingConfig = {
  lights: [{ type: 'emissive_mesh', config: { meshRef: 'neon_sign', emissiveColor: [0, 0.5, 1], emissiveIntensity: 5, contributesToGI: true } }],
};

describe('AdvancedLightingTrait — Production Tests', () => {

  describe('validate()', () => {
    it('accepts rect area light config', () => {
      expect(AdvancedLightingTrait.validate(rectConfig)).toBe(true);
    });

    it('accepts mixed light config', () => {
      expect(AdvancedLightingTrait.validate(mixedConfig)).toBe(true);
    });

    it('throws when lights array is empty', () => {
      expect(() => AdvancedLightingTrait.validate({ lights: [] })).toThrow('at least one');
    });

    it('throws on unknown light type', () => {
      const bad: any = { lights: [{ type: 'laser', config: {} }] };
      expect(() => AdvancedLightingTrait.validate(bad)).toThrow('Unknown light type');
    });

    it('throws when area_rect width <= 0', () => {
      const bad: AdvancedLightingConfig = {
        lights: [{ type: 'area_rect', config: { width: 0, height: 1, intensity: 100, color: [1, 1, 1] } }],
      };
      expect(() => AdvancedLightingTrait.validate(bad)).toThrow('width');
    });

    it('throws when area_rect height <= 0', () => {
      const bad: AdvancedLightingConfig = {
        lights: [{ type: 'area_rect', config: { width: 1, height: -1, intensity: 100, color: [1, 1, 1] } }],
      };
      expect(() => AdvancedLightingTrait.validate(bad)).toThrow('height');
    });

    it('throws when area_disk radius <= 0', () => {
      const bad: AdvancedLightingConfig = {
        lights: [{ type: 'area_disk', config: { radius: 0, intensity: 100, color: [1, 1, 1] } }],
      };
      expect(() => AdvancedLightingTrait.validate(bad)).toThrow('radius');
    });

    it('throws when ies profilePath missing', () => {
      const bad: AdvancedLightingConfig = {
        lights: [{ type: 'ies', config: { profilePath: '', intensity: 100, color: [1, 1, 1] } }],
      };
      expect(() => AdvancedLightingTrait.validate(bad)).toThrow('profilePath');
    });
  });

  describe('compile() — Unity', () => {
    it('rect light Unity output contains LightType.Rectangle', () => {
      expect(AdvancedLightingTrait.compile(rectConfig, 'unity')).toContain('LightType.Rectangle');
    });

    it('includes configured width and height', () => {
      const out = AdvancedLightingTrait.compile(rectConfig, 'unity');
      expect(out).toContain('2');
      expect(out).toContain('1');
    });

    it('disk Unity output contains LightType.Disc', () => {
      const diskConfig: AdvancedLightingConfig = {
        lights: [{ type: 'area_disk', config: { radius: 1, intensity: 500, color: [1, 1, 1] } }],
      };
      expect(AdvancedLightingTrait.compile(diskConfig, 'unity')).toContain('LightType.Disc');
    });

    it('IES Unity output references IESObject', () => {
      const iesConfig: AdvancedLightingConfig = {
        lights: [{ type: 'ies', config: { profilePath: 'lights/x.ies', intensity: 100, color: [1, 1, 1] } }],
      };
      expect(AdvancedLightingTrait.compile(iesConfig, 'unity')).toContain('IESLight');
    });

    it('cookie Unity output references cookie texture', () => {
      expect(AdvancedLightingTrait.compile(cookieConfig, 'unity')).toContain('cookies/window.png');
    });
  });

  describe('compile() — Unreal', () => {
    it('rect light Unreal output contains ARectLight', () => {
      expect(AdvancedLightingTrait.compile(rectConfig, 'unreal')).toContain('ARectLight');
    });

    it('IES Unreal output contains APointLight', () => {
      const iesConfig: AdvancedLightingConfig = {
        lights: [{ type: 'ies', config: { profilePath: 'lights/x.ies', intensity: 100, color: [1, 1, 1] } }],
      };
      expect(AdvancedLightingTrait.compile(iesConfig, 'unreal')).toContain('APointLight');
    });
  });

  describe('compile() — Web', () => {
    it('rect light Web output contains RectAreaLight', () => {
      expect(AdvancedLightingTrait.compile(rectConfig, 'web')).toContain('RectAreaLight');
    });

    it('emissive mesh Web output contains emissiveIntensity', () => {
      expect(AdvancedLightingTrait.compile(emissiveConfig, 'web')).toContain('emissiveIntensity');
    });

    it('cookie Web output contains SpotLight', () => {
      expect(AdvancedLightingTrait.compile(cookieConfig, 'web')).toContain('SpotLight');
    });
  });

  describe('compile() — WebGPU', () => {
    it('WebGPU output contains AreaLight struct', () => {
      expect(AdvancedLightingTrait.compile(rectConfig, 'webgpu')).toContain('AreaLight');
    });

    it('WebGPU output contains evaluateLTC function', () => {
      expect(AdvancedLightingTrait.compile(rectConfig, 'webgpu')).toContain('evaluateLTC');
    });
  });
});
