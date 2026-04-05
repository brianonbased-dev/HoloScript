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
  rest: { x: number; y: number; z: number }; // Original position
  current: { x: number; y: number; z: number }; // Deformed position
  velocity: { x: number; y: number; z: number };
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
  private vertices: DeformVertex[] = [];
  private springs: DeformSpring[] = [];
  private config: DeformConfig;
  private restCentroid = { x: 0, y: 0, z: 0 };

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

  setVertices(positions: Array<{ x: number; y: number; z: number }>): void {
    this.vertices = positions.map((p) => ({
      rest: { ...p },
      current: { ...p },
      velocity: { x: 0, y: 0, z: 0 },
      mass: 1,
      locked: false,
    }));
    this.computeRestCentroid();
  }

  addSpring(a: number, b: number, stiffness?: number, damping?: number): void {
    const pa = this.vertices[a].rest,
      pb = this.vertices[b].rest;
    const dx = pb.x - pa.x,
      dy = pb.y - pa.y,
      dz = pb.z - pa.z;
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
        const dx = b.x - a.x,
          dy = b.y - a.y,
          dz = b.z - a.z;
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
      cx += v.rest.x;
      cy += v.rest.y;
      cz += v.rest.z;
    }
    const n = this.vertices.length || 1;
    this.restCentroid = { x: cx / n, y: cy / n, z: cz / n };
  }

  // ---------------------------------------------------------------------------
  // Deformation
  // ---------------------------------------------------------------------------

  applyImpact(center: { x: number; y: number; z: number }, radius: number, force: number): void {
    for (const v of this.vertices) {
      if (v.locked) continue;
      const dx = v.current.x - center.x;
      const dy = v.current.y - center.y;
      const dz = v.current.z - center.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist > radius || dist === 0) continue;

      const falloff = 1 - dist / radius;
      const strength = (force * falloff) / v.mass;
      const n = dist;
      v.velocity.x += (dx / n) * strength;
      v.velocity.y += (dy / n) * strength;
      v.velocity.z += (dz / n) * strength;
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
      const dx = b.current.x - a.current.x;
      const dy = b.current.y - a.current.y;
      const dz = b.current.z - a.current.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.0001;
      const stretch = dist - s.restLength;
      const fx = (dx / dist) * stretch * s.stiffness;
      const fy = (dy / dist) * stretch * s.stiffness;
      const fz = (dz / dist) * stretch * s.stiffness;

      // Relative velocity damping
      const dvx = b.velocity.x - a.velocity.x;
      const dvy = b.velocity.y - a.velocity.y;
      const dvz = b.velocity.z - a.velocity.z;

      if (!a.locked) {
        a.velocity.x += ((fx + dvx * s.damping) * dt) / a.mass;
        a.velocity.y += ((fy + dvy * s.damping) * dt) / a.mass;
        a.velocity.z += ((fz + dvz * s.damping) * dt) / a.mass;
      }
      if (!b.locked) {
        b.velocity.x -= ((fx + dvx * s.damping) * dt) / b.mass;
        b.velocity.y -= ((fy + dvy * s.damping) * dt) / b.mass;
        b.velocity.z -= ((fz + dvz * s.damping) * dt) / b.mass;
      }
    }

    // Shape matching
    if (this.config.shapeMatchingStrength > 0) {
      let cx = 0,
        cy = 0,
        cz = 0;
      for (const v of this.vertices) {
        cx += v.current.x;
        cy += v.current.y;
        cz += v.current.z;
      }
      const n = this.vertices.length || 1;
      cx /= n;
      cy /= n;
      cz /= n;

      for (const v of this.vertices) {
        if (v.locked) continue;
        const goalX = v.rest.x - this.restCentroid.x + cx;
        const goalY = v.rest.y - this.restCentroid.y + cy;
        const goalZ = v.rest.z - this.restCentroid.z + cz;
        v.velocity.x += (goalX - v.current.x) * this.config.shapeMatchingStrength * dt * 10;
        v.velocity.y += (goalY - v.current.y) * this.config.shapeMatchingStrength * dt * 10;
        v.velocity.z += (goalZ - v.current.z) * this.config.shapeMatchingStrength * dt * 10;
      }
    }

    // Integrate
    for (const v of this.vertices) {
      if (v.locked) continue;
      v.velocity.x *= this.config.damping;
      v.velocity.y *= this.config.damping;
      v.velocity.z *= this.config.damping;

      v.current.x += v.velocity.x * dt;
      v.current.y += v.velocity.y * dt;
      v.current.z += v.velocity.z * dt;

      // Clamp displacement
      const dx = v.current.x - v.rest.x;
      const dy = v.current.y - v.rest.y;
      const dz = v.current.z - v.rest.z;
      const disp = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (disp > this.config.maxDisplacement) {
        const scale = this.config.maxDisplacement / disp;
        v.current.x = v.rest.x + dx * scale;
        v.current.y = v.rest.y + dy * scale;
        v.current.z = v.rest.z + dz * scale;
      }

      // Plasticity — shift rest position
      if (this.config.plasticity > 0 && disp > 0.01) {
        v.rest.x += dx * this.config.plasticity * dt;
        v.rest.y += dy * this.config.plasticity * dt;
        v.rest.z += dz * this.config.plasticity * dt;
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
    const dx = v.current.x - v.rest.x,
      dy = v.current.y - v.rest.y,
      dz = v.current.z - v.rest.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  getMaxDisplacement(): number {
    let max = 0;
    for (let i = 0; i < this.vertices.length; i++) max = Math.max(max, this.getDisplacement(i));
    return max;
  }
}
