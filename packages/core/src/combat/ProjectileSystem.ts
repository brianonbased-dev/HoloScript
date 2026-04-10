/**
 * ProjectileSystem — spawn, move, expire, gravity, homing,
 * piercing, impact detection.
 */

export interface ProjectileConfig {
  speed: number;
  lifetime: number;
  damage: number;
  homing: boolean;
  homingStrength: number;
  piercing: number;
  gravity: number;
}

export interface Projectile {
  id: string;
  ownerId: string;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  config: ProjectileConfig;
  alive: boolean;
  age: number;
  hitCount: number;
  hitTargets: Set<string>;
}

export interface Target {
  id: string;
  x: number;
  y: number;
  z: number;
  radius: number;
}

type ImpactCallback = (projectile: Projectile, targetId: string) => void;

let nextId = 0;

export class ProjectileSystem {
  private projectiles: Map<string, Projectile> = new Map();
  private impactCallback: ImpactCallback | null = null;

  spawn(
    ownerId: string,
    x: number,
    y: number,
    z: number,
    dirX: number,
    dirY: number,
    dirZ: number,
    config: ProjectileConfig,
  ): string {
    const id = `proj_${nextId++}`;

    // Normalize direction
    const len = Math.sqrt(dirX * dirX + dirY * dirY + dirZ * dirZ);
    let nx = dirX;
    let ny = dirY;
    let nz = dirZ;
    if (len > 0) {
      nx /= len;
      ny /= len;
      nz /= len;
    }

    const proj: Projectile = {
      id,
      ownerId,
      x,
      y,
      z,
      vx: nx * config.speed,
      vy: ny * config.speed,
      vz: nz * config.speed,
      config: { ...config },
      alive: true,
      age: 0,
      hitCount: 0,
      hitTargets: new Set(),
    };

    this.projectiles.set(id, proj);
    return id;
  }

  setImpactCallback(cb: ImpactCallback): void {
    this.impactCallback = cb;
  }

  getProjectile(id: string): Projectile | undefined {
    return this.projectiles.get(id);
  }

  getAliveCount(): number {
    let count = 0;
    for (const p of this.projectiles.values()) {
      if (p.alive) count++;
    }
    return count;
  }

  update(dt: number, targets?: Target[]): void {
    for (const p of this.projectiles.values()) {
      if (!p.alive) continue;

      // Homing
      if (p.config.homing && targets && targets.length > 0) {
        let nearest: Target | null = null;
        let nearestDist = Infinity;
        for (const t of targets) {
          const d = Math.sqrt((t.x - p.x) ** 2 + (t.y - p.y) ** 2 + (t.z - p.z) ** 2);
          if (d < nearestDist) {
            nearestDist = d;
            nearest = t;
          }
        }
        if (nearest) {
          const dx = nearest.x - p.x;
          const dy = nearest.y - p.y;
          const dz = nearest.z - p.z;
          const dLen = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (dLen > 0) {
            const strength = p.config.homingStrength * dt;
            p.vx += (dx / dLen) * strength;
            p.vy += (dy / dLen) * strength;
            p.vz += (dz / dLen) * strength;
          }
        }
      }

      // Gravity (pulls down on Y axis)
      if (p.config.gravity) {
        p.vy -= p.config.gravity * dt;
      }

      // Movement
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;

      // Lifetime
      p.age += dt;
      if (p.age >= p.config.lifetime) {
        p.alive = false;
        continue;
      }

      // Impact detection
      if (targets) {
        for (const t of targets) {
          if (p.hitTargets.has(t.id)) continue;
          const d = Math.sqrt((t.x - p.x) ** 2 + (t.y - p.y) ** 2 + (t.z - p.z) ** 2);
          if (d <= t.radius) {
            p.hitCount++;
            p.hitTargets.add(t.id);
            if (this.impactCallback) {
              this.impactCallback(p, t.id);
            }
            if (p.hitCount > p.config.piercing) {
              p.alive = false;
              break;
            }
          }
        }
      }
    }
  }

  cleanup(): void {
    for (const [id, p] of this.projectiles.entries()) {
      if (!p.alive) {
        this.projectiles.delete(id);
      }
    }
  }
}
