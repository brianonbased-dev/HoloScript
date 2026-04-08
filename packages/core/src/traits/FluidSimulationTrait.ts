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
 * Returns {x:0,y:0,z:0} when distance > h or distance is near zero.
 */
export function spikyKernelGradient(dx: number, dy: number, dz: number, h: number): Vec3 {
  const r = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (r > h || r < 1e-5) return { x: 0, y: 0, z: 0 };
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
    const k = this.key(pos.x, pos.y, pos.z);
    if (!this.cells.has(k)) this.cells.set(k, []);
    this.cells.get(k)!.push(id);
  }

  getNeighbors(pos: Vec3): number[] {
    const cx = Math.floor(pos.x / this.cellSize);
    const cy = Math.floor(pos.y / this.cellSize);
    const cz = Math.floor(pos.z / this.cellSize);
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
      gravity: config.gravity ?? { x: 0, y: -9.81, z: 0 },
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
      velocity: velocity ? { ...velocity } : { x: 0, y: 0, z: 0 },
      force: { x: 0, y: 0, z: 0 },
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
        x: this.cfg.gravity.x * pi.mass,
        y: this.cfg.gravity.y * pi.mass,
        z: this.cfg.gravity.z * pi.mass,
      };

      for (const pj of particles) {
        if (pi.id === pj.id) continue;
        const dx = pi.position.x - pj.position.x;
        const dy = pi.position.y - pj.position.y;
        const dz = pi.position.z - pj.position.z;
        const r = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (r < h && r > 1e-5) {
          // Pressure force
          const grad = spikyKernelGradient(dx, dy, dz, h);
          const pScale = -pj.mass * ((pi.pressure + pj.pressure) / (2 * pj.density));
          pi.force.x += pScale * grad.x;
          pi.force.y += pScale * grad.y;
          pi.force.z += pScale * grad.z;

          // Viscosity force
          const viscLap = viscosityKernelLaplacian(r, h);
          const vScale = this.cfg.viscosity * pj.mass * (1 / pj.density) * viscLap;
          pi.force.x += vScale * (pj.velocity.x - pi.velocity.x);
          pi.force.y += vScale * (pj.velocity.y - pi.velocity.y);
          pi.force.z += vScale * (pj.velocity.z - pi.velocity.z);
        }
      }
    }

    // Integrate
    for (const p of particles) {
      p.velocity.x += (p.force.x / p.mass) * deltaT;
      p.velocity.y += (p.force.y / p.mass) * deltaT;
      p.velocity.z += (p.force.z / p.mass) * deltaT;

      // Clamp velocity
      const speed = Math.sqrt(p.velocity.x ** 2 + p.velocity.y ** 2 + p.velocity.z ** 2);
      if (speed > this.cfg.maxVelocity) {
        const scale = this.cfg.maxVelocity / speed;
        p.velocity.x *= scale;
        p.velocity.y *= scale;
        p.velocity.z *= scale;
      }

      p.position.x += p.velocity.x * deltaT;
      p.position.y += p.velocity.y * deltaT;
      p.position.z += p.velocity.z * deltaT;
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
      energy += 0.5 * p.mass * (p.velocity.x ** 2 + p.velocity.y ** 2 + p.velocity.z ** 2);
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
    return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);
  }

  private applyBoundaries(p: FluidParticle): void {
    const pr = this.cfg.particleRadius;
    for (const b of this.boundaries) {
      if (b.type === 'plane') {
        const dx = p.position.x - b.position.x;
        const dy = p.position.y - b.position.y;
        const dz = p.position.z - b.position.z;
        const d = dx * b.normal.x + dy * b.normal.y + dz * b.normal.z;
        if (d < pr) {
          // Push out
          p.position.x += b.normal.x * (pr - d);
          p.position.y += b.normal.y * (pr - d);
          p.position.z += b.normal.z * (pr - d);
          // Reflect velocity
          const vn =
            p.velocity.x * b.normal.x + p.velocity.y * b.normal.y + p.velocity.z * b.normal.z;
          if (vn < 0) {
            p.velocity.x -= (1 + b.restitution) * vn * b.normal.x;
            p.velocity.y -= (1 + b.restitution) * vn * b.normal.y;
            p.velocity.z -= (1 + b.restitution) * vn * b.normal.z;
          }
        }
      } else if (b.type === 'sphere') {
        const dx = p.position.x - b.position.x;
        const dy = p.position.y - b.position.y;
        const dz = p.position.z - b.position.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const maxDist = b.radius - pr;
        if (dist > maxDist && dist > 1e-6) {
          const nx = dx / dist;
          const ny = dy / dist;
          const nz = dz / dist;
          p.position.x = b.position.x + nx * maxDist;
          p.position.y = b.position.y + ny * maxDist;
          p.position.z = b.position.z + nz * maxDist;
          const vn = p.velocity.x * nx + p.velocity.y * ny + p.velocity.z * nz;
          if (vn > 0) {
            p.velocity.x -= (1 + b.restitution) * vn * nx;
            p.velocity.y -= (1 + b.restitution) * vn * ny;
            p.velocity.z -= (1 + b.restitution) * vn * nz;
          }
        }
      } else if (b.type === 'box') {
        const halfX = b.size.x / 2;
        const halfY = b.size.y / 2;
        const halfZ = b.size.z / 2;
        const limit = pr;

        if (p.position.x > b.position.x + halfX - limit) {
          p.position.x = b.position.x + halfX - limit;
          p.velocity.x *= -b.restitution;
        } else if (p.position.x < b.position.x - halfX + limit) {
          p.position.x = b.position.x - halfX + limit;
          p.velocity.x *= -b.restitution;
        }

        if (p.position.y > b.position.y + halfY - limit) {
          p.position.y = b.position.y + halfY - limit;
          p.velocity.y *= -b.restitution;
        } else if (p.position.y < b.position.y - halfY + limit) {
          p.position.y = b.position.y - halfY + limit;
          p.velocity.y *= -b.restitution;
        }

        if (p.position.z > b.position.z + halfZ - limit) {
          p.position.z = b.position.z + halfZ - limit;
          p.velocity.z *= -b.restitution;
        } else if (p.position.z < b.position.z - halfZ + limit) {
          p.position.z = b.position.z - halfZ + limit;
          p.velocity.z *= -b.restitution;
        }
      }
    }
  }
}

// ── Handler (delegates to SpatialHash) ──
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent, TraitInstanceDelegate } from './TraitTypes';

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
