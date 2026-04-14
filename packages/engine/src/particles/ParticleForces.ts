import type { Vector3 } from '@holoscript/core';
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

function _vec3Length(v: IVector3): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
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
  return [(px - Math.floor(px)) * 2 - 1, (py - Math.floor(py)) * 2 - 1, (pz - Math.floor(pz)) * 2 - 1, ];
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
    const dir = cfg.direction ?? [0, -1, 0 ];
    p.velocity[0] += dir[0] * cfg.strength * dt;
    p.velocity[1] += dir[1] * cfg.strength * dt;
    p.velocity[2] += dir[2] * cfg.strength * dt;
  }

  private applyWind(p: Particle, cfg: ForceFieldConfig, dt: number): void {
    const dir = cfg.direction ?? [1, 0, 0 ];
    const falloff = this.getPositionalFalloff(p, cfg);
    p.velocity[0] += dir[0] * cfg.strength * falloff * dt;
    p.velocity[1] += dir[1] * cfg.strength * falloff * dt;
    p.velocity[2] += dir[2] * cfg.strength * falloff * dt;
  }

  private applyTurbulence(p: Particle, cfg: ForceFieldConfig, dt: number): void {
    const freq = cfg.frequency ?? 1;
    const noise = simpleNoise3D(
      p.position[0] * freq + this.time,
      p.position[1] * freq + this.time * 0.7,
      p.position[2] * freq + this.time * 1.3
    );
    const falloff = this.getPositionalFalloff(p, cfg);
    p.velocity[0] += noise[0] * cfg.strength * falloff * dt;
    p.velocity[1] += noise[1] * cfg.strength * falloff * dt;
    p.velocity[2] += noise[2] * cfg.strength * falloff * dt;
  }

  private applyAttractor(p: Particle, cfg: ForceFieldConfig, dt: number): void {
    const target = cfg.position ?? [0, 0, 0 ];
    const dx = target[0] - p.position[0];
    const dy = target[1] - p.position[1];
    const dz = target[2] - p.position[2];
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist < 0.001) return;

    const falloff = this.getPositionalFalloff(p, cfg);
    const force = (cfg.strength * falloff) / dist;
    p.velocity[0] += dx * force * dt;
    p.velocity[1] += dy * force * dt;
    p.velocity[2] += dz * force * dt;
  }

  private applyVortex(p: Particle, cfg: ForceFieldConfig, dt: number): void {
    const center = cfg.position ?? [0, 0, 0 ];
    const dx = p.position[0] - center[0];
    const dz = p.position[2] - center[2];
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < 0.001) return;

    const falloff = this.getPositionalFalloff(p, cfg);
    // Tangential force (perpendicular to radius in XZ plane)
    const force = (cfg.strength * falloff) / dist;
    p.velocity[0] += -dz * force * dt;
    p.velocity[2] += dx * force * dt;
  }

  private applyDrag(p: Particle, cfg: ForceFieldConfig, dt: number): void {
    const drag = cfg.dragCoefficient ?? 0.1;
    const factor = Math.max(0, 1 - drag * dt);
    p.velocity[0] *= factor;
    p.velocity[1] *= factor;
    p.velocity[2] *= factor;
  }

  private getPositionalFalloff(p: Particle, cfg: ForceFieldConfig): number {
    if (!cfg.position || !cfg.radius) return 1;
    const dx = p.position[0] - cfg.position[0];
    const dy = p.position[1] - cfg.position[1];
    const dz = p.position[2] - cfg.position[2];
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    return computeFalloff(dist, cfg.radius, cfg.falloff ?? 'linear');
  }
}
