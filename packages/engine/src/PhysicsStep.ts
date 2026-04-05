/**
 * PhysicsStep.ts
 *
 * Fixed-timestep physics wrapper that integrates with the SpatialEngine.
 * Implements the EngineSystem interface, running PhysicsWorld at a
 * deterministic tick rate and syncing body transforms back to SceneNodes.
 *
 * @module engine
 */

import type { EngineSystem } from './SpatialEngine';

// =============================================================================
// TYPES
// =============================================================================

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface PhysicsBodyState {
  id: string;
  position: Vec3;
  rotation: Vec3;
  velocity: Vec3;
  angularVelocity: Vec3;
  mass: number;
  isStatic: boolean;
  restitution: number;
  friction: number;
}

export interface CollisionEvent {
  bodyA: string;
  bodyB: string;
  contactPoint: Vec3;
  normal: Vec3;
  impulse: number;
}

export type CollisionCallback = (event: CollisionEvent) => void;

// =============================================================================
// PHYSICS STEP SYSTEM
// =============================================================================

export class PhysicsStep implements EngineSystem {
  readonly name = 'PhysicsStep';
  readonly priority = 100; // After input (0), before animation (200)

  private bodies: Map<string, PhysicsBodyState> = new Map();
  private gravity: Vec3 = { x: 0, y: -9.81, z: 0 };
  private collisionCallbacks: CollisionCallback[] = [];
  private broadphaseGrid: Map<string, string[]> = new Map();
  private cellSize = 10;

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  setGravity(x: number, y: number, z: number): void {
    this.gravity = { x, y, z };
  }

  setCellSize(size: number): void {
    this.cellSize = size;
  }

  onCollision(callback: CollisionCallback): void {
    this.collisionCallbacks.push(callback);
  }

  // ---------------------------------------------------------------------------
  // Body Management
  // ---------------------------------------------------------------------------

  addBody(body: PhysicsBodyState): void {
    this.bodies.set(body.id, { ...body });
  }

  removeBody(id: string): boolean {
    return this.bodies.delete(id);
  }

  getBody(id: string): PhysicsBodyState | undefined {
    return this.bodies.get(id);
  }

  getAllBodies(): PhysicsBodyState[] {
    return Array.from(this.bodies.values());
  }

  // ---------------------------------------------------------------------------
  // EngineSystem — fixedUpdate (deterministic tick)
  // ---------------------------------------------------------------------------

  fixedUpdate(dt: number): void {
    // 1. Apply gravity and integrate velocities (semi-implicit Euler)
    for (const body of this.bodies.values()) {
      if (body.isStatic) continue;

      body.velocity.x += this.gravity.x * dt;
      body.velocity.y += this.gravity.y * dt;
      body.velocity.z += this.gravity.z * dt;

      body.position.x += body.velocity.x * dt;
      body.position.y += body.velocity.y * dt;
      body.position.z += body.velocity.z * dt;

      body.rotation.x += body.angularVelocity.x * dt;
      body.rotation.y += body.angularVelocity.y * dt;
      body.rotation.z += body.angularVelocity.z * dt;
    }

    // 2. Broadphase collision detection (spatial hashing)
    this.broadphaseGrid.clear();
    for (const body of this.bodies.values()) {
      const key = this.hashPosition(body.position);
      if (!this.broadphaseGrid.has(key)) {
        this.broadphaseGrid.set(key, []);
      }
      this.broadphaseGrid.get(key)!.push(body.id);
    }

    // 3. Narrowphase: sphere-sphere collisions within same cell
    for (const ids of this.broadphaseGrid.values()) {
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const a = this.bodies.get(ids[i])!;
          const b = this.bodies.get(ids[j])!;
          this.resolveCollision(a, b, dt);
        }
      }
    }

    // 4. Ground plane collision (y = 0)
    for (const body of this.bodies.values()) {
      if (body.isStatic) continue;
      if (body.position.y < 0) {
        body.position.y = 0;
        body.velocity.y = -body.velocity.y * body.restitution;
        // Friction
        body.velocity.x *= 1 - body.friction * dt;
        body.velocity.z *= 1 - body.friction * dt;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Collision Resolution
  // ---------------------------------------------------------------------------

  private resolveCollision(a: PhysicsBodyState, b: PhysicsBodyState, _dt: number): void {
    const dx = b.position.x - a.position.x;
    const dy = b.position.y - a.position.y;
    const dz = b.position.z - a.position.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const minDist = 1.0; // Default sphere radius

    if (dist >= minDist || dist < 1e-6) return;

    // Normal
    const nx = dx / dist,
      ny = dy / dist,
      nz = dz / dist;

    // Relative velocity along normal
    const dvx = a.velocity.x - b.velocity.x;
    const dvy = a.velocity.y - b.velocity.y;
    const dvz = a.velocity.z - b.velocity.z;
    const relVel = dvx * nx + dvy * ny + dvz * nz;

    if (relVel > 0) return; // Separating

    const restitution = Math.min(a.restitution, b.restitution);
    const totalMass = (a.isStatic ? 0 : a.mass) + (b.isStatic ? 0 : b.mass);
    if (totalMass === 0) return;

    const impulse = (-(1 + restitution) * relVel) / totalMass;

    if (!a.isStatic) {
      a.velocity.x -= (impulse * nx) / a.mass;
      a.velocity.y -= (impulse * ny) / a.mass;
      a.velocity.z -= (impulse * nz) / a.mass;
    }
    if (!b.isStatic) {
      b.velocity.x += (impulse * nx) / b.mass;
      b.velocity.y += (impulse * ny) / b.mass;
      b.velocity.z += (impulse * nz) / b.mass;
    }

    // Positional correction (push apart)
    const correction = (minDist - dist) * 0.5;
    if (!a.isStatic) {
      a.position.x -= nx * correction;
      a.position.y -= ny * correction;
      a.position.z -= nz * correction;
    }
    if (!b.isStatic) {
      b.position.x += nx * correction;
      b.position.y += ny * correction;
      b.position.z += nz * correction;
    }

    // Fire collision event
    const event: CollisionEvent = {
      bodyA: a.id,
      bodyB: b.id,
      contactPoint: {
        x: (a.position.x + b.position.x) / 2,
        y: (a.position.y + b.position.y) / 2,
        z: (a.position.z + b.position.z) / 2,
      },
      normal: { x: nx, y: ny, z: nz },
      impulse: Math.abs(impulse),
    };
    for (const cb of this.collisionCallbacks) cb(event);
  }

  private hashPosition(pos: Vec3): string {
    const cx = Math.floor(pos.x / this.cellSize);
    const cy = Math.floor(pos.y / this.cellSize);
    const cz = Math.floor(pos.z / this.cellSize);
    return `${cx},${cy},${cz}`;
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  /** Raycast against all bodies, returns first hit. */
  raycast(
    origin: Vec3,
    direction: Vec3,
    maxDist: number
  ): { bodyId: string; distance: number; point: Vec3 } | null {
    let closest: { bodyId: string; distance: number; point: Vec3 } | null = null;

    for (const body of this.bodies.values()) {
      const oc = {
        x: origin.x - body.position.x,
        y: origin.y - body.position.y,
        z: origin.z - body.position.z,
      };
      const b = oc.x * direction.x + oc.y * direction.y + oc.z * direction.z;
      const c = oc.x * oc.x + oc.y * oc.y + oc.z * oc.z - 0.5 * 0.5; // radius 0.5
      const discriminant = b * b - c;

      if (discriminant < 0) continue;

      const t = -b - Math.sqrt(discriminant);
      if (t < 0 || t > maxDist) continue;

      if (!closest || t < closest.distance) {
        closest = {
          bodyId: body.id,
          distance: t,
          point: {
            x: origin.x + direction.x * t,
            y: origin.y + direction.y * t,
            z: origin.z + direction.z * t,
          },
        };
      }
    }
    return closest;
  }

  /** Get count of active (non-static) bodies. */
  getActiveBodyCount(): number {
    let count = 0;
    for (const body of this.bodies.values()) {
      if (!body.isStatic) count++;
    }
    return count;
  }

  destroy(): void {
    this.bodies.clear();
    this.collisionCallbacks = [];
    this.broadphaseGrid.clear();
  }
}

