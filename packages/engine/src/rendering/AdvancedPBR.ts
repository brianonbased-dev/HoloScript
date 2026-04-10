/**
 * AdvancedPBR.ts
 *
 * Advanced Physically-Based Rendering material model.
 *
 * Extends basic PBR (albedo + normal + roughness) with:
 *   - Clearcoat layer (car paint, lacquer, wet surfaces)
 *   - Anisotropy (brushed metal, hair, fabric warp)
 *   - Sheen (velvet, cloth, microfibre)
 *   - Iridescence (soap bubbles, oil slicks, beetle shells)
 *   - Multi-layer material stack
 *   - Metallic/roughness workflow helpers
 *
 * All calculations are CPU-side (can feed GPU uniforms or be used in
 * offline renderers). No WebGPU imports — fully testable in Vitest.
 *
 * @module rendering
 */

// =============================================================================
// TYPES
// =============================================================================

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}
export type RGB = [number, number, number];

export interface ClearcoatConfig {
  /** 0–1, overall clearcoat presence */
  intensity: number;
  /** 0–1, surface roughness of the clearcoat layer */
  roughness: number;
  /** Index of refraction (default 1.5 for glass-like coat) */
  ior: number;
}

export interface AnisotropyConfig {
  /** 0–1, anisotropy magnitude */
  strength: number;
  /** Rotation angle of anisotropic tangent in radians */
  angle: number;
  /** Anisotropy direction vector (must be unit) */
  tangent: Vec3;
}

export interface SheenConfig {
  /** RGB tint for sheen reflection */
  color: RGB;
  /** 0–1, surface roughness of sheen layer (velvet = low) */
  roughness: number;
}

export interface IridescenceConfig {
  /** 0–1, how visible the iridescent effect is */
  intensity: number;
  /** Index of refraction of thin film */
  ior: number;
  /** Thin-film thickness in nanometres (400–1200 typical) */
  thicknessNm: number;
}

export interface AdvancedPBRConfig {
  /** Base albedo (linear RGB) */
  albedo: RGB;
  /** 0–1, 0 = dielectric, 1 = metal */
  metallic: number;
  /** 0–1, microsurface roughness */
  roughness: number;
  /** Ambient occlusion 0–1 */
  ao: number;
  /** Emissive colour (HDR, can exceed 1) */
  emissive: RGB;
  clearcoat?: ClearcoatConfig;
  anisotropy?: AnisotropyConfig;
  sheen?: SheenConfig;
  iridescence?: IridescenceConfig;
}

const DEFAULT_CONFIG: AdvancedPBRConfig = {
  albedo: [1, 1, 1],
  metallic: 0,
  roughness: 0.5,
  ao: 1,
  emissive: [0, 0, 0],
};

// =============================================================================
// BRDF UTILITIES
// =============================================================================

/** GGX / Trowbridge-Reitz normal distribution function */
export function distributionGGX(NdotH: number, roughness: number): number {
  const a = roughness * roughness;
  const a2 = a * a;
  const d = NdotH * NdotH * (a2 - 1) + 1;
  return a2 / (Math.PI * d * d);
}

/** Smith's geometry attenuation (Schlick-GGX) */
export function geometrySmith(NdotV: number, NdotL: number, roughness: number): number {
  const r = roughness + 1;
  const k = (r * r) / 8;
  const gv = NdotV / (NdotV * (1 - k) + k);
  const gl = NdotL / (NdotL * (1 - k) + k);
  return gv * gl;
}

/** Schlick Fresnel approximation */
export function fresnelSchlick(cosTheta: number, F0: RGB): RGB {
  const t = Math.pow(1 - Math.max(0, cosTheta), 5);
  return [F0[0] + (1 - F0[0]) * t, F0[1] + (1 - F0[1]) * t, F0[2] + (1 - F0[2]) * t];
}

/** Schlick Fresnel with roughness (for IBL) */
export function fresnelRoughness(cosTheta: number, F0: RGB, roughness: number): RGB {
  const one = 1 - roughness;
  const t = Math.pow(Math.max(0, 1 - cosTheta), 5);
  return [
    F0[0] + (Math.max(one, F0[0]) - F0[0]) * t,
    F0[1] + (Math.max(one, F0[1]) - F0[1]) * t,
    F0[2] + (Math.max(one, F0[2]) - F0[2]) * t,
  ];
}

// =============================================================================
// CLEARCOAT
// =============================================================================

/**
 * Evaluate clearcoat layer BRDF contribution.
 * Uses a separate GGX lobe with IOR-derived F0 ≈ ((ior-1)/(ior+1))².
 */
export function evaluateClearcoat(
  NdotH: number,
  NdotV: number,
  NdotL: number,
  VdotH: number,
  config: ClearcoatConfig
): number {
  const f0 = Math.pow((config.ior - 1) / (config.ior + 1), 2);
  const f = f0 + (1 - f0) * Math.pow(1 - Math.max(0, VdotH), 5);
  const D = distributionGGX(NdotH, config.roughness);
  const G = geometrySmith(NdotV, NdotL, config.roughness);
  const specular = (D * G * f) / (4 * NdotV * NdotL + 1e-6);
  return specular * config.intensity;
}

// =============================================================================
// ANISOTROPY
// =============================================================================

/**
 * GGX NDF modified for anisotropic surfaces (Burley 2012).
 * alphaT and alphaB are per-axis roughness values.
 */
export function distributionGGXAnisotropic(
  NdotH: number,
  TdotH: number,
  BdotH: number,
  alphaT: number,
  alphaB: number
): number {
  const t2 = (TdotH / alphaT) ** 2;
  const b2 = (BdotH / alphaB) ** 2;
  const d = t2 + b2 + NdotH * NdotH;
  return 1 / (Math.PI * alphaT * alphaB * d * d);
}

/**
 * Compute per-axis roughness values from isotropic roughness + anisotropy strength.
 * Returns [alphaT, alphaB].
 */
export function anisotropicRoughness(roughness: number, strength: number): [number, number] {
  const a = roughness * roughness;
  const alphaT = Math.max(1e-3, a * (1 + strength));
  const alphaB = Math.max(1e-3, a * (1 - strength));
  return [alphaT, alphaB];
}

// =============================================================================
// SHEEN
// =============================================================================

/**
 * Charlie sheen NDF (Estevez & Kulla 2017).
 * Produces the characteristic soft highlight at grazing angles.
 */
export function sheenDistribution(NdotH: number, roughness: number): number {
  const invAlpha = 1 / Math.max(1e-3, roughness * roughness);
  const sin2h = Math.max(0, 1 - NdotH * NdotH);
  return ((2 + invAlpha) * Math.pow(sin2h, invAlpha * 0.5)) / (2 * Math.PI);
}

/** Sheen visibility function (L(NdotV) * L(NdotL)) */
export function sheenVisibility(NdotV: number, NdotL: number): number {
  const l = (v: number) => 1 / (4 * v + v * v + 0.25);
  return l(NdotV) * l(NdotL);
}

/** Evaluate full sheen BRDF contribution */
export function evaluateSheen(
  NdotH: number,
  NdotV: number,
  NdotL: number,
  config: SheenConfig
): RGB {
  const D = sheenDistribution(NdotH, config.roughness);
  const V = sheenVisibility(NdotV, NdotL);
  const scale = D * V;
  return [config.color[0] * scale, config.color[1] * scale, config.color[2] * scale];
}

// =============================================================================
// IRIDESCENCE
// =============================================================================

/**
 * Thin-film interference iridescence (McGuire & Skelton 2020).
 * Computes a wavelength-dependent phase shift and maps it to RGB.
 * wavelengths: [680, 550, 440] nm (R, G, B).
 */
export function evaluateIridescence(cosTheta: number, config: IridescenceConfig): RGB {
  const WAVELENGTHS: RGB = [680, 550, 440];
  const result: RGB = [0, 0, 0];
  const eta = config.ior;
  const sinTheta2 = 1 - cosTheta * cosTheta;
  const cosTheta2 = Math.sqrt(Math.max(0, 1 - sinTheta2 / (eta * eta)));

  for (let i = 0; i < 3; i++) {
    const phi = (4 * Math.PI * config.thicknessNm * eta * cosTheta2) / WAVELENGTHS[i];
    const r = Math.cos(phi) * 0.5 + 0.5; // Interference [0, 1]
    result[i] = r * config.intensity;
  }
  return result;
}

// =============================================================================
// METALLIC / ROUGHNESS WORKFLOW
// =============================================================================

/**
 * Compute F0 (reflectance at normal incidence) from albedo + metallic.
 * Dielectrics: F0 ≈ 0.04 (non-metals), metals: F0 = albedo.
 */
export function computeF0(albedo: RGB, metallic: number): RGB {
  const dielectric = 0.04;
  return [
    dielectric * (1 - metallic) + albedo[0] * metallic,
    dielectric * (1 - metallic) + albedo[1] * metallic,
    dielectric * (1 - metallic) + albedo[2] * metallic,
  ];
}

/**
 * Compute diffuse albedo for metallic surfaces (metals have no diffuse).
 */
export function computeDiffuseAlbedo(albedo: RGB, metallic: number): RGB {
  return [albedo[0] * (1 - metallic), albedo[1] * (1 - metallic), albedo[2] * (1 - metallic)];
}

// =============================================================================
// MATERIAL CLASS
// =============================================================================

export class AdvancedPBRMaterial {
  private config: AdvancedPBRConfig;

  constructor(config: Partial<AdvancedPBRConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  setAlbedo(r: number, g: number, b: number): void {
    this.config.albedo = [r, g, b];
  }
  setMetallic(v: number): void {
    this.config.metallic = Math.max(0, Math.min(1, v));
  }
  setRoughness(v: number): void {
    this.config.roughness = Math.max(0.04, Math.min(1, v));
  }
  setAO(v: number): void {
    this.config.ao = Math.max(0, Math.min(1, v));
  }
  setEmissive(r: number, g: number, b: number): void {
    this.config.emissive = [r, g, b];
  }
  setClearcoat(cc: ClearcoatConfig): void {
    this.config.clearcoat = cc;
  }
  setAnisotropy(an: AnisotropyConfig): void {
    this.config.anisotropy = an;
  }
  setSheen(sh: SheenConfig): void {
    this.config.sheen = sh;
  }
  setIridescence(ir: IridescenceConfig): void {
    this.config.iridescence = ir;
  }

  getConfig(): Readonly<AdvancedPBRConfig> {
    return { ...this.config };
  }
  getF0(): RGB {
    return computeF0(this.config.albedo, this.config.metallic);
  }
  getDiffuse(): RGB {
    return computeDiffuseAlbedo(this.config.albedo, this.config.metallic);
  }

  hasClearcoat(): boolean {
    return !!this.config.clearcoat;
  }
  hasAnisotropy(): boolean {
    return !!this.config.anisotropy;
  }
  hasSheen(): boolean {
    return !!this.config.sheen;
  }
  hasIridescence(): boolean {
    return !!this.config.iridescence;
  }

  // ---------------------------------------------------------------------------
  // Evaluation
  // ---------------------------------------------------------------------------

  /**
   * Evaluate the full advanced PBR BRDF at a shading point.
   *
   * @param NdotL - dot(N, L), clamped [0,1]
   * @param NdotV - dot(N, V), clamped [0,1]
   * @param NdotH - dot(N, H), clamped [0,1]
   * @param VdotH - dot(V, H), clamped [0,1]
   * @param TdotH - dot(T, H) for anisotropy (0 if not anisotropic)
   * @param BdotH - dot(B, H) for anisotropy (0 if not anisotropic)
   * @returns RGB radiance contribution (direct light, no PI factor)
   */
  evaluate(NdotL: number, NdotV: number, NdotH: number, VdotH: number, TdotH = 0, BdotH = 0): RGB {
    const nv = Math.max(1e-6, NdotV);
    const nl = Math.max(1e-6, NdotL);
    const { roughness, ao } = this.config;

    const F0 = this.getF0();
    const F = fresnelSchlick(VdotH, F0);

    // Specular (isotropic base or anisotropic override)
    let D: number;
    if (this.config.anisotropy) {
      const [aT, aB] = anisotropicRoughness(roughness, this.config.anisotropy.strength);
      D = distributionGGXAnisotropic(NdotH, TdotH, BdotH, aT, aB);
    } else {
      D = distributionGGX(NdotH, roughness);
    }

    const G = geometrySmith(nv, nl, roughness);
    const specular: RGB = [
      (D * G * F[0]) / (4 * nv * nl + 1e-6),
      (D * G * F[1]) / (4 * nv * nl + 1e-6),
      (D * G * F[2]) / (4 * nv * nl + 1e-6),
    ];

    // Diffuse (Lambertian, scaled by 1 - F for energy conservation)
    const diffuse = this.getDiffuse();
    const kD: RGB = [1 - F[0], 1 - F[1], 1 - F[2]];
    const Lo: RGB = [
      ((kD[0] * diffuse[0]) / Math.PI + specular[0]) * nl * ao,
      ((kD[1] * diffuse[1]) / Math.PI + specular[1]) * nl * ao,
      ((kD[2] * diffuse[2]) / Math.PI + specular[2]) * nl * ao,
    ];

    // Clearcoat (additive lobe)
    if (this.config.clearcoat) {
      const cc = evaluateClearcoat(NdotH, nv, nl, VdotH, this.config.clearcoat);
      Lo[0] += cc;
      Lo[1] += cc;
      Lo[2] += cc;
    }

    // Sheen (additive lobe)
    if (this.config.sheen) {
      const sh = evaluateSheen(NdotH, nv, nl, this.config.sheen);
      Lo[0] += sh[0];
      Lo[1] += sh[1];
      Lo[2] += sh[2];
    }

    // Iridescence (modifies F0 indirectly via additive RGB shift)
    if (this.config.iridescence) {
      const ir = evaluateIridescence(VdotH, this.config.iridescence);
      Lo[0] += ir[0] * nl;
      Lo[1] += ir[1] * nl;
      Lo[2] += ir[2] * nl;
    }

    // Add emissive (not light-dependent)
    Lo[0] += this.config.emissive[0];
    Lo[1] += this.config.emissive[1];
    Lo[2] += this.config.emissive[2];

    return Lo;
  }
}

// =============================================================================
// MATERIAL LIBRARY
// =============================================================================

/** Pre-configured material presets */
export const MATERIAL_PRESETS = {
  carPaintRed: (): AdvancedPBRMaterial =>
    new AdvancedPBRMaterial({
      albedo: [0.85, 0.05, 0.05],
      metallic: 0,
      roughness: 0.15,
      clearcoat: { intensity: 1, roughness: 0.04, ior: 1.5 },
    }),

  brushedAluminium: (): AdvancedPBRMaterial =>
    new AdvancedPBRMaterial({
      albedo: [0.8, 0.8, 0.85],
      metallic: 1,
      roughness: 0.3,
      anisotropy: { strength: 0.8, angle: 0, tangent: { x: 1, y: 0, z: 0 } },
    }),

  velvet: (): AdvancedPBRMaterial =>
    new AdvancedPBRMaterial({
      albedo: [0.5, 0.1, 0.4],
      metallic: 0,
      roughness: 1,
      sheen: { color: [0.6, 0.2, 0.5], roughness: 0.1 },
    }),

  soapBubble: (): AdvancedPBRMaterial =>
    new AdvancedPBRMaterial({
      albedo: [1, 1, 1],
      metallic: 0,
      roughness: 0.05,
      iridescence: { intensity: 0.9, ior: 1.33, thicknessNm: 600 },
    }),
};
