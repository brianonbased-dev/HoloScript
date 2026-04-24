/**
 * ParticleCollision.ts
 *
 * Particle collision: plane/sphere bounce, friction,
 * lifetime reduction on impact, and sub-emitter spawning.
 *
 * @module particles
 */

// =============================================================================
// TYPES
// =============================================================================

export interface CollisionPlane {
  id: string;
  nx: number;
  ny: number;
  nz: number;
  d: number; // Plane equation
  bounce: number; // 0-1 restitution
  friction: number; // 0-1 velocity damping on contact
  lifetimeLoss: number; // Fraction of lifetime lost per hit
}

export interface CollisionSphere {
  id: string;
  cx: number;
  cy: number;
  cz: number;
  radius: number;
  bounce: number;
  friction: number;
}

export interface CollidableParticle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  lifetime: number;
  alive: boolean;
  [index: number]: number | boolean;
}

export type SubEmitCallback = (x: number, y: number, z: number, count: number) => void;

// =============================================================================
// PARTICLE COLLISION SYSTEM
// =============================================================================

export class ParticleCollisionSystem {
  private syncParticleCompat(p: CollidableParticle): void {
    (p as CollidableParticle & Record<number, number | boolean>)[0] = p.x;
    (p as CollidableParticle & Record<number, number | boolean>)[1] = p.y;
    (p as CollidableParticle & Record<number, number | boolean>)[2] = p.z;
  }

  private planes: CollisionPlane[] = [];
  private spheres: CollisionSphere[] = [];
  private subEmitCallback: SubEmitCallback | null = null;
  private subEmitCount = 3;
  private collisionCount = 0;

  // ---------------------------------------------------------------------------
  // Collider Management
  // ---------------------------------------------------------------------------

  addPlane(plane: CollisionPlane): void {
    // Enforce unit normal so that dist = n·p + d is in world units
    const len = Math.sqrt(plane.nx * plane.nx + plane.ny * plane.ny + plane.nz * plane.nz);
    if (len > 1e-10 && Math.abs(len - 1) > 1e-6) {
      const inv = 1 / len;
      this.planes.push({ ...plane, nx: plane.nx * inv, ny: plane.ny * inv, nz: plane.nz * inv, d: plane.d * inv });
    } else {
      this.planes.push(plane);
    }
  }
  addSphere(sphere: CollisionSphere): void {
    this.spheres.push(sphere);
  }
  onSubEmit(callback: SubEmitCallback, count = 3): void {
    this.subEmitCallback = callback;
    this.subEmitCount = count;
  }

  // ---------------------------------------------------------------------------
  // Collision Detection & Response
  // ---------------------------------------------------------------------------

  resolve(particles: CollidableParticle[]): void {
    this.collisionCount = 0;

    for (const p of particles) {
      if (!p.alive) continue;

      // Plane collisions
      for (const plane of this.planes) {
        const dist = plane.nx * p.x + plane.ny * p.y + plane.nz * p.z + plane.d;
        if (dist < 0) {
          // Push out
          p.x -= plane.nx * dist;
          p.y -= plane.ny * dist;
          p.z -= plane.nz * dist;

          // Reflect velocity
          const vDotN = p.vx * plane.nx + p.vy * plane.ny + p.vz * plane.nz;
          p.vx = (p.vx - 2 * vDotN * plane.nx) * plane.bounce;
          p.vy = (p.vy - 2 * vDotN * plane.ny) * plane.bounce;
          p.vz = (p.vz - 2 * vDotN * plane.nz) * plane.bounce;

          // Friction (tangential damping)
          p.vx *= 1 - plane.friction;
          p.vy *= 1 - plane.friction;
          p.vz *= 1 - plane.friction;

          // Lifetime reduction
          p.lifetime -= plane.lifetimeLoss;
          if (p.lifetime <= 0) p.alive = false;

          this.syncParticleCompat(p);

          this.collisionCount++;
          if (this.subEmitCallback) this.subEmitCallback(p.x, p.y, p.z, this.subEmitCount);
        }
      }

      // Sphere collisions
      for (const sphere of this.spheres) {
        const dx = p.x - sphere.cx,
          dy = p.y - sphere.cy,
          dz = p.z - sphere.cz;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (dist < sphere.radius && dist > 0) {
          const nx = dx / dist,
            ny = dy / dist,
            nz = dz / dist;

          // Push out
          const pen = sphere.radius - dist;
          p.x += nx * pen;
          p.y += ny * pen;
          p.z += nz * pen;

          // Reflect
          const vDotN = p.vx * nx + p.vy * ny + p.vz * nz;
          p.vx = (p.vx - 2 * vDotN * nx) * sphere.bounce;
          p.vy = (p.vy - 2 * vDotN * ny) * sphere.bounce;
          p.vz = (p.vz - 2 * vDotN * nz) * sphere.bounce;

          // Friction
          p.vx *= 1 - sphere.friction;
          p.vy *= 1 - sphere.friction;
          p.vz *= 1 - sphere.friction;

          this.syncParticleCompat(p);

          this.collisionCount++;
        }
      }
    }
  }

  getCollisionCount(): number {
    return this.collisionCount;
  }
}
