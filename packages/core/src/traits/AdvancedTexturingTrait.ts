/**
 * AdvancedTexturingTrait
 *
 * Displacement mapping, Parallax Occlusion Mapping (POM), triplanar mapping,
 * detail maps, and texture atlas packing configuration.
 *
 * @version 1.0.0
 */
import type { TraitHandler } from './TraitTypes';

export type TexMappingMode = 'standard' | 'triplanar' | 'pom' | 'displacement' | 'detail';

export interface DisplacementConfig {
  heightMap: string;
  scale: number;           // World units
  bias: number;            // Midpoint offset
  tessellationLevel?: number;
}

export interface POMConfig {
  heightMap: string;
  scale: number;           // UV parallax strength
  steps: number;           // Ray march iterations (8–64)
  refinementSteps?: number;// Binary search refinement
  selfShadow?: boolean;
}

export interface TriplanarConfig {
  albedoMapX: string;
  albedoMapY: string;
  albedoMapZ: string;
  scale: number;
  blendSharpness?: number; // 1–8, higher = harder blend
}

export interface DetailMapConfig {
  albedoMap: string;
  normalMap: string;
  scale: number;
  intensity: number;
}

export interface TextureAtlasConfig {
  width: number;
  height: number;
  padding?: number;
  mipLevels?: number;
}

export interface AdvancedTexturingConfig {
  mode: TexMappingMode;
  displacement?: DisplacementConfig;
  pom?: POMConfig;
  triplanar?: TriplanarConfig;
  detail?: DetailMapConfig;
  atlas?: TextureAtlasConfig;
}

export const AdvancedTexturingTrait: TraitHandler<AdvancedTexturingConfig> = {
  name: 'advanced_texturing',

  validate(config: AdvancedTexturingConfig): boolean {
    const valid: TexMappingMode[] = ['standard', 'triplanar', 'pom', 'displacement', 'detail'];
    if (!valid.includes(config.mode)) throw new Error(`Invalid texturing mode: ${config.mode}`);
    if (config.mode === 'displacement' && !config.displacement) throw new Error('displacement mode requires displacement config');
    if (config.mode === 'pom' && !config.pom) throw new Error('pom mode requires pom config');
    if (config.mode === 'triplanar' && !config.triplanar) throw new Error('triplanar mode requires triplanar config');
    if (config.mode === 'detail' && !config.detail) throw new Error('detail mode requires detail config');
    if (config.displacement) {
      if (config.displacement.scale === 0) throw new Error('displacement.scale must not be 0');
    }
    if (config.pom) {
      if (config.pom.steps < 1) throw new Error('pom.steps must be >= 1');
      if (config.pom.scale <= 0) throw new Error('pom.scale must be > 0');
    }
    if (config.atlas) {
      if (config.atlas.width <= 0 || config.atlas.height <= 0) throw new Error('atlas dimensions must be > 0');
    }
    return true;
  },

  compile(config: AdvancedTexturingConfig, target: string): string {
    switch (target) {
      case 'unity': return this.compileUnity(config);
      case 'unreal': return this.compileUnreal(config);
      case 'web': case 'react-three-fiber': case 'babylon': return this.compileWeb(config);
      case 'webgpu': return this.compileWebGPU(config);
      default: return this.compileGeneric(config);
    }
  },

  compileUnity(config: AdvancedTexturingConfig): string {
    const { displacement: d, pom: p, triplanar: t, detail: det } = config;
    return `// Unity HDRP — Advanced Texturing
using UnityEngine;
public class AdvancedTexturingSetup : MonoBehaviour {
    void Start() {
        var mat = GetComponent<MeshRenderer>().material;
        ${d ? `// Displacement / Tessellation
        mat.EnableKeyword("_TESSELLATION_PHONG");
        mat.SetTexture("_HeightMap", Resources.Load<Texture2D>("${d.heightMap}"));
        mat.SetFloat("_HeightAmplitude", ${d.scale}f);
        mat.SetFloat("_HeightCenter", ${0.5 + d.bias}f);
        mat.SetFloat("_TessellationFactorTriEdge", ${d.tessellationLevel ?? 4}f);` : ''}
        ${p ? `// Parallax Occlusion Mapping
        mat.EnableKeyword("_PIXEL_DISPLACEMENT");
        mat.SetTexture("_HeightMap", Resources.Load<Texture2D>("${p.heightMap}"));
        mat.SetFloat("_HeightAmplitude", ${p.scale}f);
        mat.SetInt("_PPDMaxSamples", ${p.steps});` : ''}
        ${t ? `// Triplanar Mapping (custom shader / ShaderGraph)
        mat.SetTexture("_MainTexX", Resources.Load<Texture2D>("${t.albedoMapX}"));
        mat.SetTexture("_MainTexY", Resources.Load<Texture2D>("${t.albedoMapY}"));
        mat.SetTexture("_MainTexZ", Resources.Load<Texture2D>("${t.albedoMapZ}"));
        mat.SetFloat("_TriplanarScale", ${t.scale}f);` : ''}
        ${det ? `// Detail Map
        mat.EnableKeyword("_DETAIL_MAP");
        mat.SetTexture("_DetailMap", Resources.Load<Texture2D>("${det.albedoMap}"));
        mat.SetFloat("_DetailAlbedoScale", ${det.intensity}f);
        mat.SetTexture("_DetailNormalMap", Resources.Load<Texture2D>("${det.normalMap}"));` : ''}
    }
}`;
  },

  compileUnreal(config: AdvancedTexturingConfig): string {
    const { displacement: d, pom: p, triplanar: t } = config;
    return `// Unreal Engine — Advanced Texturing Material
// Open Material Editor to configure:
${d ? `// Displacement: World Position Offset node
// HeightMap: "${d.heightMap}", Scale: ${d.scale}, Bias: ${d.bias}
// Tessellation: Enable in Material Details > Tessellation` : ''}
${p ? `// Parallax Occlusion Mapping: Use "Parallax Occlusion Mapping" material function
// HeightMap: "${p.heightMap}", HeightRatio: ${p.scale}, Steps: ${p.steps}` : ''}
${t ? `// Triplanar: Use "Triplanar Texture Mapping" material function
// XTex: "${t.albedoMapX}", YTex: "${t.albedoMapY}", ZTex: "${t.albedoMapZ}"
// Scale: ${t.scale}, BlendSharpness: ${t.blendSharpness ?? 2}` : ''}
// Note: All textures should be imported as Texture2D assets.`;
  },

  compileWeb(config: AdvancedTexturingConfig): string {
    const { displacement: d, pom: p, triplanar: t } = config;
    return `// Three.js — Advanced Texturing
import * as THREE from 'three';
const loader = new THREE.TextureLoader();
${d ? `// Displacement Mapping
const material = new THREE.MeshStandardMaterial({
    displacementMap: loader.load('${d.heightMap}'),
    displacementScale: ${d.scale},
    displacementBias: ${d.bias},
});
// Note: Mesh must have sufficient vertex density for displacement.` : ''}
${p ? `// POM — requires custom ShaderMaterial
// Inject parallax_fragment into MeshStandardMaterial.onBeforeCompile
// HeightMap: '${p.heightMap}', scale: ${p.scale}, steps: ${p.steps}` : ''}
${t ? `// Triplanar — custom ShaderMaterial or onBeforeCompile injection
const texX = loader.load('${t.albedoMapX}');
const texY = loader.load('${t.albedoMapY}');
const texZ = loader.load('${t.albedoMapZ}');
// Blend based on abs(worldNormal)` : ''}`;
  },

  compileWebGPU(config: AdvancedTexturingConfig): string {
    const { pom: p, triplanar: t } = config;
    return `// WebGPU — Advanced Texturing Shaders
${p ? `// Parallax Occlusion Mapping
@group(0) @binding(0) var heightMap: texture_2d<f32>;
@group(0) @binding(1) var s: sampler;

fn pomOffset(uv: vec2<f32>, viewDirTS: vec3<f32>) -> vec2<f32> {
    let stepSize = 1.0 / f32(${p.steps});
    var currentUV = uv;
    var currentDepth = 0.0;
    var prevUV = uv;
    for (var i = 0; i < ${p.steps}; i++) {
        prevUV = currentUV;
        currentUV -= viewDirTS.xy * (${p.scale} * stepSize);
        currentDepth += stepSize;
        let mapDepth = 1.0 - textureSample(heightMap, s, currentUV).r;
        if (mapDepth < currentDepth) { break; }
    }
    return mix(prevUV, currentUV, 0.5); // Binary refinement approximation
}` : ''}

${t ? `// Triplanar Mapping
@group(1) @binding(0) var texX: texture_2d<f32>;
@group(1) @binding(1) var texY: texture_2d<f32>;
@group(1) @binding(2) var texZ: texture_2d<f32>;
@group(1) @binding(3) var ts: sampler;

fn triplanarSample(worldPos: vec3<f32>, worldNormal: vec3<f32>) -> vec4<f32> {
    let scale = ${t.scale};
    let blendW = pow(abs(worldNormal), vec3<f32>(${t.blendSharpness ?? 4}));
    let normW = blendW / (blendW.x + blendW.y + blendW.z);
    let cx = textureSample(texX, ts, worldPos.yz * scale);
    let cy = textureSample(texY, ts, worldPos.xz * scale);
    let cz = textureSample(texZ, ts, worldPos.xy * scale);
    return cx * normW.x + cy * normW.y + cz * normW.z;
}` : ''}`;
  },

  compileGeneric(config: AdvancedTexturingConfig): string {
    return `// AdvancedTexturing config\n${JSON.stringify(config, null, 2)}`;
  },
};
