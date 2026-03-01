/**
 * Post-Processing Module
 *
 * WebGPU-based post-processing effects for the HoloScript renderer.
 *
 * @module render/postprocess
 *
 * @example
 * ```ts
 * import { createHDRPipeline, PostProcessPipeline } from './render/postprocess';
 *
 * // Create with preset
 * const pipeline = createHDRPipeline();
 *
 * // Or create custom
 * const custom = new PostProcessPipeline({
 *   hdrEnabled: true,
 *   effects: [
 *     { type: 'bloom', params: { intensity: 0.8 } },
 *     { type: 'tonemap', params: { operator: 'aces' } },
 *     { type: 'fxaa' },
 *   ]
 * });
 *
 * // Initialize with WebGPU device
 * await pipeline.initialize(device, width, height);
 *
 * // In render loop
 * pipeline.render(commandEncoder, sceneTexture, swapChainTexture, {
 *   time: performance.now() / 1000,
 *   deltaTime: dt,
 * });
 * ```
 */

// Types
export {
  PostProcessEffectType,
  ToneMapOperator,
  BlendMode,
  FXAAQuality,
  IBaseEffectParams,
  IBloomParams,
  IToneMapParams,
  IDOFParams,
  IMotionBlurParams,
  ISSAOParams,
  IFXAAParams,
  ISharpenParams,
  IVignetteParams,
  IColorGradeParams,
  IFilmGrainParams,
  IChromaticAberrationParams,
  IFogParams,
  ICausticsParams,
  ISSRParams,
  ISSGIParams,
  ICustomEffectParams,
  EffectParams,
  IRenderTarget,
  IRenderTargetConfig,
  IFrameData,
  IEffectRenderContext,
  IEffectConfig,
  IPostProcessPipelineConfig,
  DEFAULT_PARAMS,
  UNIFORM_SIZES,
  getDefaultParams,
  mergeParams,
  validateParams,
} from './PostProcessTypes';

// Effect classes
export {
  PostProcessEffect,
  BloomEffect,
  ToneMapEffect,
  FXAAEffect,
  VignetteEffect,
  FilmGrainEffect,
  SharpenEffect,
  ChromaticAberrationEffect,
  CausticsEffect,
  SSREffect,
  SSAOEffect,
  SSGIEffect,
  createEffect,
} from './PostProcessEffect';

// Shaders
export {
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
  CAUSTICS_SHADER,
  SSR_SHADER,
  SSGI_SHADER,
  BLIT_SHADER,
  buildEffectShader,
} from './PostProcessShaders';

// Pipeline
export {
  PostProcessPipeline,
  DEFAULT_PIPELINE_CONFIG,
  createPostProcessPipeline,
  createHDRPipeline,
  createLDRPipeline,
} from './PostProcessPipeline';
