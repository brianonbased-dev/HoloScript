import { describe, it, expect } from 'vitest';
import {
  DEFAULT_BLOOM_CONFIG,
  DEFAULT_COLOR_GRADING_CONFIG,
  DEFAULT_VIGNETTE_CONFIG,
  DEFAULT_POSTFX_PIPELINE,
  createPostFXPipeline,
  mergeEffectConfig,
} from '../postfx/index';
import type { BloomConfig, PostFXPipeline } from '../postfx/index';

// =============================================================================
// C209 — PostFX Pipeline
// =============================================================================

describe('PostFX Defaults', () => {
  it('DEFAULT_BLOOM_CONFIG has correct structure', () => {
    expect(DEFAULT_BLOOM_CONFIG.enabled).toBe(false);
    expect(DEFAULT_BLOOM_CONFIG.order).toBe(1);
    expect(DEFAULT_BLOOM_CONFIG.params.intensity).toBe(0.5);
    expect(DEFAULT_BLOOM_CONFIG.params.threshold).toBe(0.8);
    expect(DEFAULT_BLOOM_CONFIG.params.radius).toBe(0.4);
  });

  it('DEFAULT_COLOR_GRADING_CONFIG has zero adjustments', () => {
    const cg = DEFAULT_COLOR_GRADING_CONFIG;
    expect(cg.enabled).toBe(false);
    expect(cg.params.saturation).toBe(0);
    expect(cg.params.contrast).toBe(0);
    expect(cg.params.brightness).toBe(0);
    expect(cg.params.temperature).toBe(0);
    expect(cg.params.tint).toBe(0);
  });

  it('DEFAULT_VIGNETTE_CONFIG has sensible defaults', () => {
    const v = DEFAULT_VIGNETTE_CONFIG;
    expect(v.enabled).toBe(false);
    expect(v.params.intensity).toBe(0.3);
    expect(v.params.smoothness).toBe(0.5);
    expect(v.params.roundness).toBe(1.0);
  });

  it('DEFAULT_POSTFX_PIPELINE includes bloom, colorGrading, vignette', () => {
    const p = DEFAULT_POSTFX_PIPELINE;
    expect(p.name).toBe('default');
    expect(p.enabled).toBe(true);
    expect(p.effects.bloom).toBeDefined();
    expect(p.effects.colorGrading).toBeDefined();
    expect(p.effects.vignette).toBeDefined();
  });
});

describe('createPostFXPipeline', () => {
  it('returns default pipeline when called with empty config', () => {
    const p = createPostFXPipeline({});
    expect(p.name).toBe('default');
    expect(p.enabled).toBe(true);
    expect(p.effects.bloom).toBeDefined();
  });

  it('overrides name and enabled', () => {
    const p = createPostFXPipeline({ name: 'custom', enabled: false });
    expect(p.name).toBe('custom');
    expect(p.enabled).toBe(false);
  });

  it('merges effects with defaults', () => {
    const customBloom: BloomConfig = {
      enabled: true,
      order: 1,
      params: { intensity: 0.9, threshold: 0.5, radius: 0.8 },
    };
    const p = createPostFXPipeline({ effects: { bloom: customBloom } });
    // bloom should be overridden
    expect(p.effects.bloom!.params.intensity).toBe(0.9);
    // vignette should still exist from defaults
    expect(p.effects.vignette).toBeDefined();
  });

  it('preserves all default effects when none provided', () => {
    const p = createPostFXPipeline({ name: 'test' });
    expect(p.effects.bloom).toEqual(DEFAULT_BLOOM_CONFIG);
    expect(p.effects.colorGrading).toEqual(DEFAULT_COLOR_GRADING_CONFIG);
    expect(p.effects.vignette).toEqual(DEFAULT_VIGNETTE_CONFIG);
  });
});

describe('mergeEffectConfig', () => {
  it('merges params preserving base values', () => {
    const base: BloomConfig = {
      enabled: false,
      order: 1,
      params: { intensity: 0.5, threshold: 0.8, radius: 0.4 },
    };
    const merged = mergeEffectConfig(base, {
      enabled: true,
      params: { intensity: 1.0 } as any,
    });
    expect(merged.enabled).toBe(true);
    expect(merged.params.intensity).toBe(1.0);
    expect(merged.params.threshold).toBe(0.8); // preserved from base
    expect(merged.params.radius).toBe(0.4); // preserved from base
  });

  it('returns base when override is empty', () => {
    const base: BloomConfig = {
      enabled: true,
      order: 1,
      params: { intensity: 0.5, threshold: 0.8, radius: 0.4 },
    };
    const merged = mergeEffectConfig(base, {});
    expect(merged).toEqual(base);
  });

  it('does not mutate original base config', () => {
    const base: BloomConfig = {
      enabled: false,
      order: 1,
      params: { intensity: 0.5, threshold: 0.8, radius: 0.4 },
    };
    const baseOriginal = { ...base, params: { ...base.params } };
    mergeEffectConfig(base, { enabled: true, params: { intensity: 1.0 } as any });
    expect(base.enabled).toBe(baseOriginal.enabled);
    expect(base.params.intensity).toBe(baseOriginal.params.intensity);
  });
});
