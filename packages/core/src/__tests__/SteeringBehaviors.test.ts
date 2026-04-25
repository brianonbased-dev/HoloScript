import { describe, it, expect } from 'vitest';
import { SteeringBehaviors, SteeringAgent, FlockConfig } from '@holoscript/framework/ai';

function agent(x = 0, y = 0, z = 0, vx = 1, vy = 0, vz = 0): SteeringAgent {
  return {
    position: [x, y, z],
    velocity: [vx, vy, vz],
    maxSpeed: 5,
    maxForce: 2,
    mass: 1,
  };
}
function len(v: [number, number, number]) {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}

describe('SteeringBehaviors', () => {
  it('seek produces force toward target', () => {
    const a = agent(0, 0, 0);
    const f = SteeringBehaviors.seek(a, [10, 0, 0]);
    expect(f[0]).toBeGreaterThan(0);
    expect(len(f)).toBeLessThanOrEqual(a.maxForce + 0.001);
  });

  it('flee produces force away from threat', () => {
    const a = agent(0, 0, 0);
    const f = SteeringBehaviors.flee(a, [10, 0, 0]);
    expect(f[0]).toBeLessThan(0);
  });

  it('arrive slows near target', () => {
    const far = agent(0, 0, 0, 0, 0, 0);
    const fFar = SteeringBehaviors.arrive(far, [100, 0, 0], 20);
    const near = agent(5, 0, 0, 0, 0, 0);
    const fNear = SteeringBehaviors.arrive(near, [10, 0, 0], 20);
    expect(len(fFar)).toBeGreaterThan(len(fNear));
  });

  it('arrive returns zero at target', () => {
    const a = agent(5, 5, 5, 0, 0, 0);
    const f = SteeringBehaviors.arrive(a, [5, 5, 5], 10);
    expect(len(f)).toBeCloseTo(0);
  });

  it('wander returns force and updated angle', () => {
    const a = agent(0, 0, 0, 1, 0, 0);
    const result = SteeringBehaviors.wander(a, 2, 1, 0.5, 0);
    expect(result.force).toBeDefined();
    expect(typeof result.newAngle).toBe('number');
  });

  it('flock returns zero with no neighbors in range', () => {
    const a = agent(0, 0, 0);
    const config: FlockConfig = {
      separationWeight: 1,
      alignmentWeight: 1,
      cohesionWeight: 1,
      neighborRadius: 5,
    };
    const f = SteeringBehaviors.flock(a, [agent(100, 0, 0)], config);
    expect(len(f)).toBeCloseTo(0);
  });

  it('flock separation pushes away from close neighbors', () => {
    const a = agent(0, 0, 0);
    const n = agent(1, 0, 0);
    const config: FlockConfig = {
      separationWeight: 10,
      alignmentWeight: 0,
      cohesionWeight: 0,
      neighborRadius: 5,
    };
    const f = SteeringBehaviors.flock(a, [n], config);
    expect(f[0]).toBeLessThan(0); // pushed away from neighbor at x=1
  });

  it('flock cohesion pulls toward group center', () => {
    const a = agent(0, 0, 0);
    const n = agent(3, 0, 0, 1, 0, 0);
    const config: FlockConfig = {
      separationWeight: 0,
      alignmentWeight: 0,
      cohesionWeight: 10,
      neighborRadius: 10,
    };
    const f = SteeringBehaviors.flock(a, [n], config);
    expect(f[0]).toBeGreaterThan(0); // pulled toward neighbor
  });

  it('obstacle avoidance produces avoidance force', () => {
    const a = agent(0, 0, 0, 1, 0, 0);
    const obstacles = [{ center: [4, 1, 0], radius: 3 }];
    const f = SteeringBehaviors.obstacleAvoidance(a, obstacles, 5);
    expect(len(f)).toBeGreaterThan(0);
  });

  it('obstacle avoidance returns zero with no obstacles in path', () => {
    const a = agent(0, 0, 0, 1, 0, 0);
    const obstacles = [{ center: [0, 100, 0], radius: 1 }];
    const f = SteeringBehaviors.obstacleAvoidance(a, obstacles, 5);
    expect(len(f)).toBeCloseTo(0);
  });

  it('applyForce updates position and velocity', () => {
    const a = agent(0, 0, 0, 0, 0, 0);
    SteeringBehaviors.applyForce(a, [2, 0, 0], 1);
    expect(a.velocity[0]).toBeGreaterThan(0);
    expect(a.position[0]).toBeGreaterThan(0);
  });
});
