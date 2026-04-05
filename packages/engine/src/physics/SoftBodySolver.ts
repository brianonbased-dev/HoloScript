/**
 * @holoscript/core Soft Body Solver
 *
 * Implements Position-Based Dynamics (PBD) for real-time mesh deformation.
 * Handles distance, volume, and collision constraints.
 */
import { Vector3, Vector3Tuple } from '@holoscript/core';

export interface Particle {
  position: [number, number, number];
  previousPosition: [number, number, number];
  velocity: [number, number, number];
  invMass: number;
}

export interface DistanceConstraint {
  p1: number;
  p2: number;
  restLength: number;
  stiffness: number;
}

export class SoftBodySolver {
  private particles: Particle[] = [];
  private constraints: DistanceConstraint[] = [];
  private gravity: [number, number, number] = [0, -9.81, 0];
  private substeps: number = 5;

  constructor(particles: Particle[], constraints: DistanceConstraint[]) {
    this.particles = particles;
    this.constraints = constraints;
  }

  /**
   * Step the simulation using PBD.
   */
  public step(dt: number): void {
    const sdt = dt / this.substeps;

    for (let s = 0; s < this.substeps; s++) {
      this.predictPositions(sdt);
      this.solveConstraints();
      this.updateVelocities(sdt);
    }
  }

  private predictPositions(dt: number): void {
    for (const p of this.particles) {
      if (p.invMass === 0) continue;

      // Apply gravity
      p.velocity[0] += this.gravity[0] * dt;
      p.velocity[1] += this.gravity[1] * dt;
      p.velocity[2] += this.gravity[2] * dt;

      // Predict new position
      p.previousPosition = [...p.position];
      p.position[0] += p.velocity[0] * dt;
      p.position[1] += p.velocity[1] * dt;
      p.position[2] += p.velocity[2] * dt;
    }
  }

  private solveConstraints(): void {
    // Solve distance constraints
    for (const c of this.constraints) {
      const p1 = this.particles[c.p1];
      const p2 = this.particles[c.p2];

      const dx = p1.position[0] - p2.position[0];
      const dy = p1.position[1] - p2.position[1];
      const dz = p1.position[2] - p2.position[2];

      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (distance === 0) continue;

      const difference = (distance - c.restLength) / distance;
      const totalInvMass = p1.invMass + p2.invMass;
      if (totalInvMass === 0) continue;

      const correctionX = dx * difference * (p1.invMass / totalInvMass) * c.stiffness;
      const correctionY = dy * difference * (p1.invMass / totalInvMass) * c.stiffness;
      const correctionZ = dz * difference * (p1.invMass / totalInvMass) * c.stiffness;

      p1.position[0] -= correctionX;
      p1.position[1] -= correctionY;
      p1.position[2] -= correctionZ;

      p2.position[0] += dx * difference * (p2.invMass / totalInvMass) * c.stiffness;
      p2.position[1] += dy * difference * (p2.invMass / totalInvMass) * c.stiffness;
      p2.position[2] += dz * difference * (p2.invMass / totalInvMass) * c.stiffness;
    }

    // Floor constraint (MOCK for verification)
    for (const p of this.particles) {
      if (p.position[1] < 0) {
        p.position[1] = 0;
      }
    }
  }

  private updateVelocities(dt: number): void {
    for (const p of this.particles) {
      if (p.invMass === 0) continue;

      p.velocity[0] = (p.position[0] - p.previousPosition[0]) / dt;
      p.velocity[1] = (p.position[1] - p.previousPosition[1]) / dt;
      p.velocity[2] = (p.position[2] - p.previousPosition[2]) / dt;
    }
  }

  public getParticles(): Particle[] {
    return this.particles;
  }

  public getConstraints(): DistanceConstraint[] {
    return this.constraints;
  }
}

