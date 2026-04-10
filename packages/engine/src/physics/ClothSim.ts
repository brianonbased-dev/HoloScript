/**
 * ClothSim.ts
 *
 * Mass-spring cloth simulation: particle grid, distance constraints,
 * pin points, wind, gravity, and self-collision.
 *
 * @module physics
 */

// =============================================================================
// TYPES
// =============================================================================

export interface ClothParticle {
  x: number;
  y: number;
  z: number;
  prevX: number;
  prevY: number;
  prevZ: number;
  mass: number;
  pinned: boolean;
}

export interface ClothConstraint {
  particleA: number;
  particleB: number;
  restLength: number;
  stiffness: number;
}

export interface ClothConfig {
  gravity: number;
  damping: number;
  iterations: number;
  wind: { x: number; y: number; z: number };
}

// =============================================================================
// CLOTH SIMULATION
// =============================================================================

export class ClothSim {
  private particles: ClothParticle[] = [];
  private constraints: ClothConstraint[] = [];
  private config: ClothConfig;
  private width = 0;
  private height = 0;

  constructor(config?: Partial<ClothConfig>) {
    this.config = {
      gravity: -9.81,
      damping: 0.99,
      iterations: 5,
      wind: { x: 0, y: 0, z: 0 },
      ...config,
    };
  }

  // ---------------------------------------------------------------------------
  // Grid
  // ---------------------------------------------------------------------------

  createGrid(width: number, height: number, spacing: number): void {
    this.width = width;
    this.height = height;
    this.particles = [];
    this.constraints = [];

    // Particles
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        this.particles.push({
          x: col * spacing,
          y: 0,
          z: row * spacing,
          prevX: col * spacing,
          prevY: 0,
          prevZ: row * spacing,
          mass: 1,
          pinned: false,
        });
      }
    }

    // Structural constraints (horizontal + vertical)
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const idx = row * width + col;
        if (col < width - 1) {
          this.addConstraint(idx, idx + 1, spacing);
        }
        if (row < height - 1) {
          this.addConstraint(idx, idx + width, spacing);
        }
        // Shear
        if (col < width - 1 && row < height - 1) {
          const diag = spacing * Math.SQRT2;
          this.addConstraint(idx, idx + width + 1, diag);
          this.addConstraint(idx + 1, idx + width, diag);
        }
      }
    }
  }

  private addConstraint(a: number, b: number, restLength: number, stiffness = 1): void {
    this.constraints.push({ particleA: a, particleB: b, restLength, stiffness });
  }

  // ---------------------------------------------------------------------------
  // Pinning
  // ---------------------------------------------------------------------------

  pin(index: number): void {
    if (this.particles[index]) this.particles[index].pinned = true;
  }
  unpin(index: number): void {
    if (this.particles[index]) this.particles[index].pinned = false;
  }

  pinTopRow(): void {
    for (let col = 0; col < this.width; col++) this.pin(col);
  }

  // ---------------------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------------------

  update(dt: number): void {
    // Apply forces (Verlet integration)
    for (const p of this.particles) {
      if (p.pinned) continue;

      const vx = (p.x - p.prevX) * this.config.damping;
      const vy = (p.y - p.prevY) * this.config.damping;
      const vz = (p.z - p.prevZ) * this.config.damping;

      p.prevX = p.x;
      p.prevY = p.y;
      p.prevZ = p.z;

      p.x += vx + (this.config.wind.x * dt * dt) / p.mass;
      p.y += vy + this.config.gravity * dt * dt;
      p.z += vz + (this.config.wind.z * dt * dt) / p.mass;
    }

    // Constraint solving
    for (let iter = 0; iter < this.config.iterations; iter++) {
      for (const c of this.constraints) {
        const a = this.particles[c.particleA];
        const b = this.particles[c.particleB];

        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dz = b.z - a.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (dist === 0) continue;

        const diff = ((c.restLength - dist) / dist) * c.stiffness * 0.5;
        const ox = dx * diff;
        const oy = dy * diff;
        const oz = dz * diff;

        if (!a.pinned) {
          a.x -= ox;
          a.y -= oy;
          a.z -= oz;
        }
        if (!b.pinned) {
          b.x += ox;
          b.y += oy;
          b.z += oz;
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Wind
  // ---------------------------------------------------------------------------

  setWind(x: number, y: number, z: number): void {
    this.config.wind = { x, y, z };
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getParticle(index: number): ClothParticle | undefined {
    return this.particles[index];
  }
  getParticleCount(): number {
    return this.particles.length;
  }
  getConstraintCount(): number {
    return this.constraints.length;
  }
  getGridSize(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }

  getAABB(): {
    min: { x: number; y: number; z: number };
    max: { x: number; y: number; z: number };
  } {
    let minX = Infinity,
      minY = Infinity,
      minZ = Infinity;
    let maxX = -Infinity,
      maxY = -Infinity,
      maxZ = -Infinity;
    for (const p of this.particles) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      minZ = Math.min(minZ, p.z);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
      maxZ = Math.max(maxZ, p.z);
    }
    return { min: { x: minX, y: minY, z: minZ }, max: { x: maxX, y: maxY, z: maxZ } };
  }
}

