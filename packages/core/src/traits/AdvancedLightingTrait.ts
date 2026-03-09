/**
 * AdvancedLightingTrait
 *
 * Area lights (rectangle, disk), IES photometric profiles,
 * emissive mesh lights, and light cookies.
 *
 * @version 1.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

export type AdvancedLightType = 'area_rect' | 'area_disk' | 'ies' | 'emissive_mesh' | 'cookie';

export interface AreaRectLightConfig {
  width: number;
  height: number;
  intensity: number; // Lumens
  color: [number, number, number];
  doubleSided?: boolean;
  castShadows?: boolean;
  shadowResolution?: number;
}

export interface AreaDiskLightConfig {
  radius: number;
  intensity: number;
  color: [number, number, number];
  castShadows?: boolean;
}

export interface IESLightConfig {
  profilePath: string; // Path to .ies file
  intensity: number;
  color: [number, number, number];
  scale?: number; // Photometric power scale
}

export interface EmissiveMeshLightConfig {
  meshRef: string; // Reference to mesh object
  emissiveColor: [number, number, number];
  emissiveIntensity: number; // Multiplier
  /** If true, this mesh actually illuminates the scene (baked or RT) */
  contributesToGI?: boolean;
}

export interface LightCookieConfig {
  texturePath: string; // Cookie texture path
  lightType: 'spot' | 'point' | 'directional';
  intensity: number;
  angle?: number; // For spot lights (degrees)
  size?: number; // For directional cookies (world units)
}

export interface AdvancedLightingConfig {
  lights: Array<
    | { type: 'area_rect'; config: AreaRectLightConfig }
    | { type: 'area_disk'; config: AreaDiskLightConfig }
    | { type: 'ies'; config: IESLightConfig }
    | { type: 'emissive_mesh'; config: EmissiveMeshLightConfig }
    | { type: 'cookie'; config: LightCookieConfig }
  >;
}

// =============================================================================
// TRAIT HANDLER
// =============================================================================

export const AdvancedLightingTrait: TraitHandler<AdvancedLightingConfig> = {
  name: 'advanced_lighting',

  validate(config: AdvancedLightingConfig): boolean {
    if (!Array.isArray(config.lights) || config.lights.length === 0) {
      throw new Error('advanced_lighting requires at least one light entry');
    }
    for (const entry of config.lights) {
      const validTypes: AdvancedLightType[] = [
        'area_rect',
        'area_disk',
        'ies',
        'emissive_mesh',
        'cookie',
      ];
      if (!validTypes.includes(entry.type as AdvancedLightType)) {
        throw new Error(`Unknown light type: ${entry.type}`);
      }
      if (entry.type === 'area_rect') {
        const c = (entry as { type: 'area_rect'; config: AreaRectLightConfig }).config;
        if (c.width <= 0 || c.height <= 0)
          throw new Error('area_rect: width and height must be > 0');
        if (c.intensity < 0) throw new Error('area_rect: intensity must be >= 0');
      }
      if (entry.type === 'area_disk') {
        const c = (entry as { type: 'area_disk'; config: AreaDiskLightConfig }).config;
        if (c.radius <= 0) throw new Error('area_disk: radius must be > 0');
      }
      if (entry.type === 'ies') {
        const c = (entry as { type: 'ies'; config: IESLightConfig }).config;
        if (!c.profilePath) throw new Error('ies: profilePath is required');
      }
    }
    return true;
  },

  compile(config: AdvancedLightingConfig, target: string): string {
    switch (target) {
      case 'unity':
        return this.compileUnity(config);
      case 'unreal':
        return this.compileUnreal(config);
      case 'web':
      case 'react-three-fiber':
      case 'babylon':
        return this.compileWeb(config);
      case 'webgpu':
        return this.compileWebGPU(config);
      default:
        return this.compileGeneric(config);
    }
  },

  compileUnity(config: AdvancedLightingConfig): string {
    const blocks: string[] = [];
    for (const entry of config.lights) {
      if (entry.type === 'area_rect') {
        const c = (entry as { type: 'area_rect'; config: AreaRectLightConfig }).config;
        blocks.push(`
        // Area Rectangle Light
        var areaGO = new GameObject("AreaRectLight");
        var areaLight = areaGO.AddComponent<Light>();
        areaLight.type = LightType.Rectangle;
        areaLight.areaSize = new Vector2(${c.width}f, ${c.height}f);
        areaLight.intensity = ${c.intensity}f;
        areaLight.color = new Color(${c.color.join(', ')});
        areaLight.shadows = ${c.castShadows ? 'LightShadows.Soft' : 'LightShadows.None'};
        `);
      } else if (entry.type === 'area_disk') {
        const c = (entry as { type: 'area_disk'; config: AreaDiskLightConfig }).config;
        blocks.push(`
        // Area Disk Light
        var diskGO = new GameObject("AreaDiskLight");
        var diskLight = diskGO.AddComponent<Light>();
        diskLight.type = LightType.Disc;
        diskLight.areaSize = new Vector2(${c.radius}f, ${c.radius}f);
        diskLight.intensity = ${c.intensity}f;
        diskLight.color = new Color(${c.color.join(', ')});
        `);
      } else if (entry.type === 'ies') {
        const c = (entry as { type: 'ies'; config: IESLightConfig }).config;
        blocks.push(`
        // IES Light (HDRP)
        // Load IES asset: Resources.Load<IESObject>("${c.profilePath}")
        var iesGO = new GameObject("IESLight");
        var iesLight = iesGO.AddComponent<HDAdditionalLightData>();
        iesLight.intensity = ${c.intensity}f;
        // iesLight.iesAsset = Resources.Load<IESObject>("${c.profilePath}");
        `);
      } else if (entry.type === 'cookie') {
        const c = (entry as { type: 'cookie'; config: LightCookieConfig }).config;
        blocks.push(`
        // Light Cookie
        var cookieLight = FindObjectOfType<Light>();
        cookieLight.cookie = Resources.Load<Texture>("${c.texturePath}");
        cookieLight.cookieSize = ${c.size ?? 10}f;
        `);
      }
    }
    return `
// Unity HDRP — Advanced Lighting
using UnityEngine;
using UnityEngine.Rendering.HighDefinition;

public class AdvancedLightingSetup : MonoBehaviour {
    void Start() {
        ${blocks.join('\n')}
    }
}
`;
  },

  compileUnreal(config: AdvancedLightingConfig): string {
    const blocks: string[] = [];
    for (const entry of config.lights) {
      if (entry.type === 'area_rect') {
        const c = (entry as { type: 'area_rect'; config: AreaRectLightConfig }).config;
        blocks.push(`
    // Rect Light
    ARectLight* RectLight = World->SpawnActor<ARectLight>();
    RectLight->GetLightComponent()->SetIntensity(${c.intensity}f);
    RectLight->GetLightComponent()->SetLightColor(FLinearColor(${c.color.join(', ')}));
    Cast<URectLightComponent>(RectLight->GetLightComponent())->SetSourceWidth(${c.width}f);
    Cast<URectLightComponent>(RectLight->GetLightComponent())->SetSourceHeight(${c.height}f);
    RectLight->GetLightComponent()->SetCastShadows(${c.castShadows ?? true});`);
      } else if (entry.type === 'ies') {
        const c = (entry as { type: 'ies'; config: IESLightConfig }).config;
        blocks.push(`
    // IES Point Light
    APointLight* IESLight = World->SpawnActor<APointLight>();
    IESLight->GetLightComponent()->SetIntensity(${c.intensity}f);
    // IESTexture = LoadObject<UTextureLightProfile>(nullptr, TEXT("${c.profilePath}"));
    // IESLight->GetLightComponent()->SetIESTexture(IESTexture);`);
      }
    }
    return `
// Unreal Engine — Advanced Lighting
#include "Engine/RectLight.h"
#include "Engine/PointLight.h"

void AAdvancedLightingActor::SetupLights() {
${blocks.join('\n')}
}
`;
  },

  compileWeb(config: AdvancedLightingConfig): string {
    const imports: string[] = ["import * as THREE from 'three';"];
    const setup: string[] = [];
    for (const entry of config.lights) {
      if (entry.type === 'area_rect') {
        const c = (entry as { type: 'area_rect'; config: AreaRectLightConfig }).config;
        setup.push(`
    // RectAreaLight
    const rectLight = new THREE.RectAreaLight(
        new THREE.Color(${c.color.join(', ')}),
        ${c.intensity},
        ${c.width},
        ${c.height}
    );
    scene.add(rectLight);
    // For physically correct rendering, add RectAreaLightHelper and RectAreaLightUniformsLib`);
      } else if (entry.type === 'area_disk') {
        const c = (entry as { type: 'area_disk'; config: AreaDiskLightConfig }).config;
        setup.push(`
    // Disk light (approximated as RectAreaLight)
    const diskLight = new THREE.RectAreaLight(
        new THREE.Color(${c.color.join(', ')}),
        ${c.intensity},
        ${c.radius * 2},
        ${c.radius * 2}
    );
    scene.add(diskLight);`);
      } else if (entry.type === 'cookie') {
        const c = (entry as { type: 'cookie'; config: LightCookieConfig }).config;
        setup.push(`
    // Light Cookie — Spot light with cookie texture
    const cookieTex = new THREE.TextureLoader().load('${c.texturePath}');
    const spotLight = new THREE.SpotLight(0xffffff, ${c.intensity});
    spotLight.map = cookieTex;
    spotLight.angle = ${((c.angle ?? 45) * Math.PI) / 180};
    scene.add(spotLight);`);
      } else if (entry.type === 'emissive_mesh') {
        const c = (entry as { type: 'emissive_mesh'; config: EmissiveMeshLightConfig }).config;
        setup.push(`
    // Emissive mesh light
    const emissiveMat = new THREE.MeshStandardMaterial({
        emissive: new THREE.Color(${c.emissiveColor.join(', ')}),
        emissiveIntensity: ${c.emissiveIntensity},
    });
    scene.getObjectByName('${c.meshRef}').material = emissiveMat;`);
      }
    }
    return `${imports.join('\n')}\n\nfunction setupAdvancedLighting(scene) {${setup.join('\n')}\n}`;
  },

  compileWebGPU(config: AdvancedLightingConfig): string {
    const areaLights = config.lights.filter(
      (l) => l.type === 'area_rect' || l.type === 'area_disk'
    );
    return `
// WebGPU — Area Light BRDF Integration
// Linearly Transformed Cosines (LTC) for area lights

struct AreaLight {
    position: vec3<f32>,
    color: vec3<f32>,
    intensity: f32,
    width: f32,
    height: f32,
    twoSided: u32,
}
@group(0) @binding(0) var<storage, read> areaLights: array<AreaLight, ${Math.max(areaLights.length, 1)}>;
@group(0) @binding(1) var ltcMat: texture_2d<f32>;
@group(0) @binding(2) var ltcMag: texture_2d<f32>;
@group(0) @binding(3) var ltcSampler: sampler;

fn evaluateLTC(normal: vec3<f32>, view: vec3<f32>, pos: vec3<f32>, roughness: f32, light: AreaLight) -> vec3<f32> {
    let NdotV = clamp(dot(normal, view), 0.0, 1.0);
    let uv = vec2<f32>(roughness, sqrt(1.0 - NdotV));
    let ltcCoeffs = textureSample(ltcMat, ltcSampler, uv);

    // Transform to LTC space and integrate polygon
    // (full LTC polygon integration omitted — see Heitz 2016 paper)
    return light.color * light.intensity;
}

@fragment
fn main(@location(0) worldPos: vec3<f32>,
        @location(1) worldNormal: vec3<f32>) -> @location(0) vec4<f32> {
    let normal = normalize(worldNormal);
    let view = normalize(cameraPos - worldPos);
    var totalLight = vec3<f32>(0.0);
    for (var i = 0u; i < ${Math.max(areaLights.length, 1)}u; i++) {
        totalLight += evaluateLTC(normal, view, worldPos, roughness, areaLights[i]);
    }
    return vec4<f32>(totalLight, 1.0);
}
`;
  },

  compileGeneric(config: AdvancedLightingConfig): string {
    return `// AdvancedLighting config\n${JSON.stringify(config, null, 2)}`;
  },
};
