import { describe, it, expect } from 'vitest';
import { SubsurfaceScatteringTrait } from '../../traits/SubsurfaceScatteringTrait';
import type { SubsurfaceScatteringConfig } from '../../traits/SubsurfaceScatteringTrait';

const skinConfig: SubsurfaceScatteringConfig = {
  method: 'burley',
  preset: 'skin',
  scatterRadius: { r: 1.0, g: 0.2, b: 0.1 },
  intensity: 1.0,
  subsurfaceColor: { r: 0.8, g: 0.5, b: 0.4 },
};

const waxConfig: SubsurfaceScatteringConfig = {
  method: 'screen_space',
  preset: 'wax',
  scatterRadius: { r: 0.3, g: 0.3, b: 0.2 },
  intensity: 0.8,
  subsurfaceColor: { r: 0.9, g: 0.8, b: 0.6 },
};

const transmissionConfig: SubsurfaceScatteringConfig = {
  method: 'christensen_burley',
  scatterRadius: { r: 0.05, g: 0.4, b: 0.05 },
  intensity: 0.7,
  subsurfaceColor: { r: 0.1, g: 0.8, b: 0.1 },
  transmission: { enabled: true, thickness: 0.02 },
};

describe('SubsurfaceScatteringTrait — Production Tests', () => {
  describe('validate()', () => {
    it('accepts skin config', () => {
      expect(SubsurfaceScatteringTrait.validate(skinConfig)).toBe(true);
    });

    it('accepts wax config', () => {
      expect(SubsurfaceScatteringTrait.validate(waxConfig)).toBe(true);
    });

    it('accepts transmission config', () => {
      expect(SubsurfaceScatteringTrait.validate(transmissionConfig)).toBe(true);
    });

    it('throws on invalid method', () => {
      const bad: SubsurfaceScatteringConfig = { ...skinConfig, method: 'fake' as any };
      expect(() => SubsurfaceScatteringTrait.validate(bad)).toThrow();
    });

    it('throws when intensity < 0', () => {
      const bad: SubsurfaceScatteringConfig = { ...skinConfig, intensity: -1 };
      expect(() => SubsurfaceScatteringTrait.validate(bad)).toThrow('intensity');
    });

    it('throws when scatterRadius channel is negative', () => {
      const bad: SubsurfaceScatteringConfig = {
        ...skinConfig,
        scatterRadius: { r: -0.1, g: 0.2, b: 0.1 },
      };
      expect(() => SubsurfaceScatteringTrait.validate(bad)).toThrow('scatterRadius');
    });

    it('throws when subsurfaceColor channel is negative', () => {
      const bad: SubsurfaceScatteringConfig = {
        ...skinConfig,
        subsurfaceColor: { r: -0.1, g: 0.5, b: 0.4 },
      };
      expect(() => SubsurfaceScatteringTrait.validate(bad)).toThrow('subsurfaceColor');
    });

    it('throws when transmission.thickness <= 0', () => {
      const bad: SubsurfaceScatteringConfig = {
        ...transmissionConfig,
        transmission: { enabled: true, thickness: 0 },
      };
      expect(() => SubsurfaceScatteringTrait.validate(bad)).toThrow('thickness');
    });

    it('accepts all valid methods', () => {
      const methods = ['burley', 'christensen_burley', 'random_walk', 'screen_space'] as const;
      for (const method of methods) {
        expect(SubsurfaceScatteringTrait.validate({ ...skinConfig, method })).toBe(true);
      }
    });
  });

  describe('compile() — Unity', () => {
    it('Unity output enables SSS keyword', () => {
      const out = SubsurfaceScatteringTrait.compile(skinConfig, 'unity');
      expect(out).toContain('_MATERIAL_FEATURE_SUBSURFACE_SCATTERING');
    });

    it('Unity output sets SubsurfaceMask to intensity', () => {
      const out = SubsurfaceScatteringTrait.compile(skinConfig, 'unity');
      expect(out).toContain(String(skinConfig.intensity));
    });

    it('Unity output enables transmission keyword when enabled', () => {
      const out = SubsurfaceScatteringTrait.compile(transmissionConfig, 'unity');
      expect(out).toContain('_MATERIAL_FEATURE_TRANSMISSION');
    });
  });

  describe('compile() — Unreal', () => {
    it('Unreal output contains SubsurfaceProfile setup', () => {
      const out = SubsurfaceScatteringTrait.compile(skinConfig, 'unreal');
      expect(out).toContain('USubsurfaceProfile');
    });

    it('Unreal output contains MeanFreePathColor', () => {
      const out = SubsurfaceScatteringTrait.compile(skinConfig, 'unreal');
      expect(out).toContain('MeanFreePathColor');
    });
  });

  describe('compile() — Web', () => {
    it('Web output is MeshPhysicalMaterial based', () => {
      const out = SubsurfaceScatteringTrait.compile(skinConfig, 'web');
      expect(out).toContain('MeshPhysicalMaterial');
    });

    it('Web output sets sssIntensity uniform', () => {
      const out = SubsurfaceScatteringTrait.compile(skinConfig, 'web');
      expect(out).toContain('sssIntensity');
    });

    it('Web output includes transmission uniform when enabled', () => {
      const out = SubsurfaceScatteringTrait.compile(transmissionConfig, 'web');
      expect(out).toContain('sssThickness');
    });
  });

  describe('compile() — WebGPU', () => {
    it('WebGPU output contains SSSUniforms struct', () => {
      const out = SubsurfaceScatteringTrait.compile(skinConfig, 'webgpu');
      expect(out).toContain('SSSUniforms');
    });

    it('WebGPU output contains burleySSS function', () => {
      const out = SubsurfaceScatteringTrait.compile(skinConfig, 'webgpu');
      expect(out).toContain('burleySSS');
    });

    it('WebGPU output embeds intensity value', () => {
      const out = SubsurfaceScatteringTrait.compile(skinConfig, 'webgpu');
      expect(out).toContain(String(skinConfig.intensity));
    });
  });
});
