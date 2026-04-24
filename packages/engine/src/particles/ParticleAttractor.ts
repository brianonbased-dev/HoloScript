import type { Vector3 } from '@holoscript/core';
/**
 * ParticleAttractor.ts
 *
 * Point/line/plane attractors for particle systems:
 * inverse-square falloff, orbital motion, and kill radius.
 *
 * @module particles
 */

// =============================================================================
// TYPES
// =============================================================================

export type AttractorShape = 'point' | 'line' | 'plane';

export interface Attractor {
  id: string;
  shape: AttractorShape;
  position: [number, number, number];
  direction: Vector3; // Used by line/plane
  strength: number;
  radius: number; // Max influence radius
  killRadius: number; // Destroy particle if closer than this
  orbit: boolean; // Apply tangential force instead of direct pull
}

export interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  alive: boolean;
  [index: number]: number | boolean;
}

// =============================================================================
// PARTICLE ATTRACTOR SYSTEM
// =============================================================================

export class ParticleAttractorSystem {
  private attractors: Map<string, Attractor> = new Map();

  addAttractor(a: Attractor): void {
    this.attractors.set(a.id, a);
  }
  removeAttractor(id: string): void {
    this.attractors.delete(id);
  }

  apply(particles: Particle[], dt: number): void {
    for (const attractor of this.attractors.values()) {
      for (const p of particles) {
        if (!p.alive) continue;

        const dx = attractor.position[0] - p.x;
        const dy = attractor.position[1] - p.y;
        const dz = attractor.position[2] - p.z;
        const distSq = dx * dx + dy * dy + dz * dz;
        const dist = Math.sqrt(distSq);

        if (dist > attractor.radius) continue;
        if (dist < attractor.killRadius) {
          p.alive = false;
          continue;
        }

        // Inverse-square force
        const force = attractor.strength / Math.max(distSq, 0.01);
        const nx = dx / dist,
          ny = dy / dist,
          nz = dz / dist;

        if (attractor.orbit) {
          // Tangential: cross product with up (0,1,0) as fallback
          const tx = ny * 0 - nz * 1 || nz;
          const ty = nz * 0 - nx * 0 || -nx;
          const tz = nx * 1 - ny * 0 || 0;
          p.vx += tx * force * dt;
          p.vy += ty * force * dt;
          p.vz += tz * force * dt;
        } else {
          p.vx += nx * force * dt;
          p.vy += ny * force * dt;
          p.vz += nz * force * dt;
        }

        (p as Particle & Record<number, number | boolean>)[0] = p.x;
        (p as Particle & Record<number, number | boolean>)[1] = p.y;
        (p as Particle & Record<number, number | boolean>)[2] = p.z;
      }
    }
  }

  getAttractorCount(): number {
    return this.attractors.size;
  }
}
