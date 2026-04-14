import { describe, it, expect } from 'vitest';
import { SteeringBehavior } from '@holoscript/framework/ai';
import type { SteeringAgent, Vec2 } from '@holoscript/framework/ai';

// =============================================================================
// C214 — AI Steering Behaviors
// =============================================================================

function makeAgent(overrides: Partial<SteeringAgent> = {}): SteeringAgent {
  return {
    position: { x: 0, z: 0 },
    velocity: { x: 0, z: 0 },
    maxSpeed: 10,
    maxForce: 5,
    mass: 1,
    ...overrides,
  };
}

function mag(v: Vec2): number {
  return Math.sqrt(v.x ** 2 + v.z ** 2);
}

describe('SteeringBehavior', () => {
  // --- Seek ---

  it('seek steers toward target', () => {
    const agent = makeAgent();
    const force = SteeringBehavior.seek(agent, { x: 10, z: 0 });
    expect(force[0]).toBeGreaterThan(0);
    expect(force[2]).toBeCloseTo(0, 5);
  });

  it('seek returns zero when at target', () => {
    const agent = makeAgent({ position: { x: 5, z: 5 } });
    const force = SteeringBehavior.seek(agent, { x: 5, z: 5 });
    expect(force[0]).toBe(0);
    expect(force[2]).toBe(0);
  });

  // --- Flee ---

  it('flee steers away from target', () => {
    const agent = makeAgent();
    const force = SteeringBehavior.flee(agent, { x: 10, z: 0 });
    expect(force[0]).toBeLessThan(0); // moving away
  });

  it('flee is opposite of seek', () => {
    const agent = makeAgent();
    const target = { x: 5, z: 3 };
    const seekForce = SteeringBehavior.seek(agent, target);
    const fleeForce = SteeringBehavior.flee(agent, target);
    expect(fleeForce.x).toBeCloseTo(-seekForce.x);
    expect(fleeForce.z).toBeCloseTo(-seekForce.z);
  });

  // --- Arrive ---

  it('arrive decelerates near target', () => {
    const agent = makeAgent({ position: { x: 0, z: 0 } });
    const farForce = SteeringBehavior.arrive(agent, { x: 100, z: 0 }, 5);
    const nearForce = SteeringBehavior.arrive(agent, { x: 2, z: 0 }, 5);
    expect(mag(nearForce)).toBeLessThan(mag(farForce));
  });

  it('arrive returns zero at target', () => {
    const agent = makeAgent({ position: { x: 5, z: 5 } });
    const force = SteeringBehavior.arrive(agent, { x: 5, z: 5 });
    expect(force[0]).toBe(0);
    expect(force[2]).toBe(0);
  });

  // --- Wander ---

  it('wander produces a non-zero force', () => {
    const agent = makeAgent({ velocity: { x: 5, z: 0 } });
    const force = SteeringBehavior.wander(agent, 2, 4, 0.5);
    expect(mag(force)).toBeGreaterThan(0);
  });

  // --- Avoid ---

  it('avoid pushes away from close obstacle', () => {
    const agent = makeAgent({ velocity: { x: 5, z: 0 } });
    const obstacles = [{ position: { x: 3, z: 0 }, radius: 1 }];
    const force = SteeringBehavior.avoid(agent, obstacles, 5);
    expect(force[0]).toBeLessThan(0); // pushed backward
  });

  it('avoid returns zero when no obstacles in range', () => {
    const agent = makeAgent();
    const obstacles = [{ position: { x: 100, z: 100 }, radius: 1 }];
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
        { force: { x: 10, z: 0 }, type: 'seek', weight: 0.5 },
        { force: { x: 0, z: 10 }, type: 'flee', weight: 0.5 },
      ],
      100
    );
    expect(result.x).toBeCloseTo(5);
    expect(result.z).toBeCloseTo(5);
  });

  it('blend clamps to maxForce', () => {
    const result = SteeringBehavior.blend(
      [{ force: { x: 100, z: 0 }, type: 'seek', weight: 1 }],
      5
    );
    expect(mag(result)).toBeCloseTo(5, 1);
  });

  it('blend of empty list returns zero', () => {
    const result = SteeringBehavior.blend([], 10);
    expect(result.x).toBe(0);
    expect(result.z).toBe(0);
  });
});
