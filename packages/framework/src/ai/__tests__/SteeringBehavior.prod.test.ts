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
    position: [0, 0, 0],
    velocity: [0, 0, 0],
    maxSpeed: 5,
    maxForce: 10,
    mass: 1,
    ...overrides,
  };
}

// --- seek ---
describe('SteeringBehavior.seek', () => {
  it('returns zero force when already at target', () => {
    const agent = makeAgent({ position: [3, 0, 4] });
    const force = SteeringBehavior.seek(agent, [3, 0, 4]);
    expect(force[0]).toBe(0);
    expect(force[2]).toBe(0);
  });

  it('desired velocity length equals maxSpeed minus current velocity', () => {
    const agent = makeAgent({ maxSpeed: 5 });
    const force = SteeringBehavior.seek(agent, [10, 0, 0]);
    // desired = (10/10)*5 = 5, velocity = 0 → force.x = 5
    expect(force[0]).toBeCloseTo(5, 4);
    expect(force[2]).toBeCloseTo(0, 4);
  });

  it('force accounts for existing velocity', () => {
    const agent = makeAgent({ velocity: [2, 0, 0], maxSpeed: 5 });
    const force = SteeringBehavior.seek(agent, [10, 0, 0]);
    // desired.x=5, velocity.x=2 → force.x=3
    expect(force[0]).toBeCloseTo(3, 4);
  });

  it('seeks in negative direction', () => {
    const agent = makeAgent();
    const force = SteeringBehavior.seek(agent, [-10, 0, 0]);
    expect(force[0]).toBeLessThan(0);
    expect(force[2]).toBeCloseTo(0, 4);
  });

  it('returns normalized direction toward diagonal target', () => {
    const agent = makeAgent({ maxSpeed: 1 });
    const force = SteeringBehavior.seek(agent, [1, 0, 1]);
    const mag = Math.sqrt(force[0] ** 2 + force[2] ** 2);
    // desired mag = 1 (maxSpeed), velocity=0 → force mag ≈ 1
    expect(mag).toBeCloseTo(1, 4);
    expect(force[0]).toBeCloseTo(force[2], 4);
  });
});

// --- flee ---
describe('SteeringBehavior.flee', () => {
  it('is exact negation of seek result', () => {
    const agent = makeAgent();
    const target = [5, 0, 3];
    const seek = SteeringBehavior.seek(agent, target);
    const flee = SteeringBehavior.flee(agent, target);
    expect(flee[0]).toBeCloseTo(-seek[0], 6);
    expect(flee[2]).toBeCloseTo(-seek[2], 6);
  });

  it('points away from target', () => {
    const agent = makeAgent({ position: [0, 0, 0] });
    const force = SteeringBehavior.flee(agent, [5, 0, 0]);
    // should steer left (negative x)
    expect(force[0]).toBeLessThan(0);
  });
});

// --- arrive ---
describe('SteeringBehavior.arrive', () => {
  it('returns zero force at target', () => {
    const agent = makeAgent({ position: [5, 0, 0] });
    const force = SteeringBehavior.arrive(agent, [5, 0, 0]);
    expect(force[0]).toBe(0);
    expect(force[2]).toBe(0);
  });

  it('outside slowRadius speed equals maxSpeed', () => {
    const agent = makeAgent({ maxSpeed: 5, velocity: [0, 0, 0] });
    const slowRadius = 3;
    // target at (100,0) is far outside slowRadius
    const force = SteeringBehavior.arrive(agent, [100, 0, 0], slowRadius);
    // desired.x = maxSpeed = 5 → force.x = 5
    expect(force[0]).toBeCloseTo(5, 4);
  });

  it('inside slowRadius speed proportional to distance', () => {
    const agent = makeAgent({ maxSpeed: 10, velocity: [0, 0, 0] });
    const slowRadius = 10;
    // target at (5, 0) → dist=5 < slowRadius=10 → speed=10*(5/10)=5
    const force = SteeringBehavior.arrive(agent, [5, 0, 0], slowRadius);
    expect(force[0]).toBeCloseTo(5, 4);
  });

  it('deceleration force is less than full-speed seek force', () => {
    const agent = makeAgent({ maxSpeed: 10, velocity: [0, 0, 0] });
    const seekForce = SteeringBehavior.seek(agent, [1, 0, 0]);
    const arriveForce = SteeringBehavior.arrive(agent, [1, 0, 0], 20);
    expect(Math.abs(arriveForce[0])).toBeLessThan(Math.abs(seekForce[0]));
  });

  it('uses default slowRadius of 5', () => {
    const agent = makeAgent({ maxSpeed: 10, velocity: [0, 0, 0] });
    // dist=2 < slowRadius=5 → speed=10*(2/5)=4
    const force = SteeringBehavior.arrive(agent, [2, 0, 0]);
    expect(force[0]).toBeCloseTo(4, 4);
  });
});

// --- wander ---
describe('SteeringBehavior.wander', () => {
  it('returns a Vec2 object with x and z', () => {
    const agent = makeAgent({ velocity: [1, 0, 0] });
    const force = SteeringBehavior.wander(agent);
    expect(typeof force[0]).toBe('number');
    expect(typeof force[2]).toBe('number');
  });

  it('does not produce infinite or NaN values', () => {
    const agent = makeAgent({ velocity: [0, 0, 0] });
    const force = SteeringBehavior.wander(agent);
    expect(isFinite(force[0])).toBe(true);
    expect(isFinite(force[2])).toBe(true);
  });

  it('multiple calls produce varied results (randomness)', () => {
    const agent = makeAgent({ velocity: [1, 0, 0] });
    const forces = Array.from({ length: 10 }, () => SteeringBehavior.wander(agent));
    const unique = new Set(forces.map((f) => `${f[0].toFixed(5)},${f[2].toFixed(5)}`));
    // extremely unlikely all 10 are identical
    expect(unique.size).toBeGreaterThan(1);
  });
});

// --- avoid ---
describe('SteeringBehavior.avoid', () => {
  it('returns zero when no obstacles', () => {
    const agent = makeAgent();
    const force = SteeringBehavior.avoid(agent, []);
    expect(force[0]).toBe(0);
    expect(force[2]).toBe(0);
  });

  it('returns zero when obstacle is beyond lookAhead', () => {
    const agent = makeAgent({ maxForce: 10 });
    const force = SteeringBehavior.avoid(agent, [{ position: [100, 0, 0], radius: 1 }], 5);
    expect(force[0]).toBe(0);
    expect(force[2]).toBe(0);
  });

  it('pushes away from nearby obstacle', () => {
    const agent = makeAgent({ position: [0, 0, 0], maxForce: 10 });
    // obstacle at (2, 0), within lookAhead=5
    const force = SteeringBehavior.avoid(agent, [{ position: [2, 0, 0], radius: 1 }], 5);
    // push should be in negative x direction
    expect(force[0]).toBeLessThan(0);
  });

  it('larger obstacle radius causes stronger push', () => {
    const agent = makeAgent({ position: [0, 0, 0], maxForce: 100 });
    const small = SteeringBehavior.avoid(agent, [{ position: [3, 0, 0], radius: 0.5 }], 5);
    const large = SteeringBehavior.avoid(agent, [{ position: [3, 0, 0], radius: 3 }], 5);
    expect(Math.abs(large[0])).toBeGreaterThan(Math.abs(small[0]));
  });

  it('combines forces from multiple obstacles', () => {
    const agent = makeAgent({ position: [0, 0, 0], maxForce: 10 });
    const oneObs = SteeringBehavior.avoid(agent, [{ position: [2, 0, 0], radius: 1 }], 5);
    const twoObs = SteeringBehavior.avoid(
      agent,
      [
        { position: [2, 0, 0], radius: 1 },
        { position: [-2, 0, 0], radius: 1 },
      ],
      5
    );
    // x-components partially cancel, but total force changes
    expect(Math.abs(twoObs[0])).toBeLessThan(Math.abs(oneObs[0]));
  });
});

// --- blend ---
describe('SteeringBehavior.blend', () => {
  it('returns zero for empty outputs', () => {
    const result = SteeringBehavior.blend([], 10);
    expect(result[0]).toBe(0);
    expect(result[2]).toBe(0);
  });

  it('single output with weight=1 passes through unclamped', () => {
    const result = SteeringBehavior.blend(
      [{ force: [3, 0, 4], type: 'seek', weight: 1 }],
      100
    );
    expect(result[0]).toBeCloseTo(3, 4);
    expect(result[2]).toBeCloseTo(4, 4);
  });

  it('clamps result magnitude to maxForce', () => {
    const result = SteeringBehavior.blend(
      [{ force: [100, 0, 0], type: 'seek', weight: 1 }],
      5
    );
    expect(result[0]).toBeCloseTo(5, 4);
    expect(result[2]).toBeCloseTo(0, 4);
  });

  it('weight scales force contribution', () => {
    const result = SteeringBehavior.blend(
      [{ force: [10, 0, 0], type: 'seek', weight: 0.5 }],
      100
    );
    expect(result[0]).toBeCloseTo(5, 4);
  });

  it('multiple outputs are summed with weights', () => {
    const result = SteeringBehavior.blend(
      [
        { force: [4, 0, 0], type: 'seek', weight: 1 },
        { force: [6, 0, 0], type: 'flee', weight: 1 },
      ],
      100
    );
    expect(result[0]).toBeCloseTo(10, 4);
  });

  it('opposing forces can cancel', () => {
    const result = SteeringBehavior.blend(
      [
        { force: [5, 0, 0], type: 'seek', weight: 1 },
        { force: [-5, 0, 0], type: 'flee', weight: 1 },
      ],
      100
    );
    expect(result[0]).toBeCloseTo(0, 4);
    expect(result[2]).toBeCloseTo(0, 4);
  });
});
