/**
 * AdvancedClothTrait.ts
 *
 * Position-Based Dynamics (PBD) cloth simulation system with:
 * - Structural, shear, and bending constraints
 * - Collision detection
 * - Wind and gravity forces
 * - Tearing
 *
 * @module traits/AdvancedClothTrait
 */

export type Vec3 = [number, number, number];

function vecComponent(v: Vec3 | [number, number, number], axis: 0 | 1 | 2): number {
  return v[axis] ?? 0;
}

function syncVec(v: Vec3): Vec3 {
  return [v[0] ?? 0, v[1] ?? 0, v[2] ?? 0];
}

export interface ClothParticle {
  id: number;
  position: Vec3;
  prevPosition: Vec3;
  velocity: Vec3;
  force: Vec3;
  mass: number;
  inverseMass: number; // 0 = pinned
  uv: { u: number; v: number };
  active: boolean;
}

export interface ClothConstraint {
  particleA: number;
  particleB: number;
  restLength: number;
  stiffness: number;
  type: 'structural' | 'shear' | 'bending';
}

export interface ClothTearRecord {
  particleId: number;
  position: Vec3;
  timestamp: number;
}

export interface AdvancedClothConfig {
  /** Grid resolution (columns) */
  width?: number;
  /** Grid resolution (rows) */
  height?: number;
  /** Physical size in meters */
  size?: { width: number; height: number };
  /** Gravity vector */
  gravity?: Vec3;
  /** Wind force vector */
  wind?: Vec3;
  /** Structural constraint stiffness [0..1] */
  structuralStiffness?: number;
  /** Shear constraint stiffness [0..1] */
  shearStiffness?: number;
  /** Bending constraint stiffness [0..1] */
  bendingStiffness?: number;
  /** Damping factor */
  damping?: number;
  /** Number of PBD iterations per step */
  iterations?: number;
  /** Enable tearing */
  enableTearing?: boolean;
  /** Stretch factor before tearing */
  tearThreshold?: number;
  /** Pinned rows (0 = top, 1 = bottom) */
  pinnedEdges?: ('top' | 'bottom' | 'left' | 'right')[];
}

/**
 * Advanced Cloth Simulation System using Position-Based Dynamics (PBD)
 *
 * @example
 * ```typescript
 * const cloth = new AdvancedClothSystem({
 *   width: 20,
 *   height: 15,
 *   size: { width: 2, height: 1.5 },
 *   pinnedEdges: ['top'],
 *   wind: { x: 0.5, y: 0, z: 0 },
 *   enableTearing: true,
 * });
 *
 * cloth.initialize();
 *
 * // Simulation loop
 * setInterval(() => {
 *   cloth.step(0.016);
 * }, 16);
 * ```
 */
export class AdvancedClothSystem {
  private particles: Map<number, ClothParticle> = new Map();
  private constraints: ClothConstraint[] = [];
  private tearHistory: ClothTearRecord[] = [];
  private config: Required<AdvancedClothConfig>;
  private nextId = 0;
  private gridWidth = 0;
  private gridHeight = 0;
  private initialized = false;

  constructor(config: AdvancedClothConfig = {}) {
    this.config = {
      width: config.width ?? 20,
      height: config.height ?? 15,
      size: config.size ?? { width: 2, height: 1.5 },
      gravity: config.gravity ?? [0, -9.81, 0],
      wind: config.wind ?? [0, 0, 0],
      structuralStiffness: config.structuralStiffness ?? 0.9,
      shearStiffness: config.shearStiffness ?? 0.5,
      bendingStiffness: config.bendingStiffness ?? 0.3,
      damping: config.damping ?? 0.01,
      iterations: config.iterations ?? 10,
      enableTearing: config.enableTearing ?? false,
      tearThreshold: config.tearThreshold ?? 1.5,
      pinnedEdges: config.pinnedEdges ?? ['top'],
    };
  }

  /**
   * Initialize the cloth grid with particles and constraints
   */
  initialize(): void {
    const { width, height, size } = this.config;
    this.gridWidth = width;
    this.gridHeight = height;

    this.particles.clear();
    this.constraints = [];
    this.tearHistory = [];
    this.nextId = 0;

    const dx = size.width / (width - 1);
    const dy = size.height / (height - 1);

    // Create particles in a grid
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const id = this.nextId++;
        const isPinned = this.isEdgePinned(row, col, width, height);

        const px = col * dx - size.width / 2;
        const pz = row * dy;
        this.particles.set(id, {
          id,
          position: syncVec([px, 0, pz]),
          prevPosition: syncVec([px, 0, pz]),
          velocity: syncVec([0, 0, 0]),
          force: syncVec([0, 0, 0]),
          mass: 1.0,
          inverseMass: isPinned ? 0 : 1.0,
          uv: { u: col / (width - 1), v: row / (height - 1) },
          active: true,
        });
      }
    }

    // Create structural constraints (horizontal + vertical)
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const id = row * width + col;

        // Horizontal
        if (col + 1 < width) {
          const right = id + 1;
          const pA = this.particles.get(id)!;
          const pB = this.particles.get(right)!;
          this.constraints.push({
            particleA: id,
            particleB: right,
            restLength: this.distance(pA.position, pB.position),
            stiffness: this.config.structuralStiffness,
            type: 'structural',
          });
        }

        // Vertical
        if (row + 1 < height) {
          const below = id + width;
          const pA = this.particles.get(id)!;
          const pB = this.particles.get(below)!;
          this.constraints.push({
            particleA: id,
            particleB: below,
            restLength: this.distance(pA.position, pB.position),
            stiffness: this.config.structuralStiffness,
            type: 'structural',
          });
        }

        // Shear constraints (diagonals)
        if (col + 1 < width && row + 1 < height) {
          const diag1 = id + width + 1;
          const diag2 = id + width - 1;
          const pA = this.particles.get(id)!;
          const pB1 = this.particles.get(diag1)!;
          this.constraints.push({
            particleA: id,
            particleB: diag1,
            restLength: this.distance(pA.position, pB1.position),
            stiffness: this.config.shearStiffness,
            type: 'shear',
          });

          if (col - 1 >= 0) {
            const pB2 = this.particles.get(diag2)!;
            this.constraints.push({
              particleA: id + 1,
              particleB: diag2,
              restLength: this.distance(pA.position, pB2.position),
              stiffness: this.config.shearStiffness,
              type: 'shear',
            });
          }
        }

        // Bending constraints (skip one particle)
        if (col + 2 < width) {
          const bend = id + 2;
          const pA = this.particles.get(id)!;
          const pB = this.particles.get(bend)!;
          this.constraints.push({
            particleA: id,
            particleB: bend,
            restLength: this.distance(pA.position, pB.position),
            stiffness: this.config.bendingStiffness,
            type: 'bending',
          });
        }

        if (row + 2 < height) {
          const bend = id + width * 2;
          const pA = this.particles.get(id)!;
          const pB = this.particles.get(bend)!;
          this.constraints.push({
            particleA: id,
            particleB: bend,
            restLength: this.distance(pA.position, pB.position),
            stiffness: this.config.bendingStiffness,
            type: 'bending',
          });
        }
      }
    }

    this.initialized = true;
  }

  /**
   * Get all active particles
   */
  getParticles(): ClothParticle[] {
    return Array.from(this.particles.values()).filter((p) => p.active);
  }

  /**
   * Get all particles (including inactive torn particles)
   */
  getAllParticles(): ClothParticle[] {
    return Array.from(this.particles.values());
  }

  /**
   * Get all constraints
   */
  getConstraints(): ClothConstraint[] {
    return [...this.constraints];
  }

  /**
   * Pin a particle (make it static)
   */
  pinParticle(id: number): void {
    const p = this.particles.get(id);
    if (p) p.inverseMass = 0;
  }

  /**
   * Unpin a particle
   */
  unpinParticle(id: number): void {
    const p = this.particles.get(id);
    if (p) p.inverseMass = 1.0 / p.mass;
  }

  /**
   * Apply an impulse force at a world position (radius falloff)
   */
  applyImpulse(position: Vec3 | [number, number, number], force: Vec3 | [number, number, number], radius: number): void {
    for (const particle of this.particles.values()) {
      if (!particle.active || particle.inverseMass === 0) continue;

      const dx = particle.position[0] - vecComponent(position, 0);
      const dy = particle.position[1] - vecComponent(position, 1);
      const dz = particle.position[2] - vecComponent(position, 2);
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (dist < radius) {
        const falloff = 1 - dist / radius;
        particle.velocity[0] += vecComponent(force, 0) * falloff * particle.inverseMass;
        particle.velocity[1] += vecComponent(force, 1) * falloff * particle.inverseMass;
        particle.velocity[2] += vecComponent(force, 2) * falloff * particle.inverseMass;
        syncVec(particle.velocity);
      }
    }
  }

  /**
   * Tear the cloth at a specific particle
   */
  tearAt(particleId: number): void {
    const particle = this.particles.get(particleId);
    if (!particle || !particle.active) return;

    // Remove all constraints involving this particle
    this.constraints = this.constraints.filter(
      (c) => c.particleA !== particleId && c.particleB !== particleId
    );

    this.tearHistory.push({
      particleId,
      position: [...particle.position],
      timestamp: Date.now(),
    });
  }

  /**
   * Get tearing history
   */
  getTearHistory(): ClothTearRecord[] {
    return [...this.tearHistory];
  }

  /**
   * Update wind force
   */
  setWind(wind: Vec3 | [number, number, number]): void {
    this.config.wind = syncVec([vecComponent(wind, 0), vecComponent(wind, 1), vecComponent(wind, 2)]);
  }

  /**
   * Step the simulation
   */
  step(dt = 0.016): void {
    if (!this.initialized) {
      this.initialize();
    }

    const damping = this.config.damping;

    // Apply external forces and integrate velocity
    for (const particle of this.particles.values()) {
      if (!particle.active || particle.inverseMass === 0) continue;

      // Store previous position
      particle.prevPosition = syncVec([...particle.position]);

      // Gravity + wind
      particle.force[0] = this.config.gravity[0] + this.config.wind[0];
      particle.force[1] = this.config.gravity[1] + this.config.wind[1];
      particle.force[2] = this.config.gravity[2] + this.config.wind[2];

      // Verlet integration
      particle.velocity[0] = particle.velocity[0] * (1 - damping) + particle.force[0] * dt;
      particle.velocity[1] = particle.velocity[1] * (1 - damping) + particle.force[1] * dt;
      particle.velocity[2] = particle.velocity[2] * (1 - damping) + particle.force[2] * dt;

      particle.position[0] += particle.velocity[0] * dt;
      particle.position[1] += particle.velocity[1] * dt;
      particle.position[2] += particle.velocity[2] * dt;
      syncVec(particle.force);
      syncVec(particle.velocity);
      syncVec(particle.position);
    }

    // PBD constraint solving
    for (let iter = 0; iter < this.config.iterations; iter++) {
      for (const constraint of this.constraints) {
        const pA = this.particles.get(constraint.particleA);
        const pB = this.particles.get(constraint.particleB);
        if (!pA || !pB || !pA.active || !pB.active) continue;

        const dx = pB.position[0] - pA.position[0];
        const dy = pB.position[1] - pA.position[1];
        const dz = pB.position[2] - pA.position[2];
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (dist < 0.0001) continue;

        const stretch = dist / constraint.restLength;

        // Tearing
        if (
          this.config.enableTearing &&
          stretch > this.config.tearThreshold &&
          constraint.type === 'structural'
        ) {
          this.tearAt(constraint.particleA);
          continue;
        }

        const correction = (dist - constraint.restLength) / dist;
        const totalInvMass = pA.inverseMass + pB.inverseMass;
        if (totalInvMass === 0) continue;

        const w = constraint.stiffness / this.config.iterations;

        const cx = dx * correction * w;
        const cy = dy * correction * w;
        const cz = dz * correction * w;

        if (pA.inverseMass > 0) {
          pA.position[0] += cx * (pA.inverseMass / totalInvMass);
          pA.position[1] += cy * (pA.inverseMass / totalInvMass);
          pA.position[2] += cz * (pA.inverseMass / totalInvMass);
        }

        if (pB.inverseMass > 0) {
          pB.position[0] -= cx * (pB.inverseMass / totalInvMass);
          pB.position[1] -= cy * (pB.inverseMass / totalInvMass);
          pB.position[2] -= cz * (pB.inverseMass / totalInvMass);
        }
      }

      // Ground plane collision (y >= -10)
      for (const particle of this.particles.values()) {
        if (!particle.active || particle.inverseMass === 0) continue;
        if (particle.position[1] < -10) {
          particle.position[1] = -10;
          particle.velocity[1] *= -0.3;
        }
      }
    }
  }

  /**
   * Get cloth config
   */
  getConfig(): Required<AdvancedClothConfig> {
    return { ...this.config };
  }

  /**
   * Update config
   */
  updateConfig(config: Partial<AdvancedClothConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Check if initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Reset the cloth
   */
  reset(): void {
    this.particles.clear();
    this.constraints = [];
    this.tearHistory = [];
    this.nextId = 0;
    this.initialized = false;
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private distance(a: Vec3, b: Vec3): number {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const dz = b[2] - a[2];
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  private isEdgePinned(row: number, col: number, width: number, height: number): boolean {
    const edges = this.config.pinnedEdges;
    if (edges.includes('top') && row === 0) return true;
    if (edges.includes('bottom') && row === height - 1) return true;
    if (edges.includes('left') && col === 0) return true;
    if (edges.includes('right') && col === width - 1) return true;
    return false;
  }
}

// ── Handler (delegates to AdvancedClothSystem) ──
import type {
  TraitHandler,
  HSPlusNode,
  TraitContext,
  TraitEvent,
  TraitInstanceDelegate,
} from './TraitTypes';

export const advancedClothHandler = {
  name: 'advanced_cloth',
  defaultConfig: {},
  onAttach(node: HSPlusNode, config: unknown, ctx: TraitContext): void {
    // @ts-expect-error
    const instance = new AdvancedClothSystem(config);
    node.__advanced_cloth_instance = instance;
    ctx.emit('advanced_cloth_attached', { node, config });
  },
  onDetach(node: HSPlusNode, _config: unknown, ctx: TraitContext): void {
    const instance = node.__advanced_cloth_instance as TraitInstanceDelegate;
    if (instance) {
      if (typeof instance.onDetach === 'function') instance.onDetach(node, ctx);
      else if (typeof instance.dispose === 'function') instance.dispose();
      else if (typeof instance.cleanup === 'function') instance.cleanup();
    }
    ctx.emit('advanced_cloth_detached', { node });
    delete node.__advanced_cloth_instance;
  },
  onEvent(node: HSPlusNode, _config: unknown, ctx: TraitContext, event: TraitEvent): void {
    const instance = node.__advanced_cloth_instance as TraitInstanceDelegate;
    if (!instance) return;
    if (typeof instance.onEvent === 'function') instance.onEvent(event);
    else if (typeof instance.emit === 'function' && event.type) instance.emit(event);
    if (event.type === 'advanced_cloth_configure' && event.payload) {
      Object.assign(instance, event.payload);
      ctx.emit('advanced_cloth_configured', { node });
    }
  },
  onUpdate(node: HSPlusNode, _config: unknown, ctx: TraitContext, dt: number): void {
    const instance = node.__advanced_cloth_instance as TraitInstanceDelegate;
    if (!instance) return;
    if (typeof instance.onUpdate === 'function') instance.onUpdate(node, ctx, dt);
  },
} as const satisfies TraitHandler;
