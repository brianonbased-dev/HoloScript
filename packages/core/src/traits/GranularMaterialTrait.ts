/**
 * GranularMaterialTrait.ts
 *
 * Granular material simulation system using particle-based DEM (Discrete Element Method).
 * Simulates sand, gravel, soil, debris, and other granular materials.
 *
 * Features:
 * - SPH-based granular particle dynamics
 * - Frictional contact forces
 * - Cohesion for wet/sticky materials
 * - Gravity and external forces
 * - Efficient spatial hashing
 *
 * @module traits/GranularMaterialTrait
 */

// ============================================================================
// Types
// ============================================================================

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface GranularParticle {
  /** Particle ID */
  id: number;
  /** World-space position */
  position: Vec3;
  /** Velocity */
  velocity: Vec3;
  /** Accumulated force for this step */
  force: Vec3;
  /** Particle radius (meters) */
  radius: number;
  /** Particle mass (kg) */
  mass: number;
  /** Whether this particle is active */
  active: boolean;
  /** Material tag */
  materialTag: string;
}

export interface GranularMaterial {
  /** Density (kg/m³) */
  density: number;
  /** Restitution coefficient (bounciness) 0..1 */
  restitution: number;
  /** Static friction coefficient */
  friction: number;
  /** Cohesion (Pa) — for wet/sticky materials */
  cohesion: number;
  /** Contact stiffness (N/m) */
  stiffness: number;
  /** Damping ratio */
  damping: number;
}

export interface GranularBounds {
  min: Vec3;
  max: Vec3;
}

export interface GranularMaterialConfig {
  /** Gravity vector */
  gravity?: Vec3;
  /** Simulation bounds */
  bounds?: GranularBounds;
  /** Material properties */
  material?: Partial<GranularMaterial>;
  /** Enable inter-particle collision */
  enableCollision?: boolean;
  /** Spatial grid cell size (should be > 2*max_radius) */
  gridCellSize?: number;
  /** Max particles to simulate */
  maxParticles?: number;
}

interface ResolvedConfig {
  gravity: Vec3;
  bounds: GranularBounds;
  material: GranularMaterial;
  enableCollision: boolean;
  gridCellSize: number;
  maxParticles: number;
}

// ============================================================================
// Granular Material System
// ============================================================================

/**
 * Granular Material Simulation System
 *
 * Simulates granular media (sand, gravel, debris) using particle-based
 * DEM with frictional contact mechanics.
 *
 * @example
 * ```typescript
 * const sand = new GranularMaterialSystem({
 *   material: { density: 1500, friction: 0.5, cohesion: 0 },
 *   bounds: { min: { x: -5, y: -5, z: -5 }, max: { x: 5, y: 5, z: 5 } },
 * });
 *
 * // Add a pile of sand particles
 * for (let i = 0; i < 1000; i++) {
 *   sand.addParticle({ x: Math.random()*2 - 1, y: 2 + i*0.05, z: Math.random()*2 - 1 }, 0.02);
 * }
 *
 * // Simulate
 * sand.step(0.016);
 * ```
 */
export class GranularMaterialSystem {
  private particles: Map<number, GranularParticle> = new Map();
  private config: ResolvedConfig;
  private nextId = 0;
  private spatialGrid: Map<string, Set<number>> = new Map();
  private stepCount = 0;

  constructor(config: GranularMaterialConfig = {}) {
    const mat: GranularMaterial = {
      density: config.material?.density ?? 1500,
      restitution: config.material?.restitution ?? 0.3,
      friction: config.material?.friction ?? 0.5,
      cohesion: config.material?.cohesion ?? 0,
      stiffness: config.material?.stiffness ?? 1e6,
      damping: config.material?.damping ?? 0.1,
    };

    this.config = {
      gravity: config.gravity ?? { x: 0, y: -9.81, z: 0 },
      bounds: config.bounds ?? {
        min: { x: -10, y: -10, z: -10 },
        max: { x: 10, y: 10, z: 10 },
      },
      material: mat,
      enableCollision: config.enableCollision ?? true,
      gridCellSize: config.gridCellSize ?? 0.1,
      maxParticles: config.maxParticles ?? 10000,
    };
  }

  // ─── Particle Management ─────────────────────────────────────────────────

  /**
   * Add a particle at the given position with the given radius.
   * @returns The new particle's ID, or -1 if max particles exceeded.
   */
  addParticle(position: Vec3, radius: number, materialTag = 'default'): number {
    if (this.particles.size >= this.config.maxParticles) {
      return -1;
    }

    const volume = (4 / 3) * Math.PI * radius ** 3;
    const mass = this.config.material.density * volume;

    const id = this.nextId++;
    this.particles.set(id, {
      id,
      position: { ...position },
      velocity: { x: 0, y: 0, z: 0 },
      force: { x: 0, y: 0, z: 0 },
      radius,
      mass,
      active: true,
      materialTag,
    });

    this.insertIntoGrid(id, position);
    return id;
  }

  /**
   * Remove a particle by ID.
   */
  removeParticle(id: number): boolean {
    const p = this.particles.get(id);
    if (!p) return false;
    this.removeFromGrid(id, p.position);
    return this.particles.delete(id);
  }

  /**
   * Get all active particles.
   */
  getParticles(): GranularParticle[] {
    return Array.from(this.particles.values()).filter((p) => p.active);
  }

  /**
   * Get a particle by ID.
   */
  getParticle(id: number): GranularParticle | undefined {
    return this.particles.get(id);
  }

  /**
   * Get total particle count (including inactive).
   */
  getParticleCount(): number {
    return this.particles.size;
  }

  // ─── Physics ──────────────────────────────────────────────────────────────

  /**
   * Apply an external impulse force to all particles within a radius.
   */
  applyImpulse(position: Vec3, force: Vec3, radius: number): void {
    for (const particle of this.particles.values()) {
      if (!particle.active) continue;
      const dx = particle.position.x - position.x;
      const dy = particle.position.y - position.y;
      const dz = particle.position.z - position.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist < radius) {
        const falloff = 1 - dist / radius;
        particle.velocity.x += (force.x * falloff) / particle.mass;
        particle.velocity.y += (force.y * falloff) / particle.mass;
        particle.velocity.z += (force.z * falloff) / particle.mass;
      }
    }
  }

  /**
   * Step the simulation by dt seconds.
   */
  step(dt = 0.016): void {
    // Clear forces
    for (const p of this.particles.values()) {
      p.force.x = this.config.gravity.x * p.mass;
      p.force.y = this.config.gravity.y * p.mass;
      p.force.z = this.config.gravity.z * p.mass;
    }

    // Particle-particle collisions
    if (this.config.enableCollision) {
      this.resolveCollisions();
    }

    const damping = this.config.material.damping;
    const bounds = this.config.bounds;
    const restitution = this.config.material.restitution;

    // Integrate
    for (const p of this.particles.values()) {
      if (!p.active) continue;

      const oldPos = { ...p.position };

      // Semi-implicit Euler
      p.velocity.x = p.velocity.x * (1 - damping) + (p.force.x / p.mass) * dt;
      p.velocity.y = p.velocity.y * (1 - damping) + (p.force.y / p.mass) * dt;
      p.velocity.z = p.velocity.z * (1 - damping) + (p.force.z / p.mass) * dt;

      p.position.x += p.velocity.x * dt;
      p.position.y += p.velocity.y * dt;
      p.position.z += p.velocity.z * dt;

      // Boundary reflection
      if (p.position.x - p.radius < bounds.min.x) {
        p.position.x = bounds.min.x + p.radius;
        p.velocity.x = Math.abs(p.velocity.x) * restitution;
      } else if (p.position.x + p.radius > bounds.max.x) {
        p.position.x = bounds.max.x - p.radius;
        p.velocity.x = -Math.abs(p.velocity.x) * restitution;
      }

      if (p.position.y - p.radius < bounds.min.y) {
        p.position.y = bounds.min.y + p.radius;
        p.velocity.y = Math.abs(p.velocity.y) * restitution;
      } else if (p.position.y + p.radius > bounds.max.y) {
        p.position.y = bounds.max.y - p.radius;
        p.velocity.y = -Math.abs(p.velocity.y) * restitution;
      }

      if (p.position.z - p.radius < bounds.min.z) {
        p.position.z = bounds.min.z + p.radius;
        p.velocity.z = Math.abs(p.velocity.z) * restitution;
      } else if (p.position.z + p.radius > bounds.max.z) {
        p.position.z = bounds.max.z - p.radius;
        p.velocity.z = -Math.abs(p.velocity.z) * restitution;
      }

      // Update spatial grid
      this.removeFromGrid(p.id, oldPos);
      this.insertIntoGrid(p.id, p.position);
    }

    this.stepCount++;
  }

  // ─── Configuration ────────────────────────────────────────────────────────

  /**
   * Get current configuration.
   */
  getConfig(): ResolvedConfig {
    return {
      ...this.config,
      material: { ...this.config.material },
      bounds: { ...this.config.bounds },
    };
  }

  /**
   * Update configuration.
   */
  updateConfig(config: Partial<GranularMaterialConfig>): void {
    if (config.gravity) this.config.gravity = { ...config.gravity };
    if (config.bounds) this.config.bounds = { ...config.bounds };
    if (config.material) {
      this.config.material = { ...this.config.material, ...config.material };
    }
    if (config.enableCollision !== undefined) {
      this.config.enableCollision = config.enableCollision;
    }
    if (config.gridCellSize !== undefined) {
      this.config.gridCellSize = config.gridCellSize;
    }
    if (config.maxParticles !== undefined) {
      this.config.maxParticles = config.maxParticles;
    }
  }

  // ─── Statistics ───────────────────────────────────────────────────────────

  /**
   * Get center of mass of all particles.
   */
  getCenterOfMass(): Vec3 {
    let cx = 0,
      cy = 0,
      cz = 0,
      totalMass = 0;
    for (const p of this.particles.values()) {
      if (!p.active) continue;
      cx += p.position.x * p.mass;
      cy += p.position.y * p.mass;
      cz += p.position.z * p.mass;
      totalMass += p.mass;
    }
    if (totalMass === 0) return { x: 0, y: 0, z: 0 };
    return { x: cx / totalMass, y: cy / totalMass, z: cz / totalMass };
  }

  /**
   * Get total kinetic energy.
   */
  getKineticEnergy(): number {
    let energy = 0;
    for (const p of this.particles.values()) {
      if (!p.active) continue;
      const v2 = p.velocity.x ** 2 + p.velocity.y ** 2 + p.velocity.z ** 2;
      energy += 0.5 * p.mass * v2;
    }
    return energy;
  }

  /**
   * Get average speed.
   */
  getAverageSpeed(): number {
    const particles = this.getParticles();
    if (particles.length === 0) return 0;
    let total = 0;
    for (const p of particles) {
      total += Math.sqrt(p.velocity.x ** 2 + p.velocity.y ** 2 + p.velocity.z ** 2);
    }
    return total / particles.length;
  }

  /**
   * Get total step count.
   */
  getStepCount(): number {
    return this.stepCount;
  }

  /**
   * Reset the simulation.
   */
  reset(): void {
    this.particles.clear();
    this.spatialGrid.clear();
    this.nextId = 0;
    this.stepCount = 0;
  }

  // ─── Private ─────────────────────────────────────────────────────────────

  private gridKey(x: number, y: number, z: number): string {
    const cs = this.config.gridCellSize;
    return `${Math.floor(x / cs)},${Math.floor(y / cs)},${Math.floor(z / cs)}`;
  }

  private insertIntoGrid(id: number, pos: Vec3): void {
    const key = this.gridKey(pos.x, pos.y, pos.z);
    if (!this.spatialGrid.has(key)) {
      this.spatialGrid.set(key, new Set());
    }
    this.spatialGrid.get(key)!.add(id);
  }

  private removeFromGrid(id: number, pos: Vec3): void {
    const key = this.gridKey(pos.x, pos.y, pos.z);
    this.spatialGrid.get(key)?.delete(id);
  }

  private getNeighborCandidates(pos: Vec3, radius: number): number[] {
    const cs = this.config.gridCellSize;
    const range = Math.ceil(radius / cs) + 1;
    const cx = Math.floor(pos.x / cs);
    const cy = Math.floor(pos.y / cs);
    const cz = Math.floor(pos.z / cs);
    const candidates: number[] = [];

    for (let dx = -range; dx <= range; dx++) {
      for (let dy = -range; dy <= range; dy++) {
        for (let dz = -range; dz <= range; dz++) {
          const key = `${cx + dx},${cy + dy},${cz + dz}`;
          const cell = this.spatialGrid.get(key);
          if (cell) {
            for (const id of cell) {
              candidates.push(id);
            }
          }
        }
      }
    }

    return candidates;
  }

  private resolveCollisions(): void {
    const k = this.config.material.stiffness;
    const mu = this.config.material.friction;
    const cohesion = this.config.material.cohesion;

    for (const pA of this.particles.values()) {
      if (!pA.active) continue;

      const candidates = this.getNeighborCandidates(pA.position, pA.radius * 3);

      for (const bId of candidates) {
        if (bId <= pA.id) continue; // Avoid double-counting
        const pB = this.particles.get(bId);
        if (!pB || !pB.active) continue;

        const dx = pB.position.x - pA.position.x;
        const dy = pB.position.y - pA.position.y;
        const dz = pB.position.z - pA.position.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const minDist = pA.radius + pB.radius;

        if (dist < minDist && dist > 0.0001) {
          const overlap = minDist - dist;
          const nx = dx / dist;
          const ny = dy / dist;
          const nz = dz / dist;

          // Spring contact force
          const contactForce = k * overlap + cohesion;

          const invMassA = 1 / pA.mass;
          const invMassB = 1 / pB.mass;
          const totalInvMass = invMassA + invMassB;

          pA.force.x -= contactForce * nx * (invMassA / totalInvMass);
          pA.force.y -= contactForce * ny * (invMassA / totalInvMass);
          pA.force.z -= contactForce * nz * (invMassA / totalInvMass);

          pB.force.x += contactForce * nx * (invMassB / totalInvMass);
          pB.force.y += contactForce * ny * (invMassB / totalInvMass);
          pB.force.z += contactForce * nz * (invMassB / totalInvMass);

          // Friction (tangential)
          const relVx = pB.velocity.x - pA.velocity.x;
          const relVy = pB.velocity.y - pA.velocity.y;
          const relVz = pB.velocity.z - pA.velocity.z;

          const relVnorm = relVx * nx + relVy * ny + relVz * nz;
          const tangX = relVx - relVnorm * nx;
          const tangY = relVy - relVnorm * ny;
          const tangZ = relVz - relVnorm * nz;
          const tangMag = Math.sqrt(tangX * tangX + tangY * tangY + tangZ * tangZ);

          if (tangMag > 0.0001) {
            const frictionForce = Math.min(mu * contactForce, tangMag);
            pA.force.x += frictionForce * (tangX / tangMag) * 0.5;
            pA.force.y += frictionForce * (tangY / tangMag) * 0.5;
            pA.force.z += frictionForce * (tangZ / tangMag) * 0.5;
            pB.force.x -= frictionForce * (tangX / tangMag) * 0.5;
            pB.force.y -= frictionForce * (tangY / tangMag) * 0.5;
            pB.force.z -= frictionForce * (tangZ / tangMag) * 0.5;
          }
        }
      }
    }
  }
}

// ── Handler wrapper (auto-generated) ──
import type { TraitHandler } from './TraitTypes';

export const granularMaterialHandler = {
  name: 'granular_material',
  defaultConfig: {},
  onAttach(node: any, config: any, ctx: any): void {
    node.__granular_materialState = { active: true, config };
    ctx.emit('granular_material_attached', { node });
  },
  onDetach(node: any, _config: any, ctx: any): void {
    ctx.emit('granular_material_detached', { node });
    delete node.__granular_materialState;
  },
  onEvent(node: any, _config: any, ctx: any, event: any): void {
    if (event.type === 'granular_material_configure') {
      Object.assign(node.__granular_materialState?.config ?? {}, event.payload ?? {});
      ctx.emit('granular_material_configured', { node });
    }
  },
  onUpdate(_node: any, _config: any, _ctx: any, _dt: number): void {},
} as const satisfies TraitHandler;
