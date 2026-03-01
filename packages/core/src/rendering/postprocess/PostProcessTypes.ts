/**
 * PostProcessTypes.ts
 *
 * Type definitions for HoloScript post-processing system.
 * Supports WebGPU-based effects pipeline with HDR and LDR processing.
 *
 * @module render/postprocess
 */

/**
 * Supported post-process effect types
 */
export type PostProcessEffectType =
  | 'bloom'
  | 'tonemap'
  | 'dof'
  | 'motionBlur'
  | 'ssao'
  | 'fxaa'
  | 'sharpen'
  | 'vignette'
  | 'colorGrade'
  | 'filmGrain'
  | 'chromaticAberration'
  | 'fog'
  | 'caustics'
  | 'ssr'
  | 'ssgi'
  | 'custom';

/**
 * Tone mapping operators
 */
export type ToneMapOperator =
  | 'none'
  | 'reinhard'
  | 'reinhardLum'
  | 'aces'
  | 'acesApprox'
  | 'filmic'
  | 'uncharted2'
  | 'uchimura'
  | 'lottes'
  | 'khronos';

/**
 * Blend modes for effect compositing
 */
export type BlendMode = 'normal' | 'add' | 'multiply' | 'screen' | 'overlay' | 'softLight';

/**
 * Base effect parameters interface
 */
export interface IEffectParams {
  enabled: boolean;
  intensity: number;
  blendMode?: BlendMode;
}

/**
 * Bloom effect parameters
 */
export interface IBloomParams extends IEffectParams {
  threshold: number;
  softThreshold: number;
  radius: number;
  iterations: number;
  anamorphic: number;
  highQuality: boolean;
}

/**
 * Tone mapping parameters
 */
export interface IToneMapParams extends IEffectParams {
  operator: ToneMapOperator;
  exposure: number;
  gamma: number;
  whitePoint: number;
  contrast: number;
  saturation: number;
}

/**
 * Depth of Field parameters
 */
export interface IDepthOfFieldParams extends IEffectParams {
  focusDistance: number;
  focalLength: number;
  aperture: number;
  maxBlur: number;
  bokehShape: 'circle' | 'hexagon' | 'octagon';
  bokehQuality: 'low' | 'medium' | 'high';
  nearBlur: boolean;
}

/**
 * Motion blur parameters
 */
export interface IMotionBlurParams extends IEffectParams {
  samples: number;
  velocityScale: number;
  maxVelocity: number;
}

/**
 * SSAO parameters
 */
export interface ISSAOParams extends IEffectParams {
  radius: number;
  bias: number;
  samples: number;
  power: number;
  falloff: number;
  /** 'hemisphere' = random hemisphere, 'hbao' = horizon-based 8-dir × 4-step */
  mode?: 'hemisphere' | 'hbao';
  /** Output bent normal direction (least-occluded direction) */
  bentNormals?: boolean;
  /** 5×5 cross-bilateral spatial denoise weighted by depth + normal */
  spatialDenoise?: boolean;
}

/**
 * Anti-aliasing (FXAA) parameters
 */
export interface IFXAAParams extends IEffectParams {
  quality: 'low' | 'medium' | 'high' | 'ultra';
  edgeThreshold: number;
  edgeThresholdMin: number;
}

/**
 * Sharpen parameters
 */
export interface ISharpenParams extends IEffectParams {
  amount: number;
  threshold: number;
}

/**
 * Vignette parameters
 */
export interface IVignetteParams extends IEffectParams {
  roundness: number;
  smoothness: number;
  color: [number, number, number];
}

/**
 * Color grading parameters
 */
export interface IColorGradeParams extends IEffectParams {
  shadows: [number, number, number];
  midtones: [number, number, number];
  highlights: [number, number, number];
  shadowsOffset: number;
  highlightsOffset: number;
  hueShift: number;
  temperature: number;
  tint: number;
  lutTexture?: string;
  lutIntensity: number;
}

/**
 * Film grain parameters
 */
export interface IFilmGrainParams extends IEffectParams {
  size: number;
  luminanceContribution: number;
  animated: boolean;
}

/**
 * Chromatic aberration parameters
 */
export interface IChromaticAberrationParams extends IEffectParams {
  redOffset: [number, number];
  greenOffset: [number, number];
  blueOffset: [number, number];
  radial: boolean;
}

/**
 * Fog parameters
 */
export interface IFogParams extends IEffectParams {
  color: [number, number, number];
  density: number;
  start: number;
  end: number;
  height: number;
  heightFalloff: number;
  mode: 'linear' | 'exponential' | 'exponentialSquared';
}

/**
 * Caustics overlay parameters
 */
export interface ICausticsParams extends IEffectParams {
  scale: number;
  speed: number;
  color: [number, number, number];
  depthFade: number;
  waterLevel: number;
  /** RGB IoR separation for prismatic chromatic dispersion */
  dispersion?: number;
  /** Turbulence-driven foam overlay intensity */
  foamIntensity?: number;
  /** Darken terrain where caustics are absent */
  shadowStrength?: number;
}

/**
 * Screen-Space Reflections (SSR) parameters
 */
export interface ISSRParams extends IEffectParams {
  maxSteps: number;
  stepSize: number;
  thickness: number;
  roughnessFade: number;
  edgeFade: number;
  /** Golden-angle blur at hit point scaled by roughness (0 = sharp) */
  roughnessBlur?: number;
  /** Schlick Fresnel weighting strength (0 = uniform, 1 = physically correct) */
  fresnelStrength?: number;
}

/**
 * Screen-Space Global Illumination (SSGI) parameters
 */
export interface ISSGIParams extends IEffectParams {
  radius: number;
  samples: number;
  bounceIntensity: number;
  falloff: number;
  /** Blend with previous frame using motion vectors (0 = off, 1 = full) */
  temporalBlend?: number;
  /** 3×3 edge-stopping cross-bilateral spatial denoise */
  spatialDenoise?: boolean;
  /** Multi-bounce approximation multiplier */
  multiBounce?: number;
}

/**
 * Custom shader effect parameters
 */
export interface ICustomEffectParams extends IEffectParams {
  shader: string;
  uniforms: Record<string, number | number[] | boolean>;
}

/**
 * Union type of all effect parameters
 */
export type EffectParams =
  | IBloomParams
  | IToneMapParams
  | IDepthOfFieldParams
  | IMotionBlurParams
  | ISSAOParams
  | IFXAAParams
  | ISharpenParams
  | IVignetteParams
  | IColorGradeParams
  | IFilmGrainParams
  | IChromaticAberrationParams
  | IFogParams
  | ICausticsParams
  | ISSRParams
  | ISSGIParams
  | ICustomEffectParams;

/**
 * Effect configuration for pipeline
 */
export interface IEffectConfig {
  type: PostProcessEffectType;
  name?: string;
  params: EffectParams;
  order?: number;
}

/**
 * Render target configuration
 */
export interface IRenderTargetConfig {
  width: number;
  height: number;
  format: GPUTextureFormat;
  mipLevelCount?: number;
  sampleCount?: number;
  label?: string;
}

/**
 * Post-process pipeline configuration
 */
export interface IPostProcessPipelineConfig {
  hdrEnabled: boolean;
  hdrFormat: GPUTextureFormat;
  ldrFormat: GPUTextureFormat;
  msaaSamples: 1 | 4;
  effects: IEffectConfig[];
  autoResize: boolean;
}

/**
 * Runtime render target
 */
export interface IRenderTarget {
  id: string;
  texture: GPUTexture;
  view: GPUTextureView;
  config: IRenderTargetConfig;
}

/**
 * Effect shader bindings
 */
export interface IEffectBindings {
  inputTexture: GPUTextureView;
  depthTexture?: GPUTextureView;
  velocityTexture?: GPUTextureView;
  noiseTexture?: GPUTextureView;
  lutTexture?: GPUTextureView;
  sampler: GPUSampler;
  uniformBuffer: GPUBuffer;
}

/**
 * Frame data passed to effects
 */
export interface IFrameData {
  time: number;
  deltaTime: number;
  frameCount: number;
  resolution: [number, number];
  nearPlane: number;
  farPlane: number;
  cameraPosition?: [number, number, number];
  viewMatrix?: Float32Array;
  projectionMatrix?: Float32Array;
  prevViewMatrix?: Float32Array;
  jitter?: [number, number];
}

/**
 * Effect render context
 */
export interface IEffectRenderContext {
  device: GPUDevice;
  commandEncoder: GPUCommandEncoder;
  frameData: IFrameData;
  input: IRenderTarget;
  output: IRenderTarget;
  depth?: IRenderTarget;
  velocity?: IRenderTarget;
}

/**
 * Default parameter values for each effect type
 */
export const DEFAULT_PARAMS: Record<PostProcessEffectType, EffectParams> = {
  bloom: {
    enabled: true,
    intensity: 1.0,
    threshold: 1.0,
    softThreshold: 0.5,
    radius: 4,
    iterations: 5,
    anamorphic: 0,
    highQuality: false,
    blendMode: 'add',
  } as IBloomParams,

  tonemap: {
    enabled: true,
    intensity: 1.0,
    operator: 'aces',
    exposure: 1.0,
    gamma: 2.2,
    whitePoint: 1.0,
    contrast: 1.0,
    saturation: 1.0,
  } as IToneMapParams,

  dof: {
    enabled: false,
    intensity: 1.0,
    focusDistance: 10,
    focalLength: 50,
    aperture: 2.8,
    maxBlur: 1,
    bokehShape: 'circle',
    bokehQuality: 'medium',
    nearBlur: true,
  } as IDepthOfFieldParams,

  motionBlur: {
    enabled: false,
    intensity: 1.0,
    samples: 8,
    velocityScale: 1.0,
    maxVelocity: 64,
  } as IMotionBlurParams,

  ssao: {
    enabled: false,
    intensity: 1.0,
    radius: 0.5,
    bias: 0.025,
    samples: 16,
    power: 2.0,
    falloff: 1.0,
    mode: 'hemisphere',
    bentNormals: false,
    spatialDenoise: false,
  } as ISSAOParams,

  fxaa: {
    enabled: true,
    intensity: 1.0,
    quality: 'high',
    edgeThreshold: 0.166,
    edgeThresholdMin: 0.0833,
  } as IFXAAParams,

  sharpen: {
    enabled: false,
    intensity: 0.5,
    amount: 0.3,
    threshold: 0.1,
  } as ISharpenParams,

  vignette: {
    enabled: false,
    intensity: 0.5,
    roundness: 1.0,
    smoothness: 0.5,
    color: [0, 0, 0],
  } as IVignetteParams,

  colorGrade: {
    enabled: false,
    intensity: 1.0,
    shadows: [0, 0, 0],
    midtones: [0, 0, 0],
    highlights: [0, 0, 0],
    shadowsOffset: 0,
    highlightsOffset: 0,
    hueShift: 0,
    temperature: 0,
    tint: 0,
    lutIntensity: 1.0,
  } as IColorGradeParams,

  filmGrain: {
    enabled: false,
    intensity: 0.1,
    size: 1.6,
    luminanceContribution: 0.8,
    animated: true,
  } as IFilmGrainParams,

  chromaticAberration: {
    enabled: false,
    intensity: 0.5,
    redOffset: [0.01, 0],
    greenOffset: [0, 0],
    blueOffset: [-0.01, 0],
    radial: true,
  } as IChromaticAberrationParams,

  fog: {
    enabled: false,
    intensity: 1.0,
    color: [0.7, 0.8, 0.9],
    density: 0.02,
    start: 10,
    end: 100,
    height: 0,
    heightFalloff: 1.0,
    mode: 'exponential',
  } as IFogParams,

  caustics: {
    enabled: false,
    intensity: 0.8,
    scale: 8.0,
    speed: 0.5,
    color: [0.2, 0.5, 0.8],
    depthFade: 0.5,
    waterLevel: 0.5,
    dispersion: 0.0,
    foamIntensity: 0.0,
    shadowStrength: 0.0,
  } as ICausticsParams,

  ssr: {
    enabled: false,
    intensity: 0.8,
    maxSteps: 64,
    stepSize: 0.05,
    thickness: 0.1,
    roughnessFade: 0.5,
    edgeFade: 4.0,
    roughnessBlur: 0.0,
    fresnelStrength: 0.0,
  } as ISSRParams,

  ssgi: {
    enabled: false,
    intensity: 0.5,
    radius: 2.0,
    samples: 16,
    bounceIntensity: 1.0,
    falloff: 1.0,
    temporalBlend: 0.0,
    spatialDenoise: false,
    multiBounce: 0.0,
  } as ISSGIParams,

  custom: {
    enabled: true,
    intensity: 1.0,
    shader: '',
    uniforms: {},
  } as ICustomEffectParams,
};

/**
 * Get default parameters for effect type
 */
export function getDefaultParams<T extends EffectParams>(type: PostProcessEffectType): T {
  return { ...DEFAULT_PARAMS[type] } as T;
}

/**
 * Merge effect parameters with defaults
 */
export function mergeParams<T extends EffectParams>(
  type: PostProcessEffectType,
  partial: Partial<T>
): T {
  return { ...DEFAULT_PARAMS[type], ...partial } as T;
}

/**
 * Validate effect parameters
 */
export function validateParams(
  type: PostProcessEffectType,
  params: EffectParams
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Null/undefined check
  if (params == null) {
    return { valid: false, errors: ['params is null or undefined'] };
  }

  // Common validation
  if (typeof params.enabled !== 'boolean') {
    errors.push('enabled must be boolean');
  }
  if (typeof params.intensity !== 'number' || params.intensity < 0) {
    errors.push('intensity must be non-negative number');
  }

  // Type-specific validation
  switch (type) {
    case 'bloom': {
      const p = params as IBloomParams;
      if (p.threshold < 0) errors.push('bloom.threshold must be >= 0');
      if (p.iterations < 1 || p.iterations > 16) {
        errors.push('bloom.iterations must be 1-16');
      }
      break;
    }
    case 'tonemap': {
      const p = params as IToneMapParams;
      if (p.exposure <= 0) errors.push('tonemap.exposure must be > 0');
      if (p.gamma <= 0) errors.push('tonemap.gamma must be > 0');
      break;
    }
    case 'dof': {
      const p = params as IDepthOfFieldParams;
      if (p.focusDistance <= 0) errors.push('dof.focusDistance must be > 0');
      if (p.aperture <= 0) errors.push('dof.aperture must be > 0');
      break;
    }
    case 'ssao': {
      const p = params as ISSAOParams;
      if (p.samples < 4 || p.samples > 64) {
        errors.push('ssao.samples must be 4-64');
      }
      if (p.radius <= 0) errors.push('ssao.radius must be > 0');
      break;
    }
    // Add more type-specific validation as needed
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Size in bytes for uniform buffers
 */
export const UNIFORM_SIZES: Record<PostProcessEffectType, number> = {
  bloom: 48, // intensity, threshold, softThreshold, radius, iterations, anamorphic
  tonemap: 32, // operator, exposure, gamma, whitePoint, contrast, saturation
  dof: 48, // focusDistance, focalLength, aperture, maxBlur, near/far
  motionBlur: 16, // samples, velocityScale, maxVelocity
  ssao: 48, // radius, bias, samples, power, falloff, mode, bentNormals, spatialDenoise
  fxaa: 16, // quality, edgeThreshold, edgeThresholdMin
  sharpen: 16, // amount, threshold
  vignette: 32, // intensity, roundness, smoothness, color
  colorGrade: 96, // shadows, midtones, highlights, offsets, hue, temp, tint
  filmGrain: 16, // size, luminance, time
  chromaticAberration: 32, // offsets, radial
  fog: 48, // color, density, start, end, height, falloff
  caustics: 64, // intensity, scale, speed, time, color, depthFade, waterLevel, dispersion, foam, shadow
  ssr: 48, // maxSteps, stepSize, thickness, roughnessFade, edgeFade, intensity, roughnessBlur, fresnel
  ssgi: 48, // radius, samples, bounceIntensity, falloff, time, intensity, temporalBlend, denoise, multiBounce
  custom: 256, // generic uniform buffer for custom effects
};

// =============================================================================
// Type Aliases for API Compatibility
// =============================================================================

/**
 * FXAA quality levels
 */
export type FXAAQuality = 'low' | 'medium' | 'high' | 'ultra';

/**
 * Alias for IEffectParams (API compatibility)
 */
export type IBaseEffectParams = IEffectParams;

/**
 * Alias for IDepthOfFieldParams (API compatibility)
 */
export type IDOFParams = IDepthOfFieldParams;
