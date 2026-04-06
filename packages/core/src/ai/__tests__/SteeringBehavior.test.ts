import { describe, it, expect } from 'vitest';
import { SteeringBehavior, SteeringAgent, SteeringOutput, Vec2 } from '@holoscript/framework/ai';

function agent(pos: Vec2 = { x: 0, z: 0 }, vel: Vec2 = { x: 0, z: 0 }): SteeringAgent {
  return { position: pos, velocity: vel, maxSpeed: 10, maxForce: 5, mass: 1 };
}

function mag(v: Vec2): number {
  return Math.sqrt(v.x ** 2 + v.z ** 2);
}

describe('SteeringBehavior', () => {
  // --- Seek ---
  it('seek steers toward target', () => {
    const f = SteeringBehavior.seek(agent(), { x: 10, z: 0 });
    expect(f.x).toBeGreaterThan(0);
  });

  it('seek returns zero at target', () => {
    const f = SteeringBehavior.seek(agent({ x: 5, z: 5 }), { x: 5, z: 5 });
    expect(f.x).toBe(0);
    expect(f.z).toBe(0);
  });

  it('seek accounts for current velocity', () => {
    const a = agent({ x: 0, z: 0 }, { x: 5, z: 0 });
    const f = SteeringBehavior.seek(a, { x: 10, z: 0 });
    // Desired is 10 (maxSpeed), current is 5, so steering = 5
    expect(f.x).toBe(5);
  });

  // --- Flee ---
  it('flee steers away from target', () => {
    const f = SteeringBehavior.flee(agent(), { x: 10, z: 0 });
    expect(f.x).toBeLessThan(0);
  });

  it('flee is opposite of seek', () => {
    const a = agent();
    const seek = SteeringBehavior.seek(a, { x: 5, z: 5 });
    const flee = SteeringBehavior.flee(a, { x: 5, z: 5 });
    expect(flee.x).toBeCloseTo(-seek.x, 5);
    expect(flee.z).toBeCloseTo(-seek.z, 5);
  });

  // --- Arrive ---
  it('arrive matches seek when far away', () => {
    const a = agent();
    const target = { x: 100, z: 0 };
    const arrive = SteeringBehavior.arrive(a, target, 5);
    const seek = SteeringBehavior.seek(a, target);
    // When far from slowRadius, arrive ≈ seek
    expect(Math.abs(arrive.x - seek.x)).toBeLessThan(0.1);
  });

  it('arrive decelerates near target', () => {
    const far = SteeringBehavior.arrive(agent(), { x: 100, z: 0 }, 5);
    const near = SteeringBehavior.arrive(agent(), { x: 2, z: 0 }, 5);
    expect(mag(near)).toBeLessThan(mag(far));
  });

  it('arrive returns zero at target', () => {
    const f = SteeringBehavior.arrive(agent({ x: 5, z: 5 }), { x: 5, z: 5 });
    expect(f.x).toBe(0);
    expect(f.z).toBe(0);
  });

  // --- Wander ---
  it('wander produces a force', () => {
    const f = SteeringBehavior.wander(agent({ x: 0, z: 0 }, { x: 1, z: 0 }));
    expect(mag(f)).toBeGreaterThan(0);
  });

  it('wander produces varied results', () => {
    const a = agent({ x: 0, z: 0 }, { x: 1, z: 0 });
    const results = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const f = SteeringBehavior.wander(a);
      results.add(`${f.x.toFixed(2)}_${f.z.toFixed(2)}`);
    }
    // Should produce more than one unique result over 20 calls
    expect(results.size).toBeGreaterThan(1);
  });

  // --- Avoid ---
  it('avoid pushes away from obstacle', () => {
    const a = agent({ x: 0, z: 0 }, { x: 1, z: 0 });
    const obstacles = [{ position: { x: 3, z: 0 }, radius: 1 }];
    const f = SteeringBehavior.avoid(a, obstacles, 5);
    expect(f.x).toBeLessThan(0); // Push back
  });

  it('avoid returns zero when no obstacles in range', () => {
    const a = agent();
    const obstacles = [{ position: { x: 100, z: 100 }, radius: 1 }];
    const f = SteeringBehavior.avoid(a, obstacles, 5);
    expect(f.x).toBe(0);
    expect(f.z).toBe(0);
  });

  it('avoid handles multiple obstacles', () => {
    const a = agent({ x: 5, z: 5 });
    const obstacles = [
      { position: { x: 6, z: 5 }, radius: 1 },
      { position: { x: 5, z: 6 }, radius: 1 },
    ];
    const f = SteeringBehavior.avoid(a, obstacles, 5);
    // Should push in -x and -z
    expect(f.x).toBeLessThan(0);
    expect(f.z).toBeLessThan(0);
  });

  // --- Blend ---
  it('blend combines weighted outputs', () => {
    const outputs: SteeringOutput[] = [
      { force: { x: 10, z: 0 }, type: 'seek', weight: 0.5 },
      { force: { x: 0, z: 10 }, type: 'flee', weight: 0.5 },
    ];
    const f = SteeringBehavior.blend(outputs, 100);
    expect(f.x).toBeCloseTo(5);
    expect(f.z).toBeCloseTo(5);
  });

  it('blend truncates to maxForce', () => {
    const outputs: SteeringOutput[] = [{ force: { x: 100, z: 0 }, type: 'seek', weight: 1 }];
    const f = SteeringBehavior.blend(outputs, 5);
    expect(mag(f)).toBeCloseTo(5, 1);
  });

  it('blend with empty produces zero', () => {
    const f = SteeringBehavior.blend([], 10);
    expect(f.x).toBe(0);
    expect(f.z).toBe(0);
  });
});
