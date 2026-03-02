/**
 * Tests for PostFX Module (packages/core/src/postfx)
 *
 * Covers:
 * - Default configuration constants
 * - createPostFXPipeline factory
 * - mergeEffectConfig utility
 */

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_BLOOM_CONFIG,
  DEFAULT_COLOR_GRADING_CONFIG,
  DEFAULT_VIGNETTE_CONFIG,
  DEFAULT_POSTFX_PIPELINE,
  createPostFXPipeline,
  mergeEffectConfig,
} from './index';

describe('PostFX Default Configs', () => {
  it('has bloom defaults', () => {
    expect(DEFAULT_BLOOM_CONFIG.enabled).toBe(false);
    expect(DEFAULT_BLOOM_CONFIG.order).toBe(1);
    expect(DEFAULT_BLOOM_CONFIG.params.intensity).toBe(0.5);
    expect(DEFAULT_BLOOM_CONFIG.params.threshold).toBe(0.8);
  });

  it('has color grading defaults', () => {
    expect(DEFAULT_COLOR_GRADING_CONFIG.order).toBe(2);
    expect(DEFAULT_COLOR_GRADING_CONFIG.params.saturation).toBe(0);
    expect(DEFAULT_COLOR_GRADING_CONFIG.params.brightness).toBe(0);
  });

  it('has vignette defaults', () => {
    expect(DEFAULT_VIGNETTE_CONFIG.order).toBe(3);
    expect(DEFAULT_VIGNETTE_CONFIG.params.intensity).toBe(0.3);
  });

  it('has default pipeline', () => {
    expect(DEFAULT_POSTFX_PIPELINE.name).toBe('default');
    expect(DEFAULT_POSTFX_PIPELINE.enabled).toBe(true);
    expect(DEFAULT_POSTFX_PIPELINE.effects.bloom).toBeDefined();
    expect(DEFAULT_POSTFX_PIPELINE.effects.colorGrading).toBeDefined();
    expect(DEFAULT_POSTFX_PIPELINE.effects.vignette).toBeDefined();
  });
});

describe('createPostFXPipeline', () => {
  it('creates pipeline with defaults', () => {
    const pipeline = createPostFXPipeline({});
    expect(pipeline.name).toBe('default');
    expect(pipeline.enabled).toBe(true);
    expect(pipeline.effects.bloom).toBeDefined();
  });

  it('overrides name', () => {
    const pipeline = createPostFXPipeline({ name: 'custom' });
    expect(pipeline.name).toBe('custom');
  });

  it('overrides enabled', () => {
    const pipeline = createPostFXPipeline({ enabled: false });
    expect(pipeline.enabled).toBe(false);
  });

  it('merges effects with defaults', () => {
    const customBloom = {
      ...DEFAULT_BLOOM_CONFIG,
      enabled: true,
      params: { intensity: 0.9, threshold: 0.5, radius: 0.6 },
    };
    const pipeline = createPostFXPipeline({
      effects: { bloom: customBloom },
    });
    expect(pipeline.effects.bloom!.enabled).toBe(true);
    expect(pipeline.effects.bloom!.params.intensity).toBe(0.9);
    // Vignette should still have defaults
    expect(pipeline.effects.vignette).toBeDefined();
  });
});

describe('mergeEffectConfig', () => {
  it('merges params with base', () => {
    const merged = mergeEffectConfig(DEFAULT_BLOOM_CONFIG, {
      enabled: true,
      params: { intensity: 1.0 },
    } as any);
    expect(merged.enabled).toBe(true);
    expect(merged.params.intensity).toBe(1.0);
    // Base values preserved for unspecified params
    expect(merged.params.threshold).toBe(0.8);
    expect(merged.params.radius).toBe(0.4);
  });

  it('preserves base when override is empty', () => {
    const merged = mergeEffectConfig(DEFAULT_BLOOM_CONFIG, {});
    expect(merged.params.intensity).toBe(0.5);
  });
});
