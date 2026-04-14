/**
 * SkyRenderer.ts
 *
 * Procedural sky: gradient colors, star field, cloud layers,
 * sun/moon discs, and atmospheric scattering approximation.
 *
 * @module environment
 */

// =============================================================================
// TYPES
// =============================================================================

export interface SkyGradient {
  top: { r: number; g: number; b: number };
  horizon: { r: number; g: number; b: number };
  bottom: { r: number; g: number; b: number };
}

export interface StarField {
  seed: number;
  density: number; // stars per unit area
  brightness: number; // 0-1
  twinkleSpeed: number;
}

export interface CloudLayer {
  id: string;
  altitude: number;
  coverage: number; // 0-1
  speed: { x: number; z: number };
  color: { r: number; g: number; b: number; a: number };
  scale: number;
  offset: { x: number; z: number };
}

export interface CelestialBody {
  visible: boolean;
  angle: number;
  size: number;
  color: { r: number; g: number; b: number };
  intensity: number;
}

// =============================================================================
// SKY RENDERER
// =============================================================================

let _cloudId = 0;

export class SkyRenderer {
  private gradient: SkyGradient = {
    top: { r: 0.3, g: 0.5, b: 0.9 },
    horizon: { r: 0.7, g: 0.8, b: 1 },
    bottom: { r: 0.4, g: 0.4, b: 0.5 },
  };
  private stars: StarField = { seed: 42, density: 100, brightness: 1, twinkleSpeed: 1 };
  private clouds: Map<string, CloudLayer> = new Map();
  private sun: CelestialBody = {
    visible: true,
    angle: 90,
    size: 10,
    color: { r: 1, g: 0.95, b: 0.8 },
    intensity: 1,
  };
  private moon: CelestialBody = {
    visible: false,
    angle: -45,
    size: 8,
    color: { r: 0.9, g: 0.9, b: 1 },
    intensity: 0.3,
  };
  private moonPhase = 0; // 0-7 (new, waxing crescent, first quarter, etc.)
  private starsVisible = false;

  // ---------------------------------------------------------------------------
  // Gradient
  // ---------------------------------------------------------------------------

  setGradient(gradient: SkyGradient): void {
    this.gradient = { ...gradient };
  }
  getGradient(): SkyGradient {
    return { ...this.gradient };
  }

  sampleGradient(t: number): { r: number; g: number; b: number } {
    // t: 0 = bottom, 0.5 = horizon, 1 = top
    if (t <= 0.5) {
      const localT = t * 2;
      return this.lerpColor(this.gradient.bottom, this.gradient.horizon, localT);
    } else {
      const localT = (t - 0.5) * 2;
      return this.lerpColor(this.gradient.horizon, this.gradient.top, localT);
    }
  }

  private lerpColor(
    a: { r: number; g: number; b: number },
    b: { r: number; g: number; b: number },
    t: number
  ) {
    return { r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t };
  }

  // ---------------------------------------------------------------------------
  // Stars
  // ---------------------------------------------------------------------------

  setStarField(config: Partial<StarField>): void {
    Object.assign(this.stars, config);
  }
  setStarsVisible(visible: boolean): void {
    this.starsVisible = visible;
  }
  areStarsVisible(): boolean {
    return this.starsVisible;
  }
  getStarField(): StarField {
    return { ...this.stars };
  }

  // ---------------------------------------------------------------------------
  // Clouds
  // ---------------------------------------------------------------------------

  addCloudLayer(coverage: number, altitude = 1000, speed?: { x: number; z: number }): CloudLayer {
    const id = `cloud_${_cloudId++}`;
    const layer: CloudLayer = {
      id,
      altitude,
      coverage,
      speed: speed ?? { x: 5, z: 0 },
      color: { r: 1, g: 1, b: 1, a: 0.8 },
      scale: 1,
      offset: { x: 0, z: 0 },
    };
    this.clouds.set(id, layer);
    return layer;
  }

  removeCloudLayer(id: string): boolean {
    return this.clouds.delete(id);
  }
  getCloudLayers(): CloudLayer[] {
    return [...this.clouds.values()];
  }
  getCloudCount(): number {
    return this.clouds.size;
  }

  updateClouds(dt: number): void {
    for (const layer of this.clouds.values()) {
      layer.offset[0] += layer.speed[0] * dt;
      layer.offset[2] += layer.speed[2] * dt;
    }
  }

  // ---------------------------------------------------------------------------
  // Sun / Moon
  // ---------------------------------------------------------------------------

  setSunAngle(angle: number): void {
    this.sun.angle = angle;
    this.sun.visible = angle >= 0;
  }
  setMoonAngle(angle: number): void {
    this.moon.angle = angle;
    this.moon.visible = angle >= 0;
  }
  setMoonPhase(phase: number): void {
    this.moonPhase = phase % 8;
  }
  getMoonPhase(): number {
    return this.moonPhase;
  }
  getSun(): CelestialBody {
    return { ...this.sun };
  }
  getMoon(): CelestialBody {
    return { ...this.moon };
  }

  // ---------------------------------------------------------------------------
  // Time-of-Day Presets
  // ---------------------------------------------------------------------------

  applyDaytime(): void {
    this.setGradient({
      top: { r: 0.25, g: 0.45, b: 0.85 },
      horizon: { r: 0.6, g: 0.75, b: 0.95 },
      bottom: { r: 0.4, g: 0.4, b: 0.5 },
    });
    this.starsVisible = false;
  }

  applySunset(): void {
    this.setGradient({
      top: { r: 0.3, g: 0.3, b: 0.6 },
      horizon: { r: 1, g: 0.5, b: 0.2 },
      bottom: { r: 0.5, g: 0.2, b: 0.1 },
    });
    this.starsVisible = false;
  }

  applyNight(): void {
    this.setGradient({
      top: { r: 0.02, g: 0.02, b: 0.08 },
      horizon: { r: 0.05, g: 0.05, b: 0.15 },
      bottom: { r: 0.03, g: 0.03, b: 0.05 },
    });
    this.starsVisible = true;
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getTotalCoverage(): number {
    let maxCoverage = 0;
    for (const layer of this.clouds.values()) {
      maxCoverage = Math.max(maxCoverage, layer.coverage);
    }
    return maxCoverage;
  }
}
