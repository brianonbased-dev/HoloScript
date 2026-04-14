/**
 * FluidSimulationTrait.ts
 *
 * Fluid simulation system based on Smoothed Particle Hydrodynamics (SPH).
 * Simulates liquids with density, pressure, viscosity, and surface tension.
 *
 * @module traits/FluidSimulationTrait
 */

// =============================================================================
// VECTOR TYPE
// =============================================================================

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

// =============================================================================
// PARTICLE TYPE
// =============================================================================

export interface FluidParticle {
  id: number;
  position: Vec3;
  velocity: Vec3;
  force: Vec3;
  density: number;
  pressure: number;
  mass: number;
}

// =============================================================================
// BOUNDARY TYPES
// =============================================================================

export interface PlaneBoundary {
  type: 'plane';
  position: Vec3;
  normal: Vec3;
  restitution: number;
}

export interface SphereBoundary {
  type: 'sphere';
  position: Vec3;
  radius: number;
  restitution: number;
}

export interface BoxBoundary {
  type: 'box';
  position: Vec3;
  size: Vec3;
  restitution: number;
}

export type FluidBoundary = PlaneBoundary | SphereBoundary | BoxBoundary;

// =============================================================================
// SPH KERNEL FUNCTIONS
// =============================================================================

/**
 * Poly6 smoothing kernel. Returns 0 when r > h or r < 0.
 */
export function poly6Kernel(r: number, h: number): number {
  if (r < 0 || r > h) return 0;
  const coeff = 315 / (64 * Math.PI * h ** 9);
  return coeff * (h * h - r * r) ** 3;
}

/**
 * Spiky kernel gradient for pressure forces.
 * Returns [0, 0, 0] when distance > h or distance is near zero.
 */
export function spikyKernelGradient(dx: number, dy: number, dz: number, h: number): Vec3 {
  const r = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (r > h || r < 1e-5) return [0, 0, 0 ];
  const coeff = (-45 / (Math.PI * h ** 6)) * (h - r) ** 2;
  return {
    x: coeff * (dx / r),
    y: coeff * (dy / r),
    z: coeff * (dz / r),
  };
}

/**
 * Viscosity kernel Laplacian. Returns 0 when r > h or r < 0.
 */
export function viscosityKernelLaplacian(r: number, h: number): number {
  if (r < 0 || r > h) return 0;
  return (45 / (Math.PI * h ** 6)) * (h - r);
}

// =============================================================================
// SPATIAL HASH
// =============================================================================

/**
 * Spatial hash for efficient neighbor queries.
 */
export class SpatialHash {
  private cellSize: number;
  private cells = new Map<string, number[]>();

  constructor(cellSize: number) {
    this.cellSize = cellSize;
  }

  private key(x: number, y: number, z: number): string {
    const cx = Math.floor(x / this.cellSize);
    const cy = Math.floor(y / this.cellSize);
    const cz = Math.floor(z / this.cellSize);
    return `${cx},${cy},${cz}`;
  }

  insert(id: number, pos: Vec3): void {
    const k = this.key(pos[0], pos[1], pos[2]);
    if (!this.cells.has(k)) this.cells.set(k, []);
    this.cells.get(k)!.push(id);
  }

  getNeighbors(pos: Vec3): number[] {
    const cx = Math.floor(pos[0] / this.cellSize);
    const cy = Math.floor(pos[1] / this.cellSize);
    const cz = Math.floor(pos[2] / this.cellSize);
    const result: number[] = [];

    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const k = `${cx + dx},${cy + dy},${cz + dz}`;
          const cell = this.cells.get(k);
          if (cell) result.push(...cell);
        }
      }
    }

    return result;
  }

  clear(): void {
    this.cells.clear();
  }
}

// =============================================================================
// FLUID SIMULATION CONFIG
// =============================================================================

export interface FluidSimulationConfig {
  restDensity?: number;
  viscosity?: number;
  gravity?: Vec3;
  solverType?: 'sph' | 'flip' | 'hybrid';
  timeStep?: number;
  maxVelocity?: number;
  smoothingRadius?: number;
  gridCellSize?: number;
  particleRadius?: number;
  gasConstant?: number;
  surfaceTension?: number;
}

// =============================================================================
// FLUID SIMULATION SYSTEM
// =============================================================================

/**
 * SPH Fluid Simulation System with boundaries, kernel functions, and spatial hashing.
 */
export class FluidSimulationSystem {
  private particles = new Map<number, FluidParticle>();
  private nextId = 0;
  private cfg: Required<FluidSimulationConfig>;
  private boundaries: FluidBoundary[] = [];
  private spatialHash: SpatialHash;

  constructor(config: FluidSimulationConfig = {}) {
    this.cfg = {
      restDensity: config.restDensity ?? 1000,
      viscosity: config.viscosity ?? 0.001,
      gravity: config.gravity ?? [0, -9.81, 0 ],
      solverType: config.solverType ?? 'sph',
      timeStep: config.timeStep ?? 0.016,
      maxVelocity: config.maxVelocity ?? 100,
      smoothingRadius: config.smoothingRadius ?? 0.04,
      gridCellSize: config.gridCellSize ?? 0.04,
      particleRadius: config.particleRadius ?? 0.01,
      gasConstant: config.gasConstant ?? 8.314,
      surfaceTension: config.surfaceTension ?? 0.072,
    };
    this.spatialHash = new SpatialHash(this.cfg.gridCellSize);
  }

  // ── Particle Management ────────────────────────────────────────────────

  addParticle(position: Vec3, velocity?: Vec3): number {
    const id = this.nextId++;
    this.particles.set(id, {
      id,
      position: { ...position },
      velocity: velocity ? { ...velocity } : [0, 0, 0 ],
      force: [0, 0, 0 ],
      density: this.cfg.restDensity,
      pressure: 0,
      mass: 1.0,
    });
    return id;
  }

  getParticle(id: number): FluidParticle | undefined {
    return this.particles.get(id);
  }

  getParticles(): FluidParticle[] {
    return Array.from(this.particles.values());
  }

  getParticleCount(): number {
    return this.particles.size;
  }

  removeParticle(id: number): boolean {
    return this.particles.delete(id);
  }

  clearParticles(): void {
    this.particles.clear();
    this.nextId = 0;
  }

  // ── Boundary Management ────────────────────────────────────────────────

  addBoundary(boundary: FluidBoundary): void {
    this.boundaries.push(boundary);
  }

  getBoundaries(): FluidBoundary[] {
    return [...this.boundaries];
  }

  clearBoundaries(): void {
    this.boundaries.length = 0;
  }

  // ── Configuration ──────────────────────────────────────────────────────

  getConfig(): Required<FluidSimulationConfig> {
    return { ...this.cfg };
  }

  setConfig(partial: Partial<FluidSimulationConfig>): void {
    Object.assign(this.cfg, partial);
    if (partial.gridCellSize !== undefined) {
      this.spatialHash = new SpatialHash(this.cfg.gridCellSize);
    }
  }

  // ── Simulation Step ────────────────────────────────────────────────────

  step(dt?: number): void {
    const h = this.cfg.smoothingRadius;
    const deltaT = dt ?? this.cfg.timeStep;
    const particles = Array.from(this.particles.values());

    // Rebuild spatial hash
    this.spatialHash.clear();
    for (const p of particles) {
      this.spatialHash.insert(p.id, p.position);
    }

    // Compute densities
    for (const pi of particles) {
      let density = 0;
      for (const pj of particles) {
        const r = this.dist(pi.position, pj.position);
        density += pj.mass * poly6Kernel(r, h);
      }
      pi.density = Math.max(density, this.cfg.restDensity * 0.01);
      pi.pressure = this.cfg.gasConstant * (pi.density - this.cfg.restDensity);
    }

    // Compute forces
    for (const pi of particles) {
      pi.force = {
        x: this.cfg.gravity[0] * pi.mass,
        y: this.cfg.gravity[1] * pi.mass,
        z: this.cfg.gravity[2] * pi.mass,
      };

      for (const pj of particles) {
        if (pi.id === pj.id) continue;
        const dx = pi.position[0] - pj.position[0];
        const dy = pi.position[1] - pj.position[1];
        const dz = pi.position[2] - pj.position[2];
        const r = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (r < h && r > 1e-5) {
          // Pressure force
          const grad = spikyKernelGradient(dx, dy, dz, h);
          const pScale = -pj.mass * ((pi.pressure + pj.pressure) / (2 * pj.density));
          pi.force[0] += pScale * grad[0];
          pi.force[1] += pScale * grad[1];
          pi.force[2] += pScale * grad[2];

          // Viscosity force
          const viscLap = viscosityKernelLaplacian(r, h);
          const vScale = this.cfg.viscosity * pj.mass * (1 / pj.density) * viscLap;
          pi.force[0] += vScale * (pj.velocity[0] - pi.velocity[0]);
          pi.force[1] += vScale * (pj.velocity[1] - pi.velocity[1]);
          pi.force[2] += vScale * (pj.velocity[2] - pi.velocity[2]);
        }
      }
    }

    // Integrate
    for (const p of particles) {
      p.velocity[0] += (p.force[0] / p.mass) * deltaT;
      p.velocity[1] += (p.force[1] / p.mass) * deltaT;
      p.velocity[2] += (p.force[2] / p.mass) * deltaT;

      // Clamp velocity
      const speed = Math.sqrt(p.velocity[0] ** 2 + p.velocity[1] ** 2 + p.velocity[2] ** 2);
      if (speed > this.cfg.maxVelocity) {
        const scale = this.cfg.maxVelocity / speed;
        p.velocity[0] *= scale;
        p.velocity[1] *= scale;
        p.velocity[2] *= scale;
      }

      p.position[0] += p.velocity[0] * deltaT;
      p.position[1] += p.velocity[1] * deltaT;
      p.position[2] += p.velocity[2] * deltaT;
    }

    // Apply boundaries
    for (const p of particles) {
      this.applyBoundaries(p);
    }
  }

  // ── Density Queries ────────────────────────────────────────────────────

  getDensityAt(position: Vec3): number {
    const h = this.cfg.smoothingRadius;
    let density = 0;
    for (const p of this.particles.values()) {
      const r = this.dist(position, p.position);
      density += p.mass * poly6Kernel(r, h);
    }
    return density;
  }

  isInsideFluid(position: Vec3): boolean {
    return this.getDensityAt(position) > this.cfg.restDensity * 0.5;
  }

  // ── Statistics ─────────────────────────────────────────────────────────

  getKineticEnergy(): number {
    let energy = 0;
    for (const p of this.particles.values()) {
      energy += 0.5 * p.mass * (p.velocity[0] ** 2 + p.velocity[1] ** 2 + p.velocity[2] ** 2);
    }
    return energy;
  }

  getAverageDensity(): number {
    if (this.particles.size === 0) return 0;
    let total = 0;
    for (const p of this.particles.values()) total += p.density;
    return total / this.particles.size;
  }

  reset(): void {
    this.particles.clear();
    this.spatialHash.clear();
    this.boundaries.length = 0;
    this.nextId = 0;
  }

  // ── Private Helpers ────────────────────────────────────────────────────

  private dist(a: Vec3, b: Vec3): number {
    return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
  }

  private applyBoundaries(p: FluidParticle): void {
    const pr = this.cfg.particleRadius;
    for (const b of this.boundaries) {
      if (b.type === 'plane') {
        const dx = p.position[0] - b.position[0];
        const dy = p.position[1] - b.position[1];
        const dz = p.position[2] - b.position[2];
        const d = dx * b.normal[0] + dy * b.normal[1] + dz * b.normal[2];
        if (d < pr) {
          // Push out
          p.position[0] += b.normal[0] * (pr - d);
          p.position[1] += b.normal[1] * (pr - d);
          p.position[2] += b.normal[2] * (pr - d);
          // Reflect velocity
          const vn =
            p.velocity[0] * b.normal[0] + p.velocity[1] * b.normal[1] + p.velocity[2] * b.normal[2];
          if (vn < 0) {
            p.velocity[0] -= (1 + b.restitution) * vn * b.normal[0];
            p.velocity[1] -= (1 + b.restitution) * vn * b.normal[1];
            p.velocity[2] -= (1 + b.restitution) * vn * b.normal[2];
          }
        }
      } else if (b.type === 'sphere') {
        const dx = p.position[0] - b.position[0];
        const dy = p.position[1] - b.position[1];
        const dz = p.position[2] - b.position[2];
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const maxDist = b.radius - pr;
        if (dist > maxDist && dist > 1e-6) {
          const nx = dx / dist;
          const ny = dy / dist;
          const nz = dz / dist;
          p.position[0] = b.position[0] + nx * maxDist;
          p.position[1] = b.position[1] + ny * maxDist;
          p.position[2] = b.position[2] + nz * maxDist;
          const vn = p.velocity[0] * nx + p.velocity[1] * ny + p.velocity[2] * nz;
          if (vn > 0) {
            p.velocity[0] -= (1 + b.restitution) * vn * nx;
            p.velocity[1] -= (1 + b.restitution) * vn * ny;
            p.velocity[2] -= (1 + b.restitution) * vn * nz;
          }
        }
      } else if (b.type === 'box') {
        const halfX = b.size[0] / 2;
        const halfY = b.size[1] / 2;
        const halfZ = b.size[2] / 2;
        const limit = pr;

        if (p.position[0] > b.position[0] + halfX - limit) {
          p.position[0] = b.position[0] + halfX - limit;
          p.velocity[0] *= -b.restitution;
        } else if (p.position[0] < b.position[0] - halfX + limit) {
          p.position[0] = b.position[0] - halfX + limit;
          p.velocity[0] *= -b.restitution;
        }

        if (p.position[1] > b.position[1] + halfY - limit) {
          p.position[1] = b.position[1] + halfY - limit;
          p.velocity[1] *= -b.restitution;
        } else if (p.position[1] < b.position[1] - halfY + limit) {
          p.position[1] = b.position[1] - halfY + limit;
          p.velocity[1] *= -b.restitution;
        }

        if (p.position[2] > b.position[2] + halfZ - limit) {
          p.position[2] = b.position[2] + halfZ - limit;
          p.velocity[2] *= -b.restitution;
        } else if (p.position[2] < b.position[2] - halfZ + limit) {
          p.position[2] = b.position[2] - halfZ + limit;
          p.velocity[2] *= -b.restitution;
        }
      }
    }
  }
}

// ── Handler (delegates to SpatialHash) ──
import type {
  TraitHandler,
  HSPlusNode,
  TraitContext,
  TraitEvent,
  TraitInstanceDelegate,
} from './TraitTypes';

export const fluidSimulationHandler = {
  name: 'fluid_simulation',
  defaultConfig: {},
  onAttach(node: HSPlusNode, config: unknown, ctx: TraitContext): void {
    // @ts-expect-error
    const instance = new SpatialHash(config);
    node.__fluid_simulation_instance = instance;
    ctx.emit('fluid_simulation_attached', { node, config });
  },
  onDetach(node: HSPlusNode, _config: unknown, ctx: TraitContext): void {
    const instance = node.__fluid_simulation_instance as TraitInstanceDelegate;
    if (instance) {
      if (typeof instance.onDetach === 'function') instance.onDetach(node, ctx);
      else if (typeof instance.dispose === 'function') instance.dispose();
      else if (typeof instance.cleanup === 'function') instance.cleanup();
    }
    ctx.emit('fluid_simulation_detached', { node });
    delete node.__fluid_simulation_instance;
  },
  onEvent(node: HSPlusNode, _config: unknown, ctx: TraitContext, event: TraitEvent): void {
    const instance = node.__fluid_simulation_instance as TraitInstanceDelegate;
    if (!instance) return;
    if (typeof instance.onEvent === 'function') instance.onEvent(event);
    else if (typeof instance.emit === 'function' && event.type) instance.emit(event);
    if (event.type === 'fluid_simulation_configure' && event.payload) {
      Object.assign(instance, event.payload);
      ctx.emit('fluid_simulation_configured', { node });
    }
  },
  onUpdate(node: HSPlusNode, _config: unknown, ctx: TraitContext, dt: number): void {
    const instance = node.__fluid_simulation_instance as TraitInstanceDelegate;
    if (!instance) return;
    if (typeof instance.onUpdate === 'function') instance.onUpdate(node, ctx, dt);
  },
} as const satisfies TraitHandler;
