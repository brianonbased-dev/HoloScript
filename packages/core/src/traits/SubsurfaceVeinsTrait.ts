/**
 * SubsurfaceVeinsTrait
 *
 * Procedural subsurface vein renderer description with heartbeat pulse control.
 * Intended for skin materials / anatomical visualization.
 */

import type { TraitHandler } from './TraitTypes';

export interface VeinColor {
  r: number;
  g: number;
  b: number;
}

export interface SubsurfaceVeinsConfig {
  /** Approximate number of vein segments to synthesize (can be large, e.g. 50K). */
  segmentCount: number;
  /** Pulse in beats per minute. */
  pulseBpm: number;
  /** Branching factor across vascular tree depth. */
  branchFactor?: number;
  /** Tube radius in meters for thin subsurface vessels. */
  radius?: number;
  /** Vein tint under skin. */
  color?: VeinColor;
  /** Intensity multiplier for emissive/absorption modulation. */
  intensity?: number;
}

const DEFAULTS: Required<
  Pick<SubsurfaceVeinsConfig, 'branchFactor' | 'radius' | 'intensity' | 'color'>
> = {
  branchFactor: 2.1,
  radius: 0.0008,
  intensity: 0.35,
  color: { r: 0.22, g: 0.08, b: 0.1 },
};

function mergeDefaults(cfg: SubsurfaceVeinsConfig): Required<SubsurfaceVeinsConfig> {
  return {
    segmentCount: cfg.segmentCount,
    pulseBpm: cfg.pulseBpm,
    branchFactor: cfg.branchFactor ?? DEFAULTS.branchFactor,
    radius: cfg.radius ?? DEFAULTS.radius,
    color: cfg.color ?? DEFAULTS.color,
    intensity: cfg.intensity ?? DEFAULTS.intensity,
  };
}

export const SubsurfaceVeinsTrait: TraitHandler<SubsurfaceVeinsConfig> = {
  name: 'subsurface_veins',

  validate(config: SubsurfaceVeinsConfig): boolean {
    if (!Number.isFinite(config.segmentCount) || config.segmentCount <= 0) {
      throw new Error('segmentCount must be a positive number');
    }

    if (config.segmentCount > 500_000) {
      throw new Error('segmentCount is too high; cap at 500000 to avoid runaway generation');
    }

    if (!Number.isFinite(config.pulseBpm) || config.pulseBpm <= 0) {
      throw new Error('pulseBpm must be > 0');
    }

    if (
      config.branchFactor !== undefined &&
      (!Number.isFinite(config.branchFactor) || config.branchFactor < 1)
    ) {
      throw new Error('branchFactor must be >= 1');
    }

    if (config.radius !== undefined && (!Number.isFinite(config.radius) || config.radius <= 0)) {
      throw new Error('radius must be > 0');
    }

    if (
      config.intensity !== undefined &&
      (!Number.isFinite(config.intensity) || config.intensity < 0)
    ) {
      throw new Error('intensity must be >= 0');
    }

    const c = config.color;
    if (c && [c.r, c.g, c.b].some((v) => !Number.isFinite(v) || v < 0 || v > 1)) {
      throw new Error('color channels must be in [0, 1]');
    }

    return true;
  },

  compile(config: SubsurfaceVeinsConfig, target: string): string {
    const c = mergeDefaults(config);
    const self = this as unknown as Record<string, (v: Required<SubsurfaceVeinsConfig>) => string>;

    switch (target) {
      case 'unity':
        return self.compileUnity(c);
      case 'unreal':
        return self.compileUnreal(c);
      case 'web':
      case 'react-three-fiber':
      case 'webgpu':
      case 'babylon':
        return self.compileWeb(c);
      default:
        return self.compileGeneric(c);
    }
  },

  compileUnity(config: Required<SubsurfaceVeinsConfig>): string {
    return (
      `// Unity (HDRP/URP custom pass) — Subsurface Veins\n` +
      `var segments = ${config.segmentCount};\n` +
      `var pulseBpm = ${config.pulseBpm}f;\n` +
      `var pulseHz = pulseBpm / 60.0f;\n` +
      `var branchFactor = ${config.branchFactor}f;\n` +
      `var vesselRadius = ${config.radius}f;\n` +
      `var veinColor = new Color(${config.color.r}f, ${config.color.g}f, ${config.color.b}f, 1f);\n` +
      `var baseIntensity = ${config.intensity}f;\n` +
      `// Animate in shader: pulse = 0.5 + 0.5 * sin(_Time.y * 6.28318 * pulseHz);`
    );
  },

  compileUnreal(config: Required<SubsurfaceVeinsConfig>): string {
    return (
      `// Unreal Material Function — Subsurface Veins\n` +
      `float Segments = ${config.segmentCount}.0;\n` +
      `float PulseBPM = ${config.pulseBpm}.0;\n` +
      `float PulseHz = PulseBPM / 60.0;\n` +
      `float BranchFactor = ${config.branchFactor};\n` +
      `float VesselRadius = ${config.radius};\n` +
      `float3 VeinColor = float3(${config.color.r}, ${config.color.g}, ${config.color.b});\n` +
      `float Intensity = ${config.intensity};\n` +
      `float Pulse = 0.5 + 0.5 * sin(Time * 6.28318 * PulseHz);\n` +
      `// Feed Pulse into Subsurface Color / Opacity Mask for under-skin modulation.`
    );
  },

  compileWeb(config: Required<SubsurfaceVeinsConfig>): string {
    return (
      `// Web/Three.js shader snippet — Subsurface Veins\n` +
      `const veins = {\n` +
      `  segmentCount: ${config.segmentCount},\n` +
      `  pulseBpm: ${config.pulseBpm},\n` +
      `  pulseHz: ${config.pulseBpm / 60},\n` +
      `  branchFactor: ${config.branchFactor},\n` +
      `  radius: ${config.radius},\n` +
      `  color: [${config.color.r}, ${config.color.g}, ${config.color.b}],\n` +
      `  intensity: ${config.intensity},\n` +
      `};\n` +
      `// GLSL: float pulse = 0.5 + 0.5 * sin(uTime * 6.28318 * veins.pulseHz);\n` +
      `// Apply pulse to emissive/transmission under epidermal mask.`
    );
  },

  compileGeneric(config: Required<SubsurfaceVeinsConfig>): string {
    return `// Subsurface Veins config\n${JSON.stringify(config, null, 2)}`;
  },
};
