/**
 * RayTracingTrait
 *
 * Configures hardware/software ray tracing: reflections,
 * shadows, ambient occlusion, and global illumination via path tracing.
 *
 * @version 1.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

export type RayTracingMode = 'hardware' | 'software_bvh' | 'hybrid';

export interface RTReflectionsConfig {
  enabled: boolean;
  maxBounces: number; // 1–8
  samplesPerPixel: number;
  maxRoughness: number; // Skip RT above this roughness
  fallbackToSSR?: boolean;
}

export interface RTShadowsConfig {
  enabled: boolean;
  samplesPerLight: number;
  softShadows: boolean;
  shadowBias?: number;
}

export interface RTAOConfig {
  enabled: boolean;
  radius: number;
  samplesPerPixel: number;
}

export interface RTGIConfig {
  enabled: boolean;
  maxBounces: number;
  samplesPerPixel: number;
  denoise?: boolean;
}

export interface PathTracerConfig {
  enabled: boolean;
  samplesPerPixel: number;
  maxBounces: number;
  russianRouletteDepth?: number;
  denoiser?: 'nlm' | 'oidn' | 'none';
}

export interface RayTracingConfig {
  mode: RayTracingMode;
  reflections?: RTReflectionsConfig;
  shadows?: RTShadowsConfig;
  ao?: RTAOConfig;
  gi?: RTGIConfig;
  pathTracer?: PathTracerConfig;
  /** Max scene ray count per frame (perf budget) */
  maxRaysPerFrame?: number;
}

// =============================================================================
// TRAIT HANDLER
// =============================================================================

export const RayTracingTrait: TraitHandler<RayTracingConfig> = {
  name: 'ray_tracing',

  validate(config: RayTracingConfig): boolean {
    const validModes: RayTracingMode[] = ['hardware', 'software_bvh', 'hybrid'];
    if (!validModes.includes(config.mode)) {
      throw new Error(`RayTracing mode must be one of: ${validModes.join(', ')}`);
    }
    if (config.reflections) {
      if (config.reflections.maxBounces < 1 || config.reflections.maxBounces > 16) {
        throw new Error('reflections.maxBounces must be 1–16');
      }
      if (config.reflections.samplesPerPixel < 1) {
        throw new Error('reflections.samplesPerPixel must be >= 1');
      }
    }
    if (config.shadows) {
      if (config.shadows.samplesPerLight < 1) {
        throw new Error('shadows.samplesPerLight must be >= 1');
      }
    }
    if (config.pathTracer) {
      if (config.pathTracer.samplesPerPixel < 1) {
        throw new Error('pathTracer.samplesPerPixel must be >= 1');
      }
      if (config.pathTracer.maxBounces < 1) {
        throw new Error('pathTracer.maxBounces must be >= 1');
      }
    }
    if (config.maxRaysPerFrame !== undefined && config.maxRaysPerFrame <= 0) {
      throw new Error('maxRaysPerFrame must be > 0');
    }
    return true;
  },

  compile(config: RayTracingConfig, target: string): string {
    const self = this as unknown as Record<string, (c: RayTracingConfig) => string>;
    switch (target) {
      case 'unity':
        return self.compileUnity(config);
      case 'unreal':
        return self.compileUnreal(config);
      case 'web':
      case 'react-three-fiber':
      case 'babylon':
        return self.compileWeb(config);
      case 'webgpu':
        return self.compileWebGPU(config);
      default:
        return self.compileGeneric(config);
    }
  },

  compileUnity(config: RayTracingConfig): string {
    return `
// Unity HDRP — Ray Tracing
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.HighDefinition;

[RequireComponent(typeof(Volume))]
public class RayTracingSetup : MonoBehaviour {
    void Start() {
        var volume = GetComponent<Volume>();
        var profile = volume.sharedProfile;

        // Require HDRP Ray Tracing enabled in Project Settings > HDRP Global Settings
        ${
          config.reflections?.enabled
            ? `
        if (profile.TryGet<ScreenSpaceReflection>(out var ssr)) {
            ssr.active = true;
            ssr.enabled.Override(true);
            ssr.tracing.Override(RayCastingMode.RayTracing);
            ssr.bounceCount.Override(${config.reflections.maxBounces});
            ssr.sampleCount.Override(${config.reflections.samplesPerPixel});
            ssr.minSmoothness.Override(${1 - config.reflections.maxRoughness});
        }`
            : ''
        }

        ${
          config.shadows?.enabled
            ? `
        if (profile.TryGet<HDShadowSettings>(out var shadowSettings)) {
            shadowSettings.maxShadowDistance.Override(150.0f);
        }
        // Enable ray-traced shadows per light via HDAdditionalLightData.useRayTracedShadows
        `
            : ''
        }

        ${
          config.ao?.enabled
            ? `
        if (profile.TryGet<ScreenSpaceAmbientOcclusion>(out var ssao)) {
            ssao.active = true;
            ssao.rayTracing.Override(true);
            ssao.radius.Override(${config.ao.radius}f);
            ssao.sampleCount.Override(${config.ao.samplesPerPixel});
        }`
            : ''
        }

        ${
          config.gi?.enabled
            ? `
        if (profile.TryGet<GlobalIllumination>(out var gi)) {
            gi.active = true;
            gi.tracing.Override(RayCastingMode.RayTracing);
            gi.sampleCount.Override(${config.gi.samplesPerPixel});
            gi.bounceCount.Override(${config.gi.maxBounces});
            ${config.gi.denoise ? 'gi.denoise.Override(true);' : ''}
        }`
            : ''
        }

        ${
          config.pathTracer?.enabled
            ? `
        if (profile.TryGet<PathTracing>(out var pt)) {
            pt.active = true;
            pt.enable.Override(true);
            pt.maximumSamples.Override(${config.pathTracer.samplesPerPixel});
            pt.maximumDepth.Override(${config.pathTracer.maxBounces});
            pt.russianRouletteStartDepth.Override(${config.pathTracer.russianRouletteDepth ?? 4});
        }`
            : ''
        }
    }
}
`;
  },

  compileUnreal(config: RayTracingConfig): string {
    return `
// Unreal Engine 5 — Ray Tracing / Lumen
// Enable: Project Settings > Rendering > Ray Tracing: true

FPostProcessSettings PPSettings;
${
  config.reflections?.enabled
    ? `
// RT Reflections
PPSettings.bOverride_ReflectionMethod = true;
PPSettings.ReflectionMethod = EReflectionMethod::RayTraced;
PPSettings.bOverride_RayTracingReflectionsMaxBounces = true;
PPSettings.RayTracingReflectionsMaxBounces = ${config.reflections.maxBounces};
PPSettings.bOverride_RayTracingReflectionsSamplesPerPixel = true;
PPSettings.RayTracingReflectionsSamplesPerPixel = ${config.reflections.samplesPerPixel};
PPSettings.bOverride_RayTracingReflectionsMaxRoughness = true;
PPSettings.RayTracingReflectionsMaxRoughness = ${config.reflections.maxRoughness}f;
`
    : ''
}

${
  config.shadows?.enabled
    ? `
// RT Shadows
PPSettings.bOverride_RayTracingShadowsMaxBounces = true;
PPSettings.RayTracingShadowsMaxBounces = 1;
PPSettings.bOverride_RayTracingShadowsSamplesPerPixel = true;
PPSettings.RayTracingShadowsSamplesPerPixel = ${config.shadows.samplesPerLight};
`
    : ''
}

${
  config.ao?.enabled
    ? `
// RT Ambient Occlusion
PPSettings.bOverride_RayTracingAO = true;
PPSettings.RayTracingAO = true;
PPSettings.bOverride_RayTracingAORadius = true;
PPSettings.RayTracingAORadius = ${config.ao.radius}f;
PPSettings.bOverride_RayTracingAOSamplesPerPixel = true;
PPSettings.RayTracingAOSamplesPerPixel = ${config.ao.samplesPerPixel};
`
    : ''
}

${
  config.pathTracer?.enabled
    ? `
// Path Tracer
r.PathTracing.Enable=1
r.PathTracing.MaxSamples=${config.pathTracer.samplesPerPixel}
r.PathTracing.MaxBounces=${config.pathTracer.maxBounces}
`
    : ''
}
`;
  },

  compileWeb(config: RayTracingConfig): string {
    return `
// Three.js — WebGPU Path Tracer (DPR / @three/webgpu)
// Hardware RT is not available in browsers; software BVH path tracing via CPU or WebGPU compute

${
  config.mode === 'hardware'
    ? `
// Note: Hardware RT is not available in WebGL/WebGPU browsers.
// Falling back to screen-space approximations.
console.warn('Hardware ray tracing not supported in web target. Using SSR/SSAO fallbacks.');
`
    : `
// Software BVH Path Tracer
import { WebGLPathTracer } from 'three-gpu-pathtracer';

const pathTracer = new WebGLPathTracer(renderer);
pathTracer.setScene(scene, camera);
pathTracer.samples = ${config.pathTracer?.samplesPerPixel ?? 4};
pathTracer.bounces = ${config.pathTracer?.maxBounces ?? 4};

function animate() {
    requestAnimationFrame(animate);
    pathTracer.renderSample();
    renderer.render(scene, camera);
}
animate();
`
}
`;
  },

  compileWebGPU(config: RayTracingConfig): string {
    return `
// WebGPU Ray Tracing — Requires WebGPU RT extension (experimental)
// Currently chrome://flags#enable-webgpu-developer-features required

// BVH Node Structure
struct BVHNode {
    aabbMin: vec3<f32>,
    leftChild: u32,
    aabbMax: vec3<f32>,
    rightChild: u32,
    primitiveOffset: u32,
    primitiveCount: u32,
    _pad: vec2<u32>,
}

struct Ray {
    origin: vec3<f32>,
    tMin: f32,
    direction: vec3<f32>,
    tMax: f32,
}

@group(0) @binding(0) var<storage, read> bvhNodes: array<BVHNode>;
@group(0) @binding(1) var outputBuffer: texture_storage_2d<rgba32float, write>;

@compute @workgroup_size(8, 8)
fn rayTrace(@builtin(global_invocation_id) id: vec3<u32>) {
    let dims = textureDimensions(outputBuffer);
    if (id[0] >= dims[0] || id[1] >= dims[1]) { return; }

    let uv = (vec2<f32>(id.xy) + 0.5) / vec2<f32>(dims);

    // Generate primary ray
    var ray: Ray;
    ray.origin = cameraPos;
    ray.direction = normalize(rayDirection(uv));
    ray.tMin = 0.001;
    ray.tMax = 10000.0;

    // Path trace — ${config.pathTracer?.maxBounces ?? 4} bounces, ${config.pathTracer?.samplesPerPixel ?? 1} spp
    var color = vec3<f32>(0.0);
    for (var s = 0u; s < ${config.pathTracer?.samplesPerPixel ?? 1}u; s++) {
        color += tracePathBVH(ray, ${config.pathTracer?.maxBounces ?? 4}u, s);
    }
    color = color / f32(${config.pathTracer?.samplesPerPixel ?? 1}u);

    textureStore(outputBuffer, id.xy, vec4<f32>(color, 1.0));
}
`;
  },

  compileGeneric(config: RayTracingConfig): string {
    return `// RayTracing config\n${JSON.stringify(config, null, 2)}`;
  },
};
