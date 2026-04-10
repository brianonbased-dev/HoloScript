import { describe, it, expect } from 'vitest';
import { ScreenSpaceEffectsTrait } from '../../traits/ScreenSpaceEffectsTrait';
import type { ScreenSpaceEffectsConfig } from '../../traits/ScreenSpaceEffectsTrait';

const fullConfig: ScreenSpaceEffectsConfig = {
  ssao: { radius: 0.5, bias: 0.025, samples: 32, intensity: 0.8, blur_radius: 2 },
  ssr: { max_roughness: 0.5, step_count: 64, thickness: 0.02 },
  ssgi: { sample_count: 16, radius: 2.0, intensity: 0.5 },
  taa: { jitter_spread: 0.75, feedback: 0.97 },
  motion_blur: { samples: 8, intensity: 0.5 },
  depth_of_field: { focus_distance: 10, aperture: 2.8 },
  chromatic_aberration: { intensity: 0.03 },
  film_grain: { intensity: 0.1, size: 1 },
};

const minimalConfig: ScreenSpaceEffectsConfig = {
  ssao: { radius: 0.5, bias: 0.01, samples: 16, intensity: 0.5 },
};

const invalidSamples: ScreenSpaceEffectsConfig = {
  ssao: { radius: 1.0, bias: 0.01, samples: 5, intensity: 0.5 }, // below 8
};

describe('ScreenSpaceEffectsTrait — Production Tests', () => {
  describe('validate()', () => {
    it('accepts full config', () => {
      expect(ScreenSpaceEffectsTrait.validate(fullConfig)).toBe(true);
    });

    it('accepts minimal config with only SSAO', () => {
      expect(ScreenSpaceEffectsTrait.validate(minimalConfig)).toBe(true);
    });

    it('accepts config with no effects', () => {
      expect(ScreenSpaceEffectsTrait.validate({})).toBe(true);
    });

    it('throws when SSAO radius <= 0', () => {
      const bad: ScreenSpaceEffectsConfig = {
        ssao: { radius: 0, bias: 0.01, samples: 16, intensity: 0.5 },
      };
      expect(() => ScreenSpaceEffectsTrait.validate(bad)).toThrow('radius');
    });

    it('warns but accepts SSAO samples outside 8-64 range', () => {
      // validate returns true with a console.warn for out-of-range samples
      expect(ScreenSpaceEffectsTrait.validate(invalidSamples)).toBe(true);
    });

    it('throws when TAA feedback out of range', () => {
      const bad: ScreenSpaceEffectsConfig = {
        taa: { jitter_spread: 0.75, feedback: 1.5 },
      };
      expect(() => ScreenSpaceEffectsTrait.validate(bad)).toThrow('feedback');
    });

    it('throws when DOF aperture < 0.5 warning threshold (but does not throw)', () => {
      // aperture < 0.5 is a warning, not an error — validate should still return true
      const cfg: ScreenSpaceEffectsConfig = {
        depth_of_field: { focus_distance: 5, aperture: 0.3 },
      };
      expect(ScreenSpaceEffectsTrait.validate(cfg)).toBe(true);
    });
  });

  describe('compile() — Unity', () => {
    it('Unity output contains SetupEffects method', () => {
      const out = ScreenSpaceEffectsTrait.compile(fullConfig, 'unity');
      expect(out).toContain('SetupEffects');
    });

    it('Unity output contains SSAO section when ssao enabled', () => {
      const out = ScreenSpaceEffectsTrait.compile(fullConfig, 'unity');
      expect(out).toContain('ScreenSpaceAmbientOcclusion');
    });

    it('Unity output contains SSR section when ssr enabled', () => {
      const out = ScreenSpaceEffectsTrait.compile(fullConfig, 'unity');
      expect(out).toContain('ScreenSpaceReflection');
    });

    it('Unity output contains MotionBlur section', () => {
      const out = ScreenSpaceEffectsTrait.compile(fullConfig, 'unity');
      expect(out).toContain('MotionBlur');
    });

    it('Unity output contains FilmGrain section', () => {
      const out = ScreenSpaceEffectsTrait.compile(fullConfig, 'unity');
      expect(out).toContain('FilmGrain');
    });

    it('Unity output does not include empty sections for minimal config', () => {
      const out = ScreenSpaceEffectsTrait.compile(minimalConfig, 'unity');
      expect(out).not.toContain('ScreenSpaceReflection');
    });
  });

  describe('compile() — Unreal', () => {
    it('Unreal output contains AmbientOcclusionIntensity when ssao enabled', () => {
      const out = ScreenSpaceEffectsTrait.compile(fullConfig, 'unreal');
      expect(out).toContain('AmbientOcclusionIntensity');
    });

    it('Unreal output contains ScreenSpaceReflectionIntensity when ssr enabled', () => {
      const out = ScreenSpaceEffectsTrait.compile(fullConfig, 'unreal');
      expect(out).toContain('ScreenSpaceReflectionIntensity');
    });

    it('Unreal output contains GrainIntensity when film_grain enabled', () => {
      const out = ScreenSpaceEffectsTrait.compile(fullConfig, 'unreal');
      expect(out).toContain('GrainIntensity');
    });
  });

  describe('compile() — Web', () => {
    it('Web output imports EffectComposer', () => {
      const out = ScreenSpaceEffectsTrait.compile(fullConfig, 'web');
      expect(out).toContain('EffectComposer');
    });

    it('Web output includes SSAOEffect when ssao enabled', () => {
      const out = ScreenSpaceEffectsTrait.compile(fullConfig, 'web');
      expect(out).toContain('SSAOEffect');
    });

    it('Web output does not include SSREffect when ssr disabled', () => {
      const out = ScreenSpaceEffectsTrait.compile(minimalConfig, 'web');
      expect(out).not.toContain('SSREffect');
    });
  });

  describe('compile() — WebGPU', () => {
    it('WebGPU output contains SSAO compute shader when enabled', () => {
      const out = ScreenSpaceEffectsTrait.compile(fullConfig, 'webgpu');
      expect(out).toContain('@compute');
    });

    it('WebGPU output contains SSR ray march when enabled', () => {
      const out = ScreenSpaceEffectsTrait.compile(fullConfig, 'webgpu');
      expect(out).toContain('rayDepth');
    });

    it('WebGPU output contains motion blur pass when enabled', () => {
      const out = ScreenSpaceEffectsTrait.compile(fullConfig, 'webgpu');
      expect(out).toContain('motionBlur');
    });
  });

  describe('compile() — react-three-fiber alias', () => {
    it('react-three-fiber target produces same output as web', () => {
      const web = ScreenSpaceEffectsTrait.compile(fullConfig, 'web');
      const rtf = ScreenSpaceEffectsTrait.compile(fullConfig, 'react-three-fiber');
      expect(rtf).toBe(web);
    });
  });
});
