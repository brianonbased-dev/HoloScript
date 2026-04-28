type Vec3 = [number, number, number];
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
  position: Vec3;
  velocity: Vec3;
  config: ProjectileConfig;
  age: number;
  hitCount: number;
  alive: boolean;
  ownerId: string;
}

export type ImpactCallback = (projectile: Projectile, targetId: string) => void;

export interface ProjectileTarget {
  id: string;
  position?: Vec3;
  x?: number;
  y?: number;
  z?: number;
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
      x,
      y,
      z,
      vx: (dx / len) * config.speed,
      vy: (dy / len) * config.speed,
      vz: (dz / len) * config.speed,
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
      proj.vy -= proj.config.gravity * dt;

      // Homing
      if (proj.config.homing && targets && targets.length > 0) {
        const nearest = this.findNearest(proj, targets);
        if (nearest) {
          const dx = nearest[0] - proj.x,
            dy = nearest[1] - proj.y,
            dz = nearest[2] - proj.z;
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
          const str = proj.config.homingStrength * dt;
          proj.vx += (dx / dist) * str;
          proj.vy += (dy / dist) * str;
          proj.vz += (dz / dist) * str;
          // Re-normalize to speed
          const sp = Math.sqrt(proj.vx ** 2 + proj.vy ** 2 + proj.vz ** 2) || 1;
          proj.vx = (proj.vx / sp) * proj.config.speed;
          proj.vy = (proj.vy / sp) * proj.config.speed;
          proj.vz = (proj.vz / sp) * proj.config.speed;
        }
      }

      // Move
      proj.x += proj.vx * dt;
      proj.y += proj.vy * dt;
      proj.z += proj.vz * dt;
      proj.position[0] = proj.x;
      proj.position[1] = proj.y;
      proj.position[2] = proj.z;
      proj.velocity[0] = proj.vx;
      proj.velocity[1] = proj.vy;
      proj.velocity[2] = proj.vz;

      // Hit detection
      if (targets) {
        for (const t of targets) {
          const tx = t.position ? t.position[0] : (t.x ?? 0);
          const ty = t.position ? t.position[1] : (t.y ?? 0);
          const tz = t.position ? t.position[2] : (t.z ?? 0);
          const dx = tx - proj.x,
            dy = ty - proj.y,
            dz = tz - proj.z;
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
  ): Vec3 | null {
    let best: Vec3 | null = null;
    let bestDist = Infinity;
    for (const t of targets) {
      const tx = t.position ? t.position[0] : (t.x ?? 0);
      const ty = t.position ? t.position[1] : (t.y ?? 0);
      const tz = t.position ? t.position[2] : (t.z ?? 0);
      const d = Math.sqrt(
        (tx - proj.x) ** 2 +
        (ty - proj.y) ** 2 +
        (tz - proj.z) ** 2
      );
      if (d < bestDist) {
        bestDist = d;
        best = [tx, ty, tz] as Vec3;
      }
    }
    return best;
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getProjectile(id: string): Projectile | undefined {
    const p = this.projectiles.get(id);
    if (p) {
      (p as unknown as Record<number, number>)[0] = p.x;
      (p as unknown as Record<number, number>)[1] = p.y;
      (p as unknown as Record<number, number>)[2] = p.z;
    }
    return p;
  }
  getAliveCount(): number {
    return [...this.projectiles.values()].filter((p) => p.alive).length;
  }
  cleanup(): void {
    for (const [id, p] of this.projectiles) if (!p.alive) this.projectiles.delete(id);
  }
}
