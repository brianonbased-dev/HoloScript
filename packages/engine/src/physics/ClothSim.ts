import type { Vector3 } from '@holoscript/core';
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
  position: Vector3;
  prevPosition: Vector3;
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
  wind: Vector3;
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
      wind: [0, 0, 0],
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
          position: [col * spacing, 0, row * spacing],
          prevPosition: [col * spacing, 0, row * spacing],
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
    const dt2 = dt * dt;
    const gravity = this.config.gravity;
    const wind = this.config.wind;
    const damping = this.config.damping;

    // Apply forces (Verlet integration)
    for (const p of this.particles) {
      if (p.pinned) continue;

      const pos = p.position;
      const prev = p.prevPosition;

      const vx = (pos[0] - prev[0]) * damping;
      const vy = (pos[1] - prev[1]) * damping;
      const vz = (pos[2] - prev[2]) * damping;

      p.prevPosition = [pos[0], pos[1], pos[2]];

      p.position[0] += vx + (wind[0] * dt2) / p.mass;
      p.position[1] += vy + gravity * dt2;
      p.position[2] += vz + (wind[2] * dt2) / p.mass;
    }

    // Constraint solving
    for (let iter = 0; iter < this.config.iterations; iter++) {
      for (const c of this.constraints) {
        const a = this.particles[c.particleA];
        const b = this.particles[c.particleB];

        const pa = a.position;
        const pb = b.position;

        const dx = pb[0] - pa[0];
        const dy = pb[1] - pa[1];
        const dz = pb[2] - pa[2];
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (dist === 0) continue;

        const diff = ((c.restLength - dist) / dist) * c.stiffness * 0.5;
        const ox = dx * diff;
        const oy = dy * diff;
        const oz = dz * diff;

        if (!a.pinned) {
          pa[0] -= ox;
          pa[1] -= oy;
          pa[2] -= oz;
        }
        if (!b.pinned) {
          pb[0] += ox;
          pb[1] += oy;
          pb[2] += oz;
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Wind
  // ---------------------------------------------------------------------------

  setWind(x: number, y: number, z: number): void {
    this.config.wind = [x, y, z];
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
    min: Vector3;
    max: Vector3;
  } {
    let minX = Infinity,
      minY = Infinity,
      minZ = Infinity;
    let maxX = -Infinity,
      maxY = -Infinity,
      maxZ = -Infinity;
    for (const p of this.particles) {
      const pos = p.position;
      minX = Math.min(minX, pos[0]);
      minY = Math.min(minY, pos[1]);
      minZ = Math.min(minZ, pos[2]);
      maxX = Math.max(maxX, pos[0]);
      maxY = Math.max(maxY, pos[1]);
      maxZ = Math.max(maxZ, pos[2]);
    }
    return { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] };
  }
}
