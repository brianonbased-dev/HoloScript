/**
 * GlobalIlluminationTrait
 *
 * Configures a GI system: Spherical Harmonics probe grids, DDGI-style probes,
 * lightmap baking, and irradiance volumes.
 *
 * @version 1.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

export type GIMode = 'sh_probes' | 'ddgi' | 'lightmap' | 'irradiance_volume' | 'lumen';

export interface SHProbeConfig {
  gridResolution: [number, number, number];  // X Y Z probe counts
  cellSize: number;                          // World units between probes
  order: 2 | 3;                             // SH order (L1=2, L2=3)
}

export interface DDGIConfig {
  probeCount: number;
  raysPerProbe: number;
  irradianceTexSize: number;
  visibilityTexSize: number;
  normalBias: number;
  hysteresis: number;    // 0–1 history blend
}

export interface LightmapConfig {
  resolution: number;    // Texels per world unit
  samples: number;
  denoise: boolean;
  bounces: number;
}

export interface IrradianceVolumeConfig {
  gridResolution: [number, number, number];
  cellSize: number;
  intensity: number;
}

export interface GlobalIlluminationConfig {
  mode: GIMode;
  sh?: SHProbeConfig;
  ddgi?: DDGIConfig;
  lightmap?: LightmapConfig;
  irradianceVolume?: IrradianceVolumeConfig;
  /** Sky contribution multiplier */
  skyIntensity?: number;
  /** Contribution of GI to indirect specular */
  specularOcclusion?: number;
  /** Dynamic object support via light probes */
  supportDynamicObjects?: boolean;
}

// =============================================================================
// TRAIT HANDLER
// =============================================================================

export const GlobalIlluminationTrait: TraitHandler<GlobalIlluminationConfig> = {
  name: 'global_illumination',

  validate(config: GlobalIlluminationConfig): boolean {
    const validModes: GIMode[] = ['sh_probes', 'ddgi', 'lightmap', 'irradiance_volume', 'lumen'];
    if (!validModes.includes(config.mode)) {
      throw new Error(`GI mode must be one of: ${validModes.join(', ')}`);
    }
    if (config.mode === 'sh_probes' && !config.sh) {
      throw new Error('GI mode sh_probes requires sh config');
    }
    if (config.mode === 'ddgi' && !config.ddgi) {
      throw new Error('GI mode ddgi requires ddgi config');
    }
    if (config.mode === 'lightmap' && !config.lightmap) {
      throw new Error('GI mode lightmap requires lightmap config');
    }
    if (config.ddgi) {
      if (config.ddgi.hysteresis < 0 || config.ddgi.hysteresis > 1) {
        throw new Error('ddgi.hysteresis must be 0–1');
      }
      if (config.ddgi.raysPerProbe < 1) {
        throw new Error('ddgi.raysPerProbe must be >= 1');
      }
    }
    if (config.lightmap) {
      if (config.lightmap.resolution <= 0) throw new Error('lightmap.resolution must be > 0');
      if (config.lightmap.bounces < 0) throw new Error('lightmap.bounces must be >= 0');
    }
    if (config.skyIntensity !== undefined && config.skyIntensity < 0) {
      throw new Error('skyIntensity must be >= 0');
    }
    return true;
  },

  compile(config: GlobalIlluminationConfig, target: string): string {
    switch (target) {
      case 'unity': return this.compileUnity(config);
      case 'unreal': return this.compileUnreal(config);
      case 'web':
      case 'react-three-fiber':
      case 'babylon': return this.compileWeb(config);
      case 'webgpu': return this.compileWebGPU(config);
      default: return this.compileGeneric(config);
    }
  },

  compileUnity(config: GlobalIlluminationConfig): string {
    if (config.mode === 'lightmap') {
      return `
// Unity Lightmapping
using UnityEditor;
using UnityEngine;

public static class LightmapBaker {
    [MenuItem("Tools/Bake Lightmaps")]
    public static void Bake() {
        Lightmapping.lightingSettings = new LightingSettings {
            albedoBoost = 1.0f,
            lightmapsBakeMode = LightmapsMode.NonDirectional,
            ao = true,
            aoMaxDistance = 1.0f,
            realtimeGI = false,
            bakedGI = true,
        };
        LightingSettings.Lightmapper lightmapper = LightingSettings.Lightmapper.ProgressiveCPU;
        Lightmapping.bakeCompleted += () => Debug.Log("Lightmapping complete");
        Lightmapping.BakeAsync();
    }
}
`;
    }

    if (config.mode === 'lumen' || config.mode === 'ddgi') {
      return `
// Unity HDRP — Probe Volume (DDGI-style)
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.HighDefinition;

public class GISetup : MonoBehaviour {
    void Start() {
        var probeVolume = gameObject.AddComponent<ProbeVolume>();
        probeVolume.size = new Vector3(${(config.ddgi?.probeCount ?? 64) * 2}f, 10f, ${(config.ddgi?.probeCount ?? 64) * 2}f);

        var probeVolumeSettings = new ProbeVolumeArtistParameters();
        probeVolumeSettings.normalBiasWS = ${config.ddgi?.normalBias ?? 0.02}f;
    }
}
`;
    }

    return `
// Unity Light Probe Group (SH probes)
using UnityEngine;

public class SHProbeSetup : MonoBehaviour {
    void Start() {
        var lpg = gameObject.AddComponent<LightProbeGroup>();
        // Generate probe grid: ${config.sh?.gridResolution.join('x') ?? '4x4x4'}
        var positions = GenerateProbeGrid(${config.sh?.cellSize ?? 2}f);
        lpg.probePositions = positions;
    }

    Vector3[] GenerateProbeGrid(float cellSize) {
        var probes = new System.Collections.Generic.List<Vector3>();
        int rx = ${config.sh?.gridResolution[0] ?? 4};
        int ry = ${config.sh?.gridResolution[1] ?? 4};
        int rz = ${config.sh?.gridResolution[2] ?? 4};
        for (int x = 0; x < rx; x++)
        for (int y = 0; y < ry; y++)
        for (int z = 0; z < rz; z++)
            probes.Add(new Vector3(x * cellSize, y * cellSize, z * cellSize));
        return probes.ToArray();
    }
}
`;
  },

  compileUnreal(config: GlobalIlluminationConfig): string {
    if (config.mode === 'lumen') {
      return `
// Unreal Engine 5 — Lumen GI
FPostProcessSettings PPSettings;
PPSettings.bOverride_DynamicGlobalIlluminationMethod = true;
PPSettings.DynamicGlobalIlluminationMethod = EDynamicGlobalIlluminationMethod::Lumen;
PPSettings.bOverride_LumenSceneLightingQuality = true;
PPSettings.LumenSceneLightingQuality = 1.0f;
PPSettings.bOverride_LumenFinalGatherQuality = true;
PPSettings.LumenFinalGatherQuality = 1.0f;
PPSettings.bOverride_LumenSceneDetail = true;
PPSettings.LumenSceneDetail = 1.0f;
PPSettings.bOverride_LumenMaxTraceDistance = true;
PPSettings.LumenMaxTraceDistance = 20000.0f;
PPSettings.bOverride_LumenSkyLightLeaking = true;
PPSettings.LumenSkyLightLeaking = ${config.skyIntensity ?? 0.0}f;
`;
    }

    if (config.mode === 'lightmap') {
      return `
// Unreal Engine — Lightmass Baking
// Enable in World Settings:
// - Static Lighting Level Scale: 1.0
// - Num Indirect Lighting Bounces: ${config.lightmap?.bounces ?? 4}
// - Num Sky Lighting Bounces: 1
// Use "Build > Build Lighting Only" from the editor menu.
// Resolution: ${config.lightmap?.resolution ?? 64} texels/unit
ALightmassImportanceVolume* vol = World->SpawnActor<ALightmassImportanceVolume>();
vol->Brush->BuildBounds();
`;
    }

    return `
// Unreal Engine — Sky Light (SH probe fallback)
ASkyLight* SkyLight = World->SpawnActor<ASkyLight>();
SkyLight->GetLightComponent()->SetIntensity(${config.skyIntensity ?? 1.0}f);
SkyLight->GetLightComponent()->SetCastStaticShadows(true);
SkyLight->GetLightComponent()->SetCastDynamicShadows(${config.supportDynamicObjects ?? false});
SkyLight->GetLightComponent()->RecaptureSky();
`;
  },

  compileWeb(config: GlobalIlluminationConfig): string {
    return `
// Three.js — PMREMGenerator + LightProbe (SH-based GI)
import * as THREE from 'three';
import { PMREMGenerator } from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader';

async function setupGlobalIllumination(renderer, scene) {
    const pmremGenerator = new PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();

    ${config.mode === 'lightmap' ? `
    // Lightmap — bake offline, apply per mesh
    const lightmapLoader = new THREE.TextureLoader();
    scene.traverse((obj) => {
        if (obj.isMesh && obj.userData.lightmap) {
            const lightmap = lightmapLoader.load(obj.userData.lightmap);
            obj.material.lightMap = lightmap;
            obj.material.lightMapIntensity = ${config.skyIntensity ?? 1.0};
        }
    });
    ` : `
    // Environment map as SH GI approximation
    const rgbeLoader = new RGBELoader();
    const hdrTexture = await rgbeLoader.loadAsync('environment.hdr');
    const envMap = pmremGenerator.fromEquirectangular(hdrTexture).texture;
    scene.environment = envMap;
    scene.background = envMap;
    renderer.toneMappingExposure = ${config.skyIntensity ?? 1.0};
    `}

    ${config.supportDynamicObjects ? `
    // LightProbe for dynamic objects
    import { LightProbeGenerator } from 'three/examples/jsm/lights/LightProbeGenerator';
    const lightProbe = LightProbeGenerator.fromCubeRenderTarget(renderer, cubeRenderTarget);
    lightProbe.intensity = ${config.skyIntensity ?? 1.0};
    scene.add(lightProbe);
    ` : ''}
}
`;
  },

  compileWebGPU(config: GlobalIlluminationConfig): string {
    return `
// WebGPU — SH Probe Evaluation
struct SHCoeffs {
    L00: vec3<f32>,
    L10: vec3<f32>, L11: vec3<f32>, L12: vec3<f32>,
    L20: vec3<f32>, L21: vec3<f32>, L22: vec3<f32>, L23: vec3<f32>, L24: vec3<f32>,
}
@group(0) @binding(0) var<uniform> sh: SHCoeffs;

fn evaluateSH(normal: vec3<f32>) -> vec3<f32> {
    // L0
    var irradiance = sh.L00 * 0.282095;
    // L1
    irradiance += sh.L10 * 0.488603 * normal.y;
    irradiance += sh.L11 * 0.488603 * normal.z;
    irradiance += sh.L12 * 0.488603 * normal.x;
    // L2
    irradiance += sh.L20 * 1.092548 * normal.x * normal.y;
    irradiance += sh.L21 * 1.092548 * normal.y * normal.z;
    irradiance += sh.L22 * 0.315392 * (3.0 * normal.z * normal.z - 1.0);
    irradiance += sh.L23 * 1.092548 * normal.x * normal.z;
    irradiance += sh.L24 * 0.546274 * (normal.x * normal.x - normal.y * normal.y);
    return max(irradiance * ${config.skyIntensity ?? 1.0}, vec3<f32>(0.0));
}

// Probe grid: ${config.sh?.gridResolution.join('x') ?? '4x4x4'}, cell ${config.sh?.cellSize ?? 2}m
`;
  },

  compileGeneric(config: GlobalIlluminationConfig): string {
    return `// GlobalIllumination config\n${JSON.stringify(config, null, 2)}`;
  },
};
