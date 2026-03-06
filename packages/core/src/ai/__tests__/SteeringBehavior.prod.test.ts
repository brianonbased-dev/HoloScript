/**
 * SteeringBehavior — Production Tests
 *
 * Tests: seek, flee, arrive, wander, avoid, blend
 */

import { describe, it, expect } from 'vitest';
import { SteeringBehavior } from '../SteeringBehavior';
import type { SteeringAgent } from '../SteeringBehavior';

function makeAgent(overrides: Partial<SteeringAgent> = {}): SteeringAgent {
  return {
    position: { x: 0, z: 0 },
    velocity: { x: 0, z: 0 },
    maxSpeed: 5,
    maxForce: 10,
    mass: 1,
    ...overrides,
  };
}

// --- seek ---
describe('SteeringBehavior.seek', () => {
  it('returns zero force when already at target', () => {
    const agent = makeAgent({ position: { x: 3, z: 4 } });
    const force = SteeringBehavior.seek(agent, { x: 3, z: 4 });
    expect(force.x).toBe(0);
    expect(force.z).toBe(0);
  });

  it('desired velocity length equals maxSpeed minus current velocity', () => {
    const agent = makeAgent({ maxSpeed: 5 });
    const force = SteeringBehavior.seek(agent, { x: 10, z: 0 });
    // desired = (10/10)*5 = 5, velocity = 0 → force.x = 5
    expect(force.x).toBeCloseTo(5, 4);
    expect(force.z).toBeCloseTo(0, 4);
  });

  it('force accounts for existing velocity', () => {
    const agent = makeAgent({ velocity: { x: 2, z: 0 }, maxSpeed: 5 });
    const force = SteeringBehavior.seek(agent, { x: 10, z: 0 });
    // desired.x=5, velocity.x=2 → force.x=3
    expect(force.x).toBeCloseTo(3, 4);
  });

  it('seeks in negative direction', () => {
    const agent = makeAgent();
    const force = SteeringBehavior.seek(agent, { x: -10, z: 0 });
    expect(force.x).toBeLessThan(0);
    expect(force.z).toBeCloseTo(0, 4);
  });

  it('returns normalized direction toward diagonal target', () => {
    const agent = makeAgent({ maxSpeed: 1 });
    const force = SteeringBehavior.seek(agent, { x: 1, z: 1 });
    const mag = Math.sqrt(force.x ** 2 + force.z ** 2);
    // desired mag = 1 (maxSpeed), velocity=0 → force mag ≈ 1
    expect(mag).toBeCloseTo(1, 4);
    expect(force.x).toBeCloseTo(force.z, 4);
  });
});

// --- flee ---
describe('SteeringBehavior.flee', () => {
  it('is exact negation of seek result', () => {
    const agent = makeAgent();
    const target = { x: 5, z: 3 };
    const seek = SteeringBehavior.seek(agent, target);
    const flee = SteeringBehavior.flee(agent, target);
    expect(flee.x).toBeCloseTo(-seek.x, 6);
    expect(flee.z).toBeCloseTo(-seek.z, 6);
  });

  it('points away from target', () => {
    const agent = makeAgent({ position: { x: 0, z: 0 } });
    const force = SteeringBehavior.flee(agent, { x: 5, z: 0 });
    // should steer left (negative x)
    expect(force.x).toBeLessThan(0);
  });
});

// --- arrive ---
describe('SteeringBehavior.arrive', () => {
  it('returns zero force at target', () => {
    const agent = makeAgent({ position: { x: 5, z: 0 } });
    const force = SteeringBehavior.arrive(agent, { x: 5, z: 0 });
    expect(force.x).toBe(0);
    expect(force.z).toBe(0);
  });

  it('outside slowRadius speed equals maxSpeed', () => {
    const agent = makeAgent({ maxSpeed: 5, velocity: { x: 0, z: 0 } });
    const slowRadius = 3;
    // target at (100,0) is far outside slowRadius
    const force = SteeringBehavior.arrive(agent, { x: 100, z: 0 }, slowRadius);
    // desired.x = maxSpeed = 5 → force.x = 5
    expect(force.x).toBeCloseTo(5, 4);
  });

  it('inside slowRadius speed proportional to distance', () => {
    const agent = makeAgent({ maxSpeed: 10, velocity: { x: 0, z: 0 } });
    const slowRadius = 10;
    // target at (5, 0) → dist=5 < slowRadius=10 → speed=10*(5/10)=5
    const force = SteeringBehavior.arrive(agent, { x: 5, z: 0 }, slowRadius);
    expect(force.x).toBeCloseTo(5, 4);
  });

  it('deceleration force is less than full-speed seek force', () => {
    const agent = makeAgent({ maxSpeed: 10, velocity: { x: 0, z: 0 } });
    const seekForce = SteeringBehavior.seek(agent, { x: 1, z: 0 });
    const arriveForce = SteeringBehavior.arrive(agent, { x: 1, z: 0 }, 20);
    expect(Math.abs(arriveForce.x)).toBeLessThan(Math.abs(seekForce.x));
  });

  it('uses default slowRadius of 5', () => {
    const agent = makeAgent({ maxSpeed: 10, velocity: { x: 0, z: 0 } });
    // dist=2 < slowRadius=5 → speed=10*(2/5)=4
    const force = SteeringBehavior.arrive(agent, { x: 2, z: 0 });
    expect(force.x).toBeCloseTo(4, 4);
  });
});

// --- wander ---
describe('SteeringBehavior.wander', () => {
  it('returns a Vec2 object with x and z', () => {
    const agent = makeAgent({ velocity: { x: 1, z: 0 } });
    const force = SteeringBehavior.wander(agent);
    expect(typeof force.x).toBe('number');
    expect(typeof force.z).toBe('number');
  });

  it('does not produce infinite or NaN values', () => {
    const agent = makeAgent({ velocity: { x: 0, z: 0 } });
    const force = SteeringBehavior.wander(agent);
    expect(isFinite(force.x)).toBe(true);
    expect(isFinite(force.z)).toBe(true);
  });

  it('multiple calls produce varied results (randomness)', () => {
    const agent = makeAgent({ velocity: { x: 1, z: 0 } });
    const forces = Array.from({ length: 10 }, () => SteeringBehavior.wander(agent));
    const unique = new Set(forces.map(f => `${f.x.toFixed(5)},${f.z.toFixed(5)}`));
    // extremely unlikely all 10 are identical
    expect(unique.size).toBeGreaterThan(1);
  });
});

// --- avoid ---
describe('SteeringBehavior.avoid', () => {
  it('returns zero when no obstacles', () => {
    const agent = makeAgent();
    const force = SteeringBehavior.avoid(agent, []);
    expect(force.x).toBe(0);
    expect(force.z).toBe(0);
  });

  it('returns zero when obstacle is beyond lookAhead', () => {
    const agent = makeAgent({ maxForce: 10 });
    const force = SteeringBehavior.avoid(agent, [{ position: { x: 100, z: 0 }, radius: 1 }], 5);
    expect(force.x).toBe(0);
    expect(force.z).toBe(0);
  });

  it('pushes away from nearby obstacle', () => {
    const agent = makeAgent({ position: { x: 0, z: 0 }, maxForce: 10 });
    // obstacle at (2, 0), within lookAhead=5
    const force = SteeringBehavior.avoid(agent, [{ position: { x: 2, z: 0 }, radius: 1 }], 5);
    // push should be in negative x direction
    expect(force.x).toBeLessThan(0);
  });

  it('larger obstacle radius causes stronger push', () => {
    const agent = makeAgent({ position: { x: 0, z: 0 }, maxForce: 100 });
    const small = SteeringBehavior.avoid(agent, [{ position: { x: 3, z: 0 }, radius: 0.5 }], 5);
    const large = SteeringBehavior.avoid(agent, [{ position: { x: 3, z: 0 }, radius: 3 }], 5);
    expect(Math.abs(large.x)).toBeGreaterThan(Math.abs(small.x));
  });

  it('combines forces from multiple obstacles', () => {
    const agent = makeAgent({ position: { x: 0, z: 0 }, maxForce: 10 });
    const oneObs = SteeringBehavior.avoid(agent, [{ position: { x: 2, z: 0 }, radius: 1 }], 5);
    const twoObs = SteeringBehavior.avoid(agent, [
      { position: { x: 2, z: 0 }, radius: 1 },
      { position: { x: -2, z: 0 }, radius: 1 },
    ], 5);
    // x-components partially cancel, but total force changes
    expect(Math.abs(twoObs.x)).toBeLessThan(Math.abs(oneObs.x));
  });
});

// --- blend ---
describe('SteeringBehavior.blend', () => {
  it('returns zero for empty outputs', () => {
    const result = SteeringBehavior.blend([], 10);
    expect(result.x).toBe(0);
    expect(result.z).toBe(0);
  });

  it('single output with weight=1 passes through unclamped', () => {
    const result = SteeringBehavior.blend(
      [{ force: { x: 3, z: 4 }, type: 'seek', weight: 1 }],
      100
    );
    expect(result.x).toBeCloseTo(3, 4);
    expect(result.z).toBeCloseTo(4, 4);
  });

  it('clamps result magnitude to maxForce', () => {
    const result = SteeringBehavior.blend(
      [{ force: { x: 100, z: 0 }, type: 'seek', weight: 1 }],
      5
    );
    expect(result.x).toBeCloseTo(5, 4);
    expect(result.z).toBeCloseTo(0, 4);
  });

  it('weight scales force contribution', () => {
    const result = SteeringBehavior.blend(
      [{ force: { x: 10, z: 0 }, type: 'seek', weight: 0.5 }],
      100
    );
    expect(result.x).toBeCloseTo(5, 4);
  });

  it('multiple outputs are summed with weights', () => {
    const result = SteeringBehavior.blend(
      [
        { force: { x: 4, z: 0 }, type: 'seek', weight: 1 },
        { force: { x: 6, z: 0 }, type: 'flee', weight: 1 },
      ],
      100
    );
    expect(result.x).toBeCloseTo(10, 4);
  });

  it('opposing forces can cancel', () => {
    const result = SteeringBehavior.blend(
      [
        { force: { x: 5, z: 0 }, type: 'seek', weight: 1 },
        { force: { x: -5, z: 0 }, type: 'flee', weight: 1 },
      ],
      100
    );
    expect(result.x).toBeCloseTo(0, 4);
    expect(result.z).toBeCloseTo(0, 4);
  });
});
