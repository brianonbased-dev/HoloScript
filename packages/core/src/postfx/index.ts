/**
 * Post-Processing Effects Module (v3.3)
 *
 * Screen-space effects for HoloScript rendering pipeline.
 * @module postfx
 */

// =============================================================================
// Post-Processing Effect Types
// =============================================================================

/**
 * Post-processing effect configuration
 */
export interface PostFXConfig {
  /** Whether post-processing is enabled */
  enabled: boolean;
  /** Effect chain order */
  order: number;
  /** Effect-specific parameters */
  params: Record<string, unknown>;
}

/**
 * Bloom effect configuration
 */
export interface BloomConfig extends PostFXConfig {
  params: {
    /** Bloom intensity (0-1) */
    intensity: number;
    /** Bloom threshold */
    threshold: number;
    /** Bloom radius */
    radius: number;
  };
}

/**
 * Color grading configuration
 */
export interface ColorGradingConfig extends PostFXConfig {
  params: {
    /** Saturation adjustment (-1 to 1) */
    saturation: number;
    /** Contrast adjustment (-1 to 1) */
    contrast: number;
    /** Brightness adjustment (-1 to 1) */
    brightness: number;
    /** Color temperature adjustment */
    temperature: number;
    /** Tint adjustment */
    tint: number;
  };
}

/**
 * Vignette configuration
 */
export interface VignetteConfig extends PostFXConfig {
  params: {
    /** Vignette intensity (0-1) */
    intensity: number;
    /** Vignette smoothness */
    smoothness: number;
    /** Vignette roundness (0-1) */
    roundness: number;
  };
}

/**
 * Depth of field configuration
 */
export interface DepthOfFieldConfig extends PostFXConfig {
  params: {
    /** Focus distance */
    focusDistance: number;
    /** Aperture size */
    aperture: number;
    /** Focal length */
    focalLength: number;
    /** Bokeh shape */
    bokehShape: 'circle' | 'hexagon' | 'octagon';
  };
}

/**
 * Motion blur configuration
 */
export interface MotionBlurConfig extends PostFXConfig {
  params: {
    /** Motion blur intensity (0-1) */
    intensity: number;
    /** Sample count */
    samples: number;
  };
}

/**
 * Screen-space ambient occlusion configuration
 */
export interface SSAOConfig extends PostFXConfig {
  params: {
    /** SSAO intensity (0-1) */
    intensity: number;
    /** Sample radius */
    radius: number;
    /** Bias */
    bias: number;
  };
}

/**
 * Anti-aliasing configuration
 */
export interface AntiAliasingConfig extends PostFXConfig {
  params: {
    /** Anti-aliasing method */
    method: 'FXAA' | 'SMAA' | 'TAA' | 'MSAA';
    /** Quality level */
    quality: 'low' | 'medium' | 'high' | 'ultra';
  };
}

// =============================================================================
// Post-Processing Pipeline Types
// =============================================================================

/**
 * Post-processing pipeline configuration
 */
export interface PostFXPipeline {
  /** Pipeline name */
  name: string;
  /** Whether pipeline is enabled */
  enabled: boolean;
  /** Effect configurations */
  effects: {
    bloom?: BloomConfig;
    colorGrading?: ColorGradingConfig;
    vignette?: VignetteConfig;
    depthOfField?: DepthOfFieldConfig;
    motionBlur?: MotionBlurConfig;
    ssao?: SSAOConfig;
    antiAliasing?: AntiAliasingConfig;
  };
}

/**
 * Post-processing render target
 */
export interface PostFXRenderTarget {
  /** Target width */
  width: number;
  /** Target height */
  height: number;
  /** Pixel format */
  format: 'RGBA8' | 'RGBA16F' | 'RGBA32F';
  /** Depth buffer enabled */
  depth: boolean;
  /** Stencil buffer enabled */
  stencil: boolean;
}

// =============================================================================
// Default Configurations
// =============================================================================

/**
 * Default bloom configuration
 */
export const DEFAULT_BLOOM_CONFIG: BloomConfig = {
  enabled: false,
  order: 1,
  params: {
    intensity: 0.5,
    threshold: 0.8,
    radius: 0.4,
  },
};

/**
 * Default color grading configuration
 */
export const DEFAULT_COLOR_GRADING_CONFIG: ColorGradingConfig = {
  enabled: false,
  order: 2,
  params: {
    saturation: 0,
    contrast: 0,
    brightness: 0,
    temperature: 0,
    tint: 0,
  },
};

/**
 * Default vignette configuration
 */
export const DEFAULT_VIGNETTE_CONFIG: VignetteConfig = {
  enabled: false,
  order: 3,
  params: {
    intensity: 0.3,
    smoothness: 0.5,
    roundness: 1.0,
  },
};

/**
 * Default post-processing pipeline
 */
export const DEFAULT_POSTFX_PIPELINE: PostFXPipeline = {
  name: 'default',
  enabled: true,
  effects: {
    bloom: DEFAULT_BLOOM_CONFIG,
    colorGrading: DEFAULT_COLOR_GRADING_CONFIG,
    vignette: DEFAULT_VIGNETTE_CONFIG,
  },
};

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Create a post-processing pipeline from partial config
 */
export function createPostFXPipeline(config: Partial<PostFXPipeline>): PostFXPipeline {
  return {
    ...DEFAULT_POSTFX_PIPELINE,
    ...config,
    effects: {
      ...DEFAULT_POSTFX_PIPELINE.effects,
      ...config.effects,
    },
  };
}

/**
 * Merge effect configurations
 */
export function mergeEffectConfig<T extends PostFXConfig>(base: T, override: Partial<T>): T {
  return {
    ...base,
    ...override,
    params: {
      ...base.params,
      ...(override.params || {}),
    },
  };
}
