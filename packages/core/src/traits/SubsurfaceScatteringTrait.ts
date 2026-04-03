/**
 * SubsurfaceScatteringTrait
 *
 * SSS material: skin, wax, marble, jade, leaf presets.
 * Burley / Christensen-Burley / screen-space methods.
 *
 * @version 1.0.0
 */
import type { TraitHandler } from './TraitTypes';

export type SSSMethod = 'burley' | 'christensen_burley' | 'random_walk' | 'screen_space';
export type SSSPreset = 'skin' | 'wax' | 'jade' | 'marble' | 'leaf' | 'custom';

export interface SSSColor {
  r: number;
  g: number;
  b: number;
}

export interface SubsurfaceScatteringConfig {
  method: SSSMethod;
  preset?: SSSPreset;
  scatterRadius: SSSColor;
  intensity: number;
  subsurfaceColor: SSSColor;
  transmission?: { enabled: boolean; thickness: number };
  thicknessMap?: string;
  subsurfaceColorMap?: string;
}

const PRESETS: Record<SSSPreset, Partial<SubsurfaceScatteringConfig>> = {
  skin: {
    scatterRadius: { r: 1.0, g: 0.2, b: 0.1 },
    intensity: 1.0,
    subsurfaceColor: { r: 0.8, g: 0.5, b: 0.4 },
  },
  wax: {
    scatterRadius: { r: 0.3, g: 0.3, b: 0.2 },
    intensity: 0.8,
    subsurfaceColor: { r: 0.9, g: 0.8, b: 0.6 },
  },
  jade: {
    scatterRadius: { r: 0.05, g: 0.15, b: 0.05 },
    intensity: 0.6,
    subsurfaceColor: { r: 0.1, g: 0.7, b: 0.3 },
  },
  marble: {
    scatterRadius: { r: 0.2, g: 0.2, b: 0.2 },
    intensity: 0.5,
    subsurfaceColor: { r: 0.9, g: 0.9, b: 0.9 },
  },
  leaf: {
    scatterRadius: { r: 0.05, g: 0.4, b: 0.05 },
    intensity: 0.7,
    subsurfaceColor: { r: 0.1, g: 0.8, b: 0.1 },
  },
  custom: {},
};

export const SubsurfaceScatteringTrait: TraitHandler<SubsurfaceScatteringConfig> = {
  name: 'subsurface_scattering',

  validate(config: SubsurfaceScatteringConfig): boolean {
    const validMethods: SSSMethod[] = [
      'burley',
      'christensen_burley',
      'random_walk',
      'screen_space',
    ];
    if (!validMethods.includes(config.method))
      throw new Error(`Invalid SSS method: ${config.method}`);
    if (config.intensity < 0) throw new Error('SSS intensity must be >= 0');
    const rgb = (c: SSSColor) => [c.r, c.g, c.b].every((v) => v >= 0);
    if (!rgb(config.scatterRadius)) throw new Error('scatterRadius channels must be >= 0');
    if (!rgb(config.subsurfaceColor)) throw new Error('subsurfaceColor channels must be >= 0');
    if (config.transmission?.enabled && config.transmission.thickness <= 0) {
      throw new Error('transmission.thickness must be > 0');
    }
    return true;
  },

  compile(config: SubsurfaceScatteringConfig, target: string): string {
    const c =
      config.preset && config.preset !== 'custom'
        ? ({ ...PRESETS[config.preset], ...config } as SubsurfaceScatteringConfig)
        : config;
    const self = this as unknown as Record<string, (c: SubsurfaceScatteringConfig) => string>;
    switch (target) {
      case 'unity':
        return self.compileUnity(c);
      case 'unreal':
        return self.compileUnreal(c);
      case 'web':
      case 'react-three-fiber':
      case 'babylon':
        return self.compileWeb(c);
      case 'webgpu':
        return self.compileWebGPU(c);
      default:
        return self.compileGeneric(c);
    }
  },

  compileUnity(config: SubsurfaceScatteringConfig): string {
    const { subsurfaceColor: sc, intensity, transmission: tx, thicknessMap } = config;
    return `// Unity HDRP — SSS
using UnityEngine;
public class SSSSetup : MonoBehaviour {
    void Start() {
        var mat = GetComponent<MeshRenderer>().material;
        mat.shader = Shader.Find("HDRP/Lit");
        mat.EnableKeyword("_MATERIAL_FEATURE_SUBSURFACE_SCATTERING");
        mat.SetColor("_SubsurfaceColor", new Color(${sc.r}f, ${sc.g}f, ${sc.b}f));
        mat.SetFloat("_SubsurfaceMask", ${intensity}f);
        ${
          thicknessMap
            ? `mat.SetTexture("_ThicknessMap", Resources.Load<Texture2D>("${thicknessMap}"));`
            : `mat.SetFloat("_Thickness", ${tx?.thickness ?? 0.1}f);`
        }
        ${tx?.enabled ? 'mat.EnableKeyword("_MATERIAL_FEATURE_TRANSMISSION");' : ''}
    }
}`;
  },

  compileUnreal(config: SubsurfaceScatteringConfig): string {
    const { scatterRadius: sr, subsurfaceColor: sc, intensity } = config;
    return `// Unreal Engine — Subsurface Profile
USubsurfaceProfile* Profile = NewObject<USubsurfaceProfile>();
FSubsurfaceProfileStruct Data;
Data.MeanFreePathColor = FLinearColor(${sr.r}f, ${sr.g}f, ${sr.b}f);
Data.MeanFreePathDistance = ${Math.max(sr.r, sr.g, sr.b)}f;
Data.SurfaceAlbedo = FLinearColor(${sc.r}f, ${sc.g}f, ${sc.b}f);
Profile->Settings = Data;
DynMat->SetScalarParameterValue("SSSIntensity", ${intensity}f);`;
  },

  compileWeb(config: SubsurfaceScatteringConfig): string {
    const { scatterRadius: sr, subsurfaceColor: sc, intensity, transmission: tx } = config;
    return `// Three.js — Custom SSS shader
import * as THREE from 'three';
const sssMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(${sc.r}, ${sc.g}, ${sc.b}),
});
sssMat.onBeforeCompile = (shader) => {
    shader.uniforms.sssColor = { value: new THREE.Color(${sc.r}, ${sc.g}, ${sc.b}) };
    shader.uniforms.sssRadius = { value: new THREE.Vector3(${sr.r}, ${sr.g}, ${sr.b}) };
    shader.uniforms.sssIntensity = { value: ${intensity} };
    ${tx?.enabled ? `shader.uniforms.sssThickness = { value: ${tx.thickness} };` : ''}
    // SSS wrap diffuse injection in fragment shader
};
export default sssMat;`;
  },

  compileWebGPU(config: SubsurfaceScatteringConfig): string {
    const { scatterRadius: sr, subsurfaceColor: sc, intensity } = config;
    return `// WebGPU — Burley SSS
struct SSSUniforms {
    color: vec3<f32>, intensity: f32,
    radiusR: f32, radiusG: f32, radiusB: f32, _pad: f32,
}
@group(0) @binding(0) var<uniform> sss: SSSUniforms;

fn burleySSS(normal: vec3<f32>, light: vec3<f32>, lightColor: vec3<f32>) -> vec3<f32> {
    let wrap = max(0.0, (dot(normal, light) + 0.3) / 1.3);
    return vec3<f32>(${sc.r}, ${sc.g}, ${sc.b}) * lightColor * wrap * ${intensity};
}
// scatterRadii = (${sr.r}, ${sr.g}, ${sr.b})
`;
  },

  compileGeneric(config: SubsurfaceScatteringConfig): string {
    return `// SubsurfaceScattering config\n${JSON.stringify(config, null, 2)}`;
  },
};
