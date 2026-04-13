/**
 * LightingModel.ts
 *
 * Lighting: directional/point/spot lights, shadow maps,
 * ambient/IBL, GI probes, and light culling.
 *
 * @module rendering
 */

// =============================================================================
// TYPES
// =============================================================================

export type LightType = 'directional' | 'point' | 'spot';

export interface Light {
  id: string;
  type: LightType;
  color: [number, number, number];
  intensity: number;
  position: [number, number, number];
  direction: { x: number; y: number; z: number };
  range: number; // Point/Spot
  spotAngle: number; // Spot only (degrees)
  spotPenumbra: number; // Soft edge (0-1)
  castShadow: boolean;
  shadowBias: number;
  shadowMapSize: number;
  enabled: boolean;
  layer: number; // Bitmask layer
}

export interface AmbientConfig {
  color: [number, number, number];
  intensity: number;
  skyColor: [number, number, number];
  groundColor: [number, number, number];
  useHemisphere: boolean;
}

export interface GIProbe {
  id: string;
  position: [number, number, number];
  radius: number;
  irradiance: [number, number, number]; // Average bounce light
  weight: number;
}

// =============================================================================
// LIGHTING MODEL
// =============================================================================

export class LightingModel {
  private lights: Map<string, Light> = new Map();
  private ambient: AmbientConfig = {
    color: [0.1, 0.1, 0.15],
    intensity: 0.3,
    skyColor: [0.4, 0.5, 0.8],
    groundColor: [0.2, 0.15, 0.1],
    useHemisphere: false,
  };
  private probes: GIProbe[] = [];
  private maxLights = 128;

  // ---------------------------------------------------------------------------
  // Light Management
  // ---------------------------------------------------------------------------

  addLight(config: Partial<Light> & { id: string; type: LightType }): Light {
    const light: Light = {
      color: [1, 1, 1],
      intensity: 1,
      position: [0, 10, 0],
      direction: { x: 0, y: -1, z: 0 },
      range: 50,
      spotAngle: 45,
      spotPenumbra: 0.2,
      castShadow: false,
      shadowBias: 0.001,
      shadowMapSize: 1024,
      enabled: true,
      layer: 0xffffffff,
      ...config,
    };
    this.lights.set(light.id, light);
    return light;
  }

  removeLight(id: string): void {
    this.lights.delete(id);
  }
  getLight(id: string): Light | undefined {
    return this.lights.get(id);
  }
  getLightCount(): number {
    return this.lights.size;
  }

  enableLight(id: string, enabled: boolean): void {
    const l = this.lights.get(id);
    if (l) l.enabled = enabled;
  }

  // ---------------------------------------------------------------------------
  // Ambient / GI
  // ---------------------------------------------------------------------------

  setAmbient(config: Partial<AmbientConfig>): void {
    Object.assign(this.ambient, config);
  }
  getAmbient(): AmbientConfig {
    return { ...this.ambient };
  }

  addGIProbe(probe: GIProbe): void {
    this.probes.push(probe);
  }
  removeGIProbe(id: string): void {
    this.probes = this.probes.filter((p) => p.id !== id);
  }

  sampleGI(position: [number, number, number]): [number, number, number] {
    let r = 0,
      g = 0,
      b = 0,
      totalWeight = 0;
    for (const probe of this.probes) {
      const dx = position.x - probe.position.x;
      const dy = position.y - probe.position.y;
      const dz = position.z - probe.position.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist > probe.radius) continue;

      const w = (1 - dist / probe.radius) * probe.weight;
      r += probe.irradiance[0] * w;
      g += probe.irradiance[1] * w;
      b += probe.irradiance[2] * w;
      totalWeight += w;
    }

    if (totalWeight > 0) {
      return [r / totalWeight, g / totalWeight, b / totalWeight];
    }
    return [
      this.ambient.color[0] * this.ambient.intensity,
      this.ambient.color[1] * this.ambient.intensity,
      this.ambient.color[2] * this.ambient.intensity,
    ];
  }

  // ---------------------------------------------------------------------------
  // Light Calculations
  // ---------------------------------------------------------------------------

  calculateAttenuation(lightId: string, worldPos: { x: number; y: number; z: number }): number {
    const light = this.lights.get(lightId);
    if (!light || !light.enabled) return 0;

    if (light.type === 'directional') return 1; // No distance falloff

    const dx = worldPos.x - light.position.x;
    const dy = worldPos.y - light.position.y;
    const dz = worldPos.z - light.position.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (dist >= light.range) return 0;

    const attenuation = Math.max(0, 1 - (dist / light.range) ** 2);

    if (light.type === 'spot') {
      // Spot cone falloff
      const dirLen =
        Math.sqrt(light.direction.x ** 2 + light.direction.y ** 2 + light.direction.z ** 2) || 1;
      const ndx = light.direction.x / dirLen,
        ndy = light.direction.y / dirLen,
        ndz = light.direction.z / dirLen;
      const toLight = dist || 1;
      const dot = (dx * ndx + dy * ndy + dz * ndz) / toLight;
      const cosAngle = Math.cos((light.spotAngle * Math.PI) / 360);
      const cosPenumbra = Math.cos((light.spotAngle * (1 - light.spotPenumbra) * Math.PI) / 360);

      if (dot < cosAngle) return 0;
      const spotFactor = dot > cosPenumbra ? 1 : (dot - cosAngle) / (cosPenumbra - cosAngle);
      return attenuation * spotFactor;
    }

    return attenuation;
  }

  // ---------------------------------------------------------------------------
  // Culling
  // ---------------------------------------------------------------------------

  getVisibleLights(
    cameraPos: { x: number; y: number; z: number },
    maxRange: number,
    layerMask = 0xffffffff
  ): Light[] {
    const visible: Light[] = [];
    for (const light of this.lights.values()) {
      if (!light.enabled) continue;
      if ((light.layer & layerMask) === 0) continue;

      if (light.type === 'directional') {
        visible.push(light);
        continue;
      }

      const dx = light.position.x - cameraPos.x;
      const dy = light.position.y - cameraPos.y;
      const dz = light.position.z - cameraPos.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist < maxRange + light.range) visible.push(light);
    }

    return visible.slice(0, this.maxLights);
  }

  getShadowCasters(): Light[] {
    return [...this.lights.values()].filter((l) => l.enabled && l.castShadow);
  }
}
