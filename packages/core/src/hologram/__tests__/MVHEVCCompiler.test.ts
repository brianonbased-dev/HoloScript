/**
 * MVHEVCCompiler — Tests for Apple Vision Pro spatial video compiler.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MVHEVCCompiler } from '../MVHEVCCompiler';
import type { MVHEVCConfig, MVHEVCCompilationResult } from '../MVHEVCCompiler';
import { createTestCompilerToken } from '../../compiler/CompilerBase';

function createComposition(overrides: Record<string, any> = {}) {
  return {
    type: 'Composition' as const,
    name: 'TestScene',
    objects: [],
    templates: [],
    spatialGroups: [],
    lights: [],
    imports: [],
    timelines: [],
    audio: [],
    zones: [],
    transitions: [],
    conditionals: [],
    iterators: [],
    ...overrides,
  };
}

describe('MVHEVCCompiler', () => {
  let compiler: MVHEVCCompiler;
  let testToken: string;

  beforeEach(() => {
    compiler = new MVHEVCCompiler();
    testToken = createTestCompilerToken();
  });

  it('should instantiate', () => {
    expect(compiler).toBeDefined();
    expect(compiler).toBeInstanceOf(MVHEVCCompiler);
  });

  describe('compile()', () => {
    it('returns Swift code string', () => {
      const result = compiler.compile(createComposition(), testToken);
      expect(typeof result).toBe('string');
      expect(result).toContain('import SwiftUI');
      expect(result).toContain('import RealityKit');
    });

    it('includes scene name from composition', () => {
      const result = compiler.compile(createComposition({ name: 'MyVisionScene' }), testToken);
      expect(result).toContain('MyVisionScene');
    });

    it('validates RBAC token', () => {
      expect(() => compiler.compile(createComposition(), 'invalid-token')).toThrow();
    });
  });

  describe('compileMVHEVC()', () => {
    let result: MVHEVCCompilationResult;

    beforeEach(() => {
      result = compiler.compileMVHEVC(createComposition());
    });

    it('returns full compilation result', () => {
      expect(result).toHaveProperty('config');
      expect(result).toHaveProperty('views');
      expect(result).toHaveProperty('swiftCode');
      expect(result).toHaveProperty('muxCommand');
      expect(result).toHaveProperty('metadata');
    });

    it('generates exactly two stereo views (left + right)', () => {
      expect(result.views).toHaveLength(2);
      expect(result.views[0].eye).toBe('left');
      expect(result.views[1].eye).toBe('right');
    });

    it('left eye has base layer (0), right eye has enhancement layer (1)', () => {
      expect(result.views[0].layerIndex).toBe(0);
      expect(result.views[1].layerIndex).toBe(1);
    });

    it('camera offsets are symmetric around center', () => {
      const leftOffset = result.views[0].cameraOffset;
      const rightOffset = result.views[1].cameraOffset;
      expect(leftOffset).toBeLessThan(0);
      expect(rightOffset).toBeGreaterThan(0);
      expect(Math.abs(leftOffset)).toBeCloseTo(Math.abs(rightOffset));
    });

    it('view shear is symmetric and opposite to offset', () => {
      const leftShear = result.views[0].viewShear;
      const rightShear = result.views[1].viewShear;
      expect(leftShear).toBeGreaterThan(0); // Left eye shears right
      expect(rightShear).toBeLessThan(0); // Right eye shears left
      expect(Math.abs(leftShear)).toBeCloseTo(Math.abs(rightShear));
    });

    it('default config uses 65mm IPD', () => {
      expect(result.config.ipd).toBe(0.065);
    });

    it('default config uses 1920x1080', () => {
      expect(result.config.resolution).toEqual([1920, 1080]);
    });

    it('default config uses 30fps', () => {
      expect(result.config.fps).toBe(30);
    });

    it('metadata signals multiview-hevc stereo mode', () => {
      expect(result.metadata.stereoMode).toBe('multiview-hevc');
      expect(result.metadata.baseline).toBe(0.065);
    });
  });

  describe('config overrides', () => {
    it('accepts custom IPD', () => {
      const result = compiler.compileMVHEVC(createComposition(), { ipd: 0.058 });
      expect(result.config.ipd).toBe(0.058);
      expect(result.metadata.baseline).toBe(0.058);
    });

    it('accepts custom resolution', () => {
      const result = compiler.compileMVHEVC(createComposition(), {
        resolution: [3840, 2160],
      });
      expect(result.config.resolution).toEqual([3840, 2160]);
    });

    it('accepts quality levels', () => {
      for (const quality of ['low', 'medium', 'high'] as const) {
        const result = compiler.compileMVHEVC(createComposition(), { quality });
        expect(result.config.quality).toBe(quality);
      }
    });

    it('accepts container format override', () => {
      const result = compiler.compileMVHEVC(createComposition(), { container: 'mp4' });
      expect(result.config.container).toBe('mp4');
      expect(result.muxCommand).toContain('.mp4');
    });
  });

  describe('Swift code output', () => {
    it('contains StereoCameraConfig struct', () => {
      const result = compiler.compileMVHEVC(createComposition());
      expect(result.swiftCode).toContain('StereoCameraConfig');
    });

    it('contains AVAssetWriter extension', () => {
      const result = compiler.compileMVHEVC(createComposition());
      expect(result.swiftCode).toContain('AVAssetWriter');
    });

    it('contains StereoRenderPipeline', () => {
      const result = compiler.compileMVHEVC(createComposition());
      expect(result.swiftCode).toContain('StereoRenderPipeline');
    });

    it('contains VideoPlayerComponent for RealityKit', () => {
      const result = compiler.compileMVHEVC(createComposition());
      expect(result.swiftCode).toContain('VideoPlayerComponent');
    });
  });

  describe('FFmpeg mux command', () => {
    it('contains ffmpeg invocation', () => {
      const result = compiler.compileMVHEVC(createComposition());
      expect(result.muxCommand).toContain('ffmpeg');
    });

    it('references left and right eye inputs', () => {
      const result = compiler.compileMVHEVC(createComposition());
      expect(result.muxCommand).toContain('left_eye.hevc');
      expect(result.muxCommand).toContain('right_eye.hevc');
    });

    it('sets stereo_mode=multiview_hevc metadata', () => {
      const result = compiler.compileMVHEVC(createComposition());
      expect(result.muxCommand).toContain('stereo_mode=multiview_hevc');
    });

    it('uses correct fps from config', () => {
      const result = compiler.compileMVHEVC(createComposition(), { fps: 60 });
      expect(result.muxCommand).toContain('-r 60');
    });
  });

  describe('composition trait extraction', () => {
    it('extracts @spatial_video trait params', () => {
      const comp = createComposition({
        objects: [
          {
            type: 'Object',
            name: 'VideoSurface',
            traits: [
              {
                name: 'spatial_video',
                config: {
                  ipd: 0.07,
                  fps: 60,
                  convergence: 3.0,
                  fov: 100,
                  quality: 'medium',
                },
              },
            ],
          },
        ],
      });
      const result = compiler.compileMVHEVC(comp);
      expect(result.config.ipd).toBe(0.07);
      expect(result.config.fps).toBe(60);
      expect(result.config.convergenceDistance).toBe(3.0);
      expect(result.config.fovDegrees).toBe(100);
      expect(result.config.quality).toBe('medium');
    });

    it('overrides take precedence over traits', () => {
      const comp = createComposition({
        objects: [
          {
            type: 'Object',
            name: 'VideoSurface',
            traits: [{ name: 'spatial_video', params: { fps: 60 } }],
          },
        ],
      });
      const result = compiler.compileMVHEVC(comp, { fps: 24 });
      expect(result.config.fps).toBe(24);
    });
  });
});
