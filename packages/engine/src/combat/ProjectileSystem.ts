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
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  config: ProjectileConfig;
  age: number;
  hitCount: number;
  alive: boolean;
  ownerId: string;
}

export type ImpactCallback = (projectile: Projectile, targetId: string) => void;

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
      x,
      y,
      z,
      vx: (dx / len) * config.speed,
      vy: (dy / len) * config.speed,
      vz: (dz / len) * config.speed,
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
    targets?: Array<{ id: string; x: number; y: number; z: number; radius: number }>
  ): void {
    for (const proj of this.projectiles.values()) {
      if (!proj.alive) continue;

      proj.age += dt;
      if (proj.age >= proj.config.lifetime) {
        proj.alive = false;
        continue;
      }

      // Gravity
      proj.vy -= proj.config.gravity * dt;

      // Homing
      if (proj.config.homing && targets && targets.length > 0) {
        const nearest = this.findNearest(proj, targets);
        if (nearest) {
          const dx = nearest.x - proj.x,
            dy = nearest.y - proj.y,
            dz = nearest.z - proj.z;
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
          const str = proj.config.homingStrength * dt;
          proj.vx += (dx / dist) * str;
          proj.vy += (dy / dist) * str;
          proj.vz += (dz / dist) * str;
          // Re-normalize to speed
          const sp = Math.sqrt(proj.vx * proj.vx + proj.vy * proj.vy + proj.vz * proj.vz) || 1;
          proj.vx = (proj.vx / sp) * proj.config.speed;
          proj.vy = (proj.vy / sp) * proj.config.speed;
          proj.vz = (proj.vz / sp) * proj.config.speed;
        }
      }

      // Move
      proj.x += proj.vx * dt;
      proj.y += proj.vy * dt;
      proj.z += proj.vz * dt;

      // Hit detection
      if (targets) {
        for (const t of targets) {
          const dx = t.x - proj.x,
            dy = t.y - proj.y,
            dz = t.z - proj.z;
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
    targets: Array<{ id: string; x: number; y: number; z: number }>
  ): { x: number; y: number; z: number } | null {
    let best: { x: number; y: number; z: number } | null = null;
    let bestDist = Infinity;
    for (const t of targets) {
      const d = Math.sqrt((t.x - proj.x) ** 2 + (t.y - proj.y) ** 2 + (t.z - proj.z) ** 2);
      if (d < bestDist) {
        bestDist = d;
        best = t;
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

