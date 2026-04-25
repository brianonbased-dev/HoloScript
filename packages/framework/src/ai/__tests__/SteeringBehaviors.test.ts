import { describe, it, expect } from 'vitest';
import { SteeringBehaviors, type SteeringAgent, type FlockConfig } from '../SteeringBehaviors';

type Vec3 = [number, number, number];

function agent(pos: Vec3, vel: Vec3 = [0, 0, 0]): SteeringAgent {
  return { position: pos, velocity: vel, maxSpeed: 10, maxForce: 5, mass: 1 };
}

function vecLen(v: Vec3): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}

describe('SteeringBehaviors', () => {
  // ---------------------------------------------------------------------------
  // Seek
  // ---------------------------------------------------------------------------

  it('seek produces force toward target', () => {
    const a = agent([0, 0, 0]);
    const force = SteeringBehaviors.seek(a, [10, 0, 0]);
    expect(force[0]).toBeGreaterThan(0);
    expect(Math.abs(force[1])).toBeLessThan(0.001);
  });

  it('seek returns zero-ish force when at target', () => {
    const a = agent([5, 5, 0]);
    const force = SteeringBehaviors.seek(a, [5, 5, 0]);
    expect(vecLen(force)).toBeLessThan(0.01);
  });

  // ---------------------------------------------------------------------------
  // Flee
  // ---------------------------------------------------------------------------

  it('flee produces force away from threat', () => {
    const a = agent([0, 0, 0]);
    const force = SteeringBehaviors.flee(a, [10, 0, 0]);
    expect(force[0]).toBeLessThan(0);
  });

  // ---------------------------------------------------------------------------
  // Arrive
  // ---------------------------------------------------------------------------

  it('arrive slows down within slowRadius', () => {
    const a = agent([0, 0, 0]);
    const forceFar = SteeringBehaviors.arrive(a, [100, 0, 0], 20);
    const aClose = agent([95, 0, 0]);
    const forceClose = SteeringBehaviors.arrive(aClose, [100, 0, 0], 20);
    expect(vecLen(forceClose)).toBeLessThanOrEqual(vecLen(forceFar) + 0.01);
  });

  it('arrive returns zero when at target', () => {
    const a = agent([5, 0, 0]);
    const force = SteeringBehaviors.arrive(a, [5, 0, 0], 10);
    expect(vecLen(force)).toBeLessThan(0.01);
  });

  // ---------------------------------------------------------------------------
  // Wander
  // ---------------------------------------------------------------------------

  it('wander returns a force and new angle', () => {
    const a = agent([0, 0, 0], [1, 0, 0]);
    const result = SteeringBehaviors.wander(a, 2, 1, 0.3, 0);
    expect(result.force).toBeDefined();
    expect(typeof result.newAngle).toBe('number');
    expect(Number.isFinite(result.force[0])).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Flock
  // ---------------------------------------------------------------------------

  it('flock returns a combined steering force', () => {
    const a = agent([0, 0, 0]);
    const neighbors = [
      agent([2, 0, 0], [1, 0, 0]),
      agent([-2, 0, 0], [1, 0, 0]),
    ];
    const config: FlockConfig = {
      separationWeight: 1,
      alignmentWeight: 1,
      cohesionWeight: 1,
      neighborRadius: 10,
    };
    const force = SteeringBehaviors.flock(a, neighbors, config);
    expect(Number.isFinite(force[0])).toBe(true);
    expect(Number.isFinite(force[1])).toBe(true);
  });

  it('flock returns zero with no neighbors in range', () => {
    const a = agent([0, 0, 0]);
    const neighbors = [agent([500, 500, 0])]; // far away
    const config: FlockConfig = {
      separationWeight: 1,
      alignmentWeight: 1,
      cohesionWeight: 1,
      neighborRadius: 5,
    };
    const force = SteeringBehaviors.flock(a, neighbors, config);
    expect(force).toEqual([0, 0, 0]);
  });

  // ---------------------------------------------------------------------------
  // Obstacle Avoidance
  // ---------------------------------------------------------------------------

  it('obstacleAvoidance returns force when obstacle ahead', () => {
    const a = agent([0, 0, 0], [1, 0, 0]);
    const obstacles = [{ center: [3, 0, 0], radius: 1 }];
    const force = SteeringBehaviors.obstacleAvoidance(a, obstacles, 5);
    expect(Number.isFinite(force[0])).toBe(true);
  });

  it('obstacleAvoidance returns zero with no obstacles', () => {
    const a = agent([0, 0, 0], [1, 0, 0]);
    const force = SteeringBehaviors.obstacleAvoidance(a, [], 5);
    expect(force).toEqual([0, 0, 0]);
  });

  // ---------------------------------------------------------------------------
  // Apply Force
  // ---------------------------------------------------------------------------

  it('applyForce updates agent position and velocity', () => {
    const a = agent([0, 0, 0], [0, 0, 0]);
    SteeringBehaviors.applyForce(a, [5, 0, 0], 1);
    expect(a.velocity[0]).toBeGreaterThan(0);
    expect(a.position[0]).toBeGreaterThan(0);
  });

  it('applyForce clamps velocity to maxSpeed', () => {
    const a = agent([0, 0, 0], [0, 0, 0]);
    a.maxSpeed = 5;
    SteeringBehaviors.applyForce(a, [100, 0, 0], 1);
    const speed = vecLen(a.velocity);
    expect(speed).toBeLessThanOrEqual(5.01);
  });

  it('applyForce accounts for mass', () => {
    const heavy = agent([0, 0, 0], [0, 0, 0]);
    heavy.mass = 10;
    const light = agent([0, 0, 0], [0, 0, 0]);
    light.mass = 1;
    SteeringBehaviors.applyForce(heavy, [5, 0, 0], 1);
    SteeringBehaviors.applyForce(light, [5, 0, 0], 1);
    expect(light.velocity[0]).toBeGreaterThan(heavy.velocity[0]);
  });
});
