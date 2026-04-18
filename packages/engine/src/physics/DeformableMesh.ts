import type { Vector3 } from '@holoscript/core';
/**
 * DeformableMesh.ts
 *
 * Deformable mesh: vertex displacement, spring-damper networks,
 * shape matching for volume preservation, and impact deformation.
 *
 * @module physics
 */

// =============================================================================
// TYPES
// =============================================================================

export interface DeformVertex {
  rest: Vector3; // Original position
  current: Vector3; // Deformed position
  velocity: Vector3;
  mass: number;
  locked: boolean;
}

export interface DeformSpring {
  a: number;
  b: number;
  restLength: number;
  stiffness: number;
  damping: number;
}

export interface DeformConfig {
  stiffness: number; // Global spring stiffness
  damping: number; // Velocity damping
  shapeMatchingStrength: number; // 0-1
  maxDisplacement: number; // Clamp vertex movement
  plasticity: number; // 0-1: permanent deformation rate
}

// =============================================================================
// DEFORMABLE MESH
// =============================================================================

export class DeformableMesh {
  private toArr3(v: Vector3 | { x: number; y: number; z: number }): Vector3 {
    if (Array.isArray(v)) return [v[0], v[1], v[2]] as Vector3;
    return [v.x, v.y, v.z] as Vector3;
  }

  private vertices: DeformVertex[] = [];
  private springs: DeformSpring[] = [];
  private config: DeformConfig;
  private restCentroid: Vector3 = [0, 0, 0];

  constructor(config?: Partial<DeformConfig>) {
    this.config = {
      stiffness: 100,
      damping: 0.95,
      shapeMatchingStrength: 0.5,
      maxDisplacement: 5,
      plasticity: 0,
      ...config,
    };
  }

  // ---------------------------------------------------------------------------
  // Mesh Setup
  // ---------------------------------------------------------------------------

  setVertices(positions: Array<Vector3 | { x: number; y: number; z: number }>): void {
    this.vertices = positions.map((p) => {
      const v = this.toArr3(p);
      return {
        rest: [v[0], v[1], v[2]],
        current: [v[0], v[1], v[2]],
        velocity: [0, 0, 0],
        mass: 1,
        locked: false,
      };
    });
    this.computeRestCentroid();
  }

  addSpring(a: number, b: number, stiffness?: number, damping?: number): void {
    const pa = this.vertices[a].rest,
      pb = this.vertices[b].rest;
    const dx = pb[0] - pa[0],
      dy = pb[1] - pa[1],
      dz = pb[2] - pa[2];
    this.springs.push({
      a,
      b,
      restLength: Math.sqrt(dx * dx + dy * dy + dz * dz),
      stiffness: stiffness ?? this.config.stiffness,
      damping: damping ?? 5,
    });
  }

  autoConnectRadius(radius: number): void {
    for (let i = 0; i < this.vertices.length; i++) {
      for (let j = i + 1; j < this.vertices.length; j++) {
        const a = this.vertices[i].rest,
          b = this.vertices[j].rest;
        const dx = b[0] - a[0],
          dy = b[1] - a[1],
          dz = b[2] - a[2];
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist <= radius) this.addSpring(i, j);
      }
    }
  }

  private computeRestCentroid(): void {
    let cx = 0,
      cy = 0,
      cz = 0;
    for (const v of this.vertices) {
      cx += v.rest[0];
      cy += v.rest[1];
      cz += v.rest[2];
    }
    const n = this.vertices.length || 1;
    this.restCentroid = [cx / n, cy / n, cz / n];
  }

  // ---------------------------------------------------------------------------
  // Deformation
  // ---------------------------------------------------------------------------

  applyImpact(center: Vector3 | { x: number; y: number; z: number }, radius: number, force: number): void {
    const centerV = this.toArr3(center);
    for (const v of this.vertices) {
      if (v.locked) continue;
      const dx = v.current[0] - centerV[0];
      const dy = v.current[1] - centerV[1];
      const dz = v.current[2] - centerV[2];
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist > radius || dist === 0) continue;

      const falloff = 1 - dist / radius;
      const strength = (force * falloff) / v.mass;
      const n = dist;
      v.velocity[0] += (dx / n) * strength;
      v.velocity[1] += (dy / n) * strength;
      v.velocity[2] += (dz / n) * strength;
    }
  }

  // ---------------------------------------------------------------------------
  // Simulation
  // ---------------------------------------------------------------------------

  update(dt: number): void {
    // Spring forces
    for (const s of this.springs) {
      const a = this.vertices[s.a],
        b = this.vertices[s.b];
      const dx = b.current[0] - a.current[0];
      const dy = b.current[1] - a.current[1];
      const dz = b.current[2] - a.current[2];
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.0001;
      const stretch = dist - s.restLength;
      const fx = (dx / dist) * stretch * s.stiffness;
      const fy = (dy / dist) * stretch * s.stiffness;
      const fz = (dz / dist) * stretch * s.stiffness;

      // Relative velocity damping
      const dvx = b.velocity[0] - a.velocity[0];
      const dvy = b.velocity[1] - a.velocity[1];
      const dvz = b.velocity[2] - a.velocity[2];

      if (!a.locked) {
        a.velocity[0] += ((fx + dvx * s.damping) * dt) / a.mass;
        a.velocity[1] += ((fy + dvy * s.damping) * dt) / a.mass;
        a.velocity[2] += ((fz + dvz * s.damping) * dt) / a.mass;
      }
      if (!b.locked) {
        b.velocity[0] -= ((fx + dvx * s.damping) * dt) / b.mass;
        b.velocity[1] -= ((fy + dvy * s.damping) * dt) / b.mass;
        b.velocity[2] -= ((fz + dvz * s.damping) * dt) / b.mass;
      }
    }

    // Shape matching
    if (this.config.shapeMatchingStrength > 0) {
      let cx = 0,
        cy = 0,
        cz = 0;
      for (const v of this.vertices) {
        cx += v.current[0];
        cy += v.current[1];
        cz += v.current[2];
      }
      const n = this.vertices.length || 1;
      cx /= n;
      cy /= n;
      cz /= n;

      for (const v of this.vertices) {
        if (v.locked) continue;
        const goalX = v.rest[0] - this.restCentroid[0] + cx;
        const goalY = v.rest[1] - this.restCentroid[1] + cy;
        const goalZ = v.rest[2] - this.restCentroid[2] + cz;
        v.velocity[0] += (goalX - v.current[0]) * this.config.shapeMatchingStrength * dt * 10;
        v.velocity[1] += (goalY - v.current[1]) * this.config.shapeMatchingStrength * dt * 10;
        v.velocity[2] += (goalZ - v.current[2]) * this.config.shapeMatchingStrength * dt * 10;
      }
    }

    // Integrate
    for (const v of this.vertices) {
      if (v.locked) continue;
      v.velocity[0] *= this.config.damping;
      v.velocity[1] *= this.config.damping;
      v.velocity[2] *= this.config.damping;

      v.current[0] += v.velocity[0] * dt;
      v.current[1] += v.velocity[1] * dt;
      v.current[2] += v.velocity[2] * dt;

      // Clamp displacement
      const dx = v.current[0] - v.rest[0];
      const dy = v.current[1] - v.rest[1];
      const dz = v.current[2] - v.rest[2];
      const disp = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (disp > this.config.maxDisplacement) {
        const scale = this.config.maxDisplacement / disp;
        v.current[0] = v.rest[0] + dx * scale;
        v.current[1] = v.rest[1] + dy * scale;
        v.current[2] = v.rest[2] + dz * scale;
      }

      // Plasticity — shift rest position
      if (this.config.plasticity > 0 && disp > 0.01) {
        v.rest[0] += dx * this.config.plasticity * dt;
        v.rest[1] += dy * this.config.plasticity * dt;
        v.rest[2] += dz * this.config.plasticity * dt;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getVertices(): DeformVertex[] {
    return this.vertices;
  }
  getVertex(index: number): DeformVertex | undefined {
    return this.vertices[index];
  }
  getVertexCount(): number {
    return this.vertices.length;
  }
  getSpringCount(): number {
    return this.springs.length;
  }
  getDisplacement(index: number): number {
    const v = this.vertices[index];
    if (!v) return 0;
    const dx = v.current[0] - v.rest[0],
      dy = v.current[1] - v.rest[1],
      dz = v.current[2] - v.rest[2];
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  getMaxDisplacement(): number {
    let max = 0;
    for (let i = 0; i < this.vertices.length; i++) max = Math.max(max, this.getDisplacement(i));
    return max;
  }
}
