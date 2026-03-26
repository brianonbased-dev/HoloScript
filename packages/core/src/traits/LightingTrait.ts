/**
 * @holoscript/core Lighting Trait
 *
 * Enables dynamic lighting with support for multiple light types,
 * shadows, and global illumination
 */

export type LightType = 'directional' | 'point' | 'spot' | 'area' | 'probe';
export type ShadowType = 'none' | 'hard' | 'soft' | 'raytraced';

/**
 * Color definition
 */
export interface Color {
  r: number;
  g: number;
  b: number;
  a?: number;
}

/**
 * Vector3 position or direction
 */
interface Vector3 {
  x: number;
  y: number;
  z: number;
}

/**
 * Shadow configuration
 */
export interface ShadowConfig {
  /** Shadow type */
  type: ShadowType;

  /** Shadow map resolution */
  resolution?: number;

  /** Shadow bias to prevent artifacts */
  bias?: number;

  /** Softness/blur radius */
  softness?: number;

  /** Max shadow distance */
  maxDistance?: number;

  /** Cascade levels for directional lights */
  cascades?: number;
}

/**
 * Light source definition
 */
export interface LightSource {
  /** Light type */
  type: LightType;

  /** Light name */
  name?: string;

  /** Position in world space */
  position?: Vector3;

  /** Direction (for directional/spot) */
  direction?: Vector3;

  /** Color */
  color: Color;

  /** Intensity/brightness 0-1+ */
  intensity: number;

  /** Attenuation range (point/spot) */
  range?: number;

  /** Spot angle in degrees */
  spotAngle?: number;

  /** Inner spot angle */
  innerSpotAngle?: number;

  /** Shadow configuration */
  shadow?: ShadowConfig;

  /** Light cookie/projection */
  cookie?: string;

  /** Enable volumetric fog interaction */
  volumetric?: boolean;

  /** Light priority for batching */
  priority?: number;
}

/**
 * Global illumination configuration
 */
export interface GlobalIlluminationConfig {
  /** Enable global illumination */
  enabled: boolean;

  /** Intensity multiplier */
  intensity?: number;

  /** Sky color for ambient light */
  skyColor?: Color;

  /** Sky intensity */
  skyIntensity?: number;

  /** Ground color for ambient light */
  groundColor?: Color;

  /** Ground intensity */
  groundIntensity?: number;

  /** Use light probes */
  probes?: boolean;

  /** Indirect diffuse intensity */
  indirectDiffuse?: number;

  /** Indirect specular intensity */
  indirectSpecular?: number;

  /** Ambient occlusion intensity */
  aoIntensity?: number;

  /** Use screen-space AO */
  screenSpaceAO?: boolean;
}

/**
 * LightingTrait - Manages dynamic lighting and illumination
 */
export class LightingTrait {
  private lights: Map<string, LightSource> = new Map();
  private globalIllumination: GlobalIlluminationConfig;
  private lightIdCounter: number = 0;

  constructor(config?: GlobalIlluminationConfig) {
    this.globalIllumination = {
      enabled: true,
      intensity: 1.0,
      skyColor: { r: 0.5, g: 0.7, b: 1.0 },
      skyIntensity: 1.0,
      groundColor: { r: 0.4, g: 0.4, b: 0.4 },
      groundIntensity: 0.5,
      probes: true,
      indirectDiffuse: 1.0,
      indirectSpecular: 1.0,
      aoIntensity: 1.0,
      screenSpaceAO: true,
      ...config,
    };
  }

  /**
   * Add a light to the scene
   */
  public addLight(light: LightSource): string {
    const id = light.name || `light_${this.lightIdCounter++}`;
    this.lights.set(id, light);
    return id;
  }

  /**
   * Get light by ID
   */
  public getLight(id: string): LightSource | undefined {
    return this.lights.get(id);
  }

  /**
   * Get all lights
   */
  public getLights(): LightSource[] {
    return Array.from(this.lights.values());
  }

  /**
   * Get lights by type
   */
  public getLightsByType(type: LightType): LightSource[] {
    return Array.from(this.lights.values()).filter((l) => l.type === type);
  }

  /**
   * Update light properties
   */
  public updateLight(id: string, updates: Partial<LightSource>): boolean {
    const light = this.lights.get(id);
    if (!light) return false;
    this.lights.set(id, { ...light, ...updates });
    return true;
  }

  /**
   * Remove light
   */
  public removeLight(id: string): boolean {
    return this.lights.delete(id);
  }

  /**
   * Clear all lights
   */
  public clearLights(): void {
    this.lights.clear();
  }

  /**
   * Get global illumination config
   */
  public getGlobalIllumination(): GlobalIlluminationConfig {
    return { ...this.globalIllumination };
  }

  /**
   * Update global illumination
   */
  public updateGlobalIllumination(updates: Partial<GlobalIlluminationConfig>): void {
    this.globalIllumination = {
      ...this.globalIllumination,
      ...updates,
    };
  }

  /**
   * Enable/disable GI
   */
  public setGIEnabled(enabled: boolean): void {
    this.globalIllumination.enabled = enabled;
  }

  /**
   * Set ambient light colors (skybox mode)
   */
  public setAmbientLight(skyColor: Color, groundColor: Color, intensity: number = 1.0): void {
    this.globalIllumination.skyColor = skyColor;
    this.globalIllumination.groundColor = groundColor;
    this.globalIllumination.skyIntensity = intensity;
    this.globalIllumination.groundIntensity = intensity * 0.5;
  }

  /**
   * Enable/disable screen-space ambient occlusion
   */
  public setScreenSpaceAO(enabled: boolean, intensity: number = 1.0): void {
    this.globalIllumination.screenSpaceAO = enabled;
    this.globalIllumination.aoIntensity = intensity;
  }

  /**
   * Create directional light (sun)
   */
  public createDirectionalLight(
    direction: Vector3,
    color: Color,
    intensity: number = 1.0,
    castShadows: boolean = true
  ): string {
    const light: LightSource = {
      type: 'directional',
      name: `sun_${this.lightIdCounter}`,
      direction,
      color,
      intensity,
      shadow: castShadows
        ? {
            type: 'soft',
            resolution: 2048,
            cascades: 4,
            softness: 1.0,
          }
        : undefined,
      volumetric: true,
      priority: 100,
    };
    return this.addLight(light);
  }

  /**
   * Create point light
   */
  public createPointLight(
    position: Vector3,
    color: Color,
    intensity: number,
    range: number,
    castShadows: boolean = false
  ): string {
    const light: LightSource = {
      type: 'point',
      name: `point_${this.lightIdCounter}`,
      position,
      color,
      intensity,
      range,
      shadow: castShadows
        ? {
            type: 'soft',
            resolution: 512,
            softness: 0.5,
          }
        : undefined,
      priority: 50,
    };
    return this.addLight(light);
  }

  /**
   * Create spot light
   */
  public createSpotLight(
    position: Vector3,
    direction: Vector3,
    color: Color,
    intensity: number,
    range: number,
    spotAngle: number = 45,
    castShadows: boolean = true
  ): string {
    const light: LightSource = {
      type: 'spot',
      name: `spot_${this.lightIdCounter}`,
      position,
      direction,
      color,
      intensity,
      range,
      spotAngle,
      innerSpotAngle: spotAngle * 0.5,
      shadow: castShadows
        ? {
            type: 'soft',
            resolution: 1024,
            softness: 0.8,
          }
        : undefined,
      priority: 75,
    };
    return this.addLight(light);
  }

  /**
   * Create area light for soft lighting
   */
  public createAreaLight(
    position: Vector3,
    color: Color,
    intensity: number,
    width: number,
    height: number
  ): string {
    const light: LightSource = {
      type: 'area',
      name: `area_${this.lightIdCounter}`,
      position,
      color,
      intensity,
      range: Math.max(width, height) * 2,
      priority: 25,
    };
    return this.addLight(light);
  }

  /**
   * Get shadow-casting lights
   */
  public getShadowCastingLights(): LightSource[] {
    return Array.from(this.lights.values()).filter((l) => l.shadow && l.shadow.type !== 'none');
  }

  /**
   * Get light count by type
   */
  public getLightCount(): { [key in LightType]: number } {
    const counts = {
      directional: 0,
      point: 0,
      spot: 0,
      area: 0,
      probe: 0,
    };
    for (const light of Array.from(this.lights.values())) {
      counts[light.type]++;
    }
    return counts;
  }

  /**
   * Estimate light impact for performance optimization
   */
  public getPerformanceImpact(): {
    totalLights: number;
    shadowCasters: number;
    estimatedGPUCost: 'low' | 'medium' | 'high';
  } {
    const totalLights = this.lights.size;
    const shadowCasters = this.getShadowCastingLights().length;

    let estimatedGPUCost: 'low' | 'medium' | 'high' = 'low';
    if (totalLights > 16 || shadowCasters > 4) {
      estimatedGPUCost = 'high';
    } else if (totalLights > 8 || shadowCasters > 2) {
      estimatedGPUCost = 'medium';
    }

    return {
      totalLights,
      shadowCasters,
      estimatedGPUCost,
    };
  }

  /**
   * Get scene complexity info
   */
  public getSceneInfo(): string {
    const counts = this.getLightCount();
    const impact = this.getPerformanceImpact();
    return (
      `Lighting: ${counts.directional} dir, ${counts.point} point, ${counts.spot} spot | ` +
      `Shadows: ${impact.shadowCasters} | GPU: ${impact.estimatedGPUCost}`
    );
  }

  /**
   * Dispose and cleanup
   */
  public dispose(): void {
    this.lights.clear();
  }
}

/**
 * HoloScript+ @lighting trait factory
 */
export function createLightingTrait(config?: GlobalIlluminationConfig): LightingTrait {
  return new LightingTrait(config);
}

/**
 * Preset lighting configurations
 */
export const LIGHTING_PRESETS = {
  /** Neutral studio lighting */
  studio: (): GlobalIlluminationConfig => ({
    enabled: true,
    intensity: 1.0,
    skyColor: { r: 0.5, g: 0.5, b: 0.5 },
    skyIntensity: 0.5,
    groundColor: { r: 0.3, g: 0.3, b: 0.3 },
    groundIntensity: 0.3,
  }),

  /** Bright outdoor lighting */
  outdoor: (): GlobalIlluminationConfig => ({
    enabled: true,
    intensity: 1.2,
    skyColor: { r: 0.7, g: 0.85, b: 1.0 },
    skyIntensity: 1.0,
    groundColor: { r: 0.4, g: 0.4, b: 0.35 },
    groundIntensity: 0.6,
    indirectDiffuse: 1.2,
  }),

  /** Dim interior lighting */
  interior: (): GlobalIlluminationConfig => ({
    enabled: true,
    intensity: 0.6,
    skyColor: { r: 0.3, g: 0.3, b: 0.35 },
    skyIntensity: 0.4,
    groundColor: { r: 0.2, g: 0.2, b: 0.2 },
    groundIntensity: 0.2,
  }),

  /** Night scene */
  night: (): GlobalIlluminationConfig => ({
    enabled: true,
    intensity: 0.3,
    skyColor: { r: 0.01, g: 0.01, b: 0.02 },
    skyIntensity: 0.1,
    groundColor: { r: 0.02, g: 0.02, b: 0.02 },
    groundIntensity: 0.05,
    screenSpaceAO: false,
  }),

  /** Sunset/golden hour */
  sunset: (): GlobalIlluminationConfig => ({
    enabled: true,
    intensity: 1.1,
    skyColor: { r: 1.0, g: 0.7, b: 0.3 },
    skyIntensity: 1.0,
    groundColor: { r: 0.6, g: 0.4, b: 0.2 },
    groundIntensity: 0.8,
  }),
};

// ── Handler (delegates to LightingTrait) ──
import type { TraitHandler } from './TraitTypes';

export const lightingHandler = {
  name: 'lighting',
  defaultConfig: {},
  onAttach(node: any, config: any, ctx: any): void {
    const instance = new LightingTrait(config);
    node.__lighting_instance = instance;
    ctx.emit('lighting_attached', { node, config });
  },
  onDetach(node: any, _config: any, ctx: any): void {
    const instance = node.__lighting_instance;
    if (instance) {
      if (typeof instance.onDetach === 'function') instance.onDetach(node, ctx);
      else if (typeof instance.dispose === 'function') instance.dispose();
      else if (typeof instance.cleanup === 'function') instance.cleanup();
    }
    ctx.emit('lighting_detached', { node });
    delete node.__lighting_instance;
  },
  onEvent(node: any, _config: any, ctx: any, event: any): void {
    const instance = node.__lighting_instance;
    if (!instance) return;
    if (typeof instance.onEvent === 'function') instance.onEvent(event);
    else if (typeof instance.emit === 'function' && event.type) instance.emit(event);
    if (event.type === 'lighting_configure' && event.payload) {
      Object.assign(instance, event.payload);
      ctx.emit('lighting_configured', { node });
    }
  },
  onUpdate(node: any, _config: any, ctx: any, dt: number): void {
    const instance = node.__lighting_instance;
    if (!instance) return;
    if (typeof instance.onUpdate === 'function') instance.onUpdate(node, ctx, dt);
  },
} as const satisfies TraitHandler;
