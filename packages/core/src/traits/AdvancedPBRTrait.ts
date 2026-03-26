/**
 * Advanced PBR Material Trait
 *
 * Extends basic PBR with advanced material features:
 * - Clearcoat (car paint, lacquer)
 * - Anisotropy (brushed metal, hair)
 * - Sheen (fabric, velvet)
 * - Subsurface Scattering (skin, wax, marble)
 * - Iridescence (soap bubbles, oil slicks)
 * - Transmission (glass, water)
 *
 * @version 1.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

export interface ClearcoatConfig {
  intensity: number; // 0-1
  roughness: number; // 0-1
  normal_map?: string;
  ior?: number; // Index of refraction (default: 1.5)
}

export interface AnisotropyConfig {
  strength: number; // 0-1
  rotation: number; // 0-360 degrees
  tangent_map?: string;
  direction?: 'u' | 'v' | 'radial';
}

export interface SheenConfig {
  color: [number, number, number]; // RGB
  roughness: number; // 0-1
  intensity: number; // 0-1
}

interface SubsurfaceScatteringConfig {
  method: 'burley' | 'christensen' | 'random_walk';
  color: [number, number, number]; // RGB
  radius: number; // Scattering distance
  thickness: number; // Object thickness
  thickness_map?: string;
  power?: number; // Light falloff exponent
}

export interface IridescenceConfig {
  intensity: number; // 0-1
  ior: number; // Thin film IOR
  thickness_min: number; // Nanometers
  thickness_max: number; // Nanometers
  thickness_map?: string;
}

export interface TransmissionConfig {
  factor: number; // 0-1 (opacity)
  ior: number; // Index of refraction
  thickness: number;
  attenuation_distance: number;
  attenuation_color: [number, number, number]; // RGB
  dispersion?: number; // Chromatic dispersion
}

export interface AdvancedPBRConfig {
  // Base PBR (required)
  base_color: [number, number, number] | string;
  metallic?: number;
  roughness?: number;

  // Advanced features (optional)
  clearcoat?: ClearcoatConfig;
  anisotropy?: AnisotropyConfig;
  sheen?: SheenConfig;
  subsurface_scattering?: SubsurfaceScatteringConfig;
  iridescence?: IridescenceConfig;
  transmission?: TransmissionConfig;

  // Texture maps
  albedo_map?: string;
  normal_map?: string;
  roughness_map?: string;
  metallic_map?: string;
  ao_map?: string; // Ambient occlusion
  emissive_map?: string;

  // Workflow
  workflow?: 'metallic_roughness' | 'specular_glossiness';
}

// =============================================================================
// TRAIT HANDLER
// =============================================================================

export const AdvancedPBRTrait: TraitHandler<AdvancedPBRConfig> = {
  name: 'advanced_pbr',

  validate(config: AdvancedPBRConfig): boolean {
    // Validate base color
    if (Array.isArray(config.base_color)) {
      if (config.base_color.length !== 3) {
        throw new Error('base_color must be [r, g, b] array or hex string');
      }
      if (config.base_color.some((c) => c < 0 || c > 1)) {
        throw new Error('base_color RGB values must be 0-1');
      }
    }

    // Validate clearcoat
    if (config.clearcoat) {
      if (config.clearcoat.intensity < 0 || config.clearcoat.intensity > 1) {
        throw new Error('clearcoat.intensity must be 0-1');
      }
      if (config.clearcoat.roughness < 0 || config.clearcoat.roughness > 1) {
        throw new Error('clearcoat.roughness must be 0-1');
      }
    }

    // Validate anisotropy
    if (config.anisotropy) {
      if (config.anisotropy.strength < 0 || config.anisotropy.strength > 1) {
        throw new Error('anisotropy.strength must be 0-1');
      }
    }

    // Validate SSS
    if (config.subsurface_scattering) {
      if (config.subsurface_scattering.radius <= 0) {
        throw new Error('subsurface_scattering.radius must be > 0');
      }
      console.info(
        'SSS is computationally expensive - consider using texture-based approximation for real-time rendering'
      );
    }

    // Validate transmission
    if (config.transmission) {
      if (config.transmission.factor < 0 || config.transmission.factor > 1) {
        throw new Error('transmission.factor must be 0-1');
      }
      if (config.transmission.ior < 1.0) {
        throw new Error('transmission.ior must be >= 1.0 (vacuum)');
      }
    }

    // Warn about performance
    const featureCount = [
      config.clearcoat,
      config.anisotropy,
      config.sheen,
      config.subsurface_scattering,
      config.iridescence,
      config.transmission,
    ].filter(Boolean).length;

    if (featureCount > 3) {
      console.warn(`Using ${featureCount} advanced PBR features may impact real-time performance`);
    }

    return true;
  },

  compile(config: AdvancedPBRConfig, target: string): string {
    switch (target) {
      case 'unity':
        return this.compileUnity(config);
      case 'unreal':
        return this.compileUnreal(config);
      case 'godot':
        return this.compileGodot(config);
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

  compileUnity(config: AdvancedPBRConfig): string {
    const baseColor = Array.isArray(config.base_color)
      ? `new Color(${config.base_color.join(', ')})`
      : `ColorUtility.TryParseHtmlString("${config.base_color}", out Color color) ? color : Color.white`;

    return `
// Unity HDRP Advanced PBR Material
using UnityEngine;
using UnityEngine.Rendering.HighDefinition;

[RequireComponent(typeof(MeshRenderer))]
public class AdvancedPBRMaterial : MonoBehaviour {
    private Material material;

    void Start() {
        SetupMaterial();
    }

    void SetupMaterial() {
        material = GetComponent<MeshRenderer>().material;
        material.shader = Shader.Find("HDRP/Lit");

        // Base PBR properties
        material.SetColor("_BaseColor", ${baseColor});
        material.SetFloat("_Metallic", ${config.metallic ?? 0.0}f);
        material.SetFloat("_Smoothness", ${1.0 - (config.roughness ?? 0.5)}f);

        ${
          config.albedo_map
            ? `
        material.SetTexture("_BaseColorMap", Resources.Load<Texture2D>("${config.albedo_map}"));
        `
            : ''
        }

        ${
          config.normal_map
            ? `
        material.SetTexture("_NormalMap", Resources.Load<Texture2D>("${config.normal_map}"));
        material.SetFloat("_NormalScale", 1.0f);
        `
            : ''
        }

        ${
          config.clearcoat
            ? `
        // Clearcoat layer
        material.EnableKeyword("_MATERIAL_FEATURE_CLEAR_COAT");
        material.SetFloat("_CoatMask", ${config.clearcoat.intensity}f);
        material.SetFloat("_CoatSmoothness", ${1.0 - config.clearcoat.roughness}f);
        ${
          config.clearcoat.normal_map
            ? `
        material.SetTexture("_CoatNormalMap", Resources.Load<Texture2D>("${config.clearcoat.normal_map}"));
        `
            : ''
        }
        `
            : ''
        }

        ${
          config.anisotropy
            ? `
        // Anisotropic reflections
        material.EnableKeyword("_MATERIAL_FEATURE_ANISOTROPY");
        material.SetFloat("_Anisotropy", ${config.anisotropy.strength}f);
        material.SetFloat("_AnisotropyRotation", ${config.anisotropy.rotation}f);
        ${
          config.anisotropy.tangent_map
            ? `
        material.SetTexture("_TangentMap", Resources.Load<Texture2D>("${config.anisotropy.tangent_map}"));
        `
            : ''
        }
        `
            : ''
        }

        ${
          config.sheen
            ? `
        // Fabric sheen
        material.EnableKeyword("_MATERIAL_FEATURE_SHEEN_COLOR");
        material.SetColor("_SheenColor", new Color(${config.sheen.color.join(', ')}));
        material.SetFloat("_SheenRoughness", ${config.sheen.roughness}f);
        `
            : ''
        }

        ${
          config.subsurface_scattering
            ? `
        // Subsurface scattering
        material.EnableKeyword("_MATERIAL_FEATURE_SUBSURFACE_SCATTERING");
        material.SetInt("_DiffusionProfile", 1); // Skin profile
        material.SetColor("_SubsurfaceColor", new Color(${config.subsurface_scattering.color.join(', ')}));
        material.SetFloat("_SubsurfaceMask", 1.0f);
        ${
          config.subsurface_scattering.thickness_map
            ? `
        material.SetTexture("_ThicknessMap", Resources.Load<Texture2D>("${config.subsurface_scattering.thickness_map}"));
        `
            : `
        material.SetFloat("_Thickness", ${config.subsurface_scattering.thickness}f);
        `
        }
        `
            : ''
        }

        ${
          config.iridescence
            ? `
        // Iridescence (soap bubble effect)
        material.EnableKeyword("_MATERIAL_FEATURE_IRIDESCENCE");
        material.SetFloat("_IridescenceMask", ${config.iridescence.intensity}f);
        material.SetFloat("_IridescenceIor", ${config.iridescence.ior}f);
        material.SetFloat("_IridescenceThicknessMin", ${config.iridescence.thickness_min}f);
        material.SetFloat("_IridescenceThicknessMax", ${config.iridescence.thickness_max}f);
        `
            : ''
        }

        ${
          config.transmission
            ? `
        // Transmission (glass/water)
        material.EnableKeyword("_SURFACE_TYPE_TRANSPARENT");
        material.EnableKeyword("_MATERIAL_FEATURE_TRANSMISSION");
        material.SetFloat("_Transmission", ${config.transmission.factor}f);
        material.SetFloat("_Ior", ${config.transmission.ior}f);
        material.SetFloat("_Thickness", ${config.transmission.thickness}f);
        material.SetFloat("_AttenuationDistance", ${config.transmission.attenuation_distance}f);
        material.SetColor("_AttenuationColor", new Color(${config.transmission.attenuation_color.join(', ')}));
        `
            : ''
        }
    }
}
`;
  },

  compileUnreal(config: AdvancedPBRConfig): string {
    return `
// Unreal Engine Advanced PBR Material Setup
#include "Materials/Material.h"
#include "Materials/MaterialInstanceDynamic.h"

class AAdvancedPBRMaterial : public AActor {
public:
    void SetupMaterial() {
        UMaterialInstanceDynamic* DynMaterial = UMaterialInstanceDynamic::Create(BaseMaterial, this);

        // Base PBR
        DynMaterial->SetVectorParameterValue("BaseColor", FLinearColor(${
          Array.isArray(config.base_color) ? config.base_color.join(', ') : '1, 1, 1'
        }));
        DynMaterial->SetScalarParameterValue("Metallic", ${config.metallic ?? 0.0}f);
        DynMaterial->SetScalarParameterValue("Roughness", ${config.roughness ?? 0.5}f);

        ${
          config.clearcoat
            ? `
        // Clearcoat
        DynMaterial->SetScalarParameterValue("ClearCoat", ${config.clearcoat.intensity}f);
        DynMaterial->SetScalarParameterValue("ClearCoatRoughness", ${config.clearcoat.roughness}f);
        `
            : ''
        }

        ${
          config.anisotropy
            ? `
        // Anisotropy
        DynMaterial->SetScalarParameterValue("Anisotropy", ${config.anisotropy.strength}f);
        `
            : ''
        }

        ${
          config.sheen
            ? `
        // Sheen
        DynMaterial->SetVectorParameterValue("SheenColor", FLinearColor(${config.sheen.color.join(', ')}));
        `
            : ''
        }

        ${
          config.subsurface_scattering
            ? `
        // Subsurface
        DynMaterial->SetVectorParameterValue("SubsurfaceColor", FLinearColor(${config.subsurface_scattering.color.join(', ')}));
        DynMaterial->SetScalarParameterValue("OpacityMask", 1.0f);
        `
            : ''
        }

        StaticMeshComponent->SetMaterial(0, DynMaterial);
    }

private:
    UPROPERTY()
    UMaterial* BaseMaterial;

    UPROPERTY()
    UStaticMeshComponent* StaticMeshComponent;
};
`;
  },

  compileWeb(config: AdvancedPBRConfig): string {
    return `
// Three.js Advanced PBR Material
import * as THREE from 'three';

class AdvancedPBRMaterial extends THREE.MeshPhysicalMaterial {
  constructor() {
    super({
      // Base PBR
      color: ${
        Array.isArray(config.base_color)
          ? `new THREE.Color(${config.base_color.join(', ')})`
          : `new THREE.Color("${config.base_color}")`
      },
      metalness: ${config.metallic ?? 0.0},
      roughness: ${config.roughness ?? 0.5},

      ${
        config.clearcoat
          ? `
      // Clearcoat
      clearcoat: ${config.clearcoat.intensity},
      clearcoatRoughness: ${config.clearcoat.roughness},
      ${
        config.clearcoat.normal_map
          ? `
      clearcoatNormalMap: new THREE.TextureLoader().load('${config.clearcoat.normal_map}'),
      clearcoatNormalScale: new THREE.Vector2(1, 1),
      `
          : ''
      }
      `
          : ''
      }

      ${
        config.anisotropy
          ? `
      // Anisotropy (Three.js r154+)
      anisotropy: ${config.anisotropy.strength},
      anisotropyRotation: ${(config.anisotropy.rotation * Math.PI) / 180},
      `
          : ''
      }

      ${
        config.sheen
          ? `
      // Sheen
      sheen: ${config.sheen.intensity},
      sheenColor: new THREE.Color(${config.sheen.color.join(', ')}),
      sheenRoughness: ${config.sheen.roughness},
      `
          : ''
      }

      ${
        config.transmission
          ? `
      // Transmission
      transmission: ${config.transmission.factor},
      ior: ${config.transmission.ior},
      thickness: ${config.transmission.thickness},
      attenuationDistance: ${config.transmission.attenuation_distance},
      attenuationColor: new THREE.Color(${config.transmission.attenuation_color.join(', ')}),
      `
          : ''
      }

      ${
        config.iridescence
          ? `
      // Iridescence
      iridescence: ${config.iridescence.intensity},
      iridescenceIOR: ${config.iridescence.ior},
      iridescenceThicknessRange: [${config.iridescence.thickness_min}, ${config.iridescence.thickness_max}],
      `
          : ''
      }
    });

    ${
      config.albedo_map
        ? `
    this.map = new THREE.TextureLoader().load('${config.albedo_map}');
    `
        : ''
    }

    ${
      config.normal_map
        ? `
    this.normalMap = new THREE.TextureLoader().load('${config.normal_map}');
    this.normalScale = new THREE.Vector2(1, 1);
    `
        : ''
    }

    ${
      config.roughness_map
        ? `
    this.roughnessMap = new THREE.TextureLoader().load('${config.roughness_map}');
    `
        : ''
    }

    ${
      config.metallic_map
        ? `
    this.metalnessMap = new THREE.TextureLoader().load('${config.metallic_map}');
    `
        : ''
    }

    ${
      config.ao_map
        ? `
    this.aoMap = new THREE.TextureLoader().load('${config.ao_map}');
    this.aoMapIntensity = 1.0;
    `
        : ''
    }

    ${
      config.subsurface_scattering
        ? `
    // Subsurface scattering (custom shader extension required)
    this.onBeforeCompile = (shader) => {
      shader.uniforms.sssColor = { value: new THREE.Color(${config.subsurface_scattering.color.join(', ')}) };
      shader.uniforms.sssRadius = { value: ${config.subsurface_scattering.radius} };
      shader.uniforms.sssThickness = { value: ${config.subsurface_scattering.thickness} };

      // Inject SSS shader code
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <lights_physical_fragment>',
        \`
        #include <lights_physical_fragment>

        // Burley SSS approximation
        vec3 sssApprox = sssColor * pow(clamp(dot(normal, -lightDir), 0.0, 1.0), sssRadius) * sssThickness;
        diffuseColor.rgb += sssApprox;
        \`
      );
    };
    `
        : ''
    }
  }
}

export default AdvancedPBRMaterial;
`;
  },

  compileWebGPU(config: AdvancedPBRConfig): string {
    return `
// WebGPU Advanced PBR Shader
struct AdvancedPBRUniforms {
  baseColor: vec3<f32>,
  metallic: f32,
  roughness: f32,
  ${
    config.clearcoat
      ? `
  clearcoatIntensity: f32,
  clearcoatRoughness: f32,
  `
      : ''
  }
  ${
    config.anisotropy
      ? `
  anisotropyStrength: f32,
  anisotropyRotation: f32,
  `
      : ''
  }
  ${
    config.sheen
      ? `
  sheenColor: vec3<f32>,
  sheenRoughness: f32,
  `
      : ''
  }
}

@group(0) @binding(0) var<uniform> pbr: AdvancedPBRUniforms;

fn advancedBRDF(
  normal: vec3<f32>,
  view: vec3<f32>,
  light: vec3<f32>,
  roughness: f32,
  metallic: f32
) -> vec3<f32> {
  let h = normalize(view + light);
  let NdotH = max(dot(normal, h), 0.0);
  let NdotV = max(dot(normal, view), 0.0);
  let NdotL = max(dot(normal, light), 0.0);
  let VdotH = max(dot(view, h), 0.0);

  // GGX distribution
  let alpha = roughness * roughness;
  let alpha2 = alpha * alpha;
  let denom = NdotH * NdotH * (alpha2 - 1.0) + 1.0;
  let D = alpha2 / (3.14159265 * denom * denom);

  // Schlick-GGX geometry
  let k = (roughness + 1.0) * (roughness + 1.0) / 8.0;
  let G1_V = NdotV / (NdotV * (1.0 - k) + k);
  let G1_L = NdotL / (NdotL * (1.0 - k) + k);
  let G = G1_V * G1_L;

  // Fresnel-Schlick
  let F0 = mix(vec3<f32>(0.04), pbr.baseColor, metallic);
  let F = F0 + (1.0 - F0) * pow(1.0 - VdotH, 5.0);

  // Cook-Torrance BRDF
  let specular = (D * G * F) / max(4.0 * NdotV * NdotL, 0.001);
  let diffuse = (1.0 - F) * (1.0 - metallic) * pbr.baseColor / 3.14159265;

  return (diffuse + specular) * NdotL;
}

${
  config.clearcoat
    ? `
fn clearcoatBRDF(
  normal: vec3<f32>,
  view: vec3<f32>,
  light: vec3<f32>
) -> vec3<f32> {
  let h = normalize(view + light);
  let NdotH = max(dot(normal, h), 0.0);
  let VdotH = max(dot(view, h), 0.0);

  let roughness = pbr.clearcoatRoughness;
  let alpha = roughness * roughness;
  let alpha2 = alpha * alpha;

  // GGX for clearcoat
  let denom = NdotH * NdotH * (alpha2 - 1.0) + 1.0;
  let D = alpha2 / (3.14159265 * denom * denom);

  // Fresnel for clearcoat (IOR = 1.5)
  let F = 0.04 + (1.0 - 0.04) * pow(1.0 - VdotH, 5.0);

  return vec3<f32>(D * F * pbr.clearcoatIntensity);
}
`
    : ''
}

@fragment
fn main(@location(0) worldPos: vec3<f32>,
        @location(1) worldNormal: vec3<f32>) -> @location(0) vec4<f32> {

  let normal = normalize(worldNormal);
  let view = normalize(cameraPos - worldPos);
  let light = normalize(lightPos - worldPos);

  var color = advancedBRDF(normal, view, light, pbr.roughness, pbr.metallic);

  ${
    config.clearcoat
      ? `
  // Add clearcoat layer
  color += clearcoatBRDF(normal, view, light);
  `
      : ''
  }

  return vec4<f32>(color, 1.0);
}
`;
  },

  compileGeneric(config: AdvancedPBRConfig): string {
    return `
// Generic Advanced PBR Configuration
const advancedPBRConfig = ${JSON.stringify(config, null, 2)};

// Note: This is a generic configuration object.
// Platform-specific shader code should be generated by the target compiler.
`;
  },
};
