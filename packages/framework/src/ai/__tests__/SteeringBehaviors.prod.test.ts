/**
 * SteeringBehaviors — Production Test Suite
 *
 * All methods are static. Vec3 helpers and separation/alignment/cohesion
 * are private, so we test them indirectly through the public API:
 * seek, flee, arrive, wander, flock, obstacleAvoidance, applyForce.
 */
import { describe, it, expect } from 'vitest';
import { SteeringBehaviors, type SteeringAgent } from '../SteeringBehaviors';

function agent(px = 0, py = 0, pz = 0, vx = 0, vy = 0, vz = 0): SteeringAgent {
  return {
    position: [px, py, pz],
    velocity: { x: vx, y: vy, z: vz },
    maxSpeed: 10,
    maxForce: 5,
    mass: 1,
  };
}

function len(v: { x: number; y: number; z: number }): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

describe('SteeringBehaviors — Production', () => {
  // ─── Seek ─────────────────────────────────────────────────────────
  it('seek returns force toward target', () => {
    const force = SteeringBehaviors.seek(agent(), { x: 10, y: 0, z: 0 });
    expect(force.x).toBeGreaterThan(0);
  });

  it('seek force is capped by maxForce', () => {
    const force = SteeringBehaviors.seek(agent(), { x: 1000, y: 0, z: 0 });
    expect(len(force)).toBeLessThanOrEqual(5.01);
  });

  // ─── Flee ─────────────────────────────────────────────────────────
  it('flee returns force away from threat', () => {
    const force = SteeringBehaviors.flee(agent(), { x: 10, y: 0, z: 0 });
    expect(force.x).toBeLessThan(0);
  });

  // ─── Arrive ───────────────────────────────────────────────────────
  it('arrive force decreases near target', () => {
    const farForce = SteeringBehaviors.arrive(agent(0, 0, 0), { x: 10, y: 0, z: 0 }, 5);
    const nearForce = SteeringBehaviors.arrive(agent(9, 0, 0), { x: 10, y: 0, z: 0 }, 5);
    expect(len(nearForce)).toBeLessThanOrEqual(len(farForce) + 0.01);
  });

  it('arrive returns zero at target', () => {
    const force = SteeringBehaviors.arrive(agent(10, 0, 0), { x: 10, y: 0, z: 0 }, 5);
    expect(len(force)).toBeCloseTo(0, 2);
  });

  // ─── Wander ───────────────────────────────────────────────────────
  it('wander returns force and new angle', () => {
    const result = SteeringBehaviors.wander(agent(0, 0, 0, 1, 0, 0), 5, 2, 0.5, 0);
    expect(result.force).toBeDefined();
    expect(typeof result.newAngle).toBe('number');
  });

  // ─── Flock ────────────────────────────────────────────────────────
  it('flock combines separation/alignment/cohesion', () => {
    const a = agent(0, 0, 0, 1, 0, 0);
    const neighbors = [agent(2, 0, 0, 1, 0, 0), agent(-2, 0, 0, 1, 0, 0)];
    const config = {
      separationWeight: 1,
      alignmentWeight: 1,
      cohesionWeight: 1,
      neighborRadius: 10,
    };
    const force = SteeringBehaviors.flock(a, neighbors, config);
    expect(typeof force.x).toBe('number');
    expect(typeof force.y).toBe('number');
    expect(typeof force.z).toBe('number');
  });

  it('flock returns zero with no neighbors in range', () => {
    const a = agent(0, 0, 0);
    const neighbors = [agent(1000, 0, 0)]; // way out of range
    const config = {
      separationWeight: 1,
      alignmentWeight: 1,
      cohesionWeight: 1,
      neighborRadius: 5,
    };
    const force = SteeringBehaviors.flock(a, neighbors, config);
    expect(force.x).toBe(0);
    expect(force.y).toBe(0);
    expect(force.z).toBe(0);
  });

  it('flock excludes self from neighbors', () => {
    const a = agent(0, 0, 0);
    const config = {
      separationWeight: 1,
      alignmentWeight: 1,
      cohesionWeight: 1,
      neighborRadius: 10,
    };
    const force = SteeringBehaviors.flock(a, [a], config); // self is neighbor
    expect(force.x).toBe(0); // should be zero since self filtered out
  });

  // ─── Obstacle Avoidance ───────────────────────────────────────────
  it('obstacleAvoidance returns zero when no obstacles near', () => {
    const a = agent(0, 0, 0, 1, 0, 0);
    const obstacles = [{ center: { x: 100, y: 0, z: 0 }, radius: 1 }];
    const force = SteeringBehaviors.obstacleAvoidance(a, obstacles, 5);
    expect(len(force)).toBe(0);
  });

  it('obstacleAvoidance returns force near obstacle', () => {
    const a = agent(0, 0, 0, 1, 0, 0);
    const obstacles = [{ center: { x: 3, y: 0, z: 0 }, radius: 10 }]; // huge obstacle right ahead
    const force = SteeringBehaviors.obstacleAvoidance(a, obstacles, 5);
    expect(len(force)).toBeGreaterThan(0);
  });

  // ─── Apply Force ──────────────────────────────────────────────────
  it('applyForce updates position and velocity', () => {
    const a = agent(0, 0, 0, 0, 0, 0);
    SteeringBehaviors.applyForce(a, { x: 10, y: 0, z: 0 }, 1);
    expect(a.velocity.x).toBeGreaterThan(0);
    expect(a.position.x).toBeGreaterThan(0);
  });

  it('applyForce caps velocity to maxSpeed', () => {
    const a = agent(0, 0, 0, 0, 0, 0);
    SteeringBehaviors.applyForce(a, { x: 1000, y: 0, z: 0 }, 1);
    expect(len(a.velocity)).toBeLessThanOrEqual(a.maxSpeed + 0.01);
  });
});
