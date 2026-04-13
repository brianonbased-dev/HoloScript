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
  velocity: { x: number; y: number; z: number };
  density: number;
  pressure: number;
  mass: number;
}

export interface FluidConfig {
  restDensity: number;
  gasConstant: number; // Pressure stiffness
  viscosity: number;
  surfaceTension: number;
  gravity: { x: number; y: number; z: number };
  smoothingRadius: number; // SPH kernel radius
  timeStep: number;
  boundaryMin: { x: number; y: number; z: number };
  boundaryMax: { x: number; y: number; z: number };
  boundaryDamping: number;
}

// =============================================================================
// FLUID SIM
// =============================================================================

export class FluidSim {
  private particles: FluidParticle[] = [];
  private config: FluidConfig;

  constructor(config?: Partial<FluidConfig>) {
    this.config = {
      restDensity: 1000,
      gasConstant: 2000,
      viscosity: 200,
      surfaceTension: 0.5,
      gravity: { x: 0, y: -9.81, z: 0 },
      smoothingRadius: 1,
      timeStep: 0.016,
      boundaryMin: { x: -10, y: -10, z: -10 },
      boundaryMax: { x: 10, y: 10, z: 10 },
      boundaryDamping: 0.3,
      ...config,
    };
  }

  // ---------------------------------------------------------------------------
  // Particle Management
  // ---------------------------------------------------------------------------

  addParticle(
    position: [number, number, number],
    velocity?: { x: number; y: number; z: number }
  ): void {
    this.particles.push({
      position: { ...position },
      velocity: velocity ? { ...velocity } : { x: 0, y: 0, z: 0 },
      density: this.config.restDensity,
      pressure: 0,
      mass: 1,
    });
  }

  addBlock(
    min: { x: number; y: number; z: number },
    max: { x: number; y: number; z: number },
    spacing: number
  ): number {
    let count = 0;
    for (let x = min.x; x <= max.x; x += spacing) {
      for (let y = min.y; y <= max.y; y += spacing) {
        for (let z = min.z; z <= max.z; z += spacing) {
          this.addParticle({ x, y, z });
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
          fx += (pj.velocity.x - pi.velocity.x) * viscScale;
          fy += (pj.velocity.y - pi.velocity.y) * viscScale;
          fz += (pj.velocity.z - pi.velocity.z) * viscScale;
        }
      }

      // Gravity
      fx += this.config.gravity.x * pi.density;
      fy += this.config.gravity.y * pi.density;
      fz += this.config.gravity.z * pi.density;

      // Integrate
      const invDensity = 1 / (pi.density || 1);
      pi.velocity.x += fx * invDensity * dt;
      pi.velocity.y += fy * invDensity * dt;
      pi.velocity.z += fz * invDensity * dt;

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
        p.velocity.x *= -d;
      }
      if (p.position[0] > mx[0]) {
        p.position[0] = mx[0];
        p.velocity.x *= -d;
      }
      if (p.position[1] < mn[1]) {
        p.position[1] = mn[1];
        p.velocity.y *= -d;
      }
      if (p.position[1] > mx[1]) {
        p.position[1] = mx[1];
        p.velocity.y *= -d;
      }
      if (p.position[2] < mn[2]) {
        p.position[2] = mn[2];
        p.velocity.z *= -d;
      }
      if (p.position[2] > mx[2]) {
        p.position[2] = mx[2];
        p.velocity.z *= -d;
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
      return s + 0.5 * p.mass * (p.velocity.x ** 2 + p.velocity.y ** 2 + p.velocity.z ** 2);
    }, 0);
  }
  clear(): void {
    this.particles = [];
  }
  setConfig(config: Partial<FluidConfig>): void {
    Object.assign(this.config, config);
  }
}
