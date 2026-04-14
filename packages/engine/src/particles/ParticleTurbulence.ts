/**
 * ParticleTurbulence.ts
 *
 * Turbulence fields for particles: curl noise approximation,
 * vortex fields, time-varying strength, and frequency control.
 *
 * @module particles
 */

// =============================================================================
// TYPES
// =============================================================================

export interface TurbulenceConfig {
  strength: number;
  frequency: number;
  octaves: number;
  time: number;
}

interface TurbParticle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
}

// =============================================================================
// PARTICLE TURBULENCE
// =============================================================================

export class ParticleTurbulence {
  private config: TurbulenceConfig;

  constructor(config?: Partial<TurbulenceConfig>) {
    this.config = { strength: 1, frequency: 1, octaves: 1, time: 0, ...config };
  }

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  setStrength(s: number): void {
    this.config.strength = s;
  }
  setFrequency(f: number): void {
    this.config.frequency = f;
  }
  setTime(t: number): void {
    this.config.time = t;
  }
  getConfig(): TurbulenceConfig {
    return { ...this.config };
  }

  // ---------------------------------------------------------------------------
  // Curl Noise Approximation
  // ---------------------------------------------------------------------------

  sampleCurl(x: number, y: number, z: number): { fx: number; fy: number; fz: number } {
    const f = this.config.frequency;
    const t = this.config.time;
    let fx = 0,
      fy = 0,
      fz = 0;

    for (let o = 0; o < this.config.octaves; o++) {
      const scale = Math.pow(2, o);
      const amp = 1 / scale;

      // Pseudo curl noise via sinusoidal approximation
      fx += Math.sin(y * f * scale + t) * amp - Math.cos(z * f * scale + t * 0.7) * amp;
      fy += Math.sin(z * f * scale + t * 1.3) * amp - Math.cos(x * f * scale + t * 0.5) * amp;
      fz += Math.sin(x * f * scale + t * 0.9) * amp - Math.cos(y * f * scale + t * 1.1) * amp;
    }

    return {
      fx: fx * this.config.strength,
      fy: fy * this.config.strength,
      fz: fz * this.config.strength,
    };
  }

  // ---------------------------------------------------------------------------
  // Application
  // ---------------------------------------------------------------------------

  apply(particles: TurbParticle[], dt: number): void {
    for (const p of particles) {
      const curl = this.sampleCurl(p[0], p[1], p[2]);
      p.vx += curl.fx * dt;
      p.vy += curl.fy * dt;
      p.vz += curl.fz * dt;
    }
  }

  // ---------------------------------------------------------------------------
  // Advance Time
  // ---------------------------------------------------------------------------

  tick(dt: number): void {
    this.config.time += dt;
  }
}
