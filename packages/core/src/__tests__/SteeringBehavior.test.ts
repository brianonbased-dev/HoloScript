import { describe, it, expect } from 'vitest';
import { SteeringBehavior } from '@holoscript/framework/ai';
import type { SteeringAgent, Vec2 } from '@holoscript/framework/ai';

// =============================================================================
// C214 — AI Steering Behaviors
// =============================================================================

function makeAgent(overrides: Partial<SteeringAgent> = {}): SteeringAgent {
  return {
    position: [0, 0, 0],
    velocity: [0, 0, 0],
    maxSpeed: 10,
    maxForce: 5,
    mass: 1,
    ...overrides,
  };
}

function mag(v: Vec2): number {
  return Math.sqrt(v[0] ** 2 + v[2] ** 2);
}

describe('SteeringBehavior', () => {
  // --- Seek ---

  it('seek steers toward target', () => {
    const agent = makeAgent();
    const force = SteeringBehavior.seek(agent, [10, 0, 0]);
    expect(force[0]).toBeGreaterThan(0);
    expect(force[2]).toBeCloseTo(0, 5);
  });

  it('seek returns zero when at target', () => {
    const agent = makeAgent({ position: [5, 0, 5] });
    const force = SteeringBehavior.seek(agent, [5, 0, 5]);
    expect(force[0]).toBe(0);
    expect(force[2]).toBe(0);
  });

  // --- Flee ---

  it('flee steers away from target', () => {
    const agent = makeAgent();
    const force = SteeringBehavior.flee(agent, [10, 0, 0]);
    expect(force[0]).toBeLessThan(0); // moving away
  });

  it('flee is opposite of seek', () => {
    const agent = makeAgent();
    const target = [5, 0, 3];
    const seekForce = SteeringBehavior.seek(agent, target);
    const fleeForce = SteeringBehavior.flee(agent, target);
    expect(fleeForce[0]).toBeCloseTo(-seekForce[0]);
    expect(fleeForce[2]).toBeCloseTo(-seekForce[2]);
  });

  // --- Arrive ---

  it('arrive decelerates near target', () => {
    const agent = makeAgent({ position: [0, 0, 0] });
    const farForce = SteeringBehavior.arrive(agent, [100, 0, 0], 5);
    const nearForce = SteeringBehavior.arrive(agent, [2, 0, 0], 5);
    expect(mag(nearForce)).toBeLessThan(mag(farForce));
  });

  it('arrive returns zero at target', () => {
    const agent = makeAgent({ position: [5, 0, 5] });
    const force = SteeringBehavior.arrive(agent, [5, 0, 5]);
    expect(force[0]).toBe(0);
    expect(force[2]).toBe(0);
  });

  // --- Wander ---

  it('wander produces a non-zero force', () => {
    const agent = makeAgent({ velocity: [5, 0, 0] });
    const force = SteeringBehavior.wander(agent, 2, 4, 0.5);
    expect(mag(force)).toBeGreaterThan(0);
  });

  // --- Avoid ---

  it('avoid pushes away from close obstacle', () => {
    const agent = makeAgent({ velocity: [5, 0, 0] });
    const obstacles = [{ position: [3, 0, 0], radius: 1 }];
    const force = SteeringBehavior.avoid(agent, obstacles, 5);
    expect(force[0]).toBeLessThan(0); // pushed backward
  });

  it('avoid returns zero when no obstacles in range', () => {
    const agent = makeAgent();
    const obstacles = [{ position: [100, 0, 100], radius: 1 }];
    const force = SteeringBehavior.avoid(agent, obstacles, 5);
    expect(force[0]).toBe(0);
    expect(force[2]).toBe(0);
  });

  it('avoid handles empty obstacle list', () => {
    const agent = makeAgent();
    const force = SteeringBehavior.avoid(agent, [], 5);
    expect(force[0]).toBe(0);
    expect(force[2]).toBe(0);
  });

  // --- Blend ---

  it('blend combines forces by weight', () => {
    const result = SteeringBehavior.blend(
      [
        { force: [10, 0, 0], type: 'seek', weight: 0.5 },
        { force: [0, 0, 10], type: 'flee', weight: 0.5 },
      ],
      100
    );
    expect(result[0]).toBeCloseTo(5);
    expect(result[2]).toBeCloseTo(5);
  });

  it('blend clamps to maxForce', () => {
    const result = SteeringBehavior.blend(
      [{ force: [100, 0, 0], type: 'seek', weight: 1 }],
      5
    );
    expect(mag(result)).toBeCloseTo(5, 1);
  });

  it('blend of empty list returns zero', () => {
    const result = SteeringBehavior.blend([], 10);
    expect(result[0]).toBe(0);
    expect(result[2]).toBe(0);
  });
});
