/**
 * TickSimulator — headless discrete-time physics engine for HoloTest
 *
 * Simulates rigid-body physics in a test environment without a graphics runtime.
 * Supports gravity, linear kinematics, and AABB broad-phase collision resolution.
 *
 * @example
 * const floor = SpatialEntity.at('floor', { position: [0, 0, 0], size: [10, 0.1, 10] });
 * const crate = SpatialEntity.at('nft_crate', { position: [0, 5, 0], size: [1, 1, 1] });
 *
 * const sim = new TickSimulator(
 *   [
 *     { entity: floor, isStatic: true },
 *     { entity: crate, velocity: [0, 0, 0] },
 *   ],
 *   { gravity: -9.81, hz: 60 }
 * );
 *
 * sim.forward(120);  // 2 seconds at 60 Hz
 *
 * // crate should have landed on the floor
 * expect(sim.getEntity('nft_crate')!.position.y).toBeCloseTo(0.55, 1);
 */

import { BoundingBox, Vec3 } from '../spatial/BoundingBox';
import { SpatialEntity } from '../spatial/SpatialEntity';

// ── Types ──────────────────────────────────────────────────────────────────

export interface BodyDef {
  entity: SpatialEntity;
  /** Initial velocity in m/s. Defaults to zero. */
  velocity?: [number, number, number] | Vec3;
  /** Mass in kg. Defaults to 1. Static bodies ignore mass. */
  mass?: number;
  /** If true, the body is immovable (floor, walls). Defaults to false. */
  isStatic?: boolean;
  /** Coefficient of restitution (bounciness 0–1). Defaults to 0.3. */
  restitution?: number;
}

export interface TickOptions {
  /** Gravity in m/s² (negative = downward). Defaults to -9.81. */
  gravity?: number;
  /** Simulation frequency in Hz. Defaults to 60. */
  hz?: number;
}

// ── Internal body state ────────────────────────────────────────────────────

interface Body {
  entity: SpatialEntity;
  velocity: Vec3;
  mass: number;
  isStatic: boolean;
  restitution: number;
}

function toVec3(v: [number, number, number] | Vec3 | undefined): Vec3 {
  if (!v) return { x: 0, y: 0, z: 0 };
  if (Array.isArray(v)) return { x: v[0], y: v[1], z: v[2] };
  return v as Vec3;
}

// ── TickSimulator ──────────────────────────────────────────────────────────

export class TickSimulator {
  private readonly bodies: Map<string, Body> = new Map();
  private readonly gravity: Vec3;
  private readonly dt: number;
  private elapsed = 0; // seconds simulated so far

  constructor(defs: BodyDef[], opts?: TickOptions) {
    const g = opts?.gravity ?? -9.81;
    const hz = opts?.hz ?? 60;
    this.gravity = { x: 0, y: g, z: 0 };
    this.dt = 1 / hz;

    for (const def of defs) {
      const id = def.entity.id;
      if (this.bodies.has(id)) {
        throw new Error(`TickSimulator: duplicate entity id "${id}"`);
      }
      this.bodies.set(id, {
        entity: def.entity,
        velocity: toVec3(def.velocity),
        mass: def.mass ?? 1,
        isStatic: def.isStatic ?? false,
        restitution: def.restitution ?? 0.3,
      });
    }
  }

  // ── Simulation ─────────────────────────────────────────────────────────

  /**
   * Advance the simulation by `ticks` discrete steps.
   * Each step: integrate forces → update positions → broad-phase collision resolution.
   */
  forward(ticks: number): void {
    for (let t = 0; t < ticks; t++) {
      this._integrate();
      this._resolveCollisions();
    }
    this.elapsed += ticks * this.dt;
  }

  /** Advance by a time duration (in seconds). Rounds to nearest tick. */
  forwardSeconds(seconds: number): void {
    const ticks = Math.round(seconds / this.dt);
    this.forward(ticks);
  }

  // ── Private ────────────────────────────────────────────────────────────

  private _integrate(): void {
    for (const body of this.bodies.values()) {
      if (body.isStatic) continue;

      // Apply gravity: v += a * dt
      body.velocity.x += this.gravity.x * this.dt;
      body.velocity.y += this.gravity.y * this.dt;
      body.velocity.z += this.gravity.z * this.dt;

      // Integrate position: x += v * dt
      const delta: Vec3 = {
        x: body.velocity.x * this.dt,
        y: body.velocity.y * this.dt,
        z: body.velocity.z * this.dt,
      };
      body.entity.bounds = body.entity.bounds.translate(delta);
    }
  }

  private _resolveCollisions(): void {
    const bodyList = Array.from(this.bodies.values());

    for (let i = 0; i < bodyList.length; i++) {
      for (let j = i + 1; j < bodyList.length; j++) {
        const a = bodyList[i];
        const b = bodyList[j];

        if (!a.entity.bounds.intersects(b.entity.bounds)) continue;
        if (a.isStatic && b.isStatic) continue;

        // Penetration depth — find the minimum separation axis
        const pen = a.entity.bounds.penetrationDepth(b.entity.bounds);
        const depths = [
          { axis: 'x' as const, depth: pen.x },
          { axis: 'y' as const, depth: pen.y },
          { axis: 'z' as const, depth: pen.z },
        ];
        const minAxis = depths.reduce((p, c) => (c.depth < p.depth ? c : p));
        const { axis } = minAxis;

        // Determine separation direction
        const aCenter = a.entity.bounds.center();
        const bCenter = b.entity.bounds.center();
        const sign = aCenter[axis] < bCenter[axis] ? -1 : 1;
        const separation = minAxis.depth * sign;

        const restitution = Math.min(a.restitution, b.restitution);

        if (a.isStatic) {
          // Move b out of a
          b.entity.bounds = b.entity.bounds.translate(
            axis === 'x'
              ? { x: -separation, y: 0, z: 0 }
              : axis === 'y'
                ? { x: 0, y: -separation, z: 0 }
                : { x: 0, y: 0, z: -separation }
          );
          // Reflect b's velocity on collision axis with restitution
          b.velocity[axis] = -b.velocity[axis] * restitution;
        } else if (b.isStatic) {
          // Move a out of b
          a.entity.bounds = a.entity.bounds.translate(
            axis === 'x'
              ? { x: separation, y: 0, z: 0 }
              : axis === 'y'
                ? { x: 0, y: separation, z: 0 }
                : { x: 0, y: 0, z: separation }
          );
          a.velocity[axis] = -a.velocity[axis] * restitution;
        } else {
          // Both dynamic: split the correction and exchange velocity on collision axis
          const halfSep = separation / 2;
          const delta =
            axis === 'x'
              ? { x: halfSep, y: 0, z: 0 }
              : axis === 'y'
                ? { x: 0, y: halfSep, z: 0 }
                : { x: 0, y: 0, z: halfSep };
          const negDelta = {
            x: -delta.x,
            y: -delta.y,
            z: -delta.z,
          };
          a.entity.bounds = a.entity.bounds.translate(delta);
          b.entity.bounds = b.entity.bounds.translate(negDelta);

          // Elastic collision (equal mass simplification: swap velocities)
          const totalMass = a.mass + b.mass;
          const newAVel =
            ((a.velocity[axis] * (a.mass - b.mass) + 2 * b.mass * b.velocity[axis]) / totalMass) *
            restitution;
          const newBVel =
            ((b.velocity[axis] * (b.mass - a.mass) + 2 * a.mass * a.velocity[axis]) / totalMass) *
            restitution;
          a.velocity[axis] = newAVel;
          b.velocity[axis] = newBVel;
        }
      }
    }
  }

  // ── Accessors ──────────────────────────────────────────────────────────

  getEntity(id: string): SpatialEntity | undefined {
    return this.bodies.get(id)?.entity;
  }

  getVelocity(id: string): Vec3 | undefined {
    const body = this.bodies.get(id);
    return body ? { ...body.velocity } : undefined;
  }

  /** Total simulated time in seconds. */
  get elapsedSeconds(): number {
    return this.elapsed;
  }

  /** Snapshot of all entity positions after simulation. */
  snapshot(): Record<string, { position: Vec3; velocity: Vec3 }> {
    const out: Record<string, { position: Vec3; velocity: Vec3 }> = {};
    for (const [id, body] of this.bodies) {
      out[id] = {
        position: { ...body.entity.position },
        velocity: { ...body.velocity },
      };
    }
    return out;
  }
}
