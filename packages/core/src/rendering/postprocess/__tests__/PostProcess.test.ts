/**
 * PostProcess.test.ts
 *
 * Tests for the post-processing pipeline and effects
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  // Types
  PostProcessEffectType,
  ToneMapOperator,
  BlendMode,
  FXAAQuality,
  DEFAULT_PARAMS,
  UNIFORM_SIZES,
  getDefaultParams,
  mergeParams,
  validateParams,
  // Effects
  PostProcessEffect,
  BloomEffect,
  ToneMapEffect,
  FXAAEffect,
  VignetteEffect,
  FilmGrainEffect,
  SharpenEffect,
  ChromaticAberrationEffect,
  createEffect,
  // Shaders
  FULLSCREEN_VERTEX_SHADER,
  SHADER_UTILS,
  BLOOM_SHADER,
  TONEMAP_SHADER,
  FXAA_SHADER,
  VIGNETTE_SHADER,
  FILM_GRAIN_SHADER,
  SHARPEN_SHADER,
  CHROMATIC_ABERRATION_SHADER,
  DOF_SHADER,
  SSAO_SHADER,
  FOG_SHADER,
  MOTION_BLUR_SHADER,
  COLOR_GRADE_SHADER,
  BLIT_SHADER,
  buildEffectShader,
  // Pipeline
  PostProcessPipeline,
  DEFAULT_PIPELINE_CONFIG,
  createPostProcessPipeline,
  createHDRPipeline,
  createLDRPipeline,
} from '../index';

// ============================================================================
// Type Tests
// ============================================================================

describe('PostProcessTypes', () => {
  describe('Effect Type Constants', () => {
    it('should define all effect types', () => {
      const types: PostProcessEffectType[] = [
        'bloom',
        'tonemap',
        'dof',
        'motionBlur',
        'ssao',
        'fxaa',
        'sharpen',
        'vignette',
        'colorGrade',
        'filmGrain',
        'chromaticAberration',
        'fog',
        'custom',
      ];
      expect(types).toHaveLength(13);
    });

    it('should define tone map operators', () => {
      const operators: ToneMapOperator[] = [
        'none',
        'reinhard',
        'reinhardLum',
        'aces',
        'acesApprox',
        'filmic',
        'uncharted2',
        'uchimura',
        'lottes',
        'khronos',
      ];
      expect(operators).toHaveLength(10);
    });

    it('should define blend modes', () => {
      const modes: BlendMode[] = ['normal', 'add', 'multiply', 'screen', 'overlay'];
      expect(modes).toHaveLength(5);
    });

    it('should define FXAA quality levels', () => {
      const levels: FXAAQuality[] = ['low', 'medium', 'high', 'ultra'];
      expect(levels).toHaveLength(4);
    });
  });

  describe('DEFAULT_PARAMS', () => {
    it('should provide defaults for bloom', () => {
      const bloom = DEFAULT_PARAMS.bloom;
      expect(bloom.enabled).toBe(true);
      expect(bloom.intensity).toBe(1.0);
      expect(bloom.threshold).toBe(1.0);
      expect(bloom.softThreshold).toBe(0.5);
      expect(bloom.radius).toBe(4);
      expect(bloom.iterations).toBe(5);
    });

    it('should provide defaults for tonemap', () => {
      const tm = DEFAULT_PARAMS.tonemap;
      expect(tm.enabled).toBe(true);
      expect(tm.operator).toBe('aces');
      expect(tm.exposure).toBe(1.0);
      expect(tm.gamma).toBe(2.2);
    });

    it('should provide defaults for fxaa', () => {
      const fxaa = DEFAULT_PARAMS.fxaa;
      expect(fxaa.enabled).toBe(true);
      expect(fxaa.quality).toBe('high');
      expect(fxaa.edgeThreshold).toBeCloseTo(0.166);
    });

    it('should provide defaults for vignette', () => {
      const vig = DEFAULT_PARAMS.vignette;
      expect(vig.enabled).toBe(false);
      expect(vig.intensity).toBe(0.5);
      expect(vig.roundness).toBe(1.0);
      expect(vig.color).toEqual([0, 0, 0]);
    });

    it('should provide defaults for filmGrain', () => {
      const grain = DEFAULT_PARAMS.filmGrain;
      expect(grain.enabled).toBe(false);
      expect(grain.intensity).toBe(0.1);
      expect(grain.animated).toBe(true);
    });

    it('should provide defaults for all effect types', () => {
      const types = Object.keys(DEFAULT_PARAMS);
      expect(types).toContain('bloom');
      expect(types).toContain('tonemap');
      expect(types).toContain('dof');
      expect(types).toContain('motionBlur');
      expect(types).toContain('ssao');
      expect(types).toContain('fxaa');
      expect(types).toContain('sharpen');
      expect(types).toContain('vignette');
      expect(types).toContain('colorGrade');
      expect(types).toContain('filmGrain');
      expect(types).toContain('chromaticAberration');
      expect(types).toContain('fog');
    });
  });

  describe('UNIFORM_SIZES', () => {
    it('should define buffer sizes for effects', () => {
      expect(UNIFORM_SIZES.bloom).toBeGreaterThan(0);
      expect(UNIFORM_SIZES.tonemap).toBeGreaterThan(0);
      expect(UNIFORM_SIZES.fxaa).toBeGreaterThan(0);
      expect(UNIFORM_SIZES.vignette).toBeGreaterThan(0);
    });

    it('should use multiples of 16 (GPU alignment)', () => {
      for (const [, size] of Object.entries(UNIFORM_SIZES)) {
        expect(size % 16).toBe(0);
      }
    });
  });

  describe('getDefaultParams', () => {
    it('should return correct defaults for each type', () => {
      expect(getDefaultParams('bloom')).toEqual(DEFAULT_PARAMS.bloom);
      expect(getDefaultParams('tonemap')).toEqual(DEFAULT_PARAMS.tonemap);
      expect(getDefaultParams('fxaa')).toEqual(DEFAULT_PARAMS.fxaa);
    });
  });

  describe('mergeParams', () => {
    it('should merge partial params with defaults', () => {
      const merged = mergeParams('bloom', { intensity: 0.5 });
      expect(merged.intensity).toBe(0.5);
      expect(merged.threshold).toBe(DEFAULT_PARAMS.bloom.threshold);
    });

    it('should not modify original defaults', () => {
      const original = DEFAULT_PARAMS.bloom.intensity;
      mergeParams('bloom', { intensity: 999 });
      expect(DEFAULT_PARAMS.bloom.intensity).toBe(original);
    });
  });

  describe('validateParams', () => {
    it('should return valid for correct params', () => {
      expect(validateParams('bloom', DEFAULT_PARAMS.bloom).valid).toBe(true);
      expect(validateParams('tonemap', DEFAULT_PARAMS.tonemap).valid).toBe(true);
    });

    it('should return errors for null params', () => {
      const result = validateParams('bloom', null as unknown);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should return errors for undefined params', () => {
      const result = validateParams('bloom', undefined as unknown);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// Effect Tests
// ============================================================================

describe('PostProcessEffect', () => {
  describe('createEffect factory', () => {
    it('should create BloomEffect', () => {
      const effect = createEffect('bloom');
      expect(effect).toBeInstanceOf(BloomEffect);
      expect(effect.type).toBe('bloom');
    });

    it('should create ToneMapEffect', () => {
      const effect = createEffect('tonemap');
      expect(effect).toBeInstanceOf(ToneMapEffect);
      expect(effect.type).toBe('tonemap');
    });

    it('should create FXAAEffect', () => {
      const effect = createEffect('fxaa');
      expect(effect).toBeInstanceOf(FXAAEffect);
      expect(effect.type).toBe('fxaa');
    });

    it('should create VignetteEffect', () => {
      const effect = createEffect('vignette');
      expect(effect).toBeInstanceOf(VignetteEffect);
      expect(effect.type).toBe('vignette');
    });

    it('should create FilmGrainEffect', () => {
      const effect = createEffect('filmGrain');
      expect(effect).toBeInstanceOf(FilmGrainEffect);
      expect(effect.type).toBe('filmGrain');
    });

    it('should create SharpenEffect', () => {
      const effect = createEffect('sharpen');
      expect(effect).toBeInstanceOf(SharpenEffect);
      expect(effect.type).toBe('sharpen');
    });

    it('should create ChromaticAberrationEffect', () => {
      const effect = createEffect('chromaticAberration');
      expect(effect).toBeInstanceOf(ChromaticAberrationEffect);
      expect(effect.type).toBe('chromaticAberration');
    });

    it('should accept custom params', () => {
      const effect = createEffect('bloom', { intensity: 0.7 });
      expect(effect.getParams().intensity).toBe(0.7);
    });
  });

  describe('BloomEffect', () => {
    let effect: BloomEffect;

    beforeEach(() => {
      effect = new BloomEffect();
    });

    afterEach(() => {
      effect.dispose();
    });

    it('should have correct default params', () => {
      const params = effect.getParams();
      expect(params.threshold).toBe(1.0);
      expect(params.iterations).toBe(5);
    });

    it('should update params', () => {
      effect.setParams({ intensity: 0.5, threshold: 0.8 });
      const params = effect.getParams();
      expect(params.intensity).toBe(0.5);
      expect(params.threshold).toBe(0.8);
    });

    it('should be enabled by default', () => {
      expect(effect.enabled).toBe(true);
    });

    it('should toggle enabled state', () => {
      effect.enabled = false;
      expect(effect.enabled).toBe(false);
    });

    it('should have unique name', () => {
      expect(effect.name.toLowerCase()).toContain('bloom');
    });
  });

  describe('ToneMapEffect', () => {
    let effect: ToneMapEffect;

    beforeEach(() => {
      effect = new ToneMapEffect();
    });

    afterEach(() => {
      effect.dispose();
    });

    it('should default to ACES operator', () => {
      expect(effect.getParams().operator).toBe('aces');
    });

    it('should accept different operators', () => {
      effect.setParams({ operator: 'reinhard' });
      expect(effect.getParams().operator).toBe('reinhard');
    });

    it('should have exposure parameter', () => {
      expect(effect.getParams().exposure).toBe(1.0);
      effect.setParams({ exposure: 2.0 });
      expect(effect.getParams().exposure).toBe(2.0);
    });
  });

  describe('FXAAEffect', () => {
    let effect: FXAAEffect;

    beforeEach(() => {
      effect = new FXAAEffect();
    });

    afterEach(() => {
      effect.dispose();
    });

    it('should default to high quality', () => {
      expect(effect.getParams().quality).toBe('high');
    });

    it('should have edge thresholds', () => {
      const params = effect.getParams();
      expect(params.edgeThreshold).toBeGreaterThan(0);
      expect(params.edgeThresholdMin).toBeGreaterThan(0);
    });
  });

  describe('Effect lifecycle', () => {
    it('should not be initialized before initialize()', () => {
      const effect = new BloomEffect();
      expect(effect.initialized).toBe(false);
      effect.dispose();
    });

    it('should clean up on dispose', () => {
      const effect = new BloomEffect();
      effect.dispose();
      expect(effect.initialized).toBe(false);
    });
  });
});

// ============================================================================
// Shader Tests
// ============================================================================

describe('PostProcessShaders', () => {
  describe('FULLSCREEN_VERTEX_SHADER', () => {
    it('should be valid WGSL', () => {
      expect(FULLSCREEN_VERTEX_SHADER).toContain('@vertex');
      expect(FULLSCREEN_VERTEX_SHADER).toContain('fn vs_main');
    });

    it('should generate fullscreen triangle', () => {
      expect(FULLSCREEN_VERTEX_SHADER).toContain('vertex_index');
    });
  });

  describe('SHADER_UTILS', () => {
    it('should contain luminance function', () => {
      expect(SHADER_UTILS).toContain('luminance');
    });

    it('should contain sRGB conversion', () => {
      expect(SHADER_UTILS).toContain('sRGB');
    });
  });

  describe('Effect Shaders', () => {
    it('should have BLOOM_SHADER', () => {
      expect(BLOOM_SHADER).toContain('@fragment');
      expect(BLOOM_SHADER).toContain('threshold');
    });

    it('should have TONEMAP_SHADER with multiple operators', () => {
      expect(TONEMAP_SHADER).toContain('@fragment');
      expect(TONEMAP_SHADER.toLowerCase()).toContain('reinhard');
      expect(TONEMAP_SHADER.toLowerCase()).toContain('aces');
    });

    it('should have FXAA_SHADER', () => {
      expect(FXAA_SHADER).toContain('@fragment');
      expect(FXAA_SHADER).toContain('edge');
    });

    it('should have VIGNETTE_SHADER', () => {
      expect(VIGNETTE_SHADER).toContain('@fragment');
      expect(VIGNETTE_SHADER).toContain('vignette');
    });

    it('should have FILM_GRAIN_SHADER', () => {
      expect(FILM_GRAIN_SHADER).toContain('@fragment');
      expect(FILM_GRAIN_SHADER).toContain('grain');
    });

    it('should have SHARPEN_SHADER', () => {
      expect(SHARPEN_SHADER).toContain('@fragment');
    });

    it('should have CHROMATIC_ABERRATION_SHADER', () => {
      expect(CHROMATIC_ABERRATION_SHADER).toContain('@fragment');
    });

    it('should have COLOR_GRADE_SHADER', () => {
      expect(COLOR_GRADE_SHADER).toContain('@fragment');
    });

    it('should have BLIT_SHADER', () => {
      expect(BLIT_SHADER).toContain('@fragment');
    });
  });

  describe('buildEffectShader', () => {
    it('should combine vertex and fragment shaders', () => {
      const shader = buildEffectShader(BLOOM_SHADER);
      expect(shader).toContain('@vertex');
      expect(shader).toContain('@fragment');
    });

    it('should include utilities', () => {
      const shader = buildEffectShader(TONEMAP_SHADER);
      expect(shader).toContain('luminance');
    });
  });

  describe('Tone Mapping Operators', () => {
    const operators = [
      'reinhard',
      'reinhardLum',
      'aces',
      'acesApprox',
      'filmic',
      'uncharted2',
      'uchimura',
      'lottes',
      'khronos',
    ];

    for (const op of operators) {
      it(`should implement ${op} operator`, () => {
        expect(TONEMAP_SHADER.toLowerCase()).toContain(op.toLowerCase());
      });
    }
  });
});

// ============================================================================
// Pipeline Tests
// ============================================================================

describe('PostProcessPipeline', () => {
  describe('Construction', () => {
    it('should create with default config', () => {
      const pipeline = new PostProcessPipeline();
      const config = pipeline.getConfig();
      expect(config.hdrEnabled).toBe(true);
      expect(config.effects).toEqual([]);
    });

    it('should accept custom config', () => {
      const pipeline = new PostProcessPipeline({
        hdrEnabled: false,
        msaaSamples: 4,
      });
      const config = pipeline.getConfig();
      expect(config.hdrEnabled).toBe(false);
      expect(config.msaaSamples).toBe(4);
    });

    it('should not be initialized on construction', () => {
      const pipeline = new PostProcessPipeline();
      expect(pipeline.initialized).toBe(false);
    });
  });

  describe('DEFAULT_PIPELINE_CONFIG', () => {
    it('should have sensible defaults', () => {
      expect(DEFAULT_PIPELINE_CONFIG.hdrEnabled).toBe(true);
      expect(DEFAULT_PIPELINE_CONFIG.hdrFormat).toBe('rgba16float');
      expect(DEFAULT_PIPELINE_CONFIG.ldrFormat).toBe('rgba8unorm');
      expect(DEFAULT_PIPELINE_CONFIG.autoResize).toBe(true);
    });
  });

  describe('Presets', () => {
    it('should create minimal preset', () => {
      const config = PostProcessPipeline.createPreset('minimal');
      expect(config.hdrEnabled).toBe(false);
      expect(config.effects).toHaveLength(1);
      expect(config.effects![0].type).toBe('fxaa');
    });

    it('should create standard preset', () => {
      const config = PostProcessPipeline.createPreset('standard');
      expect(config.hdrEnabled).toBe(true);
      expect(config.effects!.length).toBeGreaterThanOrEqual(3);
    });

    it('should create cinematic preset', () => {
      const config = PostProcessPipeline.createPreset('cinematic');
      expect(config.effects!.length).toBeGreaterThanOrEqual(4);
      const types = config.effects!.map((e) => e.type);
      expect(types).toContain('bloom');
      expect(types).toContain('vignette');
      expect(types).toContain('filmGrain');
    });

    it('should create performance preset', () => {
      const config = PostProcessPipeline.createPreset('performance');
      expect(config.hdrEnabled).toBe(false);
      expect(config.msaaSamples).toBe(1);
    });
  });

  describe('Factory Functions', () => {
    it('should create pipeline with createPostProcessPipeline', () => {
      const pipeline = createPostProcessPipeline('standard');
      expect(pipeline).toBeInstanceOf(PostProcessPipeline);
      expect(pipeline.getConfig().hdrEnabled).toBe(true);
    });

    it('should create HDR pipeline with createHDRPipeline', () => {
      const pipeline = createHDRPipeline();
      expect(pipeline.getConfig().hdrEnabled).toBe(true);
    });

    it('should create LDR pipeline with createLDRPipeline', () => {
      const pipeline = createLDRPipeline();
      expect(pipeline.getConfig().hdrEnabled).toBe(false);
    });
  });

  describe('Effect Management (without GPU)', () => {
    let pipeline: PostProcessPipeline;

    beforeEach(() => {
      pipeline = new PostProcessPipeline();
    });

    afterEach(() => {
      pipeline.dispose();
    });

    it('should start with no effects', () => {
      expect(pipeline.getEffects()).toHaveLength(0);
    });

    it('should report stats', () => {
      const stats = pipeline.getStats();
      expect(stats.effectCount).toBe(0);
      expect(stats.enabledEffects).toBe(0);
    });
  });

  describe('Disposal', () => {
    it('should clean up on dispose', () => {
      const pipeline = new PostProcessPipeline();
      pipeline.dispose();
      expect(pipeline.initialized).toBe(false);
      expect(pipeline.getEffects()).toHaveLength(0);
    });

    it('should be safe to dispose multiple times', () => {
      const pipeline = new PostProcessPipeline();
      pipeline.dispose();
      pipeline.dispose();
      expect(pipeline.initialized).toBe(false);
    });
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('Post-Processing Integration', () => {
  it('should support full effect chain configuration', () => {
    const pipeline = new PostProcessPipeline({
      hdrEnabled: true,
      effects: [
        { type: 'bloom', params: { intensity: 0.8, threshold: 0.9 } },
        { type: 'tonemap', params: { operator: 'aces', exposure: 1.1 } },
        { type: 'vignette', params: { intensity: 0.2 } },
        { type: 'fxaa', params: { quality: 'ultra' } },
      ],
    });

    expect(pipeline.getConfig().effects).toHaveLength(4);
    pipeline.dispose();
  });

  it('should create effects with factory and use in pipeline config', () => {
    const bloom = createEffect('bloom', { intensity: 0.5 });
    const tonemap = createEffect('tonemap', { operator: 'reinhard' });

    expect(bloom.type).toBe('bloom');
    expect(tonemap.type).toBe('tonemap');
    expect(bloom.getParams().intensity).toBe(0.5);
    expect(tonemap.getParams().operator).toBe('reinhard');

    bloom.dispose();
    tonemap.dispose();
  });

  it('should build complete shader from effect code', () => {
    const complete = buildEffectShader(BLOOM_SHADER);

    // Should have vertex shader
    expect(complete).toContain('@vertex');
    expect(complete).toContain('vs_main');

    // Should have fragment shader
    expect(complete).toContain('@fragment');

    // Should have utilities
    expect(complete).toContain('luminance');
  });
});

// ============================================================================
// Edge Case Tests
// ============================================================================

describe('Edge Cases', () => {
  describe('Param Validation', () => {
    it('should handle empty params object', () => {
      const merged = mergeParams('bloom', {});
      expect(merged).toEqual(DEFAULT_PARAMS.bloom);
    });

    it('should handle unknown effect type gracefully', () => {
      expect(() => createEffect('unknown' as PostProcessEffectType)).toThrowError();
    });
  });

  describe('Effect State', () => {
    it('should preserve enabled state through param updates', () => {
      const effect = new BloomEffect({ intensity: 1.0 });
      effect.enabled = false;
      effect.setParams({ intensity: 0.5 });
      expect(effect.enabled).toBe(false);
      effect.dispose();
    });
  });

  describe('Pipeline Edge Cases', () => {
    it('should handle empty effects array', () => {
      const pipeline = new PostProcessPipeline({ effects: [] });
      expect(pipeline.getConfig().effects).toEqual([]);
      pipeline.dispose();
    });

    it('should handle undefined config', () => {
      const pipeline = new PostProcessPipeline(undefined);
      expect(pipeline.getConfig()).toBeDefined();
      pipeline.dispose();
    });
  });
});
