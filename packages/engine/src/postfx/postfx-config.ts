/**
 * postfx-config.ts
 *
 * Lightweight PostFX pipeline configuration helpers.
 * These operate on plain config objects — no GPU device required.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EffectConfigBase {
  enabled?: boolean;
  order?: number;
  params: Record<string, unknown>;
}

export interface BloomParams {
  intensity: number;
  threshold: number;
  radius: number;
  iterations?: number;
  [key: string]: unknown;
}

export interface ColorGradingParams {
  exposure: number;
  contrast: number;
  saturation: number;
  [key: string]: unknown;
}

export interface VignetteParams {
  intensity: number;
  smoothness: number;
  roundness?: number;
  [key: string]: unknown;
}

export interface BloomConfig extends EffectConfigBase {
  enabled: boolean;
  order: number;
  params: BloomParams;
}

export interface ColorGradingConfig extends EffectConfigBase {
  enabled: boolean;
  order: number;
  params: ColorGradingParams;
}

export interface VignetteConfig extends EffectConfigBase {
  enabled: boolean;
  order: number;
  params: VignetteParams;
}

export interface PostFXEffects {
  bloom?: BloomConfig;
  colorGrading?: ColorGradingConfig;
  vignette?: VignetteConfig;
}

export interface PostFXPipelineConfig {
  name: string;
  enabled: boolean;
  effects: PostFXEffects;
}

// ---------------------------------------------------------------------------
// Default configs
// ---------------------------------------------------------------------------

export const DEFAULT_BLOOM_CONFIG: BloomConfig = {
  enabled: false,
  order: 1,
  params: {
    intensity: 0.5,
    threshold: 0.8,
    radius: 0.4,
    iterations: 8,
  },
};

export const DEFAULT_COLOR_GRADING_CONFIG: ColorGradingConfig = {
  enabled: false,
  order: 2,
  params: {
    exposure: 1.0,
    contrast: 0,
    saturation: 0,
    brightness: 0,
    temperature: 0,
    tint: 0,
  },
};

export const DEFAULT_VIGNETTE_CONFIG: VignetteConfig = {
  enabled: false,
  order: 3,
  params: {
    intensity: 0.3,
    smoothness: 0.5,
    roundness: 1.0,
  },
};

export const DEFAULT_POSTFX_PIPELINE: PostFXPipelineConfig = {
  name: 'default',
  enabled: true,
  effects: {
    bloom: DEFAULT_BLOOM_CONFIG,
    colorGrading: DEFAULT_COLOR_GRADING_CONFIG,
    vignette: DEFAULT_VIGNETTE_CONFIG,
  },
};

// ---------------------------------------------------------------------------
// createPostFXPipeline
// ---------------------------------------------------------------------------

export function createPostFXPipeline(
  options: Partial<Omit<PostFXPipelineConfig, 'effects'>> & {
    effects?: Partial<PostFXEffects>;
  }
): PostFXPipelineConfig {
  const name = options.name ?? 'default';
  const enabled = options.enabled !== undefined ? options.enabled : true;

  const effects = {
    bloom: mergeEffectConfig(DEFAULT_BLOOM_CONFIG, options.effects?.bloom ?? {}),
    colorGrading: mergeEffectConfig(DEFAULT_COLOR_GRADING_CONFIG, options.effects?.colorGrading ?? {}),
    vignette: mergeEffectConfig(DEFAULT_VIGNETTE_CONFIG, options.effects?.vignette ?? {}),
  } as PostFXEffects & Record<string, unknown>;

  // Preserve custom effect blocks (e.g., ssao) beyond the built-ins.
  if (options.effects) {
    const source = options.effects as Record<string, unknown>;
    for (const key of Object.keys(source)) {
      if (!(key in effects)) {
        effects[key] = source[key];
      }
    }
  }

  return { name, enabled, effects: effects as PostFXEffects };
}

// ---------------------------------------------------------------------------
// mergeEffectConfig
// ---------------------------------------------------------------------------

export function mergeEffectConfig<T extends EffectConfigBase>(
  base: T,
  override: Partial<T>
): T {
  const merged = { ...base, ...override } as T;
  if (override.params !== undefined) {
    merged.params = { ...base.params, ...override.params } as T['params'];
  }
  return merged;
}
