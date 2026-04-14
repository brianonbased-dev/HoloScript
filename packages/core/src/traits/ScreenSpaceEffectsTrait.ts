/**
 * Screen-Space Effects Trait
 *
 * Modern post-processing effects rendered in screen space:
 * - SSAO (Screen-Space Ambient Occlusion)
 * - SSR (Screen-Space Reflections)
 * - SSGI (Screen-Space Global Illumination)
 * - TAA (Temporal Anti-Aliasing)
 * - Motion Blur
 * - Depth of Field (Bokeh)
 * - Chromatic Aberration
 * - Lens Flares
 * - Film Grain
 *
 * @version 1.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

export interface SSAOConfig {
  radius: number; // World-space radius
  bias: number; // Depth bias to prevent acne
  samples: number; // Sample count (8, 16, 32, 64)
  intensity: number; // Occlusion strength (0-1)
  blur_radius?: number; // Blur kernel size
}

export interface SSRConfig {
  max_roughness: number; // Max roughness for reflections
  step_count: number; // Ray march steps
  thickness: number; // Scene thickness tolerance
  binary_search_iterations?: number;
  fade_start?: number; // Screen edge fade
  fade_end?: number;
}

export interface SSGIConfig {
  sample_count: number; // GI samples per pixel
  radius: number; // GI sampling radius
  intensity: number; // GI contribution
  denoise?: boolean; // Spatial-temporal denoising
}

export interface TAAConfig {
  jitter_spread: number; // Halton/Sobol jitter
  feedback: number; // History blend factor (0-1)
  sharpness?: number; // Sharpening strength
  motion_rejection?: boolean; // Reject fast-moving pixels
}

export interface MotionBlurConfig {
  samples: number; // Blur samples
  intensity: number; // Blur strength
  velocity_scale?: number; // Velocity multiplier
  tile_size?: number; // Tile-based optimization
}

export interface DepthOfFieldConfig {
  focus_distance: number; // Camera focus distance
  aperture: number; // f-stop (f/1.4, f/2.8, etc.)
  focal_length?: number; // mm (35mm, 50mm, 85mm)
  bokeh_shape?: 'circle' | 'hexagon' | 'octagon';
  bokeh_rotation?: number; // Degrees
  samples?: number; // Bokeh samples
}

export interface ChromaticAberrationConfig {
  intensity: number; // Separation strength
  samples?: number; // Fringe samples
}

export interface LensFlareConfig {
  ghosts: number; // Ghost count
  halo_width: number; // Halo ring width
  chromatic_distortion: number; // Color fringing
  threshold?: number; // Brightness threshold
}

export interface FilmGrainConfig {
  intensity: number; // Grain strength
  size: number; // Grain particle size
  colored?: boolean; // Colored vs monochrome
}

export interface ScreenSpaceEffectsConfig {
  // Lighting enhancements
  ssao?: SSAOConfig;
  ssr?: SSRConfig;
  ssgi?: SSGIConfig;

  // Anti-aliasing
  taa?: TAAConfig;

  // Camera effects
  motion_blur?: MotionBlurConfig;
  depth_of_field?: DepthOfFieldConfig;
  chromatic_aberration?: ChromaticAberrationConfig;

  // Lens effects
  lens_flare?: LensFlareConfig;
  film_grain?: FilmGrainConfig;

  // Output
  output_format?: 'ldr' | 'hdr';
  tonemap?: 'aces' | 'filmic' | 'reinhard' | 'uncharted2';
}

// =============================================================================
// TRAIT HANDLER
// =============================================================================

export const ScreenSpaceEffectsTrait: TraitHandler<ScreenSpaceEffectsConfig> = {
  name: 'screen_space_effects',

  validate(config: ScreenSpaceEffectsConfig): boolean {
    // Validate SSAO
    if (config.ssao) {
      if (config.ssao.samples < 8 || config.ssao.samples > 64) {
        console.warn('SSAO samples should be 8-64 for optimal performance');
      }
      if (config.ssao.radius <= 0) {
        throw new Error('SSAO radius must be > 0');
      }
    }

    // Validate SSR
    if (config.ssr) {
      if (config.ssr.step_count < 8 || config.ssr.step_count > 128) {
        console.warn('SSR step_count should be 8-128 for optimal performance');
      }
    }

    // Validate SSGI
    if (config.ssgi) {
      if (config.ssgi.sample_count > 32) {
        console.warn('SSGI is extremely expensive - consider reducing sample_count to < 32');
      }
    }

    // Validate TAA
    if (config.taa) {
      if (config.taa.feedback < 0 || config.taa.feedback > 1) {
        throw new Error('TAA feedback must be 0-1');
      }
    }

    // Validate DOF
    if (config.depth_of_field) {
      if (config.depth_of_field.aperture < 0.5) {
        console.warn('Very wide aperture (< f/0.5) may look unrealistic');
      }
    }

    // Performance warning
    const enabledEffects = Object.keys(config).filter(
      (key) =>
        !['output_format', 'tonemap'].includes(key) && config[key as keyof ScreenSpaceEffectsConfig]
    );

    if (enabledEffects.length > 5) {
      console.warn(
        `${enabledEffects.length} screen-space effects enabled - may impact real-time performance`
      );
    }

    return true;
  },

  compile(config: ScreenSpaceEffectsConfig, target: string): string {
    const self = this as unknown as Record<string, (c: ScreenSpaceEffectsConfig) => string>;
    switch (target) {
      case 'unity':
        return self.compileUnity(config);
      case 'unreal':
        return self.compileUnreal(config);
      case 'web':
      case 'react-three-fiber':
        return self.compileWeb(config);
      case 'webgpu':
        return self.compileWebGPU(config);
      default:
        return self.compileGeneric(config);
    }
  },

  compileUnity(config: ScreenSpaceEffectsConfig): string {
    return `
// Unity HDRP Screen-Space Effects
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.HighDefinition;

[RequireComponent(typeof(Volume))]
public class ScreenSpaceEffectsManager : MonoBehaviour {
    private Volume volume;

    void Start() {
        SetupEffects();
    }

    void SetupEffects() {
        volume = GetComponent<Volume>();
        volume.isGlobal = true;

        ${
          config.ssao
            ? `
        // SSAO
        if (volume.profile.TryGet(out ScreenSpaceAmbientOcclusion ssao)) {
            ssao.active = true;
            ssao.rayTracing.value = false; // Use screen-space
            ssao.radius.value = ${config.ssao.radius}f;
            ssao.intensity.value = ${config.ssao.intensity}f;
            ssao.directLightingStrength.value = 0.0f;
            ssao.maximumRadiusInPixels.value = 128;
        }
        `
            : ''
        }

        ${
          config.ssr
            ? `
        // SSR
        if (volume.profile.TryGet(out ScreenSpaceReflection ssr)) {
            ssr.active = true;
            ssr.enabledTransparent.value = false;
            ssr.maximumIterationCount.value = ${config.ssr.step_count};
            ssr.thickness.value = new Vector2(0.001f, ${config.ssr.thickness}f);
            ssr.smoothnessFadeStart.value = ${1.0 - (config.ssr.max_roughness ?? 0.2)};
            ssr.minSmoothness.value = 0.0f;
            ssr.rayMaxIterations.value = ${config.ssr.binary_search_iterations ?? 8};
        }
        `
            : ''
        }

        ${
          config.ssgi
            ? `
        // SSGI
        if (volume.profile.TryGet(out GlobalIllumination gi)) {
            gi.active = true;
            gi.enable.value = true;
            gi.quality.value = ScalableSettingLevelParameter.Level.Medium;
            gi.raySteps.value = ${config.ssgi.sample_count};
            gi.fullResolutionSS.value = false;
            gi.rayMiss.value = 0.0f;
            gi.lastBounceFallbackHierarchy.value = 1.0f;
        }
        `
            : ''
        }

        ${
          config.taa
            ? `
        // TAA (enabled by default in HDRP Camera)
        Camera.main.GetComponent<HDAdditionalCameraData>().antialiasing = HDAdditionalCameraData.AntialiasingMode.TemporalAntialiasing;
        Camera.main.GetComponent<HDAdditionalCameraData>().taaSharpenStrength = ${config.taa.sharpness ?? 0.5}f;
        Camera.main.GetComponent<HDAdditionalCameraData>().taaHistorySharpening = ${config.taa.feedback}f;
        `
            : ''
        }

        ${
          config.motion_blur
            ? `
        // Motion Blur
        if (volume.profile.TryGet(out MotionBlur motionBlur)) {
            motionBlur.active = true;
            motionBlur.intensity.value = ${config.motion_blur.intensity}f;
            motionBlur.sampleCount.value = ${config.motion_blur.samples};
            motionBlur.maximumVelocity.value = 200;
            motionBlur.minimumVelocity.value = 2;
        }
        `
            : ''
        }

        ${
          config.depth_of_field
            ? `
        // Depth of Field
        if (volume.profile.TryGet(out DepthOfField dof)) {
            dof.active = true;
            dof.focusMode.value = DepthOfFieldMode.UsePhysicalCamera;
            dof.focusDistance.value = ${config.depth_of_field.focus_distance}f;

            // Configure camera for DOF
            Camera.main.usePhysicalProperties = true;
            Camera.main.focalLength = ${config.depth_of_field.focal_length ?? 50}f;
            Camera.main.aperture = ${config.depth_of_field.aperture}f;

            dof.nearFocusStart.value = 0.0f;
            dof.nearFocusEnd.value = ${config.depth_of_field.focus_distance * 0.8}f;
            dof.farFocusStart.value = ${config.depth_of_field.focus_distance * 1.2}f;
            dof.farFocusEnd.value = 1000.0f;
        }
        `
            : ''
        }

        ${
          config.chromatic_aberration
            ? `
        // Chromatic Aberration
        if (volume.profile.TryGet(out ChromaticAberration ca)) {
            ca.active = true;
            ca.intensity.value = ${config.chromatic_aberration.intensity}f;
        }
        `
            : ''
        }

        ${
          config.lens_flare
            ? `
        // Lens Flare (add to sun/bright lights)
        Light sunLight = GameObject.Find("Directional Light").GetComponent<Light>();
        HDAdditionalLightData hdLight = sunLight.GetComponent<HDAdditionalLightData>();
        hdLight.enableSpotReflector = false;
        // Note: Lens flare data assets must be created in HDRP
        `
            : ''
        }

        ${
          config.film_grain
            ? `
        // Film Grain
        if (volume.profile.TryGet(out FilmGrain grain)) {
            grain.active = true;
            grain.type.value = FilmGrainLookup.Thin1;
            grain.intensity.value = ${config.film_grain.intensity}f;
            grain.response.value = 0.8f;
        }
        `
            : ''
        }
    }
}
`;
  },

  compileUnreal(config: ScreenSpaceEffectsConfig): string {
    return `
// Unreal Engine Post Process Volume
#include "Engine/PostProcessVolume.h"
#include "Engine/Scene.h"

class AScreenSpaceEffectsVolume : public APostProcessVolume {
public:
    void ConfigureEffects() {
        bUnbound = true; // Global volume

        ${
          config.ssao
            ? `
        // SSAO
        Settings.bOverride_AmbientOcclusionIntensity = true;
        Settings.AmbientOcclusionIntensity = ${config.ssao.intensity}f;
        Settings.bOverride_AmbientOcclusionRadius = true;
        Settings.AmbientOcclusionRadius = ${config.ssao.radius}f;
        Settings.bOverride_AmbientOcclusionQuality = true;
        Settings.AmbientOcclusionQuality = ${Math.min(config.ssao.samples / 16, 4)}f; // 0-4 quality
        Settings.bOverride_AmbientOcclusionRadiusInWS = true;
        Settings.AmbientOcclusionRadiusInWS = true;
        `
            : ''
        }

        ${
          config.ssr
            ? `
        // SSR (Lumen/Screen Space)
        Settings.bOverride_ReflectionMethod = true;
        Settings.ReflectionMethod = EReflectionMethod::ScreenSpace;
        Settings.bOverride_ScreenSpaceReflectionIntensity = true;
        Settings.ScreenSpaceReflectionIntensity = 100.0f;
        Settings.bOverride_ScreenSpaceReflectionQuality = true;
        Settings.ScreenSpaceReflectionQuality = ${config.ssr.step_count}f;
        Settings.bOverride_ScreenSpaceReflectionMaxRoughness = true;
        Settings.ScreenSpaceReflectionMaxRoughness = ${config.ssr.max_roughness}f;
        `
            : ''
        }

        ${
          config.ssgi
            ? `
        // SSGI (Lumen Global Illumination)
        Settings.bOverride_DynamicGlobalIlluminationMethod = true;
        Settings.DynamicGlobalIlluminationMethod = EDynamicGlobalIlluminationMethod::Lumen;
        Settings.bOverride_LumenSceneLightingQuality = true;
        Settings.LumenSceneLightingQuality = 1.0f; // 0-4
        Settings.bOverride_LumenFinalGatherQuality = true;
        Settings.LumenFinalGatherQuality = ${config.ssgi.sample_count / 16.0}f;
        `
            : ''
        }

        ${
          config.taa
            ? `
        // TAA
        Settings.bOverride_AntiAliasingMethod = true;
        Settings.AntiAliasingMethod = AAM_TemporalAA;
        Settings.bOverride_TemporalAACurrentFrameWeight = true;
        Settings.TemporalAACurrentFrameWeight = ${1.0 - config.taa.feedback}f;
        Settings.bOverride_TemporalAASamples = true;
        Settings.TemporalAASamples = 8; // Halton sequence
        `
            : ''
        }

        ${
          config.motion_blur
            ? `
        // Motion Blur
        Settings.bOverride_MotionBlurAmount = true;
        Settings.MotionBlurAmount = ${config.motion_blur.intensity}f;
        Settings.bOverride_MotionBlurMax = true;
        Settings.MotionBlurMax = 100.0f;
        Settings.bOverride_MotionBlurPerObjectSize = true;
        Settings.MotionBlurPerObjectSize = ${config.motion_blur.velocity_scale ?? 1.0}f;
        `
            : ''
        }

        ${
          config.depth_of_field
            ? `
        // Depth of Field
        Settings.bOverride_DepthOfFieldMethod = true;
        Settings.DepthOfFieldMethod = EDepthOfFieldMethod::DOFM_BokehDOF;
        Settings.bOverride_DepthOfFieldFocalDistance = true;
        Settings.DepthOfFieldFocalDistance = ${config.depth_of_field.focus_distance}f;
        Settings.bOverride_DepthOfFieldFstop = true;
        Settings.DepthOfFieldFstop = ${config.depth_of_field.aperture}f;
        Settings.bOverride_DepthOfFieldSensorWidth = true;
        Settings.DepthOfFieldSensorWidth = 24.89f; // Full-frame sensor
        `
            : ''
        }

        ${
          config.chromatic_aberration
            ? `
        // Chromatic Aberration
        Settings.bOverride_SceneFringeIntensity = true;
        Settings.SceneFringeIntensity = ${config.chromatic_aberration.intensity}f;
        `
            : ''
        }

        ${
          config.lens_flare
            ? `
        // Lens Flare
        Settings.bOverride_LensFlareIntensity = true;
        Settings.LensFlareIntensity = 1.0f;
        Settings.bOverride_LensFlareTint = true;
        Settings.LensFlareTint = FLinearColor::White;
        `
            : ''
        }

        ${
          config.film_grain
            ? `
        // Film Grain
        Settings.bOverride_GrainIntensity = true;
        Settings.GrainIntensity = ${config.film_grain.intensity}f;
        Settings.bOverride_GrainJitter = true;
        Settings.GrainJitter = 0.5f;
        `
            : ''
        }
    }
};
`;
  },

  compileWeb(config: ScreenSpaceEffectsConfig): string {
    return `
// Three.js Post-Processing (using postprocessing package)
import { EffectComposer, EffectPass, RenderPass } from 'postprocessing';
${config.ssao ? `import { SSAOEffect } from 'postprocessing';` : ''}
${config.ssr ? `import { SSREffect } from 'screen-space-reflections';` : ''}
${config.motion_blur ? `import { MotionBlurEffect } from 'postprocessing';` : ''}
${config.depth_of_field ? `import { DepthOfFieldEffect } from 'postprocessing';` : ''}
${config.chromatic_aberration ? `import { ChromaticAberrationEffect } from 'postprocessing';` : ''}
${config.film_grain ? `import { NoiseEffect } from 'postprocessing';` : ''}
import * as THREE from 'three';

class ScreenSpaceEffectsComposer {
  constructor(renderer, scene, camera) {
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));

    const effects = [];

    ${
      config.ssao
        ? `
    // SSAO
    const ssaoEffect = new SSAOEffect(camera, {
      radius: ${config.ssao.radius},
      bias: ${config.ssao.bias},
      samples: ${config.ssao.samples},
      rings: 4,
      distanceThreshold: 1.0,
      distanceFalloff: 0.0,
      rangeThreshold: 0.5,
      rangeFalloff: 0.1,
      luminanceInfluence: 0.7,
      intensity: ${config.ssao.intensity}
    });
    effects.push(ssaoEffect);
    `
        : ''
    }

    ${
      config.ssr
        ? `
    // SSR
    const ssrEffect = new SSREffect(scene, camera, {
      maxDistance: 100,
      thickness: ${config.ssr.thickness},
      maxSteps: ${config.ssr.step_count},
      binarySearchSteps: ${config.ssr.binary_search_iterations ?? 8},
      maxRoughness: ${config.ssr.max_roughness},
      fade: ${config.ssr.fade_start ?? 0.9},
      fadeTo: ${config.ssr.fade_end ?? 1.0}
    });
    effects.push(ssrEffect);
    `
        : ''
    }

    ${
      config.taa
        ? `
    // TAA (handled by WebGLRenderer.samples or manual implementation)
    // Note: Three.js doesn't have built-in TAA - requires custom pass
    console.warn('TAA requires custom implementation in Three.js');
    `
        : ''
    }

    ${
      config.motion_blur
        ? `
    // Motion Blur
    const motionBlurEffect = new MotionBlurEffect({
      samples: ${config.motion_blur.samples},
      intensity: ${config.motion_blur.intensity},
      velocityScale: ${config.motion_blur.velocity_scale ?? 1.0}
    });
    effects.push(motionBlurEffect);
    `
        : ''
    }

    ${
      config.depth_of_field
        ? `
    // Depth of Field
    const dofEffect = new DepthOfFieldEffect(camera, {
      focusDistance: ${config.depth_of_field.focus_distance},
      focalLength: ${config.depth_of_field.focal_length ?? 50} / 1000, // Convert mm to m
      bokehScale: ${config.depth_of_field.aperture},
      width: window.innerWidth,
      height: window.innerHeight
    });
    effects.push(dofEffect);
    `
        : ''
    }

    ${
      config.chromatic_aberration
        ? `
    // Chromatic Aberration
    const caEffect = new ChromaticAberrationEffect({
      offset: new THREE.Vector2(${config.chromatic_aberration.intensity}, ${config.chromatic_aberration.intensity})
    });
    effects.push(caEffect);
    `
        : ''
    }

    ${
      config.film_grain
        ? `
    // Film Grain
    const grainEffect = new NoiseEffect({
      premultiply: false
    });
    grainEffect.blendMode.opacity.value = ${config.film_grain.intensity};
    effects.push(grainEffect);
    `
        : ''
    }

    if (effects.length > 0) {
      this.composer.addPass(new EffectPass(camera, ...effects));
    }
  }

  render(delta) {
    this.composer.render(delta);
  }

  setSize(width, height) {
    this.composer.setSize(width, height);
  }
}

export default ScreenSpaceEffectsComposer;
`;
  },

  compileWebGPU(config: ScreenSpaceEffectsConfig): string {
    return `
// WebGPU Screen-Space Effects Pipeline
${
  config.ssao
    ? `
// SSAO Compute Shader
@group(0) @binding(0) var depthTexture: texture_depth_2d;
@group(0) @binding(1) var normalTexture: texture_2d<f32>;
@group(0) @binding(2) var noiseTexture: texture_2d<f32>;
@group(0) @binding(3) var outputTexture: texture_storage_2d<rgba16float, write>;

struct SSAOUniforms {
  radius: f32,
  bias: f32,
  samples: u32,
  intensity: f32,
}
@group(1) @binding(0) var<uniform> ssaoParams: SSAOUniforms;

@compute @workgroup_size(8, 8)
fn computeSSAO(@builtin(global_invocation_id) id: vec3<u32>) {
  let texCoord = vec2<f32>(id.xy) / vec2<f32>(textureDimensions(depthTexture));

  let depth = textureLoad(depthTexture, id.xy, 0);
  let normal = textureLoad(normalTexture, id.xy, 0).xyz;

  // Hemisphere sampling
  var occlusion = 0.0;
  for (var i = 0u; i < ssaoParams.samples; i++) {
    let samplePos = getSamplePosition(i, normal, ssaoParams.radius);
    let sampleDepth = sampleDepthAtPosition(samplePos);

    let rangeCheck = smoothstep(0.0, 1.0, ssaoParams.radius / abs(depth - sampleDepth));
    occlusion += select(0.0, 1.0, sampleDepth >= samplePos[2] + ssaoParams.bias) * rangeCheck;
  }

  occlusion = 1.0 - (occlusion / f32(ssaoParams.samples));
  occlusion = pow(occlusion, ssaoParams.intensity);

  textureStore(outputTexture, id.xy, vec4<f32>(occlusion, occlusion, occlusion, 1.0));
}
`
    : ''
}

${
  config.ssr
    ? `
// SSR Ray March Shader
@fragment
fn computeSSR(@location(0) uv: vec2<f32>,
              @location(1) worldPos: vec3<f32>,
              @location(2) normal: vec3<f32>) -> @location(0) vec4<f32> {

  let viewDir = normalize(cameraPos - worldPos);
  let reflectDir = reflect(-viewDir, normal);

  var hitPos = worldPos;
  var stepSize = ${config.ssr.thickness} / f32(${config.ssr.step_count});

  // Ray march in screen space
  for (var i = 0; i < ${config.ssr.step_count}; i++) {
    hitPos += reflectDir * stepSize;

    let screenPos = worldToScreen(hitPos);
    if (screenPos[0] < 0.0 || screenPos[0] > 1.0 || screenPos[1] < 0.0 || screenPos[1] > 1.0) {
      break; // Ray left screen
    }

    let sceneDepth = textureLoad(depthTexture, vec2<u32>(screenPos * vec2<f32>(textureDimensions(depthTexture))), 0);
    let rayDepth = screenPos[2];

    if (abs(rayDepth - sceneDepth) < ${config.ssr.thickness}) {
      // Hit!
      return textureSample(colorTexture, linearSampler, screenPos.xy);
    }
  }

  return vec4<f32>(0.0); // No reflection
}
`
    : ''
}

${
  config.motion_blur
    ? `
// Motion Blur Shader
@fragment
fn applyMotionBlur(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let velocity = textureLoad(velocityTexture, vec2<u32>(uv * vec2<f32>(textureDimensions(velocityTexture))), 0).xy;

  var color = vec4<f32>(0.0);
  let samples = ${config.motion_blur.samples};

  for (var i = 0; i < samples; i++) {
    let offset = velocity * (f32(i) / f32(samples - 1) - 0.5) * ${config.motion_blur.intensity};
    color += textureSample(colorTexture, linearSampler, uv + offset);
  }

  return color / f32(samples);
}
`
    : ''
}

// Full post-processing pipeline
struct PostProcessPipeline {
  ${config.ssao ? 'ssaoPass: GPUComputePipeline,' : ''}
  ${config.ssr ? 'ssrPass: GPURenderPipeline,' : ''}
  ${config.motion_blur ? 'motionBlurPass: GPURenderPipeline,' : ''}
  ${config.depth_of_field ? 'dofPass: GPURenderPipeline,' : ''}
  compositePipeline: GPURenderPipeline,
}
`;
  },

  compileGeneric(config: ScreenSpaceEffectsConfig): string {
    return `
// Generic Screen-Space Effects Configuration
const screenSpaceEffectsConfig = ${JSON.stringify(config, null, 2)};

// Note: This is a generic configuration object.
// Platform-specific shader code should be generated by the target compiler.
`;
  },
};
