/**
 * ParticleForces.ts
 *
 * Force field system for particles: gravity, wind, turbulence,
 * point attractors, vortex fields, and drag.
 *
 * @module particles
 */

import type { Particle, IVector3 } from './ParticleEmitter';

// =============================================================================
// TYPES
// =============================================================================

export type ForceType = 'gravity' | 'wind' | 'turbulence' | 'attractor' | 'vortex' | 'drag';

export interface ForceFieldConfig {
  id: string;
  type: ForceType;
  strength: number;
  position?: IVector3; // For attractor/vortex
  direction?: IVector3; // For gravity/wind
  radius?: number; // Falloff radius
  falloff?: 'linear' | 'quadratic' | 'none';
  frequency?: number; // For turbulence
  dragCoefficient?: number; // For drag
}

export interface ForceField {
  config: ForceFieldConfig;
  enabled: boolean;
}

// =============================================================================
// FORCE COMPUTATIONS
// =============================================================================

function vec3Length(v: IVector3): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

function computeFalloff(
  distance: number,
  radius: number,
  type: 'linear' | 'quadratic' | 'none'
): number {
  if (type === 'none' || radius <= 0) return 1;
  if (distance >= radius) return 0;
  const t = distance / radius;
  return type === 'linear' ? 1 - t : (1 - t) * (1 - t);
}

// Simple noise for turbulence (deterministic for given position)
function simpleNoise3D(x: number, y: number, z: number): IVector3 {
  const px = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  const py = Math.sin(y * 12.9898 + z * 78.233) * 43758.5453;
  const pz = Math.sin(z * 12.9898 + x * 78.233) * 43758.5453;
  return {
    x: (px - Math.floor(px)) * 2 - 1,
    y: (py - Math.floor(py)) * 2 - 1,
    z: (pz - Math.floor(pz)) * 2 - 1,
  };
}

// =============================================================================
// PARTICLE FORCE SYSTEM
// =============================================================================

export class ParticleForceSystem {
  private fields: Map<string, ForceField> = new Map();
  private time = 0;

  // ---------------------------------------------------------------------------
  // Management
  // ---------------------------------------------------------------------------

  addForce(config: ForceFieldConfig): void {
    this.fields.set(config.id, { config, enabled: true });
  }

  removeForce(id: string): void {
    this.fields.delete(id);
  }

  setEnabled(id: string, enabled: boolean): void {
    const f = this.fields.get(id);
    if (f) f.enabled = enabled;
  }

  getForce(id: string): ForceField | undefined {
    return this.fields.get(id);
  }

  getForceCount(): number {
    return this.fields.size;
  }

  // ---------------------------------------------------------------------------
  // Application
  // ---------------------------------------------------------------------------

  /**
   * Apply all force fields to a set of particles.
   */
  apply(particles: Particle[], dt: number): void {
    this.time += dt;

    for (const particle of particles) {
      if (!particle.alive) continue;

      for (const field of this.fields.values()) {
        if (!field.enabled) continue;
        this.applyForce(particle, field.config, dt);
      }
    }
  }

  private applyForce(p: Particle, cfg: ForceFieldConfig, dt: number): void {
    switch (cfg.type) {
      case 'gravity':
        this.applyGravity(p, cfg, dt);
        break;
      case 'wind':
        this.applyWind(p, cfg, dt);
        break;
      case 'turbulence':
        this.applyTurbulence(p, cfg, dt);
        break;
      case 'attractor':
        this.applyAttractor(p, cfg, dt);
        break;
      case 'vortex':
        this.applyVortex(p, cfg, dt);
        break;
      case 'drag':
        this.applyDrag(p, cfg, dt);
        break;
    }
  }

  private applyGravity(p: Particle, cfg: ForceFieldConfig, dt: number): void {
    const dir = cfg.direction ?? { x: 0, y: -1, z: 0 };
    p.velocity.x += dir.x * cfg.strength * dt;
    p.velocity.y += dir.y * cfg.strength * dt;
    p.velocity.z += dir.z * cfg.strength * dt;
  }

  private applyWind(p: Particle, cfg: ForceFieldConfig, dt: number): void {
    const dir = cfg.direction ?? { x: 1, y: 0, z: 0 };
    const falloff = this.getPositionalFalloff(p, cfg);
    p.velocity.x += dir.x * cfg.strength * falloff * dt;
    p.velocity.y += dir.y * cfg.strength * falloff * dt;
    p.velocity.z += dir.z * cfg.strength * falloff * dt;
  }

  private applyTurbulence(p: Particle, cfg: ForceFieldConfig, dt: number): void {
    const freq = cfg.frequency ?? 1;
    const noise = simpleNoise3D(
      p.position.x * freq + this.time,
      p.position.y * freq + this.time * 0.7,
      p.position.z * freq + this.time * 1.3
    );
    const falloff = this.getPositionalFalloff(p, cfg);
    p.velocity.x += noise.x * cfg.strength * falloff * dt;
    p.velocity.y += noise.y * cfg.strength * falloff * dt;
    p.velocity.z += noise.z * cfg.strength * falloff * dt;
  }

  private applyAttractor(p: Particle, cfg: ForceFieldConfig, dt: number): void {
    const target = cfg.position ?? { x: 0, y: 0, z: 0 };
    const dx = target.x - p.position.x;
    const dy = target.y - p.position.y;
    const dz = target.z - p.position.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist < 0.001) return;

    const falloff = this.getPositionalFalloff(p, cfg);
    const force = (cfg.strength * falloff) / dist;
    p.velocity.x += dx * force * dt;
    p.velocity.y += dy * force * dt;
    p.velocity.z += dz * force * dt;
  }

  private applyVortex(p: Particle, cfg: ForceFieldConfig, dt: number): void {
    const center = cfg.position ?? { x: 0, y: 0, z: 0 };
    const dx = p.position.x - center.x;
    const dz = p.position.z - center.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < 0.001) return;

    const falloff = this.getPositionalFalloff(p, cfg);
    // Tangential force (perpendicular to radius in XZ plane)
    const force = (cfg.strength * falloff) / dist;
    p.velocity.x += -dz * force * dt;
    p.velocity.z += dx * force * dt;
  }

  private applyDrag(p: Particle, cfg: ForceFieldConfig, dt: number): void {
    const drag = cfg.dragCoefficient ?? 0.1;
    const factor = Math.max(0, 1 - drag * dt);
    p.velocity.x *= factor;
    p.velocity.y *= factor;
    p.velocity.z *= factor;
  }

  private getPositionalFalloff(p: Particle, cfg: ForceFieldConfig): number {
    if (!cfg.position || !cfg.radius) return 1;
    const dx = p.position.x - cfg.position.x;
    const dy = p.position.y - cfg.position.y;
    const dz = p.position.z - cfg.position.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    return computeFalloff(dist, cfg.radius, cfg.falloff ?? 'linear');
  }
}

