import { describe, it, expect } from 'vitest';
import { GlobalIlluminationTrait } from '../../traits/GlobalIlluminationTrait';
import type { GlobalIlluminationConfig } from '../../traits/GlobalIlluminationTrait';

const shProbeConfig: GlobalIlluminationConfig = {
  mode: 'sh_probes',
  sh: { gridResolution: [4, 2, 4], cellSize: 2, order: 3 },
  skyIntensity: 1.0,
  supportDynamicObjects: true,
};

const lightmapConfig: GlobalIlluminationConfig = {
  mode: 'lightmap',
  lightmap: { resolution: 64, samples: 512, bounces: 4, denoise: true },
};

const lumenConfig: GlobalIlluminationConfig = {
  mode: 'lumen',
  skyIntensity: 0.8,
};

const ddgiConfig: GlobalIlluminationConfig = {
  mode: 'ddgi',
  ddgi: { probeCount: 64, raysPerProbe: 144, irradianceTexSize: 8, visibilityTexSize: 16, normalBias: 0.02, hysteresis: 0.95 },
};

describe('GlobalIlluminationTrait — Production Tests', () => {

  describe('validate()', () => {
    it('accepts sh_probes mode with sh config', () => {
      expect(GlobalIlluminationTrait.validate(shProbeConfig)).toBe(true);
    });

    it('accepts lightmap mode', () => {
      expect(GlobalIlluminationTrait.validate(lightmapConfig)).toBe(true);
    });

    it('accepts ddgi mode', () => {
      expect(GlobalIlluminationTrait.validate(ddgiConfig)).toBe(true);
    });

    it('accepts lumen mode (no sub-config required)', () => {
      expect(GlobalIlluminationTrait.validate(lumenConfig)).toBe(true);
    });

    it('throws on unknown mode', () => {
      const bad = { mode: 'voxel_cone' as any };
      expect(() => GlobalIlluminationTrait.validate(bad)).toThrow();
    });

    it('throws when sh_probes mode missing sh config', () => {
      expect(() => GlobalIlluminationTrait.validate({ mode: 'sh_probes' })).toThrow('sh config');
    });

    it('throws when ddgi mode missing ddgi config', () => {
      expect(() => GlobalIlluminationTrait.validate({ mode: 'ddgi' })).toThrow('ddgi config');
    });

    it('throws when ddgi.hysteresis out of range', () => {
      const bad: GlobalIlluminationConfig = { ...ddgiConfig, ddgi: { ...ddgiConfig.ddgi!, hysteresis: 1.5 } };
      expect(() => GlobalIlluminationTrait.validate(bad)).toThrow('hysteresis');
    });

    it('throws when ddgi.raysPerProbe < 1', () => {
      const bad: GlobalIlluminationConfig = { ...ddgiConfig, ddgi: { ...ddgiConfig.ddgi!, raysPerProbe: 0 } };
      expect(() => GlobalIlluminationTrait.validate(bad)).toThrow('raysPerProbe');
    });

    it('throws on negative skyIntensity', () => {
      expect(() => GlobalIlluminationTrait.validate({ mode: 'lumen', skyIntensity: -1 })).toThrow('skyIntensity');
    });
  });

  describe('compile() — Unity', () => {
    it('SH probe Unity output contains LightProbeGroup', () => {
      const out = GlobalIlluminationTrait.compile(shProbeConfig, 'unity');
      expect(out).toContain('LightProbeGroup');
    });

    it('lightmap Unity output contains Lightmapping', () => {
      const out = GlobalIlluminationTrait.compile(lightmapConfig, 'unity');
      expect(out).toContain('Lightmapping');
    });

    it('lumen/ddgi Unity output contains ProbeVolume', () => {
      const out = GlobalIlluminationTrait.compile(ddgiConfig, 'unity');
      expect(out).toContain('ProbeVolume');
    });
  });

  describe('compile() — Unreal', () => {
    it('lumen Unreal output contains Lumen', () => {
      const out = GlobalIlluminationTrait.compile(lumenConfig, 'unreal');
      expect(out).toContain('Lumen');
    });

    it('lightmap Unreal output contains ALightmassImportanceVolume', () => {
      const out = GlobalIlluminationTrait.compile(lightmapConfig, 'unreal');
      expect(out).toContain('ALightmassImportanceVolume');
    });

    it('sh_probes Unreal output contains ASkyLight', () => {
      const out = GlobalIlluminationTrait.compile(shProbeConfig, 'unreal');
      expect(out).toContain('ASkyLight');
    });
  });

  describe('compile() — Web', () => {
    it('lightmap web output contains lightMap', () => {
      const out = GlobalIlluminationTrait.compile(lightmapConfig, 'web');
      expect(out).toContain('lightMap');
    });

    it('non-lightmap web output contains PMREMGenerator', () => {
      const out = GlobalIlluminationTrait.compile(shProbeConfig, 'web');
      expect(out).toContain('PMREMGenerator');
    });

    it('dynamic objects web output contains LightProbeGenerator', () => {
      const out = GlobalIlluminationTrait.compile(shProbeConfig, 'web');
      expect(out).toContain('LightProbeGenerator');
    });
  });

  describe('compile() — WebGPU', () => {
    it('WebGPU output contains SHCoeffs struct', () => {
      const out = GlobalIlluminationTrait.compile(shProbeConfig, 'webgpu');
      expect(out).toContain('SHCoeffs');
    });

    it('WebGPU output contains evaluateSH function', () => {
      const out = GlobalIlluminationTrait.compile(shProbeConfig, 'webgpu');
      expect(out).toContain('evaluateSH');
    });

    it('WebGPU output includes skyIntensity multiplier', () => {
      const out = GlobalIlluminationTrait.compile(shProbeConfig, 'webgpu');
      expect(out).toContain(String(shProbeConfig.skyIntensity));
    });
  });

  describe('compile() — Generic', () => {
    it('generic output is valid JSON', () => {
      const out = GlobalIlluminationTrait.compile(lumenConfig, 'generic');
      expect(() => JSON.parse(out.replace(/^\/\/.*\n/, ''))).not.toThrow();
    });
  });
});
