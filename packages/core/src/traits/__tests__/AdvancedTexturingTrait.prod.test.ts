import { describe, it, expect } from 'vitest';
import { AdvancedTexturingTrait } from '../../traits/AdvancedTexturingTrait';
import type { AdvancedTexturingConfig } from '../../traits/AdvancedTexturingTrait';

const displacementConfig: AdvancedTexturingConfig = {
  mode: 'displacement',
  displacement: { heightMap: 'textures/height.png', scale: 0.3, bias: 0, tessellationLevel: 8 },
};

const pomConfig: AdvancedTexturingConfig = {
  mode: 'pom',
  pom: { heightMap: 'textures/pom_height.png', scale: 0.05, steps: 32, refinementSteps: 8, selfShadow: true },
};

const triplanarConfig: AdvancedTexturingConfig = {
  mode: 'triplanar',
  triplanar: {
    albedoMapX: 'rocks/rock_xz.png',
    albedoMapY: 'rocks/rock_top.png',
    albedoMapZ: 'rocks/rock_xz.png',
    scale: 2.0,
    blendSharpness: 4,
  },
};

const detailConfig: AdvancedTexturingConfig = {
  mode: 'detail',
  detail: { albedoMap: 'detail/micro_albedo.png', normalMap: 'detail/micro_normal.png', scale: 8, intensity: 0.5 },
};

const atlasConfig: AdvancedTexturingConfig = {
  mode: 'standard',
  atlas: { width: 2048, height: 2048, padding: 4, mipLevels: 8 },
};

describe('AdvancedTexturingTrait — Production Tests', () => {

  describe('validate()', () => {
    it('accepts displacement config', () => {
      expect(AdvancedTexturingTrait.validate(displacementConfig)).toBe(true);
    });

    it('accepts POM config', () => {
      expect(AdvancedTexturingTrait.validate(pomConfig)).toBe(true);
    });

    it('accepts triplanar config', () => {
      expect(AdvancedTexturingTrait.validate(triplanarConfig)).toBe(true);
    });

    it('accepts detail config', () => {
      expect(AdvancedTexturingTrait.validate(detailConfig)).toBe(true);
    });

    it('accepts standard + atlas config', () => {
      expect(AdvancedTexturingTrait.validate(atlasConfig)).toBe(true);
    });

    it('throws on invalid mode', () => {
      expect(() => AdvancedTexturingTrait.validate({ mode: 'ptex' as any })).toThrow();
    });

    it('throws when displacement mode missing config', () => {
      expect(() => AdvancedTexturingTrait.validate({ mode: 'displacement' })).toThrow('displacement config');
    });

    it('throws when pom mode missing config', () => {
      expect(() => AdvancedTexturingTrait.validate({ mode: 'pom' })).toThrow('pom config');
    });

    it('throws when triplanar mode missing config', () => {
      expect(() => AdvancedTexturingTrait.validate({ mode: 'triplanar' })).toThrow('triplanar config');
    });

    it('throws when pom.steps < 1', () => {
      const bad: AdvancedTexturingConfig = { ...pomConfig, pom: { ...pomConfig.pom!, steps: 0 } };
      expect(() => AdvancedTexturingTrait.validate(bad)).toThrow('steps');
    });

    it('throws when pom.scale <= 0', () => {
      const bad: AdvancedTexturingConfig = { ...pomConfig, pom: { ...pomConfig.pom!, scale: 0 } };
      expect(() => AdvancedTexturingTrait.validate(bad)).toThrow('scale');
    });

    it('throws when atlas width <= 0', () => {
      const bad: AdvancedTexturingConfig = { ...atlasConfig, atlas: { ...atlasConfig.atlas!, width: 0 } };
      expect(() => AdvancedTexturingTrait.validate(bad)).toThrow('dimensions');
    });
  });

  describe('compile() — Unity', () => {
    it('displacement Unity output enables tessellation', () => {
      const out = AdvancedTexturingTrait.compile(displacementConfig, 'unity');
      expect(out).toContain('_TESSELLATION_PHONG');
    });

    it('displacement Unity output sets HeightAmplitude', () => {
      const out = AdvancedTexturingTrait.compile(displacementConfig, 'unity');
      expect(out).toContain('_HeightAmplitude');
    });

    it('POM Unity output enables PIXEL_DISPLACEMENT', () => {
      const out = AdvancedTexturingTrait.compile(pomConfig, 'unity');
      expect(out).toContain('_PIXEL_DISPLACEMENT');
    });

    it('detail Unity output enables _DETAIL_MAP', () => {
      const out = AdvancedTexturingTrait.compile(detailConfig, 'unity');
      expect(out).toContain('_DETAIL_MAP');
    });

    it('triplanar Unity output references all 3 maps', () => {
      const out = AdvancedTexturingTrait.compile(triplanarConfig, 'unity');
      expect(out).toContain(triplanarConfig.triplanar!.albedoMapX);
      expect(out).toContain(triplanarConfig.triplanar!.albedoMapY);
    });
  });

  describe('compile() — Unreal', () => {
    it('displacement Unreal output references HeightMap', () => {
      expect(AdvancedTexturingTrait.compile(displacementConfig, 'unreal')).toContain('HeightMap');
    });

    it('POM Unreal output references Parallax Occlusion Mapping', () => {
      expect(AdvancedTexturingTrait.compile(pomConfig, 'unreal')).toContain('Parallax Occlusion Mapping');
    });

    it('triplanar Unreal output references Triplanar', () => {
      expect(AdvancedTexturingTrait.compile(triplanarConfig, 'unreal')).toContain('Triplanar');
    });
  });

  describe('compile() — Web', () => {
    it('displacement Web output references displacementMap', () => {
      expect(AdvancedTexturingTrait.compile(displacementConfig, 'web')).toContain('displacementMap');
    });

    it('POM Web output references heightMap file', () => {
      const out = AdvancedTexturingTrait.compile(pomConfig, 'web');
      expect(out).toContain(pomConfig.pom!.heightMap);
    });

    it('triplanar Web output loads all 3 textures', () => {
      const out = AdvancedTexturingTrait.compile(triplanarConfig, 'web');
      expect(out).toContain(triplanarConfig.triplanar!.albedoMapX);
      expect(out).toContain(triplanarConfig.triplanar!.albedoMapY);
    });
  });

  describe('compile() — WebGPU', () => {
    it('POM WebGPU output contains pomOffset function', () => {
      expect(AdvancedTexturingTrait.compile(pomConfig, 'webgpu')).toContain('pomOffset');
    });

    it('triplanar WebGPU output contains triplanarSample function', () => {
      expect(AdvancedTexturingTrait.compile(triplanarConfig, 'webgpu')).toContain('triplanarSample');
    });

    it('POM WebGPU output embeds correct step count', () => {
      const out = AdvancedTexturingTrait.compile(pomConfig, 'webgpu');
      expect(out).toContain(String(pomConfig.pom!.steps));
    });

    it('triplanar WebGPU output embeds blendSharpness', () => {
      const out = AdvancedTexturingTrait.compile(triplanarConfig, 'webgpu');
      expect(out).toContain(String(triplanarConfig.triplanar!.blendSharpness));
    });
  });
});
