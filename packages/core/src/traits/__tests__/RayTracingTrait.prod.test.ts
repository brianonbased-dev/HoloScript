import { describe, it, expect } from 'vitest';
import { RayTracingTrait } from '../../traits/RayTracingTrait';
import type { RayTracingConfig } from '../../traits/RayTracingTrait';

const hwConfig: RayTracingConfig = {
  mode: 'hardware',
  reflections: { enabled: true, maxBounces: 4, samplesPerPixel: 1, maxRoughness: 0.5, fallbackToSSR: true },
  shadows: { enabled: true, samplesPerLight: 2, softShadows: true },
  ao: { enabled: true, radius: 0.5, samplesPerPixel: 2 },
};

const ptConfig: RayTracingConfig = {
  mode: 'software_bvh',
  pathTracer: { enabled: true, samplesPerPixel: 4, maxBounces: 6, denoiser: 'nlm', russianRouletteDepth: 3 },
};

const hybridConfig: RayTracingConfig = {
  mode: 'hybrid',
  gi: { enabled: true, maxBounces: 2, samplesPerPixel: 1, denoise: true },
  maxRaysPerFrame: 100000,
};

describe('RayTracingTrait — Production Tests', () => {

  describe('validate()', () => {
    it('accepts hardware config', () => {
      expect(RayTracingTrait.validate(hwConfig)).toBe(true);
    });

    it('accepts software_bvh path tracer config', () => {
      expect(RayTracingTrait.validate(ptConfig)).toBe(true);
    });

    it('accepts hybrid config', () => {
      expect(RayTracingTrait.validate(hybridConfig)).toBe(true);
    });

    it('throws on invalid mode', () => {
      expect(() => RayTracingTrait.validate({ mode: 'planar_reflections' as any })).toThrow();
    });

    it('throws when reflections.maxBounces > 16', () => {
      const bad: RayTracingConfig = { ...hwConfig, reflections: { ...hwConfig.reflections!, maxBounces: 20 } };
      expect(() => RayTracingTrait.validate(bad)).toThrow('maxBounces');
    });

    it('throws when reflections.maxBounces < 1', () => {
      const bad: RayTracingConfig = { ...hwConfig, reflections: { ...hwConfig.reflections!, maxBounces: 0 } };
      expect(() => RayTracingTrait.validate(bad)).toThrow('maxBounces');
    });

    it('throws when shadows.samplesPerLight < 1', () => {
      const bad: RayTracingConfig = { ...hwConfig, shadows: { ...hwConfig.shadows!, samplesPerLight: 0 } };
      expect(() => RayTracingTrait.validate(bad)).toThrow('samplesPerLight');
    });

    it('throws when pathTracer.maxBounces < 1', () => {
      const bad: RayTracingConfig = { ...ptConfig, pathTracer: { ...ptConfig.pathTracer!, maxBounces: 0 } };
      expect(() => RayTracingTrait.validate(bad)).toThrow('maxBounces');
    });

    it('throws when maxRaysPerFrame <= 0', () => {
      expect(() => RayTracingTrait.validate({ mode: 'hardware', maxRaysPerFrame: 0 })).toThrow('maxRaysPerFrame');
    });
  });

  describe('compile() — Unity', () => {
    it('hardware Unity output contains ScreenSpaceReflection', () => {
      expect(RayTracingTrait.compile(hwConfig, 'unity')).toContain('ScreenSpaceReflection');
    });

    it('hardware Unity output references RayCastingMode.RayTracing', () => {
      expect(RayTracingTrait.compile(hwConfig, 'unity')).toContain('RayCastingMode.RayTracing');
    });

    it('path tracer Unity output contains PathTracing', () => {
      expect(RayTracingTrait.compile(ptConfig, 'unity')).toContain('PathTracing');
    });

    it('ao Unity output contains ScreenSpaceAmbientOcclusion', () => {
      expect(RayTracingTrait.compile(hwConfig, 'unity')).toContain('ScreenSpaceAmbientOcclusion');
    });
  });

  describe('compile() — Unreal', () => {
    it('reflections Unreal output references RayTracing', () => {
      expect(RayTracingTrait.compile(hwConfig, 'unreal')).toContain('RayTracing');
    });

    it('Unreal output contains MaxBounces setting', () => {
      const out = RayTracingTrait.compile(hwConfig, 'unreal');
      expect(out).toContain('MaxBounces');
    });

    it('path tracer Unreal output contains PathTracing', () => {
      expect(RayTracingTrait.compile(ptConfig, 'unreal')).toContain('PathTracing');
    });
  });

  describe('compile() — Web', () => {
    it('hardware web output warns about no hardware RT', () => {
      expect(RayTracingTrait.compile(hwConfig, 'web')).toContain('not supported');
    });

    it('software_bvh web output references WebGLPathTracer', () => {
      expect(RayTracingTrait.compile(ptConfig, 'web')).toContain('WebGLPathTracer');
    });
  });

  describe('compile() — WebGPU', () => {
    it('WebGPU output contains BVHNode struct', () => {
      expect(RayTracingTrait.compile(ptConfig, 'webgpu')).toContain('BVHNode');
    });

    it('WebGPU output contains @compute workgroup', () => {
      expect(RayTracingTrait.compile(ptConfig, 'webgpu')).toContain('@compute');
    });

    it('WebGPU output embeds samplesPerPixel value', () => {
      const out = RayTracingTrait.compile(ptConfig, 'webgpu');
      expect(out).toContain(String(ptConfig.pathTracer!.samplesPerPixel));
    });
  });
});
