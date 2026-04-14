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

export type Vec3 = [number, number, number];

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
  private gravity: Vec3 = [0, -9.81, 0];
  private collisionCallbacks: CollisionCallback[] = [];
  private broadphaseGrid: Map<string, string[]> = new Map();
  private cellSize = 10;

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  setGravity(x: number, y: number, z: number): void {
    this.gravity = [x, y, z];
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

      body.velocity[0] += this.gravity[0] * dt;
      body.velocity[1] += this.gravity[1] * dt;
      body.velocity[2] += this.gravity[2] * dt;

      body.position[0] += body.velocity[0] * dt;
      body.position[1] += body.velocity[1] * dt;
      body.position[2] += body.velocity[2] * dt;

      body.rotation[0] += body.angularVelocity[0] * dt;
      body.rotation[1] += body.angularVelocity[1] * dt;
      body.rotation[2] += body.angularVelocity[2] * dt;
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
      if (body.position[1] < 0) {
        body.position[1] = 0;
        body.velocity[1] = -body.velocity[1] * body.restitution;
        // Friction
        body.velocity[0] *= 1 - body.friction * dt;
        body.velocity[2] *= 1 - body.friction * dt;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Collision Resolution
  // ---------------------------------------------------------------------------

  private resolveCollision(a: PhysicsBodyState, b: PhysicsBodyState, _dt: number): void {
    const dx = b.position[0] - a.position[0];
    const dy = b.position[1] - a.position[1];
    const dz = b.position[2] - a.position[2];
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const minDist = 1.0; // Default sphere radius

    if (dist >= minDist || dist < 1e-6) return;

    // Normal
    const nx = dx / dist,
      ny = dy / dist,
      nz = dz / dist;

    // Relative velocity along normal
    const dvx = a.velocity[0] - b.velocity[0];
    const dvy = a.velocity[1] - b.velocity[1];
    const dvz = a.velocity[2] - b.velocity[2];
    const relVel = dvx * nx + dvy * ny + dvz * nz;

    if (relVel > 0) return; // Separating

    const restitution = Math.min(a.restitution, b.restitution);
    const totalMass = (a.isStatic ? 0 : a.mass) + (b.isStatic ? 0 : b.mass);
    if (totalMass === 0) return;

    const impulse = (-(1 + restitution) * relVel) / totalMass;

    if (!a.isStatic) {
      a.velocity[0] -= (impulse * nx) / a.mass;
      a.velocity[1] -= (impulse * ny) / a.mass;
      a.velocity[2] -= (impulse * nz) / a.mass;
    }
    if (!b.isStatic) {
      b.velocity[0] += (impulse * nx) / b.mass;
      b.velocity[1] += (impulse * ny) / b.mass;
      b.velocity[2] += (impulse * nz) / b.mass;
    }

    // Positional correction (push apart)
    const correction = (minDist - dist) * 0.5;
    if (!a.isStatic) {
      a.position[0] -= nx * correction;
      a.position[1] -= ny * correction;
      a.position[2] -= nz * correction;
    }
    if (!b.isStatic) {
      b.position[0] += nx * correction;
      b.position[1] += ny * correction;
      b.position[2] += nz * correction;
    }

    // Fire collision event
    const event: CollisionEvent = {
      bodyA: a.id,
      bodyB: b.id,
      contactPoint: [
        (a.position[0] + b.position[0]) / 2,
        (a.position[1] + b.position[1]) / 2,
        (a.position[2] + b.position[2]) / 2,
      ],
      normal: [nx, ny, nz],
      impulse: Math.abs(impulse),
    };
    for (const cb of this.collisionCallbacks) cb(event);
  }

  private hashPosition(pos: Vec3): string {
    const cx = Math.floor(pos[0] / this.cellSize);
    const cy = Math.floor(pos[1] / this.cellSize);
    const cz = Math.floor(pos[2] / this.cellSize);
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
      const oc = [
        origin[0] - body.position[0],
        origin[1] - body.position[1],
        origin[2] - body.position[2],
      ];
      const b = oc[0] * direction[0] + oc[1] * direction[1] + oc[2] * direction[2];
      const c = oc[0] * oc[0] + oc[1] * oc[1] + oc[2] * oc[2] - 0.5 * 0.5; // radius 0.5
      const discriminant = b * b - c;

      if (discriminant < 0) continue;

      const t = -b - Math.sqrt(discriminant);
      if (t < 0 || t > maxDist) continue;

      if (!closest || t < closest.distance) {
        closest = {
          bodyId: body.id,
          distance: t,
          point: [
            origin[0] + direction[0] * t,
            origin[1] + direction[1] * t,
            origin[2] + direction[2] * t,
          ],
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
