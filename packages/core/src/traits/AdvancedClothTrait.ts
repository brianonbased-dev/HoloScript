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

export interface Vec3 {
  x: number;
  y: number;
  z: number;
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
      gravity: config.gravity ?? { x: 0, y: -9.81, z: 0 },
      wind: config.wind ?? { x: 0, y: 0, z: 0 },
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

        this.particles.set(id, {
          id,
          position: {
            x: col * dx - size.width / 2,
            y: 0,
            z: row * dy,
          },
          prevPosition: {
            x: col * dx - size.width / 2,
            y: 0,
            z: row * dy,
          },
          velocity: { x: 0, y: 0, z: 0 },
          force: { x: 0, y: 0, z: 0 },
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
  applyImpulse(position: Vec3, force: Vec3, radius: number): void {
    for (const particle of this.particles.values()) {
      if (!particle.active || particle.inverseMass === 0) continue;

      const dx = particle.position.x - position.x;
      const dy = particle.position.y - position.y;
      const dz = particle.position.z - position.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (dist < radius) {
        const falloff = 1 - dist / radius;
        particle.velocity.x += force.x * falloff * particle.inverseMass;
        particle.velocity.y += force.y * falloff * particle.inverseMass;
        particle.velocity.z += force.z * falloff * particle.inverseMass;
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
      position: { ...particle.position },
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
  setWind(wind: Vec3): void {
    this.config.wind = { ...wind };
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
      particle.prevPosition = { ...particle.position };

      // Gravity + wind
      particle.force.x = this.config.gravity.x + this.config.wind.x;
      particle.force.y = this.config.gravity.y + this.config.wind.y;
      particle.force.z = this.config.gravity.z + this.config.wind.z;

      // Verlet integration
      particle.velocity.x = particle.velocity.x * (1 - damping) + particle.force.x * dt;
      particle.velocity.y = particle.velocity.y * (1 - damping) + particle.force.y * dt;
      particle.velocity.z = particle.velocity.z * (1 - damping) + particle.force.z * dt;

      particle.position.x += particle.velocity.x * dt;
      particle.position.y += particle.velocity.y * dt;
      particle.position.z += particle.velocity.z * dt;
    }

    // PBD constraint solving
    for (let iter = 0; iter < this.config.iterations; iter++) {
      for (const constraint of this.constraints) {
        const pA = this.particles.get(constraint.particleA);
        const pB = this.particles.get(constraint.particleB);
        if (!pA || !pB || !pA.active || !pB.active) continue;

        const dx = pB.position.x - pA.position.x;
        const dy = pB.position.y - pA.position.y;
        const dz = pB.position.z - pA.position.z;
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
          pA.position.x += cx * (pA.inverseMass / totalInvMass);
          pA.position.y += cy * (pA.inverseMass / totalInvMass);
          pA.position.z += cz * (pA.inverseMass / totalInvMass);
        }

        if (pB.inverseMass > 0) {
          pB.position.x -= cx * (pB.inverseMass / totalInvMass);
          pB.position.y -= cy * (pB.inverseMass / totalInvMass);
          pB.position.z -= cz * (pB.inverseMass / totalInvMass);
        }
      }

      // Ground plane collision (y >= -10)
      for (const particle of this.particles.values()) {
        if (!particle.active || particle.inverseMass === 0) continue;
        if (particle.position.y < -10) {
          particle.position.y = -10;
          particle.velocity.y *= -0.3;
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
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
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
