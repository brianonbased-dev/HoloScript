import type { Vector3 } from '@holoscript/core';
/**
 * FluidSim.ts
 *
 * SPH fluid: particle-based fluid simulation, viscosity,
 * surface tension, boundary handling, and density queries.
 *
 * @module physics
 */

// =============================================================================
// TYPES
// =============================================================================

export interface FluidParticle {
  position: [number, number, number];
  velocity: Vector3;
  density: number;
  pressure: number;
  mass: number;
}

export interface FluidConfig {
  restDensity: number;
  gasConstant: number; // Pressure stiffness
  viscosity: number;
  surfaceTension: number;
  gravity: Vector3;
  smoothingRadius: number; // SPH kernel radius
  timeStep: number;
  boundaryMin: Vector3;
  boundaryMax: Vector3;
  boundaryDamping: number;
}

// =============================================================================
// FLUID SIM
// =============================================================================

export class FluidSim {
  private particles: FluidParticle[] = [];
  private config: FluidConfig;

  private toArr3(v: Vector3 | { x: number; y: number; z: number }): [number, number, number] {
    if (Array.isArray(v)) return [v[0], v[1], v[2]];
    return [v.x, v.y, v.z];
  }

  constructor(config?: Partial<FluidConfig>) {
    this.config = {
      restDensity: 1000,
      gasConstant: 2000,
      viscosity: 200,
      surfaceTension: 0.5,
      gravity: [0, -9.81, 0 ],
      smoothingRadius: 1,
      timeStep: 0.016,
      boundaryMin: [-10, -10, -10 ],
      boundaryMax: [10, 10, 10 ],
      boundaryDamping: 0.3,
      ...config,
    };
    this.config.gravity = this.toArr3(this.config.gravity as Vector3 | { x: number; y: number; z: number });
    this.config.boundaryMin = this.toArr3(this.config.boundaryMin as Vector3 | { x: number; y: number; z: number });
    this.config.boundaryMax = this.toArr3(this.config.boundaryMax as Vector3 | { x: number; y: number; z: number });
  }

  // ---------------------------------------------------------------------------
  // Particle Management
  // ---------------------------------------------------------------------------

  addParticle(
    position: [number, number, number] | { x: number; y: number; z: number },
    velocity?: Vector3 | { x: number; y: number; z: number }
  ): void {
    const p = this.toArr3(position);
    const v = velocity ? this.toArr3(velocity) : [0, 0, 0];
    this.particles.push({
      position: [p[0], p[1], p[2]],
      velocity: [v[0], v[1], v[2]],
      density: this.config.restDensity,
      pressure: 0,
      mass: 1,
    });
  }

  addBlock(
    min: Vector3 | { x: number; y: number; z: number },
    max: Vector3 | { x: number; y: number; z: number },
    spacing: number
  ): number {
    const minV = this.toArr3(min);
    const maxV = this.toArr3(max);
    let count = 0;
    for (let x = minV[0]; x <= maxV[0]; x += spacing) {
      for (let y = minV[1]; y <= maxV[1]; y += spacing) {
        for (let z = minV[2]; z <= maxV[2]; z += spacing) {
          this.addParticle([x, y, z]);
          count++;
        }
      }
    }
    return count;
  }

  // ---------------------------------------------------------------------------
  // SPH Kernels
  // ---------------------------------------------------------------------------

  private poly6(r2: number, h: number): number {
    if (r2 >= h * h) return 0;
    const h2 = h * h;
    const diff = h2 - r2;
    return (315 / (64 * Math.PI * Math.pow(h, 9))) * diff * diff * diff;
  }

  private spikyGrad(r: number, h: number): number {
    if (r >= h || r === 0) return 0;
    const diff = h - r;
    return -(45 / (Math.PI * Math.pow(h, 6))) * diff * diff;
  }

  private viscosityLaplacian(r: number, h: number): number {
    if (r >= h) return 0;
    return (45 / (Math.PI * Math.pow(h, 6))) * (h - r);
  }

  // ---------------------------------------------------------------------------
  // Simulation Step
  // ---------------------------------------------------------------------------

  update(): void {
    const h = this.config.smoothingRadius;
    const dt = this.config.timeStep;

    // 1. Compute density & pressure
    for (const pi of this.particles) {
      pi.density = 0;
      for (const pj of this.particles) {
        const dx = pj.position[0] - pi.position[0];
        const dy = pj.position[1] - pi.position[1];
        const dz = pj.position[2] - pi.position[2];
        const r2 = dx * dx + dy * dy + dz * dz;
        pi.density += pj.mass * this.poly6(r2, h);
      }
      pi.pressure = this.config.gasConstant * (pi.density - this.config.restDensity);
    }

    // 2. Compute forces & integrate
    for (const pi of this.particles) {
      let fx = 0,
        fy = 0,
        fz = 0;

      for (const pj of this.particles) {
        if (pi === pj) continue;

        const dx = pj.position[0] - pi.position[0];
        const dy = pj.position[1] - pi.position[1];
        const dz = pj.position[2] - pi.position[2];
        const r = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (r < h && r > 0) {
          // Pressure force
          const pressGrad = this.spikyGrad(r, h);
          const pressScale =
            ((-pj.mass * (pi.pressure + pj.pressure)) / (2 * pj.density || 1)) * pressGrad;
          fx += (dx / r) * pressScale;
          fy += (dy / r) * pressScale;
          fz += (dz / r) * pressScale;

          // Viscosity force
          const viscLap = this.viscosityLaplacian(r, h);
          const viscScale = ((this.config.viscosity * pj.mass) / (pj.density || 1)) * viscLap;
          fx += (pj.velocity[0] - pi.velocity[0]) * viscScale;
          fy += (pj.velocity[1] - pi.velocity[1]) * viscScale;
          fz += (pj.velocity[2] - pi.velocity[2]) * viscScale;
        }
      }

      // Gravity
      fx += this.config.gravity[0] * pi.density;
      fy += this.config.gravity[1] * pi.density;
      fz += this.config.gravity[2] * pi.density;

      // Integrate
      const invDensity = 1 / (pi.density || 1);
      pi.velocity[0] += fx * invDensity * dt;
      pi.velocity[1] += fy * invDensity * dt;
      pi.velocity[2] += fz * invDensity * dt;

      pi.position[0] += pi.velocity[0] * dt;
      pi.position[1] += pi.velocity[1] * dt;
      pi.position[2] += pi.velocity[2] * dt;
    }

    // 3. Boundary enforcement
    this.enforceBoundaries();
  }

  private enforceBoundaries(): void {
    const { boundaryMin: mn, boundaryMax: mx, boundaryDamping: d } = this.config;
    for (const p of this.particles) {
      if (p.position[0] < mn[0]) {
        p.position[0] = mn[0];
        p.velocity[0] *= -d;
      }
      if (p.position[0] > mx[0]) {
        p.position[0] = mx[0];
        p.velocity[0] *= -d;
      }
      if (p.position[1] < mn[1]) {
        p.position[1] = mn[1];
        p.velocity[1] *= -d;
      }
      if (p.position[1] > mx[1]) {
        p.position[1] = mx[1];
        p.velocity[1] *= -d;
      }
      if (p.position[2] < mn[2]) {
        p.position[2] = mn[2];
        p.velocity[2] *= -d;
      }
      if (p.position[2] > mx[2]) {
        p.position[2] = mx[2];
        p.velocity[2] *= -d;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getParticles(): FluidParticle[] {
    return this.particles;
  }
  getParticleCount(): number {
    return this.particles.length;
  }
  getAverageDensity(): number {
    if (this.particles.length === 0) return 0;
    return this.particles.reduce((s, p) => s + p.density, 0) / this.particles.length;
  }
  getKineticEnergy(): number {
    return this.particles.reduce((s, p) => {
      return s + 0.5 * p.mass * (p.velocity[0] ** 2 + p.velocity[1] ** 2 + p.velocity[2] ** 2);
    }, 0);
  }
  clear(): void {
    this.particles = [];
  }
  setConfig(config: Partial<FluidConfig>): void {
    Object.assign(this.config, config);
    this.config.gravity = this.toArr3(this.config.gravity as Vector3 | { x: number; y: number; z: number });
    this.config.boundaryMin = this.toArr3(this.config.boundaryMin as Vector3 | { x: number; y: number; z: number });
    this.config.boundaryMax = this.toArr3(this.config.boundaryMax as Vector3 | { x: number; y: number; z: number });
  }
}
