import { describe, it, expect } from 'vitest';
import { SteeringBehaviors, type SteeringAgent, type FlockConfig } from '../SteeringBehaviors';

type Vec3 = { x: number; y: number; z: number };

function agent(pos: Vec3, vel: Vec3 = { x: 0, y: 0, z: 0 }): SteeringAgent {
  return { position: pos, velocity: vel, maxSpeed: 10, maxForce: 5, mass: 1 };
}

function vecLen(v: Vec3): number { return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z); }

describe('SteeringBehaviors', () => {
  // ---------------------------------------------------------------------------
  // Seek
  // ---------------------------------------------------------------------------

  it('seek produces force toward target', () => {
    const a = agent({ x: 0, y: 0, z: 0 });
    const force = SteeringBehaviors.seek(a, { x: 10, y: 0, z: 0 });
    expect(force.x).toBeGreaterThan(0);
    expect(Math.abs(force.y)).toBeLessThan(0.001);
  });

  it('seek returns zero-ish force when at target', () => {
    const a = agent({ x: 5, y: 5, z: 0 });
    const force = SteeringBehaviors.seek(a, { x: 5, y: 5, z: 0 });
    expect(vecLen(force)).toBeLessThan(0.01);
  });

  // ---------------------------------------------------------------------------
  // Flee
  // ---------------------------------------------------------------------------

  it('flee produces force away from threat', () => {
    const a = agent({ x: 0, y: 0, z: 0 });
    const force = SteeringBehaviors.flee(a, { x: 10, y: 0, z: 0 });
    expect(force.x).toBeLessThan(0);
  });

  // ---------------------------------------------------------------------------
  // Arrive
  // ---------------------------------------------------------------------------

  it('arrive slows down within slowRadius', () => {
    const a = agent({ x: 0, y: 0, z: 0 });
    const forceFar = SteeringBehaviors.arrive(a, { x: 100, y: 0, z: 0 }, 20);
    const aClose = agent({ x: 95, y: 0, z: 0 });
    const forceClose = SteeringBehaviors.arrive(aClose, { x: 100, y: 0, z: 0 }, 20);
    expect(vecLen(forceClose)).toBeLessThanOrEqual(vecLen(forceFar) + 0.01);
  });

  it('arrive returns zero when at target', () => {
    const a = agent({ x: 5, y: 0, z: 0 });
    const force = SteeringBehaviors.arrive(a, { x: 5, y: 0, z: 0 }, 10);
    expect(vecLen(force)).toBeLessThan(0.01);
  });

  // ---------------------------------------------------------------------------
  // Wander
  // ---------------------------------------------------------------------------

  it('wander returns a force and new angle', () => {
    const a = agent({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 });
    const result = SteeringBehaviors.wander(a, 2, 1, 0.3, 0);
    expect(result.force).toBeDefined();
    expect(typeof result.newAngle).toBe('number');
    expect(Number.isFinite(result.force.x)).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Flock
  // ---------------------------------------------------------------------------

  it('flock returns a combined steering force', () => {
    const a = agent({ x: 0, y: 0, z: 0 });
    const neighbors = [
      agent({ x: 2, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }),
      agent({ x: -2, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }),
    ];
    const config: FlockConfig = {
      separationWeight: 1, alignmentWeight: 1, cohesionWeight: 1, neighborRadius: 10,
    };
    const force = SteeringBehaviors.flock(a, neighbors, config);
    expect(Number.isFinite(force.x)).toBe(true);
    expect(Number.isFinite(force.y)).toBe(true);
  });

  it('flock returns zero with no neighbors in range', () => {
    const a = agent({ x: 0, y: 0, z: 0 });
    const neighbors = [agent({ x: 500, y: 500, z: 0 })]; // far away
    const config: FlockConfig = {
      separationWeight: 1, alignmentWeight: 1, cohesionWeight: 1, neighborRadius: 5,
    };
    const force = SteeringBehaviors.flock(a, neighbors, config);
    expect(force).toEqual({ x: 0, y: 0, z: 0 });
  });

  // ---------------------------------------------------------------------------
  // Obstacle Avoidance
  // ---------------------------------------------------------------------------

  it('obstacleAvoidance returns force when obstacle ahead', () => {
    const a = agent({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 });
    const obstacles = [{ center: { x: 3, y: 0, z: 0 }, radius: 1 }];
    const force = SteeringBehaviors.obstacleAvoidance(a, obstacles, 5);
    expect(Number.isFinite(force.x)).toBe(true);
  });

  it('obstacleAvoidance returns zero with no obstacles', () => {
    const a = agent({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 });
    const force = SteeringBehaviors.obstacleAvoidance(a, [], 5);
    expect(force).toEqual({ x: 0, y: 0, z: 0 });
  });

  // ---------------------------------------------------------------------------
  // Apply Force
  // ---------------------------------------------------------------------------

  it('applyForce updates agent position and velocity', () => {
    const a = agent({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });
    SteeringBehaviors.applyForce(a, { x: 5, y: 0, z: 0 }, 1);
    expect(a.velocity.x).toBeGreaterThan(0);
    expect(a.position.x).toBeGreaterThan(0);
  });

  it('applyForce clamps velocity to maxSpeed', () => {
    const a = agent({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });
    a.maxSpeed = 5;
    SteeringBehaviors.applyForce(a, { x: 100, y: 0, z: 0 }, 1);
    const speed = vecLen(a.velocity);
    expect(speed).toBeLessThanOrEqual(5.01);
  });

  it('applyForce accounts for mass', () => {
    const heavy = agent({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });
    heavy.mass = 10;
    const light = agent({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });
    light.mass = 1;
    SteeringBehaviors.applyForce(heavy, { x: 5, y: 0, z: 0 }, 1);
    SteeringBehaviors.applyForce(light, { x: 5, y: 0, z: 0 }, 1);
    expect(light.velocity.x).toBeGreaterThan(heavy.velocity.x);
  });
});
