/**
 * ScreenSpaceEffectsTrait Unit Tests
 *
 * Tests for SSAO, SSR, SSGI, TAA, motion blur, DOF, and other screen-space effects
 */

import { describe, it, expect, vi } from 'vitest';
import { ScreenSpaceEffectsTrait } from '../ScreenSpaceEffectsTrait';
import type { ScreenSpaceEffectsConfig } from '../ScreenSpaceEffectsTrait';

describe('ScreenSpaceEffectsTrait', () => {
  describe('handler definition', () => {
    it('should have name "screen_space_effects"', () => {
      expect(ScreenSpaceEffectsTrait.name).toBe('screen_space_effects');
    });

    it('should have validate and compile methods', () => {
      expect(typeof ScreenSpaceEffectsTrait.validate).toBe('function');
      expect(typeof ScreenSpaceEffectsTrait.compile).toBe('function');
    });
  });

  describe('validate() - SSAO', () => {
    it('should pass validation for SSAO config', () => {
      const config: ScreenSpaceEffectsConfig = {
        ssao: {
          radius: 1.0,
          bias: 0.01,
          samples: 16,
          intensity: 1.0,
        },
      };

      expect(() => ScreenSpaceEffectsTrait.validate(config)).not.toThrow();
      expect(ScreenSpaceEffectsTrait.validate(config)).toBe(true);
    });

    it('should warn about SSAO samples out of optimal range', () => {
      const config: ScreenSpaceEffectsConfig = {
        ssao: {
          radius: 1.0,
          bias: 0.01,
          samples: 128,
          intensity: 1.0,
        },
      };

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      ScreenSpaceEffectsTrait.validate(config);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('SSAO samples should be 8-64'));
      consoleSpy.mockRestore();
    });

    it('should fail for SSAO radius <= 0', () => {
      const config: ScreenSpaceEffectsConfig = {
        ssao: {
          radius: 0,
          bias: 0.01,
          samples: 16,
          intensity: 1.0,
        },
      };

      expect(() => ScreenSpaceEffectsTrait.validate(config)).toThrow('SSAO radius must be > 0');
    });
  });

  describe('validate() - SSR', () => {
    it('should pass validation for SSR config', () => {
      const config: ScreenSpaceEffectsConfig = {
        ssr: {
          max_roughness: 0.2,
          step_count: 32,
          thickness: 0.1,
        },
      };

      expect(() => ScreenSpaceEffectsTrait.validate(config)).not.toThrow();
    });

    it('should warn about SSR step count out of optimal range', () => {
      const config: ScreenSpaceEffectsConfig = {
        ssr: {
          max_roughness: 0.2,
          step_count: 256,
          thickness: 0.1,
        },
      };

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      ScreenSpaceEffectsTrait.validate(config);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('SSR step_count should be 8-128'));
      consoleSpy.mockRestore();
    });
  });

  describe('validate() - SSGI', () => {
    it('should pass validation for SSGI config', () => {
      const config: ScreenSpaceEffectsConfig = {
        ssgi: {
          sample_count: 16,
          radius: 2.0,
          intensity: 1.0,
          denoise: true,
        },
      };

      expect(() => ScreenSpaceEffectsTrait.validate(config)).not.toThrow();
    });

    it('should warn about SSGI performance impact', () => {
      const config: ScreenSpaceEffectsConfig = {
        ssgi: {
          sample_count: 64,
          radius: 5.0,
          intensity: 1.0,
        },
      };

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      ScreenSpaceEffectsTrait.validate(config);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('SSGI is extremely expensive'));
      consoleSpy.mockRestore();
    });
  });

  describe('validate() - TAA', () => {
    it('should pass validation for TAA config', () => {
      const config: ScreenSpaceEffectsConfig = {
        taa: {
          jitter_spread: 0.75,
          feedback: 0.9,
          sharpness: 0.5,
          motion_rejection: true,
        },
      };

      expect(() => ScreenSpaceEffectsTrait.validate(config)).not.toThrow();
    });

    it('should fail for TAA feedback out of range', () => {
      const config: ScreenSpaceEffectsConfig = {
        taa: {
          jitter_spread: 0.75,
          feedback: 1.5,
        },
      };

      expect(() => ScreenSpaceEffectsTrait.validate(config)).toThrow('TAA feedback must be 0-1');
    });
  });

  describe('validate() - Depth of Field', () => {
    it('should pass validation for DOF config', () => {
      const config: ScreenSpaceEffectsConfig = {
        depth_of_field: {
          focus_distance: 10.0,
          aperture: 2.8,
          focal_length: 50,
          bokeh_shape: 'hexagon',
          samples: 32,
        },
      };

      expect(() => ScreenSpaceEffectsTrait.validate(config)).not.toThrow();
    });

    it('should warn about very wide aperture', () => {
      const config: ScreenSpaceEffectsConfig = {
        depth_of_field: {
          focus_distance: 5.0,
          aperture: 0.4,
        },
      };

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      ScreenSpaceEffectsTrait.validate(config);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Very wide aperture'));
      consoleSpy.mockRestore();
    });
  });

  describe('validate() - performance warnings', () => {
    it('should warn about many effects enabled', () => {
      const config: ScreenSpaceEffectsConfig = {
        ssao: { radius: 1.0, bias: 0.01, samples: 16, intensity: 1.0 },
        ssr: { max_roughness: 0.2, step_count: 32, thickness: 0.1 },
        ssgi: { sample_count: 16, radius: 2.0, intensity: 1.0 },
        taa: { jitter_spread: 0.75, feedback: 0.9 },
        motion_blur: { samples: 8, intensity: 0.5 },
        depth_of_field: { focus_distance: 10.0, aperture: 2.8 },
        chromatic_aberration: { intensity: 0.01 },
      };

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      ScreenSpaceEffectsTrait.validate(config);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('7 screen-space effects'));
      consoleSpy.mockRestore();
    });
  });

  describe('compile() - Unity HDRP', () => {
    it('should generate Unity volume setup', () => {
      const config: ScreenSpaceEffectsConfig = {
        ssao: {
          radius: 0.5,
          bias: 0.01,
          samples: 16,
          intensity: 1.0,
        },
      };

      const code = ScreenSpaceEffectsTrait.compile(config, 'unity');

      expect(code).toContain('using UnityEngine.Rendering.HighDefinition');
      expect(code).toContain('class ScreenSpaceEffectsManager');
      expect(code).toContain('Volume');
    });

    it('should configure SSAO in Unity', () => {
      const config: ScreenSpaceEffectsConfig = {
        ssao: {
          radius: 1.0,
          bias: 0.01,
          samples: 32,
          intensity: 1.5,
        },
      };

      const code = ScreenSpaceEffectsTrait.compile(config, 'unity');

      expect(code).toContain('ScreenSpaceAmbientOcclusion');
      expect(code).toContain('ssao.radius.value');
      expect(code).toContain('ssao.intensity.value');
    });

    it('should configure SSR in Unity', () => {
      const config: ScreenSpaceEffectsConfig = {
        ssr: {
          max_roughness: 0.3,
          step_count: 48,
          thickness: 0.15,
        },
      };

      const code = ScreenSpaceEffectsTrait.compile(config, 'unity');

      expect(code).toContain('ScreenSpaceReflection');
      expect(code).toContain('ssr.maximumIterationCount');
      expect(code).toContain('ssr.thickness');
      expect(code).toContain('ssr.smoothnessFadeStart');
    });

    it('should configure SSGI in Unity', () => {
      const config: ScreenSpaceEffectsConfig = {
        ssgi: {
          sample_count: 24,
          radius: 3.0,
          intensity: 1.2,
        },
      };

      const code = ScreenSpaceEffectsTrait.compile(config, 'unity');

      expect(code).toContain('GlobalIllumination');
      expect(code).toContain('gi.raySteps');
    });

    it('should configure TAA in Unity camera', () => {
      const config: ScreenSpaceEffectsConfig = {
        taa: {
          jitter_spread: 1.0,
          feedback: 0.85,
          sharpness: 0.6,
        },
      };

      const code = ScreenSpaceEffectsTrait.compile(config, 'unity');

      expect(code).toContain('HDAdditionalCameraData.AntialiasingMode.TemporalAntialiasing');
      expect(code).toContain('taaSharpenStrength');
      expect(code).toContain('taaHistorySharpening');
    });

    it('should configure motion blur in Unity', () => {
      const config: ScreenSpaceEffectsConfig = {
        motion_blur: {
          samples: 16,
          intensity: 0.8,
          velocity_scale: 1.5,
        },
      };

      const code = ScreenSpaceEffectsTrait.compile(config, 'unity');

      expect(code).toContain('MotionBlur');
      expect(code).toContain('motionBlur.intensity');
      expect(code).toContain('motionBlur.sampleCount');
    });

    it('should configure depth of field in Unity', () => {
      const config: ScreenSpaceEffectsConfig = {
        depth_of_field: {
          focus_distance: 8.0,
          aperture: 1.8,
          focal_length: 85,
        },
      };

      const code = ScreenSpaceEffectsTrait.compile(config, 'unity');

      expect(code).toContain('DepthOfField');
      expect(code).toContain('dof.focusDistance');
      expect(code).toContain('Camera.main.focalLength');
      expect(code).toContain('Camera.main.aperture');
    });

    it('should configure chromatic aberration in Unity', () => {
      const config: ScreenSpaceEffectsConfig = {
        chromatic_aberration: {
          intensity: 0.05,
          samples: 3,
        },
      };

      const code = ScreenSpaceEffectsTrait.compile(config, 'unity');

      expect(code).toContain('ChromaticAberration');
      expect(code).toContain('ca.intensity');
    });

    it('should configure film grain in Unity', () => {
      const config: ScreenSpaceEffectsConfig = {
        film_grain: {
          intensity: 0.3,
          size: 1.0,
          colored: false,
        },
      };

      const code = ScreenSpaceEffectsTrait.compile(config, 'unity');

      expect(code).toContain('FilmGrain');
      expect(code).toContain('grain.intensity');
    });
  });

  describe('compile() - Unreal Engine', () => {
    it('should generate Unreal post process volume', () => {
      const config: ScreenSpaceEffectsConfig = {
        ssao: {
          radius: 100.0,
          bias: 0.01,
          samples: 16,
          intensity: 1.0,
        },
      };

      const code = ScreenSpaceEffectsTrait.compile(config, 'unreal');

      expect(code).toContain('#include "Engine/PostProcessVolume.h"');
      expect(code).toContain('class AScreenSpaceEffectsVolume : public APostProcessVolume');
      expect(code).toContain('bUnbound = true');
    });

    it('should configure SSAO in Unreal', () => {
      const config: ScreenSpaceEffectsConfig = {
        ssao: {
          radius: 80.0,
          bias: 0.005,
          samples: 32,
          intensity: 1.2,
        },
      };

      const code = ScreenSpaceEffectsTrait.compile(config, 'unreal');

      expect(code).toContain('Settings.AmbientOcclusionIntensity');
      expect(code).toContain('Settings.AmbientOcclusionRadius');
      expect(code).toContain('Settings.AmbientOcclusionQuality');
    });

    it('should configure SSR in Unreal', () => {
      const config: ScreenSpaceEffectsConfig = {
        ssr: {
          max_roughness: 0.4,
          step_count: 64,
          thickness: 0.2,
        },
      };

      const code = ScreenSpaceEffectsTrait.compile(config, 'unreal');

      expect(code).toContain('EReflectionMethod::ScreenSpace');
      expect(code).toContain('ScreenSpaceReflectionIntensity');
      expect(code).toContain('ScreenSpaceReflectionMaxRoughness');
    });

    it('should configure SSGI (Lumen) in Unreal', () => {
      const config: ScreenSpaceEffectsConfig = {
        ssgi: {
          sample_count: 32,
          radius: 5.0,
          intensity: 1.0,
        },
      };

      const code = ScreenSpaceEffectsTrait.compile(config, 'unreal');

      expect(code).toContain('EDynamicGlobalIlluminationMethod::Lumen');
      expect(code).toContain('LumenSceneLightingQuality');
      expect(code).toContain('LumenFinalGatherQuality');
    });

    it('should configure motion blur in Unreal', () => {
      const config: ScreenSpaceEffectsConfig = {
        motion_blur: {
          samples: 12,
          intensity: 0.6,
        },
      };

      const code = ScreenSpaceEffectsTrait.compile(config, 'unreal');

      expect(code).toContain('Settings.MotionBlurAmount');
      expect(code).toContain('Settings.MotionBlurMax');
    });
  });

  describe('compile() - Web (Three.js)', () => {
    it('should generate Three.js post-processing composer', () => {
      const config: ScreenSpaceEffectsConfig = {
        ssao: {
          radius: 1.0,
          bias: 0.01,
          samples: 16,
          intensity: 1.0,
        },
      };

      const code = ScreenSpaceEffectsTrait.compile(config, 'web');

      expect(code).toContain("import { EffectComposer, EffectPass, RenderPass } from 'postprocessing'");
      expect(code).toContain('class ScreenSpaceEffectsComposer');
      expect(code).toContain('this.composer = new EffectComposer(renderer)');
    });

    it('should add SSAO effect in Three.js', () => {
      const config: ScreenSpaceEffectsConfig = {
        ssao: {
          radius: 0.5,
          bias: 0.025,
          samples: 64,
          intensity: 1.5,
        },
      };

      const code = ScreenSpaceEffectsTrait.compile(config, 'web');

      expect(code).toContain("import { SSAOEffect } from 'postprocessing'");
      expect(code).toContain('new SSAOEffect');
      expect(code).toContain('radius:');
      expect(code).toContain('bias:');
      expect(code).toContain('samples:');
    });

    it('should add SSR effect in Three.js', () => {
      const config: ScreenSpaceEffectsConfig = {
        ssr: {
          max_roughness: 0.25,
          step_count: 48,
          thickness: 0.12,
          binary_search_iterations: 10,
        },
      };

      const code = ScreenSpaceEffectsTrait.compile(config, 'web');

      expect(code).toContain("import { SSREffect } from 'screen-space-reflections'");
      expect(code).toContain('new SSREffect');
      expect(code).toContain('maxSteps:');
      expect(code).toContain('thickness:');
    });

    it('should add motion blur effect in Three.js', () => {
      const config: ScreenSpaceEffectsConfig = {
        motion_blur: {
          samples: 16,
          intensity: 0.7,
          velocity_scale: 1.2,
        },
      };

      const code = ScreenSpaceEffectsTrait.compile(config, 'web');

      expect(code).toContain("import { MotionBlurEffect } from 'postprocessing'");
      expect(code).toContain('new MotionBlurEffect');
      expect(code).toContain('samples:');
      expect(code).toContain('intensity:');
    });

    it('should add depth of field effect in Three.js', () => {
      const config: ScreenSpaceEffectsConfig = {
        depth_of_field: {
          focus_distance: 15.0,
          aperture: 2.0,
          focal_length: 35,
        },
      };

      const code = ScreenSpaceEffectsTrait.compile(config, 'web');

      expect(code).toContain("import { DepthOfFieldEffect } from 'postprocessing'");
      expect(code).toContain('new DepthOfFieldEffect');
      expect(code).toContain('focusDistance:');
      expect(code).toContain('bokehScale:');
    });

    it('should add chromatic aberration in Three.js', () => {
      const config: ScreenSpaceEffectsConfig = {
        chromatic_aberration: {
          intensity: 0.03,
        },
      };

      const code = ScreenSpaceEffectsTrait.compile(config, 'web');

      expect(code).toContain("import { ChromaticAberrationEffect } from 'postprocessing'");
      expect(code).toContain('new ChromaticAberrationEffect');
    });

    it('should add film grain in Three.js', () => {
      const config: ScreenSpaceEffectsConfig = {
        film_grain: {
          intensity: 0.25,
          size: 1.5,
        },
      };

      const code = ScreenSpaceEffectsTrait.compile(config, 'web');

      expect(code).toContain("import { NoiseEffect } from 'postprocessing'");
      expect(code).toContain('new NoiseEffect');
      expect(code).toContain('blendMode.opacity.value');
    });

    it('should add all effects to effect pass', () => {
      const config: ScreenSpaceEffectsConfig = {
        ssao: { radius: 1.0, bias: 0.01, samples: 16, intensity: 1.0 },
        motion_blur: { samples: 8, intensity: 0.5 },
      };

      const code = ScreenSpaceEffectsTrait.compile(config, 'web');

      expect(code).toContain('this.composer.addPass(new EffectPass(camera, ...effects))');
    });
  });

  describe('compile() - WebGPU', () => {
    it('should generate WebGPU SSAO compute shader', () => {
      const config: ScreenSpaceEffectsConfig = {
        ssao: {
          radius: 1.0,
          bias: 0.01,
          samples: 32,
          intensity: 1.0,
        },
      };

      const code = ScreenSpaceEffectsTrait.compile(config, 'webgpu');

      expect(code).toContain('@compute @workgroup_size(8, 8)');
      expect(code).toContain('fn computeSSAO');
      expect(code).toContain('texture_depth_2d');
      expect(code).toContain('Hemisphere sampling');
    });

    it('should generate WebGPU SSR ray march shader', () => {
      const config: ScreenSpaceEffectsConfig = {
        ssr: {
          max_roughness: 0.2,
          step_count: 32,
          thickness: 0.1,
        },
      };

      const code = ScreenSpaceEffectsTrait.compile(config, 'webgpu');

      expect(code).toContain('fn computeSSR');
      expect(code).toContain('Ray march in screen space');
      expect(code).toContain('reflect(-viewDir, normal)');
    });

    it('should generate WebGPU motion blur shader', () => {
      const config: ScreenSpaceEffectsConfig = {
        motion_blur: {
          samples: 16,
          intensity: 0.8,
        },
      };

      const code = ScreenSpaceEffectsTrait.compile(config, 'webgpu');

      expect(code).toContain('fn applyMotionBlur');
      expect(code).toContain('velocityTexture');
      expect(code).toContain('let samples =');
    });
  });

  describe('compile() - effect combinations', () => {
    it('should combine multiple effects in Unity', () => {
      const config: ScreenSpaceEffectsConfig = {
        ssao: { radius: 1.0, bias: 0.01, samples: 16, intensity: 1.0 },
        ssr: { max_roughness: 0.3, step_count: 32, thickness: 0.1 },
        taa: { jitter_spread: 1.0, feedback: 0.9 },
        motion_blur: { samples: 8, intensity: 0.5 },
      };

      const code = ScreenSpaceEffectsTrait.compile(config, 'unity');

      expect(code).toContain('ScreenSpaceAmbientOcclusion');
      expect(code).toContain('ScreenSpaceReflection');
      expect(code).toContain('TemporalAntialiasing');
      expect(code).toContain('MotionBlur');
    });

    it('should combine multiple effects in Three.js', () => {
      const config: ScreenSpaceEffectsConfig = {
        ssao: { radius: 0.5, bias: 0.01, samples: 32, intensity: 1.2 },
        depth_of_field: { focus_distance: 10.0, aperture: 2.8 },
        chromatic_aberration: { intensity: 0.02 },
      };

      const code = ScreenSpaceEffectsTrait.compile(config, 'web');

      expect(code).toContain('SSAOEffect');
      expect(code).toContain('DepthOfFieldEffect');
      expect(code).toContain('ChromaticAberrationEffect');
      expect(code).toContain('...effects');
    });
  });
});
