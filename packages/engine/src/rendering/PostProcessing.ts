/**
 * PostProcessing.ts
 *
 * Post-processing effect stack: bloom, tone mapping, SSAO,
 * color grading, vignette, and chromatic aberration.
 *
 * @module rendering
 */

// =============================================================================
// TYPES
// =============================================================================

export type ToneMapper = 'linear' | 'reinhard' | 'aces' | 'filmic';

export interface BloomSettings {
  enabled: boolean;
  threshold: number; // Luminance threshold (0-1)
  intensity: number; // Bloom strength
  radius: number; // Blur radius
  softKnee: number; // Soft threshold knee
}

export interface SSAOSettings {
  enabled: boolean;
  radius: number; // Sample radius in world units
  intensity: number; // AO strength
  bias: number; // Depth bias to prevent self-occlusion
  samples: number; // Number of samples per pixel
}

export interface ColorGradingSettings {
  enabled: boolean;
  temperature: number; // -100 to 100 (cool to warm)
  tint: number; // -100 to 100 (green to magenta)
  saturation: number; // 0-2 (0 = greyscale, 1 = normal)
  contrast: number; // 0-2
  brightness: number; // -1 to 1
  gamma: number; // 0.1-3
}

export interface VignetteSettings {
  enabled: boolean;
  intensity: number; // 0-1
  smoothness: number; // 0-1
  roundness: number; // 0-1
}

export interface ChromaticAberrationSettings {
  enabled: boolean;
  intensity: number; // 0-1
}

export interface PostProcessProfile {
  id: string;
  name: string;
  bloom: BloomSettings;
  ssao: SSAOSettings;
  colorGrading: ColorGradingSettings;
  vignette: VignetteSettings;
  chromaticAberration: ChromaticAberrationSettings;
  toneMapping: ToneMapper;
  exposure: number;
  antiAliasing: 'none' | 'fxaa' | 'smaa';
}

// =============================================================================
// DEFAULT PROFILE
// =============================================================================

function createDefaultProfile(id: string, name: string): PostProcessProfile {
  return {
    id,
    name,
    bloom: { enabled: false, threshold: 0.8, intensity: 0.5, radius: 4, softKnee: 0.5 },
    ssao: { enabled: false, radius: 0.5, intensity: 1, bias: 0.025, samples: 16 },
    colorGrading: {
      enabled: false,
      temperature: 0,
      tint: 0,
      saturation: 1,
      contrast: 1,
      brightness: 0,
      gamma: 1,
    },
    vignette: { enabled: false, intensity: 0.3, smoothness: 0.5, roundness: 1 },
    chromaticAberration: { enabled: false, intensity: 0.1 },
    toneMapping: 'aces',
    exposure: 1,
    antiAliasing: 'fxaa',
  };
}

// =============================================================================
// PRESET PROFILES
// =============================================================================

export const PP_PRESETS: Record<string, Partial<PostProcessProfile>> = {
  cinematic: {
    name: 'Cinematic',
    bloom: { enabled: true, threshold: 0.7, intensity: 0.6, radius: 5, softKnee: 0.5 },
    colorGrading: {
      enabled: true,
      temperature: 10,
      tint: -5,
      saturation: 1.1,
      contrast: 1.15,
      brightness: -0.05,
      gamma: 0.95,
    },
    vignette: { enabled: true, intensity: 0.35, smoothness: 0.6, roundness: 1 },
    toneMapping: 'filmic',
  },
  retro: {
    name: 'Retro',
    colorGrading: {
      enabled: true,
      temperature: 30,
      tint: 10,
      saturation: 0.7,
      contrast: 1.3,
      brightness: -0.1,
      gamma: 1.1,
    },
    chromaticAberration: { enabled: true, intensity: 0.3 },
    vignette: { enabled: true, intensity: 0.5, smoothness: 0.4, roundness: 0.8 },
    toneMapping: 'reinhard',
  },
  sciFi: {
    name: 'Sci-Fi',
    bloom: { enabled: true, threshold: 0.5, intensity: 1.0, radius: 8, softKnee: 0.3 },
    ssao: { enabled: true, radius: 0.3, intensity: 1.5, bias: 0.02, samples: 32 },
    colorGrading: {
      enabled: true,
      temperature: -20,
      tint: 0,
      saturation: 0.9,
      contrast: 1.2,
      brightness: 0,
      gamma: 0.9,
    },
    toneMapping: 'aces',
  },
};

// =============================================================================
// POST PROCESSING STACK
// =============================================================================

export class PostProcessingStack {
  private profiles: Map<string, PostProcessProfile> = new Map();
  private activeProfileId: string | null = null;

  constructor() {
    this.profiles.set('default', createDefaultProfile('default', 'Default'));
  }

  // ---------------------------------------------------------------------------
  // Profile Management
  // ---------------------------------------------------------------------------

  createProfile(id: string, name: string): PostProcessProfile {
    const profile = createDefaultProfile(id, name);
    this.profiles.set(id, profile);
    return profile;
  }

  loadPreset(presetName: string, id?: string): PostProcessProfile | null {
    const preset = PP_PRESETS[presetName];
    if (!preset) return null;
    const profileId = id ?? presetName;
    const profile: PostProcessProfile = {
      ...createDefaultProfile(profileId, preset.name ?? presetName),
      ...preset,
      id: profileId,
    } as PostProcessProfile;
    this.profiles.set(profileId, profile);
    return profile;
  }

  getProfile(id: string): PostProcessProfile | undefined {
    return this.profiles.get(id);
  }

  getProfileCount(): number {
    return this.profiles.size;
  }

  removeProfile(id: string): boolean {
    if (this.activeProfileId === id) this.activeProfileId = null;
    return this.profiles.delete(id);
  }

  // ---------------------------------------------------------------------------
  // Active Profile
  // ---------------------------------------------------------------------------

  setActive(profileId: string): boolean {
    if (!this.profiles.has(profileId)) return false;
    this.activeProfileId = profileId;
    return true;
  }

  getActive(): PostProcessProfile | null {
    if (!this.activeProfileId) return null;
    return this.profiles.get(this.activeProfileId) ?? null;
  }

  // ---------------------------------------------------------------------------
  // Effect Toggle
  // ---------------------------------------------------------------------------

  setEffectEnabled(
    profileId: string,
    effect: 'bloom' | 'ssao' | 'colorGrading' | 'vignette' | 'chromaticAberration',
    enabled: boolean
  ): boolean {
    const profile = this.profiles.get(profileId);
    if (!profile) return false;
    profile[effect].enabled = enabled;
    return true;
  }

  // ---------------------------------------------------------------------------
  // Blending
  // ---------------------------------------------------------------------------

  /**
   * Blend between two profiles by factor t (0 = from, 1 = to).
   * Useful for smooth transitions between environments.
   */
  blendProfiles(fromId: string, toId: string, t: number): PostProcessProfile | null {
    const from = this.profiles.get(fromId);
    const to = this.profiles.get(toId);
    if (!from || !to) return null;

    const lerp = (a: number, b: number) => a + (b - a) * t;

    return {
      id: `blend_${fromId}_${toId}`,
      name: `Blend`,
      bloom: {
        enabled: t > 0.5 ? to.bloom.enabled : from.bloom.enabled,
        threshold: lerp(from.bloom.threshold, to.bloom.threshold),
        intensity: lerp(from.bloom.intensity, to.bloom.intensity),
        radius: lerp(from.bloom.radius, to.bloom.radius),
        softKnee: lerp(from.bloom.softKnee, to.bloom.softKnee),
      },
      ssao: {
        enabled: t > 0.5 ? to.ssao.enabled : from.ssao.enabled,
        radius: lerp(from.ssao.radius, to.ssao.radius),
        intensity: lerp(from.ssao.intensity, to.ssao.intensity),
        bias: lerp(from.ssao.bias, to.ssao.bias),
        samples: Math.round(lerp(from.ssao.samples, to.ssao.samples)),
      },
      colorGrading: {
        enabled: t > 0.5 ? to.colorGrading.enabled : from.colorGrading.enabled,
        temperature: lerp(from.colorGrading.temperature, to.colorGrading.temperature),
        tint: lerp(from.colorGrading.tint, to.colorGrading.tint),
        saturation: lerp(from.colorGrading.saturation, to.colorGrading.saturation),
        contrast: lerp(from.colorGrading.contrast, to.colorGrading.contrast),
        brightness: lerp(from.colorGrading.brightness, to.colorGrading.brightness),
        gamma: lerp(from.colorGrading.gamma, to.colorGrading.gamma),
      },
      vignette: {
        enabled: t > 0.5 ? to.vignette.enabled : from.vignette.enabled,
        intensity: lerp(from.vignette.intensity, to.vignette.intensity),
        smoothness: lerp(from.vignette.smoothness, to.vignette.smoothness),
        roundness: lerp(from.vignette.roundness, to.vignette.roundness),
      },
      chromaticAberration: {
        enabled: t > 0.5 ? to.chromaticAberration.enabled : from.chromaticAberration.enabled,
        intensity: lerp(from.chromaticAberration.intensity, to.chromaticAberration.intensity),
      },
      toneMapping: t > 0.5 ? to.toneMapping : from.toneMapping,
      exposure: lerp(from.exposure, to.exposure),
      antiAliasing: t > 0.5 ? to.antiAliasing : from.antiAliasing,
    };
  }
}
