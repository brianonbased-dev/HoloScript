import { describe, it, expect } from 'vitest';
import { SteeringBehavior, SteeringAgent, SteeringOutput, Vec2 } from '../SteeringBehavior';

function agent(pos: Vec2 = [0, 0, 0], vel: Vec2 = [0, 0, 0]): SteeringAgent {
  return { position: pos, velocity: vel, maxSpeed: 10, maxForce: 5, mass: 1 };
}

function mag(v: Vec2): number {
  return Math.sqrt(v[0] ** 2 + v[2] ** 2);
}

describe('SteeringBehavior', () => {
  // --- Seek ---
  it('seek steers toward target', () => {
    const f = SteeringBehavior.seek(agent(), [10, 0, 0]);
    expect(f[0]).toBeGreaterThan(0);
  });

  it('seek returns zero at target', () => {
    const f = SteeringBehavior.seek(agent([5, 0, 5]), [5, 0, 5]);
    expect(f[0]).toBe(0);
    expect(f[2]).toBe(0);
  });

  it('seek accounts for current velocity', () => {
    const a = agent([0, 0, 0], [5, 0, 0]);
    const f = SteeringBehavior.seek(a, [10, 0, 0]);
    // Desired is 10 (maxSpeed), current is 5, so steering = 5
    expect(f[0]).toBe(5);
  });

  // --- Flee ---
  it('flee steers away from target', () => {
    const f = SteeringBehavior.flee(agent(), [10, 0, 0]);
    expect(f[0]).toBeLessThan(0);
  });

  it('flee is opposite of seek', () => {
    const a = agent();
    const seek = SteeringBehavior.seek(a, [5, 0, 5]);
    const flee = SteeringBehavior.flee(a, [5, 0, 5]);
    expect(flee[0]).toBeCloseTo(-seek[0], 5);
    expect(flee[2]).toBeCloseTo(-seek[2], 5);
  });

  // --- Arrive ---
  it('arrive matches seek when far away', () => {
    const a = agent();
    const target = [100, 0, 0];
    const arrive = SteeringBehavior.arrive(a, target, 5);
    const seek = SteeringBehavior.seek(a, target);
    // When far from slowRadius, arrive ≈ seek
    expect(Math.abs(arrive[0] - seek[0])).toBeLessThan(0.1);
  });

  it('arrive decelerates near target', () => {
    const far = SteeringBehavior.arrive(agent(), [100, 0, 0], 5);
    const near = SteeringBehavior.arrive(agent(), [2, 0, 0], 5);
    expect(mag(near)).toBeLessThan(mag(far));
  });

  it('arrive returns zero at target', () => {
    const f = SteeringBehavior.arrive(agent([5, 0, 5]), [5, 0, 5]);
    expect(f[0]).toBe(0);
    expect(f[2]).toBe(0);
  });

  // --- Wander ---
  it('wander produces a force', () => {
    const f = SteeringBehavior.wander(agent([0, 0, 0], [1, 0, 0]));
    expect(mag(f)).toBeGreaterThan(0);
  });

  it('wander produces varied results', () => {
    const a = agent([0, 0, 0], [1, 0, 0]);
    const results = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const f = SteeringBehavior.wander(a);
      results.add(`${f[0].toFixed(2)}_${f[2].toFixed(2)}`);
    }
    // Should produce more than one unique result over 20 calls
    expect(results.size).toBeGreaterThan(1);
  });

  // --- Avoid ---
  it('avoid pushes away from obstacle', () => {
    const a = agent([0, 0, 0], [1, 0, 0]);
    const obstacles = [{ position: [3, 0, 0], radius: 1 }];
    const f = SteeringBehavior.avoid(a, obstacles, 5);
    expect(f[0]).toBeLessThan(0); // Push back
  });

  it('avoid returns zero when no obstacles in range', () => {
    const a = agent();
    const obstacles = [{ position: [100, 0, 100], radius: 1 }];
    const f = SteeringBehavior.avoid(a, obstacles, 5);
    expect(f[0]).toBe(0);
    expect(f[2]).toBe(0);
  });

  it('avoid handles multiple obstacles', () => {
    const a = agent([5, 0, 5]);
    const obstacles = [
      { position: [6, 0, 5], radius: 1 },
      { position: [5, 0, 6], radius: 1 },
    ];
    const f = SteeringBehavior.avoid(a, obstacles, 5);
    // Should push in -x and -z
    expect(f[0]).toBeLessThan(0);
    expect(f[2]).toBeLessThan(0);
  });

  // --- Blend ---
  it('blend combines weighted outputs', () => {
    const outputs: SteeringOutput[] = [
      { force: [10, 0, 0], type: 'seek', weight: 0.5 },
      { force: [0, 0, 10], type: 'flee', weight: 0.5 },
    ];
    const f = SteeringBehavior.blend(outputs, 100);
    expect(f[0]).toBeCloseTo(5);
    expect(f[2]).toBeCloseTo(5);
  });

  it('blend truncates to maxForce', () => {
    const outputs: SteeringOutput[] = [{ force: [100, 0, 0], type: 'seek', weight: 1 }];
    const f = SteeringBehavior.blend(outputs, 5);
    expect(mag(f)).toBeCloseTo(5, 1);
  });

  it('blend with empty produces zero', () => {
    const f = SteeringBehavior.blend([], 10);
    expect(f[0]).toBe(0);
    expect(f[2]).toBe(0);
  });
});
