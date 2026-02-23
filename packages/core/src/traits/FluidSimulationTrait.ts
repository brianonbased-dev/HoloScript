/**
 * FluidSimulationTrait.ts
 *
 * Fluid simulation system based on Smoothed Particle Hydrodynamics (SPH).
 * Simulates liquids with density, pressure, viscosity, and surface tension.
 *
 * @module traits/FluidSimulationTrait
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface FluidParticle {
  id: number;
  position: Vec3;
  velocity: Vec3;
  force: Vec3;
  density: number;
  pressure: number;
  mass: number;
}

export interface FluidCell {
  particles: number[]; // particle ids
  density: number;
  velocity: Vec3;
}

export interface FluidSimulationConfig {
  /** Rest density of the fluid (kg/m³) */
  restDensity?: number;
  /** Dynamic viscosity coefficient */
  viscosity?: number;
  /** Gas constant for pressure calculation */
  gasConstant?: number;
  /** Smoothing length for SPH kernel */
  smoothingLength?: number;
  /** Surface tension coefficient */
  surfaceTension?: number;
  /** Gravity vector */
  gravity?: Vec3;
  /** Bounding box */
  bounds?: { min: Vec3; max: Vec3 };
}

/**
 * SPH Fluid Simulation System
 *
 * A particle-based fluid simulation using Smoothed Particle Hydrodynamics.
 * Supports density queries, pressure, viscosity, and surface tension.
 */
export class FluidSimulationSystem {
  private particles: Map<number, FluidParticle> = new Map();
  private nextId = 0;
  private config: Required<FluidSimulationConfig>;
  private grid: Map<string, FluidCell> = new Map();
  private gridCellSize: number;

  constructor(config: FluidSimulationConfig = {}) {
    this.config = {
      restDensity: config.restDensity ?? 1000,
      viscosity: config.viscosity ?? 0.001,
      gasConstant: config.gasConstant ?? 8.314,
      smoothingLength: config.smoothingLength ?? 0.1,
      surfaceTension: config.surfaceTension ?? 0.072,
      gravity: config.gravity ?? { x: 0, y: -9.81, z: 0 },
      bounds: config.bounds ?? {
        min: { x: -10, y: -10, z: -10 },
        max: { x: 10, y: 10, z: 10 },
      },
    };
    this.gridCellSize = this.config.smoothingLength * 2;
  }

  /**
   * Add a fluid particle to the simulation
   */
  addParticle(position: Vec3, mass = 1.0): number {
    const id = this.nextId++;
    this.particles.set(id, {
      id,
      position: { ...position },
      velocity: { x: 0, y: 0, z: 0 },
      force: { x: 0, y: 0, z: 0 },
      density: this.config.restDensity,
      pressure: 0,
      mass,
    });
    this.updateGrid();
    return id;
  }

  /**
   * Remove a particle from the simulation
   */
  removeParticle(id: number): boolean {
    const removed = this.particles.delete(id);
    if (removed) this.updateGrid();
    return removed;
  }

  /**
   * Get all particles
   */
  getParticles(): FluidParticle[] {
    return Array.from(this.particles.values());
  }

  /**
   * Get a specific particle
   */
  getParticle(id: number): FluidParticle | undefined {
    return this.particles.get(id);
  }

  /**
   * Get fluid density at a world position using SPH interpolation
   */
  getDensityAt(position: Vec3): number {
    const h = this.config.smoothingLength;
    let density = 0;

    for (const particle of this.particles.values()) {
      const dx = position.x - particle.position.x;
      const dy = position.y - particle.position.y;
      const dz = position.z - particle.position.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (dist < h) {
        // Poly6 SPH kernel
        const q = 1 - (dist / h) ** 2;
        density += particle.mass * (315 / (64 * Math.PI * h ** 3)) * q ** 3;
      }
    }

    return density;
  }

  /**
   * Get fluid velocity at a world position using SPH interpolation
   */
  getVelocityAt(position: Vec3): Vec3 {
    const h = this.config.smoothingLength;
    const vel: Vec3 = { x: 0, y: 0, z: 0 };
    let totalWeight = 0;

    for (const particle of this.particles.values()) {
      const dx = position.x - particle.position.x;
      const dy = position.y - particle.position.y;
      const dz = position.z - particle.position.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (dist < h) {
        const q = 1 - (dist / h) ** 2;
        const weight = q ** 3;
        vel.x += particle.velocity.x * weight;
        vel.y += particle.velocity.y * weight;
        vel.z += particle.velocity.z * weight;
        totalWeight += weight;
      }
    }

    if (totalWeight > 0) {
      vel.x /= totalWeight;
      vel.y /= totalWeight;
      vel.z /= totalWeight;
    }

    return vel;
  }

  /**
   * Get fluid pressure at a world position
   */
  getPressureAt(position: Vec3): number {
    const density = this.getDensityAt(position);
    // Equation of state: P = k * (ρ - ρ₀)
    return this.config.gasConstant * (density - this.config.restDensity);
  }

  /**
   * Compute SPH densities for all particles
   */
  computeDensities(): void {
    const h = this.config.smoothingLength;
    const particles = Array.from(this.particles.values());

    for (const pi of particles) {
      let density = 0;

      for (const pj of particles) {
        const dx = pi.position.x - pj.position.x;
        const dy = pi.position.y - pj.position.y;
        const dz = pi.position.z - pj.position.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (dist < h) {
          const q = 1 - (dist / h) ** 2;
          density += pj.mass * (315 / (64 * Math.PI * h ** 3)) * q ** 3;
        }
      }

      pi.density = Math.max(density, this.config.restDensity * 0.01);
      pi.pressure = this.config.gasConstant * (pi.density - this.config.restDensity);
    }
  }

  /**
   * Compute SPH forces (pressure + viscosity + gravity + surface tension)
   */
  computeForces(): void {
    const h = this.config.smoothingLength;
    const particles = Array.from(this.particles.values());

    for (const pi of particles) {
      pi.force = { ...this.config.gravity };
      pi.force.x *= pi.mass;
      pi.force.y *= pi.mass;
      pi.force.z *= pi.mass;

      for (const pj of particles) {
        if (pi.id === pj.id) continue;

        const dx = pi.position.x - pj.position.x;
        const dy = pi.position.y - pj.position.y;
        const dz = pi.position.z - pj.position.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (dist < h && dist > 0.001) {
          const hd = h - dist;

          // Pressure force (Spiky kernel gradient)
          const pressureScale =
            -pj.mass *
            ((pi.pressure + pj.pressure) / (2 * pj.density)) *
            (-45 / (Math.PI * h ** 6)) *
            hd ** 2;

          pi.force.x += pressureScale * (dx / dist);
          pi.force.y += pressureScale * (dy / dist);
          pi.force.z += pressureScale * (dz / dist);

          // Viscosity force (Laplacian kernel)
          const viscScale =
            this.config.viscosity *
            pj.mass *
            (1 / pj.density) *
            (45 / (Math.PI * h ** 6)) *
            hd;

          pi.force.x += viscScale * (pj.velocity.x - pi.velocity.x);
          pi.force.y += viscScale * (pj.velocity.y - pi.velocity.y);
          pi.force.z += viscScale * (pj.velocity.z - pi.velocity.z);
        }
      }
    }
  }

  /**
   * Integrate particle positions using Euler integration
   */
  integrate(dt: number): void {
    const bounds = this.config.bounds;

    for (const particle of this.particles.values()) {
      // Update velocity: v += (F/m) * dt
      particle.velocity.x += (particle.force.x / particle.mass) * dt;
      particle.velocity.y += (particle.force.y / particle.mass) * dt;
      particle.velocity.z += (particle.force.z / particle.mass) * dt;

      // Update position: x += v * dt
      particle.position.x += particle.velocity.x * dt;
      particle.position.y += particle.velocity.y * dt;
      particle.position.z += particle.velocity.z * dt;

      // Boundary conditions (elastic reflection)
      const restitution = 0.3;

      if (particle.position.x < bounds.min.x) {
        particle.position.x = bounds.min.x;
        particle.velocity.x *= -restitution;
      } else if (particle.position.x > bounds.max.x) {
        particle.position.x = bounds.max.x;
        particle.velocity.x *= -restitution;
      }

      if (particle.position.y < bounds.min.y) {
        particle.position.y = bounds.min.y;
        particle.velocity.y *= -restitution;
      } else if (particle.position.y > bounds.max.y) {
        particle.position.y = bounds.max.y;
        particle.velocity.y *= -restitution;
      }

      if (particle.position.z < bounds.min.z) {
        particle.position.z = bounds.min.z;
        particle.velocity.z *= -restitution;
      } else if (particle.position.z > bounds.max.z) {
        particle.position.z = bounds.max.z;
        particle.velocity.z *= -restitution;
      }
    }

    this.updateGrid();
  }

  /**
   * Step the simulation by one timestep
   */
  step(dt = 0.016): void {
    this.computeDensities();
    this.computeForces();
    this.integrate(dt);
  }

  /**
   * Get total kinetic energy of the fluid
   */
  getKineticEnergy(): number {
    let energy = 0;
    for (const particle of this.particles.values()) {
      const v2 =
        particle.velocity.x ** 2 + particle.velocity.y ** 2 + particle.velocity.z ** 2;
      energy += 0.5 * particle.mass * v2;
    }
    return energy;
  }

  /**
   * Get average density of all particles
   */
  getAverageDensity(): number {
    if (this.particles.size === 0) return 0;
    let total = 0;
    for (const particle of this.particles.values()) {
      total += particle.density;
    }
    return total / this.particles.size;
  }

  /**
   * Get particle count
   */
  getParticleCount(): number {
    return this.particles.size;
  }

  /**
   * Get simulation config
   */
  getConfig(): Required<FluidSimulationConfig> {
    return { ...this.config };
  }

  /**
   * Update simulation config
   */
  updateConfig(config: Partial<FluidSimulationConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Reset the simulation
   */
  reset(): void {
    this.particles.clear();
    this.grid.clear();
    this.nextId = 0;
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private cellKey(x: number, y: number, z: number): string {
    const cx = Math.floor(x / this.gridCellSize);
    const cy = Math.floor(y / this.gridCellSize);
    const cz = Math.floor(z / this.gridCellSize);
    return `${cx},${cy},${cz}`;
  }

  private updateGrid(): void {
    this.grid.clear();
    for (const particle of this.particles.values()) {
      const key = this.cellKey(
        particle.position.x,
        particle.position.y,
        particle.position.z
      );
      if (!this.grid.has(key)) {
        this.grid.set(key, {
          particles: [],
          density: 0,
          velocity: { x: 0, y: 0, z: 0 },
        });
      }
      this.grid.get(key)!.particles.push(particle.id);
    }
  }
}
