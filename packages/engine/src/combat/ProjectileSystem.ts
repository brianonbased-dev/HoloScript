import type { Vector3 } from '@holoscript/core';
/**
 * ProjectileSystem.ts
 *
 * Projectile management: spawning, travel, lifetime,
 * homing behavior, piercing, and impact callbacks.
 *
 * @module combat
 */

// =============================================================================
// TYPES
// =============================================================================

export interface ProjectileConfig {
  speed: number;
  lifetime: number; // seconds
  damage: number;
  homing: boolean;
  homingStrength: number; // Turn rate (radians/s)
  piercing: number; // Max targets to pierce (0 = stop on first)
  gravity: number; // Downward acceleration
}

export interface Projectile {
  id: string;
  position: Vector3;
  velocity: Vector3;
  config: ProjectileConfig;
  age: number;
  hitCount: number;
  alive: boolean;
  ownerId: string;
}

export type ImpactCallback = (projectile: Projectile, targetId: string) => void;

export interface ProjectileTarget {
  id: string;
  position: Vector3;
  radius: number;
}

// =============================================================================
// PROJECTILE SYSTEM
// =============================================================================

export class ProjectileSystem {
  private projectiles: Map<string, Projectile> = new Map();
  private nextId = 0;
  private onImpact: ImpactCallback | null = null;

  // ---------------------------------------------------------------------------
  // Spawning
  // ---------------------------------------------------------------------------

  spawn(
    ownerId: string,
    x: number,
    y: number,
    z: number,
    dx: number,
    dy: number,
    dz: number,
    config: ProjectileConfig
  ): string {
    const id = `proj_${this.nextId++}`;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    this.projectiles.set(id, {
      id,
      position: [x, y, z],
      velocity: [
        (dx / len) * config.speed,
        (dy / len) * config.speed,
        (dz / len) * config.speed,
      ],
      config,
      age: 0,
      hitCount: 0,
      alive: true,
      ownerId,
    });
    return id;
  }

  setImpactCallback(cb: ImpactCallback): void {
    this.onImpact = cb;
  }

  // ---------------------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------------------

  update(
    dt: number,
    targets?: ProjectileTarget[]
  ): void {
    for (const proj of this.projectiles.values()) {
      if (!proj.alive) continue;

      proj.age += dt;
      if (proj.age >= proj.config.lifetime) {
        proj.alive = false;
        continue;
      }

      // Gravity
      proj.velocity[1] -= proj.config.gravity * dt;

      // Homing
      if (proj.config.homing && targets && targets.length > 0) {
        const nearest = this.findNearest(proj, targets);
        if (nearest) {
          const dx = nearest[0] - proj.position[0],
            dy = nearest[1] - proj.position[1],
            dz = nearest[2] - proj.position[2];
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
          const str = proj.config.homingStrength * dt;
          proj.velocity[0] += (dx / dist) * str;
          proj.velocity[1] += (dy / dist) * str;
          proj.velocity[2] += (dz / dist) * str;
          // Re-normalize to speed
          const sp = Math.sqrt(proj.velocity[0] ** 2 + proj.velocity[1] ** 2 + proj.velocity[2] ** 2) || 1;
          proj.velocity[0] = (proj.velocity[0] / sp) * proj.config.speed;
          proj.velocity[1] = (proj.velocity[1] / sp) * proj.config.speed;
          proj.velocity[2] = (proj.velocity[2] / sp) * proj.config.speed;
        }
      }

      // Move
      proj.position[0] += proj.velocity[0] * dt;
      proj.position[1] += proj.velocity[1] * dt;
      proj.position[2] += proj.velocity[2] * dt;

      // Hit detection
      if (targets) {
        for (const t of targets) {
          const dx = t.position[0] - proj.position[0],
            dy = t.position[1] - proj.position[1],
            dz = t.position[2] - proj.position[2];
          if (Math.sqrt(dx * dx + dy * dy + dz * dz) <= t.radius) {
            proj.hitCount++;
            if (this.onImpact) this.onImpact(proj, t.id);
            if (proj.hitCount > proj.config.piercing) {
              proj.alive = false;
              break;
            }
          }
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private findNearest(
    proj: Projectile,
    targets: ProjectileTarget[]
  ): Vector3 | null {
    let best: Vector3 | null = null;
    let bestDist = Infinity;
    for (const t of targets) {
      const d = Math.sqrt(
        (t.position[0] - proj.position[0]) ** 2 +
        (t.position[1] - proj.position[1]) ** 2 +
        (t.position[2] - proj.position[2]) ** 2
      );
      if (d < bestDist) {
        bestDist = d;
        best = t.position;
      }
    }
    return best;
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getProjectile(id: string): Projectile | undefined {
    return this.projectiles.get(id);
  }
  getAliveCount(): number {
    return [...this.projectiles.values()].filter((p) => p.alive).length;
  }
  cleanup(): void {
    for (const [id, p] of this.projectiles) if (!p.alive) this.projectiles.delete(id);
  }
}
